import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveBackendAdapter,
  StorageBackendError,
  __resetStorageBackendForTests,
} from "../../app/api/_tenant/storage-backend";
import {
  resolveTenant,
  __resetProvisionedRootsForTests,
} from "../../app/api/_tenant/resolve-tenant";
import {
  setStorageAdapter,
  getStorageAdapter,
  type StorageAdapter,
} from "../../src/lib/models/io";

describe("resolveBackendAdapter", () => {
  let savedBackend: string | undefined;
  let savedRoot: string | undefined;
  let originalAdapter: StorageAdapter;

  beforeEach(() => {
    savedBackend = process.env.GETWRITE_STORAGE_BACKEND;
    savedRoot = process.env.GETWRITE_OBJECT_STORE_ROOT;
    delete process.env.GETWRITE_STORAGE_BACKEND;
    delete process.env.GETWRITE_OBJECT_STORE_ROOT;
    originalAdapter = getStorageAdapter();
    __resetStorageBackendForTests();
  });

  afterEach(() => {
    if (savedBackend === undefined) delete process.env.GETWRITE_STORAGE_BACKEND;
    else process.env.GETWRITE_STORAGE_BACKEND = savedBackend;
    if (savedRoot === undefined) delete process.env.GETWRITE_OBJECT_STORE_ROOT;
    else process.env.GETWRITE_OBJECT_STORE_ROOT = savedRoot;
    setStorageAdapter(originalAdapter);
    __resetStorageBackendForTests();
  });

  it("returns the ambient default adapter when the backend is unset", () => {
    const sentinel = { marker: true } as unknown as StorageAdapter;
    setStorageAdapter(sentinel);
    expect(resolveBackendAdapter()).toBe(sentinel);
  });

  it("returns a distinct object-store adapter when GETWRITE_STORAGE_BACKEND=object-store", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-backend-"));
    try {
      process.env.GETWRITE_STORAGE_BACKEND = "object-store";
      process.env.GETWRITE_OBJECT_STORE_ROOT = root;

      const adapter = resolveBackendAdapter();
      expect(adapter).not.toBe(getStorageAdapter());
      // The selection is memoized: same instance on the next call.
      expect(resolveBackendAdapter()).toBe(adapter);
      expect(warnSpy).toHaveBeenCalledOnce();

      // It genuinely routes to the object store: a write lands under the root
      // as a flat, percent-encoded object, not a nested project tree.
      await adapter.mkdir("/proj", { recursive: true });
      await adapter.writeFile("/proj/file.txt", "hello");
      const entries = await fs.readdir(root);
      expect(entries.some((e) => e.includes("%2F"))).toBe(true);
      expect(await adapter.readFile("/proj/file.txt", "utf8")).toBe("hello");
    } finally {
      warnSpy.mockRestore();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when object-store is selected without a root", () => {
    process.env.GETWRITE_STORAGE_BACKEND = "object-store";
    expect(() => resolveBackendAdapter()).toThrow(StorageBackendError);
  });
});

describe("resolveTenant threads the selected backend adapter", () => {
  let savedBackend: string | undefined;
  let savedRoot: string | undefined;
  let savedDevIdentity: string | undefined;
  let savedDataRoot: string | undefined;

  beforeEach(() => {
    savedBackend = process.env.GETWRITE_STORAGE_BACKEND;
    savedRoot = process.env.GETWRITE_OBJECT_STORE_ROOT;
    savedDevIdentity = process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    savedDataRoot = process.env.GETWRITE_DATA_ROOT;
    __resetStorageBackendForTests();
    __resetProvisionedRootsForTests();
  });

  afterEach(() => {
    const restore = (k: string, v: string | undefined) =>
      v === undefined ? delete process.env[k] : (process.env[k] = v);
    restore("GETWRITE_STORAGE_BACKEND", savedBackend);
    restore("GETWRITE_OBJECT_STORE_ROOT", savedRoot);
    restore("GETWRITE_ENABLE_DEV_IDENTITY", savedDevIdentity);
    restore("GETWRITE_DATA_ROOT", savedDataRoot);
    __resetStorageBackendForTests();
    __resetProvisionedRootsForTests();
  });

  it("provisions a signed-in tenant through the object store and returns that adapter", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-backend-"));
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-dataroot-"));
    try {
      process.env.GETWRITE_STORAGE_BACKEND = "object-store";
      process.env.GETWRITE_OBJECT_STORE_ROOT = root;
      process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
      process.env.GETWRITE_DATA_ROOT = dataRoot;

      const request = new Request("http://localhost", {
        headers: { "x-getwrite-dev-user": "alice" },
      });
      const resolved = await resolveTenant(request);

      expect(resolved.userId).toBe("alice");
      expect(resolved.adapter).toBe(resolveBackendAdapter());
      // Provisioning created the tenant's directory marker in the object store,
      // NOT as a real directory on disk under GETWRITE_DATA_ROOT.
      expect(
        (await resolved.adapter.stat(resolved.dataRoot)).isDirectory(),
      ).toBe(true);
      expect(await fs.readdir(dataRoot)).toEqual([]);
    } finally {
      warnSpy.mockRestore();
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(dataRoot, { recursive: true, force: true });
    }
  });
});
