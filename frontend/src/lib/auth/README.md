# `src/lib/auth/`

Server-only modules for GetWrite's hosted authentication path (better-auth +
PostgreSQL). See `specs/features/auth-provider.md` for the full spec and
`specs/features/auth-provider.plan.md` for the task breakdown.

- `auth-config.ts` — `isHostedAuthActive()`, the single source of truth for
  whether the hosted auth path is active (`DATABASE_URL` +
  `BETTER_AUTH_SECRET` both set).
- `auth-server.ts` — `getAuthServer()`, the lazily-built, memoized
  `betterAuth(...)` instance. Never constructs a `pg.Pool` or calls
  `betterAuth(...)` when hosted auth is inactive. Signup is gated by a
  `databaseHooks.user.create.before` hook (see `signup-allowlist.ts` below),
  not `emailAndPassword.disableSignUp` — that option turned out to be an
  unconditional kill switch with no per-call override, so it is configured
  `false`. See this file's module doc and [ADR-020](../../../../docs/architecture/ADRs/adr-020-hybrid-auth-postgres-better-auth.md)
  for the full story.
- `email.ts` — the `nodemailer` SMTP transport wired into
  `emailAndPassword.sendResetPassword` / `emailVerification.sendVerificationEmail`.
  Reads `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`.
- `signup-allowlist.ts` — `isEmailAllowlisted()`, the policy consulted by
  `auth-server.ts`'s signup-gating hook. Driven by `AUTH_SIGNUP_ALLOWLIST`
  (exact emails and/or `@domain` wildcards); unset means open signup.
- `session-guard.ts` — `shouldRedirectToLogin()`, the pure decision core
  behind `app/(app)/layout.tsx`'s server-side redirect-to-`/login` gate.
- `verify-email-core.ts` — server-side token consumption for `/verify-email`
  (`getAuthServer().api.verifyEmail`).
- `auth-client.ts` / `use-auth-session.ts` — the client-safe counterparts
  (no `server-only`): a thin `better-auth/react` wrapper and
  `useAuthSession()`, the combined hosted-active + authenticated signal UI
  components read (backed by `GET /api/auth-status`).

## Schema / migrations (FR3)

better-auth's built-in Kysely Postgres adapter owns the `user`, `account`,
`session`, and `verification` tables. Schema generation and migration are
**identical for the hosted service and self-hosters** — both run the
better-auth CLI against `DATABASE_URL`:

```bash
# From frontend/, with DATABASE_URL and BETTER_AUTH_SECRET set:
npx @better-auth/cli generate
npx @better-auth/cli migrate
```

`generate` introspects the target database's current schema (via Kysely) to
produce the migration; `migrate` applies it. Both require a **live,
reachable Postgres** — `generate` is not purely config-introspection despite
a `pg.Pool` not connecting until first query, because the CLI immediately
issues an introspection query against the configured database. Running
either command with no reachable Postgres fails with `ECONNREFUSED`, not a
config error — this was verified during Task 1's implementation and is
expected; live schema generation/migration is exercised as part of the
live-infra smoke test (see the plan's Task 8), not the automated unit-test
gate.

The CLI also requires its target config file to export a `const auth =
betterAuth(...)` value it can statically resolve — it cannot resolve a
lazily-built export like this module's `getAuthServer()` function, and it
cannot resolve a file that imports `server-only` (the CLI runs the config
file directly under Node, not under Next.js's bundler, so the guard's
unconditional throw stops it). When running the CLI for real (self-host
setup, or the hosted deploy pipeline), point `--config` at a small
CLI-only config file that constructs `betterAuth(...)` the same way
`auth-server.ts` does, minus the `server-only` import and the lazy-build
wrapper — not at `auth-server.ts` itself.
