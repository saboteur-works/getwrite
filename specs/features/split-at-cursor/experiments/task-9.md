# Task 9: contract, split types, constants and result unions

Commands were run from the repository worktree; paths are repository-relative.

## Files

- `frontend/src/lib/models/split-types.ts` (new): constants and types only.
- `frontend/tests/unit/split-types.test.ts` (new): 16 tests.
- `frontend/tests/unit/split-core-import-graph.test.ts` (new): 5 tests, 2 of them walker self-tests.
- `specs/features/split-at-cursor/experiments/task-9.md` (this file).

## Tests first: failing run

Command: `pnpm exec vitest run tests/unit/split-types.test.ts tests/unit/split-core-import-graph.test.ts` (from `frontend/`), run before `split-types.ts` existed.

Observed: 2 test files failed, 1 test failed, 4 passed (5 counted). `split-types.test.ts` reported a suite failure because its import of the not-yet-existing module did not resolve, so none of its tests ran. In `split-core-import-graph.test.ts`, "finds at least split-types.ts" failed with `expected [] to include 'split-types.ts'`; the two walker self-tests and the two per-file loops over an empty file list passed.

Note: a first version of `split-types.test.ts` imported the model with the `@/` alias. That alias did not resolve in the unit test run (error "Cannot find package '@/lib/models/resource-crud-core'"), so the imports were changed to relative paths, as other tests in `frontend/tests/unit/` use. This change was made after the failing run above and before the green run below.

## Green run

Same command, after `split-types.ts` was added and the imports fixed: 2 test files passed, 21 tests passed (16 in `split-types.test.ts`, 5 in `split-core-import-graph.test.ts`).

## Checks

| Check | Command | Result |
|---|---|---|
| frontend typecheck | `pnpm typecheck` (frontend) | run, exit 0 |
| frontend lint | `pnpm lint` (frontend) | run, exit 0; 0 errors, 459 warnings; no warning names a `split-` file |
| electron typecheck (both tsc passes) | `pnpm --filter getwrite-electron typecheck` | run, exit 0 |
| cli typecheck | `pnpm --filter getwrite-cli typecheck` | run, exit 0 |

The full unit suite was not run (not required by this task).

## Measured facts about the contract

- `split-types.ts` exports 12 refusal reason strings in `SPLIT_REFUSAL_REASONS` (nine FR-2, plus `stale-cursor`, `locked-project`, `step-failed`); a test asserts they are all distinct.
- `MERGED_MARK_SIDECAR_KEY` is `"mergedMark"`. A test asserts it is not in `CLIENT_WRITABLE_SIDECAR_KEYS` (imported). `SIDECAR_CLEARABLE_KEYS` is not exported from `resource-crud-core.ts`, and this task may not edit that file, so the test reads the array literal from the source text with a regular expression and asserts the key is absent from it; the test throws if the literal cannot be found.
- The five FR-15 states are exported as `SPLIT_LINEAGE_STATES`.
- The import-graph test walks each `frontend/src/lib/models/split-*.ts` file present when it runs (currently one) and asserts no React, JSX, JSON or UI-registry file is reachable and no `node:*` or `fs` import in the file itself.

## Deviations and open choices

- The task text names the merged-mark constant but not its value; `"mergedMark"` is a placeholder name for Feature 121 to confirm.
- The spelling of the reason strings, the step names (`SPLIT_STEPS`), `SplitRemainingState` values and the `notices` field of the applied result are choices of this task, not taken from a measured fact; later tasks may need to extend them in their own files (only this task edits `split-types.ts`).
- The record shapes are not yet checked against `experiments/task-3.md`; Tasks 15 and 20 do that, as the task notes say.
