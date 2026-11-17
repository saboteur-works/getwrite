# Task 18: new document builder (FR-3, FR-10)

Files: `frontend/src/lib/models/split-new-document.ts`, `frontend/tests/unit/split-new-document.test.ts`. Node v24.15.0.

## Contradicts the task: the import-graph test fails because of an import the task needs

Measured: `tests/unit/split-core-import-graph.test.ts` walks every `split-*.ts` file. With `split-new-document.ts` importing `reorderResourcesCore` from `resource-crud-core.ts`, the test fails with 13 offenders, all of the form `src/lib/models/project-types-static.ts imports a JSON file: <path>`.

Chain read from the imports: `resource-crud-core.ts` line 44 imports `InvalidProjectIdCoreError` from `./project-crud-core`; `project-crud-core.ts` imports `./project-types-static`, which imports the bundled project-type JSON. `project-id-core-error.ts` exists for this purpose (its header says so) and the claims, annotations and citations cores already use it.

Measured with a trial edit: changing that one import in `resource-crud-core.ts` to `./project-id-core-error` made both test files pass (29 of 29), and `pnpm typecheck`, `pnpm lint`, the Electron typecheck (both passes) and the CLI typecheck all passed. `resource-crud-core.ts` is not in this task's Files list, so the edit was reverted and is not in the working tree. With it reverted, the import-graph test fails as above. The edit is `frontend/src/lib/models/resource-crud-core.ts`: `from "./project-crud-core"` to `from "./project-id-core-error"` (the class is the same one; `project-crud-core.ts` re-exports it from there, line 52 and 456). Whether the owner accepts that edit in this task or another is for the orchestrator.

## Failing run before implementation

Command: `pnpm exec vitest run tests/unit/split-new-document.test.ts` (from `frontend/`), module `split-new-document` not yet present. Output summary: `Test Files 1 failed (1)`, `Tests no tests`; the import of `../../src/lib/models/split-new-document` failed to resolve.

## Green run

With the trial edit above: `tests/unit/split-new-document.test.ts` 24 tests passed (run three times in a row, all 24 each time), together with `split-core-import-graph.test.ts` 29 of 29. Without the edit: the 24 tests pass, the import-graph test fails (above).

## What was measured by the tests (facts)

- Placement: in a folder of `A B C`, a split of `A` gave tree order `A, new, B, C`; `reorderResourcesCore` was called once. In the project root, with a folder sibling, the new document's `orderIndex` was the original's plus one and the folder sibling's was greater.
- Changed files after a split: of all `meta/resource-*.meta.json` files only the following sibling's changed, and in it only `orderIndex`; the original's sidecar, and every file under `revisions/<id>/` and `resources/<id>/` of the original and the sibling, were byte-identical.
- Names: default "<name> (part 2)"; a given name is used. A same-named sibling existed after creation (two documents named alike): no code path in the model layer checks sibling names (searched for name checks; none found), so the new document keeps the name and nothing is renamed or refused. That is the "existing rule" as measured.
- Revisions: the new document has one revision, `v-1`, canonical, its `content.bin` equals the given text document, `content.txt` equals its plain text; the original's other revisions were not copied.
- Sidecar: subtype copied; `entityKind`, `aliases`, `wordCountGoal`, `annotations`, `capturedAt`, `dismissedNoiseTerms` absent unless chosen; `userMetadata` is `{}` with no choice; a chosen name the original lacks (`status` on a plain document, `missing`) is absent; names that are not `userMetadata` keys or `wordCountGoal` (`entityKind`, `annotations`, `__proto__`) are ignored; stored `wordCount` is the count of the given text (3). Editing the new document's status afterwards left the original's unchanged.
- Remove: after create then remove in a folder, the tree order matched the original and a whole-project file listing (files and directories, `*.tmp` skipped, indexer drained) differed only in `project.json` (the `metadataRevision` counter, allowed to advance; its delta was not recorded here). This includes the four empty `.trash` directories and the diagnostics record for the new id, which `experiments/task-5.md` measured as left behind by Trash plus purge alone. The remove function removes the diagnostics record (`removeResourceFromDiagnosticsIndex`) and removes each `.trash` directory it did not find before the creation if it is empty (a `.trash/meta` that existed before is kept; a `.trash/meta` holding another trashed item is kept).
- Placement failure: with `reorderResourcesCore` made to reject once, `createSplitDocument` removed the document, threw `SplitNewDocumentError` with `step: "place"` and `cleanedUp: true`, and the project listing matched the start apart from `project.json`.

## Not measured

- A failure inside the remove function's own steps (Task 21 injects those).
- The `metadataRevision` delta of create plus remove.
- Tie order among siblings that share an `orderIndex` other than the stable order used (resources in `getLocalResources` order, then folders); `experiments/task-5.md` H3 shows the tree follows load order for ties.
- A malformed `folder.json` among the siblings is skipped by `readFolderTree` (existing behaviour), so such a folder is not renumbered.
- A removal racing a late indexer task: `removeSplitDocument` drains the shared indexer queue first (`flushIndexer`, 5 s timeout, which returns without error on timeout); a task still queued after a timeout was not exercised.

## Checks

- `pnpm typecheck` (frontend), `pnpm lint` (0 errors; the existing warnings remain), `pnpm --filter getwrite-electron typecheck` (both passes), `pnpm --filter getwrite-cli typecheck`: all passed with the trial edit in place; the Electron and CLI typechecks do not reach `split-new-document.ts` through `@gw/core` as far as the passing run shows (not otherwise checked). `pnpm typecheck` and lint were not re-run after the edit was reverted (the reverted file is byte-identical to the committed one per `git status`).
