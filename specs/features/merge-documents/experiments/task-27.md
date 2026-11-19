# Task 27: post-commit index update wiring and failure report (FR-12, FR-9)

Results only.

## Files

- `frontend/src/lib/models/merge-core.ts`: `finishAfterCommit`, the `index-failed` result type (`MergeIndexFailedResult`), `changedDocumentIds`.
- `frontend/src/lib/models/merge-messages.ts`: `MERGE_INDEX_FAILURE_MESSAGE`, `MERGE_INDEX_STEP_LABELS`, `describeMergeIndexFailure` (only the index-failure text).
- `frontend/tests/unit/merge-messages.test.ts`: four tests added, one distinctness entry.
- `frontend/tests/unit/merge-core-index.test.ts` (new): 8 tests.
- `split-index-update.ts` imported, not edited.

## Test-first

Messages: before the change `Tests 4 failed` of the new ones (the import of the new names was undefined); after: 20 passed. Index tests: before the change `Tests 5 failed | 3 passed (8)` (the three that passed: wordCount, a clean merge has no `failures` field, a refused or failed merge does not run the update); after: 8 passed. Two fixture corrections were made after the first green run (not to the behaviour under test): `createResourceCore` leaves `content.txt` empty (measured: the baseline backlinks index held no link and the linker's `content.txt` was `""`), so the fixture writes the plain text of each document; and `backlinks.json` lives in `meta/`, not `meta/index/`, and maps a document to the documents it references.

## Done-when clauses

| Clause | Test |
|---|---|
| Update through `updateDocumentIndexes`, no whole-project reindex (spy on `rebuildDerivedIndexes`), after the record | `updates the target and each changed absorbed document after commit...`: one call, ids `[target, absorbed document that lost a note]`, call order after `writeLatestOperation` |
| Inverted index, annotation-body index, backlinks, mentions (recomputed), diagnostics reflect the merge; link in an appended passage resolves from the target; link to an absorbed document still resolves; absorbed document stays in search and keeps its mentions | `brings the indexes up to date...` (read right after `applyMerge` resolved) |
| Target `wordCount` equals `countWords(tiptapToPlainText(text))` | `writes the target's wordCount...`; already true from Task 25's no-log write (this test passed before the change), so no extra write was added |
| Injected index failure leaves the merge applied and returns `index-failed` naming what failed | `leaves the merge applied and returns an index-failed outcome...` (no `failedStep`; record, text and snapshots present) |
| Text says `reindex` repairs the four indexes, diagnostics refresh on the next save, does not say reindex repairs diagnostics; `merge-messages.test.ts` green | three tests in `merge-messages.test.ts` (the sentence containing "reindex" is checked not to contain "diagnostics") |
| After an injected failure `reindex` gives the result of a rebuild for the four indexes | `after an injected inverted-index failure, reindex gives...`: `meta/index/{inverted,annotations,mentions}.json` and `meta/backlinks.json` compared with keys sorted, between a `rebuildDerivedIndexes` of the failed project and of a copy of it. That compares a rebuild with a rebuild of the same files, as the Split test does; it shows the rebuild is deterministic on that state and that the target was missing from the inverted index before it, not that `reindex` was run as a CLI |
| A failed diagnostics step is not repaired by `reindex`; the next save writes it | `a failed diagnostics step is not repaired by reindex...` |
| Failure does not trigger Task 26's compensation | the same test as the index-failed one: `removeMergedMark` and `setRevisionPreserve` were not called |

## Decision: does the merge await the indexer queue drain

Chosen: no. The merge awaits `updateDocumentIndexes` (which reports its failures) and does not wait for the queue of background index tasks that the text and sidecar writes enqueue.

Measured, 5 runs on a fresh project each, synthetic documents of 5000 words (50 paragraphs of 100 words), no annotations, so the update covered the target only; a project of 3 or 25 documents (not a 500-document project); `applyMerge` with the Task 27 wiring, then `flushIndexer(600000)` timed after it returned, then the five index files (`inverted`, `annotations`, `backlinks`, `mentions`, `diagnostics`) compared, keys sorted, between right after the return and after the drain:

| Documents | `applyMerge` returned after (ms) | queue drain after the return (ms) | index files equal before and after the drain |
|---|---|---|---|
| 3 | 24, 19 | 27, 26 | yes, yes |
| 25 | 120, 114, 110 | 431, 388, 400 | yes, yes, yes |

Before the wiring (Task 25's `applyMerge` plus a manual `updateDocumentIndexes` over all documents, 2 runs of 25 documents): the update itself took 103 and 102 ms when called with the queue not drained and 81 and 79 ms when called after the drain; the drain took 393 and 413 ms. The index files were equal in the same comparison.

What this supports: in these runs the files were the same whether or not the drain was awaited, and awaiting it would have added about 0.4 s at 25 documents. Not supported: that the same holds for the ~8 s drain at 50 documents of `task-13.md` (a 500-document project there; the cause of the difference between that figure and the figures here was not established and this probe did not reproduce it), for documents with annotations or entities, or for a run where a background task fails (a background task's failure is logged and swallowed by `enqueueIndex` and is not reported by the merge; the awaited update covers the same indexes and does report). Experiment that would settle the 50-document question: repeat this probe at 50 documents in a generated 500-document project and compare the files before and after the drain.

## Number measured at the cap

25 documents (`MERGE_DOCUMENT_CAP`): `applyMerge` including the awaited update returned in 110 to 120 ms (3 runs), the update covering the target only; drain after the return 388 to 431 ms.

## Checks

- `merge-core-index`, `merge-messages`, `merge-core`, `merge-core-compensation`, `merge-preview-core`, `split-core-import-graph`: 125 passed.
- `pnpm typecheck` (frontend), electron `pnpm typecheck` (both passes), cli `pnpm typecheck`: clean.
- `pnpm lint`: 0 errors, 459 warnings (the total of `task-26.md`; one extra warning from an unused destructured name was removed).
- `test:ci` full suite not run.

## Not measured

An index failure thrown (not returned) by `updateDocumentIndexes`, an encrypted project, a hosted tenant, an absorbed document edited between the commit and the update.
