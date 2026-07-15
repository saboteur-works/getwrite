# Feature Spec: Tenant Resolution — Mapping a Request to a Per-User Data Root

## Overview

`withStorageContext` (`frontend/app/api/_tenant/with-storage-context.ts`), the
seam ADR-017 introduced to bind a per-request `StorageContext`, currently
binds every request to the same hardcoded `tenantRoot`:
`defaultProjectsDir()`. The storage layer can hold a tenant root per request,
but nothing yet *chooses* a different one per user — every hosted request
resolves to the same directory regardless of who is asking. This feature
implements ADR-018: a single `resolveTenant(request) → { userId, dataRoot }`
seam, backed by a pluggable, swappable `IdentitySource`, that
`withStorageContext` calls in place of the hardcoded default. A `null`
`userId` (no account) preserves today's behavior exactly; a non-null
`userId` resolves to an isolated `<data-root>/<userId>/` directory,
provisioned on first request and defended by a centralized path-traversal
guard.

## Goals

- A signed-in user's requests resolve to an isolated `<data-root>/<userId>/`
  directory, distinct from every other user's, through one code path.
- Electron and local-dev requests continue to resolve to
  `defaultProjectsDir()` byte-for-byte, with zero observable behavior change,
  because their `userId` resolves to `null`.
- No `userId`-derived path can resolve outside `<data-root>`, verified
  against concrete adversarial inputs, not just well-formed ones.
- A newly signed-in user's data root exists (is provisioned) by the time
  their first request needs to read or write it, with no separate
  onboarding or migration step.
- The future real auth provider can replace the interim identity source by
  implementing one interface, without changing `resolveTenant`'s callers or
  `withStorageContext`.

## Non-goals

- Building the real auth provider: login, sessions, signup, account
  recovery, or any user-facing auth UI. The `IdentitySource` shipped here is
  an interim stub/seam only, and must be inert (never reachable) in a real
  production deployment — see FR6.
- Migrating the ~22 model modules that call `node:fs`/`node:fs/promises`
  directly onto the `StorageAdapter`/`io.ts` seam. Tenant isolation here, as
  in ADR-017, is delivered by `tenantRoot` (the resolved path), which those
  modules already respect via their explicit path parameters.
- Multi-user-per-tenant, team, or organization tenancy. Resolution is a flat
  `userId → <data-root>/<userId>/` mapping; a tenant is exactly one user.
- Fully designing how `<data-root>` itself is deployed or orchestrated
  across multiple hosts. This spec names the configuration value
  (`GETWRITE_DATA_ROOT`, a single env var, per FR6) and requires that it be
  readable at resolution time, but does not design the broader multi-host
  deployment/orchestration story beyond that.
- Any change to `runInStorageContext`, `AsyncLocalStorage` machinery,
  `StorageContext`'s shape, `runForTenant`, CLI commands, or background/queue
  paths (`indexer-queue`, `backlinks-watcher`). All are inherited unchanged
  from the request-scoped-tenant-storage feature.

## User stories

- As a hosted, signed-in user, I want my requests to resolve to a data root
  that only my account can reach, so that my projects are never visible to
  or overwritable by another user on the same shared instance.
- As an existing Electron/local-dev user, I want tenant resolution to be
  invisible to me, so that my app keeps reading and writing the same
  `../projects` directory it always has, with no account and no migration.
- As the developer/operator responsible for this seam, I want the
  path-traversal defense to live in exactly one reviewable function with
  explicit test cases for malicious input, so that a single audited
  boundary — not each route — is what stands between one tenant's data and
  another's.

## Functional requirements

1. A new function `resolveTenant(request) → { userId: string | null;
   dataRoot: string }` must exist as the single entry point for mapping an
   inbound request to a tenant. It must be a pure function of the request
   and the active `IdentitySource` (plus configuration) — no route may
   duplicate this resolution inline.
2. An `IdentitySource` interface must exist with a method that, given a
   request, returns a `userId: string | null` (or an equivalent async
   result). `resolveTenant` must call the currently configured
   `IdentitySource` to obtain `userId` before deriving `dataRoot`.
3. An interim `IdentitySource` implementation (a dev stub / signed request
   header, per ADR-018 — not production auth) must be provided and must be
   swappable for a future real-auth-backed implementation without changing
   `resolveTenant`'s signature or `withStorageContext`'s call site.
4. The interim `IdentitySource` must be gated behind a single environment
   variable, `GETWRITE_ENABLE_DEV_IDENTITY` (following the existing
   `GETWRITE_PROJECTS_DIR` single-env-var precedent). When unset, the
   interim `IdentitySource` must be inert: it returns `userId: null`
   unconditionally, regardless of any request content. When set, it
   activates and must emit a loud runtime warning log at startup/activation
   stating that dev identity is enabled. The exact request mechanism the
   interim source reads once enabled (e.g. a request header naming the
   `userId`) is an implementation detail, but it must be documented as a
   dev/interim mechanism, not production auth.
5. When `resolveTenant` resolves `userId === null`, `dataRoot` must equal
   `defaultProjectsDir()` — the same value `withStorageContext` binds today
   — so Electron and local-dev requests are byte-for-byte unaffected by this
   feature.
6. When `resolveTenant` resolves a non-null, validated `userId`, `dataRoot`
   must equal `<data-root>/<userId>/`, where `<data-root>` is read from a
   new environment variable, `GETWRITE_DATA_ROOT`, distinct from
   `GETWRITE_PROJECTS_DIR` and read analogously to how
   `GETWRITE_PROJECTS_DIR` is read in
   `frontend/src/lib/models/projects-dir.ts`.
7. A centralized path-traversal guard must validate every non-null `userId`
   before it is joined into a filesystem path. The guard's primary rule is a
   strict allowlist: a `userId` must match `^[a-z0-9_-]{1,64}$` or
   resolution fails (rejected, not silently falling back or truncating).
   This charset admits no path separators, no `.` (so `..` traversal is
   impossible by construction), no Unicode/homoglyph/normalization
   ambiguity, no null bytes, and no empty string. Uppercase is excluded so
   the `userId`→directory mapping is injective on a case-insensitive
   filesystem (macOS/Windows): were both cases allowed, `Alice` and `alice`
   would join to the same directory and cross a tenant boundary, so a single
   case keeps distinct users in distinct directories on any host FS. The
   guard must have unit test coverage showing the allowlist rejects, at
   minimum, all of the following inputs: `../otherUser`, `../../etc`, an
   absolute path (e.g. `/etc/passwd`), a URL-encoded separator (e.g.
   `..%2Fother`), an embedded null byte, an empty string, a `userId`
   containing an embedded path separator (e.g. `foo/../../bar`, `foo/bar`),
   and a mixed/upper-case id (e.g. `Alice`). An `IdentitySource` whose native
   identifier does not fit this charset (e.g. an email-based real-auth id, or
   one carrying uppercase) is responsible for mapping/hashing it to a
   conforming `userId` at the source boundary; that mapping is out of scope
   for this feature.
8. On a signed-in user's (non-null `userId`) first resolved request,
   `<data-root>/<userId>/` must be created if it does not already exist
   before the request proceeds, so the request's subsequent storage
   operations succeed against an existing directory. Provisioning uses a
   best-effort `mkdir(path, { recursive: true })`, matching the codebase's
   uniform idempotent-mkdir idiom; no additional lock or `EEXIST` handling
   is required for concurrent first-request traffic.
9. `withStorageContext` must call `resolveTenant(request)` to obtain
   `tenantRoot` (`dataRoot`) in place of its current hardcoded
   `defaultProjectsDir()` call; `getStorageAdapter()` continues to supply
   the adapter half of the bound `StorageContext`, unchanged.
10. The `StorageContext` type (`{ tenantRoot: string; adapter: StorageAdapter
    }`), `runInStorageContext`, and `getStorageContext` in
    `frontend/src/lib/models/storage-context.ts` must not change shape or
    behavior. This feature only changes what value `withStorageContext`
    supplies as `tenantRoot`.
11. `runForTenant`, all CLI commands (`cli/src/commands/*`), the
    `indexer-queue`, and the `backlinks-watcher` must be unaffected by this
    feature: none of them call `resolveTenant`, and their existing
    `tenantRoot`-derivation behavior (per the request-scoped-tenant-storage
    feature) must not change.
12. If `resolveTenant` resolves a non-null `userId` but the data-root
    configuration value required by FR6 is absent or unreadable, resolution
    must fail with an explicit, identifiable error rather than silently
    falling back to `defaultProjectsDir()` (which would place a signed-in
    user's data in the shared/legacy directory).
13. The full test suite (`pnpm test:ci`) must pass, including new unit
    coverage for `resolveTenant`, the interim `IdentitySource`, the
    provisioning step, and the path-traversal guard, using a fake
    `IdentitySource` with no real auth infrastructure.

## Out of scope (deferred)

- The real auth provider: login, sessions, signup, account recovery, and any
  user-facing auth UI (ADR-018 Option 1, explicitly deferred).
- Migrating the ~22 `node:fs`-direct model modules onto the `StorageAdapter`
  seam (inherited from ADR-017's Non-goals; not needed for shared-disk
  multi-user).
- Multi-user-per-tenant / team / organization tenancy — a future revisit
  condition per ADR-018, not addressed here.
- Designing or implementing the broader multi-host deployment/orchestration
  story for `<data-root>`, beyond naming the configuration value
  (`GETWRITE_DATA_ROOT`) and requiring that it be readable at resolution
  time.
- Any change to `AsyncLocalStorage`/`StorageContext` machinery, `runForTenant`,
  CLI commands, `indexer-queue`, or `backlinks-watcher` — all unaffected by
  this feature per FR10–FR11.
- Moving the storage backend off a shared filesystem (object storage,
  container-per-tenant) — an ADR-018 revisit condition, not addressed here.
