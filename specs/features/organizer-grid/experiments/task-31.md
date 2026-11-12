# Task 31: Arrangement controls component

Results of this task only (FR-14, FR-15, FR-19).

## Built

- `frontend/components/WorkArea/Views/OrganizerView/OrganizerArrangementControls.tsx`: presentational toolbar controls.
- `frontend/tests/organizerArrangementControls.test.tsx`: 16 cases (rows of the `it.each` count separately).
- `frontend/tests/a11y/organizerArrangementControls.a11y.test.tsx`: 4 axe cases (closed, open with an unavailable arrangement, name form with an error, delete confirmation open).

## Prop contract (`OrganizerArrangementControlsProps`)

- `arrangements: OrganizerArrangement[]`: the list as shown; the component never changes it.
- `selectedId: string | null`: applied id; `null` (or an id not in the list) is shown as `Default`.
- `availability: Record<string, OrganizerArrangementAvailability>`: per id. A missing or `pending` entry is applicable and shows no reason; only `unavailable` shows its `message` ("Unavailable: <message>") and disables Apply.
- `isChangedSinceApplied: boolean`: shows "Changed since applied", else "As applied".
- `onSelect(id: string | null)`: one click on Apply; `null` is the Default row.
- `onAdd(name): Promise<OrganizerArrangementAddResult>`: name already trimmed; the hook composes the draft (source, rows, columns).
- `onRename(id, name): Promise<OrganizerArrangementRenameResult>`: name already trimmed.
- `onDelete(id): Promise<OrganizerArrangementDeleteResult>`: called after the confirmation dialog.
- A result with `ok: false` shows its `message` in a `role="alert"` line (form kept open for add and rename, list unchanged); a rejected promise shows a generic message.
- Blank, over 100 characters (`ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH`) and duplicate (trim, case-fold, excluding the arrangement being renamed) are refused client-side with a message and no callback call.

## Measurements

- Before the component existed, both test files failed to load (`no tests`), the expected red.
- After: `npx vitest run` on the two files: 2 files, 20 tests passed.
- `pnpm typecheck`: no errors. `npx eslint` on the three new files: no output. `npx prettier --write` applied to them.

## Not verified

- 360px fit: not measured (jsdom has no layout). The test asserts only that a `flex-wrap` container exists; rows use `flex-wrap`, `min-w-0` and a truncating name. Needs a Chromium or device check.
- `color-contrast` is disabled in `runAxe` (jsdom); contrast is unchecked. Text uses `text-gw-primary` and `text-gw-secondary` tokens only, no hex, no red.
- FR-19 asks for a Storybook story; none is in this task's declared files, so none was added.
- Focus: after a save or cancel the focus returns to the Arrangements toggle; not asserted by a test.
- `ConfirmDialog` (shared) is used for delete; the a11y helper already disables `aria-hidden-focus` for Radix dialogs.
- Not wired into `OrganizerView` (Task 32 supplies the hook and data).
