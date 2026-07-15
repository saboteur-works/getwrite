# Plan: Request-Scoped, Tenant-Aware Storage (foundational slice)

## Context

GetWrite resolves *where* to read/write through two process-wide globals:
`resolveProjectsDir()` (`frontend/src/lib/models/projects-dir.ts`, one
`GETWRITE_PROJECTS_DIR` env var for the whole process) and the mutable
module-level `adapter` in `io.ts` (read via `getStorageAdapter()`, swapped via
`setStorageAdapter()`). Next.js route handlers run concurrently in one process,
so these globals are the blocker to any future multi-tenant hosting (ADR-017):
there's no way to resolve storage per request. This slice introduces a
per-request `AsyncLocalStorage` context carrying `{ tenantRoot, adapter }`, makes
the two resolvers read from it (falling back to today's behavior when absent),
and wires it into the routes that actually resolve a tenant directory — with
**zero production behavior change** and no on-disk format change. It's the
seam a later auth/tenant-mapping spec builds on.

### Scope decisions locked during triage/exploration
- **Seam now, migrate later.** Exploration found only ~6 model files use the
  `io.ts` adapter; ~22 import `node:fs/promises` directly. We do **not** migrate
  those 22 now. The adapter-in-context is a *seam* (tests today, S3 later); real
  tenant isolation in the directory-per-tenant model is keyed by `tenantRoot`
  (the path), which this slice does deliver. Full adapter migration is a
  documented follow-up.
- **Helper + wrap the 4 routes.** Only 4 routes call `resolveProjectsDir()`; the
  rest take an explicit `projectPath` in the request body. Ship a
  `withStorageContext` helper, wrap those 4 routes, document the pattern in
  `docs/standards/`. **No** custom ESLint rule (no `no-restricted-syntax`
  precedent exists; not worth the scaffolding for 4 routes).

## Approach

### 1. New module — `frontend/src/lib/models/storage-context.ts`
- An `AsyncLocalStorage<StorageContext>` where
  `StorageContext = { tenantRoot: string; adapter: StorageAdapter }`
  (`StorageAdapter` imported type-only from `io.ts`).
- `runInStorageContext(ctx, fn)` → `als.run(ctx, fn)` (returns fn's result;
  generic over async/sync).
- `getStorageContext(): StorageContext | undefined` → `als.getStore()`.
- No import of `projects-dir`/`io` values (type-only from `io`) to avoid cycles.

### 2. `projects-dir.ts` — read `tenantRoot` from context
- Extract today's env/cwd logic into `defaultProjectsDir()` (unchanged behavior).
- `resolveProjectsDir()` keeps its name/zero-arg signature; body becomes
  `getStorageContext()?.tenantRoot ?? defaultProjectsDir()`.

### 3. `io.ts` — resolve adapter from context, module-global as fallback
- Add a private `currentAdapter()` = `getStorageContext()?.adapter ?? adapter`
  (the module-level `let adapter`).
- Point every module-level wrapper (`mkdir`, `writeFile`, `readFile`, `readdir`,
  `stat`, `rm`, `rename`, `fsyncFile`, and the writes inside `atomicWriteFile`)
  at `currentAdapter()` instead of the captured global.
- `getStorageAdapter()` returns `currentAdapter()`; `setStorageAdapter()` is
  **unchanged** — it still mutates the module global, which remains the
  no-context fallback. This is why the 14 existing `setStorageAdapter` tests keep
  passing untouched. The ~6 `io.ts`-consuming modules become context-aware for
  free (they call the wrappers, not the adapter directly).

### 4. Route helper + wrap the 4 tenant-resolving routes
- Add `withStorageContext(handler)` (in `storage-context.ts` or a small
  `frontend/app/api/_tenant/with-storage-context.ts`). It wraps a Next handler of
  any arity: `(...args) => runInStorageContext({ tenantRoot: defaultProjectsDir(),
  adapter: getStorageAdapter() }, () => handler(...args))`. Using the default
  `tenantRoot` keeps behavior identical today; a future auth spec swaps in the
  real per-tenant root here.
- Wrap the exported handlers in:
  - `frontend/app/api/projects/route.ts` (GET, POST)
  - `frontend/app/api/projects/[projectId]/reorder/route.ts` (GET, POST)
  - `frontend/app/api/project/[project-id]/reindex/route.ts` (POST)
  - `frontend/app/api/project/[project-id]/search/route.ts` (GET)

### 5. Out-of-request context establishment (forward-compat, small)
- **CLI** (`cli/src/commands/*` — all 6 already take `projectRoot`): wrap each
  `.action()` body in `runInStorageContext({ tenantRoot: root, adapter:
  getStorageAdapter() }, ...)`. Low behavior impact today (CLI never calls
  `resolveProjectsDir`), included to satisfy the spec's "no silent
  process-default" requirement and to future-proof.
- **Background jobs**: wrap the `runTask` body in `indexer-queue.ts` and the
  recompute callback in `backlinks-watcher.ts` in `runInStorageContext({
  tenantRoot: projectRoot, adapter: getStorageAdapter() }, ...)`, reusing the
  `projectRoot` they already thread. Keeps io.ts reads inside a context for work
  that outlives the originating request.

### 6. Docs
- Add a short `docs/standards/` note (new file or a section in an existing
  standard) documenting: tenant-aware routes must wrap handlers in
  `withStorageContext`; out-of-request entry points must call
  `runInStorageContext`; the context is the sanctioned seam for future
  per-tenant resolution.

## Critical files
- **New:** `frontend/src/lib/models/storage-context.ts`,
  `frontend/tests/unit/storage-context.test.ts`, a `docs/standards/` note,
  (optionally) `frontend/app/api/_tenant/with-storage-context.ts`.
- **Edit:** `frontend/src/lib/models/projects-dir.ts`,
  `frontend/src/lib/models/io.ts`, the 4 route files above,
  `frontend/src/lib/models/indexer-queue.ts`,
  `frontend/src/lib/models/backlinks-watcher.ts`, `cli/src/commands/*` (6).
- **Untouched (deliberately):** the 22 direct-`node:fs` model files,
  `locks.ts`/`meta-locks.ts`, `StorageAdapter` shape, on-disk format,
  `setStorageAdapter` callers in tests.

## Verification
- **FR2 concurrency test** — `frontend/tests/unit/storage-context.test.ts`:
  start two `runInStorageContext` chains with distinct `{tenantRoot, adapter}`,
  interleave them across `await` boundaries (e.g. staggered timers / manual
  promise ordering), assert each observes only its own values throughout; assert
  that with no context, `resolveProjectsDir()`/`getStorageAdapter()` return the
  legacy defaults.
- **No regression** — `pnpm --filter getwrite-frontend test:ci` (all 14
  `setStorageAdapter` adapter tests must stay green), `pnpm typecheck`,
  `pnpm lint`, `pnpm knip` (no new dead exports).
- **CLI smoke** — run `getwrite-cli reindex <projectRoot>` against a scratch
  project; confirm identical behavior.
- **App smoke** — start the dev server, load a project, trigger a
  search/reindex (the wrapped routes); confirm no behavior change and no errors.

## Task list (for the orchestrator)
1. Add `storage-context.ts` (ALS module) + `storage-context.test.ts` with the
   FR2 interleaved-isolation test. (TDD: test first.)
2. `projects-dir.ts`: extract `defaultProjectsDir()`, make `resolveProjectsDir()`
   read `tenantRoot` from context.
3. `io.ts`: route wrappers + `getStorageAdapter()` through `currentAdapter()`;
   leave `setStorageAdapter` as the fallback. Verify all adapter tests green.
4. Add `withStorageContext` helper; wrap the 4 routes.
5. Wrap CLI `.action()` bodies (6 commands) in `runInStorageContext`.
6. Wrap `indexer-queue` `runTask` and `backlinks-watcher` recompute callback.
7. Add the `docs/standards/` note.
8. Full gate: typecheck, lint, `test:ci`, knip; CLI + app smoke.

## Branch
Create `feat/request-scoped-tenant-storage` off `main`; the orchestrator commits
per verified task.

## Deferred (explicitly out of this slice)
Auth layer & `request → userId → dataRoot` mapping; migrating the 22
direct-`node:fs` modules onto the adapter (needed for true per-request adapter
isolation); S3/object-storage adapter; container-per-tenant; local-first sync;
custom ESLint enforcement rule. Note: the finalized spec's FR8/FR13/FR14 were
written before these two scope-downs — flag to spec-manager/scribe to reconcile
the spec text with what shipped (no full migration, no lint rule, 4 routes).
