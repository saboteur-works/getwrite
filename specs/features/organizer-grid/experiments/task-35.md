# Task 35: Seed arrangements at project creation

Results only. Date: 2026-11-11.

## Red run (tests first)
`pnpm exec vitest run tests/unit/project-type-arrangements-creation.test.ts` (in `frontend/`) before the change: 10 failed, 5 passed (15 tests). The 5 that passed are absence assertions (no shipped module seeds, a type with none writes no key and one `project.json` write, a smart-folder source is refused, a module explicitly off adds none, saving or editing a type leaves an existing project unchanged).

## Green run
- Same file: 15 passed. With `tests/unit/project-creator.test.ts` (one case added): 2 files, 31 passed.
- `project-creator`, `project-type-arrangements-creation`, `project-type-modules-creation`, `core-import-graph`, `project-json-lock-scan`, `organizer-arrangements-import-graph`, `module-registry`: 7 files, 100 tests passed.
- `pnpm typecheck` (frontend): exit 0. `pnpm --filter getwrite-electron typecheck` (both tsc passes, incl. `tsconfig.worker.json`): run, exit 0. `pnpm --filter getwrite-cli typecheck`: run, exit 0.
- `eslint` and `prettier --check` on the three TS files: clean (one naming-convention error in the new test was fixed).

## What was added (`project-creator.ts`)
- `ProjectTypeSpec.arrangements?: ModuleArrangementSeed[]`.
- `createProjectFromType` takes an optional `moduleManifest` (default `MODULE_MANIFEST`) and returns `skippedArrangements: { name, reason }[]`. Reasons: `folder-not-found`, `invalid`, `duplicate-name`, `limit-reached`. Each skip is also `console.warn`ed (same convention as the `defaultFolders` skip); no folder id or client text beyond the declared seed name is in a reason.
- After folders, subfolders and resources exist: the type's seeds, then `createModuleRegistry(manifest).arrangements(project.config)` (enabled modules only, using the type's just-written `config.modules`). Each seed's `folderName` resolves by `slugify` equality against the created folders (first match; top level before subfolders). The draft goes through `validateOrganizerArrangementDraft` (Task 25); a refusal is `invalid`. Names are unique under trim and case-fold, earlier wins (type before modules). Ids from `generateUUID`. At most 50.
- If at least one arrangement resulted, `config.organizerArrangements` is set and `project.json` is written a second time (`writeFile`, same as the first). With none resolved, no key and no second write.
- No other caller applies a seed: the only code path is inside `createProjectFromType`; a test saves and replaces types after creating a project and the stored `project.json` is byte-equal.

## Observed
- A smart-folder source never reaches seeding: Task 33's `ProjectTypeSchema` refuses it, so `createProjectFromType` throws before any write (no `project.json` created). A module seed type has no smart-folder variant.
- The invalid-seed path (`invalid`) is reachable only through a module seed (the type schema already refuses a blank name, bad axes), so its test uses a fixture module.
- `createProjectCore` (saved type) and `createProjectCoreNative` (static registry spec, `getStaticProjectType` mocked as the existing modules test does) both store the same arrangement with the created folder's id.
- Second write happens after `folders/characters/folder.json` exists (test spies on `io.writeFile`).

## Unlisted files
None edited. `project-types-static.ts` needed no change: it validates each template through `validateProjectType`, which since Task 33 keeps `arrangements`; the native path goes through `createProjectCoreNative` to the same `createProjectFromType`. No built-in type declares arrangements.

## Not verified
- Full-suite vitest.
- `createProjectCore`/`createProjectCoreNative` do not surface `skippedArrangements` to their callers (their result type is unchanged); the reason is available on `createProjectFromType`'s return and in the warning only. Whether a UI should show it is not decided here.
- Native on-device creation.
