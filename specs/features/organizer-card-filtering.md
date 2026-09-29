# Feature Spec: Organizer View — Card Filtering

## Overview

The Organizer view (`OrganizerView.tsx`) renders the direct children of a
selected folder as a card grid, with a single in-view control: a show/hide
toggle for card bodies. It offers no way to narrow that grid. A writer with a
folder of many cards — characters, locations, scenes — cannot find a subset
without scrolling and reading every card. This feature adds filtering by
Status, word count, and the project's resource-reference metadata fields, so
a writer can narrow the visible cards to the ones that matter for the task at
hand.

## Goals

- A writer can filter the currently visible Organizer folder's cards by
  Status.
- A writer can filter cards by a word-count range.
- A writer can filter cards by the value of any resource-reference
  (`resource-ref` / `multi-resource-ref`) field the project's metadata schema
  defines.
- Filters combine (AND) and can be cleared individually or all at once.
- Filtering works entirely from data already loaded client-side, with no new
  fetch on filter change.

## Non-goals

- Filtering is scoped to the currently selected folder's direct children only
  — it does not extend Organizer to a recursive/whole-project card view.
- Saving a filter combination as a smart folder or saved query is out of
  scope.
- Filtering by free-text search of card body/content is out of scope.
- Sorting cards (independent of filtering) is out of scope.

## User stories

- US-1: As a plain-file writer with a large characters or locations folder, I
  want to filter the Organizer's card grid by Status so that I can see only
  the entries in a given state (e.g. "Needs revision") without scanning every
  card.
- US-2: As a plain-file writer, I want to filter Organizer cards by word
  count so that I can find stub or oversized entries in a folder at a
  glance.
- US-3: As a novelist using resource-reference metadata (e.g. a scene's
  "Characters" field), I want to filter Organizer cards by a reference field's
  value so that I can see only the scenes or entries tied to a particular
  character or location.
- US-4: As a plain-file writer, I want to clear an active filter or all
  filters at once so that I can return to the unfiltered view without
  reselecting the folder.

## Functional requirements

Implementation architecture (resolved, see OQ-1 and OQ-4 below): filtering is
implemented as standalone, view-local filter state inside `OrganizerView.tsx`
(`useState`/`useReducer`), mirroring the existing `isShowingBody` local-state
pattern — not the query-AST/evaluator pipeline (`query-ast.ts`,
`query-evaluator.ts`, `query-intrinsics.ts`) used by Smart Folders. Filter
predicates (status equality, word-count range, resource-ref field membership)
are implemented as plain `Array.filter` logic over `AnyResource` objects
already present in `resourcesSlice`, with no separate fetch or `QueryContext`
construction. No new props are added to `OrganizerViewProps` for this
feature; filter state is not lifted for a hypothetical future controlled
caller (YAGNI — `AppShell.tsx` renders `<OrganizerView />` with no props
today and there is no evidence of an incoming controlled caller).

1. FR-1: The Organizer view MUST provide a filter control for Status,
   populated from the active project's configured `config.statuses` list plus
   an option for resources with no status set. [US-1]
2. FR-2: Selecting a Status filter value MUST hide any card whose resolved
   status (or default status, per existing `OrganizerCard` resolution) does
   not match. [US-1]
3. FR-3: The Organizer view MUST provide a word-count filter as a free-form
   minimum, maximum, or both, entered via numeric range inputs — not preset
   buckets (e.g. "Stub", "Short", "Long") and not a hybrid of the two. This
   is the decided, firm UI shape (resolved, see OQ-5 below), matching the
   app's one existing numeric-filter precedent (QueryBuilder's `gte`/`lte`
   comparison operators for numeric fields). [US-2]
4. FR-4: The word-count filter MUST apply only to text resources; non-text
   resources (image, audio, folder) MUST be excluded from the visible set
   when a word-count filter is active, since they carry no word count. [US-2]
5. FR-5: The Organizer view MUST provide one filter control per
   `resource-ref` or `multi-resource-ref` field defined in the active
   project's metadata schema, each populated with the distinct values present
   among the currently visible folder's children. [US-3]
6. FR-6: Selecting a resource-reference filter value MUST hide any card whose
   corresponding field does not include that value (a `multi-resource-ref`
   field matches if the selected value is any one of its entries). [US-3]
7. FR-7: When more than one filter is active, a card MUST be visible only if
   it matches every active filter (logical AND). [US-1][US-2][US-3]
8. FR-8: The Organizer view MUST provide a control to clear each filter
   independently and a single control to clear all active filters at once.
   [US-4]
9. FR-9: When a filter (or combination of filters) matches no cards, the
   Organizer view MUST show a distinct empty-state message rather than the
   existing "This folder is empty" message, so a writer can tell filtered-out
   from actually-empty. [US-1][US-2][US-3][US-4]
10. FR-10: Filter state MUST reset when the writer navigates to a different
    folder (decided, see OQ-3 below — not persisted across folder
    navigation), so a filter set in one folder does not silently hide cards
    after navigating to another. Implementation may clear filter state via a
    `useEffect` keyed on `selectedFolder.id`, or scope state so it naturally
    resets with folder selection. [US-1][US-4]
11. FR-11: Filtering MUST NOT trigger a network request; it MUST operate on
    resource data already present in the Redux store. [US-1][US-2][US-3]

### Amendment (2026-09-29)

The requirements below, numbered starting at FR-12, were added after the
owner reviewed the first implementation (the original eleven, all shipped)
and requested a UI restructuring: the filter bar should be collapsible as a
whole, with the resource-reference filters added earlier further tucked
behind a second, nested collapsible section so they don't add visual clutter
for writers who only use Status/word-count. These new requirements are
additive to the original set — none of the original eleven are changed,
renumbered, or superseded — which is why the numbering picks up after the
original set rather than being interleaved with it.

12. FR-12: The Organizer view MUST provide a single top-level toggle control
    that shows or hides the entire filter area — all filter controls (Status,
    word-count, and resource-reference) together with their per-filter and
    clear-all controls (FR-8). The filter area's default state MUST be
    collapsed: filters are hidden until the writer explicitly opens them.
    [US-1][US-2][US-3][US-4]
13. FR-13: When the top-level filter area is expanded, the Status filter
    (FR-1/FR-2) and the word-count filter (FR-3/FR-4) MUST always be directly
    visible within it — these two MUST NOT be placed behind any further
    (nested) collapse. [US-1][US-2]
14. FR-14: A second, nested collapsible section MUST be provided beneath the
    Status and word-count filters, inside the (already-expanded) top-level
    filter area, containing the resource-reference (`resource-ref` /
    `multi-resource-ref`) filter controls added by FR-5/FR-6 (e.g. a "Point of
    View" filter). This nested section's default state MUST be collapsed,
    independent of the top-level filter area's own open/closed state — i.e.
    even when the top-level area is expanded, the nested section starts
    closed. Rationale: not all writers use these deeper metadata filters, so
    they should not add visual clutter for writers who only use
    Status/word-count. [US-3]
15. FR-15: Both collapse states — the top-level filter area (FR-12) and the
    nested deeper-metadata section (FR-14) — MUST persist as the writer
    navigates between folders within the same session. This is UI chrome
    (whether a section is open), not filter *values*, and is explicitly NOT
    subject to FR-10's reset-on-folder-navigation rule, which governs active
    filter values (e.g. a selected status or word-count range) only. Neither
    collapse state is required to persist across a page reload or new
    session — session-only persistence is sufficient; persisting either state
    beyond the session (e.g. via `localStorage`) is a possible future
    refinement, not a requirement of this spec. [US-1][US-2][US-3][US-4]
16. FR-16: Both toggle controls (FR-12's top-level toggle and FR-14's nested
    toggle) MUST be accessible: each MUST be a native `<button>` or
    equivalent keyboard-operable control, MUST expose its open/closed state
    via `aria-expanded`, and MUST be labeled so a screen-reader user
    understands what it controls (e.g. "Filters" for the top-level toggle and
    "Advanced filters" for the nested toggle, or similar — exact copy is an
    implementation detail and not prescribed here). [US-1][US-2][US-3][US-4]

## Open questions

- OQ-1: **RESOLVED** (from evidence, confirmed). Should Organizer filtering
  be built as a standalone, view-local filter-state model (mirroring the
  existing `isShowingBody` local state pattern), or should it reuse the
  existing query AST/evaluator pipeline (`query-ast.ts`,
  `query-evaluator.ts`, `query-intrinsics.ts`) used by Smart Folders,
  treating an active filter set as an ephemeral, unsaved query? Resolution:
  standalone, view-local filter state inside `OrganizerView.tsx`, mirroring
  `isShowingBody` — not the query-AST/evaluator pipeline. Rationale:
  `query-evaluator.ts`'s `evaluate()` requires a separately-constructed
  `sidecars` map and `QueryContext`, and is async; `OrganizerCard.tsx`
  already reads `status`/`wordCount` directly off the `AnyResource` objects
  already sitting in `resourcesSlice` with no separate fetch, and FR-11 (no
  new network request on filter change) rules out the fetch-heavy path
  anyway. A standalone filter is three simple predicates (status equality,
  word-count range, resource-ref field membership) implementable as
  `Array.filter` over data already in state/props. — Impact: FR-1 through
  FR-8 (implementation shape, now stated explicitly in the "Implementation
  architecture" note preceding the Functional requirements list); does not
  change observable behavior.
- OQ-2: **RESOLVED** (flagged discrepancy, confirmed real, deliberately left
  unfixed here — correctly out of this spec's scope). The product spec's
  FR-26 (`specs/product/getwrite.md:524`) cites [US-7] as the user story
  this feature serves, but US-7 (`specs/product/getwrite.md:137`, status
  "Shipped") reads "As a plain-file writer, I want to search full text with
  metadata filters and follow backlinks so that I can navigate a project too
  large to hold in memory" — that is full-text search, not Organizer card
  filtering, and it is already shipped. No existing user story in the
  product spec actually describes filtering Organizer's card view. This
  spec's own User Stories section (US-1 through US-4 above) was written
  fresh rather than reusing the mismatched citation. Resolution: confirmed
  real; deliberately left unfixed here, since correcting product-spec
  content is out of scope for a feature spec; tracked as a separate
  follow-up to correct `specs/product/getwrite.md`'s FR-26 citation (and
  likely add a new user story there) outside this pipeline run. — Impact:
  none on this feature's implementation.
- OQ-3: **RESOLVED** (owner decision). Should filter state persist across a
  folder change within the same session (e.g. "Status: Draft" stays active
  as the writer navigates between folders), or should it reset on every
  folder change? Resolution: filters reset on every folder navigation — not
  persisted across folders. Rationale: avoids the "cards silently missing
  after navigating to an unrelated folder" surprise; no existing precedent
  in the app ties transient view state to folder navigation in either
  direction, so this is the simpler, safer default. — Impact: FR-10, now
  stated as a firm requirement.
- OQ-4: **RESOLVED** (from evidence, confirmed). Should the currently-unused
  `showBody`/`onToggleBody` props on `OrganizerViewProps` (verified:
  `AppShell.tsx` renders `<OrganizerView />` with no props, so these are
  only exercised by stories/tests) inform where filter state should live —
  i.e., should filter state follow the same local-only pattern as
  `isShowingBody`, or should it be lifted to `OrganizerViewProps` now in
  anticipation of a future caller needing controlled filter state?
  Resolution: no — new filter state is local `useState`/`useReducer` inside
  `OrganizerView`, exactly like `isShowingBody`, not lifted to new props.
  No evidence of an incoming controlled caller, so no new props are added
  speculatively (YAGNI). — Impact: FR-1 through FR-8 (implementation shape,
  now stated explicitly in the "Implementation architecture" note).
- OQ-5: **RESOLVED** (owner decision). What word-count filter UI does a
  writer expect — a single min/max numeric range, or a small set of preset
  buckets (e.g. "Stub (0)", "Short", "Long")? Resolution: free-form min/max
  numeric range inputs, not preset buckets, not a hybrid. Rationale: matches
  FR-3 as originally written and the one existing numeric-filter precedent
  in the app (QueryBuilder's `gte`/`lte` comparison operators for numeric
  fields) — most flexible, no new UI pattern needs inventing for a first
  pass. — Impact: FR-3, now stated as the firm, decided shape.

## Out of scope (deferred)

- Saving an active filter combination as a persistent Smart Folder / saved
  query.
- Recursive (whole-subtree or whole-project) Organizer filtering beyond the
  selected folder's direct children.
- Free-text filtering of card body/excerpt content.
- Sorting cards by any field.
- Filtering by fields other than Status, word count, and resource-reference
  fields (e.g. arbitrary text/select/date metadata fields) — a plausible
  follow-on, not requested by FR-26.
