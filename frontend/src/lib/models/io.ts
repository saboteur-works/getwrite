// Last Updated: 2026-03-11

/**
 * @module io
 *
 * Thin indirection layer over filesystem operations used by model modules.
 *
 * This module centralizes all filesystem access behind a replaceable
 * {@link StorageAdapter}. Production code uses Node's `fs/promises` API by
 * default, while tests can inject an in-memory or mocked adapter via
 * {@link setStorageAdapter}.
 *
 * Each wrapper resolves its adapter per-call via `currentAdapter()`, which
 * prefers the ambient {@link StorageContext.adapter} bound by
 * `runInStorageContext` (see `storage-context.ts`), if any request/task
 * scope is currently active, and otherwise falls back to the module-level
 * default/override adapter set via {@link setStorageAdapter}.
 *
 * Primary goals:
 * - Enable deterministic tests by swapping the global storage implementation.
 * - Keep call sites agnostic to concrete I/O APIs.
 * - Provide a small, explicit contract for operations used by the models.
 */
import fs from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import { getStorageContext } from "./storage-context";

/**
 * Result type for directory listings.
 *
 * Mirrors Node's `readdir` behavior:
 * - `string[]` when entries are returned as names.
 * - `Dirent[]` when `withFileTypes: true` is used.
 */
export type ReaddirResult = string[] | Dirent[];

/**
 * Abstract contract for storage operations used throughout the models layer.
 *
 * Implementations may target the real filesystem, an in-memory map, or a
 * test-double, as long as they preserve method semantics.
 */
export type StorageAdapter = {
  /**
   * Creates a directory.
   *
   * @param path - Directory path to create.
   * @param opts - Optional creation flags.
   * @param opts.recursive - When `true`, creates parent directories as needed.
   */
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  /**
   * Writes file data to disk.
   *
   * @param path - Target file path.
   * @param data - File contents as text or binary buffer.
   * @param opts - Optional write options accepted by the implementation.
   */
  writeFile(
    path: string,
    data: string | Buffer,
    opts?: string | object,
  ): Promise<void>;
  /**
   * Reads a file as text.
   *
   * @param path - File path to read.
   * @param encoding - Optional text encoding.
   * @returns File contents as a string.
   */
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;
  /**
   * Reads directory entries.
   *
   * @param path - Directory path to read.
   * @param opts - Optional flags controlling entry shape.
   * @param opts.withFileTypes - When `true`, returns `Dirent[]`.
   * @returns Either names (`string[]`) or typed entries (`Dirent[]`).
   */
  readdir(
    path: string,
    opts?: { withFileTypes?: boolean },
  ): Promise<ReaddirResult>;
  /**
   * Retrieves filesystem metadata for a path.
   *
   * @param path - File or directory path.
   * @returns Node `Stats` object for the path.
   */
  stat(path: string): Promise<Stats>;
  /**
   * Removes a file or directory.
   *
   * @param path - Path to remove.
   * @param opts - Optional removal flags.
   * @param opts.recursive - When `true`, removes directories recursively.
   * @param opts.force - When `true`, ignores missing paths.
   */
  rm(
    path: string,
    opts?: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
  /**
   * Renames or moves a file/directory.
   *
   * @param oldPath - Existing path.
   * @param newPath - New destination path.
   */
  rename(oldPath: string, newPath: string): Promise<void>;
  /**
   * Flushes file data to disk so it survives sudden shutdown.
   *
   * Real filesystem adapters should open the file, call `fsync`, and close.
   * In-memory or test adapters may treat this as a no-op since their writes
   * have no on-disk durability concern.
   *
   * @param path - Existing file path.
   */
  fsyncFile?(path: string): Promise<void>;
};

/**
 * Active process-wide storage adapter.
 *
 * Defaults to Node's `fs/promises` implementation, but can be overridden via
 * {@link setStorageAdapter} for tests.
 */
let adapter: StorageAdapter = {
  mkdir: async (p, o) => {
    await fs.mkdir(p, o);
  },
  writeFile: (p, d, o) => fs.writeFile(p, d, o as any),
  readFile: (p, e) => fs.readFile(p, e ?? "utf8") as Promise<string>,
  readdir: (p, o) => fs.readdir(p, o as any) as Promise<ReaddirResult>,
  stat: (p) => fs.stat(p) as Promise<Stats>,
  rm: (p, o) => fs.rm(p, o as any),
  rename: (a, b) => fs.rename(a, b),
  fsyncFile: async (p) => {
    const handle = await fs.open(p, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
};

/**
 * Replaces the active process-wide storage adapter.
 *
 * Primarily intended for tests that need to intercept filesystem effects.
 *
 * @param a - New storage adapter implementation to use.
 */
export function setStorageAdapter(a: StorageAdapter) {
  adapter = a;
}

/**
 * Resolves the storage adapter to use for the current call.
 *
 * Prefers the ambient {@link StorageContext.adapter} bound via
 * `runInStorageContext` for the current async execution chain, if any.
 * Falls back to the module-level default/override adapter (see
 * {@link setStorageAdapter}) when no context is active.
 *
 * @returns The {@link StorageAdapter} to use for this call.
 */
function currentAdapter(): StorageAdapter {
  return getStorageContext()?.adapter ?? adapter;
}

/**
 * Returns the storage adapter that would be used for the current call.
 *
 * Resolves via {@link currentAdapter}: the ambient context adapter (if a
 * `runInStorageContext` scope is active), otherwise the module-level
 * default/override adapter.
 *
 * @returns Active {@link StorageAdapter} instance.
 */
export function getStorageAdapter(): StorageAdapter {
  return currentAdapter();
}

/**
 * Creates a directory using the active storage adapter.
 *
 * @param p - Directory path.
 * @param o - Optional creation options.
 * @returns Resolves when the directory operation completes.
 */
export const mkdir = (p: string, o?: { recursive?: boolean }) =>
  currentAdapter().mkdir(p, o);

/**
 * Writes file data using the active storage adapter.
 *
 * @param p - Destination file path.
 * @param d - Data payload as text or binary.
 * @param o - Optional write options.
 * @returns Resolves when the write completes.
 */
export const writeFile = (p: string, d: string | Buffer, o?: string | object) =>
  currentAdapter().writeFile(p, d, o);

/**
 * Reads a text file using the active storage adapter.
 *
 * @param p - File path to read.
 * @param e - Optional text encoding.
 * @returns File contents as a string.
 */
export const readFile = (p: string, e?: BufferEncoding) =>
  currentAdapter().readFile(p, e);

/**
 * Reads directory entries using the active storage adapter.
 *
 * @param p - Directory path.
 * @param o - Optional listing options.
 * @returns Directory entries as `string[]` or `Dirent[]`.
 */
export const readdir = (p: string, o?: { withFileTypes?: boolean }) =>
  currentAdapter().readdir(p, o);

/**
 * Reads filesystem metadata for a path.
 *
 * @param p - File or directory path.
 * @returns Node `Stats` for the path.
 */
export const stat = (p: string) => currentAdapter().stat(p);

/**
 * Removes a file or directory using the active storage adapter.
 *
 * @param p - Path to remove.
 * @param o - Optional removal options.
 * @returns Resolves when removal completes.
 */
export const rm = (p: string, o?: { recursive?: boolean; force?: boolean }) =>
  currentAdapter().rm(p, o);

/**
 * Renames or moves a file/directory using the active storage adapter.
 *
 * @param a - Existing path.
 * @param b - Destination path.
 * @returns Resolves when rename completes.
 */
export const rename = (a: string, b: string) => currentAdapter().rename(a, b);

/**
 * Flushes file data to disk using the active storage adapter. No-op when the
 * adapter does not implement {@link StorageAdapter.fsyncFile}.
 *
 * @param p - File path to fsync.
 */
export const fsyncFile = async (p: string): Promise<void> => {
  const a = currentAdapter();
  if (a.fsyncFile) await a.fsyncFile(p);
};

/**
 * Options accepted by {@link atomicWriteFile}.
 */
export interface AtomicWriteOptions {
  /**
   * Underlying write options forwarded to the storage adapter's `writeFile`.
   */
  writeOptions?: string | object;
  /**
   * When `true`, fsync the temp file before renaming so data survives a
   * sudden shutdown. Adds latency; intended for index/backlinks meta writes
   * where loss would force an expensive rebuild.
   */
  durable?: boolean;
}

/**
 * Writes file data atomically: writes to `<path>.tmp` then renames into place.
 *
 * On POSIX systems rename is atomic within a filesystem, so a crash between
 * the write and the rename leaves the original file intact rather than
 * producing a partially-written result. When `opts.durable` is true, also
 * fsyncs the temp file before rename so committed data survives a crash.
 *
 * For backwards compatibility, callers may still pass a plain options object
 * — it is forwarded directly to the underlying `writeFile`.
 *
 * @param p - Destination file path.
 * @param data - File contents as text or binary.
 * @param opts - Either underlying write options or {@link AtomicWriteOptions}.
 * @returns Resolves when the rename completes.
 */
export async function atomicWriteFile(
  p: string,
  data: string | Buffer,
  opts?: string | object | AtomicWriteOptions,
): Promise<void> {
  const tmp = `${p}.tmp`;
  const normalized = normalizeAtomicWriteOptions(opts);
  await writeFile(tmp, data, normalized.writeOptions);
  if (normalized.durable) {
    try {
      await fsyncFile(tmp);
    } catch (err) {
      // Best-effort: a missing fsync impl or a permission error must not
      // block the rename, since the atomic guarantee still holds without it.
      console.warn("[io] fsync before rename failed:", err);
    }
  }
  await rename(tmp, p);
}

function normalizeAtomicWriteOptions(
  opts?: string | object | AtomicWriteOptions,
): { writeOptions?: string | object; durable: boolean } {
  if (opts == null) return { writeOptions: undefined, durable: false };
  if (typeof opts === "string") return { writeOptions: opts, durable: false };
  const typed = opts as AtomicWriteOptions;
  if ("durable" in typed || "writeOptions" in typed) {
    return {
      writeOptions: typed.writeOptions,
      durable: typed.durable === true,
    };
  }
  return { writeOptions: opts, durable: false };
}

export default { setStorageAdapter, getStorageAdapter };
