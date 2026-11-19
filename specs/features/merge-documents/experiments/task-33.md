# Task 33: merge dialog component (FR-11, FR-23)

Results only.

## Files

- `frontend/components/Merge/MergeDialog.tsx` (new): presentational dialog; props `isOpen`, `preview`, `refusal`, `isSubmitting`, `failure`, `status`, `onConfirm`, `onClose`.
- `frontend/tests/component/MergeDialog.test.tsx` (new): 27 tests. `frontend/tests/component/MergeA11y.test.tsx` (new): 10 tests, 7 with real `axe-core`.
- `frontend/stories/Merge/MergeDialog.stories.tsx` (new): 9 stories.

## Test-first

`MergeDialog.test.tsx` was written first. Run with the component moved aside: `Test Files 1 failed`, `no tests` (the import of `components/Merge/MergeDialog` did not resolve). After the component: 27 of 27 passed on the first run. `MergeA11y.test.tsx` was written after the component (order inverted for that file: the component it exercises already existed and the contract tests were already in place). First run of it: 1 failed, the keyboard test, because it pressed ArrowDown on a native select, which jsdom with `user-event` does not act on; the test now focuses the select and chooses an option with `selectOptions`. After that: 37 of 37 across the two files.

## Shared controls read before use

Read the source of `Button` (`variant` `secondary` and `outline`, `type` defaults to `button`, `disabled`), `Checkbox` (a plain `input type=checkbox`, `className`, `checked`, `onChange`), `Select` (a plain `select`, so `value`, `onChange`, `id`, children `option`), `Dialog`, `DialogContent` (`maxWidth`, `className`, `onOpenAutoFocus`, `onCloseAutoFocus`, ref), `DialogTitle`, `DialogDescription`, `DialogFooter`, and the stories `Foundations/Button`, `Foundations/Checkbox`, `Foundations/Select`, `Foundations/Dialog` and `Split/SplitDialog`. No prop was used that those sources do not declare. `Input` is not used (there is no name field).

## Done-when clauses

| Clause | Test |
|---|---|
| Names the target by name with a visible text label, shows the append order and each document's folder path | `names the target...` ("First document: Chapter 1", "Added no. 2", "Added no. 3" in an ordered list named "Documents in the merge"); `shows each document's folder path in text` |
| Opens with annotations ticked per annotation grouped by absorbed document and kind; every metadata choice unticked; same defaults whatever the last choice was | `ticks every annotation...` (lists named "Notes in Chapter 2", "Citations in Chapter 2", "Claims in Chapter 3"); `leaves every metadata choice unticked...`; `opens with the same defaults after a previous choice was changed and the dialog reopened` |
| Stores nothing: no `localStorage`, no config write | `stores nothing...` (`Storage.prototype.setItem` spy and a `fetch` spy never called across a full interaction); the component imports no storage or API module |
| Cancel and Escape change nothing (writes and calls counted) | two tests: `onClose` once, `onConfirm` never, no `setItem`, no `fetch` |
| Word count of each document from the preview data | `shows the word count of each document...` ("1,200 words", "1 word", "2,500 words") |
| States the rule of FR-17 to FR-20 for each absorbed document | `states the rule...` (the four `MERGED_RULE_TEXTS`, from `preview.absorbed[].rules`, in a list named "What happens to Chapter 2") |
| Warning when the target is excluded from compile or in the Inbox, merge stays available | `shows the compile and Inbox warnings while Merge stays available` (the two Task 16 constants, button enabled) |
| Cap refusal and annotation-limit refusal from the Task 16 constants | `shows the cap refusal with the cap constant` (`describeMergeDocumentCap(MERGE_DOCUMENT_CAP)`); `shows the annotation-limit refusal with the counts, or the generic text`; other reasons from `MERGE_REFUSAL_MESSAGES` |
| A metadata field takes one source or none; a multiselect shows as united | `offers one source or none...` (a select: "Keep the first document's value" plus one option per source); `takes one source for a field: choosing another replaces the first, and none clears it`; `shows a multiselect as united` (a group whose legend says the values are united, one checkbox per source); the confirm test produces repeated `fields` entries and `unitedMultiselectFields: ["tags"]` as `applyMergeMetadataCarry` expects |
| Failure in `role="alert"`, status in `role="status"` | `shows a failure in role=alert...`; the regions stay mounted and empty when idle; the status stays mounted while closed |
| Focus enters the dialog and returns on close | `moves focus into the dialog on open and returns it on close` |
| Lists are lists with accessible names; state in text, no red | `gives every list an accessible name`; `uses no red class`; a refusal is text in the alert region |
| Keyboard operation and axe pass | `MergeA11y.test.tsx`: axe on `document.body` with `region` off (the harness has no landmarks; jsdom `color-contrast` is off in `runAxe`) for the default, nothing-to-carry, cap refusal, annotation-limit refusal, failure, submitting and closed-with-status states: no violations; Tab order, Space on a checkbox, Enter to submit |
| Stories per state, typecheck and lint | 9 stories: Default, WithWarnings, NothingToCarry, RefusedCap, RefusedAnnotationLimit, RefusedSelection, Submitting, Failed, StatusAfterMerge; `pnpm typecheck` covers them |

## Decisions

- Metadata value display: a string as itself, a list joined by ", ", other values as JSON. A field counts as a multiselect when every offered value is a list; that is a presentation rule here, since the preview data carries no field type. A field whose values are lists but whose target value is not a list would be refused by the core as `not-a-list` and shown as a failure; not exercised in this task.
- Initial focus goes to the first enabled control in the content (the first annotation checkbox, else the first select, else Cancel), because the dialog has no text field.
- The dialog lists the documents in an ordered list and labels them "First document" and "Added no. N" instead of ordinal words.
- Wording is the drafted text of Task 16 where a Task 16 constant exists; the labels written in this component ("First document", "Added no. 2", "Move these to the first document", "Copy these details to the first document", "Keep the first document's value", the explanatory sentence and the dialog description) are new drafts for the owner's wording review in Task 37.

## Checks

- `MergeDialog.test.tsx` and `MergeA11y.test.tsx`: 37 passed.
- `pnpm typecheck` (frontend), electron `pnpm typecheck` (both passes), cli `pnpm typecheck`: clean. `pnpm lint`: 0 errors, 459 warnings (the total of the earlier tasks); eslint on the new files prints nothing.
- The stories were not rendered: the Storybook runner and `pnpm test:e2e` do not run in this sandbox, so the story-level `a11y: { test: "error" }` check was not run.
- Screen reader: NOT VERIFIED (none was run; jsdom axe cannot judge reading order or announcements).
- Colour contrast: not checked (axe's `color-contrast` is off under jsdom); the dialog uses the same tokens as `SplitDialog`.
- A native select's arrow-key behaviour was not asserted (jsdom does not implement it).

## Not measured

The dialog at 25 documents with hundreds of annotations (rendering time and scrolling), phone width, a real browser, focus return when the opening element is removed from the page.
