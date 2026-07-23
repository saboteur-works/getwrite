# Feature Spec: Real Authentication Provider (better-auth + PostgreSQL)

## Overview

The multi-tenancy arc (ADR-017/018/019) built request-scoped storage, tenant
resolution, route enforcement, adapter isolation, and an object-store backend
— but identity is still an interim stub: `getIdentitySource()` resolves a
userId from an `x-getwrite-dev-user` header gated by
`GETWRITE_ENABLE_DEV_IDENTITY`, which ADR-018 explicitly says "must not be
exposed on a real hosted deployment."

This slice replaces that stub with production authentication for real,
unrelated users at scale, with genuine security consequences. GetWrite's
hosted service is a real multi-tenant product, and the same codebase must
remain self-hostable by third parties running their own instance — so
hand-rolled, zero-dependency, filesystem-backed auth is inappropriate here.

**Library decision (revised):** this slice adopts **better-auth**, not
Auth.js, on review. Auth.js's Credentials provider is second-class: it forces
JWT sessions, which blocks clean server-side revocation, and it ships no
built-in email-verification, password-reset, or rate-limiting flows for
email+password — so every item in this slice's security baseline would have
been hand-rolled on top of the library. better-auth is purpose-built for
email+password as a first-class method: database-backed sessions with real
revocation, built-in email verification, password reset, and rate-limiting
ship as audited library features instead of custom security code, which is
the point of adopting a library at all here. better-auth also hashes
passwords internally (scrypt-based by default, configurable to argon2id),
removing the argon2 native-module/Electron-bundling concern the prior spec
carried as an open question. better-auth is integrated into the Next.js App
Router route handlers, backed by a standard **PostgreSQL** database via its
database adapter, configured through `DATABASE_URL`.

This is a deliberate **hybrid architecture**, not a reversal of GetWrite's
local-first thesis: tenant *content* keeps living on the filesystem/object
store exactly as ADR-017/019 established, while *identity* — accounts,
credentials, sessions, verification tokens — runs as a normal backend
service with a real relational database, because identity at this security
and scale bar is a solved problem with mature libraries and Postgres is the
right tool for it. This separation of concerns, and the reasoning for
choosing better-auth over Auth.js, is recorded in a new ADR-020.

The pre-built seam is what makes the swap contained: `getIdentitySource()`
(`frontend/app/api/_tenant/identity-source.ts`) gains a new source that
reads the better-auth server session and resolves it to a userId (or
`null`). `IdentitySource.getUserId` becomes async-capable
(`string | null | Promise<string | null>`, anticipated by ADR-018), and
`resolveTenant` awaits it. Everything downstream — `resolveTenant →
dataRootForUser → StorageContext` and all model/API code that consumes
it — is unchanged. Desktop/Electron, which never configures the hosted auth
env, stays account-free *and* database-free: when `getIdentitySource()`'s
better-auth source is inactive, the existing local-first path is
byte-for-byte unchanged, and the desktop build never requires a running
Postgres.

## Goals

- Adopt better-auth for session handling, CSRF protection, secure cookies,
  and the email+password flow, rather than hand-rolling any of these or
  building them on top of a library that treats email+password as
  second-class.
- Persist users, accounts, sessions, and verification tokens in PostgreSQL
  via better-auth's database adapter, configured for the hosted service
  through `DATABASE_URL` and documented as a self-host prerequisite.
- Preserve the `IdentitySource` seam as the only integration point: a real
  userId, resolved from the better-auth server session, flows into the
  existing `resolveTenant → dataRootForUser → StorageContext` pipeline with
  no changes downstream of the seam.
- Map the better-auth user identifier to the existing tenant-directory
  allowlist (`^[a-z0-9_-]{1,64}$`, `tenant-path.ts:83`) so it can be used
  unchanged as a tenant directory key.
- Meet a production security baseline as library-provided features rather
  than hand-rolled code: email verification, password reset, brute-force
  rate-limiting/lockout, database-backed revocable sessions, and no
  user-enumeration via login/signup/reset responses.
- Keep Postgres and all better-auth server code strictly server-side —
  never imported into or reachable from the client — and ensure that when
  hosted auth is inactive (desktop/local), no Postgres connection is
  attempted and no better-auth code path runs, even though the `pg`/
  better-auth packages remain present as inert, pure-JS dependencies in the
  build.
- Keep the codebase self-hostable: a third party running their own GetWrite
  instance can stand up the same stack (Postgres + better-auth env config)
  without depending on Saboteur's hosted infrastructure.

## Non-goals

- No OAuth or magic-link providers in this slice (email + password via
  better-auth only); better-auth's plugin model may make these easy to add
  later, but they are not part of this slice.
- No account-management UI beyond password reset/change in this slice
  (e.g. change email, delete account) — a planned fast-follow (see Out of
  scope), not indefinitely deferred.
- No per-session listing/management UI (device/IP/last-active) in this
  slice; single-session logout and "log out everywhere" ship instead (see
  FR17). The listing UI is a planned fast-follow (see Out of scope).
- No teams or multi-user-per-tenant support (an ADR-018 revisit condition,
  unchanged by this slice).
- No change to tenant resolution, storage isolation, or the object-store
  backend themselves (ADR-017/018/019) beyond the `IdentitySource` seam and
  making `getUserId`/`resolveTenant` async-aware.
- No requirement that desktop/Electron gain accounts, login, or any
  Postgres/better-auth dependency — auth is hosted-only, by design.

## User stories

- As a hosted-deployment operator, I want accounts, credentials, and
  sessions handled by a library purpose-built for email+password and a real
  database, so `GETWRITE_ENABLE_DEV_IDENTITY` never has to be exposed in
  production and the security-critical parts of the system aren't
  hand-rolled or bolted onto a library that treats the flow as second-class.
- As a new user, I want to sign up with an email and password, verify my
  email, and land in a working, isolated workspace, so I can trust the
  account is really mine before I start writing.
- As a returning user, I want to log in and have my session persist and be
  revocable, so I don't re-authenticate on every action but can still shut
  a session down if needed (e.g. "log out everywhere").
- As a user who forgot their password, I want a self-serve password-reset
  flow via email, so I'm not locked out of my account.
- As any user attempting to log in, sign up, or reset a password, I want
  the responses to never reveal whether a given email has an account, so my
  account (or someone else's) can't be enumerated by an attacker.
- As a hosted-deployment operator, I want repeated failed login attempts
  against an account or from a source to be rate-limited or locked out, so
  the service resists credential-stuffing and brute-force attacks.
- As a third-party operator, I want to self-host GetWrite with the same
  auth stack (Postgres + better-auth), so I'm not dependent on Saboteur's
  hosted infrastructure to run a secure multi-user instance.
- As a maintainer, I want the identity resolution seam
  (`getIdentitySource()` → `resolveTenant`) to be the only place this slice
  touches downstream of auth itself, so tenant storage, isolation, and the
  object-store backend are unaffected.
- As a desktop user, I want the app to keep working exactly as it does
  today, with no login screen and no database dependency, so local-first
  usage is completely unaffected by this slice.
- As a maintainer evaluating better-auth's newer/less battle-hardened
  status versus Auth.js, I want the version pinned, security advisories
  monitored, and the IdentitySource seam kept clean, so the provider stays
  swappable if that risk materializes.

## Scope sequencing

The first production-safe increment ships the full FR-mandated baseline
together: gated signup (FR12), email verification (FR11), login, password
reset (FR13), rate-limiting (FR16), CSRF (FR18), database-backed revocable
sessions (FR17), 401 enforcement (FR9), the page-route redirect (FR20),
single-session logout, and "log out everywhere" (FR17). None of these is
treated as a fast-follow — each is part of the minimum security bar for
handling real user credentials. Two items are explicitly deferred to a
fast-follow, not indefinitely out of scope: per-session listing/management
UI, and account-management UI beyond password reset/change (see Out of
scope).

## Functional requirements

- **FR1** better-auth is the authentication library for the hosted service,
  integrated into Next.js App Router route handlers. Session issuance, CSRF
  protection, cookie handling, and the email+password flow are implemented
  by the library, not hand-rolled.
- **FR2** Email + password is configured as a first-class better-auth
  authentication method (not an OAuth escape hatch). Password hashing is
  handled entirely by better-auth's built-in hasher: this slice keeps the
  default scrypt-based hasher (Node-native; auth code is server-only, so
  this carries no Electron/native-module implication). Argon2id is not
  adopted in this slice.
- **FR3** better-auth's built-in **Kysely** Postgres adapter persists
  users, accounts, sessions, and verification tokens in PostgreSQL — not
  Drizzle or Prisma, avoiding a second ORM dependency in the codebase
  (`docs/standards/package-selection.md`). Connection is configured via
  `DATABASE_URL`. Schema/migrations are generated and run via the
  better-auth CLI — `npx @better-auth/cli generate` then `migrate` — the
  same commands for both the hosted service and self-hosters.
- **FR4** `DATABASE_URL` (and any other required Postgres connection
  config) is documented as a hard prerequisite for running the hosted auth
  path, both for Saboteur's primary hosted instance and for third-party
  self-hosters who enable hosted auth.
- **FR5** All Postgres access and all better-auth configuration/route-handler
  code is server-only: it is never imported into, or reachable from, any
  client component. When hosted auth is inactive (desktop/local — no hosted
  auth env configured), no Postgres connection is attempted and no
  better-auth code path runs; this is a runtime guarantee, not a claim that
  the `pg`/better-auth packages are absent from the frontend/standalone
  build — they remain bundled as inert, pure-JS dependencies, which is
  harmless.
- **FR6** better-auth is configured with `advanced.database.generateId:
  "uuid"` so it mints lowercase UUIDs as user identifiers — the same
  convention the existing project/tenant directories already use — rather
  than its mixed-case base62 (32-char) default, which would fail the
  lowercase-only tenant allowlist `^[a-z0-9_-]{1,64}$` (`tenant-path.ts:83`).
  Simply lowercasing the default base62 id is explicitly rejected: it
  breaks injectivity on case-insensitive filesystems, which is the exact
  reason the allowlist is lowercase-only. With `generateId: "uuid"`, the
  better-auth user id satisfies the allowlist directly and is used
  unchanged as the tenant directory key, with no change to
  `tenant-path.ts`'s validation.
- **FR7** `getIdentitySource()` (`frontend/app/api/_tenant/identity-source.ts`)
  gains a new `IdentitySource` implementation that reads the better-auth
  server session for the inbound request and resolves it to the mapped
  userId, or `null` when there is no valid session. It is selected in place
  of the existing dev-header source whenever hosted auth is
  configured/active; the dev source remains available only when hosted auth
  is inactive (mirroring today's `GETWRITE_ENABLE_DEV_IDENTITY` gating).
- **FR8** `IdentitySource.getUserId` becomes
  `(request) => string | null | Promise<string | null>` (the interface
  reshape anticipated by ADR-018). Every existing source (dev, null)
  continues to satisfy it by returning a sync value. `resolveTenant` awaits
  the result. No other part of `resolveTenant → dataRootForUser →
  StorageContext` changes.
- **FR9** `withStorageContext` returns HTTP 401 when hosted auth is active
  and the resolved userId is `null`, for any route serving tenant data.
  Auth API routes themselves (signup, login, session, verification,
  password reset, etc.) remain reachable without an existing session.
- **FR10** When hosted auth is inactive (no hosted auth env configured —
  desktop/local), the null-user local-first path through
  `withStorageContext` is unchanged byte-for-byte from its current
  behavior, and no Postgres connection is attempted.
- **FR11** Email verification is enforced at sign-in via better-auth's
  built-in `emailAndPassword.requireEmailVerification: true`: a newly
  signed-up account cannot obtain a session — and therefore cannot access
  tenant data — until its email is verified. The client distinguishes
  "unverified" from "no account" using the login response itself (e.g. a
  distinct error/status returned by the login endpoint), not via
  `withStorageContext` or the `IdentitySource` seam. Session/identity
  resolution stays binary — `getUserId` resolves to a real userId or
  `null` and never carries a third "unverified" state — because
  better-auth never issues a session for an unverified account in the
  first place.
- **FR12** Hosted signup on the primary Saboteur instance is gated behind
  an invite/allowlist mechanism at launch — not open self-serve — using
  better-auth's `emailAndPassword.disableSignUp` combined with an
  invite/allowlist check (or an equivalent gate) before an account is
  created. This is also a blast-radius control while trust in the newer
  better-auth library accrues (see FR26). Self-hosters may configure their
  own instance as open, invite-gated, or allowlist-gated; this slice does
  not mandate a specific policy for self-host.
- **FR13** A password-reset flow lets a user request a reset via email and
  set a new password via a single-use, expiring token, without ever
  revealing whether the submitted email has an account. This is
  better-auth's built-in password-reset feature, not hand-rolled.
- **FR14** Email verification (FR11) and password reset (FR13) are
  delivered via a single SMTP transport, using `nodemailer`, wired into
  better-auth's `sendVerificationEmail` and `sendResetPassword` callbacks.
  This is one code path for both the Saboteur-hosted instance and
  self-hosters — any SMTP-compatible provider works by configuring SMTP
  host/port/user/pass/from via environment variables (see FR23). Swapping
  to a provider API (e.g. Resend, SES) later is a config-only change
  behind the same callbacks, not a code change to this slice's email
  integration.
- **FR15** Login, signup, and password-reset endpoints respond identically
  (same status code, same generic message, same timing characteristics as
  far as practical) regardless of whether the submitted email corresponds
  to an existing account, so none of the three flows can be used to
  enumerate registered emails. Signup needs explicit attention beyond
  better-auth's defaults: out of the box, better-auth's signup endpoint can
  reveal account existence (e.g. an explicit "user already exists" error),
  so meeting this requirement for signup requires deliberate handling — a
  uniform success response, plus routing an existing-email signup attempt
  through the verification/notification-email pattern instead of a
  distinguishable error — not just relying on library defaults as for
  login/reset.
- **FR16** Repeated failed authentication attempts (login, and any
  credential-bearing flow) against a given account and/or from a given
  source are rate-limited and/or lock the account out for a cooldown
  period, using better-auth's built-in rate-limiting rather than hand-rolled
  logic. The rate-limit state must remain correct if the hosted service
  runs more than one instance: this slice uses better-auth's
  `rateLimit.storage: "database"` (Postgres, already a hard requirement of
  this slice), which is multi-instance-correct out of the box. This is a
  closed decision for this slice: `storage: "secondary-storage"` (e.g.
  Redis) is documented only as a possible future upgrade, not something
  this slice needs to evaluate further.
- **FR17** Sessions are database-backed (not JWT-only), enabling genuine
  server-side revocation. Cookies are `httpOnly`, `SameSite` set
  appropriately, and `Secure` in the hosted deployment. Session policy
  adopts better-auth's default lifetime (~7-day expiry, ~1-day rolling
  refresh) unless a later security decision changes it. This slice ships
  two revocation actions, both invalidating server-side session state via
  better-auth's session store (not just the client-side cookie): a
  single-session logout, and a "log out everywhere" action that revokes
  all of a user's sessions. Per-session listing/management UI
  (device/IP/last-active) is explicitly out of scope for this slice (see
  Out of scope) — the revoke-all action does not require enumerating
  sessions in the UI. better-auth's `session.cookieCache` (a short-lived
  signed cookie cache) should be enabled so that the `IdentitySource`
  session read (FR7) does not require a Postgres round-trip on every
  request; the cache's short TTL keeps this consistent with the
  revocation guarantee above.
- **FR18** Once a tenant-data mutation route is authenticated by the
  session cookie, it becomes a CSRF target — a broader attack surface than
  better-auth's own endpoints, which the library protects internally. This
  slice defines an explicit CSRF posture for the tenant API as a
  first-class requirement of adopting cookie auth, not an afterthought: the
  session cookie is `SameSite=Lax` at minimum, and every state-changing
  tenant route (`POST`/`PUT`/`PATCH`/`DELETE` — e.g. `POST /api/projects`,
  resource writes, revision writes) verifies the request's `Origin`/
  `Referer` against the allowed host before executing the mutation. If
  same-site cookie assumptions don't hold for a given deployment, CSRF
  tokens are the stronger alternative.
- **FR19** `BETTER_AUTH_SECRET` and any other better-auth-required secrets
  are provided as plain shared environment variables, injected identically
  into every instance of the hosted service — the same mechanism GetWrite
  already uses for every other env var (no per-instance secret, no
  external secret-management service introduced by this slice). This
  keeps the multi-instance requirement satisfied trivially, since all
  instances read the same value. Rotation is a coordinated redeploy with
  the new secret value; this slice does not build live secret-rotation
  infrastructure (e.g. dual-secret grace windows) — that remains a
  documented manual/deploy-time procedure, not a runtime feature.
- **FR20** Page-route protection for authenticated app routes redirects an
  unauthenticated caller to a login screen (in addition to the API-level
  401 from FR9). This is implemented as a server-side session read in the
  Node runtime — a server component or route wrapper that reads the
  better-auth session, following the repo's existing
  `withStorageContext`/`with-storage-context.ts` wrapper pattern — not
  Edge middleware and not a new `middleware.ts`. Database-backed sessions
  generally cannot be read at the Edge runtime, which is why this slice
  does not use Edge middleware for page-route protection.
- **FR21** The client exposes a login/signup/verify/reset UI sufficient to
  exercise signup → verify email → login → authenticated use → logout, and
  password reset, end-to-end, styled per GetWrite's brand tokens.
- **FR22** A logout affordance is shown only when the resolved session
  state is authenticated; it is never shown when hosted auth is inactive
  (desktop/local mode).
- **FR23** README/self-host documentation lists the full environment
  prerequisite set for enabling hosted auth: `DATABASE_URL`,
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, the SMTP settings used by the
  `nodemailer` transport (host, port, user, pass, from address — see
  FR14), and any signup-gating configuration (FR12). It states explicitly
  that omitting the hosted-auth prerequisites keeps the instance in
  account-free local-first mode. Rate-limit storage requires no additional
  config beyond `DATABASE_URL` in this slice (FR16).
- **FR24** A new ADR-020 records the hybrid architecture decision —
  filesystem/object-store for tenant content (ADR-017/019, unchanged),
  Postgres + better-auth for identity (this slice) — and documents why
  filesystem-backed, hand-rolled auth was rejected, why Auth.js was
  considered and rejected (Credentials-provider limitations: JWT-only
  sessions blocking revocation, no built-in verification/reset/rate-limiting
  for email+password), and why better-auth was chosen instead. ADR-020
  also records the Postgres adapter choice (better-auth's built-in Kysely
  adapter, over Drizzle/Prisma, to avoid a second ORM dependency — see
  FR3) and, in its rollout/consequences section, the independent-
  security-review gate this slice requires before real-credential go-live
  (FR26).
- **FR25** better-auth, the Postgres client/adapter it requires
  (better-auth's built-in Kysely adapter — no separate Drizzle/Prisma
  dependency, per FR3), and `nodemailer` (the SMTP transport for FR14) are
  new dependencies, evaluated per `docs/standards/package-selection.md`:
  `nodemailer` is mature, widely used, pure-JS, and server-only, which
  satisfies that standard. The spec's implementation must verify each
  package exists at a current stable version and pin it. Because
  better-auth is newer and less battle-hardened than Auth.js, this is
  recorded as a risk with an explicit mitigation: pin the version, monitor
  security advisories, keep the `IdentitySource` seam clean so the
  provider remains swappable if the risk materializes, and gate
  real-credential go-live on an independent security review (FR26).
- **FR26** Before real-credential go-live on the primary hosted instance
  (i.e. before the invite/allowlist-gated instance from FR12 admits real
  users with real credentials), the better-auth integration —
  configuration, the verification/reset/rate-limit callback wiring
  (FR11–FR16), and the session/cookie and CSRF posture (FR17/FR18) —
  receives a focused independent security review: a second set of eyes
  distinct from the implementer. Invite/allowlist gating (FR12) is the
  blast-radius control that limits exposure while trust in the library
  accrues; it does not substitute for the review. This is a
  rollout/process requirement, recorded in ADR-020's rollout/consequences
  section (FR24); it gates the live go-live with real users, not the
  writing or merging of the code.
- **FR27** The full quality gate stays green: `typecheck`, `lint` (0
  errors), `test:ci`, `knip`, and `next build`, plus a live hosted smoke
  test (signup → verify → login → cookie → isolated project creation →
  second user sees none of it → logout/revocation → subsequent request
  401), and confirmation that the desktop build still builds and runs with
  no running Postgres required, no better-auth code path executed, and no
  login screen shown — the `pg`/better-auth packages remaining present as
  inert, server-only, pure-JS dependencies in the bundle is expected and
  harmless, not a failure condition.

## Resolved decisions

All open questions from the prior draft are now resolved and baked into
the functional requirements above:

1. **Email delivery.** SMTP via `nodemailer`, one code path for hosted and
   self-host (FR14).
2. **Postgres adapter/migrations.** better-auth's built-in Kysely adapter;
   schema/migrations via `npx @better-auth/cli generate` then `migrate`,
   identical for hosted and self-host (FR3).
3. **Rate-limit storage.** `rateLimit.storage: "database"` (Postgres) for
   this slice; Redis (`secondary-storage`) is a documented future upgrade
   only (FR16).
4. **Page-route protection.** A server-side (Node runtime) session read
   following the `withStorageContext` wrapper pattern — not Edge
   middleware, not a new `middleware.ts` (FR20).
5. **Secret management.** `BETTER_AUTH_SECRET` is a plain shared
   environment variable identical across instances; rotation is a
   coordinated redeploy (FR19).
6. **Password hashing.** better-auth's default scrypt, server-only, no
   Electron implication; argon2id not adopted in this slice (FR2).
7. **Session policy.** better-auth's default lifetime (~7-day expiry,
   ~1-day refresh); single-session logout and "log out everywhere" ship in
   this slice; per-session listing/management UI is a fast-follow (FR17,
   Out of scope).
8. **Scope sequencing.** See the Scope sequencing note above — the full
   FR-mandated baseline ships together, with only session-listing UI and
   broader account-management UI deferred (Out of scope).
9. **Signup availability.** The primary hosted instance is invite/
   allowlist-gated at launch, not open self-serve; self-hosters configure
   their own policy (FR12).
10. **Library maturity risk.** Version pinning, security-advisory
    monitoring, seam-swappability, invite-gating as blast-radius control
    (FR12), and a mandatory independent security review before
    real-credential go-live (FR26).

## Out of scope (deferred)

- OAuth and magic-link authentication methods (better-auth supports adding
  these later behind the same session/identity seam; not built in this
  slice).
- Teams / multi-user-per-tenant support (an ADR-018 revisit condition).
- **Per-session listing/management UI** (device/IP/last-active,
  individually revocable sessions). A planned fast-follow, not an
  indefinite deferral — this slice ships single-session logout and
  "log out everywhere" (FR17) without it.
- **Account-management UI beyond password reset/change** (change email,
  delete account) — beyond what FR11 (verification) and FR13 (password
  reset) require. A planned fast-follow, not an indefinite deferral.
- A real S3/R2 (or other network) `ObjectStore` implementation, and any
  other change to tenant content storage — this slice touches identity
  only, via the `IdentitySource` seam (ADR-017/019 unaffected).
- Any change to the desktop/Electron build to add accounts, login, or a
  Postgres dependency — desktop stays account-free and DB-free by design.
