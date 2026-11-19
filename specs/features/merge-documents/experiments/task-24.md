# Task 24: preview and staleness core (FR-7 server half, FR-11 data)

Implementation task; results below are measurements of the checks run, not explanations of cause.

## Files

- `frontend/src/lib/models/merge-preview-core.ts` (new): `previewMerge`, `evaluateMergeRequest`, request, result and evaluation types.
- `frontend/tests/unit/merge-preview-core.test.ts` (new): 28 tests, real project directories.

## Test-first

The test file was written first. Its first run, before `merge-preview-core.ts` existed, failed at import (`Test Files 1 failed, no tests`). After the module was written, 26 of 28 passed; the two failures were a wrong expectation in my fixture (folders and documents are siblings ordered by `orderIndex`, so the document I expected first came second) and a real defect (a trashed document was refused as `missing-document`, because `mergeEligibility` checks a null sidecar before `inTrash`; the fix passes an empty sidecar for a trashed document). Both fixed; final run: 28 passed. `split-core-import-graph.test.ts` also passes.

## Done-when clauses and the test pinning each

| Clause | Test |
|---|---|
| Target by name, others in tree order with folder paths | `returns the target by name and the others in tree order with folder paths`; `gives a document at the project root an empty folder path` |
| Word count as `countWords(tiptapToPlainText(storedText))` | `returns the word count of each document as countWords over tiptapToPlainText of the stored text` |
| Annotations of each absorbed document by document and kind, ids and bodies | `groups each absorbed document's annotations by kind with ids and bodies` |
| Metadata field list with each source's values | `lists each metadata field that an absorbed document holds, with each source's value` |
| Rule of FR-17 to FR-20 per absorbed document | `states the merged-away rule of FR-17 to FR-20 for each absorbed document` |
| Warning: target excluded from compile / in the Inbox while an absorbed document would count; merge proceeds | five tests under `warnings` (compile, no compile warning when all excluded, Inbox incl. descendant folder, reverse case no warning, both) |
| Hash or revision mismatch refused as stale | `refuses a content hash mismatch as stale`; `refuses a canonical revision mismatch as stale` |
| Count over the cap refused with the cap text, before any read | `refuses a count over the cap with the cap text, before reading any document` (`readSidecar` spy not called); `accepts a selection of exactly the cap` (25) |
| Refusal of Task 17 for an ineligible selection | `returns the eligibility refusal...`; `refuses a single document and a repeated id`; Trash and missing tests |
| Writes nothing for any outcome | `leaves every file as it was, and calls no write...`: spies on `mutateSidecar`, `writeSidecar`, io `writeFile`, `atomicWriteFile`, `mkdir` plus a before/after directory snapshot, over a preview, a stale refusal, a single-document refusal, a cap refusal and an invalid-id failure |
| Locked project rethrows the locked-access error | `rethrows the locked-access error and returns no preview` |
| Failed read is a distinct failed outcome | `failures are not empty previews`: content not a document, unreadable sidecar, unreadable `project.json`, folder not found, annotations not a list |
| Hash from the one function of `split-preview-core.ts`, imported | `merge-preview-core.ts` imports `hashSplitContent` and `revisionContentLockKey` from `./split-preview-core`; no copy |

## Checks

- `pnpm typecheck` (frontend): clean.
- `pnpm lint` (frontend): 0 errors, 459 warnings (same total as recorded in `task-18.md`); eslint on the two new files printed nothing.
- `pnpm typecheck` electron (both passes): clean. `pnpm typecheck` cli: clean.

## Assumptions

- `previewMerge` takes each distinct document's `revision-content` lock in ascending key order and releases all before returning, so the apply step (Task 25) can use the same order; `evaluateMergeRequest` takes none, for the apply step to call inside its own locks. A test asserts the ascending order and zero acquisitions for the evaluate layer. No lock is taken for a cap refusal or an invalid id.
- Order of decisions: cap, eligibility (from sidecars), then staleness. A stale document that is also ineligible reports the eligibility refusal.
- "Would otherwise count": compile warning when the target is in `config.compileDefaults.excludedResourceIds` and some absorbed document is not; Inbox warning when the target is in the Inbox subtree and some absorbed document is not.
- Tree order uses folders from `readFolderTree` plus the absorbed documents' sidecar `folderId` and `orderIndex`; siblings (folders and documents) sort by `orderIndex`, as `merge-compose.ts` does.
- Metadata is returned as `offerMergeMetadataFields` returns it (field key and per-source values); no display label is added, since Task 20's offer carries none.

## Not done / follow-up

- `lib/api/split-stored-read.ts` was named in the task brief as a file to read first; the path given (`frontend/src/lib/models/split-stored-read.ts`) does not exist. It is `frontend/src/lib/api/split-stored-read.ts` (a client module, not used by this server core).
- `readFolderTree` skips an unreadable `folder.json` silently; this core turns the resulting absent folder into a `folder-not-found` failure only for the folders a selected document sits in. A folder elsewhere in the tree that cannot be read can still change the tree order of the absorbed documents without a failure.
- `split-core-import-graph.test.ts` walks `split-*.ts` only, so `merge-preview-core.ts` (which imports `io`, `folder-utils` and `node:path` through them) is not covered by an import-graph test.
