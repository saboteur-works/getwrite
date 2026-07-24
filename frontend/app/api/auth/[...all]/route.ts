// Last Updated: 2026-07-22

import { toNextJsHandler } from "better-auth/next-js";
import { isHostedAuthActive } from "../../../../src/lib/auth/auth-config";
import { getAuthServer } from "../../../../src/lib/auth/auth-server";

/**
 * @module route
 *
 * `/api/auth/[...all]` — the better-auth catch-all route handler (FR1,
 * `specs/features/auth-provider.md`). Mounts every better-auth endpoint
 * (sign-up, sign-in, sign-out, session, email verification, password reset,
 * etc.) behind the standard better-auth Next.js App Router integration.
 *
 * **Not a tenant-data route.** Unlike every route under `app/api/project*`,
 * `app/api/resource*`, etc., this route is intentionally *not* wrapped in
 * `withStorageContext` — it has nothing to do with `resolveTenant`/
 * `StorageContext`, and FR9 explicitly carves it out: "Auth API routes
 * themselves... remain reachable without an existing session." better-auth
 * manages its own session/CSRF concerns internally for these endpoints.
 *
 * **Inactive-path behavior (FR5/FR10 made mechanical for this route).** When
 * hosted auth is not configured (`isHostedAuthActive()` is `false` —
 * desktop/local, or a hosted deployment that simply hasn't set
 * `DATABASE_URL`/`BETTER_AUTH_SECRET`), every exported method responds `404`
 * without calling {@link getAuthServer} or `toNextJsHandler` at all — no
 * Postgres connection is attempted and no better-auth code path runs. `404`
 * is the chosen response because, in this deployment mode, the route
 * genuinely doesn't exist: it's not a config-error 500 (nothing is
 * misconfigured — hosted auth is simply off by design) and not a 401
 * (401 implies an auth *system* that exists but rejected the caller, which
 * FR9 reserves for tenant-data routes with a missing session — a different
 * concept from "this deployment has no auth system at all").
 *
 * **Handler is not memoized here.** `getAuthServer()` itself is already
 * memoized (`auth-server.ts`), and `toNextJsHandler(...)` is a cheap object
 * literal factory (five closures capturing the passed-in auth instance) —
 * re-calling it per request costs far less than the alternative of adding a
 * second memoization layer this module would have to reset in lockstep with
 * `auth-server.ts`'s own `__resetAuthServerForTests()`. Each exported method
 * below calls `toNextJsHandler(getAuthServer())` fresh and immediately
 * invokes the corresponding method.
 */

const NOT_FOUND = new Response(null, { status: 404 });

/** GET — session reads, OAuth callbacks (unused in this slice), etc. */
export async function GET(request: Request): Promise<Response> {
  if (!isHostedAuthActive()) return NOT_FOUND;
  return toNextJsHandler(getAuthServer()).GET(request);
}

/** POST — sign-up, sign-in, sign-out, password reset, email verification, etc. */
export async function POST(request: Request): Promise<Response> {
  if (!isHostedAuthActive()) return NOT_FOUND;
  return toNextJsHandler(getAuthServer()).POST(request);
}

/** PATCH — better-auth endpoints that support partial updates. */
export async function PATCH(request: Request): Promise<Response> {
  if (!isHostedAuthActive()) return NOT_FOUND;
  return toNextJsHandler(getAuthServer()).PATCH(request);
}

/** PUT — better-auth endpoints that support full replacement. */
export async function PUT(request: Request): Promise<Response> {
  if (!isHostedAuthActive()) return NOT_FOUND;
  return toNextJsHandler(getAuthServer()).PUT(request);
}

/** DELETE — better-auth endpoints that support deletion (e.g. session revocation). */
export async function DELETE(request: Request): Promise<Response> {
  if (!isHostedAuthActive()) return NOT_FOUND;
  return toNextJsHandler(getAuthServer()).DELETE(request);
}
