# Request-Scoped Storage Context

This document applies when adding or modifying Next.js API routes, CLI commands, or
background/queue entry points that resolve a project root or filesystem adapter.

---

## 1. What the Seam Is

`resolveProjectsDir()` (`frontend/src/lib/models/projects-dir.ts`) and
`getStorageAdapter()` (`frontend/src/lib/models/io.ts`) both resolve from an ambient,
`AsyncLocalStorage`-backed `StorageContext` — `{ tenantRoot, adapter }`, defined in
`frontend/src/lib/models/storage-context.ts` — when one is active for the current
async call chain. When no context is active, both fall back to today's process-wide
defaults: `defaultProjectsDir()`'s env-var/cwd resolution for the projects directory,
and the module-level adapter set via `setStorageAdapter()` for the filesystem adapter.

This ambient context is the seam per-tenant storage isolation is built on. See
ADR-017
(`docs/architecture/ADRs/adr-017-request-scoped-directory-per-tenant-storage.md`)
for the seam's original rationale and design, and ADR-018
(`docs/architecture/ADRs/adr-018-tenant-resolution-per-user-data-root.md`) for how
`withStorageContext` now chooses which tenant's `tenantRoot` to bind on each
request (Section 2).

---

## 2. Rule: Tenant-Aware API Routes Must Use `withStorageContext`

Any route handler under `frontend/app/api/**/route.ts` that calls
`resolveProjectsDir()` — directly, or transitively through a model-layer function
that expects an ambient context — must export its handler wrapped in
`withStorageContext(...)`, imported from
`frontend/app/api/_tenant/with-storage-context.ts`.

- Do not duplicate an inline `runInStorageContext(...)` call inside the handler body.
- Do not rely on a `middleware.ts` to establish context — this repo has none, and
  this feature does not add one.

Matches the pattern used in `frontend/app/api/projects/route.ts`:

```ts
import { withStorageContext } from "../_tenant/with-storage-context";

async function getProjects() {
  const projectsDir = resolveProjectsDir();
  // ...
}

export const GET = withStorageContext(getProjects);
export const POST = withStorageContext(createProject);
```

As of ADR-018, the `tenantRoot` `withStorageContext` binds is not a hardcoded
`defaultProjectsDir()` call — it is derived per-request by
`resolveTenant(request)` (`frontend/app/api/_tenant/resolve-tenant.ts`):

- A request with no resolved identity (`userId === null` — the Electron/
  local-dev case) resolves `tenantRoot` to `defaultProjectsDir()`, byte-for-byte
  identical to the seam's original behavior.
- A request with a resolved, validated `userId` resolves `tenantRoot` to
  `<data-root>/<userId>/` (`GETWRITE_DATA_ROOT` joined with the validated user
  id), guarded by a path-traversal allowlist and provisioned with an
  idempotent `mkdir(recursive)` on that user's first request. See ADR-018
  (`docs/architecture/ADRs/adr-018-tenant-resolution-per-user-data-root.md`)
  and `frontend/src/lib/models/tenant-path.ts` for the validation/derivation
  logic.

Identity itself comes from the pluggable `IdentitySource` interface
(`frontend/app/api/_tenant/identity-source.ts`), selected via
`getIdentitySource()` — the single swap point for a future real auth
provider. Route authors calling `withStorageContext` do not need to know any
of this; it is internal to the wrapper.

---

## 2a. Rule: Project-Scoped Routes Must Derive `projectRoot` From a Validated `projectId`

`withStorageContext` binds a *tenant's* root (`tenantRoot`); it says nothing about
which *project* within that root a request targets. As of the tenant-route-
enforcement work, every project-scoped route under `frontend/app/api/**/route.ts`
resolves its project directory the same way:

```ts
import { validateProjectId, respondInvalidProjectId, InvalidProjectIdError }
  from "../../../src/lib/models/project-path";

const validatedProjectId = validateProjectId(projectId); // throws InvalidProjectIdError
const projectRoot = path.join(resolveProjectsDir(), validatedProjectId);
```

`validateProjectId` (`frontend/src/lib/models/project-path.ts`) requires the
client-supplied `projectId` to be a well-formed UUID — the same shape every
project directory is named on disk — reusing the `UUID` Zod validator from
`schemas.ts`. Anything else throws `InvalidProjectIdError`, which route handlers
catch and turn into `respondInvalidProjectId()`, a fixed, uniform
`400 { "error": "Invalid projectId" }` response that does not vary based on
whether a same-shaped project actually exists (so it can't be used to probe for
project existence).

This is a hard cutover: these routes no longer accept a client-supplied absolute
`projectRoot`/`projectPath` in the request body or query string. `projectId` is
the only accepted shape. The exceptions — routes that predate this migration and
were deliberately left out of scope — are:
`frontend/app/api/projects/route.ts`,
`frontend/app/api/projects/[projectId]/reorder/route.ts` (still resolves via
`projectId` but keeps a legacy `projectRoot` body fallback),
`frontend/app/api/project/[project-id]/reindex/route.ts`, and
`frontend/app/api/project/[project-id]/search/route.ts`.

**Client-side counterpart.** Do not send `project.id` (the `StoredProject.id`
field mirrored from `project.json`'s internal `id`) to these routes — it is a
*different* UUID from the project's on-disk directory name, and sending it is a
silent failure (wrong-or-missing directory), not an auth error. The one
sanctioned way to obtain the directory id client-side is the Redux selector
`selectActiveProjectDirectoryId` (`frontend/src/store/projectsSlice.ts`), which
computes `path.basename(rootPath)` on the active project's root path (via the
`getProjectDirectoryId` helper in the same file — implemented as string
splitting rather than importing `path`, since this slice is bundled into the
client). Every client call site sending a tenant-scoped `projectId` to one of
these routes must go through this selector (or `getProjectDirectoryId` directly,
for a project record that isn't the Redux-selected active project).

---

## 3. Rule: Out-of-Request Entry Points Must Use `runForTenant`

Code that runs outside an inbound HTTP request — CLI commands under
`cli/src/commands/*`, the indexer queue, the backlinks watcher, and any future
background job — must establish its own storage context. Use `runForTenant`
(the imperative sibling of `withStorageContext`, exported from `io.ts` /
`@gw/core`) rather than hand-writing the context literal:

```ts
runForTenant(projectRoot, () => /* work */);
```

- `runForTenant` derives `tenantRoot` as `path.dirname(projectRoot)` so it matches
  the value `resolveProjectsDir()` returns in a request (the *parent* dir that
  contains project folders), keeping route and non-route contexts consistent.
- Call it at the point where a concrete project root is available.
- Scope it to the smallest unit of work: a single CLI command invocation, a single
  queued indexing task, a single recompute callback.
- Do not hold a context as long-lived or shared across multiple units of work.
- Do not duplicate the raw `runInStorageContext({ tenantRoot, adapter }, ...)`
  literal at call sites — that is what `runForTenant` exists to prevent.

**Deferred work must capture the adapter early.** `runForTenant`'s adapter
defaults to whatever is active at the call site — correct for synchronous entry
points (a CLI `.action()`). But work that runs *later* (a queue drain, a debounce
timer) executes with no ambient context, so the default would resolve to the
module fallback rather than the enqueuing scope's adapter. Capture the adapter at
enqueue/watch time and pass it as the third argument:

```ts
const adapter = getStorageAdapter();      // captured in the request scope
queue.push({ projectRoot, resourceId, adapter });
// …later, at drain time:
runForTenant(task.projectRoot, () => /* work */, task.adapter);
```

Real examples: `cli/src/commands/prune.ts` (wraps the `.action()` body per
invocation, default adapter), `frontend/src/lib/models/indexer-queue.ts` (captures
the adapter in `enqueueIndex` and passes it to `runForTenant` in `runTask`), and
`frontend/src/lib/models/backlinks-watcher.ts` (captures the adapter when the
watcher starts and passes it to each debounced recompute).

---

## 4. No Silent Fallback for Tenant-Scoped-Required Paths

Today's fallback — resolving to `defaultProjectsDir()` / the module-level adapter
when no context is active — legitimately mirrors legacy single-tenant behavior
byte-for-byte, and is correct and intentional for Electron and local dev.

For future work: if a code path requires a tenant-scoped context and has no defined
fallback, it must fail with an explicit, identifiable error rather than silently
resolving to the process-default projects directory. Do not add a new fallback that
masks a missing context for such paths.

`resolveTenant` (ADR-018) is a concrete instance of this rule: a non-null
`userId` that fails the path-traversal allowlist, or a missing/empty
`GETWRITE_DATA_ROOT`, throws `TenantResolutionError`
(`frontend/src/lib/models/tenant-path.ts`) rather than falling back to
`defaultProjectsDir()`.

---

## 5. This Is a Seam, Not Full Isolation

Roughly twenty model files under `frontend/src/lib/models/` call
`node:fs`/`node:fs/promises` directly rather than going through `io.ts`'s
`StorageAdapter`. These are not covered by `StorageContext` and were deliberately
not migrated in this slice — a documented, approved scope-down.

Tenant isolation today is delivered through `tenantRoot` (the resolved directory
path): every model file respects it because they all take `projectRoot`/paths as
explicit parameters. `StorageContext`'s `adapter` field is the seam for a future
non-filesystem backend (e.g. S3), not yet a completed migration. Do not treat the
presence of this context as proof that a given model function is adapter-routed —
check whether it imports from `io.ts` or calls `node:fs`/`node:fs/promises` directly.

---

## 6. When In Doubt

Any code path that — directly or transitively — reaches `resolveProjectsDir()` or
`getStorageAdapter()` without an ambient context already established by a caller
needs one established somewhere in its call chain, at the earliest point where a
concrete tenant root is known.

- Inbound HTTP route handler → wrap with `withStorageContext` (Section 2).
- CLI command, queue task, timer callback → call `runForTenant` at the point the
  root is known, capturing the adapter early for deferred work (Section 3).
- Neither applies and no root is known yet → do not resolve; propagate the concrete
  root further up the call chain until one of the above applies.
