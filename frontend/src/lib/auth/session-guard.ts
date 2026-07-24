// Last Updated: 2026-07-22

import "server-only";

import { isHostedAuthActive } from "./auth-config";
import { getAuthServer } from "./auth-server";

/**
 * @module session-guard
 *
 * The pure decision core behind `app/(app)/layout.tsx`'s page-route
 * protection (Slice 6, FR20).
 *
 * FR20 requires a server-side (Node runtime) session read that gates access
 * to the authenticated app shell — following this codebase's
 * `withStorageContext` wrapper pattern in spirit (a single seam every
 * protected surface routes through), but as a route-group **layout**
 * (`app/(app)/layout.tsx`) rather than a function wrapper, since page
 * navigation — unlike an API route — has no single exported handler
 * function to wrap. {@link shouldRedirectToLogin} is that decision's pure
 * core, split out of the layout component itself so it can be unit-tested
 * directly (constructing a real App Router server component render is not
 * practical in this repo's jsdom-based Vitest setup) — the layout stays a
 * thin wrapper that reads `next/headers`, calls this function, and calls
 * `redirect("/login")` from `next/navigation` when it resolves `true`.
 *
 * **Why this must run in the Node runtime, not Edge middleware.** better-auth
 * sessions here are database-backed (Postgres, via `getAuthServer()`), and
 * this repo's Edge runtime cannot open a Postgres connection the way a
 * server component running in the Node runtime can — this is FR20's own
 * stated rationale for using a Node-runtime layout instead of a new
 * `middleware.ts` (which this repo does not have and this slice does not
 * add).
 */

/**
 * Decides whether a request to the protected `(app)` route group should be
 * redirected to `/login`.
 *
 * Mirrors `with-storage-context.ts`'s 401 gate in spirit: `isHostedAuthActive()`
 * is checked first, and when it is `false` (desktop/local), this resolves to
 * `false` immediately — no session read, no `getAuthServer()` call, and
 * critically no Postgres connection is ever attempted, preserving FR10's
 * local-path invariant for the page-route surface as well as the API
 * surface. When hosted auth is active, this reads the session via the same
 * mechanism `betterAuthIdentitySource` (`identity-source.ts`) uses —
 * `getAuthServer().api.getSession({ headers })` — and resolves to `true`
 * (redirect) only when that resolves to `null` (no valid session). A thrown
 * error (e.g. a genuine Postgres failure) is deliberately not caught here
 * and propagates to the caller, for the same reason `betterAuthIdentitySource`
 * doesn't swallow it: a backend failure should surface as a real error, not
 * a false-negative redirect to a login screen that gives no indication
 * anything is actually wrong.
 *
 * @param requestHeaders - The inbound request's headers, as read via
 *   `next/headers`'s `headers()` in the calling server component.
 * @returns `true` when the caller should be redirected to `/login`; `false`
 *   when the caller may proceed (hosted auth inactive, or an active,
 *   verified session exists).
 */
export async function shouldRedirectToLogin(
  requestHeaders: Headers,
): Promise<boolean> {
  if (!isHostedAuthActive()) {
    return false;
  }

  const session = await getAuthServer().api.getSession({
    headers: requestHeaders,
  });
  return session === null;
}
