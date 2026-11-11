# Task 9: Project Type Manager form, module control (results)

## Changes

- `frontend/components/project-types/ProjectTypeEditorForm.tsx`: new "Modules" section with one three-state control (On, Off, Not set) per `MODULE_MANIFEST` entry, built from `moduleStatesOf` / `withModuleState` (Task 8). Editable: a native radio group in a `fieldset` named by its `legend` ("Claims module", "Sources module"), so Tab and the arrow keys are the browser's own. Read-only: the state is written as text ("Claims module: Off"), plus a text reason. A `modules.<id>` field error renders as a linked `role="alert"` paragraph (`aria-describedby`, `aria-invalid` on the group); a `modules` (whole record) error renders as an alert in the section. New optional props `modulesEditable` (default false, so an unwired parent never offers a control) and `modulesReadOnlyReason` (`"built-in"` or `"saving-unavailable"`). No new UI primitive used; no colour carries state.
- `frontend/tests/component/ProjectTypeEditorForm.test.tsx`: new describe "module declaration" (control per module and its three labels, declared state reflected, choice written to the definition and "Not set" removing it, native-radio/named-group/focusable checks, field error linked as text, whole-record error, built-in read-only, hosted read-only, read-only by default, axe in four states).
- `frontend/stories/ProjectTypes/ProjectTypeEditorForm.stories.tsx`: `ModuleDeclarationEditable`, `ModuleDeclarationBuiltInReadOnly`, `ModuleDeclarationHostedReadOnly`, `ModuleDeclarationError`.

## Order

Tests first. Before the form change, 7 of the 54 tests in the file failed (the rest of the new tests pass trivially or are the existing ones); after, 54 of 54 pass.

## Commands run (from `frontend/`)

- `pnpm exec vitest run tests/component/ProjectTypeEditorForm.test.tsx`: 54 passed.
- `pnpm exec vitest run project-type ProjectType` (20 files): 467 passed.
- `pnpm typecheck`: no errors (after replacing `entry.view.label` with `entry.view?.label ?? entry.id`, because `view` is optional on the manifest entry type).
- `pnpm exec eslint` on the three touched files: clean. Prettier applied.

## Not run / not verified

- `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck`: not run; nothing under `frontend/src/lib/models/` or `core.ts` was touched.
- Stories: typechecked and linted only; no Storybook run, so the story a11y parameters (`test: "error"`) are unexercised. The axe checks are the jsdom ones in the component test (they do not check colour contrast).
- Full `pnpm lint`, `pnpm test:ci`, e2e and builds: not run.
- Keyboard operation: asserted as native radios in one named group, not disabled, not `tabindex=-1`. jsdom does not implement arrow-key movement between radios, so that is the browser's behaviour and unexercised here.

## Gap: the page does not reach the form's new props (fact)

`ProjectTypesManagerPage.tsx` is not in this task's Files and is unchanged. It does not pass `modulesEditable` or `modulesReadOnlyReason`, so in the running app the Modules section currently shows the declaration read-only (text) with the "saving-unavailable" reason for every type, including saved and draft ones. The page already has `origin` ("Built-in" / "Saved" / "Draft") and `canSave` (from `isSavingAvailable`), which are what is needed: `modulesEditable={origin !== "Built-in" && canSave}` and `modulesReadOnlyReason={origin === "Built-in" ? "built-in" : "saving-unavailable"}`. The page also uses the hook without `savingAvailable` (default true), so the hook's own refusal for hosted is not exercised by the page; the page's `canSave` gate on its buttons is separate. Wiring these two props in the page is outstanding; the Task 9 "done when" items about the control, built-in read-only, hosted read-only, errors, axe and story are met at the form level only. "A failed save says so and keeps the draft" is existing page behaviour (feedback alert; draft state untouched) and was not changed or newly tested here.
