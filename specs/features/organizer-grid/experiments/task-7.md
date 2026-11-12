# Task 7: Pure grid model

Results for this task only. No card-cap figure, device run or render measurement was made here.

## What was added

- `frontend/components/WorkArea/Views/OrganizerView/organizerGridModel.ts`: `buildOrganizerGridModel(input)` and `buildOrganizerPhoneGroups(model)`, with the input and result types. It imports `organizer-grid-types`, `types` (type only), `field-subtype-scope` (`normalizeSubtypeLabel`) and `organizerGridCap` (`applyCardCap`).
- `frontend/tests/organizerGridModel.test.ts`: 24 tests.
- The shared contract in `organizer-grid-types.ts` was not changed. The result type `OrganizerGridResult` extends `OrganizerGridModel` in the new module with `isSingleSequence`, `hasColumnValues` and `shownCardIds`.

## Choices the task text left open (decisions, not measurements)

- Input per axis: `{ axis, list, values }`, where `values` is a map from card id to the raw stored value and `list` is the axis value list (null for `none` and `order`). Cards come in tree order; the cap is a required `number | null` parameter passed to `applyCardCap`.
- Rows `none` give one row keyed `all`; columns `order` give one column keyed `order`. Rows none with columns order is therefore one cell holding all cards in tree order (`isSingleSequence: true`). With rows a field and columns order, each row's cell is one sequence.
- Axis lines are ordered list values, then "Other values" (only when a card lands there, or when the list supplies the line), then "None" (always, appended if the list lacks it). Other values is not a drop target.
- A value matches a line by key equality; the subtype axis compares through `normalizeSubtypeLabel`. A reference matches by id; a null id or an unmatched value goes to Other; a blank string, null, absent or empty array goes to None.
- `appearance` is numbered in grid order (row, then column) among a card's cells, not in tree order; within a cell, placements are in tree order. `alsoInOtherCells` is the number of other cells holding the card, set on every placement of it.
- Phone: one group per row line, empty groups kept. Per card a `columnLabels` list names its column lines in that group (empty when columns carry no values, i.e. order or none). `appearance` and `alsoInOtherGroups` count row groups.

## Observed

- Tests first: `cd frontend && npx vitest run tests/organizerGridModel.test.ts` before the module existed: 1 file failed, no tests collected (module missing).
- After the module: 1 file passed, 24 tests passed. With `tests/organizerGridCap.test.ts`: 2 files, 33 tests passed.
- `cd frontend && npx tsc --noEmit`: exit 0, no output.
- `cd frontend && npx eslint` on the two new files: exit 0, no output.
- `npx prettier --write` on the two files after an initial `--check` warning; tests re-run green afterwards.
- Covered by one or more tests each: status, subtype, select, multiselect, resource-ref and multi-resource-ref axes; rows none and columns order; None always present and last when empty; Other values before None, labelled "Other values", not a drop target; a multi-value card in each cell in tree order with later appearances and `alsoInOtherCells`; empty grid; cap counting cards, keeping tree order, reporting `notShownCount`, null cap, bad cap throws `RangeError`; phone groups with empty groups, None and Other, labels, duplicates, rows none; a source-text check that no `react`, `react-dom`, `react-redux`, `redux`, `@reduxjs/toolkit` or `@dnd-kit/*` import exists.

## Not verified

- Behaviour with the real axis value lists of Task 6 (not built here; fixtures were used).
- Behaviour on a number or boolean stored value: handled by string conversion, covered by no test.
- Performance on large card counts: not measured.
- No React component consumes the model yet (Tasks 19, 21, 23).
