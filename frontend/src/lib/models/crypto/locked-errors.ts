// Last Updated: 2026-11-04

/**
 * @module crypto/locked-errors
 *
 * The two "locked access" error classes and their predicate, in a leaf module
 * with no imports. Client code (hooks, components) imports from here, or from
 * `locked-access.ts`, which re-exports it; `adapter-selection.ts` imports
 * `io.ts` (`node:fs/promises`) and must not be reachable from a client bundle.
 * `adapter-selection.ts` re-exports the classes, so `instanceof` identity is
 * unchanged for server callers.
 */

/**
 * Raised when a project is encrypted but no unlocked keyring is available.
 *
 * Distinct from {@link MissingProjectKeyError}: this is the ordinary "the user
 * has not unlocked yet" state, and the correct response is to prompt.
 */
export class ProjectLockedError extends Error {
  constructor(projectId: string) {
    super(
      `Project "${projectId}" is encrypted and the workspace is locked. Unlock to continue.`,
    );
    this.name = "ProjectLockedError";
  }
}

/**
 * Raised when a project is encrypted, the keyring is unlocked, and it still has
 * no data key for that project.
 *
 * This is not a "please unlock" state — it means the key is genuinely absent
 * (a project copied in from another workspace, or a keyring restored from an
 * older backup), and no passphrase entry will fix it.
 */
export class MissingProjectKeyError extends Error {
  constructor(projectId: string) {
    super(
      `Project "${projectId}" is encrypted but the keyring holds no data key for it. Its files cannot be opened with this keyring.`,
    );
    this.name = "MissingProjectKeyError";
  }
}

/**
 * Type guard identifying a "locked access" failure: a project blocked from
 * being read or written because it is encrypted and inaccessible right now,
 * as opposed to damaged. Excludes `ProjectMarkerFormatError`.
 */
export function isLockedAccessError(
  error: unknown,
): error is ProjectLockedError | MissingProjectKeyError {
  return (
    error instanceof ProjectLockedError ||
    error instanceof MissingProjectKeyError
  );
}
