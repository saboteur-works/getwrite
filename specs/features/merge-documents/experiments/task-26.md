# Task 26: reverse compensation and failure injection (FR-6)

Results only.

## Files

- `frontend/src/lib/models/merge-core.ts`: backups before the first write, `compensate`, the state named after the undo.
- `frontend/tests/unit/merge-core-compensation.test.ts` (new): 30 tests.
- `frontend/tests/unit/merge-core.test.ts`: one assertion of Task 25 changed (see Decisions); not a declared file of this task, edited because the behaviour it pinned is what this task replaces.

## Test-first

The new file was written before the change. First run against Task 25's `merge-core.ts`: `Tests 25 failed | 5 passed (30)`. After the change, the first full run: 15 failed, all in the injection table, all on the comparison of two derived index files (see Differences). After comparing those two files with sorted keys: `30 passed (30)`. With `merge-core.test.ts`: 61 passed.

## What the tests inject

Fixture: target T (a note, listed in `compileDefaults.excludedResourceIds`, `status` Draft), A (one note that moves, one that stays, `status` Final, carried to T), B (one note that stays), plus an earlier latest-operation record. The forward path was counted first (a test pins it): `createRevision` 3, `mutateSidecar` 7, `writeMergedMark` 2, `writeCanonicalContentWithoutLog` 2, `writeLatestOperation` 1.

20 injection points: after each of the 3 snapshots, after each of the 7 sidecar writes, after the second mark, after the strip and after the append returned, after the record was written; and "instead of" (before the real call) for snapshot 2, sidecar writes 5, 6 and 7 (text written, sidecar not) and the record. For every point: result `failed` with the expected `failedStep`, `remainingState: "documents-restored"`, cause `InjectedFailure`; the directory snapshot (every file with content, the `metadataRevision` counter removed from `project.json`) equals the one taken before the merge; no `mergeSnapshot` revision remains on any document.

## Done-when clauses

| Clause | Test |
|---|---|
| Failure after each step undoes earlier steps; project as before (documents, sidecars, revisions, tree, compile exclusions, latest-operation file) | the 20-row table |
| Counter may advance; no other `project.json` field differs | `lets the metadataRevision counter advance...` (the counter was strictly higher after a failure at the record step; the test asserts `>`) |
| No half-marked or half-appended document | `leaves no half-marked...` (no `mergedMark`, content hashes equal) |
| Preserve flag cleared before `deleteRevision`; a skipped flag would be refused; snapshots gone after | `snapshots` tests: `deleteRevision` of a preserved merge snapshot rejects with `PROTECTED_REVISION_DELETE_MESSAGE`; the spy order is `setRevisionPreserve(false)` then `deleteRevision`, for B, A, T |
| Failure returned with the step, never success | table rows; `describeMergeFailure` text check |
| Step that cannot be undone, named by a Task 16 text, with a failing compensation | mark removal failing: `partially-written`, snapshots kept (1 per document); `deleteRevision` failing: `snapshot-revisions-kept`, sidecars and record file byte-equal to before; listing failing after a failed first snapshot: `state-unknown` |
| Reverse order | marks removed last first (B, A) before any snapshot flag is cleared |
| Derived-index update outside the rollback | `merge-core.ts` has none yet (Task 27 adds it after commit) |

## Differences from `experiments/task-5.md`

1. `metadataRevision`: Task 5 measured the counter advancing after every failure from step 3a on. Here it was strictly higher after a failure at the record step (one run, values not logged). Same direction; the amounts were not compared.
2. Index files: Task 5 found `meta/index/annotations.json` and `meta/index/inverted.json` differing byte for byte after compensation and equal with keys sorted. Observed here: 15 of the 20 injection points (every point at or after the first sidecar write) failed a byte comparison and the failing diff on the first one shown was key order in those two files; the 5 points before any sidecar write passed byte for byte. With only those two files compared after sorting keys recursively, all 20 pass and every other file, including `meta/index/diagnostics.json`, is byte-equal. The test says so in a comment. No cause for the key order is claimed; Task 5 did not establish one either. Whether the sorted comparison hides a real content difference was not tested beyond equality after sorting.
3. Task 5 restored sidecars from a whole-file copy; this implementation restores only the keys the forward steps set (`annotations`, `userMetadata`, `updatedAt`, `wordCount`, `mergedMark`), so a note added concurrently is kept (one test) rather than overwritten.
4. Task 5 compensated unconditionally; here a step is undone only if it was attempted, and a sidecar rewrite that would change nothing is skipped.

## Decisions

- Snapshots are removed last and only when every other undo succeeded (they hold the earlier text). Removal scans each document's revisions for ones that were not present before and carry `mergeSnapshot`, last document first, so a snapshot whose `createRevision` threw after writing is also removed.
- States after compensation: no undo failed: `documents-restored`; only snapshot removal failed: `snapshot-revisions-kept` (or `state-unknown` when no snapshot was known complete, since a half-made one cannot be ruled out); any other undo failed: `partially-written`. `state-unknown` is reached only through that snapshot case.
- A locked-access error with no snapshot done and no other write is rethrown without compensation, as in Task 25.
- Task 25's test `returns failed with the step that stopped it` asserted `partially-written` and one snapshot per document after a failure at `write-marks`; with compensation the true values are `documents-restored` and none, so that assertion was changed.

## Checks

- `merge-core.test.ts` and `merge-core-compensation.test.ts`: 61 passed.
- `pnpm typecheck` (frontend), electron `pnpm typecheck` (both passes) and cli `pnpm typecheck`: clean.
- `pnpm lint`: 0 errors, 459 warnings (the total `task-25.md` recorded).
- Full `test:ci` not run.

## Not measured

Process crash during compensation, a locked project that locks mid-merge, encrypted projects, more than three documents, annotations on a table cell, several server instances.
