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
 * Imports from the leaf `crypto/locked-errors.ts` (no imports, no `node:`
 * built-ins) so a client hook can use the predicate; `adapter-selection.ts`
 * imports `../io` and is server-only.
 */
import {
  MissingProjectKeyError,
  ProjectLockedError,
  isLockedAccessError,
} from "./crypto/locked-errors";

export { ProjectLockedError, MissingProjectKeyError, isLockedAccessError };
