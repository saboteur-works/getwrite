# Task List: Trash UI Follow-ups

Source spec: `specs/features/trash-ui-followups.md` (follow-up to Feature 26,
Gate 3 approved 2026-09-14). All 5 open questions on the source spec (OQ-1
through OQ-5) are resolved there by owner decision; this task list does not
reopen or re-answer any of them. FR-8 and FR-9 are recorded verification/
closure results with no implementation — see the FR coverage map at the
bottom; no task below targets them.

**Placement decision:** no new top-level model file is added. FR-1 threads an
existing field (`RestoreResourceResult.restoredName` /
`RestoreFolderResult.restoredName`, already present in
`frontend/src/lib/models/trash.ts` since Feature 26) outward through the
route and client response shapes that currently drop it — `trash.ts` itself
is not edited by this feature. FR-3 adds one new thin-wrap core function,
`softDeleteFolderCore`, directly to the existing
`frontend/src/lib/models/resource-crud-core.ts`, mirroring
`renameFolderCore`'s exact shape (`resolveResourceProjectRootOrThrow` plus one
call into an existing model function) — no new file.

**Barrel check (confirmed, no edit needed):** `frontend/src/lib/core.ts` is
the CLI-facing `@gw/core` barrel. `softDeleteFolderCore` (Task 3) is consumed
only by the folder-delete API route and the native resource backend, neither
of which imports through `core.ts` — confirmed by reading both call sites
before writing this list. No task in this feature touches `core.ts`.

**`frontend/src/store/resourcesSlice.ts` check (confirmed, no edit needed):**
FR-10 needs a value that changes on every delete, not a slice change.
`removeResource` (`resourcesSlice.ts:169-178`) already filters both
`state.resources` and `state.folders` on every delete, including a folder's
cascaded descendants (shipped in Feature 26). Task 6 reads this via
`useAppSelector` from `TrashView.tsx`; the slice itself is not written by any
task here.

**Shared-file caution (schedule sequentially, not concurrently):** the
following files are touched by more than one task below and must not be
edited by two tasks running in parallel worktrees — each later-touching task
depends (directly or transitively) on the earlier one specifically to avoid
this:

- `frontend/src/lib/api/resources.ts` — Task 3 adds `deleteFolder` to
  `ResourcesTransport`/`httpResourcesTransport`/`resolveResourcesTransport`
  (today it bypasses the transport entirely — a bare `fetch` call with no
  `ResourcesTransport` entry, per the spec's own evidence). Task 4 then edits
  the same file's `remove` and `deleteFolder` bodies to throw on a non-2xx
  response. Task 4 depends on Task 3 so it edits the post-collapse
  `deleteFolder`, not the pre-collapse bare-`fetch` version. No other task
  touches this file.
- `frontend/components/WorkArea/Views/TrashView/TrashView.tsx` — Task 1
  changes `buildRestoreNotices`' renamed-notice text to read
  `result.restoredName` instead of synthesizing `"${name} (restored)"`. Task 6
  adds a `useAppSelector` read plus a refetch effect. Task 6 depends on Task 1
  so the two edits never land as concurrent changes to this one file. Task 5
  (page.tsx) and Task 2 (ShellModalCoordinator.tsx) do not touch this file.
- `frontend/tests/component/TrashView.test.tsx` — extended by both Task 1
  (restoredName notice assertion) and Task 6 (refetch-on-delete assertion),
  for the same reason and in the same order: Task 6 depends on Task 1.
- No other file in this feature's scope is written by more than one task:
  `frontend/app/api/project/[project-id]/trash/restore/route.ts` and
  `frontend/src/lib/api/trash.ts` (Task 1 only);
  `frontend/components/Layout/ShellModalCoordinator.tsx` (Task 2 only);
  `frontend/src/lib/models/resource-crud-core.ts`,
  `frontend/app/api/folder/[folder-id]/delete/route.ts`, and
  `frontend/src/store/transport/native-resource-backend.ts` (Task 3 only);
  `frontend/app/(app)/page.tsx` (Task 5 only).
- No task adds a new `package.json` dependency and no task needs
  `pnpm install` — everything used (`@testing-library/react`, existing
  transport/core primitives) is already a direct dependency. If
  implementation discovers a genuine new-package need, per this list's
  constraints it must become its own first task, owned alone, with exact
  versions and a `package-selection.md` justification, and every task below
  renumbered/re-dependencied accordingly.
- `knip.json` — not expected to need an edit (every function this feature
  adds — `softDeleteFolderCore`, `ResourcesTransport.deleteFolder` — already
  has a real call site by the task that adds it). Task 7's gate runs a
  scoped `knip` check and only touches `knip.json` if that check surfaces a
  genuine finding.

**Test locations:** unit tests (pure function / transport-body assertions)
live under `frontend/tests/unit/`; multi-step route/model integration tests
live under `frontend/tests/integration/`; component tests for
`TrashView`/`ShellModalCoordinator` live under `frontend/tests/component/` and
the repo-root `frontend/tests/` (matching each component's existing test file
location, confirmed by reading each file before adding to it). All run via
`pnpm --filter getwrite-frontend exec vitest run <path>`. Per the trash-ui
task list's recorded lesson, any check that starts a dev server or touches
`cli/tests/qa/*` must run from the **main worktree**, not an agent worktree
under `.claude/worktrees/` — this feature adds no CLI surface, so only Task 7
(the full gate, which also runs the CLI/Electron suites unchanged as a
regression check) needs this restated.

### Task 1: Thread `restoredName` through the restore route, client, and TrashView notice (FR-1)

**What:** `RestoreResourceResult.restoredName` / `RestoreFolderResult.restoredName`
(`frontend/src/lib/models/trash.ts`, unchanged by this task — the field
already exists there) is dropped at two hops: the restore route's own
`RestoreItemResult` interface and `restoreOne` function
(`frontend/app/api/project/[project-id]/trash/restore/route.ts`) do not
include it in either the resource or folder branch's returned object, and the
client-facing `RestoreItemResult` interface
(`frontend/src/lib/api/trash.ts`) does not declare it either. This task adds
`restoredName: string` to both `RestoreItemResult` interfaces, populates it
from `restoreResource`'s/`restoreFolder`'s existing result in both of
`restoreOne`'s branches, and changes `TrashView.tsx`'s `buildRestoreNotices`
to render `result.restoredName` in its `renamed`-notice text instead of
synthesizing `` `${name} (restored)` `` — which today always shows the
first-collision suffix even when `models/trash.ts`'s
`resolveRestoreCollisionName` actually resolved to `" (restored 2)"`,
`" (restored 3)"`, etc. on a repeat collision.
**Files:**
`frontend/app/api/project/[project-id]/trash/restore/route.ts`,
`frontend/src/lib/api/trash.ts`,
`frontend/components/WorkArea/Views/TrashView/TrashView.tsx`,
`frontend/tests/integration/trash-routes.test.ts`,
`frontend/tests/unit/trash-api-client.test.ts`,
`frontend/tests/component/TrashView.test.tsx`.
**Done when:**
1. A new regression test in `trash-routes.test.ts` restores two same-named
   items in sequence (mirroring the collision fixture pattern
   `trash-restore.test.ts` already uses against `models/trash.ts` directly)
   and asserts the route's JSON response carries `restoredName: "X (restored)"`
   for the first and `restoredName: "X (restored 2)"` for the second — this
   test fails against the pre-fix route, which omits the field entirely.
2. A new test in `trash-api-client.test.ts` asserts `restoreTrashItems`'s
   resolved array preserves a `restoredName` field from a mocked `fetch`
   response.
3. A new test in `TrashView.test.tsx` mocks a `restoreTrashItems` result with
   `renamed: true, restoredName: "X (restored 2)"` and asserts the rendered
   notice text contains `"X (restored 2)"`, not the hardcoded
   `"X (restored)"` the pre-fix code always shows — this test fails against
   the pre-fix `buildRestoreNotices`.
4. `pnpm --filter getwrite-frontend exec vitest run trash-routes
   trash-api-client TrashView` passes.
5. `pnpm --filter getwrite-frontend lint` passes with 0 errors.
6. `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none
**Estimate:** 3
**POS:** task_c6228e07
**Done:** [ ]

### Task 2: Folder-specific delete confirmation wording (FR-2)

**What:** `ShellModalCoordinator.tsx`'s `"delete"` `ConfirmDialog`
(`:195-212`) always renders the fixed description "This will remove the
resource. Proceed?", regardless of whether the target is a resource or a
folder. Per resolved OQ-5, the dialog's `description` now checks
`folders?.some((f) => f.id === contextAction.resourceId)` — the coordinator
already receives a `folders` prop (`:104, :180`) — and renders exactly "This
will move the folder and everything in it to Trash. Proceed?" when true,
keeping the existing resource wording otherwise. This mirrors the same
`isFolder` check `resourcesSlice.ts`'s `removeResource` already uses (`:171`).
**Files:** `frontend/components/Layout/ShellModalCoordinator.tsx`,
`frontend/tests/shellModalCoordinator.test.tsx`.
**Done when:**
1. A new test renders `ShellModalCoordinator` with `contextAction: { open:
   true, action: "delete", resourceId: "folder-1" }` and a `folders` prop
   containing `{ id: "folder-1", ... }`, and asserts the dialog's rendered
   description is exactly "This will move the folder and everything in it to
   Trash. Proceed?" — this test fails against the pre-fix component, which
   renders the resource wording unconditionally.
2. A second test with the same `contextAction` but a `folders` prop that does
   not contain `"folder-1"` (or an empty array) asserts the description
   remains exactly "This will remove the resource. Proceed?", confirming the
   existing resource path is unchanged.
3. `pnpm --filter getwrite-frontend exec vitest run shellModalCoordinator`
   passes.
4. `pnpm --filter getwrite-frontend lint` passes with 0 errors.
5. `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none
**Estimate:** 2
**POS:** task_8c23ba89
**Done:** [ ]

### Task 3: `softDeleteFolderCore`, native backend, and `deleteFolder` through `ResourcesTransport`/`createTransport` (FR-3)

**What:** Per resolved OQ-1, adds `softDeleteFolderCore(projectId,
folderId)` to `resource-crud-core.ts` as a thin wrap —
`resolveResourceProjectRootOrThrow` plus one call into the existing
`softDeleteFolder(projectRoot, folderId)` model function
(`trash.ts:420-520`, unchanged) — mirroring `renameFolderCore`'s own shape
(`resource-crud-core.ts:447-455`). The folder-delete route
(`app/api/folder/[folder-id]/delete/route.ts`), which today calls
`softDeleteFolder` directly, is changed to call this new core instead. `
deleteFolder` (`frontend/src/lib/api/resources.ts`) today bypasses the
`ResourcesTransport`/`createTransport` collapse entirely — a bare `fetch`
call with no transport entry, confirmed by reading the file (`:388-397`,
its own doc comment says so explicitly) — unlike every other function in
that file. This task adds a `deleteFolder` method to the `ResourcesTransport`
interface, an `httpResourcesTransport.deleteFolder` implementation carrying
the same POST body verbatim, and rewrites the exported `deleteFolder`
function to resolve through `resolveResourcesTransport()` like `deleteResource`
already does. A new native-path implementation is added to
`native-resource-backend.ts`, calling `softDeleteFolderCore` — mirroring
`remove`'s existing native method, which calls `deleteResourceCore`.
**Files:** `frontend/src/lib/models/resource-crud-core.ts`,
`frontend/app/api/folder/[folder-id]/delete/route.ts`,
`frontend/src/lib/api/resources.ts`,
`frontend/src/store/transport/native-resource-backend.ts`,
`frontend/tests/unit/resource-crud-core-delete-folder.test.ts` (new),
`frontend/tests/unit/resources-api-delete-folder.test.ts`,
`frontend/tests/integration/folder-delete-route.test.ts`.
**Done when:**
1. A new test in `resource-crud-core-delete-folder.test.ts` calls
   `softDeleteFolderCore(projectId, folderId)` against a fixture folder with
   a nested resource and asserts the folder and its descendant are moved into
   `.trash/`, matching `softDeleteFolder`'s existing documented behavior
   (confirming the thin wrap resolves the project root correctly and
   delegates without altering the result).
2. `folder-delete-route.test.ts` is updated (existing assertions preserved)
   to confirm the route now calls `softDeleteFolderCore` — e.g. via a spy on
   the core export, or by asserting the route's behavior is byte-identical
   to before the change — rather than calling `softDeleteFolder` directly.
3. `resources-api-delete-folder.test.ts` gains a test asserting `deleteFolder`
   resolves via `resolveResourcesTransport()` (e.g. by mocking the transport
   module the way `resources-api.test.ts`'s existing tests mock `fetch`
   through `httpResourcesTransport`, or by asserting the native transport
   path — selected via the existing `createTransport` runtime switch used by
   every other method in this file — dispatches to a `deleteFolder` method)
   rather than calling `fetch` directly.
4. A new test confirms `native-resource-backend.ts`'s `deleteFolder` method
   calls `softDeleteFolderCore` (mirroring the existing pattern used for
   `remove`/`deleteResourceCore` in the same file's test coverage).
5. `pnpm --filter getwrite-frontend exec vitest run
   resource-crud-core-delete-folder resources-api-delete-folder
   folder-delete-route` passes.
6. `pnpm --filter getwrite-frontend lint` passes with 0 errors.
7. `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none
**Estimate:** 5
**POS:** task_7bb54199
**Done:** [ ]

### Task 4: Non-2xx rejection for HTTP `remove` and `deleteFolder` (FR-4)

**What:** `httpResourcesTransport.remove` (`resources.ts:216-222`) and the
`deleteFolder` implementation Task 3 just added both currently treat any
settled `fetch` — including a non-2xx response — as success, since neither
checks `response.ok`. This task makes both throw on a non-2xx response,
mirroring the `throw new Error(...)` pattern `httpResourcesTransport.copy`'s
sibling methods and `lib/api/trash.ts`'s `httpTrashTransport` already use
elsewhere in this codebase.
**Files:** `frontend/src/lib/api/resources.ts`,
`frontend/tests/unit/resources-api-delete-folder.test.ts`,
`frontend/tests/unit/resources-api.test.ts`.
**Done when:**
1. A new test in `resources-api-delete-folder.test.ts` mocks `fetch` to
   resolve with `{ ok: false, status: 500 }` and asserts `deleteFolder(...)`
   rejects — this test fails against the pre-fix `deleteFolder`, which
   resolves silently on any settled response.
2. A new test in `resources-api.test.ts` mocks `fetch` to resolve with
   `{ ok: false, status: 500 }` and asserts `deleteResource(...)` (which
   calls `transport.remove` internally) rejects — this test fails against
   the pre-fix `remove`.
3. The existing success-path tests in both files (mocking `{ ok: true }`)
   continue to pass unchanged.
4. `pnpm --filter getwrite-frontend exec vitest run resources-api
   resources-api-delete-folder` passes.
5. `pnpm --filter getwrite-frontend lint` passes with 0 errors.
6. `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** 3
**Estimate:** 3
**POS:** task_1cf310b1
**Done:** [ ]

### Task 5: `page.tsx`'s delete branch — no state change on failure, tell the writer (FR-5)

**What:** `handleResourceAction`'s `"delete"` branch
(`app/(app)/page.tsx:653-731`) calls `await deleteFolder(...)` or `await
deleteResource(...)` with no `try`/`catch`, then unconditionally updates
`setProjects`, `setSelectedProject`, and dispatches `removeResource`/
`removeResourceFromStore` — so, after Task 4 makes those calls reject on a
non-2xx response, a rejection would propagate as an unhandled promise
rejection while local/Redux state has already been left exactly as it was
(the mutations happen unconditionally after the `await`, so a rejection
before them means no mutation runs — but the writer sees nothing:
no error toast, and (depending on how the rejection is handled upstream) a
possible unhandled-rejection console error). This task wraps both the folder
and resource `await deleteFolder/deleteResource(...)` calls in a `try`/`catch`
so that on rejection: no `setProjects`/`setSelectedProject`/Redux dispatch
runs (the item stays visible in the tree, matching FR-5's "does not remove ...
from state" requirement precisely, since today's code already doesn't mutate
state before the await — the fix is to *catch* the rejection cleanly rather
than let it propagate unhandled, and to surface it), and
`toastService.error(...)` is called with a message naming the failure,
consistent with the existing `toastService.success(...)` pattern already used
for the success cases in the same function.
**Files:** `frontend/app/(app)/page.tsx`,
`frontend/tests/component/page-delete-failure.test.tsx` (new — no existing
test file renders `Page`'s `handleResourceAction` directly; this test
mocks `deleteResource`/`deleteFolder` from `../../src/lib/api/resources` via
`vi.mock`, mocks `toastService` from `../../src/lib/toast-service`, renders
`Page` with a minimal preloaded project/resource/folder Redux state — following
`shellModalCoordinator.test.tsx`'s `configureStore`/`Provider` fixture
pattern — and drives the delete action through the rendered tree's existing
delete-confirmation flow, or by invoking the exported `handleResourceAction`
path the rendered component wires to `AppShell`'s `onResourceAction` prop,
whichever is reachable without reimplementing internal wiring; read
`page.tsx` and `AppShell.tsx`'s prop surface first to confirm the reachable
path before writing the test).
**Done when:**
1. A regression test mocks `deleteResource` to reject and, after triggering a
   resource delete, asserts: the resource is still present in the rendered
   resource list/tree state; `toastService.error` was called; no
   `toastService.success("Resource deleted", ...)` call was made — this test
   fails against the pre-fix code (an uncaught rejection, no error toast).
2. A regression test mocks `deleteFolder` to reject and, after triggering a
   folder delete, asserts: the folder and its descendants are still present;
   `toastService.error` was called; no `toastService.success("Folder
   deleted", ...)` call was made — this test fails against the pre-fix code.
3. The existing success-path behavior (folder/resource removed from state,
   `toastService.success` called) is preserved and covered by a passing test
   in the same file for both branches.
4. `pnpm --filter getwrite-frontend exec vitest run page-delete-failure`
   passes.
5. `pnpm --filter getwrite-frontend lint` passes with 0 errors.
6. `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** 4
**Estimate:** 5
**POS:** task_96624fcc
**Done:** [ ]

### Task 6: `TrashView` refetches on a `resourcesSlice` delete made elsewhere (FR-10)

**What:** Per resolved OQ-2, `TrashView.tsx` selects a cheap derived value
from `resourcesSlice` state — e.g. `state.resources.length +
state.folders.length` — via `useAppSelector`, and refetches `listTrash` when
that value changes while the view stays mounted. No new context, provider, or
dispatched action is added. This closes the gap where a delete made from the
resource tree (dispatching `removeResource`, per Feature 26's existing wiring
in `page.tsx`'s `handleResourceAction`) while the Trash tab is already open
does not appear in the Trash listing until the writer leaves and returns to
the tab.
**Files:** `frontend/components/WorkArea/Views/TrashView/TrashView.tsx`,
`frontend/tests/component/TrashView.test.tsx`.
**Done when:**
1. A regression test mounts `TrashView` inside a Redux `Provider` (mirroring
   `shellModalCoordinator.test.tsx`'s store-fixture pattern), mocks
   `listTrash` to resolve once, then dispatches `removeResource` against the
   store directly (simulating a delete made elsewhere), and asserts
   `listTrash` is called a second time and the newly-implied trashed item
   appears — this test fails against the pre-fix `TrashView`, which has no
   effect depending on `resourcesSlice` state.
2. A test asserts a re-render with no change to the derived
   resources/folders count does **not** trigger an extra `listTrash` call
   (confirming the effect is keyed to the derived value, not every render).
3. `pnpm --filter getwrite-frontend exec vitest run TrashView` passes.
4. `pnpm --filter getwrite-frontend lint` passes with 0 errors.
5. `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** 1
**Estimate:** 3
**POS:** task_205ac241
**Done:** [ ]

### Task 7: Full gate verification, plus the FR-11 real-app re-check

**What:** Two parts. Part A: runs the repository's complete pre-merge
verification suite against the finished feature branch (Tasks 1-6) and fixes
any failure that traces back to this feature's own changes, without
silencing or configuring around a pre-existing, unrelated failure already on
`main`. Part B: per FR-11, the lead re-checks FU-1, FU-2, FU-3, and FU-8 in
the real app (not only unit/integration tests) — FU-4 needs no re-check here,
since FR-8 already records its live-check result with no code change made for
it (this task's Files list confirms no file under FU-4's scope is touched by
Tasks 1-6). For FU-3's failure path specifically, the live check can only
confirm the success path (a real network/server failure isn't reliably
reproducible on demand) — the failure path is confirmed by Task 5's
regression tests (`page-delete-failure.test.tsx`, mocked `deleteResource`/
`deleteFolder` rejection), named here as the test that stands in for it, per
FR-6's requirement that failure-path tests be simulated, not caused live.
**Files:** none expected beyond fixes to files already touched by Tasks 1-6,
if a gate failure surfaces; `knip.json` only if the scoped knip check below
reports a genuine finding.
**Done when:**
1. `pnpm --filter getwrite-frontend typecheck`, `pnpm --filter
   getwrite-frontend lint` (0 errors), and `pnpm --filter getwrite-frontend
   test:ci` all pass, run from the **main worktree**.
2. `pnpm knip` filtered to this feature's touched paths —
   `frontend/src/lib/api/resources.ts`,
   `frontend/src/lib/models/resource-crud-core.ts`,
   `frontend/app/api/folder/[folder-id]/delete/route.ts`,
   `frontend/src/store/transport/native-resource-backend.ts`,
   `frontend/app/api/project/[project-id]/trash/restore/route.ts`,
   `frontend/src/lib/api/trash.ts`,
   `frontend/components/Layout/ShellModalCoordinator.tsx`,
   `frontend/components/WorkArea/Views/TrashView/TrashView.tsx`,
   `frontend/app/(app)/page.tsx` — shows zero new findings, run from the main
   worktree.
3. `pnpm --filter getwrite-cli test` and `pnpm --filter getwrite-electron
   test` both still pass unchanged, run from the **main worktree** (this
   feature adds no CLI or Electron surface, so these confirm no regression;
   some CLI QA tests are known to fail from an agent worktree under
   `.claude/worktrees/`, per the recorded lesson from the trash-ui task list).
4. The lead runs the app in Chromium (outside the sandbox, per the recorded
   fact that Storybook/device tooling fails inside the Bash sandbox) and
   confirms: FU-1 — restoring a second same-named item from Trash shows the
   true resolved name (e.g. "X (restored 2)"), not always "X (restored)";
   FU-2 — deleting a folder shows "This will move the folder and everything
   in it to Trash. Proceed?", and deleting a resource still shows the
   original resource wording; FU-3's success path — deleting a folder via the
   UI actually soft-deletes it (moves it to `.trash/`) rather than only
   updating client state; FU-8 — with the Trash tab open, deleting an item
   from the resource tree in a separate view shows up in the Trash listing
   without leaving and returning to the tab.
5. A written note records the live-check outcome for each of the four items
   in step 4, as a measurement (what was observed), not a restated
   hypothesis — consistent with this repository's measurement-vs-hypothesis
   convention.
**Depends on:** 2, 5, 6
**Estimate:** 3
**POS:** task_a9e209e2
**Done:** [ ]

## Summary

- Total tasks: 7
- Total estimated effort: 24 (points, matching the trash-ui task list's own
  estimate units: 3+2+5+3+5+3+3)
- Critical path: 3 -> 4 -> 5 -> 7
- Risks: Task 5's regression test has no existing test harness to build on —
  `page.tsx` has never been rendered directly in a test before, so the test
  fixture (Redux store, mocked transports, reaching `handleResourceAction`
  through the rendered tree) must be built from scratch; if that proves
  impractical, the fallback is testing the same catch/toast logic at a lower
  level (e.g. extracting the delete branch into a named, independently
  testable function) — a scope change that would need to be re-approved
  before Task 5 is marked done. Task 3's `deleteFolder` transport-collapse
  change touches a function every other resource-CRUD caller already
  exercises indirectly through `page.tsx`; Task 4's non-2xx rejection is a
  behavior change for any caller that previously treated a failed delete as
  silent success — Task 5 is the only known caller, but a full-suite run
  (Task 7) is what actually confirms nothing else regresses.

## FR coverage map

| FR | Task(s) |
|----|---------|
| FR-1 | Task 1 |
| FR-2 | Task 2 |
| FR-3 | Task 3 |
| FR-4 | Task 4 |
| FR-5 | Task 5 |
| FR-6 | Tasks 1-6 (each task's own regression test, written to fail pre-fix), confirmed in full by Task 7 |
| FR-7 | Task 7 (lint/typecheck/test:ci) |
| FR-8 | No task (recorded verification — settled in the spec itself, no implementation) |
| FR-9 | No task (recorded closure — settled in the spec itself, no implementation) |
| FR-10 | Task 6 |
| FR-11 | Task 7 (real-app re-check of FU-1, FU-2, FU-3, FU-8; FU-3's failure path stands in via Task 5's tests) |
