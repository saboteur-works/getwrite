import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHmac } from "node:crypto";
import os from "node:os";
import path from "node:path";

import {
  MAX_WRONG_ATTEMPTS,
  PAIRING_STATE_FILE,
  verifyAndConsume,
} from "../../src/lib/sharing/pairing-verify";

const FIXTURES = path.resolve(__dirname, "../fixtures/sharing");

interface FixtureCase {
  fixture: string;
  code: string;
  now: number;
  codeMatchesHash: boolean;
}

interface StateShape {
  version: 1;
  salt: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  dead: boolean;
  used: boolean;
  generatedAt: number;
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "gw-pair-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function loadCases(): Promise<FixtureCase[]> {
  const raw = await readFile(
    path.join(FIXTURES, "pairing-state.cases.json"),
    "utf8",
  );
  return (JSON.parse(raw) as { cases: FixtureCase[] }).cases;
}

async function caseFor(fixture: string): Promise<FixtureCase> {
  const found = (await loadCases()).find((c) => c.fixture === fixture);
  if (!found) throw new Error(`missing case for ${fixture}`);
  return found;
}

async function install(fixture: string): Promise<void> {
  await copyFile(
    path.join(FIXTURES, fixture),
    path.join(dir, PAIRING_STATE_FILE),
  );
}

async function readState(): Promise<StateShape> {
  return JSON.parse(
    await readFile(path.join(dir, PAIRING_STATE_FILE), "utf8"),
  ) as StateShape;
}

async function writeState(patch: Partial<StateShape>): Promise<void> {
  const base = JSON.parse(
    await readFile(path.join(FIXTURES, "pairing-state.valid.json"), "utf8"),
  ) as StateShape;
  await writeFile(
    path.join(dir, PAIRING_STATE_FILE),
    JSON.stringify({ ...base, ...patch }),
  );
}

function hashFor(salt: string, code: string): string {
  return createHmac("sha256", Buffer.from(salt, "hex"))
    .update(code)
    .digest("hex");
}

/** A 6-digit string that is not the fixture's code. */
function wrongOf(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

describe("verifyAndConsume against the Task 9 fixtures", () => {
  it("fixture codes match their hashes under HMAC-SHA256(salt, code)", async () => {
    for (const c of await loadCases()) {
      const state = JSON.parse(
        await readFile(path.join(FIXTURES, c.fixture), "utf8"),
      ) as StateShape;
      expect(hashFor(state.salt, c.code) === state.codeHash).toBe(
        c.codeMatchesHash,
      );
    }
  });

  it("confirms a correct code within the window and marks the state used", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    expect(await verifyAndConsume(dir, c.code, c.now)).toEqual({
      kind: "confirmed",
    });
    expect((await readState()).used).toBe(true);
  });

  it("is single use: a second correct submission is unusable", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    await verifyAndConsume(dir, c.code, c.now);
    const second = await verifyAndConsume(dir, c.code, c.now + 1);
    expect(second.kind).toBe("unusable");
  });

  it("an expired fixture is unusable even with the correct code", async () => {
    const c = await caseFor("pairing-state.expired.json");
    await install(c.fixture);
    const result = await verifyAndConsume(dir, c.code, c.now);
    expect(result.kind).toBe("unusable");
    expect((await readState()).used).toBe(false);
  });

  it("a correct code one millisecond before expiry confirms; at expiry it does not", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    const { expiresAt } = await readState();
    expect((await verifyAndConsume(dir, c.code, expiresAt - 1)).kind).toBe(
      "confirmed",
    );
    await install(c.fixture);
    expect((await verifyAndConsume(dir, c.code, expiresAt)).kind).toBe(
      "unusable",
    );
    await install(c.fixture);
    expect((await verifyAndConsume(dir, c.code, expiresAt + 1000)).kind).toBe(
      "unusable",
    );
  });
});

describe("wrong submissions", () => {
  it("a wrong code returns wrong and increments attempts", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    expect(await verifyAndConsume(dir, wrongOf(c.code), c.now)).toEqual({
      kind: "wrong",
    });
    expect((await readState()).attempts).toBe(1);
  });

  it("after the 5th wrong attempt the state is dead and the correct code is unusable", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    expect(MAX_WRONG_ATTEMPTS).toBe(5);
    for (let i = 0; i < 5; i += 1) {
      const r = await verifyAndConsume(dir, wrongOf(c.code), c.now);
      expect(r.kind).toBe("wrong");
    }
    const state = await readState();
    expect(state.dead).toBe(true);
    expect(state.attempts).toBe(5);
    const next = await verifyAndConsume(dir, c.code, c.now);
    expect(next.kind).toBe("unusable");
    expect((await readState()).used).toBe(false);
  });

  it("the 4th wrong attempt leaves the code still usable", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    for (let i = 0; i < 4; i += 1)
      await verifyAndConsume(dir, wrongOf(c.code), c.now);
    expect((await verifyAndConsume(dir, c.code, c.now)).kind).toBe("confirmed");
  });

  it("two concurrent wrong submissions both increment", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    const results = await Promise.all([
      verifyAndConsume(dir, wrongOf(c.code), c.now),
      verifyAndConsume(dir, wrongOf(c.code), c.now),
    ]);
    expect(results.map((r) => r.kind)).toEqual(["wrong", "wrong"]);
    expect((await readState()).attempts).toBe(2);
  });

  it("many concurrent wrong submissions are counted per code and kill it at the limit", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        verifyAndConsume(dir, wrongOf(c.code), c.now),
      ),
    );
    expect(results.filter((r) => r.kind === "wrong")).toHaveLength(5);
    expect(results.filter((r) => r.kind === "unusable")).toHaveLength(3);
    expect((await readState()).dead).toBe(true);
  });

  it("a submission that is not exactly 6 digits is wrong, counts one attempt and never confirms", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    for (const bad of ["", "12345", "1234567", "12345a", " 12345", "١٢٣٤٥٦"]) {
      await install(c.fixture);
      expect(await verifyAndConsume(dir, bad, c.now)).toEqual({
        kind: "wrong",
      });
      expect((await readState()).attempts).toBe(1);
    }
  });
});

describe("unusable states", () => {
  it("a missing file is unusable with reason missing", async () => {
    expect(await verifyAndConsume(dir, "012345", 1)).toEqual({
      kind: "unusable",
      reason: "missing",
    });
  });

  it("a dead state is unusable", async () => {
    await writeState({ dead: true, attempts: 5 });
    const r = await verifyAndConsume(dir, "012345", 1800000000000);
    expect(r.kind).toBe("unusable");
  });

  it("a used state is unusable", async () => {
    await writeState({ used: true });
    const r = await verifyAndConsume(dir, "012345", 1800000000000);
    expect(r.kind).toBe("unusable");
  });

  it("a corrupt file is unusable with reason corrupt and is left unchanged", async () => {
    const file = path.join(dir, PAIRING_STATE_FILE);
    await writeFile(file, "{not json");
    expect(await verifyAndConsume(dir, "012345", 1)).toEqual({
      kind: "unusable",
      reason: "corrupt",
    });
    expect(await readFile(file, "utf8")).toBe("{not json");
  });

  it("a schema-invalid file is unusable with reason corrupt", async () => {
    await writeFile(
      path.join(dir, PAIRING_STATE_FILE),
      JSON.stringify({ version: 1, salt: "zz" }),
    );
    const r = await verifyAndConsume(dir, "012345", 1);
    expect(r).toEqual({ kind: "unusable", reason: "corrupt" });
  });

  it("an unreadable path (a directory) is unusable, never confirmed", async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(dir, PAIRING_STATE_FILE));
    const r = await verifyAndConsume(dir, "012345", 1);
    expect(r.kind).toBe("unusable");
  });

  it("results never carry the submitted code or a hash", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    const state = await readState();
    const results = [
      await verifyAndConsume(dir, wrongOf(c.code), c.now),
      await verifyAndConsume(dir, c.code, c.now),
      await verifyAndConsume(dir, c.code, c.now),
    ];
    const text = JSON.stringify(results);
    expect(text).not.toContain(c.code);
    expect(text).not.toContain(state.codeHash);
    expect(text).not.toContain(state.salt);
  });
});

describe("replacement by a new code", () => {
  it("does not resurrect the old state when main replaces the file during verification", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    const replacement: StateShape = {
      ...(await readState()),
      salt: "ffeeddccbbaa99887766554433221100",
      codeHash: hashFor("ffeeddccbbaa99887766554433221100", "999999"),
      generatedAt: 1800000100000,
      expiresAt: 1800000400000,
    };
    // Replace the file between the verifier's read and its write, using the
    // test hook; the verifier must notice and write nothing.
    const result = await verifyAndConsume(dir, wrongOf(c.code), c.now, {
      beforeWrite: async () => {
        await writeFile(
          path.join(dir, PAIRING_STATE_FILE),
          JSON.stringify(replacement),
        );
      },
    });
    expect(result.kind).toBe("unusable");
    expect(await readState()).toEqual(replacement);
  });

  it("leaves no temp or lock files behind", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    await Promise.all([
      verifyAndConsume(dir, wrongOf(c.code), c.now),
      verifyAndConsume(dir, c.code, c.now),
    ]);
    expect(await readdir(dir)).toEqual([PAIRING_STATE_FILE]);
  });

  it("writes the state file with mode 0600", async () => {
    const c = await caseFor("pairing-state.valid.json");
    await install(c.fixture);
    await verifyAndConsume(dir, wrongOf(c.code), c.now);
    expect((await stat(path.join(dir, PAIRING_STATE_FILE))).mode & 0o777).toBe(
      0o600,
    );
  });
});
