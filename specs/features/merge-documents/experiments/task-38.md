# Task 38: Undo merge core (FR-21, FR-22)

Results only. Forward path and refusals; reverse compensation is Task 39. Nothing committed.

## Files

- `frontend/src/lib/models/split-undo-core.ts`: merge branch appended (`undoLatestOperation`, `undoLatestMerge`, `MergeUndoResult`, `MERGE_UNDO_STEPS`). The split code above it is unchanged.
- `frontend/tests/unit/merge-undo-core.test.ts` (new): 21 tests, real project directories, merge made by `applyMerge`.
- `frontend/src/lib/models/merge-undo-messages.ts` (new, **beyond the declared Files**): the four Undo merge refusal texts. Reason: Task 37 owns `merge-messages.ts` concurrently, so new text was not put there; the two texts it already holds (`UNDO_MERGE_REFUSAL_MESSAGES`) are imported and reused (`target-gone` serves `target-purged`, `snapshot-gone`), two are new and drafted, not owner-reviewed (`target-in-trash`, `absorbed-snapshot-gone`).
- `frontend/tests/unit/split-undo-core.test.ts`: **not edited.**

## Test-first (red run)

`merge-undo-core.test.ts` was written before the implementation. First run (`pnpm exec vitest run tests/unit/merge-undo-core.test.ts --project node`):

`Test Files 1 failed (1)`, `Tests 19 failed | 2 passed (21)`, each failure `TypeError: undoLatestOperation is not a function`. The two that passed exercise existing behaviour (`undoLatestSplit` answering `unsupported-operation` for a merge record; the distinct-text check on a message record that already existed in part).

After the implementation: `merge-undo-core`, `split-undo-core`, `split-undo-compensation`: 3 files, 69 tests passed. Existing split tests unmodified.

## Decision to confirm: where the dispatch lives

`done_when` says the `unsupported-operation` outcome for a merge record "is replaced", and the owner brief says the existing split-undo tests must pass unmodified. The existing test `does not undo a merge record` asserts `undoLatestSplit` returns `unsupported-operation` for a merge record, so both cannot hold on the same function. Chosen: `undoLatestSplit` is left as it was (split only, return type unchanged, so the route, client and host still typecheck), and a new sibling `undoLatestOperation(projectId, options)` reads the record and dispatches: split goes to `undoLatestSplit`, merge goes to the new merge branch. The `unsupported-operation` outcome is therefore replaced for the dispatching entry, and still returned by `undoLatestSplit`. The route (`app/api/project/split/undo/route.ts`) still calls `undoLatestSplit`, so an HTTP Undo of a merge still answers `unsupported-operation` until Task 40 switches the route to `undoLatestOperation`. If the owner prefers `undoLatestSplit` itself to dispatch, that one existing test must change.

## Done-when clauses and the test pinning each

| Clause | Test |
|---|---|
| Dispatch on `record.kind`; a split and a merge both undo | `undoes a split and a merge, each through the same entry` |
| Reads the record from disk, works from the stored record | `works from the stored record alone...` (reads `meta/latest-operation.json`, asserts kind `merge`, calls with the project id only). This is a re-read of the stored file in one process, not a restart |
| Refuses, distinct text, nothing changed: target in Trash / purged / snapshot gone | `refuses when the target is in the Trash`, `...is purged`, `...snapshot is no longer kept` (directory snapshot equal before and after) |
| Absorbed snapshot gone is a refusal | `refuses when an absorbed document's snapshot is no longer kept`; `gives each refusal cause its own text` |
| Absorbed in Trash or purged: no-op for it, never purged | `leaves an absorbed document in the Trash alone, never purges it...` (`.trash` subtree equal), `treats a purged absorbed document as a no-op...` |
| Edited target / absorbed since is not a refusal; edit kept in a preserved revision of the document it was made in | `keeps an edit made to the target...`, `keeps an edit made to an absorbed document...`, `is not refused when both ... were edited since` (preserved revisions' `content.bin` contain the edited text) |
| Current text of each affected document saved as its own preserved revision, non-canonical | `puts every document's text back...` (checks `isCanonical false`, `preserve true`, one per live document, order target then absorbed) |
| Target and absorbed text restored from snapshots with the no-log write | same test; the no-log function is `writeCanonicalContentWithoutLog` with `lockHeld: true`; the absorbed text is written only where it differs |
| Annotations moved back; unchosen stay | `moves a chosen note back...`, `leaves a note that was not chosen where it was` |
| Marks cleared, record cleared so Undo runs once | first test and `works from the stored record alone` (second call `nothing-to-undo`) |
| `wordCount` and derived files synced | `...wordCount and derived files follow the restored text` |
| Index failure reported without rollback | `reports an index failure without undoing the Undo` (injected `updateDocumentIndexes` failure) |
| Writing-log directory byte-identical across Undo | `leaves the writing-log directory byte-identical across Undo` (snapshot taken after the two edits, before Undo) |

## Decisions and assumptions

- Locks: the `revision-content` lock of every affected document, ascending key order (as `applyMerge`), held to the end of the writes; the record is read again inside them and compared with the first read (a difference is `could-not-be-checked`, cause `record-changed`).
- Each document, target and absorbed, is resolved through the Task 21 resolver (`resolveMergedMarkState`) fed the document's own four probes and its snapshot ref; `could-not-be-checked` is its own outcome, never a refusal or `nothing-to-undo`.
- Which notes go back: notes on the target whose ids have an `annotation` mark in a live absorbed document's snapshot text. The record does not store the chosen ids, so this is derived. A note of an absorbed document that is in Trash or purged stays on the target (it stays on a document; its mark is absent from the restored target text, so it reads as detached there).
- A merge record that does not carry exactly one snapshot ref per affected document (ids unique, at least two) is `could-not-be-checked` with cause `record-malformed`, nothing changed (a test hand-edits a stored record).
- Metadata values the merge carried onto the target are not reverted: FR-22 lists no step for them. Not tested either way.
- The mark of an absorbed document that is in Trash is not cleared (Undo does not write into Trash); a later restore of that document would carry the stale mark. Not tested.
- `failed`: a step that throws returns `{ outcome: "failed", operation: "merge", failedStep, cause, remainingState: "state-unknown" }`. No compensation exists (Task 39), so nothing is claimed about what remains; the preserved revisions already written stay. A locked-access error before the first write is rethrown. No injected failure test was written here (Task 39).
- Result shape: merge results carry `operation: "merge"`; split results are unchanged and carry none. `MergeUndoResult` is a separate type from `SplitUndoResult` (widening the split one would break narrowing in the route, client and host); Task 40 decides how the route maps it.

## Checks (run from the worktree)

- `pnpm typecheck` (frontend): clean.
- `pnpm lint` (frontend): 0 errors, 459 warnings (same total as `task-27.md`).
- `pnpm --filter getwrite-electron typecheck` (both passes, including `tsconfig.worker.json`): clean.
- `pnpm --filter getwrite-cli typecheck`: clean.
- `pnpm test:ci` (frontend): 1051 files passed, 14994 tests passed, 8 expected fail, 3 skipped.
- Prettier applied to the three touched source and test files.

## Not measured

Overlapping Undo calls and failure injection at each step (Task 39); an encrypted project; a hosted tenant; a locked project through Undo; a merge of documents with the carried metadata then Undo; a project reload as a process restart; a note whose absorbed document is in Trash; the lock-order guard is installed by `tests/setup.ts` and did not fire, but no test targets lock order on the Undo specifically.
