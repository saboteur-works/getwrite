# Task List: Organizer View — Drag-and-Drop Card Reordering

Source spec: `specs/features/organizer-card-drag-reorder.md` (finalized,
approved, all Open Questions resolved: OQ-1 mooted by OQ-2, OQ-2 resolved
"disabled whenever any filter is active," OQ-3 resolved "dedicated grip-icon
drag handle," OQ-4 resolved "wire dnd-kit's `announcements` callback").
Granularity: story points (1/2/3/5/8), matching
`specs/features/organizer-card-icons-and-open/tasks.md`'s convention.

## Grounding notes (verified against source before writing tasks below)

- `@dnd-kit` is **not yet a dependency** of `frontend/package.json` (confirmed:
  no `@dnd-kit/*` entry exists today). Task 1 adds it; no alternate library
  (FR-6) is introduced. `lucide-react` (already a direct dependency,
  `^0.577.0`) already exports `GripVertical`, already used as a drag-handle
  icon elsewhere in this codebase (`QueryBuilder/FilterChip.tsx`:
  `<GripVertical size={12} aria-hidden="true" />`) — Task 2 reuses this exact
  icon rather than introducing a new one.
- `OrganizerView.tsx` derives `childFolders` (folders under `selectedFolder`,
  sorted by their own `orderIndex`) and `childResources` (resources under
  `selectedFolder`, sorted by their own `orderIndex`) independently, then
  concatenates them as `allChildren = [...childFolders, ...childResources]`.
  `visibleChildren` is `filterChildren(allChildren, filterState, ...)`. Per
  FR-5, reordering is disabled whenever `isAnyFilterActive` (already computed
  in this file) is `true` — in that disabled state `visibleChildren` may
  differ from `allChildren`, but the reorder feature is inert then, so no
  filtered-subset reorder logic is ever needed (OQ-1's resolution).
- `OrganizerCard.tsx` currently has exactly two interactive elements: a title
  `<button onClick={onSelect}>` and a footer `<button onClick={onOpen}>
  Open</button>`, plus an `isSelected` prop driving a selected-card
  highlight via inline `style` on the outer `Card`. `OrganizerCardProps` has
  no drag-related prop today. `Card` (`frontend/components/common/UI/Card/
  Card.tsx`) forwards `ref`, `className`, `style`, and all other
  `HTMLAttributes` through to its rendered element (`as` defaults to
  `"div"`; `OrganizerCard` renders it `as="article"`) — so dnd-kit's
  `setNodeRef`/`style`/`attributes`/`listeners` can be attached to `Card`
  directly without a `Card` API change, as long as the drag handle itself
  (not the whole card) is the element carrying `listeners`/`attributes`
  (FR-1/FR-2/OQ-3: the handle, not the card body, is the sole drag-initiation
  target).
- `useResourceReorder.ts` (`frontend/components/ResourceTree/`) is the
  existing sidebar-tree reorder hook and the direct precedent for how this
  feature's own hook must call the shared transport. Its `applyChildrenUpdate`
  closure: (a) computes a dense `orderIndex` per item via a *single running
  counter* shared across both `folderOrder`/`resourceOrder` accumulators
  (`const newOrderIndex = acc.folderOrder.length + acc.resourceOrder.length;`
  — not a per-type counter), (b) dispatches `updateFolders`/`updateResources`
  (`resourcesSlice.ts`) for the immediate, optimistic Redux-state reorder
  (FR-1's "visually reflect... immediately"), then (c) dispatches
  `persistReorder({ projectId, projectRoot, folderOrder, resourceOrder })`
  (`resourcesSlice.ts`'s `createAsyncThunk`, which calls `reorderResources`
  from `lib/api/resources.ts`, which resolves through
  `resolveResourcesTransport()` — already `createTransport`-collapsed with
  `native-resource-backend.ts`'s `reorder`). `reorderResourcesCore`
  (`resource-crud-core.ts`) is the server/native-side implementation this all
  ultimately reaches; nothing in this feature touches that file.
- `projectId`/`projectRoot` for `persistReorder` come from
  `selectActiveProjectDirectoryId` (a selector already imported by
  `OrganizerView.tsx` as `projectId`) and `s.projects.projects[s.projects
  .selectedProjectId ?? ""] ?? null` (the `currentProject` shape
  `ResourceTree.tsx` reads directly off `useAppSelector`, not via a named
  selector) — the new Organizer reorder hook reads both the same way
  `ResourceTree.tsx` does, since no shared selector currently wraps the
  latter.
- Because this feature's own non-goals explicitly exclude re-parenting and
  multi-card drag, the Organizer case is strictly simpler than
  `useResourceReorder.ts`'s: there is exactly one "parent" in play at a time
  (`selectedFolder`, the currently browsed folder) and no cross-parent
  children-removal branch is needed. A new, dedicated hook — not a reuse of
  `useResourceReorder.ts` itself, which is `@headless-tree`-shaped
  (`ItemInstance`/`DragTarget` types) rather than `@dnd-kit`-shaped — mirrors
  only `applyChildrenUpdate`'s reorder-computation-and-persist logic for this
  single-parent case.
- `organizerCard.test.tsx`, `organizerView.test.tsx`,
  `organizerCard.a11y.test.tsx`, and `OrganizerCard.stories.tsx` /
  `OrganizerView.stories.tsx` all already exist and are the files to extend
  per this repo's "add to an existing test file before creating a new one"
  standard; the reorder-hook unit test is the one genuinely new file, since
  no existing file covers reorder logic under `OrganizerView/`.
- `docs/standards/accessibility.md` sets this repo's WCAG 2.1 AA target,
  which FR-8 ties directly to SC 4.1.3 ("Status Messages") — dnd-kit's
  `announcements` callback (passed to `DndContext`) is the mechanism; no
  alternate live-region implementation is in scope.
- `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` are the
  three packages this feature needs (sensors + `DndContext` from `core`;
  `SortableContext`/`useSortable`/`arrayMove` from `sortable`;
  `CSS.Transform.toString` from `utilities` for the drag-transform style) —
  exact current stable versions could not be verified from this session (npm
  registry access was sandboxed); Task 1 explicitly requires verifying and
  recording the installed versions rather than guessing them.

---

### Task 1: Add `@dnd-kit` dependencies (FR-6)
**What:** Add `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities`
as direct dependencies of `getwrite-frontend`, verifying no alternate
drag-and-drop library is introduced and no existing dependency is upgraded
as a side effect.
**Files:** `frontend/package.json`, `pnpm-lock.yaml`
**Done when:**
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` appear as direct
  dependencies in `frontend/package.json`, pinned to their current latest
  stable versions (verified against the npm registry at implementation time,
  not guessed; `docs/standards/package-selection.md` §3/§7 — record the exact
  versions installed).
- No other dependency in `frontend/package.json` or the workspace lockfile
  changes version as a side effect of this install (`docs/standards/
  package-selection.md` §5, "No Implicit Upgrades").
- `pnpm install` completes cleanly from the repo root with no peer-dependency
  warnings for the three new packages against this project's React 19 /
  Next.js versions.
- `pnpm --filter getwrite-frontend typecheck` still passes (confirms the
  packages ship their own types and need no `@types/*` addition).
**Depends on:** none
**Estimate:** 1
**Done:** [ ]

---

### Task 2: Grip-icon drag handle on `OrganizerCard` (FR-1, FR-2, FR-5, OQ-3)
**What:** Add a dedicated, presentational grip-icon drag handle to
`OrganizerCard`, distinct from the existing title-select button and Open
button, that accepts externally-supplied drag attributes/listeners/ref and
an externally-driven disabled state with a visible reason — with no
`@dnd-kit` import inside `OrganizerCard.tsx` itself, keeping the card a pure,
transport/library-agnostic presentational component (consistent with its
existing `onOpen`/`onSelect`/`isSelected` prop-driven design).
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerCard.tsx`
**Done when:**
- `OrganizerCardProps` gains new optional props carrying whatever a caller's
  `@dnd-kit` `useSortable()` call produces, without `OrganizerCard.tsx`
  importing `@dnd-kit` itself — e.g. `dragHandleRef?: (el: HTMLElement |
  null) => void`, `dragHandleAttributes?: React.HTMLAttributes<HTMLElement>`,
  `dragHandleListeners?: Record<string, unknown>`, `dragStyle?: React.CSSProperties`
  (for the outer `Card`'s drag-transform), `isDragDisabled?: boolean`, and
  `dragDisabledReason?: string` — exact prop names/shapes are an
  implementation detail, but the constraint that `OrganizerCard.tsx` itself
  never imports from `@dnd-kit/*` is not.
- A small grip-icon affordance (`GripVertical` from `lucide-react`, matching
  `QueryBuilder/FilterChip.tsx`'s existing usage — no new icon dependency) is
  rendered in the card header, visually distinct from and non-overlapping
  with the existing title button and the footer Open button's hit areas.
- The grip icon is the sole element receiving `dragHandleAttributes`/
  `dragHandleListeners`/`dragHandleRef` — neither the title button, the Open
  button, nor the card body/`<article>` root receives them, satisfying OQ-3's
  "dedicated handle, not the whole card" resolution.
- When `isDragDisabled` is true, the handle is rendered visibly disabled
  (e.g. reduced opacity, `aria-disabled="true"`, and/or `tabIndex={-1}` so it
  drops out of the natural tab order while filtering is active) and does not
  receive `dragHandleListeners`/`dragHandleAttributes` in that state; when
  `dragDisabledReason` is set, it is exposed as the handle's `title`
  attribute and as visually-associated text (e.g. via `aria-describedby`
  pointing at a small hint element), satisfying FR-5's "visible reason shown
  to the user."
- The outer `Card` applies `dragStyle` (when supplied) via its existing
  `style` prop, composed with (not overwriting) the existing `isSelected`
  inline `style` object from the prior feature — both can be active
  simultaneously (a selected card can also be mid-drag).
- No existing prop, behavior, or markup of the title button, Open button, or
  selected-card highlight changes — confirmed by diffing only the new
  handle-related additions.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none (independent of Task 1 — this task adds no `@dnd-kit`
import)
**Estimate:** 3
**Done:** [ ]

---

### Task 3: `useOrganizerCardReorder` hook — reorder computation + persistence (FR-1, FR-3, FR-6)
**What:** Add a new hook, mirroring `useResourceReorder.ts`'s
`applyChildrenUpdate` reorder-computation-and-persist logic but scoped to a
single parent folder (no re-parenting, no multi-select), that takes a
reordered list of the browsed folder's direct-children ids and dispatches
the optimistic Redux update plus the existing `persistReorder` thunk.
**Files:**
- `frontend/components/WorkArea/Views/OrganizerView/useOrganizerCardReorder.ts`
  (new file)
**Done when:**
- The hook accepts (shape is an implementation detail, but must cover):
  the dispatch function, the current project's `{ id, rootPath }` (read the
  same way `ResourceTree.tsx` does: `s.projects.projects[s.projects
  .selectedProjectId ?? ""] ?? null`), the project's on-disk directory id
  (`selectActiveProjectDirectoryId`), and the browsed folder's current,
  unfiltered `allChildren: AnyResource[]` (folders + resources, in current
  display order).
- It returns a function taking the new ordered list of child ids (as
  produced by `@dnd-kit/sortable`'s `arrayMove` in `OrganizerView.tsx`) that:
  (a) walks the new order once, building `folderOrder`/`resourceOrder`
  entries the same way `useResourceReorder.ts`'s `applyChildrenUpdate` does
  — a single running counter (`folderOrder.length + resourceOrder.length`)
  assigns each entry's `orderIndex`, dispatched with `folderId`/`parentId`
  both set to the browsed folder's own id (never `null`/root, and never a
  different folder — no re-parenting path exists here); (b) dispatches
  `updateFolders(folderOrder)` when non-empty and `updateResources
  (resourceOrder)` when non-empty (`resourcesSlice.ts`), for FR-1's
  immediate visual reflection; (c) dispatches `persistReorder({ projectId,
  projectRoot, folderOrder, resourceOrder })` when both `currentProject` and
  the directory id are present, for FR-3's persistence — reusing
  `persistReorder`/`reorderResources` verbatim, with no new transport code
  (FR-6's reuse requirement, extended to the persistence layer by the spec's
  OQ-1 evidence).
- The hook has no `@dnd-kit` import — it is pure Redux/dispatch logic, taking
  an already-computed new-order array of ids as input, so `OrganizerView.tsx`
  is the only file that imports `@dnd-kit` for orchestration (Task 4).
- A new unit test file, `frontend/tests/useOrganizerCardReorder.test.ts`,
  covers: reordering within an all-folder set, an all-resource set, and a
  mixed folder+resource set each produce a dense, zero-based `orderIndex`
  sequence per the single-running-counter rule above; `updateFolders`/
  `updateResources` are only dispatched when their respective arrays are
  non-empty; `persistReorder` is dispatched with the browsed folder's id as
  `folderId` for every entry; and `persistReorder` is NOT dispatched when
  `currentProject` or the directory id is missing (mirroring
  `applyChildrenUpdate`'s own early return).
- `pnpm --filter getwrite-frontend test:ci -- useOrganizerCardReorder` passes.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none
**Estimate:** 5
**Done:** [ ]

---

### Task 4: Wire `DndContext`/`SortableContext` into `OrganizerView.tsx` (FR-1, FR-2, FR-4, FR-5, FR-6)
**What:** Wrap the Organizer grid in `@dnd-kit`'s `DndContext`/
`SortableContext`, with pointer and keyboard sensors both enabled, driving
each `OrganizerCard`'s new drag-handle props via `useSortable()`; disable
the whole mechanism whenever `isAnyFilterActive` is true, reusing that exact
existing condition, and show a visible disabled-reason hint.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
**Done when:**
- `DndContext` is configured with both `PointerSensor` and `KeyboardSensor`
  via `useSensors`/`useSensor` (`@dnd-kit/core`), satisfying FR-6's "keyboard
  sensor enabled alongside the pointer sensor" requirement; the
  `KeyboardSensor` uses `sortableKeyboardCoordinates` (`@dnd-kit/sortable`)
  per its own documented setup.
- `SortableContext`'s `items` is the current `allChildren` ids in display
  order (the full, unfiltered sibling order — never `visibleChildren`'s
  filtered ids), consistent with FR-5's "reordering... only available
  against the full, unfiltered sibling order" and OQ-1's resolution.
- A per-card wrapper (e.g. a small local component, or `useSortable()`
  called once per rendered `OrganizerCard` in the existing `.map(...)`) wires
  `useSortable({ id: child.id, disabled: isAnyFilterActive })`'s returned
  `attributes`/`listeners`/`setNodeRef`/`transform`/`transition` through to
  `OrganizerCard`'s Task-2 props (`dragHandleAttributes`, `dragHandleListeners`,
  `dragHandleRef`, `dragStyle` composed via `CSS.Transform.toString`
  (`@dnd-kit/utilities`) and `transition`, `isDragDisabled`).
- `isDragDisabled`/`dragDisabledReason` are passed to every `OrganizerCard`
  exactly when `isAnyFilterActive` is true (the same existing boolean
  already computed in this file — not a new, parallel condition); the
  disabled-reason string explains that reordering is unavailable while a
  filter is active (exact copy is an implementation detail, e.g. "Clear
  filters to reorder cards").
- `onDragEnd`'s handler: when the drag is disabled (filter active) or there
  is no valid drop target (`over` is null) or the item didn't move, it is a
  no-op; otherwise it computes the new ids order via `arrayMove`
  (`@dnd-kit/sortable`) over the current `allChildren` ids and calls the
  Task-3 hook's returned function with that new order — immediately
  reflected per FR-1, persisted per FR-3.
- FR-4 (visibility unaffected by reordering): dragging and dropping does not
  call `dispatchFilter` or otherwise touch `filterState`/`visibleChildren`
  computation at all — confirmed by diffing that `onDragEnd` touches only
  the reorder path, never the filter reducer or `isAnyFilterActive`.
- The grid's existing conditional-rendering branches (`!selectedFolder`,
  `allChildren.length === 0`, `isAnyFilterActive && visibleChildren.length
  === 0`, the populated grid) are otherwise unchanged; the `DndContext`/
  `SortableContext` wrap only the populated-grid branch's `<div
  className="grid ...">` block.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 1, Task 2, Task 3
**Estimate:** 5
**Done:** [ ]

---

### Task 5: Screen-reader announcements for keyboard reorder (FR-8)
**What:** Wire `DndContext`'s `announcements` callback so a completed
keyboard reorder is announced to assistive technology, per WCAG 2.1 AA SC
4.1.3.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
**Done when:**
- `DndContext` receives an `announcements` prop (`@dnd-kit/core`'s
  `Announcements` shape) implementing at minimum `onDragEnd`, producing a
  human-readable string naming the moved card's title and its new position
  among its siblings (e.g. "<title> moved to position <n> of <total>");
  `onDragStart`/`onDragOver`/`onDragCancel` may also be implemented for a
  fuller experience, but `onDragEnd`'s announcement is the one FR-8
  explicitly requires.
- The announcement text is derived from data already available in
  `OrganizerView.tsx` (the dragged item's resolved title/position in the new
  order) — no new data fetch or store read is introduced for this purpose.
- No announcement fires when the drag is a no-op (disabled by filter, or
  dropped without moving) — mirrors Task 4's `onDragEnd` no-op conditions,
  since an announcement with no actual change would be a false status
  message.
- A test (new, in the reorder integration test file added by Task 7, or a
  small dedicated one) renders `OrganizerView`, performs a keyboard-driven
  reorder (space to pick up, arrow key to move, space to drop — dnd-kit's
  documented keyboard interaction, driven via `@testing-library/user-event`
  keyboard events on the focused grip handle), and asserts the
  `announcements.onDragEnd` callback's return value (or the resulting
  live-region text, whichever is more directly assertable against
  `@dnd-kit`'s DOM output) is non-empty and reflects the new position — not
  just that the reorder itself occurred.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 4
**Estimate:** 3
**Done:** [ ]

---

### Task 6: Unit + integration test coverage for pointer and keyboard reorder (FR-1, FR-2, FR-3, FR-4, FR-5)
**What:** Extend the existing Organizer test files with coverage for
pointer-driven drag reorder, keyboard-driven reorder, filter-active
disabling, persistence, and the FR-4 visibility-unaffected guarantee.
**Files:**
- `frontend/tests/organizerView.test.tsx`
- `frontend/tests/organizerCard.test.tsx`
**Done when:**
- `organizerView.test.tsx`: a new test renders `OrganizerView` with a
  browsed folder containing at least three siblings (a mix of folder and
  text-resource children), performs a drag-and-drop reorder (via `@dnd-kit`'s
  documented test approach — simulating the relevant pointer/DOM events
  `DndContext`'s `PointerSensor` listens for, or, if that proves brittle in
  jsdom, driving `onDragEnd` directly with a constructed `DragEndEvent` and
  asserting the resulting dispatched actions/hook behavior — whichever this
  repo's existing test tooling supports without a new heavy dependency), and
  asserts the grid re-renders the cards in the new order immediately (FR-1).
- `organizerView.test.tsx`: the same or a sibling test asserts
  `persistReorder`'s underlying transport call (`reorderResources`/
  `resolveResourcesTransport`, mocked the way this file already mocks
  transport-level calls elsewhere, if it does — check first) fires with a
  payload reflecting the new order, confirming FR-3's persistence path is
  actually exercised, not just the optimistic Redux update.
- `organizerView.test.tsx`: a test sets an active filter (e.g. via
  `dispatchFilter`/the filter bar, matching this file's existing filter-test
  patterns from Feature 24's own test coverage) and asserts the grip handles
  render in their disabled state (`aria-disabled="true"`/no listeners) and
  that attempting a reorder in that state has no effect on order or
  persisted state (FR-5).
- `organizerView.test.tsx`: a test confirms that performing a reorder does
  not change `visibleChildren`'s filter-computed membership — i.e. the same
  set of cards is present before and after the reorder, only their order
  changes (FR-4), run against a state where a filter is NOT active (so the
  reorder itself is enabled) but where `allChildren` has more siblings than
  are currently visible under some other independent state change — or,
  more directly, simply asserts the filtered/visible set's card identities
  are unchanged post-reorder.
- `organizerCard.test.tsx`: a test confirms `isDragDisabled={true}` renders
  the grip handle in a visibly disabled state with the `dragDisabledReason`
  text associated/visible, and `isDragDisabled={false}`/omitted renders it
  enabled (FR-5).
- `pnpm --filter getwrite-frontend test:ci -- organizerView` and
  `pnpm --filter getwrite-frontend test:ci -- organizerCard` both pass in
  full, including all pre-existing tests in both files.
**Depends on:** Task 4, Task 5
**Estimate:** 5
**Done:** [ ]

---

### Task 7: Accessibility pass — drag handle + keyboard reorder path (FR-2, FR-8)
**What:** Verify the grip-icon drag handle and the full keyboard reorder
path meet `docs/standards/accessibility.md` (WCAG 2.1 AA): native keyboard
operability, visible focus indication throughout the pick-up/move/drop
sequence, and the FR-8 announcement, with an explicit axe-core check.
**Files:** `frontend/tests/a11y/organizerCard.a11y.test.tsx` (extend the
existing file, per this repo's testing standard)
**Done when:**
- A zero-axe-violations check (`runAxe`,
  `frontend/tests/a11y/helpers/axe.ts`) passes against a rendered
  `OrganizerCard` with drag-handle props set (both enabled and
  `isDragDisabled` states), extending this file's existing pattern.
- A test confirms the grip handle is keyboard-focusable (`Tab` reaches it)
  and, when enabled, carries `@dnd-kit`'s expected `role`/`aria-*` attributes
  for a sortable handle (as produced by `useSortable()`'s `attributes` —
  assert the attributes are actually applied to the handle element, not
  merely passed as a prop) — when `isDragDisabled` is true, the handle is
  confirmed to drop out of the tab order (`tabIndex={-1}` or equivalent),
  per Task 2's disabled-state requirement.
- A test confirms no bespoke focus-style className/CSS is required beyond
  the shared global `:focus-visible` token already relied on elsewhere in
  this file's existing assertions (mirroring the title-button precedent) —
  i.e. visible focus indication comes from the existing shared mechanism,
  not a new one.
- A test exercises the keyboard reorder sequence end-to-end (focus handle,
  `Space` to pick up, `ArrowDown`/`ArrowRight` to move, `Space` to drop) and
  confirms both (a) the order actually changed and (b) a non-empty
  announcement text was produced (cross-referencing Task 5's announcement
  test, not duplicating it wholesale — this test's own focus is the
  keyboard-operability + focus-visibility angle specifically, per FR-2).
- `pnpm --filter getwrite-frontend test:ci -- organizerCard` passes
  (includes the extended a11y file).
**Depends on:** Task 4, Task 5
**Estimate:** 3
**Done:** [ ]

---

### Task 8: Storybook story updates for the drag handle (FR-1, FR-2, FR-5)
**What:** Extend the existing `OrganizerCard` and `OrganizerView` story
files to demonstrate the new grip-icon handle in its enabled and
filter-disabled states.
**Files:**
- `frontend/stories/WorkArea/OrganizerCard.stories.tsx`
- `frontend/stories/WorkArea/OrganizerView.stories.tsx`
**Done when:**
- `OrganizerCard.stories.tsx` gains at least one new named export (or an
  addition to an existing one) rendering the card with the grip handle
  visible and enabled, and at least one demonstrating `isDragDisabled={true}`
  with its `dragDisabledReason` hint visible — following this file's
  existing per-state export convention (e.g. matching the `Selected`
  export's pattern from the prior feature's Task 17).
- `OrganizerView.stories.tsx` is checked for a story that already renders a
  populated, multi-child grid; if one exists, it is confirmed to still
  render without runtime errors now that `DndContext`/`SortableContext`
  wrap the grid (Storybook has no live backend, so `persistReorder`'s
  dispatch must not throw when the story's mock store/dispatch receives it —
  verify against this file's existing mock-store setup, adding a no-op
  dispatch mock if none exists yet).
- Both story files render without runtime errors under `pnpm storybook`.
**Depends on:** Task 4
**Estimate:** 2
**Done:** [ ]

---

### Task 9: Regression check against Feature 24 (filter bar) and Feature 65 (click-to-open) (FR-7)
**What:** Explicitly re-verify that filtering and click-to-open/select still
behave identically after this feature's changes, rather than relying on
Tasks 4-8's own tests to have caught every interaction incidentally.
**Files:** none (verification only; any fix lands in whichever file above
needs it)
**Done when:**
- `frontend/tests/organizerFilters.test.ts` and any existing filter-bar
  test file (Feature 24) are run and pass unchanged — confirms the filter
  predicate/reducer logic itself was never touched by this feature.
- `organizerView.test.tsx`'s pre-existing Feature 24 tests (filter
  selection narrows `visibleChildren`, "No cards match the current filters"
  empty state, filter reset on folder change) and pre-existing Feature 65
  tests (title click selects without switching view, Open button opens and
  switches view, selected-card highlight) are all confirmed still passing,
  by name, in the Task 6 test run's output — not just "the suite is green,"
  but each of these specific pre-existing cases is checked present and
  passing.
- A manual/live check (or an integration test, if one already exists per
  `appShellOrganizerTitleClickViewSuppression.test.tsx`'s precedent)
  confirms that with a filter active, clicking a card's title still selects
  it (Feature 65 unaffected) even though that same card's drag handle is
  now disabled (this feature's own FR-5) — the two behaviors are
  independent and neither regresses the other.
- `pnpm --filter getwrite-frontend test:ci -- organizer` passes in full.
**Depends on:** Task 6, Task 7
**Estimate:** 2
**Done:** [ ]

---

### Task 10: Final verification sweep
**What:** Run the full standard verification suite across everything this
feature touched, and fix any failure surfaced only at the whole-suite
level.
**Files:** none (verification only; fixes land in whichever file above
needs them)
**Done when:**
- `pnpm --filter getwrite-frontend typecheck` passes with zero errors.
- `pnpm --filter getwrite-frontend lint` passes with zero errors.
- `pnpm --filter getwrite-frontend test:ci` passes in full (not a filtered
  subset).
- `pnpm --filter getwrite-frontend build` (or at minimum a targeted check
  that `next build` isn't broken by the changes) succeeds — recommended
  given `OrganizerCard`/`OrganizerView` sit on the main app-shell render
  path.
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7,
Task 8, Task 9
**Estimate:** 1
**Done:** [ ]

---

## Summary

- Total tasks: 10
- Total estimated effort: 30 story points (1 + 3 + 5 + 5 + 3 + 5 + 3 + 2 + 2
  + 1)
- Critical path: Task 1 → Task 4 (also needs Task 2, Task 3) → Task 5 →
  Task 6 (also needs Task 5) → Task 9 (also needs Task 7) → Task 10. Task 2
  and Task 3 can run in parallel with each other and with Task 1 (none
  depend on one another); Task 7 and Task 8 can run in parallel with Task 6
  once Task 4/Task 5 land, but Task 9 and Task 10 both wait on the slowest
  of that group.
- Risks:
  - Moderate for Task 1 — exact current stable `@dnd-kit` versions could not
    be verified in this session (registry access was sandboxed); the task's
    done-when conditions require verifying and recording real versions at
    implementation time rather than guessing, and flag a peer-dependency
    mismatch against React 19 as a blocker if one surfaces.
  - Moderate for Task 4 — this is the first `@dnd-kit` integration anywhere
    in this codebase (no existing pointer+keyboard sensor precedent to
    copy, unlike the sidebar tree's `@headless-tree`-based approach); the
    main risk is `SortableContext`'s `items` list and the browsed folder's
    `allChildren` derivation drifting out of sync across a re-render
    (e.g. after a project reload), which Task 6's persistence-path test is
    written specifically to catch.
  - Moderate for Task 6 — driving a full pointer drag-and-drop sequence
    through jsdom/RTL is a known source of test brittleness for
    `@dnd-kit`-based components; the task explicitly allows falling back to
    constructing a `DragEndEvent` directly and calling `onDragEnd` if the
    simulated-pointer-event approach proves unreliable, so this risk is
    scoped and has a documented fallback rather than being open-ended.
  - Low for Task 3 — the reorder-computation logic is a direct, simplified
    port of `useResourceReorder.ts`'s already-proven `applyChildrenUpdate`
    approach (single parent only, no re-parenting), reusing the exact same
    `persistReorder`/`reorderResources` transport with no new code on the
    persistence side.
  - Low for Task 2 — purely additive, prop-driven presentational change with
    an established icon precedent (`GripVertical`) already in use elsewhere
    in this codebase; the isolated 3-point estimate reflects the disabled-
    state/hint wiring being new, not the icon itself.
  - Low for Tasks 8-10 — Storybook/regression/final-sweep tasks follow the
    exact shape and estimate convention already used for the equivalent
    tasks in `specs/features/organizer-card-icons-and-open/tasks.md`.
