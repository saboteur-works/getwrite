# Task 9: Pure order-drop model

Results for this task only.

## What was added

- `frontend/components/WorkArea/Views/OrganizerView/organizerOrderDrop.ts`: `resolveOrderDrop(input)` returning `reorder` (with `newChildIds`, the argument the function from `useOrganizerCardReorder` takes), `noop`, or `refused` (reason and message). Exported message constants.
- `frontend/tests/organizerOrderDrop.test.ts`: 15 tests.

## Observed

- Before the module existed: `cd frontend && npx vitest run tests/organizerOrderDrop.test.ts` reported 1 file failed, no tests collected (module missing).
- After: 1 file passed, 15 tests passed.
- `cd frontend && npx tsc --noEmit`: no output.
- `cd frontend && npx eslint` on the two files: no output.
- A test passes the result's `newChildIds` into the real `useOrganizerCardReorder` function (resourcesSlice mocked, as in that hook's own test) and checks the `persistReorder` payload: dense `orderIndex` 0..4 over all five siblings, `folderId` the browsed folder, empty `folderOrder`.
- A test reads the module source and finds no import of react, react-redux, @reduxjs or @dnd-kit, and no `randomUUID`.

## Mapping rule (design choice, not a spec quote)

The band's cards are a subsequence of the siblings. The dragged card moves to the drop target's place in the band; the new band order is written back into the slots the band's cards held in the full order. Siblings outside the band keep their slots. Example tested: siblings a..e, band a,c,e, drop a on e gives c,b,e,d,a.

## Messages (text chosen here; the spec fixes only the third)

- Use a field drag: "Use a field drag to change a card's row. Dropping on order only reorders within a row."
- Do it in the tree: "Moving a document between folders is done in the tree."
- Flattened and smart-folder reasons: own sentences, each saying to reorder in the tree.
- Filter: `Clear filters to reorder cards` (same text as `DRAG_DISABLED_WHILE_FILTERED_REASON` in `OrganizerView.tsx`; the constant there is not yet imported from the new module).

## Refusal order

source (smart-folder, then descendants), filter, malformed input (duplicates, active card not in its band), other row, other folder (active or target not a sibling of the browsed folder). A drop on itself or on no card is `noop`.

## Not done / not verified

- Not wired into `OrganizerView.tsx` or any drag handler (later tasks).
- The full test suite and `pnpm lint` were not run; only the new files were linted.
- Dragging in a real browser was not exercised.
