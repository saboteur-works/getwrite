/**
 * Device IPC handlers (Feature 76, Task 6; FR-3, FR-4, FR-5(a)-(c), FR-2).
 * The sender check is the real `isTrustedSender` over the real local origin.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createDeviceHandlers } from "../src/sharing/device-ipc";
import { isTrustedSender } from "../src/navigation-guard";
import { localOrigin, PORT } from "../src/server-config";
import { CREDENTIALS_FILE_NAME } from "../src/sharing/store-status";

const FIXTURES = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/sharing",
);
const ORIGIN = localOrigin(PORT);
const TRUSTED = { senderFrame: { url: `${ORIGIN}/` } };
const ID = "3d9a7c10-5e2b-4c8f-8a61-1f2e3d4c5b6a";

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

let dir: string;
let storePath: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-device-ipc-"));
  storePath = path.join(dir, CREDENTIALS_FILE_NAME);
  fs.copyFileSync(
    path.join(FIXTURES, "device-credentials.unknown-fields.json"),
    storePath,
  );
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function build() {
  const operations = {
    listDevices: vi.fn(),
    renameDevice: vi.fn(async () => ({ kind: "ok" as const })),
    revokeDevice: vi.fn(async () => ({ kind: "ok" as const })),
  };
  const handlers = createDeviceHandlers({
    userDataDir: dir,
    isTrustedSender: (url) => isTrustedSender(url, ORIGIN),
    operations,
  });
  return { handlers, operations };
}

describe("untrusted senders", () => {
  for (const [label, event] of Object.entries(UNTRUSTED)) {
    it(`refuses all three handlers for ${label}`, async () => {
      const { handlers, operations } = build();
      const before = fs.readFileSync(storePath);
      await expect(handlers.list(event)).rejects.toThrow(/untrusted sender/);
      await expect(handlers.rename(event, ID, "x")).rejects.toThrow(
        /untrusted sender/,
      );
      await expect(handlers.revoke(event, ID)).rejects.toThrow(
        /untrusted sender/,
      );
      expect(operations.listDevices).not.toHaveBeenCalled();
      expect(operations.renameDevice).not.toHaveBeenCalled();
      expect(operations.revokeDevice).not.toHaveBeenCalled();
      expect(fs.readFileSync(storePath).equals(before)).toBe(true);
    });
  }
});

describe("trusted sender", () => {
  it("reaches each operation with the user-data directory", async () => {
    const { handlers, operations } = build();
    operations.listDevices.mockReturnValue({
      kind: "missing",
      devices: [],
      storeDirectory: dir,
    });
    expect(await handlers.list(TRUSTED)).toEqual({
      kind: "missing",
      devices: [],
      storeDirectory: dir,
    });
    expect(await handlers.rename(TRUSTED, ID, "New")).toEqual({ kind: "ok" });
    expect(operations.renameDevice).toHaveBeenCalledWith(dir, ID, "New");
    expect(await handlers.revoke(TRUSTED, ID)).toEqual({ kind: "ok" });
    expect(operations.revokeDevice).toHaveBeenCalledWith(dir, ID);
  });

  it("passes a non-string name through for main to judge (invalid-name result)", async () => {
    const { handlers, operations } = build();
    await handlers.rename(TRUSTED, ID, 42 as unknown as string);
    expect(operations.renameDevice).toHaveBeenCalledWith(dir, ID, 42);
  });

  it("lists with the real operation: no credentialHash, no 64-hex string", async () => {
    const real = createDeviceHandlers({
      userDataDir: dir,
      isTrustedSender: (url) => isTrustedSender(url, ORIGIN),
    });
    const result = await real.list(TRUSTED);
    expect(result.kind).toBe("ok");
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/credentialHash/);
    expect(text).not.toMatch(/[0-9a-f]{64}/i);
  });
});

describe("payload validation", () => {
  const SECRET_ID = "SECRET-ID-VALUE";
  it.each([
    ["non-string id", 5],
    ["empty id", ""],
    ["object id", { a: 1 }],
  ])("refuses rename with a %s before any operation", async (_l, id) => {
    const { handlers, operations } = build();
    await expect(
      handlers.rename(TRUSTED, id as unknown as string, "n"),
    ).rejects.toThrow();
    expect(operations.renameDevice).not.toHaveBeenCalled();
  });

  it.each([
    ["non-string id", 5],
    ["empty id", ""],
  ])("refuses revoke with a %s before any operation", async (_l, id) => {
    const { handlers, operations } = build();
    await expect(
      handlers.revoke(TRUSTED, id as unknown as string),
    ).rejects.toThrow();
    expect(operations.revokeDevice).not.toHaveBeenCalled();
  });

  it("the thrown error contains neither the id nor the name", async () => {
    const { handlers } = build();
    const error = await handlers
      .rename(TRUSTED, "" as string, SECRET_ID)
      .catch((e: Error) => e);
    expect((error as Error).message).not.toContain(SECRET_ID);
    const error2 = await handlers
      .revoke(TRUSTED, 12345 as unknown as string)
      .catch((e: Error) => e);
    expect((error2 as Error).message).not.toContain("12345");
  });
});
