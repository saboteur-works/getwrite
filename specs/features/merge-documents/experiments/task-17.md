# Task 17: merge eligibility function (pure, FR-2)

## Input shape (decision of this task)

`mergeEligibility(documents, markKey?)` takes rows in selection order, each `{ id, sidecar | null, inTrash }`; `sidecar: null` means the row is missing. The first row is the target. Check order: fewer than two rows, repeated id, then per row: missing, in Trash, folder, image or audio, Source, entity (`entityKind` non-empty string), marked (`merged-target` for the first row, `merged-absorbed` otherwise). The first problem found is the one returned.

## Failing run (tests first)

`pnpm exec vitest run tests/unit/merge-eligibility.test.ts tests/unit/split-eligibility.test.ts` before `merge-eligibility.ts` existed:

- `merge-eligibility.test.ts`: suite failed to load (module not found).
- `split-eligibility.test.ts`: 37 passed, including the new Split-refusal test. That test needed no code change, so it was green on first run by design (it exercises an existing predicate).

## Green run

`pnpm exec vitest run tests/unit/merge-eligibility.test.ts tests/unit/split-eligibility.test.ts tests/unit/split-core-import-graph.test.ts`: 3 files, 64 tests passed.

## Split refusal of a marked document

`split-eligibility.test.ts` gained a test that gives Split a sidecar carrying a real `MergedMark` under `MERGED_MARK_SIDECAR_KEY`. `isMergedDocument` returns true and `splitEligibility` returns `{ eligible: false, reason: "merged-document" }`. The predicate behaves as needed, so `split-eligibility.ts` was not edited and there is no blocker.

## Checks

- `pnpm typecheck` (frontend): clean.
- `pnpm lint` (frontend): 0 errors, 459 warnings (the existing count).
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): clean.
- `pnpm --filter getwrite-cli typecheck`: clean.
- `split-core-import-graph.test.ts`: passes with `merge-eligibility.ts` present; its merge section walks every `merge-*.ts` and the new file imports only `./split-eligibility` and `./merge-types`.

## Not run

Full `test:ci` suite, Storybook, e2e, builds.
