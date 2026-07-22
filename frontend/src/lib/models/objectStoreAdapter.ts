// Last Updated: 2026-07-22

/**
 * @module objectStoreAdapter
 *
 * A {@link StorageAdapter} implemented over a flat {@link ObjectStore} — the
 * bridge from object-store semantics (opaque blobs keyed by string, no
 * directories, no atomic rename) to the hierarchical POSIX filesystem semantics
 * the model layer expects (see ADR-019).
 *
 * The bridge rests on a few conventions:
 * - **Path↔key**: a POSIX-normalized path with leading/trailing slashes
 *   stripped becomes an object key; the tenant path prefix
 *   (`<GETWRITE_DATA_ROOT>/<userId>/…`) is a natural key prefix.
 * - **Directory markers**: `mkdir(p)` writes an empty object at the
 *   trailing-slash key `<p>/`, so an empty directory is observable to
 *   `stat`/`readdir`. A trailing slash can never collide with a child name and
 *   is trivially filtered from listings.
 * - **Listing**: `readdir` is a prefix list, deriving immediate children from
 *   the first path segment after the directory's prefix.
 * - **Rename**: file rename is a per-key atomic copy+delete (so
 *   `atomicWriteFile`'s "never a partial target" guarantee still holds).
 *   Directory rename fails if the destination exists (preserving
 *   `revision.ts`'s fail-if-exists guard) and otherwise copies every key —
 *   a non-atomic move, the one weakened guarantee ADR-019 documents.
 *
 * The model layer consumes only a thin slice of `Stats`/`Dirent`
 * (`isDirectory`, `isFile`, `name`, plus existence), so those are synthesized
 * as minimal duck-typed objects, exactly as `memoryAdapter.ts` does.
 */
import path from "node:path";
import type { Dirent, Stats } from "node:fs";
import type { ReaddirResult, StorageAdapter } from "./io";
import type { ObjectStore } from "./object-store";

/** Empty payload used for directory-marker objects. */
const EMPTY = Buffer.alloc(0);

/** Builds a coded error matching the `node:fs` / `memoryAdapter` convention. */
function coded(code: string, message: string): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

/** Coerces a string/Buffer payload to a `Buffer` (utf8 for strings). */
function toBuffer(data: string | Buffer): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
}

/**
 * Normalizes a filesystem path into an object key: POSIX-normalized, with
 * leading and trailing slashes removed. The root path maps to the empty key.
 *
 * @param p - Filesystem path.
 * @returns The corresponding object key (`""` for root).
 */
function toKey(p: string): string {
  const normalized = path.posix
    .normalize(p)
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return normalized === "." ? "" : normalized;
}

/**
 * The key prefix under which a directory's descendants live. Root (`""`) has
 * the empty prefix, so listing it enumerates the whole store.
 *
 * @param key - Directory key.
 * @returns Prefix ending in `/`, or `""` for root.
 */
function prefixOf(key: string): string {
  return key === "" ? "" : `${key}/`;
}

/**
 * Creates a {@link StorageAdapter} backed by an {@link ObjectStore}.
 *
 * @param store - The underlying object store.
 * @returns A storage adapter honoring the model layer's filesystem contract.
 */
export function objectStoreAdapter(store: ObjectStore): StorageAdapter {
  /** Lists every key under a directory prefix (marker + all descendants). */
  const listUnder = (key: string) => store.list(prefixOf(key));

  return {
    mkdir: async (p) => {
      const key = toKey(p);
      // The leaf marker suffices: ancestors are implied by prefix listing.
      if (key !== "") await store.put(prefixOf(key), EMPTY);
    },

    writeFile: async (p, data) => {
      await store.put(toKey(p), toBuffer(data));
    },

    readFile: async (p, encoding) => {
      const buf = await store.get(toKey(p));
      return buf.toString(encoding ?? "utf8");
    },

    readFileBuffer: async (p) => store.get(toKey(p)),

    readdir: async (
      p,
      opts?: { withFileTypes?: boolean },
    ): Promise<ReaddirResult> => {
      const key = toKey(p);
      if (key !== "" && (await store.has(key))) {
        throw coded("ENOTDIR", `not a directory, '${p}'`);
      }
      const prefix = prefixOf(key);
      const keys = await listUnder(key);
      if (key !== "" && keys.length === 0) {
        throw coded("ENOENT", `no such directory, '${p}'`);
      }
      const names = new Set<string>();
      for (const k of keys) {
        const rest = k.slice(prefix.length);
        if (rest === "") continue; // the directory's own marker
        const name = rest.split("/")[0];
        if (name !== "") names.add(name);
      }
      if (!opts?.withFileTypes) return [...names];
      return [...names].map((name) => {
        const childPrefix = `${prefix}${name}/`;
        const isDir = keys.some((k) => k.startsWith(childPrefix));
        const isFileEntry = keys.includes(`${prefix}${name}`);
        return {
          name,
          isDirectory: () => isDir,
          isFile: () => isFileEntry,
        } as unknown as Dirent;
      });
    },

    stat: async (p) => {
      const key = toKey(p);
      if (key === "") return { isDirectory: () => true } as unknown as Stats;
      if (await store.has(key)) {
        return { isDirectory: () => false } as unknown as Stats;
      }
      const keys = await listUnder(key);
      if (keys.length > 0) {
        return { isDirectory: () => true } as unknown as Stats;
      }
      throw coded("ENOENT", `no such file or directory, '${p}'`);
    },

    rm: async (p, opts) => {
      const key = toKey(p);
      if (await store.has(key)) {
        await store.delete(key);
        return;
      }
      // Directory (or missing): drop the marker and every descendant. Missing
      // is tolerated silently, matching `memoryAdapter` and `force`-style rm.
      const keys = await listUnder(key);
      await Promise.all(keys.map((k) => store.delete(k)));
      void opts;
    },

    rename: async (oldPath, newPath) => {
      const srcKey = toKey(oldPath);
      const dstKey = toKey(newPath);
      // File rename: atomic per-key copy + delete. atomicWriteFile relies on
      // this — the temp object is already fully written, so the destination is
      // never observed partial.
      if (await store.has(srcKey)) {
        await store.put(dstKey, await store.get(srcKey));
        await store.delete(srcKey);
        return;
      }
      // Directory rename: preserve the fail-if-exists guarantee revision.ts
      // depends on, then copy every descendant to the rebased prefix.
      const srcPrefix = prefixOf(srcKey);
      const srcKeys = await store.list(srcPrefix);
      if (srcKeys.length === 0) {
        throw coded("ENOENT", `no such file or directory, '${oldPath}'`);
      }
      const dstKeys = await listUnder(dstKey);
      if (dstKeys.length > 0) {
        throw coded("EEXIST", `destination already exists, '${newPath}'`);
      }
      const dstPrefix = prefixOf(dstKey);
      for (const k of srcKeys) {
        await store.put(
          `${dstPrefix}${k.slice(srcPrefix.length)}`,
          await store.get(k),
        );
        await store.delete(k);
      }
    },

    copyFile: async (src, dst) => {
      await store.put(toKey(dst), await store.get(toKey(src)));
    },

    cp: async (src, dst) => {
      const srcKey = toKey(src);
      if (await store.has(srcKey)) {
        await store.put(toKey(dst), await store.get(srcKey));
        return;
      }
      const srcPrefix = prefixOf(srcKey);
      const srcKeys = await store.list(srcPrefix);
      if (srcKeys.length === 0) {
        throw coded("ENOENT", `no such file or directory, '${src}'`);
      }
      const dstPrefix = prefixOf(toKey(dst));
      for (const k of srcKeys) {
        await store.put(
          `${dstPrefix}${k.slice(srcPrefix.length)}`,
          await store.get(k),
        );
      }
    },

    appendFile: async (p, data) => {
      const key = toKey(p);
      const existing = (await store.has(key)) ? await store.get(key) : EMPTY;
      await store.put(key, Buffer.concat([existing, toBuffer(data)]));
    },

    // fsyncFile is intentionally omitted: object stores have no client-side
    // durability flush, and the io.ts wrapper no-ops when it is absent.
  };
}
