# Task 37: owner wording review

## Owner decision, Gate 5, 2026-11-19

The owner approved these exact changes; they were applied as written.

1. `MERGED_RULE_TEXTS.goals` is now "It no longer counts toward the project goal or the goal filter. For the daily goal, words written before the merge still count." (FR-19.)
2. The Compile notice moved to `merge-messages.ts` as `COMPILE_MERGED_NOTICE` (text unchanged). It shows only when a document being compiled is merged. Whole-project dialog: any project document carries the mark. Entity dialog: an id of the entity's associated set (new optional `EntityCompileMode.candidateResourceIds`, passed by `EntityCompileSection` as the rows' ids before the merged exclusion) is a merged document. Before, entity mode showed it whenever any document in the project was merged.
3. `MERGED_NOTICE_LINE` is now "It is left out of compile, goals and word totals, but it is still exported and found by search. You can still edit it." The first sentence ("This document was merged into another.") is dropped for every state, not only "available". Choice and reason: every label in `MERGE_MARK_STATE_MESSAGES` and the available label ("Merged into “<name>”") already begins "Merged into ..." and is shown above the line, so no state loses the statement that the document was merged. The label line was not changed.
4. MergeDialog: "Added no. {n}: {name}" is "Document {n}: {name}" ("First document: {name}" kept); legend is "(combined with the first document's values)".
5. Undo description: "removes the merged mark from the other document" (one) / "from the N other documents".
6. Host texts (`MERGE_SAVE_FAILED_MESSAGE`, `MERGE_READ_FAILED_MESSAGE`, `MERGE_UNEXPECTED_FAILURE_MESSAGE`, `MERGE_RELOAD_FAILED_MESSAGE`, `MERGE_TREE_REFRESH_FAILED_MESSAGE`, `MERGE_SUCCESS_TITLE`, `describeMergeSuccess`) moved unchanged into `merge-messages.ts` (FR-23); `MergeHost.tsx` imports them.
7. Everything else unchanged.

## Files edited beyond the declared Files

- `frontend/components/common/CompilePreviewModal.tsx` (notice condition, import, `EntityCompileMode` field)
- `frontend/components/Sidebar/EntityCompileSection.tsx` (passes `candidateResourceIds`)
- `frontend/components/Merge/MergeDialog.tsx`, `frontend/components/Merge/MergeHost.tsx`
- `frontend/tests/component/MergeDialog.test.tsx`, `frontend/tests/component/MergeRuleCompile.test.tsx`

## Tests

Added: whole-project notice shown with / hidden without a merged document (existing tests, now using the constant); entity mode shown when an associated document is merged and hidden when only an unassociated one is, at the dialog level and through `EntityCompileSection`; `merge-messages.test.ts` pins the goals text, notice line, Undo singular/plural, `describeMergeSuccess`, and includes the moved texts in the no-two-equal check.
Order: the code and tests were written in one pass, so the new tests were not shown failing first.

## Results

- `pnpm typecheck`: green. `pnpm lint`: 0 errors (459 existing warnings). `pnpm test:ci`: 1050 files, 14977 passed, 8 expected fail, 3 skipped.
- `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck`: green.
- Stories: none pinned the old strings; not rebuilt (Storybook builds run from the main checkout).

## Owner decision, Gate 5, 2026-11-19 (FR-22)

`describeUndoMergeAction` now ends its first sentence "..., which stay where they are in the tree." (singular: "..., which stays where it is in the tree."), so the Undo merge action states that the other documents stay in the tree. The rest of the text is unchanged. Tests updated: `merge-messages.test.ts` (new singular and plural assertion, existing assertions adjusted to the comma), `MergeUndoAction.test.tsx`. No story pins the string.
