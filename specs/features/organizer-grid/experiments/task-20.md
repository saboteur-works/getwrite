# Feature 109, Task 20: drag hook (results only)

Date: 2026-11-11. File: `frontend/components/WorkArea/Views/OrganizerView/useOrganizerGridDrag.ts`. Tests: `frontend/tests/useOrganizerGridDrag.test.tsx` (jsdom, mocked rects via a `data-rect` attribute, as in Task 3). jsdom is not evidence about touch, a device or real layout.

## Order of work
Tests were written first; the first run was red because the module did not exist (`Failed to resolve import ... useOrganizerGridDrag`). Then the hook. Five tests failed on the first run against the hook, all on the test side: (1) the live-region test expected "Picked up" but the text is replaced at once by the over announcement ("Card A is over row Draft, column One."), measured in the DOM dump; (2) the order-mode tests failed because the test card was only a draggable, and an order drop needs the card registered as a droppable too; (3) the focus test moved focus after the callback had already run. The tests were corrected; the hook logic was not changed for them. After that, 17 of 17 pass.

## API
`useOrganizerGridDrag(options)` returns `{ sensors, collisionDetection, announcements, activeCardId, dndContextProps }`; spread `dndContextProps` into `<DndContext>`.

Options: `rows`, `columns` (`OrganizerAxisValueList`; use `{ axis: "none" | "order", values: [] }` for those axes), `fields`, `statuses`, `subtypes`, `getCard(id) => OrganizerDropCard | undefined`, `getCardTitle(id)`, `orderDrop?` (`source`, `filterActive`, `siblingIds`, `getRowCardIds(rowKey)`; needed when the columns axis is `order`), the callbacks, and an optional `focusCard(id)`.

Callbacks. The contract text in tasks.md says `onRefuse`; the lead's message said `onRefused`. The contract name is used.
- `onFieldDrop(input: OrganizerFieldWriteInput, ctx: { card, from, to, cellLabel })`: the `planOrganizerDrop` payload.
- `onOrderDrop(newChildIds: string[])`: the `resolveOrderDrop` result, the shape `useOrganizerCardReorder` takes.
- `onRefuse(message: string)`: the refusal text from either model, or the fixed text "This card could not be moved." for an unknown card or missing order input.
A no-op and a drop outside the cells call nothing.

Ids exported for Tasks 19 and 23: `cardDraggableId(cardId, rowKey, columnKey)` (one per appearance), `cellDroppableId(rowKey, columnKey)`, `parseCardDraggableId`, `parseCellDroppableId` (parts are URI-encoded, so keys with colons round-trip; tested). Components must: put `useDraggable` on each card with that id and attach `setActivatorNodeRef`, `attributes` and `listeners` to the drag-handle button; make each cell `useDroppable` with its cell id; in order mode also register each card as `useDroppable` with the same card id (the targets there are cards). Attributes for the default focus return: `data-organizer-card-id` on the card element, `data-organizer-drag-handle` on the handle.

Other exports: `createCoordinateGetter(prefix)` (the Task 3 getter, parameterised by id prefix and skipping the active id), `ORGANIZER_GRID_DRAG_DISTANCE` (8).

Modes: field mode targets only `cell:` droppables; order mode (columns axis `order`) targets only `card:` droppables. A consequence of that design: in order mode an empty row has no card to target, so the keyboard cannot reach it.

Roving keys: `activeCardId` is non-null during a drag; the grid's roving arrow handler must return early then (Task 3 measured that both handlers otherwise see each press). Not exercised here, since the roving handler is not part of this task.

## Measured (jsdom)
- Sensors: PointerSensor options are exactly `{ activationConstraint: { distance: 8 } }`; the KeyboardSensor has a `coordinateGetter` function.
- Space, Right, Right, Down, Space from A in (draft, One): `onFieldDrop` once, with changes status set `final` and field `act` set `Three`, and `ctx.cellLabel` "row Final, column Three".
- Right onto an occupied cell: one change (`act` = Two). Escape: no callback. Space, Space: no callback. Drop on the Other values row: `onRefuse("That row or column is not a value this field allows.")`, no write.
- Order mode: Down, Space from A gives `onOrderDrop(["B","A","C"])`; a drop on a card of another row gives the model's other-row text; an active filter gives "Clear filters to reorder cards".
- Announcements (called directly, and once through the real live region): pick-up, over (cell by row and column names, or "not over a cell"), drop, own-cell no change, outside no change, cancel, refusal with its text.
- Focus: the injected `focusCard` is called with the card id after a field drop. Mutation check: with the hook's focus call removed, only the injected-focus test failed; the default-focus test (which checks the handle regains focus after focus was moved to another card) still passed. So that test does not show the hook's default path is what restores focus in jsdom. dnd-kit's own keyboard focus restore (read in `core.esm.js`, a requestAnimationFrame to the activator) would also produce it. The default path is therefore not tested on its own, and pointer drags, where dnd-kit does not restore focus, were not exercised.

## Not verified
Touch, pointer drag in a browser, a real screen reader, scroll while dragging, cells of unequal size, DragOverlay, a card remounted in another cell after a successful write (Tasks 22 and 23 own that focus), and the hook inside the real grid (Tasks 19 and 23).

## Checks (from `frontend/`)
- `pnpm exec vitest run tests/useOrganizerGridDrag.test.tsx`: 17 passed.
- `pnpm exec eslint` on the two files: no output.
- `pnpm typecheck`: one error, `src/lib/api/organizer-arrangements.ts(171,12) TS2307` (missing `native-organizer-arrangements-backend`), in a file this task did not touch; no error in the task's files.
