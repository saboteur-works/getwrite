/** Main-side `sharing-limits.json` reader and writer (Feature 77, FR-5..FR-7). */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import {
  LIMITS_FILE_NAME,
  LIMIT_KEYS,
  readEffectiveLimits,
  readLimitsFile,
  setLimit,
  type LimitKey,
} from "../src/sharing/limits-store";

const FIXTURES = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/sharing",
);
const FAST = { retryLimit: 5, retryDelayMs: 5 };
const ALL_ON = {
  projectDeletion: true,
  unlocking: true,
  locking: true,
  encryptionChanges: true,
  permanentDeletion: true,
};

interface FixtureCase {
  name: string;
  text: string | null;
  expected:
    | { kind: "ok"; limits: Record<LimitKey, boolean> }
    | { kind: "missing" }
    | { kind: "invalid" };
}

let dir: string;
let filePath: string;
let lockPath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-limits-"));
  filePath = path.join(dir, LIMITS_FILE_NAME);
  lockPath = `${filePath}.lock`;
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

function install(fixture: string): void {
  fs.copyFileSync(path.join(FIXTURES, fixture), filePath);
}
function digest(): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
function readJson(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<
    string,
    unknown
  >;
}

describe("file name and keys", () => {
  it("uses sharing-limits.json and exactly the five keys", () => {
    expect(LIMITS_FILE_NAME).toBe("sharing-limits.json");
    expect([...LIMIT_KEYS].sort()).toEqual(Object.keys(ALL_ON).sort());
  });
});

describe("contract with the shared fixture cases", () => {
  const cases = JSON.parse(
    fs.readFileSync(path.join(FIXTURES, "sharing-limits.cases.json"), "utf8"),
  ) as FixtureCase[];

  it("has cases", () => {
    expect(cases.length).toBeGreaterThan(10);
  });

  for (const c of cases) {
    it(`classifies: ${c.name}`, () => {
      if (c.text !== null) fs.writeFileSync(filePath, c.text);
      const result = readLimitsFile(dir);
      expect(result).toEqual(c.expected);
      const effective = readEffectiveLimits(dir);
      expect(effective).toEqual(
        c.expected.kind === "ok" ? c.expected.limits : ALL_ON,
      );
    });
  }
});

describe("readLimitsFile", () => {
  it("reads the valid fixture", () => {
    install("sharing-limits.valid.json");
    expect(readLimitsFile(dir)).toEqual({
      kind: "ok",
      limits: {
        projectDeletion: true,
        unlocking: false,
        locking: true,
        encryptionChanges: false,
        permanentDeletion: true,
      },
    });
  });

  it("tolerates unknown keys", () => {
    install("sharing-limits.unknown-keys.json");
    const result = readLimitsFile(dir);
    expect(result.kind).toBe("ok");
  });

  it("is unreadable, effective all on, when the path is a directory", () => {
    fs.mkdirSync(filePath);
    const result = readLimitsFile(dir);
    expect(result.kind).toBe("unreadable");
    expect(readEffectiveLimits(dir)).toEqual(ALL_ON);
  });

  it.skipIf(process.platform === "win32")(
    "is unreadable for a mode-0 file (skipped on Windows)",
    () => {
      install("sharing-limits.valid.json");
      fs.chmodSync(filePath, 0o000);
      try {
        if (process.getuid?.() === 0) return;
        expect(readLimitsFile(dir).kind).toBe("unreadable");
        expect(readEffectiveLimits(dir)).toEqual(ALL_ON);
      } finally {
        fs.chmodSync(filePath, 0o600);
      }
    },
  );

  it("an unreadable reason carries no path", () => {
    fs.mkdirSync(filePath);
    const result = readLimitsFile(dir);
    expect(JSON.stringify(result)).not.toContain(dir);
  });
});

describe("setLimit", () => {
  it("changes one value and keeps unknown keys, top level and inside limits", async () => {
    install("sharing-limits.unknown-keys.json");
    const outcome = await setLimit(dir, "locking", true, FAST);
    expect(outcome.kind).toBe("ok");
    const after = readJson();
    expect(after.futureTopLevel).toEqual({ a: 1 });
    expect(after.version).toBe(1);
    expect(after.limits).toEqual({
      projectDeletion: false,
      unlocking: false,
      locking: true,
      encryptionChanges: false,
      permanentDeletion: true,
      futureLimit: "keep",
    });
  });

  it("creates the directory and the file when missing, others restricted", async () => {
    const nested = path.join(dir, "a", "b");
    const outcome = await setLimit(nested, "unlocking", false, FAST);
    expect(outcome.kind).toBe("ok");
    expect(readLimitsFile(nested)).toEqual({
      kind: "ok",
      limits: { ...ALL_ON, unlocking: false },
    });
  });

  it("overwrites an invalid file with all restricted except the change", async () => {
    fs.writeFileSync(filePath, "{garbage");
    const outcome = await setLimit(dir, "projectDeletion", false, FAST);
    expect(outcome.kind).toBe("ok");
    expect(readLimitsFile(dir)).toEqual({
      kind: "ok",
      limits: { ...ALL_ON, projectDeletion: false },
    });
  });

  it("refuses an unreadable file and leaves it untouched", async () => {
    fs.mkdirSync(filePath);
    const outcome = await setLimit(dir, "locking", false, FAST);
    expect(outcome.kind).toBe("unreadable");
    expect(fs.statSync(filePath).isDirectory()).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "refuses a mode-0 file with bytes unchanged (skipped on Windows)",
    async () => {
      install("sharing-limits.valid.json");
      const before = digest();
      fs.chmodSync(filePath, 0o000);
      try {
        if (process.getuid?.() === 0) return;
        const outcome = await setLimit(dir, "locking", false, FAST);
        expect(outcome.kind).toBe("unreadable");
      } finally {
        fs.chmodSync(filePath, 0o600);
      }
      expect(digest()).toBe(before);
    },
  );

  it("rejects an unknown key and a non-boolean value, changing nothing", async () => {
    install("sharing-limits.valid.json");
    const before = digest();
    const a = await setLimit(dir, "sharing" as LimitKey, true, FAST);
    const b = await setLimit(dir, "locking", "no" as unknown as boolean, FAST);
    const c = await setLimit(dir, "__proto__" as LimitKey, true, FAST);
    expect(a.kind).toBe("invalid-input");
    expect(b.kind).toBe("invalid-input");
    expect(c.kind).toBe("invalid-input");
    expect(digest()).toBe(before);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("writes mode 0600, lock path is exactly <file>.lock, lock gone after success", async () => {
    const outcome = await setLimit(dir, "locking", false, FAST);
    expect(outcome.kind).toBe("ok");
    if (process.platform !== "win32") {
      expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
    }
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([LIMITS_FILE_NAME]);
  });

  it("holds the lock at exactly <file>.lock while the write happens", async () => {
    install("sharing-limits.valid.json");
    const realRename = fs.renameSync;
    let lockSeen = false;
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      lockSeen = fs.existsSync(lockPath);
      realRename(from, to);
    });
    await setLimit(dir, "locking", false, FAST);
    expect(lockSeen).toBe(true);
  });

  it("reports lock-not-acquired when a fresh lock is held, without touching the file", async () => {
    install("sharing-limits.valid.json");
    const before = digest();
    fs.writeFileSync(lockPath, "");
    const outcome = await setLimit(dir, "locking", false, FAST);
    expect(outcome.kind).toBe("lock-not-acquired");
    expect(digest()).toBe(before);
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it("removes a lock older than 30 s and proceeds", async () => {
    install("sharing-limits.valid.json");
    fs.writeFileSync(lockPath, "");
    const old = new Date(Date.now() - 31_000);
    fs.utimesSync(lockPath, old, old);
    const outcome = await setLimit(dir, "locking", false, FAST);
    expect(outcome.kind).toBe("ok");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("does not remove a lock younger than 30 s", async () => {
    install("sharing-limits.valid.json");
    fs.writeFileSync(lockPath, "");
    const young = new Date(Date.now() - 20_000);
    fs.utimesSync(lockPath, young, young);
    const outcome = await setLimit(dir, "locking", false, FAST);
    expect(outcome.kind).toBe("lock-not-acquired");
  });

  it("reports write-failed, removes the temp file and the lock, keeps old bytes", async () => {
    install("sharing-limits.valid.json");
    const before = digest();
    vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw Object.assign(new Error("boom"), { code: "EIO" });
    });
    const outcome = await setLimit(dir, "locking", false, FAST);
    expect(outcome.kind).toBe("write-failed");
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([LIMITS_FILE_NAME]);
    expect(digest()).toBe(before);
  });

  it("outcomes never contain a path", async () => {
    fs.mkdirSync(filePath);
    const outcome = await setLimit(dir, "locking", false, FAST);
    expect(JSON.stringify(outcome)).not.toContain(dir);
  });

  it("serialises concurrent writers so neither change is lost", async () => {
    const [a, b] = await Promise.all([
      setLimit(dir, "locking", false, { retryLimit: 200, retryDelayMs: 2 }),
      setLimit(dir, "unlocking", false, { retryLimit: 200, retryDelayMs: 2 }),
    ]);
    expect(a.kind).toBe("ok");
    expect(b.kind).toBe("ok");
    expect(readLimitsFile(dir)).toEqual({
      kind: "ok",
      limits: { ...ALL_ON, locking: false, unlocking: false },
    });
  });
});
