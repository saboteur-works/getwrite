# Task 21: generalise the lineage-state resolver (FR-5)

## Decision

`SplitLineageRecord.operation` was left as `"split"`. Rather than widen that type, a separate input type was added in `split-lineage-resolver.ts`: `MergedMarkResolverInput` holds a `MergedMark` (from `merge-types.ts`) plus the same four probes the split input carries, taken for the mark's target document and snapshot revision. `experiments/task-7.md` recorded that the resolver reads none of a record's fields, so the mark only types the input. Both inputs go through one shared private function, `resolveProbes`.

- `resolveSplitLineageState` is unchanged in behaviour and signature.
- `resolveMergedMarkState` returns `MergeMarkStateResult`. The two state names that differ in merge-types (`target-in-trash`, `target-permanently-removed`) are mapped from the split names; the other three states pass through.

No file outside the task's declared Files was edited. `split-types.ts` and `merge-types.ts` are unchanged.

## Tests first

Seven new tests were added to `frontend/tests/unit/split-lineage-resolver.test.ts` before the implementation. Run before the implementation: `Tests 7 failed | 10 passed (17)`, each new one failing with `TypeError: resolveMergedMarkState is not a function`. The ten existing tests passed and were not edited (only an import and an appended block were added).

Fixtures follow `experiments/task-7.md`: stored-path sets for the live sidecar, live revision folder, `.trash/meta` sidecar and `.trash/revisions` folder, turned into probes. A failed probe is a measured-shape value (`read: "failed"`), a synthetic one, not a disk fault.

## Results

- Resolver test file, with `split-undo-core.test.ts` and `split-core-import-graph.test.ts`: 3 files, 53 tests passed.
- `pnpm typecheck` (frontend): clean.
- ESLint on the two touched files: clean.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `tsconfig.worker.json`): clean.
- `pnpm --filter getwrite-cli typecheck`: clean.

## Done-when clauses

- Accepts a named document and revision (a merged mark) as well as a split record: `resolveMergedMarkState` and `resolveSplitLineageState`.
- One test per state for a merged mark (available, revision no longer kept, target in Trash, target permanently removed, could not be checked), with a failed read shown distinct from an empty read, plus an "exactly the five states" test and an agreement test against the split resolver.
- Existing resolver tests pass unmodified; the split record resolves as before.
- No I/O: the existing purity test (no `node:`, `fs`, `react` imports) still passes on the edited file.
- Not run: nothing required by the task was skipped. Full-suite `test:ci` was not run.
