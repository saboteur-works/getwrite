/**
 * @module limits-store
 *
 * Main-side reader and writer for `sharing-limits.json` (Feature 77, FR-5..FR-7).
 * The file holds five booleans, `true` meaning restricted. A limit is off only
 * when the file positively says `false`: a missing, unparseable, mistyped,
 * other-version or unreadable file means every limit is on. The server reads
 * the same format with its own parser (`frontend/src/lib/sharing/limits-store.ts`);
 * `frontend/tests/fixtures/sharing/sharing-limits.cases.json` keeps the two honest.
 * Writes are read-modify-write under the shared lock-file protocol, and unknown
 * keys survive a rewrite. An unreadable file is never overwritten.
 */
import fs from "node:fs";
import path from "node:path";
import {
  withFileLock,
  writeAtomically,
  type DeviceStoreOptions as FileLockOptions,
} from "./device-store-writer";

export const LIMITS_FILE_NAME = "sharing-limits.json";

export const LIMIT_KEYS = [
  "projectDeletion",
  "unlocking",
  "locking",
  "encryptionChanges",
  "permanentDeletion",
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number];
export type Limits = Record<LimitKey, boolean>;

export type LimitsRead =
  | { kind: "ok"; limits: Limits }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "unreadable"; reason: string };

export type SetLimitOutcome =
  | { kind: "ok" }
  | { kind: "unreadable"; reason: string }
  | { kind: "lock-not-acquired" }
  | { kind: "write-failed" }
  | { kind: "invalid-input" };

type RawRead =
  | { kind: "ok"; limits: Limits; root: Record<string, unknown> }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "unreadable"; reason: string };

function allOn(): Limits {
  return {
    projectDeletion: true,
    unlocking: true,
    locking: true,
    encryptionChanges: true,
    permanentDeletion: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLimitKey(value: unknown): value is LimitKey {
  return (
    typeof value === "string" &&
    (LIMIT_KEYS as readonly string[]).includes(value)
  );
}

function parseRaw(text: string): RawRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "invalid" };
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.limits)) {
    return { kind: "invalid" };
  }
  const stored = parsed.limits;
  const limits = allOn();
  for (const key of LIMIT_KEYS) {
    const value = stored[key];
    if (typeof value !== "boolean") return { kind: "invalid" };
    limits[key] = value;
  }
  return { kind: "ok", limits, root: parsed };
}

function readRaw(filePath: string): RawRead {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "missing" };
    return {
      kind: "unreadable",
      reason: typeof code === "string" ? code : "UNKNOWN",
    };
  }
  return parseRaw(text);
}

/** Classify `sharing-limits.json` in `dir` (the sharing directory). */
export function readLimitsFile(dir: string): LimitsRead {
  const result = readRaw(path.join(dir, LIMITS_FILE_NAME));
  if (result.kind === "ok") return { kind: "ok", limits: result.limits };
  return result;
}

/** The five effective limits: every one on unless the file positively says `false`. */
export function readEffectiveLimits(dir: string): Limits {
  const result = readLimitsFile(dir);
  return result.kind === "ok" ? result.limits : allOn();
}

/**
 * Set one limit under the lock file, reading inside the lock. A missing or
 * invalid file is replaced with every other limit restricted; an unreadable
 * one is refused with its bytes untouched.
 *
 * @param dir - Sharing directory (`userData`); created if missing.
 * @param key - One of the five limit keys.
 * @param value - `true` restricts, `false` allows.
 * @param options - Retry overrides (defaults 200 attempts at 25 ms).
 */
export async function setLimit(
  dir: string,
  key: LimitKey,
  value: boolean,
  options: FileLockOptions = {},
): Promise<SetLimitOutcome> {
  if (!isLimitKey(key) || typeof value !== "boolean") {
    return { kind: "invalid-input" };
  }
  const filePath = path.join(dir, LIMITS_FILE_NAME);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const locked = await withFileLock(
      filePath,
      options,
      (): SetLimitOutcome => {
        const current = readRaw(filePath);
        if (current.kind === "unreadable") return current;
        const root = current.kind === "ok" ? current.root : { version: 1 };
        const stored =
          current.kind === "ok" ? (root.limits as Record<string, unknown>) : {};
        const baseline: Record<string, unknown> =
          current.kind === "ok" ? stored : { ...allOn() };
        const next = {
          ...root,
          version: 1,
          limits: { ...baseline, [key]: value },
        };
        writeAtomically(filePath, `${JSON.stringify(next, null, 2)}\n`);
        return { kind: "ok" };
      },
    );
    return locked.acquired ? locked.value : { kind: "lock-not-acquired" };
  } catch {
    return { kind: "write-failed" };
  }
}
