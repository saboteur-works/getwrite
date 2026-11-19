# Task 39: Undo merge rollback and failure injection (FR-22, FR-6 rules)

Results only. Committed with the task.

## Files

- `frontend/src/lib/models/split-undo-core.ts`: reverse compensation for the merge branch (`compensateMergeUndo`, `MergeUndoProgress`, `backUpMark`, `restoreMark`, `MergeUndoRemainingState`); `removeSavedRevisions` gained an optional `flag` argument (default `splitUndoSave`, so the split call sites are unchanged). Split code otherwise unchanged.
- `frontend/tests/unit/merge-undo-compensation.test.ts` (new): 19 tests.
- Existing tests not edited: `split-undo-core.test.ts`, `split-undo-compensation.test.ts`, `merge-undo-core.test.ts`.

## Test-first (red run)

The new test file was written before the implementation. Run 1 (`pnpm exec vitest run tests/unit/merge-undo-compensation.test.ts --project node`): 15 failed, 4 passed. Some of those failures were test bugs (a `vi.spyOn` argument that read the already-replaced export, a recursion `RangeError`; an assertion that the cause contained the injected message while `causeOf` returns the error name), fixed in the test. Run 2, after the fixes and before the implementation: 16 failed, 3 passed. Remaining failures were the expected ones: `remainingState` was `state-unknown` where `merge-restored` or a named state was asserted (no compensation existed), and in the overlapping-record case `nothing-to-undo` where `applied` was expected after a failed Undo (the record had been cleared and not put back). The 3 that passed were the step-coverage check, the overlapping-calls test (already true from Task 38) and one injected case.

After the implementation: the new file, `merge-undo-core`, `split-undo-core`, `split-undo-compensation`: 4 files, 88 tests passed.

## What is asserted

| done_when clause | Test |
|---|---|
| A failure after each write step restores the merged state, compared by directory snapshot, record still present | `restores the merged state ...` x12: after the preserved revision of the target, of the first and of the last absorbed document; after the target's overwrite; after each absorbed document's text; after a note was put back on each absorbed document and after the notes left the target; after each mark cleared; after the record clear. The snapshot is taken after settling the indexer, before Undo, and compared with every file and directory after (same normalisation as `split-undo-compensation.test.ts`: `config.metadataRevision` ignored, `meta/index/*.json` compared with sorted keys) |
| Every step of `MERGE_UNDO_STEPS` is covered | `covers every step of the order` |
| The failure is returned with the step and never reads as success | each case asserts `outcome: "failed"`, `failedStep`, a non-empty `cause`, `remainingState: "merge-restored"` |
| Undo is still available | `leaves Undo available: the same Undo works once the failure is gone` |
| A step that cannot be undone returns the state that remains, named | `names the remaining state when the preserved revisions cannot be deleted` (`preserved-revisions-kept`), `...the record cannot be put back` (`record-not-restored`), `...a mark cannot be put back` (`marks-not-restored`), `...two things cannot be put back` (`state-unknown`) |
| Two overlapping Undo calls end with one applied and one refused | `overlapping calls`: outcomes are `applied` and `nothing-to-undo` |
| Existing split-Undo compensation tests unmodified | `split-undo-compensation.test.ts` passes, not edited |

"Refused" in the last clause: the second call is answered `nothing-to-undo` (it finds the record already cleared inside the locks), the same wording choice the split Undo test makes. It is not a `refused` outcome with a reason.

## Decisions and assumptions

- Compensation order is the reverse of the forward order: record, marks, note lists, each document's text and derived values, then the preserved revisions. Every undo is attempted; one failure names its kind, two or more kinds are `state-unknown`.
- Each backup is taken when its step (or its document within the step) is entered and before its write, so a step that threw after writing is undone too. A restore is idempotent.
- A mark is put back with the sidecar's original key order (the key order is stored in the backup): without that the directory snapshot differed (a mark restored at the end of the file). This was found when three of the injected cases failed after the first implementation; the cause was the key position, established by the passing result after the order was kept.
- If a document's text cannot be put back, the preserved revision that holds its text from before Undo is kept for that document (as the split Undo does).
- `MergeUndoRemainingState` is new and has no message text yet. The routes, client and host texts for these states are Tasks 40 and 41; any text added there is drafted, not owner-reviewed.
- `failed` before the first write with a locked-access error is still rethrown (unchanged from Task 38).

## Checks

- `pnpm typecheck` (frontend): clean.
- `pnpm lint` (frontend): 0 errors, 459 warnings (same total as Task 38).
- `pnpm --filter getwrite-electron typecheck` (both passes): clean.
- `pnpm --filter getwrite-cli typecheck`: clean.
- Prettier applied to the two touched files.

## Not measured

An encrypted project; a hosted tenant; a locked project through a failed Undo; an injected failure inside the post-lock index update (that is `index-failed`, outside the rollback by design); an absorbed document in Trash combined with an injected failure; a failure injected after a sidecar write other than the ones listed; a process restart between a failed Undo and the next one (the next Undo is shown working in the same process).
