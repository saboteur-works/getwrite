// Last Updated: 2026-09-17

/**
 * @module locked-access
 *
 * Shared predicate for recognizing a "locked access" failure — a project that
 * cannot be opened right now because it is encrypted and either the workspace
 * is locked ({@link ProjectLockedError}) or the keyring holds no key for it
 * ({@link MissingProjectKeyError}). Both are raised by
 * {@link resolveProjectAdapter} (`crypto/adapter-selection.ts`), re-exported
 * here so callers across `lib/models/` do not need to reach into `crypto/`
 * directly.
 *
 * Deliberately excludes `ProjectMarkerFormatError`: a corrupt or unreadable
 * marker means the project is damaged, not locked, and callers must let it
 * keep propagating uncaught rather than folding it into "locked" handling.
 *
 * Imports from `crypto/adapter-selection.ts` directly rather than via
 * `workspace-adapter.ts` or `io.ts` — `adapter-selection.ts` already imports
 * from `../io`, so importing these errors via `io.ts` would create an import
 * cycle.
 */
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "./crypto/adapter-selection";

export { ProjectLockedError, MissingProjectKeyError };

/**
 * Type guard identifying a "locked access" failure — a project blocked from
 * being read or written because it is encrypted and inaccessible right now,
 * as opposed to damaged.
 *
 * @param error - The value to test, typically caught from a project I/O call.
 * @returns `true` when `error` is a {@link ProjectLockedError} or
 *   {@link MissingProjectKeyError}.
 */
export function isLockedAccessError(
  error: unknown,
): error is ProjectLockedError | MissingProjectKeyError {
  return (
    error instanceof ProjectLockedError ||
    error instanceof MissingProjectKeyError
  );
}
