# Task 8: Project Type draft service, module declaration (results)

## Changes

- `frontend/components/project-types/ProjectTypeDraftService.ts`:
  - New pure exports `moduleStatesOf(definition)` (one `"on" | "off" | "not-set"` per `MODULE_MANIFEST` entry, own-property lookup so a prototype name is never read as a declaration) and `withModuleState(definition, moduleId, state)` (on/off writes exactly that entry; not-set removes it and drops the `modules` key with the last entry; an id outside the manifest returns the definition unchanged; unknown ids already in `modules` are kept).
  - `FORM_FIELD_KEY` also matches `modules` and `modules.<id>`, so a validation error from Task 6's schema is keyed beside the control and not sent to the action bar.
  - Hook returns `moduleStates`, `canEditModules`, `handleModuleStateChange` and `canSave`. New optional third argument `options.savingAvailable` (default true). When false, `handleSave`, `handleSaveAsCopy` and `handleDelete` return a `refused` / `saving-unavailable` result without calling the transport, and module changes are ignored. A built-in's declaration is not editable (change ignored).
  - The save payload needed no change: `modules` rides on the definition through `saveDraftItem`, validated by `validateDraft` (Task 6 schema) before any request.
- `frontend/src/types/project-types.ts` (not in the declared Files): added optional `modules?: Record<string, boolean>` to `ProjectTypeDefinition`. Reason: without it the tests and the draft code cannot type a definition carrying `modules` (the other optional seeds `relationshipTypes` and `subtypes` are not on this type; they are not held typed in the draft). One optional field; flagged for the lead.
- Tests: `frontend/tests/unit/project-type-draft-service.test.ts` (new describe "module declaration in the draft"), `frontend/tests/unit/project-type-draft-service-hook.test.tsx` (new describe).
- `ProjectTypesManagerPage.tsx` is not edited (not a Task 8 file): it does not yet pass `savingAvailable` to the hook, so the hosted gating in the hook is unused by the page until Task 9 (or the lead) wires it. It already computes `canSave` itself for its buttons.

## Order

Tests first. Before the implementation, 17 new tests failed (missing exports and hook members). After, 72 tests in the two files pass.

## Commands run (from `frontend/`)

- `pnpm exec vitest run tests/unit/project-type-draft-service.test.ts tests/unit/project-type-draft-service-hook.test.tsx`: 2 files, 72 tests passed.
- `pnpm exec vitest run project-type ProjectType` (every matching file, 20): 455 tests passed.
- `pnpm typecheck`: run, no errors.
- `pnpm exec eslint` on the four touched files: clean after renaming a boolean to `canEditModules` (naming-convention rule). Prettier applied.

## Not run / not verified

- `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck`: not run; nothing under `frontend/src/lib/models/` or `core.ts` was touched (only `src/types/project-types.ts`).
- Full `pnpm lint` and `pnpm test:ci`, builds, e2e: not run.
- No rendering of the control (Task 9); the page's use of `savingAvailable` is untested.
