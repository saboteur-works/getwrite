// Last Updated: 2026-07-22

import "server-only";

import { betterAuth, type Auth } from "better-auth";
import { Pool } from "pg";
import { isHostedAuthActive } from "./auth-config";

/**
 * @module auth-server
 *
 * Builds and memoizes the `betterAuth(...)` server instance for GetWrite's
 * hosted authentication path (Slice 6, `specs/features/auth-provider.md`).
 *
 * This module owns the *only* place a `pg.Pool` is constructed for auth
 * purposes, and the only place `betterAuth(...)` is called. It mirrors
 * `app/api/_tenant/storage-backend.ts`'s `cachedObjectStoreAdapter` idiom:
 * the instance is expensive to build (it opens a Postgres connection pool)
 * and stateless across requests, so it is built lazily on first use and
 * reused for the lifetime of the process, with a `__resetAuthServerForTests()`
 * hook so tests can force a fresh build after toggling env.
 *
 * **Lazy, gated construction is the FR5/FR10 guarantee made mechanical.**
 * {@link getAuthServer} throws {@link AuthServerNotActiveError} — without
 * constructing a `Pool` or calling `betterAuth(...)` at all — when
 * {@link isHostedAuthActive} is `false`. Callers (the future better-auth
 * `IdentitySource`, the `/api/auth/[...all]` route handler) are responsible
 * for checking `isHostedAuthActive()` themselves before calling this
 * function; this function's own guard exists as defense in depth, not as
 * the primary gate — it is what makes "no Postgres connection is ever
 * attempted when hosted auth is inactive" true even if a caller forgets the
 * check, rather than merely a documented expectation.
 *
 * **Config shape, verified against the installed `better-auth@1.6.24` /
 * `@better-auth/core@1.6.24` type definitions** (not just the spec's
 * snippet — see `node_modules/.../@better-auth/core/dist/types/init-options.d.mts`):
 * - `database`: `BetterAuthOptions["database"]` accepts a `pg.Pool`
 *   (matched by its `PostgresPool` member) directly — no explicit Kysely
 *   dialect wrapper is required in this version. better-auth detects the
 *   Postgres dialect from the pool itself.
 * - `advanced.database.generateId`: confirmed as the exact key path; `"uuid"`
 *   is a supported literal (alongside a custom function, `false`, and
 *   `"serial"`), matching FR6's requirement to mint lowercase UUIDs that
 *   satisfy the tenant directory allowlist.
 * - `rateLimit.storage`: confirmed as `"memory" | "database" |
 *   "secondary-storage"`; `"database"` is used per FR16.
 * - `session.cookieCache`: confirmed shape — `{ enabled, maxAge, strategy,
 *   refreshCache }`. This module enables it with better-auth's documented
 *   default `maxAge` (5 minutes) so the future `IdentitySource` session read
 *   (Task 3) does not require a Postgres round-trip on every request, per
 *   FR17.
 *
 * No divergence from the spec's snippet was found: the installed v1.6.24
 * API matches the spec's intent (and key paths) exactly for every option
 * this task configures.
 *
 * **Email callbacks are stubbed for this task.** `sendResetPassword` and
 * `sendVerificationEmail` are seams Task 2 replaces with a real
 * `nodemailer` SMTP transport (FR14). For now they throw
 * {@link AuthEmailNotConfiguredError} so any code path that reaches them
 * before Task 2 lands fails loudly instead of silently dropping an email.
 */

/** Raised by {@link getAuthServer} when hosted auth is not active. */
export class AuthServerNotActiveError extends Error {
  constructor() {
    super(
      "getAuthServer() was called while hosted auth is inactive. Callers " +
        "must check isHostedAuthActive() before calling getAuthServer() — " +
        "this error is a defense-in-depth guard, not the primary gate.",
    );
    this.name = "AuthServerNotActiveError";
  }
}

/**
 * Raised by the stubbed `sendResetPassword`/`sendVerificationEmail`
 * callbacks. Task 2 replaces these stubs with a real `nodemailer` SMTP
 * transport (FR14); until then, any code path that actually triggers a
 * password-reset or verification email fails loudly rather than silently
 * dropping the email.
 */
export class AuthEmailNotConfiguredError extends Error {
  constructor(kind: "reset-password" | "verification") {
    super(
      `better-auth attempted to send a ${kind} email, but the nodemailer ` +
        "SMTP transport is not yet wired in (seam for Task 2 of the " +
        "auth-provider plan). See src/lib/auth/auth-server.ts.",
    );
    this.name = "AuthEmailNotConfiguredError";
  }
}

/**
 * Placeholder `sendResetPassword` callback (FR13/FR14 seam). Task 2 replaces
 * this with a `nodemailer`-backed implementation.
 */
async function sendResetPasswordPlaceholder(): Promise<void> {
  throw new AuthEmailNotConfiguredError("reset-password");
}

/**
 * Placeholder `sendVerificationEmail` callback (FR11/FR14 seam). Task 2
 * replaces this with a `nodemailer`-backed implementation.
 */
async function sendVerificationEmailPlaceholder(): Promise<void> {
  throw new AuthEmailNotConfiguredError("verification");
}

/**
 * The type of the object `betterAuth(...)` returns for this module's exact
 * options shape. Exported so downstream modules (the future
 * `IdentitySource`, the route handler) can type a reference to the server
 * instance without re-deriving it from `betterAuth` themselves.
 *
 * Deliberately typed against `ReturnType<typeof buildAuthOptions>` rather
 * than the bare `Auth<BetterAuthOptions>` default: `betterAuth`'s return
 * type is generic over the exact options object passed in (it narrows
 * `emailAndPassword`, `advanced`, etc. to their literal shapes), and
 * `Auth<T>` is not covariant enough for a `Auth<OurOptions>` instance to
 * widen to `Auth<BetterAuthOptions>` — so this alias must track the real
 * options shape instead of the generic default.
 */
export type AuthServerInstance = Auth<ReturnType<typeof buildAuthOptions>>;

/**
 * Process-wide `betterAuth(...)` instance, built lazily on first call to
 * {@link getAuthServer}. Memoized because building it opens a Postgres
 * connection pool (`pg.Pool`) — an expensive, stateful resource that must
 * not be recreated per request.
 */
let cachedAuthServer: AuthServerInstance | null = null;

/**
 * Test-only hook to clear the memoized auth server instance, so a test that
 * toggles the hosted-auth env observes a fresh build (or a fresh throw) on
 * its next {@link getAuthServer} call.
 */
export function __resetAuthServerForTests(): void {
  cachedAuthServer = null;
}

/**
 * Resolves `BETTER_AUTH_URL`, better-auth's `baseURL` option.
 *
 * Unlike `isHostedAuthActive()`'s hard-required env vars, `BETTER_AUTH_URL`
 * has a sensible local default so a developer who has set `DATABASE_URL`
 * and `BETTER_AUTH_SECRET` (e.g. to run the live smoke test locally against
 * a docker-compose Postgres) is not also forced to set the base URL by
 * hand. Mirrors `projects-dir.ts`'s `defaultProjectsDir()` env-with-fallback
 * pattern: check the env var first, fall back to a documented default
 * otherwise. Real deployments (hosted and self-host) must still set
 * `BETTER_AUTH_URL` explicitly per FR23 — the fallback here is a local-dev
 * convenience, not a production-safe default.
 */
function resolveBaseUrl(): string {
  const configured = process.env.BETTER_AUTH_URL;
  return configured && configured.trim().length > 0
    ? configured
    : "http://localhost:3000";
}

/**
 * Builds the `betterAuth(...)` options object. Split out from
 * {@link getAuthServer} so the config shape can be exercised without a real
 * Postgres connection: constructing this object does not itself open the
 * pool's first connection (a `pg.Pool` connects lazily, on first query).
 */
function buildAuthOptions() {
  const databaseUrl = process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!databaseUrl || !secret) {
    // Unreachable in practice — getAuthServer() only calls this after
    // isHostedAuthActive() has confirmed both are set — but keeps this
    // function correct in isolation rather than trusting the caller.
    throw new AuthServerNotActiveError();
  }

  return {
    database: new Pool({ connectionString: databaseUrl }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      disableSignUp: true,
      sendResetPassword: sendResetPasswordPlaceholder,
    },
    emailVerification: {
      sendVerificationEmail: sendVerificationEmailPlaceholder,
    },
    advanced: { database: { generateId: "uuid" as const } },
    rateLimit: { storage: "database" as const },
    session: { cookieCache: { enabled: true } },
    secret,
    baseURL: resolveBaseUrl(),
  };
}

/**
 * Returns the process-wide {@link AuthServerInstance}, building it lazily on
 * first call and memoizing it thereafter.
 *
 * @throws {AuthServerNotActiveError} When {@link isHostedAuthActive} is
 *   `false` — no `Pool` is constructed and `betterAuth(...)` is never
 *   called.
 */
export function getAuthServer(): AuthServerInstance {
  if (!isHostedAuthActive()) {
    throw new AuthServerNotActiveError();
  }

  if (!cachedAuthServer) {
    cachedAuthServer = betterAuth(buildAuthOptions());
  }

  return cachedAuthServer;
}
