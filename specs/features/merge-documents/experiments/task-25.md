# Task 25: merge apply with ordered writes (FR-3 to FR-10, FR-6 forward path)

Results only. Forward path; reverse compensation is Task 26.

## Files

- `frontend/src/lib/models/merge-core.ts` (new): `applyMerge`, `MergeApplyRequest`, `MergeApplyResult`.
- `frontend/tests/unit/merge-core.test.ts` (new): 31 tests, real project directories, Feature 93 lock-order guard installed by `tests/setup.ts`.

## Test-first

The test file was written before the module. First run: `Test Files 1 failed (1), Tests no tests` (import of `merge-core` failed). After the module: 31 of 31 passed; repeated 3 times, 31 of 31 each time (the three concurrent-call tests did not flake in those runs).

## Done-when clauses and the test pinning each

| Clause | Test |
|---|---|
| Locks once each, ascending id, target not first | `takes each document's revision lock once, in ascending id order...`; `...whichever document is the target` |
| Swapped-role concurrent merges: one applied, one refused, none timed out | `ends with one applied and one refused, none timed out, for two merges with swapped roles` (5 s limit) |
| Two overlapping merges sharing a document | `...share an absorbed document`; also two identical concurrent merges |
| Staleness checked inside the locks, refuses before any write | `checks staleness inside the locks and refuses a text that changed while it waited` (text edited while the merge waited on a held lock; no snapshot and no record afterwards); `refuses a stale hash before any write` |
| Write order | `writes in the decided order: snapshots, annotations moved, marks, strips, append, latest-operation record` (spies; every snapshot precedes every other write; record last) |
| Every text write is the no-log write with `lockHeld: true` | `writes text only with the no-log write and lockHeld: true` |
| Snapshot: preserved, non-canonical, `mergeSnapshot`, "Before merge" + date, full stored text read inside the operation | `keeps every revision, adds one preserved...`; `snapshots the full stored text...` |
| Mark on each absorbed document with target and the target's snapshot id (opaque, from `createRevision`), full instant | `writes the mark on each absorbed document...` |
| Annotations move; moved marks stripped from absorbed text; unchosen stay | `moves the chosen annotations...`; `leaves every annotation on its document when none is chosen` |
| Composed text, tree order, one empty paragraph at each joint | `appends each absorbed text to the target in tree order...` |
| Metadata carry | `carries the chosen metadata values...`; `leaves the target's metadata as it was when no field is chosen` |
| Latest-operation record: merge kind, target first then append order, snapshot per document, no `newDocumentId`, replaces an earlier one | two tests under `the merged result` |
| Target name/folder/position/unchosen values unchanged, no absorbed moved/renamed, no purge, nothing to `compileDefaults` | `leaves the target's name, folder...`; `writes nothing to compileDefaults` |
| No node id in common between target and absorbed stored text read from disk | `shares no node id between...` |
| Writing-log directory byte-identical, no "Auto-backup" revision, daily goal unchanged | `leaves the writing-log directory byte-identical...` |
| Refusals of Task 17 and Task 24 write nothing | single document, cap, already merged (directory snapshot equal); annotation-limit refusal with counts (directory snapshot equal) |
| Locked project writes nothing and rethrows | `rethrows the locked-access error and writes nothing` |
| Comment on one writer instance per tenant | `says in a comment that the claim holds under one writer instance per tenant` |
| Failure returns the step, never applied, locks released | `returns failed with the step...`; `names the snapshot step...`; `returns a failure when a document's annotations changed after they were read` |

## Decisions and assumptions

- Evaluation: `evaluateMergeRequest` is called inside the held locks (it takes none). A cap refusal and an invalid id are decided before any lock by a small local `precheck`, because `precheck` in `merge-preview-core.ts` is not exported and that file is outside this task's files. Exporting it would remove the duplicate.
- The append order (tree order) is also computed locally (`appendOrder`), for the same reason as `appendOrder` in `merge-preview-core.ts`. A follow-up could export that one and delete the copy.
- Order of decisions: everything that needs no write (order, annotation carry and the 500 limit, composition, metadata carry) is decided before the first snapshot, so those refusals and failures write nothing. Annotation-limit refusal is `refused` with `annotationCounts`.
- Snapshot order: target first, then absorbed documents in append order.
- A sidecar write of `annotations` or `userMetadata` re-checks, inside `mutateSidecar`, that the stored value equals the one read under the locks; a difference throws and returns `failed` (step `move-annotations` or `append-to-target`). The revision-content locks do not coordinate writers that only take the sidecar lock; this guard avoids a lost update there.
- A source `.txt` of an absorbed document is rewritten (strip) only when a chosen annotation moved from it.
- Failed outcome states (no rollback exists yet, none claimed): before the first snapshot completes, `documents-restored` for a failure with nothing started (evaluation failure, planning failure) and `state-unknown` for a failure inside the snapshot step with none completed; `snapshot-revisions-kept` after at least one snapshot and before any other write; `partially-written` once any other write began. A locked-access error is rethrown only when nothing was written (no snapshot completed and no other write).
- `merge-messages.ts` was not edited. The `partially-written` text ("a copy of the text from before the merge was saved just before any change") holds on this path because every snapshot is written before any other write; a test asserts the snapshots of all three documents exist after a failure at `write-marks`. A failure inside the very first `createRevision` is `state-unknown`, not `partially-written`.

## Measurement taken for the lead (indexer queue)

Throwaway probe (deleted afterwards; `git status` shows only the two new files). Documents of 2000 words, synthetic, fresh project per case, no annotations:

| Documents | `applyMerge` returned after | `flushIndexer()` awaited right after |
|---|---|---|
| 3 | 11 ms | 25 ms |
| 25 | 48 ms | 278 ms |

`applyMerge` does not await the indexer queue and the queue was not empty when it returned (the flush after took 25 ms and 278 ms). The ~8 s at 50 documents of `task-13.md` was not reproduced here; no cause is claimed for either figure, and the probe did not use 5000-word documents, 50 documents or a 500-document project. The experiment that would settle the difference: repeat Task 13's 50 documents of 5000 words against `applyMerge`, timing the flush.

## Checks

- `merge-core.test.ts`: 31 passed. With `merge-preview-core.test.ts` and `split-core-import-graph.test.ts`: 67 passed.
- `pnpm typecheck` (frontend): clean. Electron `pnpm typecheck` (both passes) clean. CLI `pnpm typecheck` clean.
- eslint on the two new files: 0 problems (two `naming-convention` errors found on the first lint were fixed). Repo-wide `pnpm lint` after the fix: 0 errors, 459 warnings (the same total as `task-24.md`); before the fix it reported 2 errors, both in the new files.
- prettier check on the two files: clean.
- `test:ci` full suite not run.

## Not measured

Reverse compensation (Task 26), the derived-index update (Task 27), an encrypted project through the merge, several server instances, documents over 2000 words in the merge tests, annotations of a table cell or of a document with `textStyle` marks in the appended part.
