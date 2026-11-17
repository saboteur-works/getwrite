# Task 24: split dialog component (FR-12, FR-19)

Files: `frontend/components/Split/SplitDialog.tsx`, `frontend/tests/component/SplitDialog.test.tsx`, `frontend/tests/component/SplitA11y.test.tsx`, `frontend/stories/Split/SplitDialog.stories.tsx`, this record.

## Failing run (tests first)

- `pnpm exec vitest run tests/component/SplitDialog.test.tsx tests/component/SplitA11y.test.tsx` (from `frontend/`) with the two test files written and no component: 2 files failed, "no tests" (import of `components/Split/SplitDialog` could not be resolved).

## Green runs

- Same command after implementing: 2 files passed, 27 tests passed (SplitDialog 18, SplitA11y 9).
- `pnpm typecheck` (frontend): passed after typing the two mocks in `SplitDialog.test.tsx` (first run: 2 type errors in the test file, fixed).
- `pnpm lint` (frontend): first run 1 error in the component (`anyAnchored` failed the boolean-prefix naming rule), fixed by renaming to `hasAnchored`; ESLint over the four new files then reported nothing. The full `pnpm lint` also prints about 459 warnings in other files, none introduced here.
- `pnpm --filter getwrite-frontend check:no-hex`: "No hardcoded hex violations found."
- `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck`: passed.

## What was built

- `SplitDialog` is presentational. Props: `isOpen`, `preview` (`SplitPreviewData | null`), `refusalReason?`, `isSubmitting?`, `failure?`, `status?`, `onConfirm(choice: SplitCarryOverChoice)`, `onClose`. It fetches and stores nothing.
- The form is mounted inside the dialog content, so every open starts from the fixed defaults: annotations anchored in the moving text ticked (per annotation, grouped Notes, Citations, Claims, each group a list named by its heading), every detail unticked, name `defaultNewName`. State is component state only; a test asserts no `localStorage.setItem` and no `fetch` across a full interaction, and across Cancel and Escape.
- Spanning annotations are listed by kind in lists named "<Kind> that stay with the original", under a paragraph stating they span the cursor and stay.
- Word counts of each half come from `firstHalfWords` and `secondHalfWords`.
- An inline refusal is the text of `SPLIT_REFUSAL_MESSAGES[reason]`, shown in the `role="alert"` region, with the name field and Split disabled. A failure goes in the same alert region. The status region is `role="status"`; it is inside the dialog while open and rendered outside it while closed, so a message after the split is announced.
- Focus goes to the name field on open and is returned to the previously focused element on close (same pattern as `CaptureBox`). Enter in the name field submits when allowed.
- Controls used (source opened first): `Dialog*` parts from `common/UI/Dialog`, `Button` (variants `secondary`, `outline`; `type` passes through), `Checkbox` and `Input` (plain input wrappers; `Input` wraps in `EditContextMenu`). The Checkbox and Input have no stories of their own; `CaptureBox` stories and `CaptureBox.tsx` were read.

## Deviations and notes

- Dialog-only wording (title, group headings, word-count lines, "A name is needed...", the spanning paragraph, button labels) is written in the component, not in `split-messages.ts`, which this task does not list. The owner's wording review (Task 28) should cover it.
- Blank name: Split is disabled and a text line says a name is needed; the dialog does not send a blank name. The name input has `maxLength` 1000, matching `SPLIT_REQUEST_LIMITS.newNameMaxLength`.
- `status` while closed relies on the host keeping the dialog component mounted with `isOpen` false.

## Not run

- Storybook build, `pnpm test:e2e`, any real-browser run and axe `color-contrast` (jsdom has no layout; the rule is off in `runAxe`): not run here. The story file `SplitDialog.stories.tsx` (six stories: default, nothing to carry, inline refusal, submitting, failed, status after split; `a11y.test: "error"`) was only typechecked and linted.
- Screen reader run: not verified.
