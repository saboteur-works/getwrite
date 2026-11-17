# Task 13: annotation partition and mark cut (FR-11)

Files: `frontend/src/lib/models/split-annotations.ts`, `frontend/tests/unit/split-annotations.test.ts`. No other production file, `package.json` or lockfile edited; `annotation-mark-strip.ts`, `annotation-mark-ids.ts`, `split-cut.ts` and `split-types.ts` are imported, not edited.

## Failing run (tests first)

Command (repository root): `pnpm --filter getwrite-frontend exec vitest run tests/unit/split-annotations.test.ts`

Result before `split-annotations.ts` existed: 1 test file failed, "no tests"; the import of `../../src/lib/models/split-annotations` could not be resolved (the module did not exist). Exit code 1.

## Green run

Same command plus `tests/unit/split-core-import-graph.test.ts`: 2 files passed, 19 tests passed (14 in `split-annotations.test.ts`, 5 in the import-graph test).

## Design readings and choices (no measurement contradicted the task)

- Classification is read from the marks Task 12 left in the two halves, using the behaviour measured in `experiments/task-6.md`: id marked in the first half only is before; second half only is after; both is spanning; neither is unanchored.
- Cases `experiments/task-6.md` does not cover, each returned as a failed outcome naming the annotation id and not guessed: a chosen id naming no annotation (`unknown-chosen-id`), a chosen annotation with no mark in either half (`chosen-without-passage`), two annotations sharing an id (`duplicate-annotation-id`). An input list over 500 fails with `over-limit` and a null id.
- An annotation with no mark that is not chosen stays in the original's list (`unanchored`); this is a choice of this task, not a measurement. A chosen id that is before or spanning stays with the original and is reported in `chosenButStayed`; FR-11 says those stay unconditionally.
- The strip uses `stripBodylessAnnotationMarks(second, movedIds)`; it rebuilds nodes by spread, and a test asserts the new document's node ids equal those of its input and share none with the original.

## Checks

- `pnpm typecheck` (frontend): exit 0.
- `pnpm lint` (frontend): 0 errors, 459 warnings (none introduced by these files after fixing two naming-convention errors found by an eslint run on the new files).
- Prettier applied to both new files.
- `pnpm --filter getwrite-electron typecheck` (both passes): exit 0.
- `pnpm --filter getwrite-cli typecheck`: exit 0.
