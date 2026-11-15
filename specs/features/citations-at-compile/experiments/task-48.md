# Task 48: module-off, Sources-off, isolation and annotation-unchanged pins

Pins only; no production file was edited. Run from `frontend/`.

## New tests

- `tests/unit/citations-module-off.test.ts`: 12 tests, pass.
- `tests/component/citations-sources-off.test.tsx`: 5 tests, pass.

## Existing tests run, unmodified (6 files, 116 tests, pass)

- `tests/unit/annotation-validation.test.ts`
- `tests/unit/annotations-core.test.ts`
- `tests/citationControl.test.tsx`
- `tests/a11y/citationControl.a11y.test.tsx`
- `tests/integration/annotations-parity.test.ts`
- `tests/unit/citation-target-state.test.ts`

`git diff HEAD` on `src/lib/models/annotation-validation.ts` is empty; the new
pins also fix its accepted keys (five) and refusal text for a citation-field key.

## Checks

- `pnpm typecheck`: no errors.
- `pnpm lint`: 0 errors, 459 warnings (none in the new files; the one error found
  in an earlier draft, a variable naming rule, was fixed).

## Observed, as measured

- The citation cores (`citations-fields-core`, `citations-precheck-core`) and the
  compile cores do not read `config.modules`. The module switch is a UI gate only
  (the sidebar section and the compile switch). The pins therefore cover what
  stored data does when `setModuleEnabledCore` flips the entry, and what the UI
  shows, not a server refusal while the module is off.
- A project with no stored metadata schema reads as empty `groups` from
  `getSchema`, so the schema pin compares the schema before and after a fields
  write instead of against `DEFAULT_METADATA_SCHEMA`.
- Citation-fields tests that use the style are given an injected missing-detail
  test (title required); the real style table is not exercised here.

## Not covered

- A real PDF or DOCX with citations (no engine in this task).
- The sidebar section inside the full metadata sidebar or `AppShell`.
- A failing pin: none found.
