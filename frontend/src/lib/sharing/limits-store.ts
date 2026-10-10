/**
 * Server-side reader for `sharing-limits.json` (Feature 77, FR-5, FR-6, FR-10).
 * The file holds five booleans, `true` meaning restricted. A limit is off only
 * when the file positively says `false`; a missing, unparseable, mistyped,
 * other-version or unreadable file, or an unset sharing directory, means every
 * limit is on. The file is read on every call with no cache. The desktop main
 * process writes the same format with its own code; the shared fixtures in
 * `frontend/tests/fixtures/sharing/` keep the two readers in agreement.
 * File contents are never logged.
 */
import fs from "node:fs";
import path from "node:path";
import { readSharingEnv, type EnvLike } from "./sharing-env";

export const LIMITS_FILE_NAME = "sharing-limits.json";

const LIMIT_KEYS = [
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
  | { kind: "unreadable"; reason: string }
  | { kind: "unconfigured" };

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

/** Parse file text: `ok` only when version is 1 and all five entries are booleans. */
export function parseLimits(
  text: string,
): { kind: "ok"; limits: Limits } | { kind: "invalid" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "invalid" };
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.limits)) {
    return { kind: "invalid" };
  }
  const limits = allOn();
  for (const key of LIMIT_KEYS) {
    const value = parsed.limits[key];
    if (typeof value !== "boolean") return { kind: "invalid" };
    limits[key] = value;
  }
  return { kind: "ok", limits };
}

/** Classify the limits file in the directory named by `GETWRITE_SHARING_DIR`. */
export function readLimitsFile(env: EnvLike): LimitsRead {
  const { sharingDir } = readSharingEnv(env);
  if (sharingDir === undefined) return { kind: "unconfigured" };
  let text: string;
  try {
    text = fs.readFileSync(path.join(sharingDir, LIMITS_FILE_NAME), "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "missing" };
    return {
      kind: "unreadable",
      reason: typeof code === "string" ? code : "UNKNOWN",
    };
  }
  return parseLimits(text);
}

/** The five effective limits, read fresh: every one on unless the file says `false`. */
export function readLimits(env: EnvLike): Limits {
  const result = readLimitsFile(env);
  return result.kind === "ok" ? result.limits : allOn();
}
