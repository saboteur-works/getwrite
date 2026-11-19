# Task 22: post-commit index update wiring and failure report (FR-9)

Files: `frontend/src/lib/models/split-core.ts`, `frontend/src/lib/models/split-messages.ts` (index-failure text only), `frontend/tests/unit/split-messages.test.ts`, `frontend/tests/unit/split-core-index.test.ts` (new), this record. Node v24.15.0.

## Failing runs (tests first)

- `pnpm exec vitest run tests/unit/split-messages.test.ts` (from `frontend/`) with the four new tests and no new exports: 4 failed, 8 passed (the new exports were `undefined`).
- `pnpm exec vitest run tests/unit/split-core-index.test.ts` against the Task 21 `split-core.ts`: 9 tests, 7 failed, 2 passed. Failures: `updateDocumentIndexes` called 0 times; no `index-failed` outcome (`applied` returned); no post-commit `mutateSidecar` write for the new document. The 2 that passed were the clean-split outcome check and the `wordCount` values check (the builder already stores a `wordCount` of the new text, Task 18).

## Green runs

- `tests/unit/split-messages.test.ts`: 12 tests passed.
- `split-core-index`, `split-messages`, `split-core`, `split-core-compensation`, `split-core-import-graph` together: 5 files, 70 tests passed (9 + 12 + 24 + 20 + 5), run three times, 70 each time.

## Design as built

- `applySplit` releases the revision-content lock after the writes, then runs `finishAfterCommit` (awaited, outside the rollback): the new document's `wordCount` through `mutateSidecar` as `countWords(tiptapToPlainText(text))` (written even when it equals the value the builder stored; a missing sidecar is left unchanged), then `updateDocumentIndexes(projectRoot, [original, new])`.
- New outcome `index-failed`: the applied fields plus `failures: { documentId, step }[]` (`step` is a Task 17 step or `word-count`) and `message` (the text below). `applied` is returned only when both post-commit parts succeeded. Types `SplitAppliedFields`, `SplitPostCommitFailure` are defined in `split-core.ts`.
- An `index-failed` result does not start compensation (asserted: the snapshot, new document, truncation and both records stay).
- `updateDocumentIndexes` reports each step's failure itself and does not throw (Task 17); `finishAfterCommit` does not wrap it, so an unexpected throw from it would surface as an error after a committed split. Not exercised.
- Text (`split-messages.ts`): `SPLIT_INDEX_FAILURE_MESSAGE` says the split was saved, that running reindex repairs the search index, the notes search index, links and mentions, and that prose diagnostics and word counts refresh the next time the document is saved; no sentence that names reindex names diagnostics (tested). `SPLIT_INDEX_STEP_LABELS` (one label per step, distinct) and `describeSplitIndexFailure(steps)` (the general text plus what was not brought up to date). The text names word counts as refreshed by the next save because `updateRevisionInPlace` writes `wordCount` (`experiments/task-2.md`); that reading was not tested here.

## What the tests measured (facts)

- After a split, with `rebuildDerivedIndexes` spied: not called; `updateDocumentIndexes` called once with `[original, new]`, after `writeLatestOperation`; when `applySplit` resolved, the inverted index held a term of the second half only under the new document and a term of the first half only under the original, and the diagnostics index had a record for each.
- `wordCount` of both documents equalled `countWords` of the stored text (4 and 4 in the fixture); a post-commit `mutateSidecar` call for the new document came after the `writeLatestOperation` call.
- A failed `wordCount` write (injected) returned `index-failed` with `{ new document, "word-count" }` and the latest-operation record was on disk.
- With `updateDocumentIndexes` mocked to fail: `index-failed` with the failure list and message; the new document's sidecar, the lineage entry, the latest-operation record, the snapshot revision and the truncated original text were all present.
- With `indexResource` made to throw for the new document: `index-failed` naming `inverted-index` for it; before a rebuild the new document was absent from the inverted index under a second-half term; after `rebuildDerivedIndexes` the original's directory and a copy of the failed state, each rebuilt, had equal contents for the four indexes (compared as sorted-key JSON), and the new document was in the inverted index.
- With `persistDiagnosticsIndex` made to reject: `index-failed` including a `diagnostics` failure; after `rebuildDerivedIndexes` there was still no diagnostics record for the new document; after `enqueueIndex` for it and a drain there was one.
- `reindex` is not extended; no file outside the Files list was edited, `indexer-queue.ts` untouched.

## Not covered

- A lock error or an unexpected throw after commit; several server instances; an encrypted project.
- `wordCount` refresh on the next save (stated in the text from the code reading in Task 2, not run here).

## Checks

- `pnpm typecheck` (frontend): exit 0 (one error in the new test, `waitForDrain` argument, fixed). `pnpm lint` (frontend): 0 errors, 459 warnings. `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck`: no errors.
- Regression: `tests/unit/split-*`, `revision*`, `meta-locks`, `lock*`, `project-json-lock*`, `file-lock`, `resource-crud*`, `trash*`, `saved-defaults*`, `indexer*`, `derived*`: 67 files, 871 tests passed.
- Not run: the full frontend suite, builds, e2e, any device.
