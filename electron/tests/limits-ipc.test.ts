/**
 * Limits IPC handlers (Feature 77, Task 7; FR-8, FR-29 bridge half).
 * The sender check is the real `isTrustedSender` over the real local origin.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createLimitsHandlers } from "../src/sharing/limits-ipc";
import { LIMITS_FILE_NAME } from "../src/sharing/limits-store";
import { isTrustedSender } from "../src/navigation-guard";
import { localOrigin, PORT } from "../src/server-config";

const ORIGIN = localOrigin(PORT);
const TRUSTED = { senderFrame: { url: `${ORIGIN}/` } };

const UNTRUSTED: Record<string, { senderFrame?: { url?: string | null } }> = {
  "null url": { senderFrame: { url: null } },
  "undefined url": { senderFrame: { url: undefined } },
  "no frame": {},
  "foreign origin": { senderFrame: { url: "http://evil.example/" } },
  "credential-embedding url": {
    senderFrame: { url: `http://localhost:${PORT}@evil.example/` },
  },
  "lookalike port": { senderFrame: { url: `http://localhost:${PORT}1/` } },
};

const FILE = JSON.stringify({
  version: 1,
  limits: {
    projectDeletion: false,
    unlocking: true,
    locking: true,
    encryptionChanges: true,
    permanentDeletion: true,
  },
});

let dir: string;
let filePath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-limits-ipc-"));
  filePath = path.join(dir, LIMITS_FILE_NAME);
  fs.writeFileSync(filePath, FILE);
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function build() {
  const operations = {
    readLimitsFile: vi.fn(),
    setLimit: vi.fn(async () => ({ kind: "ok" as const })),
  };
  const handlers = createLimitsHandlers({
    userDataDir: dir,
    isTrustedSender: (url) => isTrustedSender(url, ORIGIN),
    operations,
  });
  return { handlers, operations };
}

function buildReal() {
  return createLimitsHandlers({
    userDataDir: dir,
    isTrustedSender: (url) => isTrustedSender(url, ORIGIN),
  });
}

describe("untrusted senders", () => {
  for (const [label, event] of Object.entries(UNTRUSTED)) {
    it(`refuses both handlers for ${label}`, async () => {
      const { handlers, operations } = build();
      const before = fs.readFileSync(filePath);
      await expect(handlers.getLimits(event)).rejects.toThrow(
        /untrusted sender/,
      );
      await expect(
        handlers.setLimit(event, "projectDeletion", true),
      ).rejects.toThrow(/untrusted sender/);
      expect(operations.readLimitsFile).not.toHaveBeenCalled();
      expect(operations.setLimit).not.toHaveBeenCalled();
      expect(fs.readFileSync(filePath).equals(before)).toBe(true);
    });
  }

  it("refuses the real store too, leaving the file unchanged", async () => {
    const handlers = buildReal();
    const before = fs.readFileSync(filePath);
    await expect(
      handlers.setLimit(UNTRUSTED["foreign origin"], "projectDeletion", true),
    ).rejects.toThrow(/untrusted sender/);
    expect(fs.readFileSync(filePath).equals(before)).toBe(true);
  });
});

describe("getLimits", () => {
  it("returns kind ok, the effective booleans and the directory", async () => {
    const result = await buildReal().getLimits(TRUSTED);
    expect(result).toEqual({
      kind: "ok",
      limits: {
        projectDeletion: false,
        unlocking: true,
        locking: true,
        encryptionChanges: true,
        permanentDeletion: true,
      },
      storeDirectory: dir,
    });
  });

  it("reports missing with all five on", async () => {
    fs.rmSync(filePath);
    const result = await buildReal().getLimits(TRUSTED);
    expect(result.kind).toBe("missing");
    expect(Object.values(result.limits)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(result.storeDirectory).toBe(dir);
  });

  it("reports invalid with all five on", async () => {
    fs.writeFileSync(filePath, "not json");
    const result = await buildReal().getLimits(TRUSTED);
    expect(result.kind).toBe("invalid");
    expect(Object.values(result.limits).every((v) => v)).toBe(true);
  });

  it("reports unreadable with all five on and the directory", async () => {
    const { handlers, operations } = build();
    operations.readLimitsFile.mockReturnValue({
      kind: "unreadable",
      reason: "EACCES",
    });
    const result = await handlers.getLimits(TRUSTED);
    expect(result.kind).toBe("unreadable");
    expect(Object.values(result.limits).every((v) => v)).toBe(true);
    expect(result.storeDirectory).toBe(dir);
    expect(JSON.stringify(result)).not.toContain("EACCES");
  });
});

describe("setLimit", () => {
  it("changes one limit and returns the store outcome", async () => {
    const handlers = buildReal();
    expect(await handlers.setLimit(TRUSTED, "unlocking", false)).toEqual({
      kind: "ok",
    });
    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(stored.limits.unlocking).toBe(false);
    expect(stored.limits.projectDeletion).toBe(false);
  });

  it("passes through the store's other outcome kinds", async () => {
    const { handlers, operations } = build();
    for (const outcome of [
      { kind: "unreadable" as const, reason: "EACCES" },
      { kind: "lock-not-acquired" as const },
      { kind: "write-failed" as const },
    ]) {
      operations.setLimit.mockResolvedValueOnce(outcome);
      expect(await handlers.setLimit(TRUSTED, "locking", true)).toEqual(
        outcome,
      );
    }
    expect(operations.setLimit).toHaveBeenCalledWith(dir, "locking", true);
  });

  const BAD: Array<[string, unknown, unknown]> = [
    ["unknown key", "other", true],
    ["inherited key", "toString", true],
    ["empty key", "", true],
    ["non-string key", 3, true],
    ["null key", null, true],
    ["string value", "unlocking", "false"],
    ["number value", "unlocking", 0],
    ["missing value", "unlocking", undefined],
  ];
  for (const [label, key, value] of BAD) {
    it(`refuses ${label} with invalid-input, no store call, no echo`, async () => {
      const { handlers, operations } = build();
      const result = await handlers.setLimit(TRUSTED, key, value);
      expect(result).toEqual({ kind: "invalid-input" });
      expect(operations.setLimit).not.toHaveBeenCalled();
    });
  }
});
