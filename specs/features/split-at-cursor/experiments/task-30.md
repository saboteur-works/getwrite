# Task 30: Undo rollback and failure injection (FR-6 rules applied to Undo)

Files: `frontend/src/lib/models/split-undo-core.ts`, `frontend/tests/unit/split-undo-compensation.test.ts` (new), this record. Node v24.15.0. Commands ran from `frontend/`.

## Failing run (tests first)

`pnpm exec vitest run tests/unit/split-undo-compensation.test.ts` with the test file written and `split-undo-core.ts` as Task 29 left it (no rollback): 1 file, 20 tests, 19 failed, 1 passed. The failures were the assertions on `failed.remainingState` (the result had no such field) and the directory comparison; the one test that passed is the overlapping-calls test, which needs no failure.

## Green run

Same command after the implementation: 20 of 20 passed, run four times in a row (once while fixing a test, then three more), 20 each time. `tests/unit/split-undo-core.test.ts` (Task 29, not edited) with `split-core-import-graph.test.ts`: 2 files, 33 tests passed.

One correction was made to the tests, not the code: the two tests that reject `updateProjectJson` rejected every call after the injected failure, and a sidecar write also goes through `updateProjectJson` (the counter bump), so the sidecar undos failed too and the result was `state-unknown`. The tests now reject only the first call after the failure, which is the exclusion undo.

## What is excluded from the directory comparison

The comparison is the whole project directory, files and directories, taken just before Undo and again after the failed Undo, both after the Task 29 follow-up's `settleIndexing()` (replicated in the new test; the Task 29 test file is unedited). It excludes what Task 21's comparison excludes, and nothing else: `config.metadataRevision` in `project.json` (the counter is allowed to advance), and the key order of the files under `meta/index/` (compared as JSON with sorted keys). Unlike Task 21 no separate test asserts the counter: this task's tests do not check it, only that the rest of `project.json` is equal.

## Design as built

- Each step records what it needs to be undone when it is entered, before it writes, so the step that threw after writing is undone too: the latest-operation record as raw text (read before the first step), the revision ids each live document had, the original's `content.bin`, derived files and sidecar `updatedAt`/`wordCount` (as Task 21's truncation backup), both documents' `annotations` values, which `.trash` directories existed, the saved compile exclusions.
- On a throw, `compensateUndo` undoes in reverse: record put back as raw text (under `withMetaLock`), exclusion re-listed (earlier list, then any id added since), split-off document taken out of Trash with `restoreResource` and the empty `.trash` directories Undo created removed, note lists put back, original's text and derived files put back from the backups, the preserved revisions Undo made deleted, each after `setRevisionPreserve(false)`. Revisions made by Undo are found by `metadata.splitUndoSave === true` and an id not in the earlier set. Every undo is attempted; one that fails is recorded.
- `failed` now carries `remainingState`: `split-restored` (nothing failed), one of `record-not-restored`, `exclusion-not-restored`, `split-off-in-trash`, `notes-not-restored`, `original-not-restored`, `preserved-revisions-kept` (exactly one undo failed), or `state-unknown` (two or more). The mapping is a decision of this task, not a measurement.
- Two choices keep text reachable when an undo fails. If the split-off document cannot be taken out of Trash, the notes are not moved back to it (they stay on the original) and its saved revision stays with it in Trash. If the original's text cannot be put back, the revision that holds its text from before Undo is kept.
- A locked-access error is rethrown only when the rollback left everything as it was; otherwise the failure and the state are returned.
- The index update after commit is not part of the rollback and does not run for a failed Undo (a test asserts `updateDocumentIndexes` is not called).
- Locks: no new lock is taken; the rollback runs inside the two `revision-content` locks Undo already holds; `restoreResource` takes only the sidecar file lock (the allowed edge).

## What the tests measured (facts)

- For eight injection points (after the first preserved revision; after the second; after the original's overwrite; after the notes were added to the original; after they were removed from the split-off document; after the soft delete; after the exclusion removal; after the record clear) Undo returned `failed` with the step named (`save-current-text` twice, `restore-original`, `move-annotations` twice, `trash-split-off`, `remove-exclusion`, `clear-record`), `cause: "Error"`, `remainingState: "split-restored"`. The state before Undo had an edit in each document after the split, a saved exclusion naming both, and no `.trash` directory. After each: the whole directory equalled the earlier one (with the exclusions above), the latest-operation record text was byte-identical, neither document had a revision made by Undo, the split-off sidecar was live, and `updateDocumentIndexes` was not called. After the mocks were removed, a second Undo of the same split applied.
- With another document already in Trash, a failure after the soft delete left the directory equal to the earlier one. With no `.trash` before, none existed after.
- With the split-off document already in Trash before Undo, a failure at the record clear returned `split-restored`, `restoreResource` and `deleteResourceCore` were not called, and the directory was equal.
- Preserve flag: during a rolled-back Undo the calls were `setRevisionPreserve(..., false)`, `deleteRevision`, then the same pair again, in that order. After a real Undo, `deleteRevision` on the revision Undo saved for the original rejected with `PROTECTED_REVISION_DELETE_MESSAGE`; so a rollback that skipped the flag would be refused.
- A step that cannot be undone, each by an injected failing undo after a failure at the record clear: `deleteRevision` rejecting gives `preserved-revisions-kept` and both saved revisions are still on disk; `restoreResource` rejecting gives `split-off-in-trash` and the trashed sidecar and `.trash/revisions/<id>` are still there; the record write rejecting gives `record-not-restored` and the record file is absent; the original's `content.bin` write rejecting gives `original-not-restored` and the saved revision of the original is kept and holds the text from before Undo; the first `updateProjectJson` write after the failure rejecting gives `exclusion-not-restored`; `mutateSidecar` for the split-off document rejecting gives `notes-not-restored`; `deleteRevision` and the exclusion write both rejecting gives `state-unknown`.
- Two concurrent Undo calls: one `applied`, one `nothing-to-undo`.

## Clauses that cannot be met as worded, and gaps

- "Two overlapping Undo calls end with one applied and one refused": the second call returns `nothing-to-undo` (Task 29's outcome for a cleared record), not a `refused` result; `refused` is the outcome for the five stated causes. The behaviour (one applied, one not) holds; the word differs.
- A failed Undo's `remainingState` has no writer-facing text: `split-messages.ts` is not edited by this task and has none for Undo (as for `could-not-be-checked` and `index-failed`, Task 29). The existing `describeSplitFailure` takes split steps and split states and would read as a failed split. Task 31 or Task 28 needs texts for the eight states.
- In the `split-off-in-trash` state the notes carried back stay on the original (the note undo is skipped on purpose); that is a choice of this task, and the test asserts only the state name, the trashed sidecar and the kept revision directory, not the note lists.
- Not covered: a failure inside `restoreResource` that leaves part of the document moved (the undo is called whenever the step was entered, and was only tested with it rejecting before any move); revision pruning (if creating Undo's preserved revision pruned an older unprotected revision, the rollback does not bring it back; not measured here); a process crash between steps; several server instances; an encrypted project; a hosted tenant; a lock error injected mid-operation.
- Key order of `meta/index/` files after rollback: the comparison normalises it as Task 21's does; the cause of a difference, if any, was not investigated.

## Checks

- `pnpm typecheck` (frontend): exit 0. `pnpm lint` (frontend): 0 errors, 459 warnings (the same as before this task). `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck`: no errors.
- Regression: `tests/unit/split-*`, `revision*`, `meta-locks`, `lock*`, `project-json-lock*`, `file-lock`, `trash*`, `saved-defaults*`, `resource-crud*`: 67 files, 978 tests passed (this run included the new file, the unedited Task 29 file and `split-core-import-graph.test.ts`).
- Not run: the full frontend suite, builds, e2e, any device.
