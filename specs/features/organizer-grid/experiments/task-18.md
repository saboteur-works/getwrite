# Task 18: Toolbar, Rows and Columns pickers and source select

Results only.

## Measured

- Test file `frontend/tests/organizerGridToolbar.test.tsx`, written first. Before the component existed the run reported "Test Files 1 failed, no tests" (import failure). After: 15 passed (15).
- `pnpm typecheck` (tsc --noEmit): clean. `eslint` on the two new files: clean. `prettier --check`: clean.
- One lint error (naming-convention, boolean needs a prefix) and one TS7006 in the test were fixed on the first run.

## Done-when clauses and the test that pins each

- Rows offers none and the passed fields (not order): "Rows offers none and the passed fields".
- Columns offers order and the passed fields (not none): "Columns offers order and the passed fields".
- A field chosen for one axis is not offered for the other: two tests, one per direction.
- Source select offers "This folder", "This folder and subfolders" and each passed smart folder: "source select offers...". Choosing each reports an `OrganizerSource`; folder sources use the passed `folderId` (the browsing folder).
- Accessible names: each select is wrapped in a `<label>` with visible text (Source, Rows, Columns); test asserts `toHaveAccessibleName` on all three.
- Keyboard: native `<select>` elements; test tabs through Source, Rows, Columns in order.
- No colour-only state: selection state is the select's text value; label text is visible. Test asserts no hex and no `red` in the markup.
- 360px: class assertions only (`flex-wrap` on the group, `min-w-0 max-w-full` on each select). This is not a layout measurement; no browser run was made.

## Handling of Task 6

`organizerAxisFields.ts` is absent from this tree. The toolbar does not import it. It takes `fieldChoices: { axis: OrganizerAxis; label: string }[]` (fields only) and applies the "not offered for the other axis" exclusion itself, so it works with the output of Task 6's `getAxisChoices` once the caller maps the field entries (excluding the none and order entries) into `fieldChoices`. The caller must pass fields without the other-axis exclusion or with it; both are safe. `OTHER_VALUES_LABEL` and `NONE_LABEL` are not used (the "None" and "Order" option labels are local strings in the toolbar, for the picker's leading option, not axis value lines).

## Choices to note

- A saved smart-folder source whose query is not in the passed list gets an option "Smart folder (not found)" so the select does not show a blank; the grid's own missing-source message is a later task.
- No Storybook story and no axe test were written; they are named in FR-19 for the whole toolbar but are not in this task's declared files. Not verified: axe, story, Pixel/phone behaviour.
- No wiring into `OrganizerView.tsx`; the component is not yet mounted.
