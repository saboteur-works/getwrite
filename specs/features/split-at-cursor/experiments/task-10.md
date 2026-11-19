# Task 10: message constants module (drafted wording)

Commands were run from the repository worktree; paths are repository-relative. The wording below is a draft for the owner's review at Task 28. It is not final.

## Files

- `frontend/src/lib/models/split-messages.ts` (new).
- `frontend/tests/unit/split-messages.test.ts` (new): 8 tests.
- `specs/features/split-at-cursor/experiments/task-10.md` (this file).

Type defined in this file, not in `split-types.ts` (Task 9 only edits that): `SplitUndoRefusalReason` and the constant `SPLIT_UNDO_REFUSAL_REASONS` (`original-gone`, `original-in-trash`, `original-purged`, `snapshot-gone`, `split-off-split-since`), the five Undo refusals of FR-17. Task 29 will need these codes; it may import them from `split-messages.ts` or ask the owner to move them.

## Tests first: failing run

Command: `pnpm exec vitest run tests/unit/split-messages.test.ts` (from `frontend/`), run before `split-messages.ts` existed.

Observed: 1 test file failed, no tests ran; the import of the missing module did not resolve.

## Green run

Command: `pnpm exec vitest run tests/unit/split-messages.test.ts tests/unit/split-core-import-graph.test.ts tests/unit/split-types.test.ts`: 3 files passed, 29 tests passed (8 + 5 + 16). The import-graph test now walks `split-messages.ts` as well as `split-types.ts`.

After a later edit of one text (`step-failed`), `split-messages.test.ts` alone was re-run: 8 passed.

## Checks

| Check | Command | Result |
|---|---|---|
| frontend typecheck | `pnpm typecheck` (frontend) | run, no errors printed |
| frontend lint | `pnpm lint` (frontend) | run, 0 errors, 459 warnings; the filtered output shows no warning naming a `split-` file |
| electron typecheck (both tsc passes) | `pnpm --filter getwrite-electron typecheck` | run, no errors printed |
| cli typecheck | `pnpm --filter getwrite-cli typecheck` | run, no errors printed |

The full unit suite was not run.

## What the tests assert

- Every `SPLIT_REFUSAL_REASONS` value has a non-empty text, and the text map has no other keys.
- The five Undo refusals each have a non-empty text.
- A text exists for the compile exclusion list notice, for each of the five remaining states, and a label for each of the seven steps.
- No two texts are equal (refusals, Undo refusals, notice, remaining-state texts all in one set; step labels in their own).
- `describeSplitFailure(step, state)` contains the step label and the state text, gives a distinct string for each of the 35 pairs, and begins "The split did not finish".
- No text holds an interpolation marker; no function takes client input (keys are closed enums).

## Texts for owner review (draft)

Refusals (`SPLIT_REFUSAL_MESSAGES`):

- media-resource: "An image or audio file has no text to split."
- folder: "A folder has no text to split."
- source: "A Source cannot be split. Its notes and attachments belong together."
- entity-document: "A document set up as an entity cannot be split. Remove the entity first if you want to split it."
- merged-document: "A document made by merging cannot be split."
- cursor-in-table-cell: "The cursor is inside a table cell. Move it out of the table to split here."
- cursor-in-code-block: "The cursor is inside a code block. Move it out of the code block to split here."
- empty-first-half: "There is no text before the cursor, so the first part would be empty. Move the cursor later in the document."
- empty-second-half: "There is no text after the cursor, so the second part would be empty. Move the cursor earlier in the document."
- stale-cursor: "The document changed after you placed the cursor. Place the cursor again and retry."
- locked-project: "This project is locked. Unlock it to split a document."
- step-failed: "The split could not be finished. The message that follows says what state your document is in."

Undo refusals (`SPLIT_UNDO_REFUSAL_MESSAGES`):

- original-gone: "The document that was split can no longer be found, so the split cannot be undone."
- original-in-trash: "The document that was split is in the Trash. Restore it first to undo the split."
- original-purged: "The document that was split has been permanently removed, so the split cannot be undone."
- snapshot-gone: "The saved copy of the document from before the split is no longer kept, so the split cannot be undone."
- split-off-split-since: "The new document has been split again since. Undo that split first, or leave this one as it is."

Notice (`SPLIT_COMPILE_EXCLUSION_NOTICE`): "The document was split. The new part could not be added to the list of documents left out of compile, because that list is full or could not be read. It will be included in compile unless you leave it out yourself."

Failure composition (`describeSplitFailure`): "The split did not finish. It stopped while <step label>. <remaining-state text>"

Step labels: lock-original "securing the document"; snapshot "saving a copy of the document"; create-document "creating the new document"; move-annotations "moving notes to the new document"; seed-exclusion "updating the list of documents left out of compile"; truncate "shortening the original document"; write-records "recording the split".

Remaining-state texts:

- original-restored: "Your document is as it was before, and nothing new was kept."
- snapshot-revision-kept: "Your document is as it was before. A saved copy of it from before the split was kept in its revisions."
- new-document-remains: "A new document may have been left behind. Check the project for it and delete it if you do not want it."
- original-truncated: "Your original document was shortened, but the split was not recorded. Its earlier text is in the revision saved just before the split."
- state-unknown: "It could not be checked what was changed. Look at the document and its revisions before you carry on."

## Notes and open points

- The task text names a "failed step that names the state that remains"; the contract carries `failedStep` and `remainingState` as separate fields, so the text is composed by `describeSplitFailure` rather than held as one constant per step.
- The `original-truncated` text states that the earlier text is in the revision saved just before the split. That holds only if the snapshot step completed before the truncate step, which the step order of FR-6 gives; whether Task 21's compensation can leave that state is not measured here.
- The `snapshot-revision-kept` and `new-document-remains` texts describe states Task 21 may or may not produce; Task 21 should confirm which `SplitRemainingState` values it can return.
- The Undo refusal texts cover FR-17's five causes. The FR-15 state "could not be checked" has no text here; whether Undo refuses on it with its own message is for Task 29 to decide.
