# Task 49: Accessibility and keyboard tests (FR-23)

Test file: `frontend/tests/component/CitationsA11y.test.tsx` (31 tests). No production file was edited.

## Components under test (found with `git log --grep`)

- Citation fields editor: `components/Sidebar/CitationFieldsEditor.tsx` (Tasks 20, 45; section wrapper Task 21).
- Compile dialog citations switch and style choice: `components/common/CompilePreviewModal.tsx` (Tasks 27, 31).
- Pre-run warning: `components/common/CitationCheckDialog.tsx` (Task 31).

## Observed

- Targeted run: `pnpm vitest run tests/component/CitationsA11y.test.tsx` gave 31 passed, 0 failed.
- `pnpm typecheck`: exit 0 (after two implicit-any fixes in the new test file).
- `pnpm lint`: 0 errors (459 warnings repo-wide, all in other files); `eslint` on the new file alone printed no problem.
- No component failed an axe or keyboard check, so there is no finding.

## What the tests pin

- axe (`runAxe`, `color-contrast` and `aria-hidden-focus` disabled by the helper; `region` also disabled by the call, as in other a11y tests, because the parts are mounted without page landmarks): the editor with each of the four reference types holding stored values; each type chosen in turn on the empty form; a failed read; a failed save and a saved notice. The compile dialog with the switch usable, switched on, and disabled for a text format, on Android, and with config unknown (the two stated reasons). The warning dialog with a removed Source, a missing detail, a could-not-be-checked Source, all three together, and a failed check.
- Keyboard: Tab reaches the editor's Add buttons and title; Enter on Add and Space on Save run them and call the write; Space toggles the switch; Tab moves from the switch to the style choice once it is enabled; a disabled switch is skipped; in the warning, Tab stays inside the dialog and reaches Cancel and Proceed, Enter runs each, Escape cancels. A compile started by keyboard alone opens the warning, focus moves inside it, and Proceed sends the citations option.
- Text, not colour: each state line starts "Removed:", "Incomplete: missing ...", "Could not be checked:"; the summary "N citations, M Sources incomplete" is text; the list has the name "Sources with incomplete citations"; a failed save or read starts "Error:"; the disabled reason is text tied by `aria-describedby`; the date format hint is text. No class matching red appears in the warning markup (class-name check only).
- Live regions: loading, still-needs, saved and the switch reason are `role="status"`; failures (read, save, date, check) are `role="alert"`; no failure is in a status region.

## Failing-first

The components were committed before this task, so the tests were written after them and could not be run red against missing behaviour. To show the axe helper rejects the markup these tests guard against, a temporary file (deleted) rendered an unlabeled checkbox and an unlabeled select; `runAxe` threw "axe-core found ... violation(s)" for it and the temporary test passed. That shows axe can fail here; it does not show every other assertion can fail, and no broken variant of the real components was made (production files were out of scope).

Two first-run failures were test errors, not findings: `getByRole("status")` matched two regions in the compile dialog (the saved-defaults panel also has one), so the tests now read the citations controls' own region through `data-testid="compile-citations-controls"`.

## Not verified

- A screen-reader run (none made; no announcement, reading order or focus announcement was heard).
- Colour contrast in either colour mode (jsdom cannot compute it; a Chromium strict-axe pass over the stories is still needed).
- Real-browser keyboard behaviour: jsdom does not change a `<select>` value with arrow keys, so choosing a reference type or style is tested by focus and `selectOptions`, not by arrow-key operation; real focus trapping and focus return after the warning closes were not checked.
- Storybook stories and their axe pass for these components (FR-23 asks for them; not part of this task's Files).
- The Android runtime, the Start Page route and a paired device.
- The "no red" check is a class-name search, not a computed-colour check.
