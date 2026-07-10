# Feature Spec: Request-Scoped, Tenant-Aware Storage

## Overview

GetWrite's model layer resolves *where* to read and write files through two
process-wide singletons: `resolveProjectsDir()` (`frontend/src/lib/models/projects-dir.ts`),
which reads one `GETWRITE_PROJECTS_DIR` environment variable for the whole
server process, and `getStorageAdapter()` (`frontend/src/lib/models/io.ts`),
which exposes one mutable module-level `adapter` variable for the whole
process. Because Next.js route handlers run concurrently within a single
process, these globals mean two in-flight requests could resolve the same
projects directory and adapter even if they belong to different tenants —
there is currently no mechanism to isolate storage resolution per request.
This feature implements the foundational slice of ADR-017: replacing both
globals with a per-request `{ tenantRoot, adapter }` context propagated via
`AsyncLocalStorage`, so storage resolution becomes request-scoped instead of
process-scoped, while leaving the entire filesystem model, on-disk JSON
format, and `StorageAdapter` contract untouched.

## Goals

- Two concurrent requests carrying different tenant contexts never read or
  write each other's resolved projects directory or storage adapter, even
  under interleaved async execution within one Node process.
- When no request-scoped context has been established, storage resolution
  falls back to today's exact behavior byte-for-byte (`GETWRITE_PROJECTS_DIR`,
  then `path.join(process.cwd(), "..", "projects")`), so Electron and local
  dev are unaffected.
- The model layer's existing call chains (resource, revision, index,
  backlinks code) resolve storage from the ambient context without any
  function in that layer growing a new required parameter to carry it
  explicitly.
- Code paths that run outside an inbound HTTP request (CLI commands,
  `indexer-queue`, `backlinks-watcher`) have a defined, non-silent way to
  establish or fall back to a storage context.
- The `StorageAdapter` interface and the on-disk JSON format are unchanged;
  this is a resolution-mechanism refactor only.

## Non-goals

- Building an authentication layer (no `middleware.ts`, sessions, or cookies
  are introduced here).
- Implementing the `request → userId → dataRoot` mapping that decides which
  tenant a given authenticated request belongs to.
- Implementing an object-storage/S3 adapter (ADR-017 Option 2).
- Implementing container-per-tenant or any other per-tenant process isolation
  (ADR-017 Option 3).
- Any local-first sync work (cloud-as-backup, Yjs-based content sync,
  server-side reindex).
- Migrating the model modules that import `node:fs/promises` directly (about
  22 of them) onto the `StorageAdapter`/`io.ts` seam. This slice only makes
  the ~6 model modules that already route through `io.ts` context-aware;
  those direct-`fs` modules are unaffected by `runInStorageContext` and are
  not adapter-isolated. Tenant isolation delivered here is keyed on
  `tenantRoot` (the resolved path), not on per-request adapter substitution.
  Extending adapter isolation to the direct-`fs` modules is deferred to a
  follow-up spec. (Implementation note, reconciled after delivery.)
- Changing `locks.ts` or `meta-locks.ts` implementation, or the tenant-pinned-
  instance assumption that makes their in-process locking correct — that
  invariant is inherited from ADR-017's accepted decision, not established or
  re-verified by this spec.

## User stories

- As the developer/operator building a hosted multi-tenant deployment, I want
  concurrent Next.js requests to resolve storage from an isolated per-request
  context, so that I can safely add tenant routing on top of this seam without
  risking one tenant reading or writing another tenant's files.
- As an existing single-user (Electron or local-dev) user, I want my app's
  storage resolution to behave exactly as it does today, so that this
  refactor is invisible to me and my on-disk project data is unaffected.

## Functional requirements

1. A new module must expose an `AsyncLocalStorage`-backed context whose
   stored value is `{ tenantRoot: string; adapter: StorageAdapter }`, plus a
   function to run a callback within a given context
   (`runInStorageContext({ tenantRoot, adapter }, callback)`) and a function
   to read the current context.
2. Two concurrent async call chains entered with different `{ tenantRoot,
   adapter }` values must each observe only their own values throughout their
   execution, including across `await` boundaries and interleaved execution
   with the other chain, verified by a concurrency test that interleaves two
   simulated requests. This concurrency test lives in a new dedicated file,
   `frontend/tests/unit/storage-context.test.ts`, rather than being added to
   `io.test.ts`.
3. When no context has been established for the current async execution,
   reading the projects directory must return the same value
   `resolveProjectsDir()` returns today (`GETWRITE_PROJECTS_DIR` env var, else
   `path.join(process.cwd(), "..", "projects")`), and reading the storage
   adapter must return the same default `fs/promises`-backed adapter
   `getStorageAdapter()` returns today.
4. All existing call sites in the model layer that currently call
   `resolveProjectsDir()` or `getStorageAdapter()` directly must continue to
   compile and function without adding an explicit context parameter to their
   own signatures. Both functions keep their current names and zero-argument
   signatures: they are reimplemented as thin wrappers that read the ambient
   context established by `runInStorageContext` and fall back to today's
   default resolution (per requirement 3) when no context is set. This
   requirement covers the ~6 model modules that route storage access through
   `io.ts`; model modules that import `node:fs/promises` directly are out of
   scope (see Non-goals). (Implementation note, reconciled after delivery.)
5. The `StorageAdapter` type (`mkdir`, `writeFile`, `readFile`, `readdir`,
   `stat`, `rm`, `rename`, `fsyncFile`) must not change shape, and no method
   on it may be added, removed, or have its signature altered by this work.
6. The on-disk JSON format and directory layout under `projects/<projectId>/`
   (resources, revisions, meta, `.trash`) must be unaffected; no migration is
   introduced or required.
7. CLI commands (`cli/src/commands/*`) must establish an explicit storage
   context before invoking model-layer functions, rather than relying on an
   ambient request context that will not exist outside a server process.
   Concretely: five of the six CLI commands (`project create`, `prune`,
   `reindex`, `templates save|create|duplicate|list`, `doctor`) already
   accept an explicit `projectRoot` argument; each of these commands'
   `.action()` handlers wraps its existing model-layer calls in
   `runInStorageContext({ tenantRoot: projectRoot, adapter }, ...)` at the
   point of invocation. `screenshots capture` is excluded: it takes only a
   `--out <dir>` screenshot output path, never calls a model-layer storage
   function, and so is intentionally left unwrapped. (Implementation note,
   reconciled after delivery: this narrows the requirement from "all six
   commands" to "five wrapped commands plus one deliberate exception.")
8. Background/long-running paths that are not triggered by a single inbound
   request (`indexer-queue`, `backlinks-watcher`) must have a defined
   mechanism for establishing the storage context they operate under, and
   must not silently resolve to the process-default context when a
   tenant-specific context was intended. Concretely: `indexer-queue` wraps
   each queued unit of work in
   `runInStorageContext({ tenantRoot: projectRoot, adapter }, ...)` inside
   `runTask`, threading `projectRoot` per task rather than holding a
   shared/long-lived context; `backlinks-watcher` wraps each invocation of
   its recompute timer callback in
   `runInStorageContext({ tenantRoot: projectRoot, adapter }, ...)`, closing
   over the `projectRoot` it was constructed with. No new long-lived context
   registry is introduced for either path.
9. If a code path requires a tenant-scoped context but none is available and
   no fallback is defined for that path (per requirement 8), attempting
   storage resolution must fail with an explicit, identifiable error rather
   than silently falling back to the process-default projects directory.
10. `setStorageAdapter()` remains the module-level default-adapter override,
    used as the fallback storage adapter when no `AsyncLocalStorage` context
    is set (per requirement 3). Existing tests that call `setStorageAdapter()`
    to inject an in-memory adapter require no migration — they continue to
    pass unmodified by hitting this no-context fallback path — and the full
    test suite must pass (`pnpm test:ci`).
11. This work must not modify `locks.ts` or `meta-locks.ts`, and must not
    change the tenant-pinned-instance precondition those modules depend on
    for correctness.
12. `frontend/src/lib/models/projects-dir.ts` and `frontend/src/lib/models/io.ts`
    (or their replacements) must each retain a single, clearly documented
    entry point for resolving the current projects directory and storage
    adapter respectively, so call sites have one obvious import rather than
    a choice between an old and new API during the transition.
13. Only the API routes that actually call `resolveProjectsDir()` must
    establish the storage context via a shared, documented `withStorageContext(handler)`
    helper, called in one line, rather than duplicating `AsyncLocalStorage.run(...)`
    calls inline or establishing context in `middleware.ts`. Concretely: the
    four routes that resolve the projects directory —
    `projects`, `projects/[projectId]/reorder`,
    `project/[project-id]/reindex`, and `project/[project-id]/search` — are
    wrapped in `withStorageContext`. Other model-touching routes take an
    explicit `projectPath` in the request body instead of resolving one
    ambiently, and are intentionally left unwrapped by this requirement.
    Enforcement is a documented note in `docs/standards/storage-context.md`
    plus code review, not a custom lint rule.
    (Implementation note, reconciled after delivery: this narrows the
    requirement from "every model-touching route" to the four routes that
    actually need the context, and drops the custom ESLint rule in favor of
    documented review guidance.)
14. Until a future auth spec defines the `request → userId → dataRoot`
    mapping (see Non-goals), every API route that establishes a storage
    context (per requirement 13, the four `withStorageContext`-wrapped
    routes) must enter it using `resolveProjectsDir()`'s existing fallback
    value as `tenantRoot` (`GETWRITE_PROJECTS_DIR` env var, else
    `path.join(process.cwd(), "..", "projects")`). This makes the present
    slice a pure isolation-mechanism refactor with no production behavior
    change; resolving a genuinely tenant-specific `tenantRoot` per request is
    out of scope until that future spec lands.
    (Implementation note, reconciled after delivery: scoped to the four
    routes that establish a context, per the revised requirement 13, rather
    than "every API route.")

## Open questions

None remaining — resolved during triage. See FR1, FR2, FR4, FR7, FR8, FR10,
FR13, and FR14 for the resolved decisions (resolver naming, test injection,
CLI/background-job context scoping, the API route context seam, the interim
`tenantRoot` value, and the concurrency test's file location).

## Out of scope (deferred)

- Any auth/session mechanism or the `request → userId → dataRoot` mapping
  (a separate future spec, per ADR-017).
- Object-storage adapter implementation (ADR-017 Option 2).
- Container-per-tenant implementation (ADR-017 Option 3).
- Local-first sync layer (cloud-as-backup, Yjs-based content sync,
  server-side reindex) — explicitly deferred and decoupled from this storage
  choice per ADR-017's "Neutral" consequences.
- Any change to how tenants are pinned to instances, or to distributed
  locking across instances — both are ADR-017 revisit conditions, not
  addressed here.
