# Task 21: reverse compensation and failure injection (FR-6)

Files: `frontend/src/lib/models/split-core.ts`, `frontend/tests/unit/split-core-compensation.test.ts` (new), this record. `split-new-document.ts` was not edited (see below). Node v24.15.0.

## split-new-document.ts

Not edited. `removeSplitDocument` (Task 18) already removes the new document through Trash and a purge, its diagnostics record, and the empty `.trash` directories it did not find before the creation; the tests below assert those by listing after every injected failure, so the cleanup belongs where Task 18 put it.

## Failing run (tests first)

`pnpm exec vitest run tests/unit/split-core-compensation.test.ts` (from `frontend/`) against the Task 20 `split-core.ts` (no compensation): 20 tests, 16 failed, 4 passed. The failures were the injected `Error: injected failure` (or a `SplitNewDocumentError` for the placement case) propagating out of `applySplit`; the 4 that passed do not need a failure to be undone.

## Green run

`pnpm exec vitest run tests/unit/split-core-compensation.test.ts tests/unit/split-core.test.ts tests/unit/split-core-import-graph.test.ts`: 3 files, 49 tests passed (20 + 24 + 5), run three times in a row, 49 each time.

Two corrections were made to the tests, not the code, while getting there: the injection wrapper fired on every call to a wrapped function (including calls compensation makes), so it now fires once; and the "after the new document" case failed inside the builder's own placement (the builder calls `mutateSidecar` too), so it now waits until `createSplitDocument` has returned.

## Design as built

- `applySplit` keeps a `Progress` record of what each forward step did (revision ids before the snapshot, the builder's result, the original's annotation list before the move, whether the exclusion step ran, the truncation backup, the raw record files). On a throw, `compensate` undoes in reverse: records, truncation, exclusion, annotations, new document, snapshot, then `flushIndexer`.
- Each undo is idempotent, so it is safe for the step that threw after writing: records and derived content files are put back as raw text (or removed if they did not exist); `content.bin` is rewritten from the text read inside the lock; the sidecar's `updatedAt` and `wordCount` are put back (or removed if they were absent); `removeCompileExclusions(newId)`; the original's annotation list is rebuilt from its earlier order using the current version of any annotation still present and keeping any added since; `removeSplitDocument(projectId, undo)`; the snapshot is found as a revision not in the earlier id set with `metadata.splitSnapshot === true`, then `setRevisionPreserve(false)` then `deleteRevision`.
- State returned (`SplitRemainingState`): none failed gives `original-restored`; exactly one failed undo kind gives `original-truncated` (truncation), `new-document-remains` (document removal, or the builder reported it could not clean up), `snapshot-revision-kept` (snapshot removal) or `state-unknown` (records, exclusion, annotations); two or more give `state-unknown`. These mappings are a decision of this task, not a measurement.
- The snapshot is not deleted when the truncation or the records could not be put back (it holds the earlier text); the new document is not removed when the notes could not be put back into the original (it holds them).
- A locked-access error is rethrown only when compensation left everything as it was; otherwise the failure and the remaining state are returned.
- The failure result carries `cause`, an error name, never a message from the error or any client value.

## What the tests measured (facts)

- For each of eight injections (after the snapshot; inside the builder's placement; after the new document, annotation move failing before it writes; after the annotations moved; after the exclusion was seeded; after the truncation; after the lineage record; after the latest-operation record), `applySplit` returned `failed` with the step named (`snapshot`, `create-document`, `move-annotations` twice, `seed-exclusion`, `truncate`, `write-records` twice) and `remainingState: "original-restored"`, with no `newDocumentId` property. The whole project directory (files and directories) was then equal to the snapshot taken before the split, with two normalisations: `project.json` without `config.metadataRevision`, and files under `meta/index/` as JSON with sorted keys.
- Without the second normalisation the comparison failed for `meta/index/annotations.json` (the key order differed, as the printed diff shows) and `meta/index/inverted.json` (not inspected further); with sorted keys the contents are equal. So after a compensated failure the index files hold the same data, written in a different key order. Cause of the order difference not established by an experiment.
- Directories: after each injected failure the project had a `.trash/` directory only if it had one before (asserted), the diagnostics index held no record for the discarded document (asserted by key list), and the number of resource sidecars equalled the number before.
- `metadataRevision`: a separate test reads the counter and the rest of `project.json` after a failed split (injected after the truncation): the counter was greater than or equal to its earlier value and the document without the counter equalled the earlier one.
- Preserve flag: compensation called `setRevisionPreserve(..., false)` once, then `deleteRevision` once, in that order; afterwards no revision with `splitSnapshot` remained. After a successful split, `deleteRevision` on the snapshot rejected with `PROTECTED_REVISION_DELETE_MESSAGE`; after clearing the flag it deleted it.
- Compensation did not call `updateDocumentIndexes` or `rebuildDerivedIndexes` (spies, injected failure at the last write).
- A step that cannot be undone, each by an injected failing undo: truncation restore fails (`content.bin` write rejected) gives `original-truncated` and the snapshot revision is still on disk; `deleteRevision` rejecting gives `snapshot-revision-kept`; `removeSplitDocument` rejecting gives `new-document-remains`; the second `mutateSidecar` call on the original (its annotation restore) rejecting gives `state-unknown` and the new document's sidecar is still there; two failed undos give `state-unknown`. `describeSplitFailure` for each of the five states contains "did not finish".

## Comparison with experiments/task-5.md

Task 5 (a probe composed from primitives, same order) recorded, after compensation, four empty `.trash` directories, a bumped `metadataRevision`, a `diagnostics.json` record for the discarded document and, for the truncation cases, a `content.txt` change (its fixture had no `content.txt`). Observed here: the `.trash` directories and the diagnostics record are gone (the builder's remove function removes them); the counter still advances (allowed); `content.txt` and `content.tiptap.json` are restored from raw text, so they match whether or not the fixture had them (the fixture here was created from a TipTap document with no plain text, the same situation); Task 5's index-file difference that depended on indexer timing appears here as a key-order difference. Task 5 injected no failure inside compensation; this task does (above).

## Not covered

- A process crash between steps; several server instances; an encrypted project (the records and sidecar writes go through the same adapter, not exercised here with a key); a failure inside the builder's own cleanup beyond the `new-document-remains` mapping; the writing-log directory during a failed split (not compared here; the forward path is compared in Task 20).
- A lock error injected mid-operation (the code path exists; not tested).

## Checks

- `pnpm typecheck` (frontend): exit 0. `pnpm lint` (frontend): after fixing two naming-convention errors in the new test file, 0 errors, 459 warnings. `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck`: no errors.
- Regression: `tests/unit/split-*`, `revision*`, `meta-locks`, `lock*`, `project-json-lock*`, `file-lock`, `resource-crud*`, `trash*`, `saved-defaults*`: 62 files, 823 tests passed.
- Not run: the full frontend suite, builds, e2e, any device.
