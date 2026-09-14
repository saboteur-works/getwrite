# Task List: Trash UI — browse, restore, purge

Source spec: `specs/features/trash-ui.md` (Feature 26, Gate 3 approved
2026-09-14). All 12 open questions on the source spec (OQ-1 through OQ-12)
are resolved there by owner decision; this task list does not reopen or
re-answer any of them.

**Placement decision:** all model-layer additions live as new siblings under
`frontend/src/lib/models/` — `trash-refs.ts` (FR-8 ref record),
`trash-folder-manifest.ts` (FR-20 folder manifest), plus new exported
functions added directly to the existing `trash.ts`, `backlinks.ts`, and
`mention-index.ts` (FR-17). No new top-level pipeline package is created —
unlike the Scrivener/DOCX importers, this feature has no CLI or Electron
worker surface of its own; it is pure model-layer + API route + Redux/UI,
matching how `entity-relationships.ts` (Feature 38) was built. Route
placement follows the existing `app/api/project/[project-id]/...` and
`app/api/resource/[resource-id]/...` conventions already used by
`entity-relationships`'s own routes.

**Shared-file caution (schedule sequentially, not concurrently):** the
following files are touched by more than one task below and must not be
edited by two tasks running in parallel worktrees — each later-touching task
depends (directly or transitively) on the earlier one specifically to avoid
this:

- `frontend/src/lib/models/schemas.ts` — Task 1 (ref record schema) and Task
  2 (folder manifest schema) both add new Zod schemas here. Task 2 depends on
  Task 1 so the two additions never land as concurrent edits to the same
  file.
- `frontend/src/lib/models/trash.ts` — written by Task 3 (revision move,
  FR-19), Task 4 (ref-record persistence, FR-8), Task 5 (index/backlinks/
  mentions removal at soft-delete, FR-16), Task 6 (folder cascade soft
  delete, FR-3), Task 7 (purge-sweep primitives, FR-6/FR-10), Task 8
  (restore: root fallback/collision/re-link/legacy tolerance,
  FR-5/FR-9/FR-22), Task 9 (whole-folder restore, FR-20), and Task 10 (the
  FR-18 purge sweep) — eight tasks in all. These are sequenced 3 → 4 → 5 → 6
  → 7 → 8 → 9 → 10 via dependencies (Task 5 now depends on Task 4, Task 7 now
  also depends on Task 6, and Task 8 now also depends on Task 7, closing the
  gaps a prior pass left open) specifically because each edits this one
  file's exported surface; none of this chain may run in parallel. Task 20's
  knip cleanup may also touch this file's exported-but-unused symbols, but it
  already runs after every other task in this chain (it depends on Task 19,
  which is a descendant of Task 10 via 11 → 12 → 15 → 17 → 18 → 19), so no
  further dependency is needed there.
- `frontend/src/lib/models/resource-persistence.ts` — read by Task 6 for
  `resolveFolderDir`/folder descriptor shape (read-only reference, not
  expected to change) and written by Task 6 only, if a helper needs
  exporting; if Task 9 also needs a helper from this file, it depends on Task
  6.
- `frontend/src/lib/core.ts` — the barrel. Written by Task 4 (ref-record
  exports) and Task 10 (purge-sweep error types) only — Task 6's own Files
  list is `trash.ts` plus its test file, not `core.ts`, and Task 12 does not
  touch this file either (its Files list is `lib/api/trash.ts` and its
  transport siblings only — it consumes `core.ts`'s exports but doesn't add
  any); both are left off this chain. Task 4 → Task 10 forms the whole chain
  through this file specifically (Task 10 already depends directly on
  Task 4, so no further edit was needed here), in addition to whatever
  functional dependency each already has.
- `frontend/components/WorkArea/ViewSwitcher.tsx` and
  `frontend/src/lib/models/types.ts` (`ViewName` union) — Task 14 only.
- `frontend/components/Layout/AppShell.tsx` — Task 14 (Trash tab wiring,
  `disabledViews` computation untouched since Trash is never gated), Task 15
  (rendering the Trash view's container in the same view-switch block), and
  Task 16 (the `resourcesSlice`/`AppShell` dispatch-call-site type-mismatch
  fix). Task 13's folder-delete fix turned out not to need an edit here (see
  Task 13 below — the branch belongs entirely in `page.tsx`'s
  `handleResourceAction`, since `onDeleteConfirm` already forwards any
  resource-or-folder id unmodified), so Task 13 is off this chain. Task 15
  depends on Task 14, and Task 16 now also depends on Task 15 (in addition
  to its existing functional dependency on Task 13), forming one strict
  chain — 14 → 15 → 16 — through this file specifically.
- `frontend/src/store/resourcesSlice.ts` — Task 16 only (adds folder-cascade
  removal to the existing `removeResource` reducer per FR-3's fix; no other
  task edits this file).
- `frontend/app/api/resource/[resource-id]/delete/route.ts` — edited by
  Task 5 only (its `softDeleteResource` call now performs the
  index/backlinks/mentions removal added there internally; the route's own
  call site is otherwise unchanged). No other task edits this file — the
  folder-delete path is a new, separate route owned by Task 13
  (`app/api/folder/[folder-id]/delete/route.ts`), not a change to this one.
- `knip.json` — Task 20 only (final gate cleanup), after every other task's
  exports are settled.
- No task in this feature adds a new `package.json` dependency — everything
  needed (`zod`, existing `io.ts`/`meta-locks.ts` primitives) is already a
  direct dependency. If implementation discovers a genuine new-package need,
  per this list's constraints it must become its own first task, owned
  alone, with exact versions and a `package-selection.md` justification, and
  every task below renumbered/re-dependencied accordingly — do not fold a
  new dependency into an existing task.

**Docs (CLAUDE.md, glossary, standards):** left to the scribe stage, per the
pipeline's separation of implementation from documentation update — no task
below edits `CLAUDE.md`.

**Test locations:** all new tests are Vitest, under `frontend/tests/unit/`
(pure model-layer functions) and `frontend/tests/integration/` (multi-step
soft-delete/restore/purge flows and API routes), run via `pnpm --filter
getwrite-frontend exec vitest run <path>`; component/story tests follow
`docs/standards/storybook-implementation.md` and run via `pnpm --filter
getwrite-frontend exec vitest run <ComponentName>`. Per the docx-importer
task list's recorded lesson, any task that runs `pnpm --filter getwrite-cli
test` or touches `cli/tests/qa/*` must be run from the **main worktree**, not
an agent worktree under `.claude/worktrees/` — this feature has no CLI
surface, so no task here is expected to need that, but Task 21 (full gate)
restates it as a precaution since it runs the whole repo suite. Storybook/
Chromium and `pnpm test-storybook` cannot run inside the Bash sandbox
(`sandbox-breaks-device-and-watcher-tools`); Task 19's Done-when names the
exact commands and states they are run by the lead outside the sandbox.

### Task 1: `TrashRefRecordSchema` — nullified-reference record (FR-8)

**What:** Adds the Zod-validated shape for `.trash/meta/refs-<resourceId>.json`
per resolved OQ-5: an array of entries, each capturing the referencing
resource's id, the field key, an optional array index (present only for a
multi-valued field), and the prior `{ id, name }` value before `patchRef`
cleared it.
**Files:** `frontend/src/lib/models/schemas.ts`,
`frontend/tests/unit/trash-ref-record-schema.test.ts`.
**Done when:** `TrashRefRecordEntrySchema`/`TrashRefRecordSchema` (exact
names TBD by existing schema-file naming convention, e.g. mirroring
`FolderSchema`'s style) validate: a scalar-field entry with no `arrayIndex`
key at all (not `arrayIndex: undefined` — the schema must accept the key's
absence); a multi-valued-field entry with a numeric `arrayIndex`; and reject
a record missing `referencingResourceId`, `fieldKey`, or the prior `{ id,
name }` value. Tests cover both accept and reject cases via
`.safeParse`. `pnpm --filter getwrite-frontend exec vitest run
trash-ref-record-schema` and `pnpm --filter getwrite-frontend typecheck`
pass.
**Depends on:** none
**Estimate:** 2
**POS:** task_d0dcce8d
**Done:** [x]

### Task 2: `TrashFolderManifestSchema` — trashed-folder manifest (FR-20)

**What:** Adds the Zod-validated shape for `.trash/meta/folder-<folderId>.json`
per resolved OQ-6: the folder's own descriptor plus every descendant folder
and resource id together with its `parentId` and order index at delete time.
**Files:** `frontend/src/lib/models/schemas.ts`,
`frontend/tests/unit/trash-folder-manifest-schema.test.ts`.
**Done when:** `TrashFolderManifestEntrySchema`/`TrashFolderManifestSchema`
validate a manifest containing the top-level folder's own `FolderSchema`-
shaped descriptor plus an array of descendant entries, each an id
(resource or folder), a `kind: "resource" | "folder"` discriminant, a
nullable `parentId`, and a numeric `orderIndex`; reject a manifest with a
descendant entry missing `kind`, `parentId`, or `orderIndex`. `pnpm --filter
getwrite-frontend exec vitest run trash-folder-manifest-schema` and `pnpm
--filter getwrite-frontend typecheck` pass.
**Depends on:** 1
**Estimate:** 2
**POS:** task_07aab304
**Done:** [ ]

### Task 3: Move revisions into/out of `.trash/` at delete and restore time (FR-19)

**What:** `softDeleteResource` currently never touches `revisions/` — this
task adds the move. Resource revisions move to
`.trash/revisions/<resourceId>/v-<N>/` at delete time (mirroring
`revision.ts`'s `revisionsBaseDir`/`revisionDir` layout under `.trash/`) and
move back to `revisions/<resourceId>/v-<N>/` on restore.
**Files:** `frontend/src/lib/models/trash.ts`,
`frontend/tests/unit/trash-revisions.test.ts`.
**Done when:** a test creates a resource with two revisions
(`writeRevision`), calls `softDeleteResource`, and asserts both revision
directories now exist under `.trash/revisions/<resourceId>/` and no longer
under the original path; a second test calls `restoreResource` on that
trashed resource and asserts both revisions are back at their original
`revisions/<resourceId>/v-<N>/` path; a third test calls `softDeleteResource`
on a resource with zero revisions and asserts no error and no
`.trash/revisions/<resourceId>/` directory is created. `pnpm --filter
getwrite-frontend exec vitest run trash-revisions` and `pnpm --filter
getwrite-frontend typecheck` pass.
**Depends on:** none
**Estimate:** 5
**POS:** task_d1270a92
**Done:** [x]

### Task 4: Persist and restore the FR-8 nullified-reference record

**What:** `nullifyResourceRefs` currently patches sidecars in place and
discards what it changed. This task makes it also return the set of changes
it made, and adds a new function that writes that set as a
Task-1-schema-validated `.trash/meta/refs-<resourceId>.json`, moved alongside
the resource on restore (or absent for a legacy item, per resolved OQ-12,
with no error).
**Files:** `frontend/src/lib/models/trash.ts`, `frontend/src/lib/core.ts`
(re-export the new ref-record read/write functions and the ref-record type,
named exports only, matching `core.ts`'s existing convention),
`frontend/tests/unit/trash-ref-record.test.ts`.
**Done when:** `nullifyResourceRefs` returns the array of entries it cleared
(each shaped per Task 1's schema) in addition to performing its existing
patch side effect; a new `writeTrashRefRecord`/`readTrashRefRecord` pair
persists/reads `.trash/meta/refs-<resourceId>.json` via `io.ts` (not
`node:fs`); a test asserts a resource referenced by two other sidecars'
`resource-ref` fields (one scalar, one inside a multi-valued array) produces
a ref record with both entries, the array one carrying its `arrayIndex`; a
test asserts `readTrashRefRecord` returns `undefined`/`null` (not a thrown
error) when no ref record file exists (legacy case, OQ-12). `pnpm --filter
getwrite-frontend exec vitest run trash-ref-record` and `pnpm --filter
getwrite-frontend typecheck` pass.
**Depends on:** 1, 3
**Estimate:** 5
**POS:** task_e0f28b8c
**Done:** [ ]

### Task 5: Single-resource removal in `backlinks.ts` and `mention-index.ts`, wired into soft delete (FR-16, FR-17)

**What:** Adds a new single-resource removal function to each of
`backlinks.ts` and `mention-index.ts`, mirroring `inverted-index.ts`'s
existing `removeResourceFromIndex` (load, filter/modify, persist, inside one
`withMetaLock` call). Wires all three (inverted index, backlinks, mentions)
into `softDeleteResource` so soft delete removes a resource from all three
immediately, per resolved OQ-7 — not only at purge. Also updates the
existing single-resource delete route
(`app/api/resource/[resource-id]/delete/route.ts`) only insofar as
`softDeleteResource` now performs this removal internally; the route's own
call site is otherwise unchanged.
**Files:** `frontend/src/lib/models/backlinks.ts`,
`frontend/src/lib/models/mention-index.ts`,
`frontend/src/lib/models/trash.ts`,
`frontend/app/api/resource/[resource-id]/delete/route.ts`,
`frontend/tests/unit/backlinks-remove-resource.test.ts`,
`frontend/tests/unit/mention-index-remove-resource.test.ts`,
`frontend/tests/integration/soft-delete-indexing.test.ts`.
**Done when:** `removeResourceFromBacklinks(projectRoot, resourceId)` removes
the resource's own key from the persisted backlinks index and removes it
from every other resource's array of referenced ids, in one `withMetaLock`
call; `removeResourceFromMentionIndex(projectRoot, resourceId)` removes the
resource's own key from `meta/index/mentions.json`, in one `withMetaLock`
call (a resource can only be the *mentioning* side under this index's
resource-keyed shape, so no cross-entry scan is needed — confirmed by
reading `MentionIndex`'s `Record<resourceId, MentionRecord[]>` shape); an
integration test soft-deletes a resource with an existing inverted-index
entry, a backlink from another resource, and a mention record, then asserts
all three are gone immediately after `softDeleteResource` returns (not only
after a later purge). `pnpm --filter getwrite-frontend exec vitest run
backlinks-remove-resource mention-index-remove-resource
soft-delete-indexing` and `pnpm --filter getwrite-frontend typecheck` pass.
**Depends on:** 4
**Estimate:** 5
**POS:** task_818a7f4e
**Done:** [ ]

### Task 6: Folder cascade soft delete plus manifest (FR-3, FR-20)

**What:** Closes the orphaning gap: deleting a folder currently only removes
its own Redux/on-disk descriptor via `resourcesSlice.ts`'s client-side
`removeResource` reducer filtering `state.folders` — no server-side route or
`trash.ts` function today touches `folders/` at all. This task adds a new
`softDeleteFolder` model function that: writes the Task-2-schema folder
manifest to `.trash/meta/folder-<folderId>.json` (capturing the folder's own
descriptor plus every descendant folder/resource id with its `parentId` and
order index at delete time, walked via `resource-persistence.ts`'s flat
`folders/<slug>/folder.json` layout, since hierarchy is expressed only
through each folder's own `parentId`); moves the folder's own descriptor to
`.trash/folders/<slug>/folder.json`; and calls Tasks 3/4/5's per-resource
soft-delete sequence (revisions, ref record, index/backlinks/mentions
removal) for every descendant resource, plus recurses this same folder move
for every descendant folder.
**Files:** `frontend/src/lib/models/trash.ts`,
`frontend/tests/unit/trash-folder-cascade.test.ts`.
**Done when:** a test builds a folder tree three levels deep with resources
at each level, calls `softDeleteFolder` on the top folder, and asserts: the
manifest at `.trash/meta/folder-<id>.json` lists every descendant id with its
original `parentId`/`orderIndex`; every descendant resource's content,
sidecar, revisions, and ref record moved into `.trash/`; every descendant
folder's own `folder.json` moved into `.trash/folders/`; and nothing remains
under the original `folders/`/`resources/` paths for any moved item. A
second test asserts calling `softDeleteFolder` on a folder with zero
descendants still produces a valid (empty-descendants) manifest and moves
only the folder's own descriptor. `pnpm --filter getwrite-frontend exec
vitest run trash-folder-cascade` and `pnpm --filter getwrite-frontend
typecheck` pass.
**Depends on:** 2, 3, 4, 5
**Estimate:** 8
**POS:** task_0dc2c852
**Done:** [ ]

### Task 7: Purge-sweep primitives — relationship edges, revisions, idempotent index removal (FR-6, FR-10, FR-18 steps 1-3)

**What:** Builds the individually-idempotent building blocks the FR-18
ordered purge sweep composes in Task 10: (a) confirming/wrapping
`removeEntityRelationshipsForEntity` (already exists, already idempotent) as
step 2; (b) a new function removing a resource's trashed revisions —
`.trash/revisions/<resourceId>/` when present, or the legacy
`revisions/<resourceId>/` path per resolved OQ-12 when the new-layout path is
absent — as step 3; (c) confirming Task 5's two new removal functions plus
`removeResourceFromIndex` are each safely re-callable with no error and no
change when the target is already absent (the idempotency FR-6/FR-18
require for step 1).
**Files:** `frontend/src/lib/models/trash.ts`,
`frontend/tests/unit/trash-purge-primitives.test.ts`.
**Done when:** a test calls each of `removeResourceFromIndex`,
`removeResourceFromBacklinks`, `removeResourceFromMentionIndex`, and
`removeEntityRelationshipsForEntity` twice in a row against the same
resource/entity id and asserts the second call throws nothing and leaves the
persisted state identical to after the first call; a new
`purgeTrashedRevisions(projectRoot, resourceId)` removes
`.trash/revisions/<resourceId>/` when present; a test with revisions still
at the legacy `revisions/<resourceId>/` path (simulating an item soft-deleted
before Task 3 existed) asserts `purgeTrashedRevisions` removes them from
that legacy path instead. `pnpm --filter getwrite-frontend exec vitest run
trash-purge-primitives` and `pnpm --filter getwrite-frontend typecheck` pass.
**Depends on:** 5, 6
**Estimate:** 5
**POS:** task_d5f5a15b
**Done:** [ ]

### Task 8: Restore — root fallback, collision suffix, re-linking, legacy tolerance (FR-5, FR-9, FR-16, FR-22)

**What:** Rewrites `restoreResource` (today: "restores the first match" with
no parent-existence or collision check, per the spec's own evidence) to: (1)
fall back to the project root when the resource's original parent folder no
longer exists; (2) apply resolved OQ-2's suffix rule (" (restored)", then "
(restored 2)", "(restored 3)", ...) on a name collision at the destination;
(3) re-index the restored resource through `indexer-queue.ts`'s
`enqueueIndex` (inverted index, then backlinks, then mentions, per FR-16);
(4) use Task 4's ref record to re-link every reference still in its cleared
`{ id: null, name }` state back to the restored resource, leaving alone (and
reporting) any reference that changed since deletion; (5) perform no
re-linking, with a reported "references couldn't be restored" outcome, when
no ref record exists (legacy item, OQ-12). Returns a structured result the
API route (Task 11) and UI (Task 18) surface to the writer: whether the
resource was relocated, renamed, and which references were/weren't restored.
**Files:** `frontend/src/lib/models/trash.ts`,
`frontend/tests/integration/trash-restore.test.ts`.
**Done when:** a test restores a resource whose original parent folder was
itself deleted and asserts it lands at the project root with a `relocated:
true` result; a test restores into a destination where a same-named resource
already exists, then restores a second same-named item, asserting " (restored)"
then " (restored 2)" naming with a `renamed` result each time; a test with a
Task-4 ref record where one recorded reference is still `{ id: null, name }`
and another was since repointed to a different resource asserts only the
untouched one is re-linked and the changed one is reported as
`referencesNotRestored` rather than overwritten; a test with no ref record
(legacy fixture) asserts no re-linking occurs and the result reports
`referencesNotRestored: "no-record"` (or equivalent); a test asserts the
restored resource is present in the inverted index, backlinks, and mention
index afterward (FR-16) by calling the normal indexing path. `pnpm --filter
getwrite-frontend exec vitest run trash-restore` and `pnpm --filter
getwrite-frontend typecheck` pass.
**Depends on:** 4, 5, 6, 7
**Estimate:** 10
**POS:** task_7c4c3601
**Done:** [ ]

### Task 9: Whole-folder restore, rebuilt from the manifest (FR-5, FR-20)

**What:** Adds `restoreFolder`, rebuilding a trashed folder's tree from
Task 6's manifest — restoring the folder's own descriptor (applying Task 8's
root-fallback and collision-suffix rules to the top-level folder itself when
its own original parent no longer exists or its name collides) and then
every descendant resource/folder at its recorded `parentId`/`orderIndex`, via
Task 8's per-resource restore for each descendant resource.
**Files:** `frontend/src/lib/models/trash.ts`,
`frontend/tests/integration/trash-folder-restore.test.ts`.
**Done when:** a test soft-deletes (Task 6) then restores a three-level
folder tree and asserts every descendant folder and resource is back at its
original `parentId`/`orderIndex`; a test restores a trashed folder whose
original parent folder no longer exists and asserts the top-level folder
lands at the project root with the same `relocated` reporting Task 8 uses; a
test restores a trashed folder whose name collides at the destination and
asserts the same " (restored)"/" (restored 2)" suffix rule applies to the
folder's own name. `pnpm --filter getwrite-frontend exec vitest run
trash-folder-restore` and `pnpm --filter getwrite-frontend typecheck` pass.
**Depends on:** 6, 8
**Estimate:** 8
**POS:** task_fe07f8be
**Done:** [ ]

### Task 10: The FR-18 ordered, resumable purge sweep (FR-6, FR-7, FR-10, FR-18)

**What:** The single orchestrating purge function composing Task 7's
primitives (plus Task 4's ref-record removal and Task 6's manifest removal)
into the fixed order FR-18 requires: (1) inverted index / backlinks /
mentions (idempotent no-op if Task 5 already ran at soft-delete time); (2)
authored relationship edges; (3) trashed revisions; (4) trashed sidecar and
ref record (or, for a folder, its manifest); (5) trashed content files,
last. On any step's failure, the sweep stops, the item remains listed in
Trash, and the error is surfaced structurally; re-running purge on that item
must complete only the remaining steps (each step already independently
idempotent per Task 7 — no journal). A folder purge applies this same full
sweep, in this same order, to every resource nested under it at delete time,
via Task 6's manifest (FR-7), then removes the manifest and the folder's own
trashed descriptor.
**Files:** `frontend/src/lib/models/trash.ts`, `frontend/src/lib/core.ts`
(re-export the new purge orchestrator and its result/error types),
`frontend/tests/integration/trash-purge-sweep.test.ts`.
**Done when:** `purgeResource` (rewritten) runs all five steps in order and
a test confirms end-state: no trashed files, no sidecar, no revisions
(neither `.trash/revisions/` nor a legacy `revisions/<id>/` remnant), no
inverted-index/backlinks/mention-index entry, and no relationship edge
naming the resource, after a single call; a test simulates a mid-sweep
failure (e.g. by injecting a throwing step after step 2 completes) and
asserts steps 1-2's effects persisted, the item is still readable via
`readSidecar`/still present in Trash, and calling purge again completes only
steps 3-5 without re-attempting 1-2's already-completed, idempotent work
(assert via a spy that steps 1-2's underlying functions are still safely
callable, not that they're skipped — FR-18 requires idempotency, not skip
logic); `purgeFolder` runs this same sweep against every resource in a
Task-6 manifest and then removes the manifest and folder descriptor, with an
analogous mid-sweep-failure/retry test. `pnpm --filter getwrite-frontend exec
vitest run trash-purge-sweep` and `pnpm --filter getwrite-frontend
typecheck` pass.
**Depends on:** 4, 6, 7, 9
**Estimate:** 10
**POS:** task_1d613c6b
**Done:** [ ]

### Task 11: Trash list, restore, and purge API routes (FR-1, FR-2, FR-11, FR-12)

**What:** New Next.js routes, each resolving the project directory via
`resolveProjectPath`/`validateProjectId` (`project-path.ts`) against a
client-supplied `projectId` — never a client-supplied filesystem path, per
`docs/standards/security.md`. A single list route returns trashed resources
and trashed folders together in one shape, mirroring `GET /api/projects`'s
combined response (resolved OQ-10). Restore and purge routes each accept a
batch of ids and run per-item, reporting a per-item outcome (resolved OQ-9) —
a failed item stays listed in Trash rather than being dropped from the
response.
**Files:** `frontend/app/api/project/[project-id]/trash/route.ts` (GET, list),
`frontend/app/api/project/[project-id]/trash/restore/route.ts` (POST, batch),
`frontend/app/api/project/[project-id]/trash/purge/route.ts` (POST, batch, also
serves "Empty trash" as the special case of purging every listed id),
`frontend/tests/integration/trash-routes.test.ts`.
**Done when:** the list route returns `{ resources: TrashedResourceEntry[];
folders: TrashedFolderEntry[] }` reflecting Task 6/Task 4's on-disk state,
including a legacy item with no ref record and no folder manifest (OQ-12); a
test asserts the list route resolves the project directory from
`projectId`/`validateProjectId` and returns 400 on a malformed
non-UUID `projectId`, never touching a client-supplied path string; the
restore route accepts `{ ids: string[] }` and returns `{ results:
{ id: string; ok: boolean; relocated?: boolean; renamed?: boolean;
referencesNotRestored?: ... ; error?: string }[] }`, one entry per requested
id, calling Task 8/Task 9 per item; the purge route accepts `{ ids: string[]
}` (or `{ all: true }` for "Empty trash", first resolving to every currently
trashed id) and returns the analogous per-item `{ id, ok, error? }[]`,
calling Task 10 per item, leaving a failed item's Trash entry unchanged; a
test asserts a batch with one deliberately-failing item (e.g. a resource
whose trashed content file was manually removed out from under it) still
returns 12-of-13-style success for the rest with the one failure reported,
not a whole-batch 500. `pnpm --filter getwrite-frontend exec vitest run
trash-routes` and `pnpm --filter getwrite-frontend typecheck` pass.
**Depends on:** 8, 9, 10
**Estimate:** 8
**POS:** task_37496a5d
**Done:** [ ]

### Task 12: `lib/api/trash.ts` client via `createTransport`, with a native web stub (FR-11)

**What:** The client-facing transport, following `lib/api/entity-relationships.ts`'s
exact pattern: one `TrashTransport` interface, an
`httpTrashTransport` implementation hitting Task 11's routes, and
`resolveTrashTransport` built via `createTransport(httpTrashTransport, () =>
import("../../store/transport/native-trash-backend")...)`. The native
backend's real implementation is out of scope (resolved parent OQ-29,
deferred); this task only reserves the literal dynamic-import specifier and
provides a stub that rejects with a clear "not supported on this platform"
error, matching FR-11's explicit allowance.
**Files:** `frontend/src/lib/api/trash.ts`,
`frontend/src/store/transport/native-trash-backend.ts` (stub only — throws
"not supported on this platform"), `frontend/src/store/transport/native-trash-backend.web-stub.ts`
(the Turbopack `resolveAlias` substitute, matching every other
`.web-stub.ts` sibling's shape), `frontend/next.config.mjs` (adds the new
specifier to `turbopack.resolveAlias`, alongside the existing entries — no
other line in this file changes), `frontend/tests/unit/trash-api-client.test.ts`.
**Done when:** `listTrash`, `restoreTrashItems`, `purgeTrashItems` are
exported functions mirroring `listEntityRelationships`'s
degrade-vs-throw contract choices (state explicitly in the module doc
comment which of Trash's three operations degrade gracefully vs. reject, and
why — a batch restore/purge candidate for "must the caller know if the whole
request failed vs. one item failed" the same way `listOrThrow` exists for
that reason); a test mocks `fetch` against each of the three functions and
asserts the correct route/method/body; a test confirms
`resolveTrashTransport` on native resolves to a rejecting stub. `pnpm
--filter getwrite-frontend exec vitest run trash-api-client` and `pnpm
--filter getwrite-frontend typecheck` pass.
**Depends on:** 11
**Estimate:** 5
**POS:** task_ba35c625
**Done:** [ ]

### Task 13: New folder-delete route and the `page.tsx`/`resources.ts` orphaning-gap fix (FR-3)

**What:** Adds the server-side folder-delete route this feature's FR-3
requires (today, deleting a folder only removes it from Redux/on-disk
folder-tree state client-side, and the only production call site for
`deleteResource(` — `frontend/app/(app)/page.tsx`'s `handleResourceAction`,
at its `action === "delete"` branch (line 651) — has no folder branch at
all, so a folder id reaches the single-resource `deleteResource` client
function and its resource-only API route), calling Task 6's
`softDeleteFolder`. Fixes the actual call site: `handleResourceAction`'s
`delete` branch now checks whether the id belongs to
`selectedProject.folders` and, if so, calls a new `deleteFolder` client
function (added to `resources.ts`, mirroring `deleteResource`'s shape)
against this route instead of `deleteResource`, and removes the folder
together with every descendant resource/folder from local and Redux state
rather than only the top folder's own entry. `AppShell.tsx`'s
`onDeleteConfirm` handler (`:1124-1131`) needs no change for this fix —
confirmed by reading it: it already forwards any selected id, resource or
folder, to `onResourceAction("delete", id)` unmodified, so the
folder-vs-resource branch belongs entirely in `handleResourceAction`, which
already has `selectedProject.folders` in scope.
**Files:** `frontend/app/api/folder/[folder-id]/delete/route.ts` (new),
`frontend/src/lib/api/resources.ts` (new `deleteFolder` client function),
`frontend/app/(app)/page.tsx` (`handleResourceAction`'s `delete` branch),
`frontend/tests/integration/folder-delete-route.test.ts`,
`frontend/tests/unit/resources-api-delete-folder.test.ts` (new).
**Done when:** `POST /api/folder/[folder-id]/delete` takes the folder id
from its URL segment and the project id from the POST body, resolved and
validated via `resolveProjectPath` — exactly as
`app/api/resource/[resource-id]/delete/route.ts` already does, never a
client-supplied path — calls `softDeleteFolder`, and returns
success/failure; a test confirms deleting a folder with nested resources
moves the whole subtree into `.trash/` (via Task 6) rather than only
removing the top folder's own descriptor; `deleteFolder(folderId,
projectId)` in `resources.ts` POSTs to this route; a test confirms
`handleResourceAction`'s `delete` branch calls `deleteFolder` (not
`deleteResource`) when the id belongs to `selectedProject.folders`, and
that the folder and every descendant resource/folder are removed from
`selectedProject`/`projects` state afterward, so a page reload after a
folder delete no longer shows orphaned children. `pnpm --filter
getwrite-frontend exec vitest run folder-delete-route
resources-api-delete-folder` and `pnpm --filter getwrite-frontend
typecheck` pass.
**Depends on:** 6
**Estimate:** 5
**POS:** task_5f2e7b67
**Done:** [ ]

### Task 14: "Trash" tab in `ViewSwitcher.tsx` and `AppShell.tsx` wiring (FR-1)

**What:** Adds "Trash" to `ViewSwitcher.tsx`'s `VIEW_OPTIONS` and the
`ViewName` union in `types.ts`, following the existing
Organizer/Timeline/Entities/Graph pattern (resolved OQ-1) — the Trash tab is
deliberately never added to `AppShell.tsx`'s `disabledViews` computation,
since FR-1 requires it ungated. `AppShell.tsx` gains the routing so
`view === "trash"` renders the Trash container (built in Task 15) instead of
requiring `selectedResource`, matching how `data`/`entityRoster`/`entityGraph`
are already excepted from that gate as project-wide views.
**Files:** `frontend/components/WorkArea/ViewSwitcher.tsx`,
`frontend/src/lib/models/types.ts`, `frontend/components/Layout/AppShell.tsx`,
`frontend/tests/viewSwitcher.test.tsx`.
**Done when:** a test confirms the Trash tab renders unconditionally
(present with no feature flag mocked either way, unlike Entities/Graph); a
test confirms selecting the Trash tab does not require a
`selectedResource`; `pnpm --filter getwrite-frontend exec vitest run
viewSwitcher` and `pnpm --filter getwrite-frontend typecheck` pass.
**Depends on:** none
**Estimate:** 3
**POS:** task_b6038f71
**Done:** [x]

### Task 15: `TrashView` container — list, nested folder display (FR-1, FR-4)

**What:** The read-only listing half of the Trash tab: fetches Task 12's
`listTrash`, renders trashed resources and trashed folders together, with a
trashed folder's former contents shown nested inside it for visibility only
— no independent restore/purge control on a nested row (resolved OQ-3/FR-4).
**Files:** `frontend/components/WorkArea/Views/TrashView.tsx` (new, sibling
to `Organizer`/`Timeline`/`EntityRoster`), `frontend/components/Layout/AppShell.tsx`
(renders `TrashView` when `view === "trash"`), `frontend/tests/component/TrashView.test.tsx`.
**Done when:** a test renders `TrashView` with a mocked `listTrash` response
containing one trashed resource and one trashed folder with two nested
children, and asserts: the folder's nested children render read-only (no
restore/purge button of their own); the folder itself and the standalone
resource each render with their own restore/purge controls (added in Task
17); an empty-Trash state renders a distinct "Trash is empty" message rather
than a blank list. `pnpm --filter getwrite-frontend exec vitest run
TrashView` and `pnpm --filter getwrite-frontend typecheck` pass.
**Depends on:** 12, 14
**Estimate:** 8
**POS:** task_d1fadcdf
**Done:** [ ]

### Task 16: `resourcesSlice` folder-cascade removal fix (FR-3)

**What:** Fixes `resourcesSlice.ts`'s `removeResource` reducer, which today
only filters `state.folders`/`state.resources` by a single id (`:155-159`)
and does not cascade-remove a deleted folder's descendants from client
state, leaving them visible/selectable in the tree until the next full
reload even after Task 13's server-side cascade delete. Also reconciles the
existing type mismatch at the `AppShell.tsx` call site
(`dispatch(removeResource({ projectId: project.id, resourceId }))` against a
reducer typed `PayloadAction<string>`) discovered while implementing this
fix — read both files first to confirm the actual current behavior before
changing either.
**Files:** `frontend/src/store/resourcesSlice.ts`,
`frontend/components/Layout/AppShell.tsx`, `frontend/tests/unit/resourcesSlice.test.ts`
(or the existing test file covering this slice, if one already exists —
check before creating a new one).
**Done when:** a test dispatches folder removal for a folder with two
descendant resources and one descendant folder (mirroring the tree shape
Task 6's on-disk cascade produces) and asserts all three descendants are
removed from `state.resources`/`state.folders`, not only the top folder;
`pnpm --filter getwrite-frontend typecheck` passes with no type mismatch at
the `AppShell.tsx` dispatch call site; `pnpm --filter getwrite-frontend exec
vitest run resourcesSlice` passes.
**Depends on:** 13, 15
**Estimate:** 5
**POS:** task_bdadf61f
**Done:** [ ]

### Task 17: Multi-select restore/purge/"Empty trash" controls, `ConfirmDialog`, batch report (FR-2, FR-13, FR-21)

**What:** Adds multi-select state to `TrashView`, a restore action, a
permanent-delete action, and an "Empty trash" action — each behind one
`ConfirmDialog` confirmation for the whole batch (using its existing
`destructive` variant for the confirm button on delete/purge/empty, never
the reserved brand red on a non-destructive control, per CLAUDE.md). Each
batch action calls Task 12's client functions and renders the per-item
report (e.g. "12 of 15 permanently deleted; 3 failed") from the route's
per-item results, leaving a failed item visibly still in Trash. Confirms
FR-21's boundary: no new open-editor-tab behavior is added for a resource
deleted/purged from here — the existing `AppShell.tsx` "Resource not found."
fallback (`removeResource` dispatch, `:1124-1131`, and its rendered fallback
state) is exercised unchanged, verified by a test rather than assumed.
**Files:** `frontend/components/WorkArea/Views/TrashView.tsx`,
`frontend/tests/component/TrashView.test.tsx`.
**Done when:** a test selects two of three trashed resources, clicks
"Restore selected", confirms once in the `ConfirmDialog`, and asserts
`restoreTrashItems` is called exactly once with both ids (not once per
item); a test triggers "Empty trash", confirms once, and asserts
`purgeTrashItems` is called with every currently-listed id; a test mocks a
batch result with one failed item and asserts the rendered report states
the count and the failed item remains in the list; a test opens a resource
currently shown in the editor, purges it from `TrashView`, and asserts
`AppShell`'s existing "Resource not found." fallback renders — with no new
UI beyond that fallback. `pnpm --filter getwrite-frontend exec vitest run
TrashView` and `pnpm --filter getwrite-frontend typecheck` pass.
**Depends on:** 15, 16
**Estimate:** 8
**POS:** task_6dc26c7d
**Done:** [ ]

### Task 18: Restore relocation/rename notices and accessibility pass (FR-5, FR-9, FR-14)

**What:** Surfaces Task 8/Task 9's restore result (relocated to project
root, renamed on collision, references not restored / partially restored)
as a distinct, readable notice per restored item — not folded silently into
the generic per-batch count. Completes the WCAG 2.1 AA pass for the whole
Trash view: every action keyboard-operable, multi-select state exposed to
assistive tech (`aria-selected`/`aria-multiselectable` or equivalent), and
the confirmation dialogs following the same semantic pattern already used by
`RemoveEntityControl.tsx`.
**Files:** `frontend/components/WorkArea/Views/TrashView.tsx`,
`frontend/tests/component/TrashView.test.tsx`,
`frontend/tests/a11y/trash-view.a11y.test.tsx` (new, or add to the existing
a11y test file — check the existing pattern for
`EntityRosterView`/`RemoveEntityControl` before creating a new file).
**Done when:** the whole pass follows `docs/standards/accessibility.md`'s
stated conventions throughout, without editing that file; a test restores an item that was relocated to the project
root and asserts a specific "moved to project root because its original
folder no longer exists" notice renders (not a generic success message); a
test restores an item with a renamed collision and asserts the " (restored)"
name and a notice explaining the rename; a test restores an item with
partially-restored references and asserts a distinct notice naming which
references couldn't be restored; an a11y test (mirroring the existing
`RemoveEntityControl`/roster a11y test shape) asserts every restore/purge/
empty-trash control is keyboard-reachable and multi-select state is exposed
via ARIA. `pnpm --filter getwrite-frontend exec vitest run TrashView
trash-view.a11y` and `pnpm --filter getwrite-frontend typecheck` pass.
**Depends on:** 17
**Estimate:** 5
**POS:** task_b2814e1d
**Done:** [ ]

### Task 19: Storybook stories for every new component (FR-15)

**What:** Adds stories per `docs/standards/storybook-implementation.md` for
every component this feature adds: `TrashView` (empty state, mixed
resource/folder list, multi-select active, batch-report state, restore
notice variants) — mirroring `ConfirmDialog`'s own existing story
convention for the shared confirmation dialogs (no new stories needed for
`ConfirmDialog` itself, since it is reused unmodified).
**Files:** `frontend/stories/WorkArea/TrashView.stories.tsx`.
**Done when:** stories exist for: empty Trash; a mixed list with a
standalone resource and a folder with nested (display-only) children;
multi-select active with a partial selection; a batch-report state showing
a mixed success/failure count; and each restore-notice variant (relocated,
renamed, references-not-restored) from Task 18. All stories render without
error in Storybook and pass the `@storybook/addon-a11y` check with no new
violation, run via `pnpm storybook` (port 6006) then `pnpm test-storybook`
— both run by the lead **outside the Bash command sandbox**, per this
project's recorded `sandbox-breaks-device-and-watcher-tools` note; this task
itself only needs to confirm the story files exist and pass
`pnpm --filter getwrite-frontend typecheck`/a lint pass, not to run
Storybook's own Playwright suite inside the sandbox.
**Depends on:** 18
**Estimate:** 5
**POS:** task_b22c0115
**Done:** [ ]

### Task 20: Legacy-layout test coverage and knip cleanup gate (FR-22, FR-23)

**What:** Adds the FR-23-required legacy-layout fixture coverage not already
exercised incidentally by earlier tasks' own tests, in one place, so the
full legacy-vs-new-layout matrix (a trashed resource/folder with no ref
record, revisions still at their original path, no folder manifest) is
exercised in a single suite per FR-23's "in the same suite" requirement.
Also runs the knip cleanup gate: zero findings under this feature's new
paths.
**Files:** `frontend/tests/integration/trash-legacy-layout.test.ts` (new,
consolidating legacy-layout scenarios cross-referenced from Tasks 4, 7, 8,
10, 11 rather than duplicating their unit-level legacy assertions), `knip.json`,
plus whichever exported-but-unused symbol knip's measurement flags across
`frontend/src/lib/models/trash.ts`, `trash-refs.ts`/`trash-folder-manifest.ts`
(if separate files were used), `frontend/src/lib/api/trash.ts`,
`frontend/src/store/transport/native-trash-backend.ts`, and
`frontend/components/WorkArea/Views/TrashView.tsx`.
**Done when:** `trash-legacy-layout.test.ts` covers, in one file: a legacy
resource (no ref record, revisions at `revisions/<id>/`) that is listable,
restorable (with a "references couldn't be restored" notice), and purgeable
(revisions removed from the legacy path); a legacy folder (no manifest) —
per resolved OQ-12/FR-22, a folder soft-deleted before this feature's
manifest existed has no manifest to restore/purge from, so this test
documents and asserts the resulting behavior is a clear, non-crashing
"cannot restore/purge as a unit" outcome rather than silently succeeding
with partial data (this is the one legacy case where the feature's own
behavior, not a full-fidelity restore, is what's being asserted — confirm
against the spec's exact wording before asserting a specific message);
running `pnpm knip` and filtering its output to
`frontend/src/lib/models/trash*.ts`, `frontend/src/lib/api/trash.ts`,
`frontend/src/store/transport/native-trash-backend*.ts`,
`frontend/app/api/project/[project-id]/trash/**`,
`frontend/app/api/folder/[folder-id]/delete/route.ts`, and
`frontend/components/WorkArea/Views/TrashView.tsx` shows **zero** findings.
**Depends on:** 19
**Estimate:** 5
**POS:** task_d959616a
**Done:** [ ]

### Task 21: Full gate verification pass

**What:** Runs the repository's complete pre-merge verification suite
against the finished feature branch (Tasks 1–20) and fixes any failure that
traces back to this feature's own changes, without silencing or configuring
around a pre-existing, unrelated failure already on `main`.
**Files:** none expected beyond fixes to files already touched by Tasks
1–20, if any failure surfaces.
**Done when:** `pnpm --filter getwrite-frontend typecheck`, `pnpm --filter
getwrite-frontend lint`, and `pnpm --filter getwrite-frontend test:ci` all
pass; running `pnpm knip` and filtering to this feature's paths (listed in
Task 20's Done-when) shows zero findings; `pnpm --filter getwrite-cli test`
and `pnpm --filter getwrite-electron test` both still pass unchanged (this
feature adds no CLI or Electron surface, so these confirm no regression, run
from the **main worktree** per the recorded fact that some CLI QA tests fail
from an agent worktree under `.claude/worktrees/`); a diff review confirms
no file under `android/` or any Android-only path was touched (FR-11's
deferred-native-parity boundary — the native backend stub from Task 12 is
the one exception, and is expected).
**Depends on:** 20
**Estimate:** 3
**POS:** task_9c7d5090
**Done:** [ ]

## FR coverage map

| FR | Covered by |
| --- | --- |
| FR-1 | Task 11, Task 14, Task 15 |
| FR-2 | Task 11, Task 17 |
| FR-3 | Task 6, Task 13, Task 16 |
| FR-4 | Task 15 |
| FR-5 | Task 8, Task 9, Task 18 |
| FR-6 | Task 7, Task 10 |
| FR-7 | Task 10 |
| FR-8 | Task 1, Task 4 |
| FR-9 | Task 8, Task 18 |
| FR-10 | Task 7, Task 10 |
| FR-11 | Task 12, Task 21 |
| FR-12 | Task 11 |
| FR-13 | Task 17 |
| FR-14 | Task 18 |
| FR-15 | Task 19 |
| FR-16 | Task 5, Task 8 |
| FR-17 | Task 5 |
| FR-18 | Task 7, Task 10 |
| FR-19 | Task 3 |
| FR-20 | Task 2, Task 6, Task 9 |
| FR-21 | Task 17 |
| FR-22 | Task 8, Task 20 |
| FR-23 | Task 20 (consolidation) plus the per-mechanism unit/integration tests already required by Tasks 3, 4, 6, 8, 9, 10 |

## Summary

- Total tasks: 21
- Total estimated effort: 120 points
- Critical path: 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 15 → 17 → 18 →
  19 → 20 → 21. Tasks 1 and 2 feed into Task 6 (a shorter branch: 1 → 2 → 6)
  and so are not on the critical path. Task 13 (depends on 6) and Task 14
  (no dependency, can start immediately) form a shorter UI-wiring branch
  that joins the critical path at Task 16, which now depends on both Task 13
  and Task 15 before feeding into Task 17. The single longest chain is the
  `trash.ts` shared-file sequence in the preamble (3 → 4 → 5 → 6 → 7 → 8 → 9
  → 10) — eight of this feature's ten model-layer tasks all write the same
  file and cannot be parallelized once past Task 3.
- Risks: Task 10 (the ordered, resumable purge sweep) is the single
  highest-leverage task — it is the first point every prior model-layer
  unit (Tasks 3-7, 9) is exercised together under FR-18's strict ordering
  and idempotency contract, and a defect surfaced there may require
  revisiting one of those six rather than being fixable locally, mirroring
  how `importDocxProject`/`importScrivenerProject` played the same role in
  the two prior importer features. Task 6 (folder cascade) carries real
  correctness risk because it is genuinely new behavior closing a
  long-standing orphaning gap (`getwrite-cli doctor` exists specifically to
  detect the current gap) rather than an extension of existing tested code.
  Task 16's `resourcesSlice`/`AppShell` type-mismatch fix is scoped
  narrowly on purpose — its own investigation may reveal the mismatch
  compiles today only because of a broader typing looseness elsewhere in
  the slice, which would be a pre-existing condition out of this feature's
  scope to fix beyond what the folder-cascade fix requires. Task 17's
  multi-select UI is the largest single frontend task and, like
  `ImportDocxDialog` in the DOCX importer's own task list, the one most
  likely to blur distinct batch-outcome states into one generic message if
  rushed.

## Open Questions

None. All open questions on the source feature spec (OQ-1 through OQ-12) are
recorded there as resolved by owner decision at Gate 3, 2026-09-14; this
task list does not reopen or re-answer any of them.
