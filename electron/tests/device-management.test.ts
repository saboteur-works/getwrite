/**
 * Main-side device operations (Feature 76, FR-1, FR-2, FR-6, FR-7, FR-8,
 * FR-16, FR-17, FR-18, FR-20).
 *
 * Name length rule chosen here: the 64 limit counts Unicode CODE POINTS
 * (`[...name].length`), not UTF-16 code units, so 40 emoji (80 units) is
 * accepted and 65 emoji (65 code points, 130 units) is rejected.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import {
  listDevices,
  renameDevice,
  revokeDevice,
} from "../src/sharing/device-management";
import { CREDENTIALS_FILE_NAME } from "../src/sharing/store-status";

const FIXTURES = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/sharing",
);
const FAST = { retryLimit: 3, retryDelayMs: 5 };
const ID_A = "3d9a7c10-5e2b-4c8f-8a61-1f2e3d4c5b6a";
const ID_B = "a41b6e92-7c03-4d15-9e8a-2b3c4d5e6f70";

let dir: string;
let storePath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-device-mgmt-"));
  storePath = path.join(dir, CREDENTIALS_FILE_NAME);
});
afterEach(() => {
  fs.chmodSync(dir, 0o700);
  fs.rmSync(dir, { recursive: true, force: true });
});

function install(fixture: string): void {
  fs.copyFileSync(path.join(FIXTURES, fixture), storePath);
}
function bytes(): string {
  return fs.readFileSync(storePath, "utf8");
}
function readJson(): {
  version: number;
  devices: Record<string, unknown>[];
  [k: string]: unknown;
} {
  return JSON.parse(bytes());
}

describe("listDevices", () => {
  it("lists id, name, createdAt only, with the directory", () => {
    install("device-credentials.unknown-fields.json");
    const result = listDevices(dir);
    expect(result).toEqual({
      kind: "ok",
      storeDirectory: dir,
      devices: [
        {
          id: ID_A,
          name: "Fixture device with a future field",
          createdAt: "2026-10-09T13:00:00.000Z",
        },
        {
          id: ID_B,
          name: "Fixture device plain",
          createdAt: "2026-10-09T13:05:00.000Z",
        },
      ],
    });
    for (const d of (result as { devices: object[] }).devices) {
      expect(Object.keys(d).sort()).toEqual(["createdAt", "id", "name"]);
    }
    const json = JSON.stringify(result);
    expect(json).not.toContain("credentialHash");
    expect(json).not.toContain("futureField");
    expect(json).not.toMatch(/[0-9a-f]{64}/);
  });

  it("reports missing with an empty list", () => {
    expect(listDevices(dir)).toEqual({
      kind: "missing",
      devices: [],
      storeDirectory: dir,
    });
  });

  it("reports corrupt for the corrupt fixture, bad version and unreadable", () => {
    install("device-credentials.corrupt.json");
    expect(listDevices(dir)).toEqual({ kind: "corrupt", storeDirectory: dir });
    fs.writeFileSync(storePath, '{"version":2,"devices":[]}');
    expect(listDevices(dir)).toEqual({ kind: "corrupt", storeDirectory: dir });
    fs.rmSync(storePath);
    fs.mkdirSync(storePath); // exists but cannot be read as a file
    expect(listDevices(dir)).toEqual({ kind: "corrupt", storeDirectory: dir });
  });
});

describe("renameDevice", () => {
  it("changes only the name after JSON.parse", async () => {
    install("device-credentials.unknown-fields.json");
    const before = readJson();
    expect(await renameDevice(dir, ID_A, "  Kitchen tablet  ")).toEqual({
      kind: "ok",
    });
    const after = readJson();
    expect(after.devices[0]).toEqual({
      ...before.devices[0],
      name: "Kitchen tablet",
    });
    expect(after.devices[1]).toEqual(before.devices[1]);
    expect(after.futureTopLevel).toEqual(before.futureTopLevel);
    expect(fs.existsSync(`${storePath}.lock`)).toBe(false);
  });

  it("accepts a duplicate of another device's name", async () => {
    install("device-credentials.unknown-fields.json");
    expect(await renameDevice(dir, ID_A, "Fixture device plain")).toEqual({
      kind: "ok",
    });
    expect(readJson().devices[0].name).toBe("Fixture device plain");
  });

  it.each([
    ["not-a-string", 42],
    ["not-a-string", null],
    ["not-a-string", undefined],
    ["empty", ""],
    ["empty", "   \t "],
    ["too-long", "x".repeat(65)],
    ["too-long", "😀".repeat(65)],
    ["control-character", "bad\u0007name"],
    ["control-character", "bad\nname"],
    ["control-character", "bad\u007fname"],
    ["control-character", "bad\u0085name"],
  ])("rejects as %s: %j, leaving the file unchanged", async (reason, input) => {
    install("device-credentials.unknown-fields.json");
    const before = bytes();
    const result = await renameDevice(dir, ID_A, input as unknown as string);
    expect(result).toEqual({ kind: "invalid-name", reason });
    expect(bytes()).toBe(before);
  });

  it("accepts exactly 64 characters and counts code points, not UTF-16 units", async () => {
    install("device-credentials.unknown-fields.json");
    expect(await renameDevice(dir, ID_A, "x".repeat(64))).toEqual({
      kind: "ok",
    });
    expect(await renameDevice(dir, ID_A, "x".repeat(65))).toEqual({
      kind: "invalid-name",
      reason: "too-long",
    });
    const forty = "😀".repeat(40); // 40 code points, 80 UTF-16 units
    expect(forty.length).toBe(80);
    expect(await renameDevice(dir, ID_A, forty)).toEqual({ kind: "ok" });
    expect(readJson().devices[0].name).toBe(forty);
    // trimmed before counting
    expect(await renameDevice(dir, ID_A, ` ${"y".repeat(64)} `)).toEqual({
      kind: "ok",
    });
  });

  it("returns not-found for an unknown id and does not rewrite the file", async () => {
    install("device-credentials.unknown-fields.json");
    const old = new Date("2020-01-01T00:00:00Z");
    fs.utimesSync(storePath, old, old);
    const before = bytes();
    expect(await renameDevice(dir, "no-such-id", "Name")).toEqual({
      kind: "not-found",
    });
    expect(bytes()).toBe(before);
    expect(fs.statSync(storePath).mtimeMs).toBe(old.getTime());
  });

  it("returns not-found for a missing store", async () => {
    expect(await renameDevice(dir, ID_A, "Name")).toEqual({
      kind: "not-found",
    });
  });

  it("refuses a corrupt store with its bytes unchanged", async () => {
    install("device-credentials.corrupt.json");
    const before = bytes();
    expect(await renameDevice(dir, ID_A, "Name")).toEqual({ kind: "corrupt" });
    expect(bytes()).toBe(before);
  });

  it("reports lock-not-acquired when the lock is held", async () => {
    install("device-credentials.unknown-fields.json");
    const before = bytes();
    fs.writeFileSync(`${storePath}.lock`, "");
    expect(await renameDevice(dir, ID_A, "Name", FAST)).toEqual({
      kind: "lock-not-acquired",
    });
    expect(bytes()).toBe(before);
  });

  it("reports write-failed when the directory cannot be written", async () => {
    install("device-credentials.unknown-fields.json");
    const before = bytes();
    fs.chmodSync(dir, 0o500);
    const result = await renameDevice(dir, ID_A, "Name", FAST);
    fs.chmodSync(dir, 0o700);
    expect(result).toEqual({ kind: "write-failed" });
    expect(bytes()).toBe(before);
  });

  it("reports write-failed, with no detail, when the writer throws", async () => {
    install("device-credentials.unknown-fields.json");
    const result = await renameDevice(dir, ID_A, "Name", {
      update: () => Promise.reject(new Error(`boom ${ID_A}`)),
    });
    expect(result).toEqual({ kind: "write-failed" });
    expect(JSON.stringify(result)).not.toContain(ID_A);
  });
});

describe("revokeDevice", () => {
  it("removes exactly that record, keeping order and unknown fields", async () => {
    install("device-credentials.unknown-fields.json");
    const before = readJson();
    expect(await revokeDevice(dir, ID_A)).toEqual({ kind: "ok" });
    const after = readJson();
    expect(after.devices).toEqual([before.devices[1]]);
    expect(after.futureTopLevel).toEqual(before.futureTopLevel);
    expect(fs.existsSync(`${storePath}.lock`)).toBe(false);
  });

  it("leaves no record holding the revoked token's hash", async () => {
    const token = "known-token-value";
    const hash = createHash("sha256").update(token).digest("hex");
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        version: 1,
        devices: [
          {
            id: "d1",
            name: "One",
            createdAt: "2026-10-09T13:00:00.000Z",
            credentialHash: hash,
          },
          {
            id: "d2",
            name: "Two",
            createdAt: "2026-10-09T13:00:00.000Z",
            credentialHash: "a".repeat(64),
          },
        ],
      }),
    );
    expect(await revokeDevice(dir, "d1")).toEqual({ kind: "ok" });
    expect(readJson().devices.some((d) => d.credentialHash === hash)).toBe(
      false,
    );
    expect(bytes()).not.toContain(hash);
  });

  it("revoking the last device leaves a valid empty store", async () => {
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        version: 1,
        devices: [
          {
            id: "d1",
            name: "One",
            createdAt: "2026-10-09T13:00:00.000Z",
            credentialHash: "b".repeat(64),
          },
        ],
      }),
    );
    expect(await revokeDevice(dir, "d1")).toEqual({ kind: "ok" });
    expect(readJson()).toEqual({ version: 1, devices: [] });
    expect(listDevices(dir)).toEqual({
      kind: "ok",
      devices: [],
      storeDirectory: dir,
    });
  });

  it("returns not-found for an unknown id without rewriting", async () => {
    install("device-credentials.unknown-fields.json");
    const old = new Date("2020-01-01T00:00:00Z");
    fs.utimesSync(storePath, old, old);
    const before = bytes();
    expect(await revokeDevice(dir, "nope")).toEqual({ kind: "not-found" });
    expect(bytes()).toBe(before);
    expect(fs.statSync(storePath).mtimeMs).toBe(old.getTime());
  });

  it("returns not-found for a missing store and creates no store file", async () => {
    expect(await revokeDevice(dir, ID_A)).toEqual({ kind: "not-found" });
    expect(fs.existsSync(storePath)).toBe(false);
  });

  it("refuses a corrupt store with its bytes unchanged", async () => {
    install("device-credentials.corrupt.json");
    const before = bytes();
    expect(await revokeDevice(dir, ID_A)).toEqual({ kind: "corrupt" });
    expect(bytes()).toBe(before);
  });

  it("reports lock-not-acquired when the lock is held", async () => {
    install("device-credentials.unknown-fields.json");
    fs.writeFileSync(`${storePath}.lock`, "");
    expect(await revokeDevice(dir, ID_A, FAST)).toEqual({
      kind: "lock-not-acquired",
    });
    expect(readJson().devices).toHaveLength(2);
  });

  it("reports write-failed when the directory cannot be written", async () => {
    install("device-credentials.unknown-fields.json");
    fs.chmodSync(dir, 0o500);
    const result = await revokeDevice(dir, ID_A, FAST);
    fs.chmodSync(dir, 0o700);
    expect(result).toEqual({ kind: "write-failed" });
    expect(readJson().devices).toHaveLength(2);
  });

  it("reports write-failed when the writer throws", async () => {
    install("device-credentials.unknown-fields.json");
    expect(
      await revokeDevice(dir, ID_A, {
        update: () => Promise.reject(new Error("x")),
      }),
    ).toEqual({ kind: "write-failed" });
  });
});
