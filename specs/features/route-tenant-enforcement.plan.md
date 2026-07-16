# Implementation Plan: 29-Route Tenant Enforcement (Completes ADR-018)

Spec: `specs/features/route-tenant-enforcement.md` · Builds on: ADR-017, ADR-018,
`specs/features/tenant-resolution.md`
Suggested branch: `feat/route-tenant-enforcement` (off `main`, after
`feat/tenant-resolution` merges)

## Design summary

`withStorageContext` and `resolveProjectsDir()` already exist and are correct;
this feature's work is entirely at the route and client-transport layer. It
decomposes into three phases:

- **Phase 0 — shared guard** (Task 1): one `validateProjectId` function, unit
  tested against the same class of adversarial input `validateUserId` already
  covers, plus the shared `respondInvalidProjectId()` 400 helper (spec FR4),
  so every later task has a guard and a response emitter to import rather
  than inventing its own check or status code.
- **Phase 1 — server migration** (Tasks 2–7): the 29 routes, migrated in six
  independently-shippable batches grouped by directory/handler shape and
  existing test-file coverage. Each batch task wraps its routes' handlers in
  `withStorageContext`, replaces `projectRoot` body reads with a validated
  `projectId` + direct join, and extends existing test files rather than
  adding new ones where coverage already exists.
- **Phase 2 — client migration** (Tasks 8–9): a new centralized
  `selectActiveProjectDirectoryId` selector (Task 8, spec FR12), then the 26
  call sites across 7 files switched from sending `projectRoot` to sending
  `projectId` sourced through that selector, sequenced after the routes they
  call are migrated so no intermediate commit ships a client sending a body
  shape no route yet accepts.
- **Phase 3 — verification** (Task 10): full-suite green plus an explicit
  byte-for-byte regression check of the default/desktop path.

Every task assumes `projectId` is a UUID string equal to a project's folder
name under `resolveProjectsDir()` (confirmed by `projects/route.ts`'s existing
`path.join(resolveProjectsDir(), id)` convention) — no task re-derives this.
Per spec FR12, that folder name is **not** the same UUID as `project.json`'s
internal `id` field (they are independently generated); server-side tasks
receive `projectId` as an opaque string and don't need to care which UUID it
is, but client-side tasks (8–9) must source it from
`selectActiveProjectDirectoryId`, never from `project.id`.

**Location decided:** `validateProjectId` (and the shared
`respondInvalidProjectId()` 400 helper, FR1/FR4) live in a new module,
`frontend/src/lib/models/project-path.ts`, not `tenant-path.ts`.
`tenant-path.ts` is scoped to the tenant boundary (multi-tenant hosting);
`projectId` validation is the project boundary, which exists identically in
the single-tenant/desktop case. This was an open question in the spec draft
and is now resolved — no relocation is expected.

**Resource-route project-id sourcing decided:** Task 7 (Batch F) has the
client continue sending `projectId` in the body (or query string) alongside
the `resource-id` URL param. No resource→project index is built by this
feature; every such call site already has the owning project's `rootPath` in
scope on the client. This was an open question in the spec draft and is now
resolved (spec FR3, FR12).

## Tasks (TDD; each ends green on
`pnpm --filter getwrite-frontend typecheck && lint && test:ci`)

### Task 1 — `validateProjectId` guard + `respondInvalidProjectId()` helper (FR1, FR4, FR9)
New `frontend/src/lib/models/project-path.ts`:
- `export class InvalidProjectIdError extends Error` (or reuse a shared typed
  error shape if one exists) — typed, identifiable, distinct from a generic
  `Error`.
- `export function validateProjectId(projectId: string): string` — returns
  `projectId` unchanged iff `UUID.safeParse(projectId).success` (reusing the
  existing `UUID` Zod validator from `frontend/src/lib/models/schemas.ts`);
  otherwise throws `InvalidProjectIdError`. No normalization, trimming, or
  partial acceptance.
- `export function respondInvalidProjectId(): Response` (or the project's
  standard route-response helper shape) — the single, shared emitter of the
  uniform 400 response required by spec FR4. Colocated with
  `validateProjectId` in the same module so all 29 routes import both from
  one place; must not leak whether a directory of that shape exists on disk.
  This is a new deliverable of this task, not present in the pre-resolution
  draft of this plan.
- Tests (new `frontend/tests/unit/project-path.test.ts`): `validateProjectId`
  rejects `../otherProject`, `../../etc`, `/etc/passwd`, `..%2Fother`, an
  embedded null byte, `""`, `foo/bar`, and a non-UUID plain string; accepts a
  well-formed UUID v4 string unchanged. `respondInvalidProjectId()` returns a
  400 with a body that does not vary based on whether a same-shaped directory
  exists.
- Module location (`frontend/src/lib/models/project-path.ts`, not
  `tenant-path.ts`) is decided per the spec's Functional Requirements (FR1) —
  not an open question for this task.

### Task 2 — Batch A: compile routes (FR2, FR3, FR4, FR5, FR8)
Migrate `compile/docx`, `compile/markdown`, `compile/pdf`, `compile/text`
under `frontend/app/api/compile/`:
- Wrap each exported handler in `withStorageContext`.
- Replace the body's `projectRoot` read with `projectId`, validated via
  `validateProjectId` (Task 1), then
  `const projectRoot = path.join(resolveProjectsDir(), projectId)`.
- A `validateProjectId` throw must be caught and turned into the shared
  `respondInvalidProjectId()` 400 response (Task 1) before any filesystem
  access — uniform across all 29 routes per spec FR4, not a per-route status
  choice. A valid-shape-but-nonexistent `projectId` is unaffected by this and
  keeps each route's existing not-found/other convention (spec FR4, FR5).
- Extend `frontend/tests/unit/compile-markdown-route.test.ts` with
  `projectId`-based request cases (happy path + guard-rejection case); add
  equivalent coverage for docx/pdf/text (new test files if none exist, per
  `docs/standards/testing.md`).
- **Done when:** all 4 routes take `projectId`, no longer read `projectRoot`,
  and `pnpm --filter getwrite-frontend test:ci` passes for this batch's tests.

### Task 3 — Batch B: export routes (FR2, FR3, FR4, FR5, FR8)
Migrate `export/markdown`, `export/text` under `frontend/app/api/export/`,
same pattern as Task 2.
- Extend `frontend/tests/unit/export-markdown-route.test.ts` and
  `export-text-route.test.ts` with `projectId`-based cases.
- **Done when:** both routes migrated and their existing test files pass with
  new `projectId` coverage added.
- **Depends on:** Task 1.

### Task 4 — Batch C: project-level routes (FR2, FR3, FR4, FR5, FR8)
Migrate `project/delete`, `project/editor-config`, `project/features`,
`project/metadata-schema`, `project/preferences`, `project/rename`,
`project/revision-settings`, and `project` (route.ts) — 8 routes.
- Same wrap/validate/join pattern as Task 2.
- Extend `frontend/tests/unit/metadata-schema-api.test.ts` and
  `revision-settings-api.test.ts` (already cover 2 of these 8) with
  `projectId` cases; add coverage for the remaining 6 routes, preferring an
  existing file if one already targets them, else a new one per route or per
  logical group.
- **Done when:** all 8 routes migrated; this batch's tests green.
- **Depends on:** Task 1.

### Task 5 — Batch D: tags + query routes (FR2, FR3, FR4, FR5, FR8)
Migrate `project/tags`, `project/tags/assign`, `project/tags/delete`,
`project/query/evaluate`, `project/query/saved` — 5 routes.
- Same pattern as Task 2.
- Extend `frontend/tests/unit/tags-api.test.ts` and `query-routes.test.ts`
  (already cover these) with `projectId` cases.
- **Done when:** all 5 routes migrated; `tags-api.test.ts` and
  `query-routes.test.ts` green with new coverage.
- **Depends on:** Task 1.

### Task 6 — Batch E: project-resources routes (FR2, FR3, FR4, FR5, FR8)
Migrate `project-resources` and `project-resources/excerpts` — 2 routes.
- Same pattern as Task 2.
- Add or extend a test file covering both (no existing dedicated test file
  identified for this pair — create one if none exists, per
  `docs/standards/testing.md`).
- **Done when:** both routes migrated and covered by a green test file.
- **Depends on:** Task 1.

### Task 7 — Batch F: resource routes (FR2, FR3, FR4, FR5, FR8)
Migrate `resource` (route.ts), `resource/[resource-id]` (route.ts),
`resource/[resource-id]/delete`, `resource/[resource-id]/rename`,
`resource/[resource-id]/file`, `resource/[resource-id]/sidecar`,
`resource/revision/[resource-id]`, `resource/upload` — 8 routes.
- Same wrap/validate/join pattern as Task 2. `resource-id` continues to come
  from the URL param as it does today; `projectId` is read from the request
  body (or query string for `GET`-shaped routes) and validated the same way.
- **Decided (spec FR3):** these routes continue to receive `projectId` from
  the client explicitly alongside `resource-id` — no resource→project index
  is built by this feature. Every such call site already has the owning
  project's `rootPath` in scope on the client (see Task 8/9's corresponding
  client changes). This was an open question in the spec draft; it is now
  settled and this task's approach is final, not provisional.
- Extend `frontend/tests/unit/media-file-route.test.ts`,
  `media-upload-route.test.ts`, and `revision-route-canonical.test.ts`
  (already cover 3 of these 8) with `projectId` cases; add coverage for the
  remaining 5 routes.
- **Done when:** all 8 routes migrated; this batch's tests green.
- **Depends on:** Task 1.

### Task 8 — Selector + client migration, part 1: resourcesSlice + hooks (FR6, FR7, FR12)
**First, add the centralized selector required by spec FR12** (this must
land before any call site is switched, since Task 9 also depends on it):
- New `selectActiveProjectDirectoryId` selector (colocated with the other
  `projectsSlice` selectors) computing `path.basename(rootPath)` from the
  active project's `rootPath` — never `project.id`. This is the ONE place
  the directory-basename-vs-`project.json`-id divergence (spec FR12) is
  handled; no call site may inline `path.basename(...)` or read `project.id`
  directly.
- Unit test for the selector, covering a `rootPath` whose basename differs
  from `project.id` (asserting the selector returns the basename, not the
  id).

Then update client call sites to send `projectId` (via the new selector)
instead of `projectRoot`:
- `frontend/src/store/resourcesSlice.ts` (3 call sites)
- `frontend/components/ResourceTree/useResourceReorder.ts` (1 call site)
- `frontend/components/Start/StartPage.tsx` (1 call site)
- Every call site in this task sources `projectId` from
  `selectActiveProjectDirectoryId`, not from `project.id` and not from an
  inline `path.basename(...)`. (The spec's earlier open question on sourcing
  mechanism is resolved: centralized selector, not per-site derivation.)
- **Done when:** the selector exists with its unit test, none of these 3
  files send `projectRoot` to any of the routes migrated in Tasks 2–7, and
  existing tests for these files/hooks pass with updated request-shape
  assertions.
- **Depends on:** Tasks 2–7 (the routes these files call must already accept
  `projectId`).

### Task 9 — Client migration, part 2: WorkArea components (FR6, FR7, FR12)
Update the remaining 4 files (22 call sites total):
- `frontend/components/WorkArea/DiffViewController.tsx` (4 call sites)
- `frontend/components/WorkArea/EditView.tsx` (2 call sites)
- `frontend/components/WorkArea/useCanonicalAutosave.ts` (5 call sites)
- `frontend/components/WorkArea/useRevisionContent.ts` (10 call sites,
  including the resource routes from Task 7, which — per Task 7's decided
  approach — expect `projectId` sent explicitly alongside `resource-id`)
- Every call site in this task sources `projectId` from
  `selectActiveProjectDirectoryId` (Task 8), the same as Task 8's call
  sites — no independent derivation.
- **Done when:** none of these 4 files send `projectRoot` to any of the 29
  migrated routes; existing component/hook tests pass with updated
  request-shape assertions.
- **Depends on:** Task 8 (selector must exist before these call sites are
  switched) and Tasks 2–7.

### Task 10 — Full-suite verification + default-path regression check (FR5, FR10, FR11)
- `pnpm --filter getwrite-frontend typecheck && lint && test:ci` green.
- With no `GETWRITE_DATA_ROOT` set, manually or via a scripted check: create a
  project, write a resource, read it back, confirm the on-disk path and
  content are identical to pre-migration behavior (`resolveProjectsDir()`
  still resolves to `defaultProjectsDir()`).
- Confirm `runForTenant`, CLI commands, indexer queue, and backlinks watcher
  are untouched (no diff outside `frontend/app/api/**`, the 7 client files,
  Task 1's new module, Task 8's new selector + test, and their test files).
- **Done when:** full suite is green and the default-path check passes with
  no observable difference from pre-migration behavior.
- **Depends on:** Tasks 1–9.

## Out of scope (per spec Non-goals)
Auth/identity layer changes; migrating `node:fs`-direct model modules onto
`StorageAdapter`; refactoring the 2 already-migrated scan-based routes
(`reindex`, `search`) or removing `reorder`'s `projectRoot` back-compat
fallback; designing version-skew tolerance for a rolling hosted deployment;
any change to `StorageContext`, `runInStorageContext`, `runForTenant`, CLI
commands, the indexer queue, or the backlinks watcher.

## Documentation (deferred to a later stage)
`docs/standards/storage-context.md` should eventually note that all
project-scoped routes (not just the original 4) now derive `projectRoot` from
a validated `projectId` via `frontend/src/lib/models/project-path.ts`
(location now decided, see Design summary), and should reference the FR12
directory-basename-vs-`project.json`-id distinction and
`selectActiveProjectDirectoryId` as the one sanctioned way to derive it on
the client. Handled by the Document stage, not these execute tasks.
