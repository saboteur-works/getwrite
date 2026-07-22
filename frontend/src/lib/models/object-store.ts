// Last Updated: 2026-07-22

/**
 * @module object-store
 *
 * A minimal key/value object-store contract and two dependency-free
 * implementations.
 *
 * This is the seam beneath {@link objectStoreAdapter}: the object-store backend
 * models a *flat* namespace of opaque byte blobs keyed by string, unlike the
 * hierarchical POSIX filesystem the default `io.ts` adapter targets. A real
 * S3/R2 client would implement exactly this five-method surface, and nothing
 * more — so adopting object storage becomes a backend swap, not a rewrite (see
 * ADR-019).
 *
 * Two implementations ship here:
 * - {@link createMemoryObjectStore} — an in-process `Map`, for tests and the
 *   shared adapter-conformance suite.
 * - {@link createFsObjectStore} — persists each object as a file under a root
 *   directory, so the object-store backend is genuinely runnable in dev/CI with
 *   no cloud dependency.
 *
 * Both stores (and this module) legitimately use `node:fs` directly: they *are*
 * a storage backend, the same category as `io.ts` and `memoryAdapter.ts`, and
 * therefore sit outside the "model code routes through the adapter" rule in
 * `docs/standards/storage-context.md` §5.
 */
import fs from "node:fs/promises";
import path from "node:path";

/**
 * A flat key/value store of opaque byte blobs.
 *
 * Keys are arbitrary strings (the {@link objectStoreAdapter} derives them from
 * normalized POSIX paths). Values are raw {@link Buffer}s — the store never
 * decodes or interprets payloads, so binary assets round-trip byte-for-byte.
 */
export interface ObjectStore {
  /**
   * Reads an object's bytes.
   *
   * @param key - Object key.
   * @returns The stored bytes.
   * @throws An `Error` with `code === "ENOENT"` when the key is absent.
   */
  get(key: string): Promise<Buffer>;
  /**
   * Writes (or overwrites) an object. Overwrite is atomic per key: a reader
   * observes either the old bytes or the new bytes, never a partial write.
   *
   * @param key - Object key.
   * @param data - Bytes to store.
   */
  put(key: string, data: Buffer): Promise<void>;
  /**
   * Deletes an object. Idempotent: deleting an absent key is a no-op, not an
   * error.
   *
   * @param key - Object key.
   */
  delete(key: string): Promise<void>;
  /**
   * Lists every key whose name begins with `prefix`.
   *
   * @param prefix - Key prefix (may be empty to list all keys).
   * @returns Matching keys, in unspecified order.
   */
  list(prefix: string): Promise<string[]>;
  /**
   * Reports whether an object exists, without transferring its bytes (an S3
   * `HEAD`).
   *
   * @param key - Object key.
   * @returns `true` when the key exists, `false` otherwise.
   */
  has(key: string): Promise<boolean>;
}

/**
 * Attaches a POSIX-style error `code` so callers (and the adapter above) can
 * branch on `err.code === "ENOENT"`, mirroring `node:fs` and `memoryAdapter`.
 */
function enoent(key: string): Error {
  return Object.assign(new Error(`ENOENT: no such object, '${key}'`), {
    code: "ENOENT",
  });
}

/**
 * Creates an in-memory {@link ObjectStore} backed by a `Map`.
 *
 * Each call returns an isolated store. Buffers are cloned on write and read so
 * callers cannot mutate stored bytes through an aliased reference.
 *
 * @returns A fresh in-memory object store.
 */
export function createMemoryObjectStore(): ObjectStore {
  const objects = new Map<string, Buffer>();
  return {
    get: async (key) => {
      const data = objects.get(key);
      if (data === undefined) throw enoent(key);
      return Buffer.from(data);
    },
    put: async (key, data) => {
      objects.set(key, Buffer.from(data));
    },
    delete: async (key) => {
      objects.delete(key);
    },
    list: async (prefix) =>
      [...objects.keys()].filter((k) => k.startsWith(prefix)),
    has: async (key) => objects.has(key),
  };
}

/**
 * Encodes an object key into a single on-disk filename under the store root.
 *
 * The key is percent-encoded so that `/`, `.` and other separators in the key
 * cannot escape the root or create nested directories — every object is a flat
 * file directly under `root`, faithfully modeling an object store's flat
 * namespace (not a directory tree).
 *
 * @param root - Store root directory.
 * @param key - Object key.
 * @returns Absolute path to the object's backing file.
 */
function keyToFile(root: string, key: string): string {
  return path.join(root, encodeURIComponent(key));
}

/** Inverse of {@link keyToFile}: recovers the key from a backing filename. */
function fileToKey(name: string): string {
  return decodeURIComponent(name);
}

/**
 * Creates a filesystem-backed {@link ObjectStore} that persists each object as
 * a flat, percent-encoded file under `root`.
 *
 * This makes the object-store backend runnable for real (dev/CI, and a hosted
 * single-volume deployment) without any cloud dependency, while still exposing
 * only object-store semantics to the adapter above — the backing files are an
 * implementation detail the adapter never sees.
 *
 * @param root - Directory under which objects are stored (created on demand).
 * @returns A persistent object store.
 */
export function createFsObjectStore(root: string): ObjectStore {
  let hasEnsuredRoot = false;
  async function ensureRoot(): Promise<void> {
    if (hasEnsuredRoot) return;
    await fs.mkdir(root, { recursive: true });
    hasEnsuredRoot = true;
  }
  return {
    get: async (key) => {
      try {
        return await fs.readFile(keyToFile(root, key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") throw enoent(key);
        throw err;
      }
    },
    put: async (key, data) => {
      await ensureRoot();
      // Write-then-rename so a concurrent reader never sees a partial object.
      const finalPath = keyToFile(root, key);
      const tmpPath = `${finalPath}.${process.pid}.tmp`;
      await fs.writeFile(tmpPath, data);
      await fs.rename(tmpPath, finalPath);
    },
    delete: async (key) => {
      await fs.rm(keyToFile(root, key), { force: true });
    },
    list: async (prefix) => {
      let names: string[];
      try {
        names = await fs.readdir(root);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw err;
      }
      return names
        .filter((n) => !n.endsWith(".tmp"))
        .map(fileToKey)
        .filter((k) => k.startsWith(prefix));
    },
    has: async (key) => {
      try {
        await fs.stat(keyToFile(root, key));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export default { createMemoryObjectStore, createFsObjectStore };
