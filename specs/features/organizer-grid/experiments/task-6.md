# Task 6: Pure axis model: offered fields and axis values

Results for this task only.

## What was added

- `frontend/components/WorkArea/Views/OrganizerView/organizerAxisFields.ts`: `getAxisChoices(input)` (picker entries) and `buildAxisValueList(input)` returning the contract's `OrganizerAxisValueList` (`organizer-grid-types.ts`); constants `OTHER_VALUES_LABEL`, `NONE_LABEL`.
- `frontend/tests/organizerAxisFields.test.ts`: 24 tests.

## Observed

- `cd frontend && npx vitest run tests/organizerAxisFields.test.ts`: first run, before the module existed, 1 file failed with no tests collected (module missing). After the module was written: 1 file passed, 24 tests passed.
- `cd frontend && npx tsc --noEmit`: no output.
- `cd frontend && npx eslint` on the two files: no output.
- `grep` for `react`, `react-redux`, `@reduxjs`, `@dnd-kit` imports in the module: no match.
- Behaviours covered by tests: select, multiselect, status, subtype, resource-ref, multi-resource-ref offered; text, number, date, boolean, deprecated, `notes` and the built-in `status` field (as a field) not offered; `order` only on Columns; the field chosen on the other axis (and status/subtype axes) is left out; folder fields (`getFieldsOfferedOnFolder`) only in the children source; values in `options`, `statuses`, `subtypes` order, then Other values, then None; reference axis grouped by id with first saved name in first-appearance order; `{ id: null, name }` gets no line and is not a drop target; empty field, field missing from the schema, and status/subtype with empty lists give only Other and None; keys unique when an option is named `other` or `none` or repeats.

## Choices made where the spec was silent (assumptions, not measurements)

- Input shape: `getAxisChoices` takes `documentSubtypes` and `folderSubtypes` (one per card), because a restricted field (`appliesTo`) is offered only if a card of that kind can show it (`isFieldVisibleForSubtype`, `getFieldsOfferedOnFolder`). An empty `documentSubtypes` is read as one document with no subtype.
- `buildAxisValueList` takes `presentValues` (the axis field's stored value per card, tree order); only a reference axis reads it.
- `none` and `order` axes return `values: []`; the Other and None lines are present for every other axis, including one with no values.
- A line key is the raw value (reference: the id), prefixed `value:` only when it would equal `other` or `none`. The grid model (Task 7) must take keys from the lines, not rebuild them from raw values.
- Duplicate options within a list produce one line.

## Not verified

- Interaction with Task 7's `organizerGridModel.ts` (built concurrently); the type shape returned is the contract's.
- No component wiring (later tasks).
