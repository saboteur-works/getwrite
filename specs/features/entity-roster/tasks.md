# Tasks: Project-level entity roster

Source spec: `specs/features/entity-roster.md`. Granularity: story points (1/2/3/5/8).

### Task 1: Add `getProjectMentionCounts` to `mentions-core.ts`
**What:** Adds a new exported function `getProjectMentionCounts(projectRoot: string): Promise<Record<string, number>>` to `frontend/src/lib/models/mentions-core.ts` that loads the mention index once via the existing `loadMentionIndex`, inverts it via the already-exported `invertMentionIndex` (`frontend/src/lib/models/mention-index.ts:67-79` — no reimplementation), and returns a map of every `entityId` present in the inverted index to `byEntity[entityId].length`. This is a pure read: no write, no second index-reading code path, no per-resource content load (unlike `getEntityMentionedIn`, which this function does not call).
**Files:** frontend/src/lib/models/mentions-core.ts, frontend/tests/unit/mentionsCore.test.ts (or existing mentions-core test file)
**Done when:** a unit test against a fixture mention index with two entities (one with 3 occurrences across two resources, one with 0 records anywhere in the index) confirms the returned map has the first entity at `3` and omits the second entirely (the roster layer, not this function, is responsible for defaulting an absent entity to `0` — see Task 6); an empty/missing mention index (no file on disk) returns `{}` rather than throwing; `pnpm --filter getwrite-frontend exec vitest run mentionsCore` (or the matching existing suite) is green.
**Depends on:** none
**Estimate:** 2
**Notes:** This is FR-6's model-layer half. Do not have this function read per-entity via `getEntityMentionedIn` in a loop — that is exactly the N+1 pattern FR-6 rules out, and it also does per-resource content loads this count does not need.
**Done:** [x]

### Task 2: Add a project-scoped HTTP route exposing mention counts
**What:** Adds `GET /api/project/[project-id]/entity-mention-counts`, modelled directly on `frontend/app/api/project/[project-id]/entity-alias-table/route.ts`'s structure (resolve/validate `project-id` via `resolveProjectPath`, wrap in `withStorageContext`, delegate entirely to Task 1's `getProjectMentionCounts`, no business logic in the route itself).
**Files:** frontend/app/api/project/[project-id]/entity-mention-counts/route.ts, frontend/tests (new or existing API route test file)
**Done when:** a GET request against a project with a built mention index returns a JSON object matching `getProjectMentionCounts`'s output shape; a request against an invalid/missing `project-id` returns the same fail-closed 4xx response `resolveProjectPath`/`validateProjectId` already produce for the entity-alias-table route; a route test covers both cases.
**Depends on:** 1
**Estimate:** 2
**Notes:** This route exists only for the web/desktop transport (Task 3); the native transport (Task 4) calls `getProjectMentionCounts` in-process and never hits this route — same split as the entity-alias-table route/native-backend pair.
**Done:** [x]

### Task 3: Add the client transport module for mention counts
**What:** Adds `frontend/src/lib/api/entity-mention-counts.ts`, modelled directly on `frontend/src/lib/api/entity-alias-table.ts`: an `EntityMentionCountsTransport` interface with a single `getEntityMentionCounts(projectId): Promise<Record<string, number>>` method, an `httpEntityMentionCountsTransport` implementation that fetches the Task 2 route and degrades to `{}` on any failure (network error, non-2xx, malformed body), and `resolveEntityMentionCountsTransport` built on `createTransport`, with the native branch's dynamic-import specifier reserved as a literal string (`../../store/transport/native-entity-mention-counts-backend`) for Task 4's `next.config.mjs` substitution.
**Files:** frontend/src/lib/api/entity-mention-counts.ts, frontend/tests (unit test for the HTTP path, mocking `fetch`)
**Done when:** `getEntityMentionCounts` returns the parsed counts map on a 200 response and `{}` on a network error or non-2xx response, verified by a unit test; the module compiles with the native backend module not yet existing (dynamic import only, never statically resolved at this point).
**Depends on:** 2
**Estimate:** 2
**Notes:** none
**Done:** [x]

### Task 4: Add native transport parity for mention counts
**What:** Adds `frontend/src/store/transport/native-entity-mention-counts-backend.ts` (in-process, calling Task 1's `getProjectMentionCounts` via `resolveProjectRoot`, mirroring `native-entity-alias-table-backend.ts`'s structure, storage-context binding via `createNativeRunner`, and degrade-to-`{}` parity with the HTTP transport) and its `.web-stub.ts` counterpart (mirroring `native-entity-alias-table-backend.web-stub.ts`'s throw-if-reached contract), and registers the substitution in `frontend/next.config.mjs`'s `turbopack.resolveAlias` for the exact literal specifier Task 3 reserved. **This is the exact failure mode called out in this feature's implementation-surface notes — a missing web-stub or missing `resolveAlias` entry ships `node:*` code into the web bundle — so this task's "Done when" explicitly checks for it.**
**Files:** frontend/src/store/transport/native-entity-mention-counts-backend.ts, frontend/src/store/transport/native-entity-mention-counts-backend.web-stub.ts, frontend/next.config.mjs
**Done when:** `createNativeEntityMentionCountsTransport` resolves the same shape as the HTTP transport for a fixture project's mention index, tested via `createNativeRunner`'s injectable `deps.fs` (mirroring `native-entity-alias-table-backend`'s test pattern); `next.config.mjs`'s `turbopack.resolveAlias` substitutes the web-stub for the exact import specifier used in Task 3; `pnpm --filter getwrite-frontend build` (web target) is inspected (grep the build output/chunk manifest, or the existing spot-check approach used for other Phase 2 native backends) and contains no `node:*`-only module reachable from `entity-mention-counts.ts`.
**Depends on:** 3
**Estimate:** 3
**Notes:** This is FR-6's native-parity clause and half of FR-13. A web-only mention-counts endpoint would be a regression per the spec.
**Done:** [x]

### Task 5: Wire the sixth "Entity Roster" view into the switcher and shell
**What:** Adds `"entityRoster"` to `ViewName` (`frontend/src/lib/models/types.ts:207`) and a corresponding sixth entry to `VIEW_OPTIONS` in `ViewSwitcher.tsx` (label "Entities", an icon distinct from the existing five — e.g. `lucide-react`'s `Users`), adds a case to `AppShell.tsx`'s `switch (view)` dispatch (~1372-1414) rendering a new, initially minimal `EntityRosterView` component under `frontend/components/WorkArea/Views/EntityRosterView/` (structural precedent: `OrganizerView`'s directory shape — a project-wide view with no resource-tree-selection dependency, same as `OrganizerView`/`TimelineView`), and extends AppShell's `disabledViews`/`disabledReasons` computation (~1218-1244) to push `"entityRoster"` onto `disabled` and supply a `disabledReasons.entityRoster` hover string whenever `selectEntitiesEnabled` is false — following the exact `timeline`/`isTimelineViewEnabled` pattern already there. The roster view has no resource-type dependency (unlike `edit`/`diff`), so it is never disabled for resource-type reasons, only for the `entities` flag.
**Files:** frontend/src/lib/models/types.ts, frontend/components/WorkArea/ViewSwitcher.tsx, frontend/components/Layout/AppShell.tsx, frontend/components/WorkArea/Views/EntityRosterView/EntityRosterView.tsx, frontend/tests/appShell*.test.tsx (or existing ViewSwitcher/AppShell test files)
**Done when:** a test confirms the "Entities" tab renders in `ViewSwitcher` and is selectable, switching `AppShell`'s work area to `EntityRosterView`; a test confirms that with the project's `entities` feature flag off, the "Entities" tab is disabled and exposes a hover/`title` explanation via the existing `disabledReasons` mechanism, matching the assertion style already used for the `timeline` case; `pnpm --filter getwrite-frontend typecheck` passes with the widened `ViewName` union.
**Depends on:** none
**Estimate:** 3
**Notes:** This is FR-1 and FR-2's entire scope. `EntityRosterView` is a structural placeholder at this point (e.g. renders nothing or a loading stub) — Task 6 gives it its data and Task 7 its row markup. Safe to build in parallel with Tasks 1-4 (no file overlap).
**Done:** [x]

### Task 6: Assemble the roster's entity list — names, aliases, kind, mention counts, ordering, warnings, empty state
**What:** Builds `EntityRosterView`'s data-assembly logic: reads the cached alias table from `entityAliasTableSlice` (no new fetch, per FR-3/FR-7), dispatches Task 3's `getEntityMentionCounts` on mount/project change (the one bounded round trip FR-6 requires) and defaults any entity absent from the returned map to `0`, sorts the combined list alphabetically by entity name case-insensitively with no user-facing sort/filter control (FR-4), and derives per-entity warning state by checking each of the entity's terms against `entity-alias-table.ts`'s `claimedBy` map (ambiguous) and each declared alias against `entity-alias-warnings.ts`'s `getAliasWarning` (noise-prone) — collapsing both into the single shared "needs attention" boolean state per FR-9, with the underlying which-condition(s)-apply text kept alongside for Task 7's accessible-name composition (FR-8). Renders the FR-11 non-error empty state (explaining no entities have been declared yet) when the project's `entities` flag is on but the alias table has zero entities, instead of an empty table with only headers.
**Files:** frontend/components/WorkArea/Views/EntityRosterView/EntityRosterView.tsx, frontend/tests/component/EntityRosterView.test.tsx
**Done when:** a test with a fixture alias table of 3 entities and a mixed mention-counts response confirms the rendered list is alphabetical by name regardless of input order (FR-4); a test confirms an entity absent from the mention-counts map (as well as one explicitly present at `0`) is treated identically as zero-mention, and is visually and textually distinguished from a nonzero entity (not merely a "0" string), per FR-5; a test confirms an entity whose term appears in `claimedBy` and a separate entity with a `getAliasWarning`-flagged alias both surface as "needs attention" via one shared visual/data state, not two (FR-7/FR-9); a test with a project that has `entities` on but zero declared entities renders the FR-11 empty-state message, not an empty table.
**Depends on:** 3, 5
**Estimate:** 5
**Notes:** This task owns FR-3's "no grouping/sorting/filtering by kind" constraint too — the `entityKind` label is per-row data only (handed to Task 7), never used to section or reorder the list here.
**Done:** [x]

### Task 7: Build the entity row — accessible name, warning disclosure, non-red styling
**What:** Adds the row markup Task 6's list renders, reusing `frontend/components/WorkArea/ResourceListItem.tsx:45-56`'s `<li>` wrapping a full-width native `<button type="button">` pattern (already consumed by `StubResourcesSection.tsx`/`DataView.tsx`) rather than a `role="row"` grid. Each row shows the entity's name, its declared aliases, an `entityKind` label, and the mention count with FR-5's zero-mention distinction. Where Task 6 flags "needs attention", the row folds FR-8's disclosure text (naming which of "ambiguous claim" / "noise-prone alias" / both applies) directly into the button's accessible name — via visually-hidden text or a composed `aria-label`, not a `title` on a non-focusable element — with no nested interactive control inside the button. The warning indicator's styling uses a non-`red`/non-`#D44040` token, consistent with entity highlighting's FR-7 precedent and CLAUDE.md's reserved-red convention.
**Files:** frontend/components/WorkArea/Views/EntityRosterView/EntityRosterRow.tsx, frontend/tests/component/EntityRosterRow.test.tsx
**Done when:** a test confirms the row's accessible role/name is a native button (queryable via `getByRole("button", { name: ... })`), and that for a "needs attention" entity the accessible name includes the FR-8 disclosure text (asserted via the full accessible name string, not a `title` attribute alone); a test confirms a plain-match entity's accessible name carries no warning text; a test/story confirms the warning indicator's computed color is not `#D44040`/`red`; `pnpm --filter getwrite-frontend exec vitest run EntityRosterRow` is green.
**Depends on:** 6
**Estimate:** 3
**Notes:** This is FR-8/FR-9/FR-12 together, per this task list's flagged risk: a `title` on a `<span>` does not satisfy FR-12, and this task's first done-when criterion exists specifically to catch that regression.
**Done:** [x]

### Task 8: Wire row activation to the entity's alias editor
**What:** Wires Task 7's row button's click/Enter/Space activation (native `<button>` gives both for free) to `setSelectedResourceId` (`resourcesSlice.ts`) for the entity's `entityId`, then switches the work area's `view` back to `"edit"` so the existing `EntitySection` alias editor (reached via the resource's sidebar, unchanged) is what the writer lands on — reusing the existing `updateSidecar` write path unchanged, per FR-10. The roster itself continues to expose no control that edits name/`entityKind`/aliases.
**Files:** frontend/components/WorkArea/Views/EntityRosterView/EntityRosterView.tsx (or EntityRosterRow.tsx, wherever the click handler is wired), frontend/tests/component/EntityRosterView.test.tsx
**Done when:** a test confirms clicking a row dispatches `setSelectedResourceId` with that row's `entityId` and switches `view` away from `"entityRoster"`; a keyboard test (focus the row, press Enter, then Space in a second case) confirms both activate the same navigation, not just a pointer click; a test confirms no roster-rendered control calls `updateSidecar` or any other sidecar-write path directly.
**Depends on:** 5, 7
**Estimate:** 2
**Notes:** none
**Done:** [x]

### Task 9: Storybook stories and a11y pass for the roster view and row
**What:** Adds `EntityRosterView.stories.tsx` and `EntityRosterRow.stories.tsx` (or a single combined stories file, implementor's choice) exercising: a populated roster with a mix of zero-mention, nonzero-mention, ambiguous, and noise-warning entities; and the FR-11 empty state. Matches the Storybook conventions `EntityCompileResourceList.stories.tsx` established for a recent sibling feature (per `docs/standards/storybook-implementation.md`).
**Files:** frontend/components/WorkArea/Views/EntityRosterView/EntityRosterView.stories.tsx, frontend/components/WorkArea/Views/EntityRosterView/EntityRosterRow.stories.tsx
**Done when:** both stories render without error in Storybook and pass the `@storybook/addon-a11y` check with no new violations, including the "needs attention" row (its accessible name and color contrast must both clear the a11y check); the empty-state story is visually distinct from a populated one.
**Depends on:** 6, 7
**Estimate:** 2
**Notes:** none
**Done:** [x]

### Task 10: Integration test — roster fidelity against a real fixture project
**What:** Adds an integration test against a fixture project with: an entity with several detected mentions, an entity with zero mentions anywhere in the project, two entities sharing an ambiguous alias (`claimedBy`), an entity with a `getAliasWarning`-flagged short/common-word alias, and entities with names differing only in case (to exercise FR-4's case-insensitive sort). Confirms the rendered roster's per-entity mention counts match `getProjectMentionCounts`'s output for the same fixture (FR-6), the zero-mention entity is distinguishable per FR-5, both warning conditions surface correctly per FR-7/FR-8/FR-9, and the list order is alphabetical per FR-4 regardless of the alias table's/mention index's own iteration order.
**Files:** frontend/tests/integration/entity-roster.test.ts
**Done when:** the test asserts all properties above against the same fixture in one run and passes; deliberately reordering the fixture's underlying alias-table/mention-index iteration does not change the asserted roster order, demonstrating FR-4's ordering is roster-computed and not source-order-derived.
**Depends on:** 6, 7, 8
**Estimate:** 3
**Notes:** none
**Done:** [x]

### Task 11: Verify native (Android) parity for the entity roster
**What:** Confirms the entity roster has no native-specific gap beyond what Task 4 already covers for mention counts: `EntityRosterView.tsx`/`EntityRosterRow.tsx` import nothing platform-specific (grep-verified: no `node:*` import, no direct `fetch`/HTTP call bypassing `lib/api/entity-mention-counts.ts`/`lib/api/entity-alias-table.ts`, no `runtime === "native"` branch), and the feature relies exclusively on the already-native-parity alias-table transport (`native-entity-alias-table-backend.ts`) and Task 4's mention-counts native backend.
**Files:** none (build/verification task; no source changes expected)
**Done when:** `pnpm --filter getwrite-frontend build:native` (or the project's documented native build equivalent) completes without error with Tasks 5-8's changes present, and does not newly bundle any `node:*`-only module; a check confirms `EntityRosterView.tsx` and `EntityRosterRow.tsx` contain no direct `fetch` call and no native-runtime branch.
**Depends on:** 4, 8
**Estimate:** 2
**Notes:** This is FR-13's coverage. If a gap is found, file it back against Task 4, 5, or 8 rather than patching ad hoc here, matching the equivalent verification task's convention in `specs/features/entity-scoped-compile/tasks.md` (Task 7) and `specs/features/entity-highlighting/tasks.md` (Task 15).
**Done:** [x]

### Task 12: Manual verification pass in the running app
**What:** Exercises the complete feature by hand in the running desktop/web app (and, if a device is available, Android) to confirm behavior the automated suite cannot fully assert: visual appearance of the zero-mention and warning states, real navigation behavior, and true offline operation.
**Files:** none (manual QA task; no source changes expected)
**Done when:** each of the following is confirmed by hand and recorded in the task's completion note: (1) the "Entities" tab appears alongside Edit, Organizer, Data, Diff, and Timeline and is selectable, per FR-1; (2) with the project's `entities` flag off, the tab is visibly disabled with a hover explanation, and no roster is reachable, per FR-2; (3) the roster lists every declared entity alphabetically with name, aliases, and kind visible, per FR-3/FR-4; (4) an entity with zero mentions anywhere is visually distinguishable at a glance from one with mentions, per FR-5; (5) an entity with an ambiguous or noise-prone alias shows the "needs attention" treatment, and its accessible name (checked via the browser's accessibility inspector or a screen reader) discloses which condition(s) apply, per FR-7/FR-8/FR-9/FR-12, and the warning color is confirmed not to be the reserved red token; (6) clicking (and, separately, keyboard-activating) an entity row navigates to that entity's resource and opens `EntitySection`, per FR-10; (7) a project with `entities` on but zero declared entities shows the FR-11 empty state rather than a bare table; (8) if a device is available, the roster (including mention counts) loads correctly with the device's network disabled, per FR-13.
**Depends on:** 9, 10, 11
**Estimate:** 1
**Notes:** This is the manual-exercise task the automated suite cannot fully substitute for — live visual appearance of the warning treatment and true device-level offline behavior need a human pass before sign-off, mirroring `specs/features/entity-scoped-compile/tasks.md`'s Task 8 and `specs/features/entity-highlighting/tasks.md`'s Task 16.

**Verification record (Stage 6.5, pipeline lead, against The SF Sideshow, web/dev):**
Ground truth was read from disk first (6 declared entities; mention index counts
28/12/32/0/18/3) and the UI checked against it, rather than the UI being read on
its own terms.

CONFIRMED — (1) the "Entities" tab appears sixth alongside Edit/Organizer/Data/
Diff/Timeline and is selectable. (3) all 6 entities list alphabetically with
name, `entityKind` and aliases. (4) the zero-mention entity renders "No mentions
yet", distinct at a glance from a count. (6) keyboard activation (focus + Enter)
navigates to the entity's resource and switches to the edit view with
`EntitySection` reachable; rows are native `<button type="button">` whose
accessible name carries the full row content, with zero nested interactive
elements.

NOT CONFIRMED, and not to be read as passing — (2) the flag-off disabled tab and
hover reason (covered by component tests, not exercised by hand). (5) the
"needs attention" treatment and its accessible name: this project contains no
ambiguous alias, and its short aliases do not trip the heuristics — "Case" is
absent from the 20-word common list and "Ada" is exactly 3 characters against a
`< 3` threshold — so the warning path could not fire here and the reserved-red
check was not made. (7) the FR-11 empty state, which needs a project with
`entities` on and none declared. (8) device-level offline behaviour; no Android
device this session.

A defect was found during this pass and fixed separately: the roster was
unreachable with no resource selected. See the fix commit.

**Verification record, second pass (2026-09-07, POS `task_ecb1e204`, against
purpose-built fixtures, web/dev):**
The first pass could not exercise criteria (2), (5) and (7) because The SF
Sideshow contains no project shaped to trigger them. This pass built three
disposable fixture projects in a `getwrite-cli qa start` workspace (never the
repo's real `projects/`), read their ground truth off disk first, and checked
the UI against it.

- `roster-warnings` — 5 declared entities. Two ("Maylin Ostrander",
  "Mayfield Hall") both claim the alias "May", which is ambiguous *and* on the
  common-word list; one ("Ferran Ashcroft") has the 2-character alias "Fe",
  which is noise-prone but not ambiguous; one is clean; one is declared and
  mentioned nowhere. Disk ground truth after `getwrite-cli reindex`:
  Corvina 5/3, Ferran 3/2, Mayfield 4/3, Maylin 4/2, Quillon 0/0
  (mentions/documents).
- `roster-empty` — `entities` on, two resources, nothing declared.
- `roster-flag-off` — `entities` off, one entity declared.

CONFIRMED — (2) with `entities` off, the Entities tab renders disabled
(`disabled` and `aria-disabled="true"`, opacity 0.4, `cursor: not-allowed`) and
hovering it shows "Entities are off. Turn them on in User Preferences →
Entities."; the roster is unreachable because the tab cannot be activated.
(5) all three "needs attention" entities show the treatment and the two clean
ones do not; each accessible name discloses which condition(s) apply —
"Needs attention: noise-prone alias." for Ferran, "Needs attention: ambiguous
claim and noise-prone alias." for Mayfield and Maylin; the indicator's measured
background is `rgba(140, 112, 168, 0.36)`, the purple
`--color-gw-entity-highlight-attention` token, not the reserved red
(`#D44040`) — and the token is that same purple at both theme definitions
(`styles/getwrite-utilities.css`: 0.28 light, 0.36 dark), so neither theme uses
red. (7) with `entities` on and nothing declared, the roster renders the FR-11
sentence "No entities have been declared yet. Give a resource an entity kind to
have it appear here." rather than a bare table.

Re-confirmed incidentally against ground truth: (3)/(4) all five entities list
alphabetically with name, kind, aliases and counts matching disk exactly, and
the zero-mention entity reads "No mentions yet".

STILL NOT CONFIRMED — (8) device-level offline behaviour; no Android device
this session. This criterion alone remains open.

Cosmetic observation, not a defect against FR-11: the empty state renders flush
to the top-left of the work area with no padding, unlike the roster list, which
sits in a padded card.

**Done:** [x] (7 of 8 criteria confirmed across two passes; (8), Android
offline, still requires a device)

## Summary
- Total tasks: 12
- Total estimated effort: 30 points
- Critical path: Tasks 1 → 2 → 3 → 4 → 6 → 7 → 8 → 10 → 12 (Task 5 runs in parallel with Tasks 1-4 and joins at Task 6)
- Risks: Task 4 (native mention-counts transport) carries the usual ADR-021 risk of a `node:*` import leaking into the web bundle if the `turbopack.resolveAlias` entry is misconfigured or the web-stub is omitted — this is a previously-hit failure mode in this codebase, which is why Task 4's done-when explicitly checks the build output rather than only unit-testing the transport function. Task 7 is the highest correctness risk for accessibility: folding FR-8's warning text into the row button's accessible name (rather than a `title` on a nested span) is easy to get structurally wrong, so its done-when criteria assert the full accessible name string rather than the presence of any warning-related markup. Tasks 1-4 (mention-counts plumbing) and Task 5 (view wiring) touch disjoint files and can proceed concurrently; Task 6 is the first point they converge, so an interface mismatch between the mention-counts map shape (Task 1-3) and the alias-table shape (already-existing `entityAliasTableSlice`) would surface there.

## Open Questions

None. The source feature spec has zero open questions, and this task list introduces no new ones — every task is fully specified against the settled requirements.
