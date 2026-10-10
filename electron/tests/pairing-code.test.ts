/**
 * Pairing-code lifecycle, main side (Feature 75, FR-13/14/15/16).
 *
 * No test title, assertion message or log line carries a code value.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  PAIRING_CODE_LIFETIME_MS,
  PAIRING_STATE_FILE,
  codeMatchesState,
  generatePairingCode,
  readPairingState,
  remaining,
  writePairingState,
} from "../src/sharing/pairing-code";

const FIXTURES = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/sharing",
);
const SOURCE = path.resolve(__dirname, "../src/sharing/pairing-code.ts");

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-pairing-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function readFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

describe("generatePairingCode", () => {
  it("pads the code to exactly 6 digits including leading zeros", () => {
    const { code } = generatePairingCode({ now: 0, randomInt: () => 7 });
    expect(code).toBe("000007");
    expect(code).toMatch(/^\d{6}$/);
  });

  it("asks randomInt for the whole 6-digit space", () => {
    const calls: Array<[number, number]> = [];
    generatePairingCode({
      now: 0,
      randomInt: (min, max) => {
        calls.push([min, max]);
        return 1;
      },
    });
    expect(calls).toEqual([[0, 1_000_000]]);
  });

  it("uses node:crypto randomInt and never Math.random (source text)", () => {
    const source = fs.readFileSync(SOURCE, "utf8");
    expect(source).toMatch(/from "node:crypto"/);
    expect(source).toMatch(/randomInt/);
    expect(source).not.toMatch(/Math\.random/);
  });

  it("sets expiry to now plus 5 minutes and a fresh, unused state", () => {
    const { state } = generatePairingCode({ now: 1_000 });
    expect(PAIRING_CODE_LIFETIME_MS).toBe(5 * 60 * 1000);
    expect(state.expiresAt).toBe(1_000 + 5 * 60 * 1000);
    expect(state.generatedAt).toBe(1_000);
    expect(state).toMatchObject({
      version: 1,
      attempts: 0,
      dead: false,
      used: false,
    });
    expect(state.salt).toMatch(/^[0-9a-f]+$/);
    expect(state.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("draws the salt from the injected randomBytes", () => {
    const { state } = generatePairingCode({
      now: 0,
      randomBytes: (n) => Buffer.alloc(n, 0xab),
    });
    expect(state.salt).toMatch(/^(ab)+$/);
  });

  it("a second code yields a state that does not verify the first", () => {
    const first = generatePairingCode({ now: 0, randomInt: () => 111111 });
    const second = generatePairingCode({ now: 1, randomInt: () => 222222 });
    expect(codeMatchesState(first.state, first.code)).toBe(true);
    expect(codeMatchesState(second.state, second.code)).toBe(true);
    expect(codeMatchesState(second.state, first.code)).toBe(false);
  });

  it("holds no field equal to the plain code", () => {
    const { code, state } = generatePairingCode({ now: 0 });
    for (const value of Object.values(state)) {
      expect(value === code).toBe(false);
    }
  });
});

describe("remaining", () => {
  it("counts down, is 0 at expiry and never negative after it", () => {
    const { state } = generatePairingCode({ now: 1_000 });
    expect(remaining(state, 1_000)).toBe(PAIRING_CODE_LIFETIME_MS);
    expect(remaining(state, 1_000 + 1_000)).toBe(
      PAIRING_CODE_LIFETIME_MS - 1_000,
    );
    expect(remaining(state, state.expiresAt)).toBe(0);
    expect(remaining(state, state.expiresAt + 10_000)).toBe(0);
  });
});

describe("writePairingState / readPairingState", () => {
  it("reports absent when no file exists", () => {
    expect(readPairingState(dir)).toEqual({ kind: "absent" });
  });

  it("round-trips a state", () => {
    const { state } = generatePairingCode({ now: 5 });
    writePairingState(dir, state);
    expect(readPairingState(dir)).toEqual({ kind: "ok", state });
  });

  it("the file holds only the second of two generated codes (replace)", () => {
    const first = generatePairingCode({ now: 0, randomInt: () => 111111 });
    const second = generatePairingCode({ now: 1, randomInt: () => 222222 });
    writePairingState(dir, first.state);
    writePairingState(dir, second.state);
    const read = readPairingState(dir);
    if (read.kind !== "ok") throw new Error("expected ok");
    expect(codeMatchesState(read.state, first.code)).toBe(false);
    expect(codeMatchesState(read.state, second.code)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([PAIRING_STATE_FILE]);
  });

  const posixIt = process.platform === "win32" ? it.skip : it;
  posixIt("writes the file with mode 0600 (skipped on Windows only)", () => {
    const { code, state } = generatePairingCode({ now: 0 });
    writePairingState(dir, state);
    const file = path.join(dir, PAIRING_STATE_FILE);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(file, "utf8")).not.toContain(code);
  });

  it("reports corrupt for unparseable JSON, never absent", () => {
    fs.writeFileSync(path.join(dir, PAIRING_STATE_FILE), "{not json");
    expect(readPairingState(dir).kind).toBe("corrupt");
  });

  it("reports corrupt when the path cannot be read as a file", () => {
    fs.mkdirSync(path.join(dir, PAIRING_STATE_FILE));
    expect(readPairingState(dir).kind).toBe("corrupt");
  });

  it("reports corrupt for a shape-invalid object", () => {
    const valid = readFixture("pairing-state.valid.json") as Record<
      string,
      unknown
    >;
    fs.writeFileSync(
      path.join(dir, PAIRING_STATE_FILE),
      JSON.stringify({ ...valid, attempts: "0" }),
    );
    expect(readPairingState(dir).kind).toBe("corrupt");
  });
});

describe("shared file contract (fixtures also read by the server side)", () => {
  function install(name: string): void {
    fs.writeFileSync(
      path.join(dir, PAIRING_STATE_FILE),
      fs.readFileSync(path.join(FIXTURES, name)),
    );
  }

  it("accepts pairing-state.valid.json", () => {
    install("pairing-state.valid.json");
    expect(readPairingState(dir).kind).toBe("ok");
  });

  it("rejects a fixture with an unknown version", () => {
    const valid = readFixture("pairing-state.valid.json") as Record<
      string,
      unknown
    >;
    fs.writeFileSync(
      path.join(dir, PAIRING_STATE_FILE),
      JSON.stringify({ ...valid, version: 2 }),
    );
    expect(readPairingState(dir).kind).toBe("corrupt");
  });

  it("each case fixture hashes to its companion code and reports its remaining time", () => {
    const cases = readFixture("pairing-state.cases.json") as {
      cases: Array<{
        fixture: string;
        code: string;
        now: number;
        remainingMs: number;
        codeMatchesHash: boolean;
      }>;
    };
    expect(cases.cases.length).toBeGreaterThanOrEqual(2);
    for (const c of cases.cases) {
      install(c.fixture);
      const read = readPairingState(dir);
      if (read.kind !== "ok")
        throw new Error(`fixture ${c.fixture} not readable`);
      expect(codeMatchesState(read.state, c.code)).toBe(c.codeMatchesHash);
      expect(remaining(read.state, c.now)).toBe(c.remainingMs);
    }
  });
});
