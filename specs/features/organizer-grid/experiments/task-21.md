# Task 21: Phone grouped lists component

Results for this task only. No device run, no real-width render and no screen-reader check was made.

## What was added

- `frontend/components/WorkArea/Views/OrganizerView/OrganizerPhoneGroups.tsx`: presentational component. It does not import OrganizerCard (that card has a fixed `h-48` and a drag handle, neither wanted in a phone list); it renders its own list item per card.
- `frontend/tests/organizerPhoneGroups.test.tsx`: 8 tests.
- No unlisted file was edited.

## Prop contract (for Task 23)

`OrganizerPhoneGroups` (default export), props `OrganizerPhoneGroupsProps`:

- `groups: OrganizerPhoneGroup[]`: output of `buildOrganizerPhoneGroups(model)`.
- `resourcesById: Record<string, AnyResource | undefined>`: lookup by card id. A card whose resource is absent still renders as "Untitled".
- `rowsNone?: boolean` (default false): when true, all groups' cards render as one list with no heading or group wrapper (as the default list renders today in having no group chrome).
- `selectedId?: string | null`: marks that card with `aria-current` and the text "Selected".
- `onSelect?(cardId)`: title button.
- `onOpen?(cardId)`: Open button (rendered only when supplied), `aria-label="Open <title>"`.

## Decisions (not measurements)

- Group: `<section role="group" aria-labelledby>` with an `h3` "Label (count)"; an empty group shows "No documents in <label>". Cards are `ul > li`.
- Column label text: "Column: A, B" when `columnLabels` is non-empty.
- Same-document marker: "Same document, also in N other group(s)" on every placement when `alsoInOtherGroups > 0`.
- 44px hit class: no existing phone-control class was found by grep of `components/` and `styles/` (only the timeline pill min-width and title bar height are 44px). The component uses the Tailwind classes `min-h-11 min-w-11` (2.75rem = 44px) on every button. This is a choice, not a match with another control.
- Text uses `text-gw-primary` / `text-gw-secondary` and `border-gw-border`, `bg-gw-chrome` tokens as OrganizerCard does; no hex, no red.
- Heading level 3 is assumed to sit under the view's own headings; Task 23 should check the level against the surrounding page.

## Observed

- Tests first: `npx vitest run tests/organizerPhoneGroups.test.tsx` before the component existed: 1 file failed, no tests collected (module missing).
- After the component: 1 file passed, 8 tests passed.
- `npx eslint` on both files: exit 0, no output. `npx prettier --check` on both: clean.
- `npx tsc --noEmit` in `frontend/`: after fixing an implicit-any in my test, one error remains, `src/lib/api/organizer-arrangements.ts(171,12): TS2307 Cannot find module '../../store/transport/native-organizer-arrangements-backend'`. That file is not in this task; it belongs to the arrangements transport work. No error is reported in the two files of this task.

## Not verified

- Rendering at 360px, dark mode contrast, and the real size of the buttons (jsdom does not apply Tailwind; the test checks the class name only).
- axe run: none made (no a11y test file declared for this task).
- Behaviour against a model produced by `buildOrganizerGridModel` end to end (the tests use hand-built groups of the `OrganizerPhoneGroup` type).
- Keyboard order and screen-reader announcement of the group headings.
