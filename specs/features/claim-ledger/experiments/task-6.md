# Task 6: project type `modules` declaration (results)

## Changes

- `frontend/src/lib/models/schemas.ts`: `ProjectTypeSchema` gains optional `modules`, a `z.record(z.string(), z.boolean(...))` with the message "Modules must list each module as on (true) or off (false)." on both a non-record value and a non-boolean value. The message names no client key or value. `PROJECT_TYPE_SECTION_LABELS` gains `modules: "Modules"`. An unknown module id is accepted as given. `.strict()` is unchanged, so other unknown keys are still refused.
- `frontend/src/lib/api/schemas.ts`: not edited. `ProjectTypeListResponseSchema` and `ProjectTypeWriteSuccessSchema` use `ProjectTypeSchema` directly, so they carry `modules` with no change (a test parses both with `modules` and refuses a bad value).
- `getwrite-config/templates/project-types/project-type.schema.json`: left unchanged. Task 1 (d) read, and did not find, any code that validates against that file (it is referenced by comments, tests that exclude it from the template list, and docs). It also already lacks `statuses`, `relationshipTypes`, `subtypes` and `wordCountGoal`. Nothing was run against it.
- Tests: `frontend/tests/unit/project-type-validation.test.ts` (new describe block "project-type modules declaration (Feature 108, FR-4)"; the earlier test "rejects a module key ... like any unknown field" asserted the opposite of FR-4 and was replaced by one that accepts a valid `modules` record), `frontend/tests/unit/project-type.test.ts` (round trip and array refusal).

## Order

Tests were written first. Before the schema change, 12 tests in `project-type-validation.test.ts` failed (`Unrecognized key: "modules"` and the list and write-success parses failing). After the change they pass.

## Commands run

- `pnpm exec vitest run --project node` (from `frontend/`) on `project-type-validation`, `project-type`, `project-types-write-core`, `project-types-api`, `project-types`, `project-type-draft-service`, `core-import-graph`: 7 files, 266 tests, passed.
- `pnpm typecheck` (frontend): run, no errors.
- `pnpm exec eslint` on the three touched source and test files: run, no output (clean). `pnpm exec prettier --write` on the same: schemas.ts reformatted.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): run, no errors.
- `pnpm --filter getwrite-cli typecheck`: run, no errors.
- Not run: the full `pnpm lint` and `pnpm test:ci` suites, any `next build` or `build:native`, e2e.

## Not verified

- Older-build behaviour with a saved type that carries `modules`: per Task 1 (d) an older build's strict schema refuses it (saved type reported `invalid`; a built-in file is skipped silently; the client list schema refuses the whole response). That was measured in Task 1, not re-run here.
- Nothing in this task applies `modules` at project creation (Task 7) or shows it in the Manager (Tasks 8 and 9). `docs/features/project-types.md` is not edited (Task 30).
- The built-in types declare no `modules` key (tested: none declares `claims` on).
