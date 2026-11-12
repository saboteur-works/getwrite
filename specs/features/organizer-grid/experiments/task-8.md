# Task 8: pure drop model (results)

Module: `frontend/components/WorkArea/Views/OrganizerView/organizerDropModel.ts` (`planOrganizerDrop`).
Tests: `frontend/tests/organizerDropModel.test.ts`, written first; first run failed because the module did not exist (import error, no tests collected).

## Measured (frontend/, 2026-11-11)

- `pnpm vitest run tests/organizerDropModel.test.ts`: 1 file, 34 tests passed.
- `pnpm typecheck`: no errors (after fixing one generic-typing error in `setOrClear`).
- `npx eslint` on the module and the test: no output (clean).
- Imports of the module: `field-subtype-scope`, `organizer-grid-types`, `types` only (no React, Redux, `@dnd-kit`).

## Behaviour covered by tests

- Same cell: `noop`. Changes only on a `none` or `order` axis: `noop`.
- Drop across both axes: one `write` with two changes (status, then field).
- None: status and select field give `op: "clear"`; subtype gives `clear`.
- Multiselect: partial move keeps other values, list order kept; cell to None removes one value, clears when none remain; None to value adds; already-held target is `noop`; dragging from Other values removes the values outside the list.
- References: single writes `{ id, name }`; multi moves only the dragged-from reference; `maxSelections` refused past the limit, allowed when a move stays at it; null-id reference is not a target.
- Refusals (reason): Other values or unknown line `value-not-in-list`; select value not in `options` and status not in `config.statuses` `value-not-in-list`; out of scope (`isFieldVisibleForSubtype`) `field-out-of-subtype-scope`; locked field `field-locked`; subtype `subtype-not-in-list` (`isLabelInList`); missing field `unknown-field`; non-axis field type, same field on both axes, status axis for a folder card `invalid-input`. A refusal on either axis refuses the whole drop. Messages contain no input text (test with a marker string).
- A subtype is written in the project list's own spelling (`"  villain "` writes `"Villain"`).

## Decisions made where the spec was silent (assumptions, not verified against the owner)

- "Locked field the sidebar does not let a writer edit": read from `MetadataSidebar.tsx`. The sidebar renders a control for every locked built-in with an axis type that it has a specialised control for (`status`, `pov`) and the generic control for any other select/ref. The only locked fields without an axis-capable control are the built-ins `synopsis`, `notes`, `storyDate`, `storyDuration`, `storyEndDate`, none of which are axis types. The model therefore refuses any `locked` field whose key is not `status` or `pov`. Whether a locked custom field exists in practice was not measured.
- Feature-flag hiding (POV or Timeline switched off hides the sidebar control) is not modelled; the model has no flag input.
- Dragging a multi value out of Other values removes every stored value not in the field's list (the Other cell groups them).
- Multi-reference order: new reference appended after the kept ones (a reference has no list order).
- A status axis drop for a folder card is refused (`invalid-input`); folders have no status.
- Deprecated fields are not checked here (the axis picker does not offer them, Task 6).

## Not verified

- Integration with the axis value lists produced by Task 6 and the grid model of Task 7 (those lanes ran concurrently); the model relies only on the contract's `OrganizerAxisValueList` shape (`key`, `kind`, `isDropTarget`, `value`).
- No unlisted files were edited.
