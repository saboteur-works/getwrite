// Last Updated: 2026-07-10

/**
 * @module identity-source
 *
 * The pluggable identity seam for tenant resolution (ADR-018: Tenant
 * Resolution — Per-User Data Root).
 *
 * `IdentitySource` is the single interface every identity mechanism —
 * interim or real — must implement so `resolveTenant` (one layer up) never
 * has to change when the identity mechanism does. This module owns exactly
 * one responsibility: extracting a `userId` claim from an inbound
 * `Request`. It has no knowledge of path validation, filesystem paths, or
 * provisioning — that belongs to `src/lib/models/tenant-path.ts` and
 * `resolve-tenant.ts`.
 *
 * `devIdentitySource` is an **interim dev/testing mechanism only — not
 * production auth**. It is gated behind a single environment variable,
 * `GETWRITE_ENABLE_DEV_IDENTITY`, and is inert (always returns `null`,
 * without even reading request headers) unless that variable is set. Per
 * FR3/FR4, it must be swappable for a future real-auth-backed
 * implementation without changing this interface's shape or
 * `resolveTenant`'s call site.
 */

/**
 * The pluggable identity seam. Given an inbound request, returns the
 * claimed `userId`, or `null` when the request carries no identity (no
 * account — the legacy/local-first path).
 *
 * Implementations must be swappable for one another without any caller
 * (`resolveTenant`, `withStorageContext`) changing: this is the interface
 * the future real auth provider implements to replace {@link
 * devIdentitySource}.
 */
export interface IdentitySource {
  /**
   * Extracts the claimed `userId` from `request`, or returns `null` when
   * the request carries no identity.
   *
   * Implementations must not validate or sanitize the returned value
   * against the tenant path-traversal allowlist — that is
   * `tenant-path.ts`'s responsibility one layer up. This method's only job
   * is extracting a raw identity claim.
   */
  getUserId(request: Request): string | null;
}

/** The dev-only request header `devIdentitySource` reads once activated. */
const DEV_USER_HEADER = "x-getwrite-dev-user";

/**
 * Tracks whether the one-time activation warning has already been emitted
 * for the current activation of `GETWRITE_ENABLE_DEV_IDENTITY`.
 *
 * Deliberately module-level mutable state, not a cached copy of the env
 * flag itself: `hasWarnedForActivation` only suppresses repeat warnings
 * within a single activation. The flag itself is still read fresh from
 * `process.env` on every call (see {@link devIdentitySource}), so tests
 * that toggle the env var between calls correctly re-trigger the warning
 * the next time the flag transitions from unset to set.
 */
let hasWarnedForActivation = false;

/**
 * The interim `IdentitySource` implementation (ADR-018's "interim identity
 * source"): a dev-only stub, **not production authentication**.
 *
 * Inert unless `GETWRITE_ENABLE_DEV_IDENTITY` is set to any non-empty
 * value, per FR4:
 * - When unset: `getUserId` returns `null` unconditionally and does not
 *   read the request's headers at all, so it is inert regardless of
 *   request content.
 * - When set: `getUserId` reads the dev-only `x-getwrite-dev-user` request
 *   header and returns its value, or `null` when the header is absent or
 *   empty. The returned value is an unvalidated identity claim; callers
 *   must run it through `tenant-path.ts`'s allowlist guard before using it
 *   as a filesystem path segment.
 *
 * The env var is read fresh on every call (not cached at module load), so
 * it can be toggled per-test. On activation (the first call observed while
 * the flag is set, or again after the flag has been toggled off and back
 * on), a single loud `console.warn` fires stating that dev identity is
 * enabled and that this is not production auth.
 */
export const devIdentitySource: IdentitySource = {
  getUserId(request: Request): string | null {
    if (!process.env.GETWRITE_ENABLE_DEV_IDENTITY) {
      hasWarnedForActivation = false;
      return null;
    }

    if (!hasWarnedForActivation) {
      hasWarnedForActivation = true;
      console.warn(
        "[getwrite] GETWRITE_ENABLE_DEV_IDENTITY is enabled: requests are " +
          `identified via the dev-only "${DEV_USER_HEADER}" header. This is ` +
          "NOT production authentication — do not enable this in a real " +
          "hosted deployment.",
      );
    }

    const headerValue = request.headers.get(DEV_USER_HEADER);
    return headerValue === null || headerValue === "" ? null : headerValue;
  },
};

/** An `IdentitySource` that never resolves an identity — the default. */
const nullIdentitySource: IdentitySource = {
  getUserId(): string | null {
    return null;
  },
};

/**
 * Returns the currently configured `IdentitySource`.
 *
 * This is the single swap point for the future real auth-backed
 * implementation: replace this function's body to return the real source
 * (unconditionally, or behind its own gating), and no caller of
 * `getIdentitySource()` needs to change.
 *
 * Presently: returns {@link devIdentitySource} when
 * `GETWRITE_ENABLE_DEV_IDENTITY` is set, otherwise a null source whose
 * `getUserId` always returns `null`.
 */
export function getIdentitySource(): IdentitySource {
  return process.env.GETWRITE_ENABLE_DEV_IDENTITY
    ? devIdentitySource
    : nullIdentitySource;
}
