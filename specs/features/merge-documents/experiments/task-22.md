# Task 22: merged-mark store and the copy-path drop (FR-5)

Files: `frontend/src/lib/models/merge-mark-core.ts` (new), `frontend/src/lib/models/resource-crud-core.ts` (one call in `copyResourceCore`), `frontend/src/lib/models/resource-templates.ts` (one call in `duplicateResource`), `frontend/tests/unit/merge-mark-core.test.ts` (new). Nothing committed. No `package.json` or lockfile edit.

## What was built

- `writeMergedMark(projectRoot, absorbedId, mark)`: `mutateSidecar`, spreads the stored sidecar and sets `mergedMark` `{ targetDocumentId, targetSnapshotRevisionId, date }`. A document with no sidecar throws `MergeMarkTargetMissingError` (nothing is created).
- `readMergedMark`: `found | none | failed`. `failed` covers an unreadable or missing sidecar and a stored value of the wrong shape; a locked-access error is rethrown.
- `removeMergedMark`: for compensation and Undo only; not imported by any route or client module. A document with no mark is left unchanged (`SIDECAR_UNCHANGED`).
- `withoutMergedMark(sidecar)`: pure; used by `copyResourceCore` and `duplicateResource` on the object they build from the spread of the source sidecar, before `remapCopiedAnnotations`.

## Test order

Tests were written first and run before `merge-mark-core.ts` existed (import failure, "no tests"). With the module in place and the copy paths unedited, 18 of 20 passed and exactly the two copy-path tests failed. After the two edits, 20 of 20 passed.

## Done-when clauses

| Clause | How verified |
|---|---|
| Mark written under `mergedMark` through `mutateSidecar`, read back | MEASURED: tests "stores the mark under mergedMark and reads it back", "keeps every other sidecar key" |
| Encrypted project stores it encrypted | MEASURED: in-memory encrypted adapter; the plaintext marker is absent from stored bytes, read back unlocked equals the written mark |
| Read, write and removal with no usable key raise the locked error, not an empty read | MEASURED: keyring locked; `isLockedAccessError` true for each of the three |
| No client update can write or clear it | MEASURED: key absent from `CLIENT_WRITABLE_SIDECAR_KEYS`; `updateSidecarCore` naming the key leaves the stored mark equal; `clearKeys: ["mergedMark"]` rejects and the mark stays |
| Survives a reload | MEASURED: fresh read of the stored file. This is a re-read of the file, not a restart of a running app |
| Survives Trash; a restore brings it back | MEASURED: `deleteResourceCore` then `restoreOneCore` (ok), mark equal |
| Survives a prune | MEASURED: three revisions, `pruneRevisions(..., 1)`, mark equal |
| Trash, restore, prune and purge of another document leave it unchanged | MEASURED: sidecar bytes of the marked document identical after each step |
| Failed read is a distinct outcome, never "no mark" | MEASURED: wrong-shape value, unparseable sidecar and missing sidecar each return `failed`; absent key returns `none` |
| Copy paths drop the key; source keeps it | MEASURED: one test per path, red before the edit and green after |
| Existing tests of both paths pass unmodified | MEASURED: `resource-copy-revision`, `resource-crud-core-*`, `resource-templates*`, `source-resource-crud`, `template-service`, `builtin-templates`, `project-json-lock-scan`, `core-import-graph`, `split-core-import-graph`: 19 files, 253 tests passed (includes the new file) |
| Remove function exists, not exposed to a client | READ: no route, client or transport imports it |
| Nothing here purges a document | READ: the module calls no Trash or purge function; the purge in the test is test setup |

## Checks

- `pnpm typecheck` (frontend): green.
- `pnpm lint` (frontend): 0 errors; 459 warnings, none in the files of this task that were not already the repository's pattern (not itemised).
- Prettier check on `src/lib/models/*.ts` and the new test: clean (`resource-templates.ts` was reformatted once).
- `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck`: green.

## Not established

- The mark's date is stored as an ISO instant, as `MergedMark.date` is typed; the shape check requires only that it parses. Whether a date-only value should be accepted is for Task 30.
- Copy of a marked document in a locked project and a marked Source copy (`seedSource`): not tested.
- Trash cascade of a folder holding a marked document: not tested (document-level Trash only).
