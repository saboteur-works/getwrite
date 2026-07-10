import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { resolveTenant } from "../../app/api/_lib/resolve-tenant";
import { defaultProjectsDir } from "../../src/lib/models/projects-dir";
import {
  setStorageAdapter,
  getStorageAdapter,
  type StorageAdapter,
} from "../../src/lib/models/io";

/**
 * Minimal `StorageAdapter`-shaped stub with a spy-wrapped `mkdir`, so tests
 * can assert on provisioning calls without touching the real filesystem.
 */
function createFakeAdapter(): StorageAdapter & {
  mkdir: ReturnType<typeof vi.fn>;
} {
  return {
    mkdir: vi.fn(async () => {}),
    writeFile: async () => {},
    readFile: async () => "",
    readdir: async () => [],
    stat: async () => ({}) as Awaited<ReturnType<StorageAdapter["stat"]>>,
    rm: async () => {},
    rename: async () => {},
  } as StorageAdapter & { mkdir: ReturnType<typeof vi.fn> };
}

describe("resolveTenant", () => {
  let savedDevIdentity: string | undefined;
  let savedDataRoot: string | undefined;
  let originalAdapter: StorageAdapter;
  let fakeAdapter: StorageAdapter & { mkdir: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    savedDevIdentity = process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    savedDataRoot = process.env.GETWRITE_DATA_ROOT;
    delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    delete process.env.GETWRITE_DATA_ROOT;

    originalAdapter = getStorageAdapter();
    fakeAdapter = createFakeAdapter();
    setStorageAdapter(fakeAdapter);
  });

  afterEach(() => {
    if (savedDevIdentity === undefined) {
      delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    } else {
      process.env.GETWRITE_ENABLE_DEV_IDENTITY = savedDevIdentity;
    }

    if (savedDataRoot === undefined) {
      delete process.env.GETWRITE_DATA_ROOT;
    } else {
      process.env.GETWRITE_DATA_ROOT = savedDataRoot;
    }

    setStorageAdapter(originalAdapter);
  });

  it("returns { userId: null, dataRoot: defaultProjectsDir() } and does not call mkdir when no identity is present", async () => {
    const request = new Request("http://localhost");

    const result = await resolveTenant(request);

    expect(result).toEqual({ userId: null, dataRoot: defaultProjectsDir() });
    expect(fakeAdapter.mkdir).not.toHaveBeenCalled();
  });

  it("returns the derived data root and provisions it via mkdir for a valid, identified user", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    process.env.GETWRITE_DATA_ROOT = "/absolute/data-root";
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "alice" },
    });

    const result = await resolveTenant(request);

    const expectedDataRoot = path.join("/absolute/data-root", "alice");
    expect(result).toEqual({ userId: "alice", dataRoot: expectedDataRoot });
    expect(fakeAdapter.mkdir).toHaveBeenCalledWith(expectedDataRoot, {
      recursive: true,
    });

    warnSpy.mockRestore();
  });

  it("throws when the identified userId fails the path-traversal allowlist", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    process.env.GETWRITE_DATA_ROOT = "/absolute/data-root";
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "../etc" },
    });

    await expect(resolveTenant(request)).rejects.toThrow();
    expect(fakeAdapter.mkdir).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("throws when GETWRITE_DATA_ROOT is missing, even with a valid userId", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "alice" },
    });

    await expect(resolveTenant(request)).rejects.toThrow();
    expect(fakeAdapter.mkdir).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
