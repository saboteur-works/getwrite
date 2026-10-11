/** Server-side `sharing-limits.json` reader (Feature 77, FR-5, FR-6, FR-10, FR-15). */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LIMITS_FILE_NAME,
  parseLimits,
  readLimits,
  readLimitsFile,
  type Limits,
} from "../../src/lib/sharing/limits-store";

const FIXTURES = path.resolve(__dirname, "../fixtures/sharing");
const ALL_ON: Limits = {
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
    | { kind: "ok"; limits: Limits }
    | { kind: "missing" }
    | { kind: "invalid" };
}

const cases = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, "sharing-limits.cases.json"), "utf8"),
) as FixtureCase[];

let dir: string;
let filePath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-limits-srv-"));
  filePath = path.join(dir, LIMITS_FILE_NAME);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("shared fixture cases", () => {
  for (const c of cases) {
    it(`${c.name}: classification and effective limits`, () => {
      if (c.text !== null) fs.writeFileSync(filePath, c.text);
      const env = { GETWRITE_SHARING_DIR: dir };
      expect(readLimitsFile(env)).toEqual(c.expected);
      expect(readLimits(env)).toEqual(
        c.expected.kind === "ok" ? c.expected.limits : ALL_ON,
      );
    });
  }
});

describe("parseLimits", () => {
  it("accepts the valid fixture and the unknown-keys fixture", () => {
    for (const f of [
      "sharing-limits.valid.json",
      "sharing-limits.unknown-keys.json",
    ]) {
      const text = fs.readFileSync(path.join(FIXTURES, f), "utf8");
      expect(parseLimits(text).kind).toBe("ok");
    }
  });

  it("is false only when the file positively says false", () => {
    const result = parseLimits(
      JSON.stringify({ version: 1, limits: { ...ALL_ON, locking: false } }),
    );
    expect(result).toEqual({
      kind: "ok",
      limits: { ...ALL_ON, locking: false },
    });
  });

  it("treats unparseable text as invalid", () => {
    expect(parseLimits("{nope")).toEqual({ kind: "invalid" });
  });
});

describe("readLimits", () => {
  it("yields all true when the directory is unset or empty", () => {
    expect(readLimits({})).toEqual(ALL_ON);
    expect(readLimits({ GETWRITE_SHARING_DIR: "" })).toEqual(ALL_ON);
    expect(readLimitsFile({})).toEqual({ kind: "unconfigured" });
  });

  it("yields all true for an unreadable file and reports it unreadable", () => {
    fs.mkdirSync(filePath); // reading a directory fails with EISDIR
    const env = { GETWRITE_SHARING_DIR: dir };
    expect(readLimitsFile(env).kind).toBe("unreadable");
    expect(readLimits(env)).toEqual(ALL_ON);
  });

  it("reads on every call with no cache", () => {
    const env = { GETWRITE_SHARING_DIR: dir };
    fs.writeFileSync(
      filePath,
      JSON.stringify({ version: 1, limits: { ...ALL_ON, unlocking: false } }),
    );
    expect(readLimits(env).unlocking).toBe(false);
    fs.writeFileSync(filePath, JSON.stringify({ version: 1, limits: ALL_ON }));
    expect(readLimits(env).unlocking).toBe(true);
    fs.rmSync(filePath);
    expect(readLimits(env)).toEqual(ALL_ON);
  });

  it("never logs file contents", () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {}),
    );
    fs.writeFileSync(filePath, "SECRET-CONTENT {not json");
    readLimits({ GETWRITE_SHARING_DIR: dir });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
