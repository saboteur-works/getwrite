# Task 17: per-document index update that reports failure (FR-9)

Files: `frontend/src/lib/models/split-index-update.ts` (new), `frontend/tests/unit/split-index-update.test.ts` (new), this record. No other file was edited; `indexer-queue.ts`, `split-types.ts`, `package.json` and the lockfile are untouched.

## Contradicts the task text

- The task says `reindex` is "the shared `rebuildDerivedIndexes` plus diagnostics as `reindex` runs them". Measured by reading `cli/src/commands/reindex.ts`: `reindex` calls `rebuildDerivedIndexes` and nothing else; it runs no diagnostics step. Task 4 (F5) measured that `rebuildDerivedIndexes` leaves diagnostics unchanged. So a failed diagnostics step is not repaired by `reindex`. The test "measurement: rebuildDerivedIndexes leaves a failed diagnostics step unrepaired" pins this: after an injected diagnostics failure and a rebuild, the split-off document has no diagnostics record; running the new function again writes it. FR-9's "repairable by `reindex`" therefore holds for the inverted index, annotation-body index, backlinks and mention index, and does not hold for diagnostics. I stopped on that point and did not change `reindex` (outside this task's Files). The lead decides whether `reindex` should rebuild diagnostics or the writer-facing message for a diagnostics failure should say to repeat the update.
- FR-9 also lists the sidecar `wordCount` of both documents. Task 17's text and Done-when do not name it, and Task 4 (F3) measured that neither `enqueueIndex` nor the rebuild writes it. This function does not write `wordCount`; whichever task owns it (not this one) must.

## Design (facts about the code written)

- `updateDocumentIndexes(projectRoot, documentIds)` is awaited and returns `{ outcome: "updated", documentIds }` or `{ outcome: "failed", failures: { documentId, step }[] }`. The extra types (`SplitIndexStep`, `SPLIT_INDEX_STEPS`, `SplitIndexFailure`, `SplitIndexUpdateResult`) are defined in `split-index-update.ts`, not in `split-types.ts`.
- Steps: `read-content`, `read-sidecar`, `inverted-index`, `annotation-index`, `backlinks`, `mention-index`, `diagnostics`. Every step is attempted after an earlier failure so the result lists all of them.
- Backlinks recompute over the whole project (as `enqueueIndex` does, Task 4 F4) and write the file; a failure names every document in the set, because the step is project-wide. It is not `rebuildDerivedIndexes`.
- Mentions are recomputed from each document's text through the alias table and `updateMentionIndex` (a document with no mention loses its key). The per-entity record builder in `indexer-queue.ts` is not exported and that file is not editable here, so the same few lines are repeated in this file.
- A document whose text cannot be read (`loadPersistedPlainText` returns undefined) is a `read-content` failure and gets no mention or diagnostics write; it is not treated as an empty document. A document with an unreadable sidecar is a `read-sidecar` failure and gets no inverted or annotation write.
- The caller must establish the storage context. `withIndexingSuspended` is not used.

## Failing run (tests first)

The implementation file had been written before the test file by mistake; I moved it aside, wrote the tests, and ran:

`pnpm --filter getwrite-frontend exec vitest run tests/unit/split-index-update.test.ts`

Result: 1 test file failed, no tests ran: `Cannot find module '/src/lib/models/split-index-update' imported from .../tests/unit/split-index-update.test.ts`. That failure is the missing module, not a behavioural assertion. I then restored the implementation.

## Green run

Same command: 1 file passed, 12 tests passed.

Tests (all on the real filesystem adapter, a generated project with an entity, a document that links to the original by id, and an original with two annotations and an entity mention in its second half; baseline indexes built with `rebuildDerivedIndexes`, then the split written to disk with no index call):

1. Inverted index, annotation-body index, backlinks (the linker still points at the original), mention index (recomputed: the original's baseline record is gone, the split-off document has its own with the right offset) and diagnostics reflect both documents.
2. The four indexes equal a full `rebuildDerivedIndexes` of a copy of the same files, compared as parsed values with sorted keys (Task 4 F2).
3. `rebuildDerivedIndexes` is not called (counter around the module export).
4. The inverted index holds the new document's terms when the promise resolves.
5. Injected failure in each of `inverted-index`, `annotation-index`, `backlinks`, `mention-index`, `diagnostics` (5 tests): the outcome is `failed` and lists `{ documentId, step }`; for the two per-document steps the list is exactly the one document; after the failure `rebuildDerivedIndexes` gives the four indexes equal to a rebuild of an untouched copy.
6. `read-content` failure for a document with a sidecar and no content or revision; no diagnostics record is written for it.
7. `read-sidecar` failure for a corrupt sidecar.
8. The diagnostics measurement described above.

Fault injection is by `vi.mock` wrappers over `indexResource`, `indexAnnotationBodies`, `persistBacklinks`, `updateMentionIndex` and `persistDiagnosticsIndex`.

## Checks

- `pnpm --filter getwrite-frontend exec vitest run tests/unit/split-index-update.test.ts`: run, 12 passed.
- `pnpm typecheck` (frontend): run, exit 0. An earlier run failed on the test file's adapter type (missing `StorageAdapter` members); fixed with a cast to `StorageAdapter`.
- `pnpm lint` (frontend): run, 0 errors, 459 warnings (none reported for the two new files when ESLint is run on them alone). An earlier run reported one naming-convention error in the new source file; fixed by renaming the boolean.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): run, exit 0.
- `pnpm --filter getwrite-cli typecheck`: run, exit 0.
- Not run: the full frontend suite, `pnpm test:ci`, builds, e2e, any device.

## Not measured

Whether the `updateMentionIndex` and `persistBacklinks` writes interleave safely with a background `enqueueIndex` of the same project running at the same time (Task 22 will call this after commit while `persistResourceContent` may have scheduled its own index).

## Gate 5 update

Owner decision, Gate 5, 2026-11-16: `reindex` is not extended; the writer-facing message says `reindex` repairs the four indexes and prose diagnostics refresh on the document's next save. Done-when rewritten accordingly. Edited: `frontend/tests/unit/split-index-update.test.ts` only. `split-index-update.ts`, `indexer-queue.ts` and the `reindex` command are unchanged.

### Clause by clause

1. `reindex` after an injected failure equals a full rebuild, for the inverted index, annotation-body index, backlinks and mention index. Already satisfied by the committed code and already tested: the five per-step injection tests ("returns a failed outcome naming the document and step when <step> fails, and reindex then equals a full rebuild") run `rebuildDerivedIndexes` (all that `reindex` runs) on the failed project and on an untouched copy and compare the four files as parsed values with sorted keys. No failing run exists for this clause and none was fabricated.
2. A failed diagnostics step is not repaired by `reindex` and is written by the next save. The old single test "measurement: rebuildDerivedIndexes leaves a failed diagnostics step unrepaired; running the update again repairs it" covered the first half and a different second half (running the update again). It is replaced by three tests, each named for its clause: "a failed diagnostics step is not repaired by reindex (rebuildDerivedIndexes)"; "a failed diagnostics step is written by the document's next save (enqueueIndex)" (injected failure, rebuild, record absent, then `enqueueIndex` for the split-off document and `waitForDrain`, record present); "running the update again also writes a failed diagnostics record" (the old second half, kept). No failing run exists: the behaviour was already present (Task 4 F5 measured that `enqueueIndex` writes diagnostics and the rebuild does not), so the new tests passed on first run.
3. The failure outcome carries what Task 22 needs to name the step. The existing shape is `{ documentId, step }` per failure, with `step` drawn from the exported `SPLIT_INDEX_STEPS` tuple. I added no field. Which repair applies (`reindex` or next save) is derived from `step` alone: `diagnostics` is the next-save case, `inverted-index`, `annotation-index`, `backlinks` and `mention-index` are the `reindex` case. New test "each failure carries a stable step identifier Task 22 can name" asserts the exact tuple of identifiers, that a failure has exactly the keys `documentId` and `step`, and that an injected diagnostics failure reports `diagnostics`. No failing run exists (shape already present). `read-content` and `read-sidecar` have no repair route recorded here; Task 22's message for those is not established by this task.

### Runs

- `pnpm --filter getwrite-frontend exec vitest run tests/unit/split-index-update.test.ts tests/unit/split-core-import-graph.test.ts`: 2 files passed, 20 tests passed (split-index-update now 15 tests).
- `pnpm typecheck` (frontend): exit 0.
- `pnpm lint` (frontend): 0 errors, 459 warnings (same count as the Task 17 record).
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): exit 0.
- `pnpm --filter getwrite-cli typecheck`: exit 0.
- Not run: full frontend suite, builds, e2e, any device.
