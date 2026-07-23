# Plan: Auth Provider (better-auth + PostgreSQL) — Implementation & Task List

Spec: `specs/features/auth-provider.md` (27 FRs, all OQs resolved)
Branch: `feat/auth-provider` (created off `main`; spec committed)

## Context

Slice 6 replaces the interim dev-header identity stub with production
email/password auth for GetWrite's hosted, multi-tenant, self-hostable service.
Hybrid architecture: tenant *content* stays filesystem/object-store (ADR-017/019,
local-first); *identity* runs on **better-auth + PostgreSQL**. It plugs into the
pre-built `getIdentitySource()` seam — downstream (`resolveTenant →
dataRootForUser → StorageContext`) is unchanged — and desktop/Electron stays
account-free and DB-free (auth is hosted-only). New ADR-020 records the
architecture + library rationale + the pre-go-live review gate.

## Integration points to reuse (not re-invent)

- **Seam:** `frontend/app/api/_tenant/identity-source.ts` (`getIdentitySource()`
  swap point — add a better-auth source), `resolve-tenant.ts` (await `getUserId`),
  `with-storage-context.ts` (401 enforcement — the same wrapper the object-store
  slice extended).
- **userId → tenant key:** `tenant-path.ts:83` allowlist `^[a-z0-9_-]{1,64}$`;
  better-auth `advanced.database.generateId: "uuid"` satisfies it directly (FR6).
- **Active/inactive gating precedent:** `app/api/_tenant/storage-backend.ts` +
  `resolveBackendAdapter()` — mirror its env-gated idiom for `isHostedAuthActive()`.
- **Client shell:** `app/page.tsx`, `app/layout.tsx`, logout host
  `components/Layout/ShellSettingsMenu.tsx`, store pattern `src/store/*`.

## Server config to encode (from the spec, verbatim intent)

`betterAuth({ database: new Pool({ connectionString: DATABASE_URL }),
emailAndPassword: { enabled, requireEmailVerification: true, disableSignUp: true +
invite/allowlist gate, sendResetPassword }, emailVerification: {
sendVerificationEmail }, advanced: { database: { generateId: "uuid" } }, rateLimit:
{ storage: "database" }, session: { cookieCache: {…} }, secret: BETTER_AUTH_SECRET,
baseURL: BETTER_AUTH_URL })` — default scrypt hasher, built-in Kysely adapter (no
Drizzle/Prisma), SMTP via `nodemailer` behind the two email callbacks. Server-only.

## Task list (orchestrator executes one at a time; commit per verified task)

1. **Deps + server auth instance + Postgres + schema** (FR1, FR3, FR5, FR6, FR16,
   FR17, FR25). Add pinned, version-verified deps: `better-auth`, `pg`,
   `nodemailer` (verify current stable versions at install; `pg`/`nodemailer` are
   pure-JS, server-only). New `frontend/src/lib/auth/auth-server.ts` — the
   `betterAuth(...)` instance, built lazily and **only when hosted auth is
   active**; `auth-config.ts` — `isHostedAuthActive()` (true when `DATABASE_URL` +
   `BETTER_AUTH_SECRET` set), mirroring `storage-backend.ts`. Mark auth modules
   server-only. Generate the Kysely schema via `npx @better-auth/cli generate`;
   document `migrate`. *Tests:* config gating (active/inactive), server-only guard,
   `generateId:"uuid"` assertion. **Commit.**

2. **better-auth route handler + SMTP email transport** (FR1, FR14).
   `frontend/app/api/auth/[...all]/route.ts` mounts the handler
   (`toNextJsHandler(auth)`). `frontend/src/lib/auth/email.ts` — `nodemailer` SMTP
   transport from `SMTP_*` env, wired into `sendVerificationEmail` /
   `sendResetPassword`. *Tests:* transport builds from env (mock nodemailer);
   callbacks invoke it; handler mounts only when auth active. **Commit.**

3. **Identity seam + async getUserId** (FR7, FR8). In `identity-source.ts` add
   `betterAuthIdentitySource` reading the session (`auth.api.getSession({ headers
   })`) → mapped uuid userId or `null`; `getIdentitySource()` returns it when
   `isHostedAuthActive()` (precedence over dev source). Widen `getUserId` to
   `string | null | Promise<string | null>`; `resolve-tenant.ts` awaits it.
   *Tests:* mocked session → userId; none → null; dev/null sources stay sync;
   `resolveTenant` awaits; local path unaffected when inactive. **Commit.**

4. **Enforcement: 401 + CSRF + page-route redirect** (FR9, FR18, FR20).
   `with-storage-context.ts`: `isHostedAuthActive()` and userId `null` → 401. Add a
   CSRF `Origin`/`Referer` check (allowed host from `BETTER_AUTH_URL`) for
   state-changing tenant routes (`POST/PUT/PATCH/DELETE`) as a shared helper in the
   wrapper. Page-route protection: a **server-side** session read in a server
   layout/gate (`app/layout.tsx` or an `(app)` group layout) redirecting
   unauthenticated hosted callers to `/login` — Node runtime, no `middleware.ts`.
   *Tests:* 401 when active+null; local path byte-identical when inactive; CSRF
   rejects cross-origin mutation, allows same-origin; redirect logic. **Commit.**

5. **Invite/allowlist signup gate + signup anti-enumeration** (FR12, FR15). Gate
   signup via `disableSignUp` + an invite/allowlist check (env-configured
   allowlist and/or invite code) in a before-signup hook or custom signup route;
   self-host policy configurable. Uniform signup responses (existing-email →
   verification/notification pattern, not a distinguishable error). *Tests:*
   non-invited rejected; invited proceeds; response uniform for existing vs new
   email. **Commit.**

6. **Client: auth UI + gate + logout** (FR21, FR22). better-auth React client
   (`createAuthClient`) for login/signup/verify/reset. `components/Auth/
   AuthScreen.tsx` (login/signup toggle, verify prompt, reset, brand-styled) at
   `app/login/page.tsx`. A client hosted-vs-local signal
   (`NEXT_PUBLIC_GETWRITE_HOSTED_AUTH` or a tiny bootstrap read) so desktop/local
   shows no login. Logout + "log out everywhere" in `ShellSettingsMenu.tsx`, only
   when authenticated. Storybook for `AuthScreen`. *Tests:* component states;
   logout hidden in local mode. **Commit.**

7. **Docs** (FR23, FR24, FR26). New `docs/architecture/ADRs/adr-020-*.md` (hybrid
   architecture; why hand-rolled *and* Auth.js rejected; Kysely choice; rollout +
   independent-review gate) + README index. README/self-host env table
   (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_*`, signup-gating,
   "omit → local-first mode"). Seam note in `docs/standards/storage-context.md`;
   reconcile `CLAUDE.md`. **Commit.**

8. **Full gate + live hosted smoke + grep guard** (FR27). See Verification.
   **Commit** any fixups.

## Verification

- **Automated gate (in-agent):** `pnpm typecheck` clean; `pnpm lint` 0 errors;
  `pnpm test:ci` green (better-auth/DB mocked); `pnpm knip`;
  `pnpm --filter getwrite-frontend build`. **Grep guard:** better-auth/`pg`/auth
  modules never imported from client components (server-only).
- **Live hosted smoke (needs real infra — provide a `docker compose` with Postgres
  + a mail catcher like MailHog; run at Task 8 / debrief, may be lead-run):** set
  `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SMTP_*`, invite config →
  `@better-auth/cli migrate` → invited signup → grab verification link from the
  mail catcher → verify → login → cookie → create project (isolated under the uuid
  dataRoot) → second user sees none of it → logout + "log out everywhere" revokes →
  subsequent tenant request 401 → cross-origin mutation rejected (CSRF).
- **Desktop/local regression:** no `DATABASE_URL`/auth env → app loads
  account-free, no login screen, no Postgres connection attempted; `next build` and
  the Electron build still succeed (packages present-but-inert).
- **Pre-go-live (process, tracked not run here):** FR26 independent security review
  before the gated instance admits real users.

## Constraint to flag

Unit/integration tests mock better-auth and Postgres, so the automated gate is
fully achievable in-agent. The **live smoke needs a running Postgres + SMTP sink**,
which the orchestrator's environment may lack — treat Task 8's live smoke as a
lead-run (docker-compose) step at debrief, not a blocker for the per-task commits,
which rely on the mocked automated gate.

## Deferred (fast-follows, per spec Out of scope)

Per-session listing/management UI; account-management UI beyond reset/change;
OAuth/magic-link; teams/multi-user-per-tenant; Redis rate-limit store; live
secret-rotation infra.
