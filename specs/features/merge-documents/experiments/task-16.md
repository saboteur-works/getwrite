# Task 16: merge message constants (drafted wording)

No behaviour change: a pure constants module and its test.

**The wording below is a DRAFT.** The owner reviews it in Task 37. Texts name no mechanism that no experiment separated, and none echoes client input (lookup keys are closed enums; the only dynamic parts are numbers and a document name the caller reads from the project tree).

## Failing run (tests first)

`pnpm exec vitest run tests/unit/merge-messages.test.ts` before `merge-messages.ts` existed: 1 file failed to load (module `merge-messages` not found), no tests ran.

## Green run

`pnpm exec vitest run tests/unit/merge-messages.test.ts tests/unit/split-core-import-graph.test.ts`: 2 files passed, 24 tests passed. The import-graph test walks `merge-*.ts`, so it covers the new module (no React, JSX, JSON or `node:*`).

## Checks

- `pnpm typecheck` (frontend): run, clean.
- ESLint on the two new files (`merge-messages.ts`, `merge-messages.test.ts`): run, clean. The whole-project `pnpm lint` was not run; only the touched files were linted.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): run, clean.
- `pnpm --filter getwrite-cli typecheck`: run, clean.

## Texts for owner review (draft)

### Refusals, one per reason code of Task 15 (`MERGE_REFUSAL_MESSAGES`)

- fewer-than-two-documents: "Select at least two documents to merge."
- repeated-id: "The same document appears more than once in the selection."
- folder: "A folder is in the selection. Folders cannot be merged, so select only documents."
- media-resource: "An image or audio file is in the selection. It has no text to merge."
- source: "A Source is in the selection. A Source cannot be merged. Its notes and attachments belong together."
- entity-document: "A document set up as an entity is in the selection. Remove the entity first if you want to merge it."
- merged-target: "The first document you selected was already merged into another document. Choose a different first document."
- merged-absorbed: "A document in the selection was already merged into another document. Remove it from the selection."
- missing-document: "A document in the selection can no longer be found."
- document-in-trash: "A document in the selection is in the Trash. Restore it first, or leave it out."
- stale-content: "A document changed after the merge dialog opened. Open the dialog again and retry."
- annotation-limit: "The first document cannot hold all the notes that were chosen to move."
- too-many-documents: "Too many documents are selected to merge at once."
- locked-project: "This project is locked. Unlock it to merge documents."
- step-failed: "The merge could not be finished. The message that follows says what state your documents are in."

### Counted refusals

- `MERGE_ANNOTATION_LIMIT_MESSAGE`: "There would be too many notes on the first document, so nothing was merged. Leave some notes behind, or remove some, and try again."
- `describeMergeAnnotationLimit({existing, incoming, limit})`: "The first document has {existing} notes and {incoming} more were chosen to move, but a document holds at most {limit}. Nothing was changed."
- `MERGE_DOCUMENT_CAP_MESSAGE`: "You selected too many documents to merge at once. Select fewer and try again. Nothing was changed."
- `describeMergeDocumentCap(limit)`: "A merge takes at most {limit} documents. Select fewer and try again. Nothing was changed."

### Failed merge (`describeMergeFailure(step, remaining)`)

Form: "The merge did not finish. It stopped while {step label}. {remaining state text}"

Step labels: lock-documents "securing the documents"; snapshot "saving copies of the documents"; move-annotations "moving notes to the first document"; write-marks "marking the documents that were merged"; strip-absorbed-marks "removing note marks from the merged documents"; append-to-target "adding the text to the first document"; write-records "recording the merge".

Remaining states:
- documents-restored: "Your documents are as they were before, and nothing new was kept."
- snapshot-revisions-kept: "Your documents are as they were before. Saved copies of them from before the merge were kept in their revisions."
- partially-written: "Some documents may have been changed. Look at each document and its revisions: a copy of the text from before the merge was saved just before any change."
- state-unknown: "It could not be checked what was changed. Look at the documents and their revisions before you carry on."

Note for review: the `partially-written` text asserts that a snapshot precedes any change. That follows the write order of Task 15's `MERGE_STEPS` (snapshot before the later writes); it is a statement of the planned order, and Task 25/26 must keep it true or this text must change.

### Dialog warnings (OQ-12; the merge proceeds)

- `MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING`: "The first document is left out of compile, so the text added to it will be left out of compile too. You can still merge."
- `MERGE_TARGET_IN_INBOX_WARNING`: "The first document is in the Inbox, so the text added to it will not count toward your goals. You can still merge."

### Merged-mark states (`MERGE_MARK_STATE_MESSAGES`, `describeMergedMarkLabel`)

- live: "Merged into “{target name}”" (a live state with no name resolves to the could-not-be-checked text, never blank)
- revision-no-longer-kept: "Merged into another document, whose saved copy from before the merge is no longer kept"
- target-in-trash: "Merged into a document that is now in the Trash"
- target-permanently-removed: "Merged into a document that has been permanently removed"
- could-not-be-checked: "Merged into another document, which could not be checked" (the resolver's `cause` is never shown)

### Rule texts for FR-17 to FR-20 (`MERGED_RULE_TEXTS`)

- compile: "It is left out of compile, in every format."
- exportAndSearch: "It is still included in export and still found by search."
- goals: "Its words no longer count toward the project goal, the daily goal or the goal filter."
- wordCounts: "Its words are left out of the project word totals. Its own word count is unchanged."

Tree label rule (`MERGED_TREE_LABEL_RULE`): "Left out of compile, goals and word totals. Still exported and searchable."

Notice line (`MERGED_NOTICE_LINE`): "This document was merged into another. It is left out of compile, goals and word totals, but it is still exported and found by search. You can still edit it."

Review point: the goals rule says "no longer count", while FR-19 says entries dated before the merge keep counting in the daily goal. The draft does not state that distinction; the owner may want it added.

### Undo merge

- target-gone: "The document the others were merged into can no longer be found, so the merge cannot be undone."
- snapshot-gone: "The saved copy of the first document from before the merge is no longer kept, so the merge cannot be undone."
- `describeUndoMergeAction(name, n)`: "Puts “{name}” back as it was before the merge and removes the merged mark from {n} absorbed document(s). Edits made since the merge are kept in saved revisions." With no name: "the first document (its name could not be found in the project)".

Review point: the Undo action text states that edits made since are kept in saved revisions. Task 38 (Undo merge) must do this, as Undo split does, or the text must change.

## Not in this task

The index-failure text (Task 27) and the owner's wording review (Task 37). Success and host texts of the dialog are not in Task 16's Done when and are not written here.

## Done-when mapping

- Text for every Task 15 reason code, each distinct: test "has a non-empty text for every reason code" and the final distinctness test.
- Warning (OQ-12), annotation-limit, document-cap, stale, locked, failed step, four mark states, rule texts, notice line, Undo refusals and Undo wording: each has a named export and a test above.
- No client input echoed: the only parameters are numbers, a tree-supplied name, and closed enums; a test shows the resolver `cause` is not rendered.
- No React/JSX/JSON: covered by the import-graph test (green).
