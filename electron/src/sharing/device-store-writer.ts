/**
 * @module device-store-writer
 *
 * Main-side writer for `device-credentials.json` (Feature 76, FR-14..FR-16).
 * Serialises with the server by the same lock-file protocol as
 * `frontend/src/lib/sharing/file-lock.ts` (kept honest by contract tests):
 * the lock path is exactly `<store path>.lock`, opened `wx` with mode 0600.
 * Records are handled as parsed JSON so unknown fields survive a rewrite, and
 * a store that cannot be read cleanly is never overwritten.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { CREDENTIALS_FILE_NAME, isDeviceRecord } from "./store-status";

const LOCK_SUFFIX = ".lock";
const DEFAULT_RETRY_LIMIT = 200;
const DEFAULT_RETRY_DELAY_MS = 25;
/** A lock older than this belongs to a process that died holding it. */
const STALE_LOCK_MS = 30_000;

/** One stored device record, as parsed JSON (unknown fields included). */
type RawDeviceRecord = Record<string, unknown>;

/** Returns the new records, or `null` for no change. */
export type DeviceStoreMutation = (
  records: RawDeviceRecord[],
) => RawDeviceRecord[] | null;

export type DeviceStoreOutcome =
  | { kind: "written" }
  | { kind: "unchanged" }
  | { kind: "corrupt" }
  | { kind: "lock-not-acquired" };

export interface DeviceStoreOptions {
  retryLimit?: number;
  retryDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function removeIfStale(lockPath: string): void {
  try {
    const info = fs.statSync(lockPath);
    if (Date.now() - info.mtimeMs > STALE_LOCK_MS) fs.unlinkSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function acquireLock(
  lockPath: string,
  retryLimit: number,
  retryDelayMs: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < retryLimit; attempt += 1) {
    try {
      fs.closeSync(fs.openSync(lockPath, "wx", 0o600));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      removeIfStale(lockPath);
      await sleep(retryDelayMs);
    }
  }
  return false;
}

type ReadResult =
  | { kind: "ok"; records: RawDeviceRecord[]; root: Record<string, unknown> }
  | { kind: "corrupt" };

function readStore(filePath: string): ReadResult {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "ok", records: [], root: { version: 1 } };
    }
    return { kind: "corrupt" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "corrupt" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "corrupt" };
  }
  const root = parsed as Record<string, unknown>;
  const devices = root.devices;
  if (
    root.version !== 1 ||
    !Array.isArray(devices) ||
    !devices.every(isDeviceRecord)
  ) {
    return { kind: "corrupt" };
  }
  return { kind: "ok", records: devices as RawDeviceRecord[], root };
}

function writeAtomically(filePath: string, body: string): void {
  const tempPath = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const fd = fs.openSync(tempPath, "wx", 0o600);
    try {
      fs.writeSync(fd, body, null, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

/**
 * Read-modify-write `device-credentials.json` under the lock file. The store
 * is read inside the lock; a corrupt or unreadable store is refused with its
 * bytes untouched.
 *
 * @param dir - Sharing directory (`userData`); created if missing.
 * @param mutate - Receives the parsed records; returns the new list or `null`.
 * @param options - Retry overrides (defaults 200 attempts at 25 ms).
 * @returns The outcome. Errors other than `EEXIST` on the lock open, and
 *   errors thrown by `mutate` or the write, propagate after the lock is released.
 */
export async function updateDeviceStore(
  dir: string,
  mutate: DeviceStoreMutation,
  options: DeviceStoreOptions = {},
): Promise<DeviceStoreOutcome> {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, CREDENTIALS_FILE_NAME);
  const lockPath = `${filePath}${LOCK_SUFFIX}`;
  const acquired = await acquireLock(
    lockPath,
    options.retryLimit ?? DEFAULT_RETRY_LIMIT,
    options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  );
  if (!acquired) return { kind: "lock-not-acquired" };
  try {
    const current = readStore(filePath);
    if (current.kind === "corrupt") return { kind: "corrupt" };
    const next = mutate(current.records);
    if (next === null) return { kind: "unchanged" };
    const body = `${JSON.stringify({ ...current.root, version: 1, devices: next }, null, 2)}\n`;
    writeAtomically(filePath, body);
    return { kind: "written" };
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
}
