# Tasks: Entity graph edge tooltips

Source spec: `specs/features/entity-graph-edge-tooltips.md`. Granularity: story points (1/2/3/5/8).

### Task 1: Extract shared edge-description module
**What:** Moves `describeCooccurrenceEdge`, `describeAuthoredEdge`, and `resolveEntityName`/`UNKNOWN_ENTITY_LABEL` out of `EntityGraphAccessibleList.tsx` into a new shared module, then updates `EntityGraphAccessibleList.tsx` to import from it rather than defining its own copies (FR-2). No behavior change to the accessible list's rendered text — this is a pure extraction.
**Files:** frontend/components/WorkArea/Views/EntityRelationshipGraphView/edgeDescriptions.ts (new), frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphAccessibleList.tsx, frontend/tests/component/EntityGraphAccessibleList.test.tsx
**Done when:** `edgeDescriptions.ts` exports `describeCooccurrenceEdge` and `describeAuthoredEdge` (plus the name-resolution helper they share) with no import from any React/canvas/list-specific module; `EntityGraphAccessibleList.tsx` contains no local definition of either function; the existing `EntityGraphAccessibleList.test.tsx` assertions on rendered edge-entry text pass unmodified (run before and after the extraction to confirm byte-identical output — this is FR-2's whole point, that the two surfaces cannot drift); `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none
**Estimate:** 2
**Notes:** This is the one task in this list that does not depend on either spike's outcome — sequence it first so both spikes and the canvas work can build on the same shared source of truth for tooltip text.
**Done:** [x]

### Task 2: Spike — tooltip positioning and touch dismiss against a hit-target line
**What:** A time-boxed spike (not production code) that prototypes `react-tooltip`'s `float` mode anchored to a temporary wide `<line>` hit-target on `EntityGraphCanvas.tsx`, and its `openOnClick` option for tap-to-show/tap-to-dismiss, then records a pass/fail decision with evidence (OQ-1, OQ-3). This is the ONE spike covering both FR-4's positioning question and FR-5's touch question, per the spec's explicit instruction that they are the same wiring.
**Files:** specs/features/entity-graph-edge-tooltips/spike-a-tooltip-mechanism.md (new — the decision record), a throwaway prototype in `EntityGraphCanvas.tsx` or a scratch branch (not required to survive past this task)
**Done when:** `spike-a-tooltip-mechanism.md` records, for `float` mode: whether hovering near both endpoints and the midpoint of a long diagonal edge places the tooltip legibly near the cursor without covering the node being inspected — checked against at least one edge that spans a large fraction of the canvas diagonal; for `openOnClick`: whether a tap on the hit-target shows the tooltip and a second tap on the same target, or a tap elsewhere, dismisses it — checked on an actual touch-capable device or browser touch emulation, not mouse-click substitution alone; a single explicit verdict, PASS or FAIL, for the combined mechanism (a mixed result — one working, one not — counts as FAIL, since FR-4 and FR-5 both need to hold for this branch to be viable); if FAIL, the specific observed failure (e.g. "tooltip renders off-canvas past the right edge," "second tap does not dismiss on the touch emulator") is recorded, not just "did not work."
**Depends on:** none
**Estimate:** 3
**Notes:** This is OQ-1 and OQ-3's spike. Task 5 below implements whichever of the two mutually exclusive branches this task's verdict selects, per the spec's requirement that the fallback be a real branch rather than an afterthought. Safe to run concurrently with Task 1 and Task 3 (no file overlap, no data dependency).
**Done:** [x]

### Task 3: Spike — measure hit-target stroke width
**What:** A measurement task (not production code) that runs `computeGraphLayout` at three fixture densities — sparse (~5 nodes/5 edges), medium (~15 nodes/20 edges), and an adversarial case with several nodes sharing multiple co-occurrence and authored edges on the same pairs — computes the minimum distance between any two distinct edges' line segments at each settled layout, and derives a single fixed hit-target width comfortably under half the smallest measured gap across all three (OQ-2).
**Files:** specs/features/entity-graph-edge-tooltips/spike-b-hit-target-width.md (new — the decision record with the three fixtures' measured minimum gaps and the derived width), a throwaway measurement script (e.g. a one-off test or scratch script calling `computeGraphLayout` directly; not required to survive past this task)
**Done when:** `spike-b-hit-target-width.md` records the three fixtures' node/edge counts, each fixture's measured minimum inter-edge segment distance, and a single fixed width number that is comfortably under half the smallest of the three — the arithmetic shown, not just the final number; the chosen width is a concrete pixel value ready for Task 4 to consume (this task list intentionally does not itself state that number, since the measurement had not been run when the spec and this list were written).
**Depends on:** none
**Estimate:** 2
**Notes:** This is OQ-2's spike. Safe to run concurrently with Task 1 and Task 2. Task 4 is blocked on this task's output number, not on its method — once the number lands, Task 4 can proceed regardless of how Task 2 resolves.
**Done:** [x]

### Task 4: Add the transparent wide hit-target line per edge
**What:** Adds a second, transparent `<line>` per edge in `EntityGraphCanvas.tsx` — same endpoints as the existing visible edge line, `stroke="transparent"`, `strokeWidth` set to Task 3's measured fixed width — rendered for every edge regardless of kind, satisfying FR-3 independently of which tooltip mechanism Task 2's spike ultimately selects.
**Files:** frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx, frontend/tests/component/EntityGraphCanvas.test.tsx
**Done when:** a test confirms one hit-target `<line>` renders per fixture edge (both kinds), each sharing its visible sibling line's `x1`/`y1`/`x2`/`y2`, at Task 3's measured width; a test confirms the hit-target line carries no visible stroke color (transparent) so it introduces no rendering change to what a sighted user sees; a test confirms the hit-target line's `data-edge-kind` attribute matches its visible sibling's, for later test/tooltip-content lookup.
**Depends on:** 3
**Estimate:** 3
**Notes:** This task's hit-target lines exist before any tooltip is wired to them — Task 5 attaches the tooltip anchor attributes next. Deliberately does not depend on Task 2, since FR-3 says the hit-target is needed "regardless of which tooltip rendering mechanism is ultimately chosen."
**Done:** [x]

### Task 5: Wire hover and tap tooltip using Task 2's selected mechanism
**What:** Wires each edge's hit-target line (Task 4) to a tooltip using whichever mechanism Task 2's spike verdict selects — implement exactly one of the two paths below, chosen by that verdict, not both:
- **If Task 2's verdict is PASS:** extend `hoverTipProps`/`HoverTipSurface` (`HoverTip.tsx`) to accept and pass through `float` and `openOnClick`, then wire each edge's hit-target line to `hoverTipProps` and render one `HoverTipSurface` for the canvas with `float`/`openOnClick` enabled.
- **If Task 2's verdict is FAIL:** build a bespoke tooltip overlay following the `RefHoverPreview.tsx` pattern (local hover/tap state in `EntityGraphCanvas.tsx`, a manually positioned popover tracking pointer position, shown on `onMouseEnter`/touch-tap over a hit-target line and dismissed on `onMouseLeave`/a second tap or an outside tap) instead of extending `HoverTip.tsx`.

Both paths build a `nameById: Map<string, string>` from `positionedNodes` (each entry's `entityId` and `name`) — the canvas does not otherwise hold this map — and pass it as the first argument to Task 1's shared description functions: an authored edge's `describeAuthoredEdge(nameById, sourceEntityId, targetEntityId, relationshipType)`, a co-occurrence edge's `describeCooccurrenceEdge(nameById, entityIdA, entityIdB, sharedResourceCount)`. All other content (`relationshipType`, `sharedResourceCount`, the entity ids) is read from the same `positioned.edge` object the canvas already holds — no new fetch per FR-6.
**Files:** frontend/components/common/UI/HoverTip.tsx (PASS path only), frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx, frontend/components/WorkArea/Views/EntityRelationshipGraphView/entityGraphTooltipOverlay.css (FAIL path only, or equivalent, mirroring `value-picker.css`'s scope), frontend/tests/component/EntityGraphCanvas.test.tsx
**Done when:** a test confirms the canvas constructs a `nameById` map from `positionedNodes` and that both shared description functions receive it as their first argument; **PASS path:** a test confirms `hoverTipProps` passes through a `float`/`openOnClick` option when supplied, without breaking the existing call sites (`ViewSwitcher.tsx`, `TimelineViewToggle.tsx`, `ProjectFeatureToggles.tsx`) that don't pass them, and a test confirms each rendered hit-target `<line>` carries `data-tooltip-content` matching Task 1's shared description function's output for that edge's fixture data; **FAIL path:** a test confirms hovering a hit-target line shows a popover containing Task 1's shared description text for that edge's fixture data, a test confirms a simulated tap on a hit-target shows the popover and a second tap on the same target, or a simulated tap elsewhere, dismisses it, and a test confirms the popover never renders for a node (FR-8 stays true under the fallback too); **both paths:** the asserted tooltip text is the same string the accessible list renders for the identical fixture edge, asserted by calling the shared module directly rather than duplicating the expected string, and a test confirms no new fetch/transport call is introduced (spy assertion, per FR-6).
**Depends on:** 1, 2, 4
**Estimate:** 5
**Notes:** The mechanism is selected by Task 2's spike verdict, not chosen here — implement the PASS branch or the FAIL branch, never both, and never guess which if Task 2 has not reached a verdict. An inconclusive or not-yet-run spike is a blocker to report up, not something to pick past arbitrarily.
**Done:** [x]

### Task 6: Storybook stories for the edge tooltip
**What:** Extends `EntityGraphCanvas.stories.tsx` with a story exercising the tooltip on both edge kinds — a co-occurrence edge's hover state showing its shared-resource count text, an authored edge's hover state showing its direction-and-type text — using whichever mechanism Task 5 actually shipped. Matches `docs/standards/storybook-implementation.md`'s conventions and this component's existing story structure rather than introducing a new file.
**Files:** frontend/stories/WorkArea/EntityGraphCanvas.stories.tsx
**Done when:** the new story renders without error in Storybook; the story's play function or static args put at least one edge of each kind in a hovered/tooltip-shown state, and the rendered tooltip text is visible in the story and matches Task 1's shared description output for that story's fixture data.
**Depends on:** 5
**Estimate:** 2
**Notes:** Written against whichever branch Task 5 shipped; do not attempt to cover both mechanisms in one story.
**Done:** [ ]

### Task 7: Verify no new fetch, transport, or feature flag
**What:** A verification task (no source changes expected) confirming FR-6 and FR-7 hold after Tasks 4-5 land: grep-verifies that no new `fetch`/transport call, core-lift, or persisted-data write was introduced by this feature's files, and that no new feature-flag check beyond the existing `entities` flag was added anywhere in the touched components.
**Files:** none (verification task)
**Done when:** a grep across `EntityGraphCanvas.tsx`, `edgeDescriptions.ts`, and (whichever of) `HoverTip.tsx`/the fallback overlay file confirms no new `fetch(`, no new dispatch of an async thunk, no new call into `lib/api/*`, and no reference to any feature-flag name other than `entities`; the existing `EntityGraphCanvas.test.tsx` fetch/transport-spy assertions from Task 5 are confirmed still passing as the concrete evidence backing this check, rather than re-deriving it from scratch.
**Depends on:** 5
**Estimate:** 1
**Notes:** Lightweight by design — Task 5 already asserts "no new fetch" in its own tests; this task is the explicit cross-check tying that assertion back to FR-6/FR-7 by name before sign-off.
**Done:** [ ]

### Task 8: Manual verification pass, including a touch check
**What:** Exercises the shipped tooltip by hand in the running desktop/web app and, if a device is available, on native Android (the graph view is reachable there per Feature 39 and `frontend/scripts/build-native-static.mjs:71-74`), confirming hover and tap behavior the automated suite cannot fully assert visually.
**Files:** none (manual QA task; no source changes expected)
**Done when:** each of the following is confirmed by hand and recorded in the task's completion note: (1) hovering near the midpoint of a long diagonal edge — not only its exact rendered pixel — shows the tooltip, per FR-3's wider hit-target; (2) the tooltip's text for a co-occurrence edge matches what the accessible list shows for the identical edge, and likewise for an authored edge, confirmed by comparing both surfaces side by side for the same fixture data (FR-2); (3) on a touch-capable device or browser touch emulation, tapping an edge's hit-target shows the tooltip, and a second tap or a tap elsewhere dismisses it (FR-5), while tapping a node still performs only its existing activate-to-navigate behavior, unchanged (no new tap behavior on a node); (4) a node never shows a hover tooltip (FR-8); (5) tabbing through the canvas with the keyboard does not land focus on any edge and shows no tooltip on edge focus (FR-9); (6) if a device is available, the tooltip is exercised on native Android specifically, since that is the platform FR-5's touch requirement calls out by name.
**Depends on:** 6, 7
**Estimate:** 2
**Notes:** Mirrors the parent feature's own Task 12 manual-verification convention (`specs/features/entity-relationship-graph/tasks.md`). Item (6) may be marked "not verified — no device available" if genuinely unavailable, matching that same task list's own precedent for an unavailable device check, but the touch-emulation check in item (3) is not optional, since FR-5 is this feature's own new requirement.
**Done:** [ ]

## Summary
- Total tasks: 8
- Total estimated effort: 20 points
- Critical path: Tasks 1, 2, and 3 all start immediately with no dependencies; 3 → 4; Task 5 needs 1, 2, and 4; 5 → 6 → 7 → 8
- Risks: Task 5's two implementation paths are mutually exclusive branches gated entirely on Task 2's spike verdict — if that spike is inconclusive or not run to completion, Task 5 cannot safely proceed, and that should be reported as a blocker rather than guessed past by building both paths or picking one arbitrarily. Task 3's measured width is a hard input to Task 4; if the three fixture densities produce inconsistent gap measurements (e.g. the adversarial case's minimum gap is much smaller than expected), the derived width may need to be small enough to feel imprecise for hover — that risk is inherent to the measurement, not a defect in this task list. Task 8's Android check is the one item most likely to go unverified if no device is available at execution time.

## Open Questions

None new. The source feature spec's two spikes (OQ-1/OQ-3's combined tooltip-mechanism spike, and OQ-2's hit-target-width measurement) are this task list's Task 2 and Task 3 respectively — their outcomes are deliverables of those tasks, not questions left open by this list. Task 2's verdict determines which of Task 5's two implementation paths is actually built; Task 3's measured number is a direct input to Task 4. Neither outcome is asserted here, consistent with the spec's own instruction not to assert the spike results before they are run.
