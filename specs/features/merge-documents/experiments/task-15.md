# Task 15: merge types, constants and result unions

No behaviour change: types and constants only.

## Failing run (tests first)

`pnpm exec vitest run tests/unit/merge-types.test.ts tests/unit/split-types.test.ts tests/unit/split-core-import-graph.test.ts` before `merge-types.ts` existed:

- `merge-types.test.ts`: suite failed to load (module `merge-types` not found).
- `split-core-import-graph.test.ts`: "finds at least merge-types.ts" failed with `expected [] to include 'merge-types.ts'`.
- `split-types.test.ts`: 25 existing and new runtime cases passed; the `@ts-expect-error` case is checked by `tsc`, not by Vitest.

## Green run

Same command after the change: 3 files passed, 40 tests passed.

## Checks

- `pnpm typecheck` (frontend): RED, 8 errors, all `string | undefined` from `LatestOperationRecord.newDocumentId` now being optional on the `merge` member of the union:
  - `src/lib/models/split-undo-core.ts` lines 390, 407, 414, 417, 421, 433 (reads `record.newDocumentId` on an unnarrowed record).
  - `tests/unit/split-undo-core.test.ts` lines 739, 742 (same read in a test).
  - Neither file is in this task's Files (the task list gives `split-undo-core.ts` to Tasks 38 and 39). Measured: the errors are exactly these eight sites. Fix needed, not made here: narrow on `record.kind === "split"` at those reads. No cause beyond the type change was tested.
- `pnpm lint` (frontend): 0 errors, 459 warnings (existing).
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): run, clean.
- `pnpm --filter getwrite-cli typecheck`: run, clean.

## Not run

Full `test:ci` suite; Storybook, e2e and builds (not part of this task).

Scope extension: `frontend/src/lib/models/split-undo-core.ts` and `frontend/tests/unit/split-undo-core.test.ts` were touched by an orchestrator-approved extension of this task, only to narrow `newDocumentId` reads on `record.kind === "split"` so `pnpm typecheck` stays green after `LatestOperationRecord` became a discriminated union.
