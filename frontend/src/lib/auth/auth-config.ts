// Last Updated: 2026-07-22

import "server-only";

/**
 * @module auth-config
 *
 * The single source of truth for whether GetWrite's hosted authentication
 * path (better-auth + PostgreSQL) is active for this process — the identity
 * counterpart to `app/api/_tenant/storage-backend.ts`'s
 * `resolveBackendAdapter()` env-gated selector.
 *
 * Hosted auth (Slice 6, `specs/features/auth-provider.md`) is an opt-in
 * layer, not a default: the desktop/Electron build and local dev never
 * configure it, and must keep behaving exactly as they do today — no
 * account, no login screen, and critically, **no Postgres connection ever
 * attempted** (FR5, FR10). `isHostedAuthActive()` is the one place every
 * other auth-aware module — `auth-server.ts`'s lazy `betterAuth(...)`
 * builder, the future better-auth `IdentitySource` (Task 3), the
 * `withStorageContext` 401 gate (Task 4), and the page-route redirect
 * (Task 4/6) — asks before doing anything hosted-auth-specific. Centralizing
 * the check here means the activation condition only has to be correct in
 * one place.
 *
 * **Activation condition.** Both `DATABASE_URL` and `BETTER_AUTH_SECRET`
 * must be set to non-empty strings. Both are hard prerequisites of the
 * hosted auth path (FR4, FR19): `DATABASE_URL` because better-auth's Kysely
 * Postgres adapter has nowhere to connect without it, and
 * `BETTER_AUTH_SECRET` because better-auth refuses to run in production
 * without an explicit secret (and GetWrite's hosted deployment is always
 * "production" from better-auth's point of view). Requiring *both* — rather
 * than either alone — avoids a half-configured state where a `Pool` gets
 * constructed against a real database with no secret to sign sessions, or
 * vice versa.
 *
 * **Env is read fresh on every call — no module-level caching of the
 * boolean itself.** This mirrors `storage-backend.ts`'s
 * `resolveBackendAdapter()` idiom exactly, and for the same reason: tests
 * toggle `process.env.DATABASE_URL`/`process.env.BETTER_AUTH_SECRET`
 * between assertions within a single process and expect the very next call
 * to observe the change. (The *expensive* object — the `betterAuth(...)`
 * instance itself — is memoized in `auth-server.ts`, not here; this
 * function is cheap enough to call on every request.)
 *
 * **Server-only.** This module is never reachable from a client bundle
 * (`import "server-only"` above enforces that at build time — see FR5) and
 * has no client-facing counterpart in this task. A later task may expose a
 * narrow, purpose-built client signal (e.g. a boot-time flag baked into the
 * bundle) so the UI can decide whether to render a login affordance — that
 * is explicitly out of scope here; this module answers "is hosted auth
 * active on the server", nothing else.
 */

/**
 * Returns whether GetWrite's hosted authentication path (better-auth +
 * PostgreSQL) is active for this process.
 *
 * `true` only when both `DATABASE_URL` and `BETTER_AUTH_SECRET` are set to
 * non-empty strings; `false` otherwise, including when either is unset,
 * empty, or whitespace-only. See the module doc above for the rationale
 * behind requiring both and for the "read fresh on every call" behavior.
 */
export function isHostedAuthActive(): boolean {
  return (
    isNonEmpty(process.env.DATABASE_URL) &&
    isNonEmpty(process.env.BETTER_AUTH_SECRET)
  );
}

/** True for a defined, non-empty (post-trim) string; false otherwise. */
function isNonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
