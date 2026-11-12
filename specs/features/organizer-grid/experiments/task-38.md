# Task 38: Grid a11y and keyboard tests (results only)

Date: 2026-11-11. Files: `frontend/tests/a11y/organizerGrid.a11y.test.tsx` (5 tests), `frontend/tests/organizerGridKeyboard.test.tsx` (14 tests, one `it.fails`). Components were not edited. Everything here is jsdom: not device evidence, not a browser run, not a screen-reader run. jsdom has no layout (cell rects are mocked from row and column index) and cannot check colour contrast (`runAxe` disables `color-contrast`); contrast is not verified by this task.

The drag layer in the keyboard test (a `useDroppable` cell wrapper using `cellDroppableId`, a `useDraggable` card wrapper using `cardDraggableId`, the handle carrying `data-organizer-drag-handle`) is a stand-in written for the test. It is not `OrganizerView`'s layer (Task 23, concurrent). The global-key handlers are `window` listeners written for the test, not the app's real Esc and Cmd/Ctrl+K handlers.

## Measured

- `pnpm exec vitest run` on this task's two files plus `organizerGrid`, `useOrganizerGridDrag` and `organizerPhoneGroups` tests: 5 files, 56 passed, 1 expected fail.
- Axe (no violations, `region` disabled): grid with None row and column, Other values row, a card in two cells and an empty cell, as stock cards and inside a `DndContext` with draggable cards and droppable cells; phone groups with a duplicate and an empty group; phone groups with Rows none.
- Keyboard, all passing: one tab stop among 12 cells; empty cell is a focusable gridcell named "Draft, Two, empty"; arrows move focus between cells including into empty ones and stop at the edges; Home and End; an arrow inside a card button does not move the cell; Enter opens the first card of the focused cell and does nothing in an empty one.
- Drag by keyboard (Space, ArrowRight, Space from the handle of Doc a): live-region texts in order "Doc a is over row Draft, column One.", "Doc a is over row Draft, column Two.", "Doc a dropped on row Draft, column Two."; one `onFieldDrop` with `act` set to `Two`. The pick-up text "Picked up Doc a. Use the arrow keys to move between cells, Space to drop, Escape to cancel." was not seen in the live region (replaced by the over text before a MutationObserver read it, as Task 20 recorded); it is asserted from the hook's `announcements.onDragStart` called directly, not from the DOM.
- Refusal (Down, Down, Space onto Other values): `onRefuse` once with "That row or column is not a value this field allows.", no write; texts include "Doc a is over row Other values, column One." and end "Doc a was not moved. That row or column is not a value this field allows."; focus is on Doc a's handle and the card is in its original cell.
- Escape cancels: last text "Move of Doc a cancelled. No change.", no callback, card unmoved, focus on Doc a's handle.
- A card in two cells lifts from its second appearance with `from` = that cell.
- Global keys: from a focused cell, Escape, Ctrl+K and Cmd+K reach a window listener and none is default-prevented. During a keyboard drag, Ctrl+K reaches the window listener, and Escape reaches it and also cancels the drag (both happened). Whether the app's real Esc handler should act while a drag is active was not examined.
- No colour-only or red state is asserted: state is read from roles, names and text.

## Failed clause (observed, cause not established)

FR-11 and this task require focus on the moved card after a successful drop. When the write is applied and the card re-renders in its new cell (the test's harness rebuilds the model on `onFieldDrop`), `document.activeElement` is `<body>` 50 ms after the drop, not the moved card's handle. The test `puts focus on the moved card's handle in its new cell after a drop` is written as `it.fails`: it passes while this holds and turns red when focus is kept. When the card is not remounted (`applyDrop: false`, same element), focus is on its handle after the drop (passing test). Hypothesis, not tested: the hook's default focus call (`useOrganizerGridDrag.ts`, `defaultFocusCard` inside `onDragEnd`) runs before the re-render, so it focuses the old element, which is then removed; dnd-kit's own restore to the activator would also hit the removed node. An experiment that would settle it: run the same test with the harness calling `focusCard` in an effect after the move. Owner of the fix is Task 22/23 or a follow-up; no component was edited here.

## Observations about the components (not clauses)

- Task 19's note says a cell wrapper calls `useDroppable({ id: droppableId, disabled: !isDropTarget })`. The hook parses ids of the form `cell:<row>:<col>` (`cellDroppableId`), not the grid's `droppableId` (`cell<U+241F>...`), so the wrapper must use `cellDroppableId`. With `disabled: !isDropTarget`, Other values cells could not be reached by the keyboard drag and the refusal path would not occur; the test does not disable them.
- `OrganizerCard`'s drag handle has no `data-organizer-drag-handle`; the hook's default focus return falls back to the card element. The test wrapper adds the attribute through `dragHandleAttributes`.

## Mutation checks (component edited temporarily, restored, diff against a backup showed no change)

- Removed `next?.focus()` in `OrganizerGrid` arrow handling: 2 tests failed (arrows, Home/End).
- Removed `onActivate(first)` in `OrganizerGridCell`: the Enter test failed.
- Changed `role="grid"` to `list`: 3 a11y tests failed (`aria-required-children`, `aria-required-parent`).
- Changed `role="gridcell"` to `cell`: only the structure test failed; axe did not flag it, so axe does not discriminate that change.
- Removed the hook's `(o.focusCard ?? defaultFocusCard)(...)` call: no test failed. The focus-after-drop tests do not discriminate the hook's focus call (dnd-kit restores focus to the activator in the no-remount case; same finding as Task 20).
- Not mutation-checked: the announcement texts, the global-key tests and the refusal text (each asserts exact strings produced by the hook; removal of the global-key handling was not tried).

## Checks (from `frontend/`)

- `pnpm typecheck`: no output beyond the script banner (exit 0 in the last run).
- `pnpm exec eslint` on the two test files: no output.
- `pnpm exec prettier --write` on both files.

## Not verified

Storybook story and `@storybook/addon-a11y` (not in this task); colour contrast; focus ring visibility; a real screen reader; real layout and 360px; touch; a hardware keyboard on a device; the Organizer view's own drag layer and focus after a drop in the integrated view (Task 23); `pnpm lint` over the whole project (only the two files were linted); the full test suite.
