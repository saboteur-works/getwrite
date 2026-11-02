// Last Updated: 2026-11-01

/**
 * @module goal-read-error
 *
 * Shared classification of a thrown read error for the writing-goal filter
 * cores (Feature 98, FR-17, FR-18; `docs/standards/failure-visibility.md`).
 *
 * Only a filesystem read problem is a known `unreadable` cause: a Node error
 * whose `code` is one of {@link FILE_READ_ERRNO_CODES}. Any other error,
 * including one that merely carries some string `code`, is not recognised, so
 * the caller rethrows it rather than reporting a hidden cause.
 *
 * A recognised `unreadable` error is logged server-side (code and message
 * only, never file content) because the result carries only the cause name.
 */
import { ZodError } from "zod";
import { isLockedAccessError } from "./locked-access";

/** Cause names shared by the membership and total results. */
export type GoalReadCause =
  | "locked"
  | "missing-sidecar"
  | "corrupt"
  | "unreadable";

/** Node errno codes that mean a stored file could not be read. */
export const FILE_READ_ERRNO_CODES: ReadonlySet<string> = new Set([
  "ENOENT",
  "ENOTDIR",
  "EISDIR",
  "EACCES",
  "EPERM",
  "EIO",
  "EMFILE",
  "ENFILE",
  "ELOOP",
  "ENAMETOOLONG",
]);

/** True when `err` is a Node filesystem error with a known read-problem code. */
export function isFileReadError(err: unknown): err is NodeJS.ErrnoException {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && FILE_READ_ERRNO_CODES.has(code);
}

/**
 * Map a thrown error to a read cause, or `null` when it is not recognised
 * (the caller rethrows). Locked-access, malformed stored data and file read
 * errors are recognised; a recognised file read error is logged.
 *
 * @param err - The thrown value.
 * @param scope - Short name of the calling core, used in the log line.
 */
export function classifyGoalReadError(
  err: unknown,
  scope: string,
): GoalReadCause | null {
  if (isLockedAccessError(err)) return "locked";
  if (err instanceof SyntaxError || err instanceof ZodError) return "corrupt";
  if (isFileReadError(err)) {
    console.error(`[${scope}] unreadable: ${err.code}: ${err.message}`);
    return "unreadable";
  }
  return null;
}
