# Task 33: Project type key `arrangements`

Results only. Date: 2026-11-11.

## Red run (tests first)
`pnpm exec vitest run tests/unit/project-type.test.ts tests/unit/project-type-validation.test.ts` (in `frontend/`) before the change: 4 failed, 135 passed. Failing: valid list kept (by name and by slug), empty list accepted, refusal text names "Arrangements" and no client input, API list/write responses keep `arrangements`. The refusal-only cases (smart-folder source, rows `order`, bad name/scope, duplicates, over 50) passed before the change because `.strict()` already refused the unknown key; they assert refusal, not a message.

## Green run
- Same two files: 2 files, 139 tests passed.
- `vitest run -t "project.type|project type|ProjectType"` (name filter, all files): 27 files passed, 414 tests passed, 0 failed. Not a full-suite run.
- `eslint` on the three touched TS files: no output. `prettier --check`: clean.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes incl. `tsconfig.worker.json`): run, exit 0.
- `pnpm --filter getwrite-cli typecheck`: run, exit 0.
- `pnpm typecheck` (frontend): 1 error, `src/lib/api/organizer-arrangements.ts(171,12) TS2307: Cannot find module '../../store/transport/native-organizer-arrangements-backend'`. That file is Task 28's and is not in this worktree; not touched by this task. Observed, cause not investigated beyond the missing module.

## What was added
- `schemas.ts`: `arrangements` optional on `ProjectTypeSchema`; `PROJECT_TYPE_SECTION_LABELS.arrangements = "Arrangements"`; one fixed refusal text (`PROJECT_TYPE_ARRANGEMENTS_MESSAGE`) on every nested level, so a nested unknown key, bad axis or bad source never reaches `readableProjectTypeIssue`'s unrecognized-keys branch (which prints the key names). `readableProjectTypeIssue` itself is unchanged: its fallback `A value under Arrangements is not valid.` now resolves through the label table for anything the schema messages do not cover.
- Element shape: `{ name (trim, 1..100), source: { kind: "folder", folderName (trim, 1..200), scope: "children"|"descendants" }, rows, columns }`, all strict; list max 50; names unique under trim and case-fold; no `id`, no smart-folder source. Rows accepts `none`, status, subtype, field; Columns also `order`.
- `lib/api/schemas.ts`: no edit. `ProjectTypeListResponseSchema` and `ProjectTypeWriteSuccessSchema` embed `ProjectTypeSchema`, so they carry the key (tests added in `project-type-validation.test.ts`).

## Decision: mapping to `ModuleArrangementSeed` (Task 34)
The element type is the same shape as `ModuleArrangementSeed` (`name`, folder `source` with `folderName` and `scope`, `rows`, `columns`). "By slug or name" is one field, `folderName`; Task 35 resolves it with `slugify` equality against the created folders (a name and its slug both match). No mapping function needed.

## `project-type.schema.json`
Not changed. Task 1 (i) recorded no rejection by it: nothing in the repo loads it as a validator (no ajv, no reader found), and it already lacks `statuses`, `relationshipTypes`, `subtypes`, `wordCountGoal` and `modules`. What rejects an unknown key is the Zod schema, now extended.

## Not verified
- Full-suite vitest; frontend `pnpm typecheck` is red from Task 28's missing file (above).
- `project-types-static.ts`, `createProjectFromType`, the resolver listing a built-in or saved type carrying the key end to end: not exercised here (Task 35 consumes the key; resolver parse goes through `validateProjectType`, covered by the unit tests only).
- Whether a folder name in a seed matches an existing folder of the type is not checked at validation (Task 35 handles an unresolvable name).
