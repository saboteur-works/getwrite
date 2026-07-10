// Last Updated: 2026-07-08

/**
 * @module tenant-path
 *
 * Pure, fail-closed helpers for deriving a per-user data root path
 * (ADR-018: Tenant Resolution — Per-User Data Root).
 *
 * This module owns exactly two responsibilities:
 * - Validating a `userId` against a strict allowlist charset
 *   (`^[A-Za-z0-9_-]{1,64}$`) before it is ever joined into a filesystem
 *   path. The allowlist admits no `.`, `/`, `\`, null bytes, Unicode, or
 *   empty string — so `..`-style traversal, absolute-path injection, and
 *   embedded-separator attacks are impossible *by construction*, not by
 *   pattern-matching known-bad inputs.
 * - Reading `GETWRITE_DATA_ROOT`, the base directory under which each
 *   validated user's isolated data root lives. Unlike
 *   `GETWRITE_PROJECTS_DIR` (see `projects-dir.ts`), which falls back to a
 *   cwd-relative default when unset, `GETWRITE_DATA_ROOT` has **no
 *   fallback**: per FR12, if it is absent or empty, resolution must fail
 *   loudly rather than silently placing a signed-in user's data in the
 *   shared/legacy `projects/` directory.
 *
 * Both failure modes above throw {@link TenantResolutionError}, a typed,
 * identifiable error so callers (and tests) can distinguish "this request
 * is not tenant-safe" from an arbitrary runtime error.
 *
 * This module is intentionally pure: no filesystem I/O, no `Request`
 * handling, no imports beyond `node:path`. Composition with an
 * `IdentitySource` and directory provisioning happens one layer up, in
 * `resolveTenant` (see the tenant-resolution feature plan).
 */
import path from "node:path";

/**
 * Identifies which fail-closed rule tripped, for callers that want to
 * branch on the failure reason without string-matching the message.
 *
 * - `invalid-user-id`: the supplied `userId` failed the allowlist charset
 *   check (FR7).
 * - `missing-data-root`: `GETWRITE_DATA_ROOT` was absent or empty (FR12).
 */
export type TenantResolutionErrorReason =
  | "invalid-user-id"
  | "missing-data-root";

/**
 * Typed, identifiable error thrown by every fail-closed check in this
 * module. Callers and tests can distinguish this from a generic `Error`
 * via `instanceof TenantResolutionError`, and can branch on `reason` when
 * they need to distinguish the allowlist rejection from the missing-config
 * case.
 */
export class TenantResolutionError extends Error {
  readonly reason: TenantResolutionErrorReason;

  constructor(reason: TenantResolutionErrorReason, message: string) {
    super(message);
    this.name = "TenantResolutionError";
    this.reason = reason;
  }
}

/**
 * The allowlist charset a `userId` must match in its entirety: 1-64
 * characters, each a **lowercase** ASCII letter, digit, underscore, or
 * hyphen.
 *
 * This charset excludes `.` (so `..` traversal is unrepresentable), `/`
 * and `\` (so no path separator can be embedded), null bytes, Unicode
 * (no homoglyph/normalization ambiguity), and the empty string.
 *
 * Uppercase is deliberately excluded so the `userId`→directory mapping is
 * injective on **any** filesystem: on a case-insensitive filesystem
 * (default macOS APFS, Windows NTFS) `Alice` and `alice` would join to the
 * same on-disk directory and cross a tenant boundary. Restricting the
 * allowlist to a single case means no two valid `userId`s can case-fold to
 * the same path, so distinct tenants always get distinct directories
 * regardless of the host FS. A source whose native identifier contains
 * uppercase (or any other out-of-charset character) is responsible for
 * mapping it to a conforming `userId` at its own boundary (FR7).
 */
const USER_ID_PATTERN = /^[a-z0-9_-]{1,64}$/;

/**
 * Validates a `userId` against the allowlist charset described above.
 *
 * Returns `userId` unchanged when it matches; otherwise throws
 * {@link TenantResolutionError} with reason `"invalid-user-id"`. This is
 * the centralized path-traversal guard required by FR7 — every non-null
 * `userId` must pass through here before it is joined into a filesystem
 * path.
 *
 * @param userId - The candidate user identifier to validate.
 * @returns The same `userId`, unchanged, when valid.
 * @throws {TenantResolutionError} When `userId` does not match
 *   `^[a-z0-9_-]{1,64}$`.
 */
export function validateUserId(userId: string): string {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new TenantResolutionError(
      "invalid-user-id",
      `Invalid userId: must match ${USER_ID_PATTERN.toString()}`,
    );
  }
  return userId;
}

/**
 * Resolves the base directory under which each validated user's isolated
 * data root is created, read from `GETWRITE_DATA_ROOT`.
 *
 * Deliberately fail-closed (FR12): unlike `defaultProjectsDir()` in
 * `projects-dir.ts`, which falls back to `cwd/../projects` when its env
 * var is unset, this function has **no fallback**. When
 * `GETWRITE_DATA_ROOT` is absent or set to an empty string, it throws
 * rather than silently resolving to the shared/legacy projects directory —
 * a signed-in user's data must never land there by accident.
 *
 * @returns The value of `GETWRITE_DATA_ROOT`.
 * @throws {TenantResolutionError} When `GETWRITE_DATA_ROOT` is unset or
 *   empty.
 */
export function dataRootBase(): string {
  const value = process.env.GETWRITE_DATA_ROOT;
  if (value === undefined || value === "") {
    throw new TenantResolutionError(
      "missing-data-root",
      "GETWRITE_DATA_ROOT is not set; refusing to resolve a tenant data root",
    );
  }
  return value;
}

/**
 * Derives the isolated data root path for a given user:
 * `<dataRootBase()>/<validateUserId(userId)>`.
 *
 * Composes both fail-closed checks above — a missing/empty
 * `GETWRITE_DATA_ROOT` and an invalid `userId` each throw
 * {@link TenantResolutionError} before any path is constructed.
 *
 * @param userId - The user identifier to derive a data root for.
 * @returns The absolute (or otherwise base-relative) path to the user's
 *   isolated data root.
 * @throws {TenantResolutionError} Via {@link dataRootBase} or
 *   {@link validateUserId}.
 */
export function dataRootForUser(userId: string): string {
  return path.join(dataRootBase(), validateUserId(userId));
}
