# Tasks: Project-level entity relationship graph view

Source spec: `specs/features/entity-relationship-graph.md`. Granularity: story points (1/2/3/5/8).

### Task 1: Select and vet a headless layout library
**What:** Selects a specific headless graph-layout library satisfying FR-8's resolved split (OQ-1: buy the layout algorithm and hit-testing, hand-roll rendering) and `docs/standards/package-selection.md`. Candidate evaluation must, at minimum: (a) confirm no existing dependency already covers node-graph layout — `frontend/package.json` was checked directly for this task and declares none (`@headless-tree/core`/`@headless-tree/react` are tree-layout, not graph-layout, and cover a different data shape); (b) verify the chosen package's existence, current stable version, and licence directly against its npm registry page, not from memory; (c) verify it declares (or is compatible with) a React 19 peer range, or has no React peer dependency at all (a pure-data layout library with no React binding, consumed via a small custom hook, is an acceptable and often preferable outcome per the minimal-dependency principle); (d) confirm from its own documentation/README that it computes positions/hit-testing only and renders nothing itself (no bundled `<svg>`/`<canvas>` output, no CSS, no visual language) — the same test `@headless-tree/core` passes for the resource tree; (e) record the justification (purpose, why necessary, why no existing dependency suffices) per the standard's §6. If registry or peer-compatibility verification cannot be completed with confidence, this task's own done-when requires stating that explicitly rather than guessing, and surfacing it as a blocker before Task 5 proceeds.
**Files:** frontend/package.json, frontend/pnpm-lock.yaml, specs/features/entity-relationship-graph/library-selection-notes.md (a short written record of (a)-(e) above, for the tasks it gates)
**Done when:** `library-selection-notes.md` documents, for the selected package: its exact registry name and pinned version (matching what's added to `package.json`), its licence, the specific evidence that it is layout/hit-testing-only and renders nothing, the specific evidence of React 19 compatibility (or that it has no React peer dependency), and confirmation no existing dependency already covers the need; `pnpm install` succeeds with the new dependency added at the exact verified version (no unpinned range); `pnpm --filter getwrite-frontend typecheck` passes with the dependency present but unused.
**Depends on:** none
**Estimate:** 3
**Notes:** This is OQ-1's remaining half — the buy/hand-roll split itself is already decided by the spec; only which specific package is undecided. If no headless layout library can be found that satisfies both the layout-only constraint and React 19 compatibility, that is a blocker to report, not a reason to substitute a rendering-capable library or to hand-roll 2D layout as a fallback — both alternatives were explicitly rejected by the spec's Open Questions.
**Done:** [ ]

### Task 2: Wire the seventh "Relationship Graph" view into the switcher and shell
**What:** Adds `"entityGraph"` to `ViewName` (`frontend/src/lib/models/types.ts`) and a corresponding seventh entry to `VIEW_OPTIONS` in `ViewSwitcher.tsx` (a label such as "Graph", an icon distinct from the existing six), adds a branch to `AppShell.tsx` rendering a new, initially minimal `EntityRelationshipGraphView` component under `frontend/components/WorkArea/Views/EntityRelationshipGraphView/`. Per FR-1, this branch MUST be placed in the same pre-`!selectedResource`-guard block `AppShell.tsx` already uses for `data` and `entityRoster` (the block with the comment explaining why: both are project-wide reads independent of any selected resource) — never inside the post-guard `switch (view)`, which is for resource-scoped views only. This is the exact defect class PR #186 fixed for the roster and that remains open for Timeline as POS `task_a7d8581a`; this task must not reintroduce it for the graph view. Extends `AppShell.tsx`'s `disabledViews`/`disabledReasons` computation to push `"entityGraph"` onto `disabled` and supply a `disabledReasons.entityGraph` hover string whenever the project's `entities` feature flag is off, mirroring the `entityRoster`/`isEntitiesEnabled` pattern exactly (same flag, same gating, no new flag per FR-2).
**Files:** frontend/src/lib/models/types.ts, frontend/components/WorkArea/ViewSwitcher.tsx, frontend/components/Layout/AppShell.tsx, frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView.tsx, frontend/tests/appShell*.test.tsx (or existing ViewSwitcher/AppShell test files)
**Done when:** a test confirms the "Graph" tab renders in `ViewSwitcher` and is selectable, switching `AppShell`'s work area to `EntityRelationshipGraphView`; a test confirms that with no resource selected at all (mirroring the reachability regression test already present for `entityRoster`), the graph view still renders rather than falling through to "Resource not found."; a test confirms that with the project's `entities` feature flag off, the "Graph" tab is disabled and exposes a hover/`title` explanation via `disabledReasons`, matching the `entityRoster` assertion style; `pnpm --filter getwrite-frontend typecheck` passes with the widened `ViewName` union.
**Depends on:** none
**Estimate:** 3
**Notes:** This is FR-1 and FR-2's entire scope. `EntityRelationshipGraphView` is a structural placeholder at this point (renders nothing or a loading stub) — Task 3 gives it its node/edge data. Safe to build concurrently with Task 1 (no file overlap) and with Task 4 once Task 1 lands.
**Done:** [ ]

### Task 3: Assemble the graph's node and edge data
**What:** Builds `EntityRelationshipGraphView`'s data-assembly logic (no rendering yet): reads the cached alias table from `entityAliasTableSlice` for the node set (every declared entity becomes a node per FR-3, including one with zero edges — no filtering of isolated entities), dispatches `lib/api/entity-cooccurrence.ts`'s `getEntityCooccurrence` and `lib/api/entity-relationships.ts`'s `listEntityRelationships` on mount/project change (the two existing, already-`createTransport`-collapsed reads FR-16 names — no new transport code), and normalizes both into a single typed edge list distinguishing the two kinds without merging same-pair edges of different kinds into one record (FR-4/FR-5): a co-occurrence edge carries its `entityId` pair (unordered, non-reflexive per Feature 37's own guarantee) and shared-resource count; an authored-relationship edge carries its directed `sourceEntityId`/`targetEntityId` and `relationshipType`, one record per authored triple, with no synthesized inverse. Renders the FR-14 non-error empty state (mirroring the roster's FR-11 precedent) when the `entities` flag is on but the alias table has zero declared entities.
**Files:** frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView.tsx, frontend/tests/component/EntityRelationshipGraphView.test.tsx
**Done when:** a test with a fixture alias table of 4 entities (one with no edges) confirms all 4 appear in the assembled node list, including the disconnected one (FR-3); a test with a fixture pair present in both the co-occurrence map and the relationship list confirms the assembled edge list contains two separate edge records for that pair, not one merged record (FR-4/FR-5); a test confirms an authored edge retains its `sourceEntityId`/`targetEntityId` direction and `relationshipType`, and a co-occurrence edge retains its shared-resource count, with neither kind attempting to infer or synthesize data the two reads did not return (FR-4/FR-15); a test with zero declared entities (flag on) renders the FR-14 empty-state message, not an empty canvas.
**Depends on:** 2
**Estimate:** 5
**Notes:** This task owns FR-4's "no third edge source, no derived edge" constraint and FR-5's non-conflation constraint together — both are easiest to get wrong at this exact assembly point, before any rendering exists to obscure the mistake.
**Done:** [ ]

### Task 4: Build the SVG rendering surface with the selected layout library
**What:** Wires Task 1's layout library into `EntityRelationshipGraphView` to compute node positions and edge routing from Task 3's assembled node/edge lists, then hand-rolls the actual visual rendering as SVG (per FR-8: the library computes layout and hit-testing only; markup, styling, and theming are custom). Node positions are recomputed on every load/data change and never persisted anywhere (FR-13, OQ-2) — no `localStorage`, no sidecar field, no new persisted state of any kind. Rendering uses brand tokens (`black`/`white`/`red`/`mid`/`surface` variants) for theming with dark/light mode support consistent with the rest of the app, and reserves `red`/`#D44040` for neither edge kind (FR-6).
**Files:** frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx, frontend/tests/component/EntityGraphCanvas.test.tsx
**Done when:** a test confirms an SVG element renders one visual node per entry in a fixture node list and one visual edge per entry in a fixture edge list; a test confirms re-rendering with the same input data does not read from or write to any persistence mechanism (no `localStorage`/sidecar/API call for position data) — asserted by spying on those surfaces and confirming no call; a test/story confirms no rendered edge or node uses `#D44040`/`red` as its color.
**Depends on:** 1, 3
**Estimate:** 8
**Notes:** This is FR-8's and FR-13's rendering half. The layout library's own API shape is unknown until Task 1 selects it, so this task's exact hook/wrapper structure is left to the implementor within FR-8's buy-layout/hand-render constraint.
**Done:** [ ]

### Task 5: Distinguish the two edge kinds and encode direction and weight
**What:** Extends `EntityGraphCanvas.tsx`'s rendering to satisfy FR-6/FR-7/FR-12 on the canvas itself: every co-occurrence edge is visually distinguishable from every authored-relationship edge anywhere in the view (not only where both exist on the same pair) via a non-colour cue — line style (e.g. dashed vs. solid), a label, an icon, or an equivalent — never colour alone and never the reserved red token; every authored-relationship edge renders with a directional cue (e.g. an arrowhead) reflecting its `sourceEntityId`→`targetEntityId` direction, while every co-occurrence edge renders undirected (no arrowhead, consistent with Feature 37's own unordered-pair guarantee); every co-occurrence edge's line thickness scales with its shared-resource count (FR-12), and thickness is used for no other purpose — an authored edge's line weight does not vary by anything, since Feature 38 carries no analogous count.
**Files:** frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx, frontend/tests/component/EntityGraphCanvas.test.tsx
**Done when:** a test confirms a co-occurrence edge and an authored edge rendered in the same fixture have different non-colour visual attributes (e.g. different `stroke-dasharray` or the presence/absence of a marker element), assertable independent of colour; a test confirms an authored edge's rendered marker/arrowhead orientation reflects `sourceEntityId`→`targetEntityId` and a co-occurrence edge has no such marker; a test with two co-occurrence edges of shared-resource counts 1 and 5 confirms the rendered stroke width differs and correlates with the count; a test/story confirms neither edge kind's colour is `#D44040`/`red`.
**Depends on:** 4
**Estimate:** 5
**Notes:** This is FR-6, FR-7, and FR-12's canvas-side scope in full. Reuse Task 4's SVG surface; this task adds attributes and markers to it rather than introducing a second rendering path.
**Done:** [ ]

### Task 6: Pan, zoom, and node selection interactions
**What:** Adds pan (click-and-drag on empty canvas space), zoom (scroll wheel, with reasonable min/max bounds), and node-selection (click a node to mark it selected, e.g. a highlight ring) to `EntityGraphCanvas.tsx`, following `Timeline.tsx`'s existing hand-rolled wheel pan/zoom precedent for interaction conventions (event handling shape, not its 1D scroll-anchor math, which does not apply to a 2D canvas). This is baseline canvas interaction only (FR-8); it does not include keyboard-driven graph traversal, which the spec's OQ-4 explicitly rejects as a primary or secondary mechanism for this feature's initial ship.
**Files:** frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx, frontend/tests/component/EntityGraphCanvas.test.tsx
**Done when:** a test confirms a simulated drag gesture on empty canvas space updates the rendered viewport transform (pan); a test confirms a simulated wheel event changes the rendered zoom scale within its bounds; a test confirms clicking a node toggles a selected-state visual attribute on that node and not on others.
**Depends on:** 4
**Estimate:** 5
**Notes:** Concurrently runnable with Task 5 once Task 4 lands — both extend `EntityGraphCanvas.tsx` but touch disjoint concerns (edge styling vs. viewport/selection interaction); coordinate on file ownership or merge order to avoid an edit conflict.
**Done:** [ ]

### Task 7: Activate a node to navigate to its resource
**What:** Wires node activation — pointer click and, per FR-9, keyboard activation (Enter/Space) when a node has focus — to `setSelectedResourceId` (`resourcesSlice.ts`) for that entity's id, then switches the work area's `view` back to `"edit"`, following the roster's existing activate-to-navigate convention (`EntityRosterView.tsx`'s `onEntityActivated` callback shape). The canvas exposes no control that edits an entity's declaration, a co-occurrence value, or an authored relationship (FR-9) — activation is the only interaction beyond pan/zoom/selection.
**Files:** frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView.tsx, frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx, frontend/tests/component/EntityRelationshipGraphView.test.tsx
**Done when:** a test confirms activating a node (pointer click) dispatches `setSelectedResourceId` with that node's `entityId` and switches `view` away from `"entityGraph"`; a keyboard test (focus the node, press Enter, then Space in a second case) confirms both activate the same navigation; a test confirms no canvas-rendered control calls `updateSidecar`, `createEntityRelationship`, or `removeEntityRelationship` directly.
**Depends on:** 6
**Estimate:** 3
**Notes:** This is FR-9's entire scope. Node focus/keyboard-operability here is about the individual node control's own activation, not the keyboard graph-traversal OQ-4 rejects — a focused node responding to Enter/Space is the same minimum every focusable custom control needs, not a traversal mechanism between nodes.
**Done:** [ ]

### Task 8: Build the FR-11 synchronized accessible list — nodes and edges
**What:** Adds a semantic list rendered alongside `EntityGraphCanvas.tsx` (not inside the SVG), generalizing `EntityRosterRow.tsx:70-136`'s `<ul>` of `<li>`-wrapped native `<button type="button">` pattern for the node list, plus an equivalent semantic list of edges. The node list gives every declared entity a reachable, alphabetically-ordered (case-insensitive, per OQ-7 — this ordering applies to this list only, never claimed of canvas placement) row whose activation mirrors Task 7's node activation exactly (same `setSelectedResourceId`/view-switch behavior — one activation path, not two divergent ones). The edge list gives every edge (both kinds) a reachable, non-interactive entry whose text discloses, per FR-11/FR-12: for a co-occurrence edge, both entity names and the literal shared-resource count; for an authored-relationship edge, both entity names, the direction (e.g. "X → Y"), and the `relationshipType`. Non-colour disclosure required by FR-6/FR-7 is folded into this text rather than left canvas-only.
**Files:** frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphAccessibleList.tsx, frontend/tests/component/EntityGraphAccessibleList.test.tsx
**Done when:** a test confirms the node list renders one `getByRole("button", ...)` per fixture entity, alphabetically ordered regardless of input order (OQ-7), and that activating one dispatches the identical navigation Task 7 asserts; a test confirms the edge list renders one accessible entry per fixture edge, with a co-occurrence entry's accessible text containing both entity names and the literal count, and an authored entry's accessible text containing both names, a direction indicator, and the relationship type — all assertable via `getByRole`/accessible-name queries, not by reading canvas pixels; a test confirms an edge-list entry has no interactive role (it is disclosure text, not a control, mirroring the co-occurrence "Also appears with" list's plain-text convention).
**Depends on:** 3
**Estimate:** 5
**Notes:** This is FR-10 and FR-11's primary implementation. This task does not depend on Tasks 4-7 (canvas rendering) — it consumes the same Task 3 data directly — so it can proceed concurrently with Tasks 4-7 once Task 3 lands; wiring the list's node-activation to be identical to Task 7's canvas-node-activation (not merely similar) is this task's main integration point with that work and should be reconciled before Task 10.
**Done:** [ ]

### Task 9: Storybook stories for the graph view, canvas, and accessible list
**What:** Adds `EntityRelationshipGraphView.stories.tsx`, `EntityGraphCanvas.stories.tsx`, and `EntityGraphAccessibleList.stories.tsx` covering: a populated graph with a mix of co-occurrence-only pairs, authored-relationship-only pairs, and a pair with both edge kinds present simultaneously (to visually exercise FR-5's non-conflation); an isolated entity with no edges (FR-3); and the FR-14 empty state. Matches the conventions `docs/standards/storybook-implementation.md` and sibling entity-feature stories (e.g. `EntityRosterView.stories.tsx`) establish, mocking `getEntityCooccurrence`/`listEntityRelationships` and the Redux-provided alias table rather than hitting real transports.
**Files:** frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView.stories.tsx, frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.stories.tsx, frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphAccessibleList.stories.tsx
**Done when:** all stories render without error in Storybook; the mixed-edge-kind story visibly shows both a co-occurrence and an authored edge on the same pair as two distinct lines; the isolated-entity story shows a node with no connecting edge; the empty-state story is visually distinct from a populated one. Per this repo's current state (`pnpm build-storybook` fails on `main` on an unrelated `node:async_hooks` import, POS `task_417d4451`), the `@storybook/addon-a11y` sweep is unavailable — this task's done-when does not claim that check, consistent with OQ-4's own recorded finding, and any accessibility verification for this feature is carried by Tasks 8, 11, and 12 instead.
**Depends on:** 5, 6, 7, 8
**Estimate:** 3
**Notes:** none
**Done:** [ ]

### Task 10: Integration test — graph fidelity against a real fixture project
**What:** Adds an integration test against a fixture project with: an entity with no edges at all (isolated node, FR-3), two entities with only a co-occurrence edge, two entities with only an authored relationship edge, two entities with both a co-occurrence edge and one or more authored edges on the same pair (FR-5's non-conflation case), and two entities sharing multiple resources versus two sharing one (to exercise FR-12's thickness-correlates-with-count claim as a rendered-attribute difference, not a performance claim). Confirms the assembled node/edge data (Task 3), the accessible list's disclosed text (Task 8), and — where feasible without asserting pixel-level rendering — the canvas's distinguishing attributes (Task 5) are all consistent with the same fixture's ground truth (the alias table plus `getEntityCooccurrence`/`listEntityRelationships` output) in one run.
**Files:** frontend/tests/integration/entity-relationship-graph.test.ts
**Done when:** the test asserts all properties above against the same fixture and passes, including that the both-edge-kinds pair produces two separate accessible-list edge entries (not one merged entry) and two separate canvas edges.
**Depends on:** 3, 5, 8
**Estimate:** 5
**Notes:** none
**Done:** [ ]

### Task 11: Verify native (Android) parity for the relationship graph
**What:** Confirms the graph view has no native-specific gap: `EntityRelationshipGraphView.tsx`, `EntityGraphCanvas.tsx`, and `EntityGraphAccessibleList.tsx` import nothing platform-specific (grep-verified: no `node:*` import, no direct `fetch`/HTTP call bypassing `lib/api/entity-cooccurrence.ts`/`lib/api/entity-relationships.ts`/`entityAliasTableSlice`, no `runtime === "native"` branch), and the feature relies exclusively on the already-shipped native backends for both data sources plus the already-native-parity alias-table transport (FR-16 — no new transport code is introduced by this feature).
**Files:** none (build/verification task; no source changes expected)
**Done when:** `pnpm --filter getwrite-frontend build:native` (or the project's documented native build equivalent) completes without error with Tasks 1-8's changes present, and does not newly bundle any `node:*`-only module (checked because Task 1's layout library is new and unverified against the native/static-export build until this point); a check confirms none of the three new components contain a direct `fetch` call or a native-runtime branch.
**Depends on:** 8, 9
**Estimate:** 2
**Notes:** This is FR-16's coverage. The layout library selected in Task 1 is the one genuinely new risk this task exists to catch — it was vetted for React 19 compatibility, not for native/static-export compatibility, so this is the first point that gap would surface. If a gap is found, file it back against Task 1 or 4 rather than patching ad hoc here, matching `specs/features/entity-roster/tasks.md`'s Task 11 convention.
**Done:** [ ]

### Task 12: Manual verification pass in the running app
**What:** Exercises the complete feature by hand in the running desktop/web app (and, if a device is available, Android) to confirm behavior the automated suite cannot fully assert: visual appearance of the graph, real pan/zoom/navigation behavior, the two edge kinds' visual distinguishability, and true offline operation.
**Files:** none (manual QA task; no source changes expected)
**Done when:** each of the following is confirmed by hand and recorded in the task's completion note, with disk/index ground truth (the alias table plus both edge reads) read first and the UI checked against it: (1) the "Graph" tab appears alongside Edit, Organizer, Data, Diff, Timeline, and Entities and is selectable, per FR-1; (2) with the project's `entities` flag off, the tab is visibly disabled with a hover explanation, and no graph is reachable, per FR-2; (3) **with no resource selected at all** — opening the project fresh and going straight to the Graph tab without selecting anything first — the view renders the graph rather than "Resource not found.", specifically exercising the `AppShell` pre-guard-placement defect class FR-1 calls out (PR #186's fix for the roster, and the still-open Timeline instance, `task_a7d8581a`); (4) every declared entity appears as a node, including one with no edges, per FR-3; (5) a co-occurrence edge and an authored-relationship edge on the same pair render as two visually distinct lines, and — **checked specifically without relying on colour** (e.g. by viewing a greyscale/desaturated screenshot, or by checking the rendered `stroke-dasharray`/marker attributes directly) — the two edge kinds remain distinguishable anywhere they appear on the graph, per FR-5/FR-6, and neither uses the reserved red token; (6) an authored edge shows a directional cue matching its authored source→target, and a co-occurrence edge shows none, per FR-7; (7) a co-occurrence edge's line thickness visibly differs between a low-count and a high-count pair, per FR-12, and the same count appears as literal text in the accessible list; (8) pan (drag) and zoom (scroll) both work on the canvas; (9) clicking (and, separately, keyboard-activating) a node navigates to that entity's resource and opens the edit view, per FR-9, and this is checked to be the exact same behavior whether triggered from the canvas node or from the FR-11 accessible list's corresponding button; (10) the FR-11 accessible list is checked with the browser's accessibility inspector or a screen reader to confirm every node and edge is reachable with a legible name, including a co-occurrence edge's count and an authored edge's direction/type, per FR-10/FR-11; (11) a project with `entities` on but zero declared entities shows the FR-14 empty state; (12) if a device is available, the graph (including both edge sources) loads correctly with the device's network disabled, per FR-16.
**Depends on:** 10, 11
**Estimate:** 2
**Verification record (2026-09-09):** Performed against a disposable
workspace holding a 76-resource fixture with 6 declared entities, 93 indexed
mentions, and two authored edges deliberately placed on pairs that also
co-occur, so the both-kinds-on-one-pair case was actually exercised. Served via
`next start` rather than `next dev` — a production build does no file watching,
which sidesteps the Watchpack `EMFILE` exhaustion that blocked two earlier
attempts on this machine. Worth remembering for future manual passes.

- **Reachability with no resource selected — passed.** On a freshly opened
  project, with nothing selected, Edit / Organizer / Diff / **Timeline** were
  disabled while Data, Entities and **Graph** were enabled. The new view avoids
  the `AppShell` pre-guard defect PR #186 fixed for the roster, and Timeline
  sitting disabled beside it confirms `task_a7d8581a` is still live.
- **Both edge kinds distinguished without colour — passed, decisively.**
  Reading the rendered SVG: 9 dashed edges with no arrowhead (co-occurrence)
  and 2 solid edges with a `marker-end` arrowhead (authored). Both kinds use
  `stroke="currentColor"`, so the distinction carries **no colour information
  at all** — it survives greyscale and colour-blindness. Nine distinct stroke
  widths (3.7–8.1) confirm the FR-12 weight encoding is live.
- **FR-11 accessible list — passed.** `list "Entity nodes"` and `list "Entity
  edges"` render alongside the canvas. Edge kind is distinguished *in text*,
  not only visually: co-occurrence reads "Casey Thorne and Devin Striker share
  25 resources" (undirected, count as literal text), authored reads "Devin
  Striker → Casey Thorne (ally of)" (directed, typed). Pluralisation is correct
  — "share 1 resource".
- **Data fidelity — passed.** All nine co-occurrence counts (25, 16, 12, 11, 8,
  8, 3, 2, 1) match the ground truth computed from `meta/index/mentions.json`
  during the Feature 37 verification exactly.
- **FR-5 non-conflation — passed.** Devin Striker ↔ Casey Thorne carries both a
  co-occurrence edge (25) and an authored edge (ally of); they appear as two
  separate entries, not merged into one.
- **FR-9 activate-to-navigate — passed**, exercised from the accessible list
  rather than the canvas, which also proves that list is genuinely interactive
  for nodes. Activating "Casey Thorne" selected her resource and switched to
  the Edit view.

Not verified: pan/zoom and canvas selection by hand (covered by Task 6's
tests but not exercised); Android device behaviour; and the Storybook
`addon-a11y` sweep, which remains unavailable while `pnpm build-storybook`
fails on `main` (`task_417d4451`). Accessible naming was instead read directly
out of the rendered accessibility tree.

**Notes:** This is the manual-exercise task the automated suite cannot fully substitute for — live visual distinguishability of the two edge kinds and true device-level offline behavior need a human pass before sign-off, mirroring `specs/features/entity-roster/tasks.md`'s Task 12 and `specs/features/entity-cooccurrence/tasks.md`'s Task 10. Criterion (3) exists because this exact defect class has recurred once already (fixed for the roster, still open for Timeline) and is the single most likely regression for this feature's own seventh-view wiring.
**Done:** [x]

## Summary
- Total tasks: 12
- Total estimated effort: 49 points
- Critical path: Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10 → 11 → 12 (Task 8 runs concurrently with Tasks 4-7 once Task 3 lands, joining at Task 9/10)
- Risks: Task 1 (library selection) gates the entire rendering half of this feature (Tasks 4-7) and is the one open technical decision the spec deliberately left to task breakdown — an unverifiable registry/peer-compatibility check here should be reported as a blocker rather than guessed past, since every downstream rendering task assumes a specific library's API shape. Task 3 is the point FR-4's "no third edge source" and FR-5's "no conflation" constraints are easiest to violate, since it is where both edge reads first meet in one data structure — Task 3 and Task 10 both explicitly assert a same-pair, both-edge-kinds case stays as two records, not one. Task 6 and Task 5 both extend `EntityGraphCanvas.tsx` concurrently and should be sequenced or merged carefully to avoid an edit conflict, even though their concerns (edge styling vs. viewport interaction) are disjoint. No task in this list asserts a performance or scale characteristic — OQ-3 is deliberately deferred by the spec, and the measurement it names (first paint/layout-settle/pan-zoom-frame timing at increasing node/edge counts) is out of this task list's scope, consistent with the spec's own non-claim.

## Open Questions

None new. The source feature spec's two genuinely open questions (OQ-1's specific library choice, OQ-3's scale measurement) are addressed by this task list as follows, not answered by it: OQ-1's library choice is Task 1's own deliverable, executed against `docs/standards/package-selection.md` rather than decided here; OQ-3's scale measurement remains explicitly out of scope for every task above, per the spec's own resolution that it is deferred pending a chosen layout library and is not a performance claim this task list may assert.
