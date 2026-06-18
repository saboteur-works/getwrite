import fs from "node:fs/promises";
import { __resetIndexerForTests } from "../../../src/lib/models/indexer-queue";

/**
 * Remove a temp project directory used by a test, retrying on transient errors.
 *
 * Writing a resource/sidecar/revision lazily starts the background indexer,
 * which (a) performs async fs writes under `meta/` and (b) starts a recursive
 * `fs.watch` backlinks watcher on `resources/`. If the directory is deleted
 * while that work is live, two failures follow: the recursive watcher throws an
 * uncaught ENOENT from Node's internal walk on Linux (crashing an unrelated,
 * later test), and in-flight writes race the delete (ENOTEMPTY). Resetting the
 * indexer first stops the watcher and clears the queue; the retry loop then
 * absorbs any write that was already in flight.
 */
export async function removeDirRetry(
  dir: string,
  attempts = 5,
  delayMs = 50,
): Promise<void> {
  __resetIndexerForTests();
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
      return;
    } catch (err: any) {
      if (i === attempts - 1) throw err;
      // small backoff
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

export default { removeDirRetry };
