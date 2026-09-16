### FU-1: Rename notice can't show the item's true restored name past the first collision

**What:** `TrashView.tsx`'s Task 18 rename notice always renders `"<name> (restored)"` when a restore result's `renamed` flag is `true`. That's accurate for the first name collision at a destination, but `models/trash.ts`'s `resolveRestoreCollisionName`/`resolveFolderRestoreCollisionName` suffix a second, third, ... collision on the same name as `"<name> (restored 2)"`, `"<name> (restored 3)"`, etc. — a name this notice cannot know, because `RestoreItemResult` (the client-facing type returned by `POST .../trash/restore` and `restoreTrashItems`) only carries a `renamed: boolean` flag, not the actual resolved name.

**Why deferred:** Task 18's file scope was `TrashView.tsx` + its tests only; widening `RestoreItemResult`/the restore route/`RestoreResourceResult`'s call sites to surface the resolved name is a backend/transport change outside that scope.

**Context:** The resolved name lives on `RestoreResourceResult.restoredName` / `RestoreFolderResult.restoredName` (`frontend/src/lib/models/trash.ts`), computed inside `restoreResource`/`restoreFolder`. To fix, add a `restoredName: string` field to `RestoreItemResult` in both `frontend/app/api/project/[project-id]/trash/restore/route.ts` and `frontend/src/lib/api/trash.ts`, thread it through `restoreOne`, and have `TrashView.tsx`'s `buildRestoreNotices` use it instead of synthesizing `"${name} (restored)"`.

**Relates to:** Task 18
**Raised:** 2026-09-14
**Resolved:** [x]
**Resolved on:** 2026-09-15

**Resolution:** Addressed by `specs/features/trash-ui-followups.md` (FR-1),
commit `79c9ea11`. A lead real-app re-check on 2026-09-15 measured: with
both "Chapter One" and "Chapter One (restored)" already existing at the
root, restoring "Chapter One" produced "Chapter One (restored 2)" on disk,
and the rename notice read "Chapter One" was restored as "Chapter One
(restored 2)".

### FU-2: Existing folder-delete confirmation still describes a folder as "the resource"

**What:** The existing soft-delete confirmation dialog's wording says "This
will remove the resource. Proceed?" even when the id being deleted is a
folder, not a resource.

**Why deferred:** Out of this Gate 6 review's scope — the confirmation
wording for the *initial* soft delete (as opposed to Trash UI's own
restore/purge confirmations) is explicitly excluded by `trash-ui.md`'s
Non-goals ("Any change to how a resource is soft-deleted in the first
place... beyond what folder-delete cascade and reference-nullification
recording require").

**Relates to:** Task 13 (folder-delete route), general
**Raised:** 2026-09-14
**Resolved:** [x]
**Resolved on:** 2026-09-15

**Resolution:** Addressed by `specs/features/trash-ui-followups.md` (FR-2,
resolved: OQ-5), commit `403b60d9`. A lead real-app re-check on 2026-09-15
measured: the folder delete dialog read "This will move the folder and
everything in it to Trash. Proceed?"; the resource dialog still reads
"This will remove the resource. Proceed?".

### FU-3: `deleteFolder`/`remove` in `resources.ts` bypass `createTransport` and don't check response status

**What:** `deleteFolder` (`frontend/src/lib/api/resources.ts:388`) calls
`fetch` directly rather than going through `createTransport`, so it has no
native-path implementation (ADR-021), and it does not check
`response.ok`/`response.status` before treating the request as successful.
The existing `remove` function (`frontend/src/lib/api/resources.ts:216`) has
the same missing status check.

**Why deferred:** Both predate this Gate 6 review and are outside its six
findings; fixing them is a transport-layer change with its own blast radius
(native parity, error-handling contract for every existing call site), not a
Trash-view-specific bug.

**Relates to:** general (`lib/api/resources.ts`)
**Raised:** 2026-09-14
**Resolved:** [x]
**Resolved on:** 2026-09-15

**Resolution:** Addressed by `specs/features/trash-ui-followups.md` (FR-3,
FR-4, FR-5, resolved: OQ-1), commits `87112b7b`, `31f048be`, `01ffa3e6`.
`deleteFolder` now goes through `createTransport` (native backend calls
`softDeleteFolderCore`); HTTP `remove` and `deleteFolder` reject on a
non-2xx response; a failed delete leaves state unchanged with an error
toast. A lead real-app re-check on 2026-09-15 measured the live success
path: deleting a folder moved the folder, its manifest, and both
resources (content, sidecars, ref records, revisions) into `.trash/`. The
failure path is verified only by
`frontend/tests/component/page-delete-failure.test.tsx`, not by a live
re-check.

### FU-4: The purge route's "Resource not found." fallback path isn't reachable via TrashView under the default Edit view

**What:** Task 17's commit note records that the "Resource not found."
fallback `AppShell.tsx` already renders for a since-deleted open resource
(FR-21/OQ-11) could not actually be exercised end-to-end by purging a
resource from `TrashView` while the app was showing the default Edit view —
the fallback path Task 17's test relies on is asserted at the unit level,
not observed live in that combination.

**Why deferred:** Confirming the live end-to-end path (not just the unit
assertion) needs a Chromium walkthrough, which is the kind of check the
Stage 6.5/Gate 6 review already does for other findings but wasn't in scope
for FR-21 specifically at Task 17's own gate.

**Relates to:** Task 17
**Raised:** 2026-09-14
**Resolved:** [x]
**Resolved on:** 2026-09-14

**Resolution:** Closed by a live check, not a code fix. The lead ran the
check in Chromium against a dev server on `feat/trash-ui-followups` (code
equal to `main` at `2f180cd5`) on 2026-09-14: with "Chapter One" open in
the editor, deleting it from the tree cleared the selection — the Work
Area showed the project landing page ("Select a file from the resource
tree, or create a new resource to continue.") with a "Resource deleted —
Chapter One" toast, not "Resource not found." Purging Chapter One from the
Trash tab then left no open resource; the Edit tab was disabled (nothing
selected), with no stale state shown. The FR-21 "Resource not found."
fallback is therefore not reachable through delete-then-purge, because
soft delete already clears the selection before purge is ever possible.
Owner decision at Gate 3 (2026-09-14): decide after the check — nothing
was found, so this closes with no implementation task. See
`specs/features/trash-ui-followups.md` (FR-8, resolved: OQ-3).

### FU-5: `trash-view.a11y.test.tsx` is a hand-written approximation, not a real axe run

**What:** `frontend/tests/a11y/trash-view.a11y.test.tsx` asserts specific
ARIA attributes/roles by hand; it does not run an actual accessibility
engine (e.g. `axe-core`) against the rendered markup. No axe library
(`axe-core`, `jest-axe`, `@axe-core/*`) is a `frontend/package.json`
dependency today — Gate 5's real axe findings (`nested-interactive`,
`aria-allowed-role`, `list`) were only caught by the separate
Storybook/Playwright a11y run, not by this Vitest suite, which is exactly
why it passed despite those violations existing (Task 19's own finding).

**Why deferred:** Adding a real axe-backed Vitest a11y suite is a
testing-infrastructure change (new dependency, `package-selection.md`
justification, and a decision about which suites adopt it) broader than
this Gate 6 review's six findings.

**Relates to:** Task 18, Task 19
**Raised:** 2026-09-14
**Resolved:** [ ]
**Resolved on:**

### FU-6: A legacy folder with no manifest can't be restored or purged as a single unit

**What:** Task 20's legacy-layout test documents that a folder soft-deleted
before this feature's `TrashFolderManifestSchema` existed — so it has no
`.trash/meta/folder-<id>.json` manifest — cannot be restored or purged as a
whole unit by `restoreFolder`/`purgeFolder`, which both require the
manifest to know what descendants to act on. The asserted behavior is a
clear, non-crashing "cannot restore/purge as a unit" outcome, not a
full-fidelity restore/purge.

**Why deferred:** Per `trash-ui.md`'s resolved OQ-12/FR-22, legacy tolerance
for a folder without a manifest is explicitly scoped to "listable" with a
clear non-crashing outcome for restore/purge, not full unit-level recovery;
building manifest reconstruction for a pre-feature folder is new scope
beyond what OQ-12 resolved.

**Relates to:** Task 20
**Raised:** 2026-09-14
**Resolved:** [x]
**Resolved on:** 2026-09-14

**Resolution:** Closed by evidence, not a code fix. The lead ran
`git show` at `15d77139`, the last commit before Feature 26 merged:
`trash.ts` contained no reference to folders; `page.tsx`'s delete branch
(line 651) called `deleteResource` unconditionally and filtered only the
flat `resources` array, never `folders`; the resource delete route called
only `softDeleteResource`; the only other files mentioning `.trash` were
the Scrivener and DOCX import reports. No pre-Feature-26 code path could
put a folder into `.trash/`, confirming the claim that pre-Feature-26
folder "deletion" never moved anything into `.trash/` and only removed the
folder from client-visible state. Owner decision at Gate 3 (2026-09-14):
accept this closure with no further hardening of `trash-ui.md`'s resolved
OQ-12/FR-22 manifest-less-folder handling. See
`specs/features/trash-ui-followups.md` (FR-9, resolved: OQ-4).

### FU-7: `ConfirmDialog`'s confirm button is always the brand-red `destructive` `Button` variant, app-wide

**What:** `ConfirmDialog.tsx` always renders its confirm button as
`<Button variant="destructive">`, and `Button.tsx`'s `destructive` variant
is defined as `text-gw-red`/`border-gw-red-border` — literal brand red.
Every existing `ConfirmDialog` caller (e.g. `RemoveEntityControl.tsx`) gets
this same red confirm button, regardless of whether the action it confirms
is itself as destructive as, say, a permanent delete. This repository's
CLAUDE.md reserves red for position/canonical-state indicators, "never for
actions or alerts."

**Why deferred:** This is a shared-primitive design decision (`Button`'s own
`destructive` variant, used identically across the app) rather than
anything specific to the Trash UI's own markup. The Trash UI's own restore,
permanent-delete, and "Empty trash" batch confirmations are all specified —
FR-2, Goals, and OQ-9 require a batch confirmation for restore as well as
the destructive actions, reaffirmed by the owner at Gate 4 (2026-09-14) —
so this feature's `ConfirmDialog` uses are not themselves the problem; the
tension is only that all three inherit the same brand-red confirm button
from `ConfirmDialog`/`Button`'s shared `destructive` variant regardless of
whether the confirmed action is itself destructive. Task 26 confirmed this
is the shared, unmodified primitive already used identically elsewhere
(e.g. `RemoveEntityControl.tsx`) and left it unchanged — fixing it here
would affect every other confirm dialog in the app and is a brand/
design-system decision beyond one feature's fix.

**Relates to:** Task 26
**Raised:** 2026-09-14
**Resolved:** [ ]
**Resolved on:**

**Update (2026-09-14):** Task 25's styling pass also applied
`variant="destructive"` styling to the Trash toolbar's "Delete selected
permanently" and "Empty trash" buttons, extending the same red-confirm-button
tension from `ConfirmDialog` to these two toolbar buttons. A lead re-check
against a dev server at HEAD `204611b7` measured the toolbar's
`button[data-testid="trash-empty-trash"]` foreground at `#d44040` on
background `#f5f4f0`, a contrast ratio of 4.14 at the button's ~10px text
size (WCAG AA requires 4.5:1 at that size). See FU-9 for the full contrast
measurement, which also covers a second, unrelated failure in the same
component. No cause for either is established beyond the styling and color
values reported here.

### FU-8: Trash view doesn't refetch on a delete elsewhere while its own tab stays selected

**What:** A lead re-check on 2026-09-14 (real-app walkthrough in Chromium
against a dev server at HEAD `204611b7`) measured the following sequence:
with the Trash tab already selected and showing "2 of 2 restored. Trash is
empty.", deleting "Chapter Two" from the resource tree's row menu did not
update the Trash view — it continued to show the prior empty-trash state
even though `.trash/` on disk held the newly deleted resource. Clicking the
Trash tab again (while already selected) did not trigger a refetch either.
Switching to the Data tab and back to Trash did show the item. No cause for
this has been investigated or established.

**Why deferred:** Owner decision at the Gate 6 re-check (2026-09-14): record
as a follow-up rather than fix in this run.

**Relates to:** TrashView.tsx (general)
**Raised:** 2026-09-14
**Resolved:** [x]
**Resolved on:** 2026-09-15

**Resolution:** Addressed by `specs/features/trash-ui-followups.md` (FR-10,
resolved: OQ-2), commit `126cfdff`. `TrashView` selects a cheap
`resourcesSlice` value that changes on every `removeResource` dispatch and
refetches while mounted; no new context, provider, or action. A lead
real-app re-check on 2026-09-15 measured: with the Trash tab open,
deleting the "Research" folder from the tree made it appear in the Trash
list without switching tabs.

### FU-9: Two color-contrast failures under a strict (non-`"todo"`) axe run of `TrashView` stories, introduced between Gate 5 and Task 25

**What:** `pnpm --filter getwrite-frontend test-storybook stories/WorkArea/TrashView` passes 7/7 as committed, because the repo's Storybook a11y
config sets `a11y.test: "todo"` for these stories. A lead re-check on
2026-09-14, run outside the Bash sandbox with `a11y.test` temporarily
overridden to `"error"`, measured 6 of 7 `TrashView` stories failing on
`color-contrast` only — no structural rule failures were observed in that
run. The two failing elements were:

- `button[data-testid="trash-empty-trash"]`: foreground `#d44040` on
  background `#f5f4f0`, contrast ratio 4.14 at ~10px text (WCAG AA requires
  4.5:1 at that size).
- Nested-row metadata text (`li.workarea-list-item-meta`): foreground
  `#7a7870` on background `#f5f4f0`, contrast ratio 4.01 at ~10px text.

The same strict run passed 7/7 before Task 25's styling changes landed, so
the regression is bounded to that commit's styling work, though no specific
mechanism within it has been verified as the cause. The `#d44040` value
matches `Button.tsx`'s `destructive` variant (see FU-7, which the "Empty
trash" and "Delete selected permanently" toolbar buttons also use); the
`#7a7870` value comes from the shared `workarea-list-item-meta` class, used
outside the Trash view as well.

**Why deferred:** Owner decision at the Gate 6 re-check (2026-09-14): record
as a follow-up rather than fix in this run. The repo's stories already ship
with `a11y.test: "todo"`, so this finding is not currently blocking the
default (non-strict) Storybook a11y run Task 19's own gate relied on.

**Relates to:** Task 25, FU-7
**Raised:** 2026-09-14
**Resolved:** [ ]
**Resolved on:**

### FU-10: Post-restore refetch dispatched an unvalidated `openProject` response, crashing `TrashView` after a successful restore

**What:** `TrashView.tsx`'s post-restore refetch dispatched an unvalidated
`openProject` response into the Redux store, crashing the view immediately
after a *successful* restore.

The chain, all three links introduced by the merged Trash UI follow-ups PR
(#201):

1. Task 6 added a post-restore `openProject` refetch in
   `confirmPendingAction`'s restore branch, dispatching
   `loadResources({ resources: opened.resources, projectId })` and
   `setProjectFolders(opened.folders)`.
2. `openProject` is typed `Promise<ProjectApiEntry>`, but its HTTP transport
   (`frontend/src/lib/api/projects.ts`) does not validate the response body
   against that type, so those two fields can be `undefined` at runtime.
   Neither dispatch throws in that case (`loadResources` is a
   `createAsyncThunk`), so the surrounding `try/catch` never fires —
   `undefined` is written into the store instead (`loadResources.fulfilled`
   sets `state.resources = action.payload`; `setFolders` sets
   `state.folders = action.payload`).
3. Task 6 also added the selector
   `(s) => s.resources.resources.length + s.resources.folders.length` at
   `TrashView.tsx:211`, which then throws
   `TypeError: Cannot read properties of undefined (reading 'length')` on the
   next render, unmounting `TrashView` along with its restore notices and
   batch report.

**How it was found and confirmed:** the three `RestoreNotice*` stories in
`frontend/stories/WorkArea/TrashView.stories.tsx` failed under the
destructive-styling-a11y run's strict-axe check — not on any a11y rule, but
with `TestingLibraryElementError: Unable to find an element by:
[data-testid="trash-restore-notices"]`. Those stories stub `globalThis.fetch`
with a catch-all returning `{}`, which is exactly the malformed `openProject`
body above. Two measurements discriminated the cause: (a) checking out the
pre-#201 `TrashView.tsx` (`2f180cd5`) made all 7 stories pass, and restoring
HEAD's copy reproduced the 3 failures; (b) a component test with
`openProject` mocked to resolve `{}` reproduced the exact `TypeError` at
`TrashView.tsx:212`.

**Why deferred:** Not deferred — fixed in the destructive-styling-a11y run
because it blocked that run's Task 8 verification.

**Context:** The two dispatches are now each guarded by an independent
`Array.isArray` runtime check on the corresponding field, so a malformed
response degrades to "the sidebar resource tree needs a manual reload" — the
outcome the existing `catch` comment already names as acceptable — instead of
poisoning the store.

**Relates to:** `specs/features/trash-ui-followups.md` Task 6 / FR-10;
destructive-styling-a11y Task 8
**Raised:** 2026-09-15
**Resolved:** [x]
**Resolved on:** 2026-09-15

**Resolution:** The two dispatches in `TrashView.tsx`'s `confirmPendingAction`
restore branch are now each guarded by an independent `Array.isArray` runtime
check on the corresponding field before dispatch, so a malformed `openProject`
response degrades to "the sidebar resource tree needs a manual reload" instead
of poisoning the store with `undefined`. A regression test in
`frontend/tests/component/TrashView.test.tsx` (in the Task 18 restore-notices
describe block) mocks `openProject` to resolve `{}` and asserts the notice
still renders; it fails with that `TypeError` before the fix and passes after.
After the fix, `pnpm test-storybook stories/WorkArea/TrashView` reports 7
passed (7) under `parameters.a11y.test: "error"`.

Still open: only the one call site was hardened. The root cause is
untouched — `openProject`'s HTTP transport still performs no runtime
validation of its response body, and `loadResources`/`setFolders` still trust
their payloads unconditionally, so another dispatch site could poison the
store the same way. That broader hardening is not in this run's scope.
