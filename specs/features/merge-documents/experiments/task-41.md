# Task 41: Undo merge action and the dismissable Undo toast (FR-22, FR-14, FR-23)

Results only. Committed with the task.

## Files

Declared and edited:

- `frontend/components/common/ResourceCommandPalette.tsx`: new "Undo merge" row (and a disabled one for a failed read), alongside "Undo split".
- `frontend/components/Split/SplitUndoHost.tsx`: reads the record's kind, runs Undo for a split or a merge, reports as toasts (no more fixed regions); `SplitUndoRegions` is removed.
- `frontend/src/lib/models/split-messages.ts`: `UNDO_TOAST_DISMISS_LABEL`.
- `frontend/tests/unit/split-messages.test.ts`: one new test for that label.
- `frontend/tests/component/MergeUndoAction.test.tsx` (new): 33 tests.
- `frontend/stories/Merge/MergeUndoAction.stories.tsx` (new).

Declared and **not edited**: `frontend/components/Editor/EditorContextMenu.tsx` (it already renders `SplitUndoMenuItem` and asks the host to read the record at each open, so the merge item arrives through that component) and `frontend/components/Layout/AppShell.tsx` (it already mounts `SplitUndoHost`; the Toaster is mounted in `app/layout.tsx`).

Edits outside the declared Files, each needed:

- `frontend/components/Split/UndoToast.tsx` (new): the toast (`UndoToastView`, `showUndoWorking`, `showUndoStatus`, `showUndoAlerts`, clear helpers) over `react-hot-toast`'s `toast.custom`. No dependency added.
- `frontend/components/Split/SplitUndoMenuItem.tsx`: "Undo merge" item, and a disabled item per operation for a failed read.
- `frontend/components/Split/splitUndoRequest.ts`: availability gained `{ kind: "merge", targetDocumentId, absorbedCount }` and an optional `mergeMessage` on `read-failed`.
- `frontend/src/lib/models/merge-undo-messages.ts`: the merge Undo host texts (below).
- `frontend/stories/Split/SplitUndoAction.stories.tsx`: its two report stories used the removed `SplitUndoRegions`; they now render `UndoToastView`.
- `frontend/tests/component/SplitUndoAction.test.tsx` and `frontend/tests/component/ResourceContextMenuMerge.test.tsx`: existing tests changed, listed below.

## Test-first (red run)

`MergeUndoAction.test.tsx` was written before the host, palette and menu changes (only the message module and `UndoToast.tsx` existed so that it could import). First run: 24 failed (the actions were not offered and the host reported nothing), 9 passed. Two harness problems found and fixed in the test: jsdom has no `matchMedia`, which `react-hot-toast` reads; and the store setup triggers an unrelated alias-table read that fails in jsdom and, with a real `Toaster` mounted, raised a stray "Some data couldn't be loaded correctly." toast beside the Undo ones (found by logging the `reportTransportReadFailure` caller; the test now mocks `transport-validation`). After the implementation: 33 passed.

## Existing tests changed (listed as the owner asked)

`tests/component/SplitUndoAction.test.tsx` asserted the old Undo status and alert regions. Harness changes (a `Toaster` in both harnesses, a `matchMedia` stub, the `transport-validation` mock, `toast.remove()` after each test) and these 15 tests, which failed after the host change and now pass, with their assertions changed from "region text equals X" to "toast contains X", and from "the other region is empty" to "no element of that role":

1. reports success in a status region, leaves the alert region empty, and shows the stored document of the open original
2. sends the pending saves before Undo, and sends nothing when a save fails
3. leaves an unrelated open document as it is after a successful Undo
4. keeps the editor read-only when it shows the document that went to the Trash
5. reports a locked project at the read-back as a failed read-back, not as an undo that did not happen
6. reports a failed read-back of the original in the alert region and keeps the editor read-only
7. reports a committed Undo with failed index updates as a success and an alert naming what was not updated
8. reports a refusal's cause in the alert region, with the Task 10 text, and nothing in status
9. reports nothing-to-undo as its own alert and removes the action
10. reports could-not-be-checked in the alert region
11. reports a failed Undo with the step and the state that remains, and holds the editor read-only
12. a transport failure says it is not known whether Undo ran, never that the split is restored
13. reports a locked project in the alert region
14. passes axe with a status and an alert shown
15. (editor menu) is operable with the keyboard and sends Undo

The names of the tests still say "region"; they were not renamed. The texts they assert are unchanged. File result: 34 passed.

`tests/component/ResourceContextMenuMerge.test.tsx`, "adds no Merge row, item, picker or key handler outside the tree menu": it asserted that `ResourceCommandPalette.tsx` and `EditorContextMenu.tsx` contain no `Merge` at all. Task 41 puts "Undo merge" into the palette (as the task requires), so the check now strips the Undo merge identifiers and wording (`Undo merge`, `UNDO_MERGE_*`, `undo-merge`, the two message module names, `describeUndoMergeAction`) before matching, and still refuses any other `Merge`. The `openMergeDialog` check is unchanged.

No other existing test was modified. `split-messages.test.ts` got a new test and an import, no existing test edited.

## Done-when clauses

| Clause | Test |
|---|---|
| Action reads "Undo merge", only while the latest-operation read returns a merge; "Undo split" only for a split | `MergeUndoAction.test.tsx`: appears for a merge with no "Undo split" row; absent for none; a split record shows "Undo split" and no "Undo merge" row; menu equivalents |
| In any open document | merge row with an unrelated document open and with none open |
| Reachable after a reload | fresh mount reads the stored record (`requestLatestSplitOperation` called once) |
| Names the target and the number of absorbed documents; says the merged mark is removed and edits are kept | row text equals `UNDO_MERGE_LABEL` + `describeUndoMergeAction("Chapter 3", 2)`; that text contains "removes the merged mark from the 2 other" and "Edits made since the merge are kept". **Gap:** the owner-approved description does not literally say the other documents "stay in the tree"; it was reused unreworded as instructed, so that part of the clause is carried only by implication (the mark is removed from documents that remain) |
| Keyboard operable, accessible name | palette: Enter from the search box sends Undo; menu: Enter on the focused item sends Undo; `menuitem` name is "Undo merge"; `aria-describedby` set |
| Undo outcome is a dismissable toast, failure or refusal `role="alert"`, success `role="status"` | success toast is `role="status"` with a Dismiss button that removes it; refusal and failure toasts are `role="alert"` with Dismiss; `UndoToastView` test of both roles |
| After a successful Undo the open editor shows the stored state | open target and open absorbed document are read back into the editor; an unrelated document is left alone |
| A failed read shows its own message, not "no merge" | disabled "Undo merge" row and menu item with `UNDO_MERGE_READ_FAILED_MESSAGE`, plus the disabled "Undo split" row with its own message; locked read has its own text |
| Not rendered on the native runtime | palette and menu: nothing offered and the record not read |
| axe passes | palette row, menu item, and a status plus an alert toast shown together |
| Stories typecheck and lint | `pnpm typecheck` and `pnpm lint` run, clean |
| Screen-reader use | **Not verified** |

## New texts, all drafted and NOT reviewed by the owner

In `frontend/src/lib/models/merge-undo-messages.ts`: `UNDO_MERGE_LABEL` ("Undo merge", the name FR-22 gives), `UNDO_MERGE_READ_FAILED_MESSAGE`, `UNDO_MERGE_READ_LOCKED_MESSAGE`, `UNDO_MERGE_WORKING_MESSAGE`, `UNDO_MERGE_SAVE_FAILED_MESSAGE`, `UNDO_MERGE_LOCKED_MESSAGE`, `UNDO_MERGE_INVALID_REQUEST_MESSAGE`, `UNDO_MERGE_TRANSPORT_FAILED_MESSAGE`, `UNDO_MERGE_UNEXPECTED_FAILURE_MESSAGE`, `UNDO_MERGE_RELOAD_FAILED_MESSAGE`, `UNDO_MERGE_TREE_REFRESH_FAILED_MESSAGE`, `UNDO_MERGE_EDITOR_HELD_MESSAGE`, `UNDO_MERGE_NOTHING_TO_UNDO_MESSAGE`, `UNDO_MERGE_COULD_NOT_BE_CHECKED_MESSAGE`, `UNDO_MERGE_STEP_LABELS`, `UNDO_MERGE_REMAINING_STATE_MESSAGES`, `describeUndoMergeFailure`, `describeUndoMergeSuccess`, `describeUndoMergeIndexFailure`. In `split-messages.ts`: `UNDO_TOAST_DISMISS_LABEL` ("Dismiss"). Carried over from Task 38 and still unreviewed: the refusal texts `target-in-trash` and `absorbed-snapshot-gone`. Reused without rewording: `describeUndoMergeAction` and the two `UNDO_MERGE_REFUSAL_MESSAGES` of `merge-messages.ts`. No toast title was added.

## Decisions and assumptions

- The toast is `react-hot-toast`'s `toast.custom` with the role on our own element (the library's custom path adds none). A success stays 10 s unless dismissed; a failure or refusal stays until dismissed; the working report has no Dismiss and is replaced by the result. Two toasts at most (status and alert), each its own id, so a committed Undo with a failed index update shows a success and an alert as before.
- The 10 s figure is a choice made here, not measured against any reader.
- The host picks the wording of the outcomes the two operations share (`nothing-to-undo`, `could-not-be-checked`, a client `failed`) from the availability it held when Undo started; a `merge-*` result always uses merge texts.
- A failed read of the record shows two disabled rows (split and merge), each with its own message, since the kind is unknown.
- The target name in the merge success text comes from the server (`targetName`), falling back to the tree name, then to "The first document".
- After a committed merge Undo the editor is read back when it shows the target or any absorbed document that was not skipped; a skipped one (in Trash or purged) cannot be open.

## Checks

- `pnpm typecheck`, `pnpm lint` (0 errors, 459 warnings, same total as before): clean.
- `pnpm exec vitest run tests/component`: 104 files, 1744 tests passed. A run of `tests/component tests/a11y` together once failed `native-compile-entry-paths.test.tsx` "Compile Project with the native transport produces a PDF" at 5016 ms (the default 5 s limit) and it passed in the component-only run; not investigated, a load-time timeout is a hypothesis, not established.
- Electron and CLI typecheck run in the check step of this commit (below).

## Not measured

Screen-reader announcement of either toast; keyboard focus movement into or out of a toast (the Dismiss button is focusable, focus is not moved to it); behaviour on a device; a real Next server round trip; the toast on a narrow phone width; two Undos in quick succession beyond the busy guard; `react-hot-toast` limits on many toasts.
