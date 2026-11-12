# Task 19: Grid matrix component

Results for this task only. No browser, device, 360px render or screen-reader run was made here.

## Added

- `frontend/components/WorkArea/Views/OrganizerView/OrganizerGrid.tsx`: the matrix; takes the Task 7 `OrganizerGridResult` as a prop.
- `frontend/components/WorkArea/Views/OrganizerView/OrganizerGridCell.tsx`: one `gridcell`; also exports `organizerCellId(rowKey, columnKey)` and `organizerPlacementId(cardId, rowKey, columnKey)`.
- `frontend/tests/organizerGrid.test.tsx`: 13 tests.
- No unlisted file was edited. `OrganizerCard` is used unchanged.

## Prop contract for Tasks 20, 21, 22, 23

`OrganizerGrid` props: `model` (OrganizerGridResult), `resources` (Map card id to AnyResource), `getCardProps(cardId)` (Partial OrganizerCardProps: body, onOpen, onSelect, isSelected, folderSubtype), optional `renderCard(info)`, optional `CellComponent`, optional `label`.

- Droppable slot: `CellComponent` replaces the cell. It receives `OrganizerGridCellProps` (`rowKey`, `columnKey`, `rowLabel`, `columnLabel`, `droppableId`, `isDropTarget`, `isActive`, `onFocusCell`, `onActivate`, `placements`, `renderPlacement`) and must render `OrganizerGridCell` with them. A Task 20 wrapper calls `useDroppable({ id: droppableId, disabled: !isDropTarget })` and renders `<OrganizerGridCell {...props} droppableRef={setNodeRef} isOver={isOver} />`. `isOver` sets `data-over="true"`.
- Sortable slot: `renderCard(info)` replaces the card node. `info` = `{ cardId, placement, sortableId, cellId, resource, cardProps, alsoInOtherCellsText }`. A wrapper calls `useSortable({ id: info.sortableId })` and renders `OrganizerCard` with `cardRef`, `dragHandleAttributes`, `dragHandleListeners`, `dragStyle`, and prints `alsoInOtherCellsText` itself. The default card prints it.
- Ids: cell `cell<U+241F>row<U+241F>col`, card appearance `card<U+241F>cardId<U+241F>row<U+241F>col` (unique per appearance, since a card may sit in several cells). Cells also carry `data-cell-id` (same as `droppableId`), `data-row-key`, `data-column-key`, `data-drop-target`.
- `isDropTarget` on a cell = row line `isDropTarget` AND column line `isDropTarget` (Other values is false; a None line is true; a `none`/`order` axis line is false from the model, see below).

## Decisions (not measurements)

- Rows `none` and columns `order` lines come from the model with `isDropTarget: false` (`singleLine`), so those cells report `isDropTarget` false. Task 20 and 23 need to decide the order-drop target; this component does not special-case it.
- Roving tabindex is per cell. Buttons inside a non-active cell (card title, Open, drag handle) are set to `tabindex=-1` by an effect and restored when the cell becomes active; the active cell's inner buttons stay tabbable, so Tab from the active cell reaches its card buttons. This is an effect on DOM attributes, not a prop of `OrganizerCard`.
- Enter on the cell itself calls `onActivate` for the cell's first placement (`getCardProps(id).onOpen`). In a cell with several cards, the others open through their own Open button or title. Enter on an inner button does its own click and is not intercepted. Empty cell: Enter does nothing.
- Arrow keys, Home and End move between cells and stop at the edges (no wrap); keys act only when a cell itself is the event target.
- Duplicate text is `also in N other cells` (`cell` when N is 1), shown on every appearance of a card in more than one cell, first included (FR-5 requires it after the first).
- A card id with no resource in the map shows "A document in this cell is no longer available." instead of nothing.
- Layout: CSS-grid rows (`role="row"`, 8rem row heading, columns `minmax(14rem, 1fr)`) inside an `overflow-x-auto` wrapper, so at 360px it scrolls sideways; phone grouping is Task 21/23. A corner `columnheader` carries sr-only text "Rows". Colours are brand token classes only.

## Observed

- Red first: `cd frontend && npx vitest run tests/organizerGrid.test.tsx` before the components existed: 1 file failed, "no tests" (import transform error, modules missing).
- After: `npx vitest run tests/organizerGrid.test.tsx tests/organizerCard.test.tsx tests/organizerView.test.tsx`: 3 files, 74 tests passed (13 new, 18 organizerCard, rest organizerView). `organizerGrid`, `organizerCard` and `organizerGridModel.test.ts` together: 3 files, 55 passed. `organizerFolderCards.test.tsx`: 7 passed.
- `npx eslint components/WorkArea/Views/OrganizerView tests/organizerGrid.test.tsx`: 0 errors; 1 warning in `OrganizerCard.tsx` (`any`, not edited, pre-existing).
- `npx tsc --noEmit`: one error, `src/lib/api/organizer-arrangements.ts(171,12)` cannot find module `native-organizer-arrangements-backend`. That file is not part of this task; no file of this task has a type error. (Cause of the missing module not investigated; probably a backend from another task not yet landed.)
- `npx prettier --write` run on the three files.

## Not verified

- The a11y tests were not run.
- No axe run on the grid; no screen-reader check; focus ring and dark-mode contrast not looked at.
- Performance with many cards; `aria-rowcount`/`aria-colcount` correctness in a reader.
- Whether a drag layer wrapping `OrganizerGridCell` and `OrganizerCard` works with these slots (Task 20).
