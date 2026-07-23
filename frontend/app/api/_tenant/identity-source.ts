// Last Updated: 2026-07-22

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
 * without even reading request headers) unless that variable is set.
 *
 * `betterAuthIdentitySource` (Slice 6, FR7) is the real production
 * mechanism: it reads GetWrite's better-auth server session for the inbound
 * request (`src/lib/auth/auth-server.ts`'s `getAuthServer()`) and resolves
 * it to the session's user id, or `null` when there is no valid session.
 * {@link getIdentitySource} selects it in place of the dev source whenever
 * hosted auth is active (`isHostedAuthActive()`), per FR7's precedence rule
 * — see that function's doc for the exact ordering and why it is a security
 * boundary, not just a default.
 *
 * As of Slice 6 (FR8), `IdentitySource.getUserId` is **async-capable**:
 * `string | null | Promise<string | null>`. This was anticipated by
 * ADR-018 specifically so a real session-store-backed source —
 * `betterAuthIdentitySource`, whose session read is inherently
 * asynchronous — could be added without reshaping this interface a second
 * time. `devIdentitySource` and `nullIdentitySource` are unaffected: a sync
 * `string | null` return already satisfies the widened type, so neither
 * needed any code change. `resolveTenant` (`resolve-tenant.ts`) `await`s
 * whatever `getUserId` returns, so callers never have to know which
 * concrete source — sync or async — is currently active.
 */
import { isHostedAuthActive } from "../../../src/lib/auth/auth-config";
import { getAuthServer } from "../../../src/lib/auth/auth-server";

/**
 * The pluggable identity seam. Given an inbound request, returns the
 * claimed `userId`, or `null` when the request carries no identity (no
 * account — the legacy/local-first path). May return the value directly or
 * as a `Promise` (see the module doc's FR8 note) — callers must always
 * `await` the result.
 *
 * Implementations must be swappable for one another without any caller
 * (`resolveTenant`, `withStorageContext`) changing: this is the interface
 * the real auth provider (`betterAuthIdentitySource`) implements alongside
 * {@link devIdentitySource} and the null default.
 */
export interface IdentitySource {
  /**
   * Extracts the claimed `userId` from `request`, or resolves to `null`
   * when the request carries no identity. May return synchronously
   * (`devIdentitySource`, the null default) or asynchronously
   * (`betterAuthIdentitySource`, which awaits a session-store read) — the
   * union return type accommodates both without forcing every
   * implementation to be `async`.
   *
   * Implementations must not validate or sanitize the returned value
   * against the tenant path-traversal allowlist — that is
   * `tenant-path.ts`'s responsibility one layer up. This method's only job
   * is extracting a raw identity claim.
   */
  getUserId(request: Request): string | null | Promise<string | null>;
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
 * The production `IdentitySource` implementation (Slice 6, FR7): reads
 * GetWrite's better-auth server session for the inbound request and
 * resolves it to the session's user id, or `null` when there is no valid
 * session.
 *
 * **Session read.** Delegates to `getAuthServer().api.getSession({ headers:
 * request.headers })` — confirmed, against the installed
 * `better-auth@1.6.24` types (`node_modules/better-auth/dist/api/routes/
 * session.d.mts`), to be a `StrictEndpoint` with `requireHeaders: true`
 * that resolves to `{ session, user } | null`. The user's id lives at
 * `user.id` (a lowercase UUID string, per `auth-server.ts`'s
 * `advanced.database.generateId: "uuid"` config — see FR6), which is the
 * value this method returns.
 *
 * **"No session" vs. a genuine error — this distinction is load-bearing.**
 * better-auth signals "no session" by *resolving* `getSession(...)` to
 * `null`, not by throwing — so that is the only case mapped to this
 * method's `null` return. Any other rejection (a thrown error — e.g. a
 * genuine Postgres connectivity failure) is deliberately **not** caught
 * here and propagates to the caller. Swallowing an unexpected error into
 * `null` would silently degrade "the database is down" into "this request
 * is unauthenticated," which is the wrong failure mode for a seam that
 * gates access to tenant data (`withStorageContext`, Task 4, returns 401
 * for a `null` userId) — a real backend error should surface as a real
 * error (a 500), not a false-negative 401.
 *
 * **No path/allowlist validation here.** Per this module's documented
 * `IdentitySource` contract, the returned id is an unvalidated raw
 * identity claim; `tenant-path.ts` (one layer up, via `resolveTenant`)
 * remains solely responsible for validating it against the tenant
 * path-traversal allowlist before it is ever used as a filesystem path
 * segment.
 *
 * **Selection.** Callers never construct this directly — {@link
 * getIdentitySource} is the sole place that decides when to hand it out
 * (whenever `isHostedAuthActive()` is `true`; see that function's doc for
 * the precedence rule).
 */
export const betterAuthIdentitySource: IdentitySource = {
  async getUserId(request: Request): Promise<string | null> {
    const result = await getAuthServer().api.getSession({
      headers: request.headers,
    });
    return result === null ? null : result.user.id;
  },
};

/**
 * Returns the currently configured `IdentitySource` — the single authority
 * for whether any request may assert an identity at all.
 *
 * **Precedence (Slice 6, FR7).** In order:
 * 1. `isHostedAuthActive()` is `true` → {@link betterAuthIdentitySource},
 *    **unconditionally** — even if `GETWRITE_ENABLE_DEV_IDENTITY` also
 *    happens to be set. This is a deliberate security boundary, not just a
 *    convenience default: a hosted deployment must never be able to fall
 *    through to the dev-header source via a stray/forgotten env var, so
 *    hosted-auth-active always wins regardless of the dev flag's state.
 * 2. Otherwise, `GETWRITE_ENABLE_DEV_IDENTITY` is set → {@link
 *    devIdentitySource} (unchanged from the pre-Slice-6 behavior, including
 *    the one-time activation warning below).
 * 3. Otherwise → {@link nullIdentitySource}, the default.
 *
 * This function is also the single swap point for any future identity
 * mechanism: add a branch here (or replace one), and no caller of
 * `getIdentitySource()` needs to change.
 *
 * Both the hosted-auth check and the dev-flag env var are read fresh on
 * every call (not cached at module load) so either can be toggled per-test
 * or per-deployment-state.
 */
export function getIdentitySource(): IdentitySource {
  if (isHostedAuthActive()) {
    return betterAuthIdentitySource;
  }

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
