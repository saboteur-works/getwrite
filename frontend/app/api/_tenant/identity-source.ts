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

/** The dev-only request header `devIdentitySource` reads. */
const DEV_USER_HEADER = "x-getwrite-dev-user";

/**
 * Tracks whether the one-time activation warning has already been emitted
 * for the current activation of `GETWRITE_ENABLE_DEV_IDENTITY`.
 *
 * Deliberately module-level mutable state owned by {@link getIdentitySource}
 * — the single place the env flag is read. It suppresses repeat warnings
 * within one activation and is reset whenever `getIdentitySource` observes
 * the flag unset, so a genuine off→on toggle re-warns on the next
 * activation. Because `getIdentitySource` runs on every request (via
 * `resolveTenant`), that reset is reachable through the real call path, not
 * only from tests.
 */
let hasWarnedForActivation = false;

/**
 * The interim `IdentitySource` implementation (ADR-018's "interim identity
 * source"): a dev-only stub, **not production authentication**.
 *
 * This is a **pure** header read with no env gating of its own: it returns
 * the dev-only `x-getwrite-dev-user` request header value, or `null` when
 * that header is absent or empty. The returned value is an unvalidated
 * identity claim; callers must run it through `tenant-path.ts`'s allowlist
 * guard before using it as a filesystem path segment.
 *
 * The activation gate (the `GETWRITE_ENABLE_DEV_IDENTITY` flag and the
 * one-time warning) lives solely in {@link getIdentitySource}, which only
 * hands out this source when the flag is set — so there is exactly one
 * env-flag check and one authoritative security boundary, not two.
 */
export const devIdentitySource: IdentitySource = {
  getUserId(request: Request): string | null {
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
 * Returns the currently configured `IdentitySource` — the single authority
 * for whether any request may assert an identity at all.
 *
 * This is also the single swap point for the future real auth-backed
 * implementation: replace this function's body to return the real source
 * (unconditionally, or behind its own gating), and no caller of
 * `getIdentitySource()` needs to change.
 *
 * The env var is read fresh on every call (not cached at module load) so it
 * can be toggled per-test. Presently: returns {@link devIdentitySource}
 * when `GETWRITE_ENABLE_DEV_IDENTITY` is set — emitting a single loud
 * activation `console.warn` per activation — and otherwise a null source
 * whose `getUserId` always returns `null`.
 */
export function getIdentitySource(): IdentitySource {
  if (!process.env.GETWRITE_ENABLE_DEV_IDENTITY) {
    hasWarnedForActivation = false;
    return nullIdentitySource;
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

  return devIdentitySource;
}
