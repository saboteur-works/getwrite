/**
 * Per-file lock for read-modify-write of one JSON file (Feature 92).
 *
 * `withFileLock(filePath, fn)` runs `fn` once every earlier call for the same
 * file has finished, in call order. It is used for a project's `project.json`
 * and, in later tasks, for each resource sidecar. The caller reads the file,
 * computes the new value and writes it inside `fn`, so the read a write is
 * based on is never older than the previous writer's write.
 *
 * Shape:
 * - Callback form only. There is no release function to forget.
 * - Its own key map: shared with neither `withMetaLock` (`meta-locks.ts`) nor
 *   `acquireLock` (`locks.ts`), so it never waits on them and they never wait
 *   on it.
 * - One key per file, `path.resolve(filePath)`. No `realpath`: two spellings of
 *   one path share a lock, a symlinked path is not followed.
 * - No timeout. A call waits for as long as earlier calls take.
 * - A throw or rejection from `fn` reaches the caller as the same error object
 *   and releases the lock for the next call.
 * - A key is removed from the map when its last call finishes.
 *
 * Lock-order rule (FR-8). This lock is always the innermost lock. While inside
 * `fn`, code MUST NOT take `withFileLock` again (for the same file or any
 * other), `withMetaLock`, `acquireLock`, or any other lock: a nested call for
 * the same key waits on itself forever, and two files locked in opposite
 * orders can deadlock. The allowed edges into this lock are
 * `acquireLock(*) -> file lock` (including `acquireLock(projectRoot)` and the
 * `revision-content:` keys) and `withMetaLock -> file lock`. No edge leaves it.
 * The existing edge `acquireLock(revision-content) -> withMetaLock` is not
 * changed by this module.
 */
import path from "node:path";

interface LockEntry {
  /** Settles (never rejects) when the most recent call for the key finishes. */
  tail: Promise<void>;
  /** Calls running or waiting for the key. */
  pending: number;
}

const entries: Map<string, LockEntry> = new Map();

export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(filePath);
  const entry: LockEntry = entries.get(key) ?? {
    tail: Promise.resolve(),
    pending: 0,
  };
  entries.set(key, entry);
  entry.pending += 1;

  const run: Promise<T> = entry.tail.then(() => fn());
  entry.tail = run.then(
    () => undefined,
    () => undefined,
  );

  try {
    return await run;
  } finally {
    entry.pending -= 1;
    if (entry.pending === 0 && entries.get(key) === entry) {
      entries.delete(key);
    }
  }
}

/** Number of file keys currently held or waited on. Test-only observation. */
export function fileLockKeyCountForTests(): number {
  return entries.size;
}
