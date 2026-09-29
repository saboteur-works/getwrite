# Task List: Organizer View — Card Filtering

Source spec: `specs/features/organizer-card-filtering.md` (finalized, zero open
questions). Granularity: story points (1/2/3/5/8).

Grounding notes (verified against source before writing tasks below):

- `OrganizerView.tsx` (`frontend/components/WorkArea/Views/OrganizerView/`)
  currently holds only one piece of local UI state, `isShowingBody`
  (`React.useState`), and computes `allChildren` as a flat, sorted array of
  child folders + child resources of `selectedFolder`. This feature's filter
  state and filtering logic slot into the same component, per the spec's
  "Implementation architecture" note.
- `OrganizerCard.tsx` already reads `resource.userMetadata?.status` (falling
  back to `defaultStatus`) and `(resource as TextResource).wordCount`
  directly off the `AnyResource` object — no separate fetch. Filter
  predicates read the same fields the card already reads, so status/word-count
  filtering needs no new data source.
- `resource-ref`/`multi-resource-ref` metadata field definitions live in the
  active project's `MetadataSchema` (`MetadataGroupSchema.fields`,
  `frontend/src/lib/models/schemas.ts`), reachable via the existing
  `selectActiveProjectMetadataSchema` selector (`frontend/src/store/
  projectsSlice.ts`). A field's value on a resource lives at
  `resource.userMetadata[field.key]`, typed as `ResourceRefValueSchema`
  (`{ id: string | null; name: string }`) for `resource-ref` or an array of
  that shape for `multi-resource-ref`.
- `frontend/components/QueryBuilder/` (`FilterChip.tsx`, `ValuePicker.tsx`,
  `OperatorMenu.tsx`) is the app's one existing numeric-filter and
  resource-ref-filter-control precedent (`NumberBetweenInput`,
  `SingleRefInput`/`MultiRefInput`), but it is wired to the query-AST value
  shapes and `EditContextMenu`/typeahead machinery this feature's spec
  (OQ-1/OQ-4) explicitly does not use. Tasks below build Organizer's own
  plain controls, styled consistently with `Button`/existing Organizer
  markup, rather than importing `QueryBuilder` components directly — but
  each control-building task should keep the visual/interaction pattern
  (chip-style clear buttons, range inputs) consistent with that precedent
  per the triage note.
- `frontend/tests/organizerView.test.tsx` and `frontend/stories/WorkArea/
  OrganizerView.stories.tsx` already exist and are the files to extend per
  this repo's "add to an existing test file before creating a new one"
  standard; no `organizerFilters.test.ts`/`OrganizerFilterBar` files exist
  yet, so those are new files by necessity.

---

### Task 1: Pure filter-state module (types, reducer, predicates)
**What:** A new pure module holding the filter-state shape, a reducer
(set/clear-one/clear-all/reset actions), and the three filter predicate
functions (status equality, word-count range, resource-ref field membership)
plus their AND-combination, with no React or Redux dependency.
**Files:**
- Create `frontend/components/WorkArea/Views/OrganizerView/organizerFilters.ts`
- Create `frontend/tests/organizerFilters.test.ts`
**Done when:**
- `organizerFilters.ts` exports: a `OrganizerFilterState` type (status value,
  word-count min/max, a `Record<fieldKey, selectedValue>` for resource-ref
  filters), an action-typed reducer (`organizerFilterReducer`) with actions
  covering set-status, set-word-count-range, set-ref-filter, clear-one (by
  filter key), clear-all, and reset-to-empty, and a `filterChildren(children,
  state, refFields)` function implementing FR-2, FR-4, FR-6, and FR-7 (AND
  combination) as `Array.filter` logic.
- `filterChildren` excludes a non-text resource when the word-count filter is
  active (FR-4), matches "no status" against resources with no resolved
  status (FR-1's stated "no status" option), and matches a
  `multi-resource-ref` field if the selected value is any one entry (FR-6).
- `organizerFilters.test.ts` covers: each reducer action in isolation, a
  reset action returning the initial empty state, and `filterChildren` cases
  for each predicate independently and combined (AND), including the
  non-text-excluded-under-word-count-filter case.
- `pnpm --filter getwrite-frontend test:ci -- organizerFilters` passes.
**Depends on:** none
**Estimate:** 3
**Done:** [ ]

---

### Task 2: Wire filter state into OrganizerView with folder-scoped reset
**What:** `OrganizerView.tsx` adopts the Task 1 reducer via `useReducer`,
applies `filterChildren` to `allChildren` before rendering, and resets filter
state whenever the selected folder changes.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
**Done when:**
- `OrganizerView` calls `React.useReducer(organizerFilterReducer, initialState)`
  and derives a `visibleChildren` array by running `filterChildren` over
  `allChildren` before the render map (FR-11: this is a pure client-side
  transform of data already in `resources`/`folders` state — no new fetch,
  no new selector requiring a network call).
- A `React.useEffect` keyed on `selectedFolder?.id` dispatches the reset
  action on every folder-id change (FR-10).
- No new props are added to `OrganizerViewProps` (per the spec's resolved
  OQ-4 — filter state stays local, not lifted).
- All pre-existing tests in `frontend/tests/organizerView.test.tsx` still
  pass unmodified (filtering with empty filter state is a no-op, so existing
  assertions about which cards render are unaffected).
- `pnpm --filter getwrite-frontend typecheck` and `test:ci -- organizerView`
  pass.
**Depends on:** Task 1
**Estimate:** 2
**Done:** [ ]

---

### Task 3: Filter bar component shell + Status filter control (FR-1, FR-2)
**What:** A new `OrganizerFilterBar` component, rendered inside
`OrganizerView` above the card grid, holding the Status filter control as its
first control.
**Files:**
- Create `frontend/components/WorkArea/Views/OrganizerView/OrganizerFilterBar.tsx`
- Modify `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
**Done when:**
- `OrganizerFilterBar` accepts the current filter state, the dispatch
  function (or equivalent typed callbacks), the active project's
  `config.statuses` list, and renders a labelled `<select>` (a real
  `<label>`/`aria-label`, not placeholder text only) populated from
  `config.statuses` plus a "No status" option, mirroring FR-1.
- Selecting a status value dispatches the set-status action; `OrganizerView`
  re-filters and hides any card whose resolved status (via the same
  `userMetadata.status || defaultStatus` resolution `OrganizerCard` already
  uses) doesn't match (FR-2).
- `OrganizerView` reads `config.statuses` via the existing
  `selectActiveProjectStatuses` selector already imported in the file — no
  new selector added.
- `pnpm --filter getwrite-frontend typecheck` passes; a new test in
  `frontend/tests/organizerView.test.tsx` (per Task 8, not required to pass
  yet at this task) is not required here, but manual verification confirms
  the control renders and changes the visible card set.
**Depends on:** Task 2
**Estimate:** 3
**Done:** [ ]

---

### Task 4: Word-count range filter control (FR-3, FR-4)
**What:** Add the free-form min/max numeric word-count filter to
`OrganizerFilterBar`, wired to the Task 1 predicate.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerFilterBar.tsx`
**Done when:**
- Two labelled numeric `<input type="number">` controls ("Minimum words" /
  "Maximum words") are rendered, matching FR-3's decided free-form
  min/max-range shape (not preset buckets, not a hybrid).
- Entering a min and/or max dispatches the set-word-count-range action; a
  non-text resource (image, audio, folder) is excluded from
  `visibleChildren` whenever either bound is set, per FR-4 (already covered
  by Task 1's `filterChildren`; this task only wires the UI to it).
- Leaving both inputs empty is equivalent to the filter being inactive (no
  exclusion of non-text resources when unset).
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 3
**Estimate:** 2
**Done:** [ ]

---

### Task 5: Resource-reference filter controls (FR-5, FR-6)
**What:** Dynamically render one filter control per `resource-ref`/
`multi-resource-ref` field defined in the active project's metadata schema,
populated from the distinct values present among the current folder's
children.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerFilterBar.tsx`
**Done when:**
- `OrganizerView` reads the active project's metadata schema via the
  existing `selectActiveProjectMetadataSchema` selector, derives the list of
  `resource-ref`/`multi-resource-ref` fields across all groups (no new
  selector added), and computes each field's distinct values by scanning
  `userMetadata[field.key]` across the currently visible folder's direct
  children only (per FR-5's "currently visible folder's children" scope,
  not project-wide).
- `OrganizerFilterBar` renders one labelled control per such field
  (dropdown or equivalent), listing those distinct values by name.
- Selecting a value dispatches a set-ref-filter action keyed by field key;
  `filterChildren` (Task 1) hides a card whose corresponding field doesn't
  include that value, matching a `multi-resource-ref` field if the value is
  any one entry (FR-6).
- A project with no `resource-ref`/`multi-resource-ref` fields defined
  renders zero such controls (not an empty section or placeholder).
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 3
**Estimate:** 5
**Notes:** Distinct-value computation must be re-derived whenever
`visibleChildren`'s *unfiltered* base set (`allChildren`) or the selected
folder changes — use `allChildren`, not the already-filtered
`visibleChildren`, as the source for candidate values, so narrowing one
filter doesn't also shrink another filter's own option list out from under
the writer.
**Done:** [ ]

---

### Task 6: Per-filter and clear-all controls (FR-8)
**What:** A clear control next to each active filter (status, word count,
each resource-ref field) plus one "Clear all filters" control.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerFilterBar.tsx`
**Done when:**
- Each filter control shows an accessible clear affordance (button with
  `aria-label`, e.g. "Clear status filter") that appears only when that
  filter is active, dispatching the clear-one action for that filter alone.
- A single "Clear all filters" `Button` (reusing the existing
  `common/UI/Button` component per the file's existing pattern) is visible
  whenever at least one filter is active, dispatching the clear-all action
  and restoring the full unfiltered card set.
- Clearing one filter leaves the others active (verified by inspecting
  resulting `visibleChildren`, not just that the dispatch fired).
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 3, Task 4, Task 5
**Estimate:** 2
**Done:** [ ]

---

### Task 7: Distinct empty-state message for filtered-to-zero (FR-9)
**What:** `OrganizerView` shows a message distinct from "This folder is
empty." when at least one filter is active and `visibleChildren` is empty
but `allChildren` is not.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
**Done when:**
- The render branch distinguishes three states: no folder selected
  (unchanged), folder genuinely empty (`allChildren.length === 0`, unchanged
  "This folder is empty." message), and filtered-to-zero (`allChildren.length
  > 0 && visibleChildren.length === 0` while any filter is active) — this
  third state shows new copy (e.g. "No cards match the current filters.")
  that never appears when no filter is active.
- The existing "shows empty state when selected folder has no children"
  test in `organizerView.test.tsx` still passes unmodified (that case has no
  active filters, so it must still hit the original message).
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 2
**Estimate:** 1
**Done:** [ ]

---

### Task 8: Integration test coverage across FR-1 through FR-11
**What:** Extend the existing Organizer test file with coverage for every
functional requirement introduced by this feature, exercised end-to-end
through rendered filter controls rather than by calling
`organizerFilters.ts` directly (that unit coverage is Task 1's).
**Files:** `frontend/tests/organizerView.test.tsx`
**Done when:** new `describe`/`it` blocks (added to the existing file, not a
new file) cover:
- Status filter hides a non-matching card and shows a "no status" match
  (FR-1, FR-2).
- Word-count min/max filter excludes a non-text resource when active and
  narrows text resources by range (FR-3, FR-4).
- A resource-ref filter control appears per schema-defined field, populated
  from the visible folder's children's distinct values, and narrows cards
  including a `multi-resource-ref` any-one-entry match (FR-5, FR-6).
- Two simultaneously active filters combine as AND, narrower than either
  alone (FR-7).
- Clearing one filter restores cards excluded only by that filter; "clear
  all" restores the full set (FR-8).
- Filtering to zero matches renders the distinct empty-state message from
  Task 7, not "This folder is empty." (FR-9).
- Changing `selectedResourceId` to a different folder (via
  `setSelectedResourceId`) resets all active filter state, restoring that
  folder's full unfiltered child set (FR-10).
- The existing `fetchResourceExcerpts` mock (already present in this file)
  is asserted not to gain any new call tied to a filter change — filtering
  triggers no additional fetch (FR-11).
- `pnpm --filter getwrite-frontend test:ci -- organizerView` passes in full,
  including all pre-existing tests in the file.
**Depends on:** Task 3, Task 4, Task 5, Task 6, Task 7
**Estimate:** 5
**Done:** [ ]

---

### Task 9: Storybook story for filtering
**What:** Extend the existing Organizer story file with a story that
exercises the new filter bar against a folder with varied status/word-count/
resource-ref metadata, per `docs/standards/storybook-implementation.md`.
**Files:** `frontend/stories/WorkArea/OrganizerView.stories.tsx`
**Done when:**
- A new named export (e.g. `WithFilters`) is added to the existing file
  (not a new stories file), backed by a story-scoped store (following the
  file's existing `selectedFolderStore` pattern) whose project config
  includes a non-empty `config.statuses` list and at least one
  `resource-ref`/`multi-resource-ref` metadata schema field, and whose
  resources vary in status, word count, and that field's value so every
  filter control has a real effect to demonstrate.
- The story renders without runtime errors under `pnpm storybook` and shows
  the filter bar alongside the card grid.
**Depends on:** Task 3, Task 4, Task 5, Task 6
**Estimate:** 2
**Done:** [ ]

---

### Task 10: Accessibility pass on filter controls
**What:** Verify the filter bar meets `docs/standards/accessibility.md`
(WCAG 2.1 AA target) — semantic roles, programmatic labels, and full keyboard
operability for every control added in Tasks 3–6.
**Files:**
- `frontend/components/WorkArea/Views/OrganizerView/OrganizerFilterBar.tsx`
  (fixes as needed)
- Possibly `frontend/tests/organizerView.a11y.test.tsx` (new, if this repo's
  `*.a11y.test.tsx` axe-core convention applies to view-level components —
  check for a precedent under `frontend/tests/a11y/` before creating it)
**Done when:**
- Every control (status select, min/max number inputs, each resource-ref
  select, each clear button, clear-all button) has an accessible name
  (`<label>`, `aria-label`, or equivalent) confirmed by reading rendered
  output, not assumed from markup.
- Every control is operable via keyboard alone (native `<select>`/`<input>`/
  `<button>` elements satisfy this without extra work; confirmed no custom
  non-native widget was introduced that lacks keyboard handling).
- If an axe-core check is added, it passes with zero violations on the
  filter bar in its default and at-least-one-filter-active states.
- `pnpm --filter getwrite-frontend test:ci` (full run, or the relevant
  subset) passes.
**Depends on:** Task 3, Task 4, Task 5, Task 6, Task 9
**Estimate:** 2
**Done:** [ ]

---

### Task 11: Final verification sweep
**What:** Run the full standard verification suite across everything this
feature touched, and fix any failure surfaced only at the whole-suite level
(cross-file type errors, lint rules not caught file-by-file, etc.).
**Files:** none (verification only; fixes land in whichever file above needs
them)
**Done when:**
- `pnpm --filter getwrite-frontend typecheck` passes with zero errors.
- `pnpm --filter getwrite-frontend lint` passes with zero errors.
- `pnpm --filter getwrite-frontend test:ci` passes in full (not a filtered
  subset).
- `pnpm --filter getwrite-frontend build` (or at minimum a targeted check
  that `next build` isn't broken by the new files) succeeds — optional but
  recommended given `OrganizerView.tsx` is on the main app-shell render
  path.
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10
**Estimate:** 1
**Done:** [ ]

---

## Amendment (2026-09-29): FR-12 through FR-16

The tasks below (12–19) implement the spec's "Amendment (2026-09-29)" section
— FR-12 through FR-16 — added after the owner reviewed the shipped Tasks
1–11 and asked for the filter bar to be collapsible as a whole, with the
resource-reference controls tucked behind a second, nested collapse. Tasks
1–11 above are unchanged; these are purely additive, continuing the existing
numbering.

Implementation-shape decision (made explicit here per the parent request,
rather than left to the implementor to guess): the two collapse states (FR-12's
top-level filter-area open/closed, FR-14's nested advanced-section
open/closed) are **UI chrome, not filter values**, and MUST NOT be added to
`OrganizerFilterState`/`organizerFilterReducer` in `organizerFilters.ts`.
That module and its reducer are scoped to filter *values* (status,
word-count range, ref-field selections) and already carry a reset action that
Task 2's `useEffect` (keyed on `selectedFolder?.id`) dispatches on every
folder change per FR-10. FR-15 requires the opposite behavior for collapse
state — it must survive that same folder-change event. Folding collapse state
into the same reducer/state object would mean either (a) the existing
folder-change reset action starts clearing it too, breaking FR-15, or (b) the
reset action grows a special case to spare specific fields, entangling a
"reset filter values" concern with a "leave UI chrome alone" concern inside
one action. Both are avoidable: collapse state is two independent
`React.useState` hooks living in `OrganizerView.tsx`, mirroring the existing
`isShowingBody` local-state pattern exactly (same pattern the original
spec's OQ-1/OQ-4 already chose for filter state itself), untouched by the
folder-change reset effect, and passed down to `OrganizerFilterBar` as props
alongside the reducer's dispatch. No persistence beyond the session (no
`localStorage`) is required per FR-15.

---

### Task 12: Collapse-state model (session-only, separate from filter values)
**What:** Add the two collapse-state booleans backing FR-12 and FR-14 as
local `OrganizerView` state, deliberately kept out of `organizerFilters.ts`'s
reducer per the implementation-shape decision above.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
**Done when:**
- `OrganizerView` holds two new `React.useState` booleans —
  `isFilterAreaOpen` (default `false`, FR-12) and `isAdvancedFiltersOpen`
  (default `false`, FR-14) — declared the same way as the existing
  `isShowingBody` state, not added to `OrganizerFilterState` or any reducer
  action.
- Neither boolean is included in, or reset by, the `React.useEffect` keyed on
  `selectedFolder?.id` added in Task 2 (that effect continues to dispatch
  only the filter-*values* reset action) — confirmed by reading the effect
  body, not merely by omission.
- Both booleans and their setters are passed to `OrganizerFilterBar` as new
  props (interface updated accordingly); `organizerFilters.ts` itself is not
  modified by this task.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 2
**Estimate:** 2
**Done:** [ ]

---

### Task 13: Top-level "Filters" toggle wraps the whole filter area; Status/word-count always visible within it (FR-12, FR-13)
**What:** `OrganizerFilterBar` renders a single top-level toggle control
that shows or hides the entire filter area (Status, word-count, the FR-14
nested section, and the FR-8 per-filter/clear-all controls), collapsed by
default; when expanded, the Status and word-count controls (from Tasks 3–4)
render directly, not behind any further collapse.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerFilterBar.tsx`
**Done when:**
- A native `<button>` labeled "Filters" (or equivalent copy) is always
  rendered, regardless of `isFilterAreaOpen`, and toggles that boolean via
  the setter passed from Task 12 on click.
- When `isFilterAreaOpen` is `false`, no filter control (Status, word-count,
  resource-ref, per-filter clear, clear-all) is rendered or reachable by
  keyboard — the whole area is absent from the DOM or otherwise
  non-interactive, matching FR-12's "shows or hides the entire filter area"
  wording.
- When `isFilterAreaOpen` is `true`, the Status select (Task 3) and the
  min/max word-count inputs (Task 4) render as direct children of the
  expanded area — not inside the FR-14 nested section and not behind any
  other conditional — satisfying FR-13's "MUST NOT be placed behind any
  further (nested) collapse."
- Default-collapsed on first render is verified (no folder-navigation or
  other action is required to observe the collapsed state).
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 12, Task 3, Task 4
**Estimate:** 3
**Done:** [ ]

---

### Task 14: Nested "Advanced filters" toggle wraps the resource-reference controls (FR-14)
**What:** Inside the (already-expanded) top-level filter area, beneath the
Status/word-count controls, add a second, independently-collapsible section
holding the resource-reference filter controls from Task 5, collapsed by
default regardless of the top-level area's own state.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerFilterBar.tsx`
**Done when:**
- A native `<button>` labeled "Advanced filters" (or equivalent copy) renders
  beneath the Status/word-count controls, only when `isFilterAreaOpen` is
  `true`, and toggles `isAdvancedFiltersOpen` via the setter from Task 12 on
  click.
- The Task 5 resource-ref controls (one per `resource-ref`/`multi-resource-ref`
  schema field) render only when `isAdvancedFiltersOpen` is `true`; they are
  moved from wherever Task 5 originally placed them into this nested section
  if not already there.
- `isAdvancedFiltersOpen` starts `false` independent of `isFilterAreaOpen` —
  expanding the top-level area does not implicitly open the nested section
  (verified by expanding the top-level toggle alone and confirming the
  resource-ref controls remain hidden until the nested toggle is also
  clicked).
- A project with zero `resource-ref`/`multi-resource-ref` fields still
  behaves per Task 5's existing "renders zero such controls" rule — the
  nested toggle itself may still render (there is no requirement to hide it
  when there are no ref fields; note this either way is fine since the spec
  does not prescribe it, but state the chosen behavior in a code comment).
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 13, Task 5
**Estimate:** 2
**Done:** [ ]

---

### Task 15: Collapse state persists across folder navigation, contrasted with FR-10's filter-value reset (FR-15)
**What:** Confirm and, if needed, fix that `isFilterAreaOpen` and
`isAdvancedFiltersOpen` survive a folder change within the session, while
filter *values* continue to reset per FR-10 — i.e. the two concerns behave
oppositely on the same navigation event.
**Files:**
- `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
  (fixes only if Task 12's separation was not fully honored)
- `frontend/tests/organizerView.test.tsx`
**Done when:**
- A new test: with the top-level filter area expanded (and, in one case, the
  nested section also expanded) and at least one filter value set, changing
  `selectedResourceId` to a different folder (via `setSelectedResourceId`,
  matching the existing FR-10 test's approach) results in both collapse
  booleans remaining unchanged while the filter values reset to empty and
  the full unfiltered child set of the new folder is shown.
- The test explicitly asserts both outcomes in the same test body (collapse
  state unchanged AND filter values reset) so the contrast with FR-10 is
  exercised directly, not inferred from two separate tests.
- No `localStorage`/persistence-beyond-session mechanism is added — this
  task verifies in-memory `useState` naturally satisfies FR-15's session-only
  requirement, per the spec's explicit statement that persisting beyond the
  session is a future refinement, not a requirement.
- `pnpm --filter getwrite-frontend test:ci -- organizerView` passes.
**Depends on:** Task 12, Task 13, Task 14
**Estimate:** 2
**Done:** [ ]

---

### Task 16: Accessibility for both toggle controls (FR-16)
**What:** Ensure the FR-12 and FR-14 toggle buttons are fully accessible —
native, keyboard-operable, `aria-expanded`-annotated, and labeled — and
extend the existing a11y test coverage to include them.
**Files:**
- `frontend/components/WorkArea/Views/OrganizerView/OrganizerFilterBar.tsx`
  (fixes as needed)
- `frontend/tests/a11y/organizerFilterBar.a11y.test.tsx` (extend; created by
  Task 10 in the original task set)
**Done when:**
- Both toggles are real `<button>` elements (not a `div`/`span` with a click
  handler), each carrying `aria-expanded={isFilterAreaOpen}` /
  `aria-expanded={isAdvancedFiltersOpen}` respectively, kept in sync with
  the boolean each toggle controls.
- Each toggle has an accessible name via its own visible text content or an
  `aria-label` (e.g. "Filters", "Advanced filters") — confirmed by reading
  rendered output, not assumed from markup.
- Both toggles are operable via keyboard alone (native `<button>` satisfies
  Enter/Space activation with no extra work; confirmed no custom
  non-native widget was introduced for either toggle).
- The existing `organizerFilterBar.a11y.test.tsx` gains new axe-core
  assertions covering: the filter bar in its fully-collapsed default state,
  the top-level area expanded with the nested section still collapsed, and
  both expanded — zero violations in all three states.
- `pnpm --filter getwrite-frontend test:ci -- organizerFilterBar` passes.
**Depends on:** Task 13, Task 14
**Estimate:** 2
**Done:** [ ]

---

### Task 17: Extend integration test coverage for FR-12 through FR-16
**What:** Extend `organizerView.test.tsx` with end-to-end coverage of the
new collapse behavior, exercised through rendered controls (not by reading
component internals).
**Files:** `frontend/tests/organizerView.test.tsx`
**Done when:** new `describe`/`it` blocks cover:
- The filter area is collapsed by default on first render and no filter
  control is present/reachable until the "Filters" toggle is activated
  (FR-12).
- Once expanded, the Status select and word-count inputs are visible
  immediately, with no further interaction needed (FR-13).
- The resource-ref controls remain hidden after expanding the top-level area
  alone, and only appear after also activating the "Advanced filters" toggle
  (FR-14).
- Collapsing the top-level area again hides everything, including the
  nested section's own contents, regardless of the nested section's own
  open/closed state.
- The FR-15 folder-navigation contrast from Task 15 (collapse state
  persists, filter values reset) — this may reuse or extend Task 15's test
  rather than duplicate it, but must be present in this file.
- `pnpm --filter getwrite-frontend test:ci -- organizerView` passes in full,
  including all pre-existing tests in the file (both from the original 11
  tasks and Task 15).
**Depends on:** Task 13, Task 14, Task 15
**Estimate:** 3
**Done:** [ ]

---

### Task 18: Extend Storybook story to demonstrate collapsed and expanded states
**What:** Extend the existing `WithFilters` story (added by Task 9) or add a
sibling export to show the filter bar in its default collapsed state and in
an expanded-with-advanced-open state, per
`docs/standards/storybook-implementation.md`.
**Files:** `frontend/stories/WorkArea/OrganizerView.stories.tsx`
**Done when:**
- The existing `WithFilters` export (or a new named export, e.g.
  `WithFiltersExpanded`, added to the same file) demonstrates the
  fully-collapsed default state matching FR-12's default.
- At least one story export demonstrates both the top-level area and the
  nested "Advanced filters" section expanded simultaneously, so every
  control added since the original Task 3–9 stories (including the FR-5
  resource-ref controls, now nested) is reachable from Storybook without
  manual interaction.
- Both states render without runtime errors under `pnpm storybook`.
**Depends on:** Task 13, Task 14
**Estimate:** 2
**Done:** [ ]

---

### Task 19: Final verification sweep for FR-12 through FR-16
**What:** Run the full standard verification suite across everything Tasks
12–18 touched, and fix any failure surfaced only at the whole-suite level.
**Files:** none (verification only; fixes land in whichever file above needs
them)
**Done when:**
- `pnpm --filter getwrite-frontend typecheck` passes with zero errors.
- `pnpm --filter getwrite-frontend lint` passes with zero errors.
- `pnpm --filter getwrite-frontend test:ci` passes in full (not a filtered
  subset), including every test from both the original 11-task set and
  Tasks 12–18.
- `pnpm --filter getwrite-frontend build` (or at minimum a targeted check
  that `next build` isn't broken by the changes) succeeds.
**Depends on:** Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18
**Estimate:** 1
**Done:** [ ]

---

## Summary

- Total tasks: 19
- Total estimated effort: 45 story points (28 from the original Tasks 1–11,
  17 from Tasks 12–19 added for the 2026-09-29 amendment)
- Critical path: Task 1 → Task 2 → Task 3 → Task 5 → Task 6 → Task 8 →
  Task 9 → Task 12 → Task 13 → Task 14 → Task 17 → Task 19
  (Task 5 is the longest single task on the path in the original set at 5
  points and the main source of schedule risk there; Task 4, Task 7, and
  Task 10 can run in parallel with each other/Task 9 once their own
  dependencies land, but don't shorten the path. In the amendment set, Task
  12 depends only on Task 2 and could start as soon as it lands, but is
  shown after Task 9 here because Task 18 — which needs Task 14 — extends
  Task 9's story, keeping the amendment's story/a11y work sequenced after
  the original set's; Task 14 is the load-bearing dependency the rest of
  Tasks 15–18 build on, and Task 19's sweep needs everything finished
  first.)
- Risks:
  - Task 5 (resource-ref filter controls) carries the most uncertainty: it
    introduces new derived state (distinct values scoped to the *unfiltered*
    visible folder, per the Task 5 note) that has no existing precedent to
    copy verbatim from `OrganizerView.tsx` itself, unlike Tasks 3/4 which
    mirror `OrganizerCard.tsx`'s existing status/word-count field reads.
  - Task 10 depends on whichever native-control choices Tasks 3–6 make; if
    a non-native widget (e.g. a custom multi-select) turns out to be needed
    for the resource-ref filter to feel usable with many distinct values,
    the keyboard-operability work in Task 10 could grow beyond its current
    2-point estimate.
  - No task in this list touches `specs/product/getwrite.md`'s FR-26/US-7
    citation mismatch (OQ-2) — that's out of scope for implementation and
    was correctly left as a separate follow-up in the spec itself.
  - Task 12's separation of collapse state from `organizerFilters.ts` is the
    single decision the whole amendment set depends on: if a future task
    were to fold collapse state back into the reducer (e.g. for a
    convenience refactor), FR-15's persist-across-navigation requirement
    would silently break the next time Task 2's folder-change reset effect
    ran, since that effect is defined in terms of "reset the filter reducer
    state" — any state added to that reducer is reset by it. Tasks 13–18
    all assume Task 12's boundary holds.
