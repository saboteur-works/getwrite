# Task 28: Merged-away rule, compile (FR-17)

## What changed

- `frontend/components/common/compileSelection.ts`: new `excludeMergedDocuments(resources)`, a filter over the `AnyResource[]` that calls the one `isMergedDocument` predicate (`split-eligibility.ts`). Applied before the tree is built, as `experiments/task-3.md` found necessary (tree items carry no sidecar key).
- `frontend/components/common/CompilePreviewModal.tsx`: the dialog filters its `resources` prop through it (tree, select-all, saved-defaults panel and the tree component all see the filtered list) and shows a notice, `data-testid="compile-merged-notice"`, when any document was left out: "Documents merged into another document are left out of every compile." The wording is a draft for the owner's review.
- `frontend/components/Sidebar/EntityCompileSection.tsx`: the entity ordering is computed over the filtered tree items, so a marked document is absent from the entries and from the compile ids.
- No server file edited: `experiments/task-3.md` found `section-loader.ts` takes the client's ids and has no compile list. No CLI file edited: no CLI compile exists (task-3). No file differs from the task's declared Files.

## Done-when clauses and how each was checked

| Clause | Check |
|---|---|
| Marked document absent from the Compile dialog list in every format | `MergeRuleCompile.test.tsx`, one test per format (txt, md, pdf, docx): the row is not rendered, the Compile button reads 1, and `onConfirmCompile` receives only the unmarked id with that format |
| Absent from the Compile Entity Resources dialog | `MergeRuleCompile.test.tsx` "leaves a marked document out of the entity list and the compile" (real `EntityCompileSection`, store, mocked mentioned-in fetch returning both ids): list shows only the unmarked, `runCompileAndDownload` gets `resourceIds` `["a"]` |
| Absent from the CLI compile if task-3 found one | Task 3 found none; nothing to test |
| The dialog states the exclusion | "states the exclusion when a marked document exists" and, in entity mode, the notice assertion in the entity test; "states nothing when no document is marked" |
| No control overrides it for a run | "offers no control to include a marked document for a run": no checkbox for it, and Select All leaves the count at 1 |
| Nothing written to `compileDefaults` | "writes nothing to compileDefaults": `saveDefaults` spy not called after a compile |
| Reads the one `isMergedDocument` predicate | `merge-rule-compile.test.ts` "reads the one isMergedDocument predicate": the module is mocked with a counting wrapper; two resources give two calls |
| Follows the mark through Trash, restore and the mark's removal with no write | `merge-rule-compile.test.ts`: a pure function of the resources passed in (input not modified, tested); absent from list when trashed, still excluded when restored with the mark, listed when the key is gone. This shows the derivation only; no Trash/restore operation was run against disk in this task |
| Unmarked document excluded by a saved default behaves as before; existing tests unmodified | "treats an unmarked document excluded by a saved default as before" (1 selected, no notice); `compilePreviewModal.test.tsx`, `tests/component`, `compileSelection.test.ts`, `compile-defaults-selection.test.ts`: 99 files, 1659 tests passed, none edited |
| Server-side list file edited if it differs | None exists (task-3); not edited |
| `pnpm typecheck`, `pnpm lint` | typecheck: no errors. lint: 0 errors, 459 warnings (none in the five touched files, by `eslint` on those files printing nothing). Prettier run on the touched files. |
| Electron typechecks and CLI typecheck if a model or CLI file is touched | Not run: no model, Electron or CLI file was touched (`compileSelection.ts` imports the model, it does not edit it) |

## Test order

Unit tests were written first and failed (6 of 6, `excludeMergedDocuments` not defined) before the function was added, then passed. The component tests were written next; the first run failed 9 of 10, but the failures were a mix: the rule-related ones (count 2 instead of 1, missing notice) and harness errors in my test (the saved-defaults reader was given an object where it takes an array of ids; the mentions row used a wrong field name). After the harness fix the rule-related tests were run only with the implementation present, so a clean red for the corrected component tests was not separately recorded.

## Not shown

- No dialog was opened in a built app or browser; the component tests render the components in jsdom.
- The Start Page compile path mounts the same `CompilePreviewModal` and gets the rule through it; it was not run on its own.
- The notice in entity mode is true whenever any project resource is marked, not only one in that entity's set, because the modal receives the whole project's resources. Whether to narrow it is the owner's choice.
