### FU-1: Rename notice can't show the item's true restored name past the first collision

**What:** `TrashView.tsx`'s Task 18 rename notice always renders `"<name> (restored)"` when a restore result's `renamed` flag is `true`. That's accurate for the first name collision at a destination, but `models/trash.ts`'s `resolveRestoreCollisionName`/`resolveFolderRestoreCollisionName` suffix a second, third, ... collision on the same name as `"<name> (restored 2)"`, `"<name> (restored 3)"`, etc. — a name this notice cannot know, because `RestoreItemResult` (the client-facing type returned by `POST .../trash/restore` and `restoreTrashItems`) only carries a `renamed: boolean` flag, not the actual resolved name.

**Why deferred:** Task 18's file scope was `TrashView.tsx` + its tests only; widening `RestoreItemResult`/the restore route/`RestoreResourceResult`'s call sites to surface the resolved name is a backend/transport change outside that scope.

**Context:** The resolved name lives on `RestoreResourceResult.restoredName` / `RestoreFolderResult.restoredName` (`frontend/src/lib/models/trash.ts`), computed inside `restoreResource`/`restoreFolder`. To fix, add a `restoredName: string` field to `RestoreItemResult` in both `frontend/app/api/project/[project-id]/trash/restore/route.ts` and `frontend/src/lib/api/trash.ts`, thread it through `restoreOne`, and have `TrashView.tsx`'s `buildRestoreNotices` use it instead of synthesizing `"${name} (restored)"`.

**Relates to:** Task 18
**Raised:** 2026-09-14
**Resolved:** [ ]
**Resolved on:**

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
**Resolved:** [ ]
**Resolved on:**

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
**Resolved:** [ ]
**Resolved on:**

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
**Resolved:** [ ]
**Resolved on:**

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
**Resolved:** [ ]
**Resolved on:**

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
