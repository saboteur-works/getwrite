/**
 * Exclusive lock-file and atomic 0600 write helpers shared by the sharing
 * stores (credential store, pairing verification). Extracted unchanged from
 * `credential-store.ts`.
 */
import { chmod, open, rename, rm, stat, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export const LOCK_SUFFIX = ".lock";

const LOCK_RETRY_LIMIT = 200;
const LOCK_RETRY_DELAY_MS = 25;
/**
 * A lock file older than this is assumed to belong to a process that died
 * while holding it, and is removed. The critical section is a read plus one
 * small write, so a held lock this old cannot be live.
 */
const LOCK_STALE_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeIfStale(lockPath: string): Promise<void> {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > LOCK_STALE_MS) await unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function acquireLock(lockPath: string): Promise<void> {
  for (let attempt = 0; attempt < LOCK_RETRY_LIMIT; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      await handle.close();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await removeIfStale(lockPath);
      await sleep(LOCK_RETRY_DELAY_MS);
    }
  }
  throw new Error("Could not acquire the credential store lock");
}

/** Write `body` to a 0600 temp file, fsync, then rename over `filePath`. */
export async function writeFileAtomically(
  filePath: string,
  body: string,
): Promise<void> {
  const tempPath = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const handle = await open(tempPath, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(tempPath, 0o600);
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

/** Run `fn` holding the exclusive lock at `lockPath`; always releases it. */
export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  await acquireLock(lockPath);
  try {
    return await fn();
  } finally {
    await rm(lockPath, { force: true });
  }
}
