# Task 15: Lineage and latest-operation records (store, FR-5 and FR-16)

Files: `frontend/src/lib/models/split-records-core.ts` (new), `frontend/tests/unit/split-records-core.test.ts` (new), this record. `trash.ts` was not edited. `split-types.ts` was not edited.

## trash.ts

`experiments/task-3.md` recorded that the purge sweep, Trash, restore, `rebuildDerivedIndexes` and `reindexMissingResources` left both files byte-identical and that no exemption is needed. This task's own measurement agrees: the tests "Trash, restore and purge of the split-off document", "Trash and purge of another document", "a prune of a document's revisions" and "a project.json write" compare the bytes of both files before and after and pass with `trash.ts` unedited. No exemption was added.

## Record shapes

The shapes are those of `split-types.ts` (`SplitLineageRecord`, `LatestOperationRecord`). No measured fact contradicted them (Task 3 measured nothing against the shape; the lineage file keyed by new document id and a latest-operation file holding one record fit the types as written). Types defined in `split-records-core.ts` because only Task 9 edits `split-types.ts`: `LineageReadResult`, `LatestOperationReadResult` (each `found | none | failed`), and the error class `SplitRecordsUnreadableError`.

Stored form: `meta/lineage.json` is an object keyed by the split-off document's UUID; `meta/latest-operation.json` is the one record. Both are validated on read (keys and ids UUID, kind `split` or `merge`, ISO dates, integer revision numbers).

## Failing run (tests first)

Command: `pnpm exec vitest run tests/unit/split-records-core.test.ts` (from `frontend/`), with the test file written and no `split-records-core.ts`.
Output summary: 1 test file failed, "no tests"; the import of `../../src/lib/models/split-records-core` did not resolve.

## Green runs and what they showed

1. After the first implementation: 23 tests, 22 passed, 1 failed: "fails closed on a write and on a clear with the keyring locked". `clearLatestOperation` called `rm(path, { force: true })` and the promise resolved with `undefined` on the locked encrypted project (the write half of that test passed). Measured fact: `rm` with `force` did not raise the locked error in this fixture. `clearLatestOperation` now reads the file first through the same guarded read (which rethrows a locked-access error, treats ENOENT as absent), then removes it. Cause of the `rm` result not established; no experiment separated it.
2. `tests/unit/split-core-import-graph.test.ts` (Task 9) failed on the new file: `split-records-core.ts: expected [ 'node:path' ] to deeply equal []`. The file's own `node:path` import was removed; paths are built as `${projectRoot}/meta/<name>`, the form `claims-list-core.ts` uses for `project.json`. Not measured: behaviour of a forward-slash join on Windows (the storage-context path handling there was not run).
3. Final: see below.

## Final results (commands run from `frontend/` unless noted)

- `pnpm exec vitest run tests/unit/split-records-core.test.ts tests/unit/split-core-import-graph.test.ts tests/unit/split-types.test.ts tests/unit/trash-core.test.ts`: 4 files, 48 tests passed. `split-records-core.test.ts` has 23 tests.
- `pnpm typecheck`: run, no errors.
- `pnpm lint`: run, 0 errors, 459 warnings; none reported for `split-records-core.ts` or `split-records-core.test.ts`.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): run, no errors.
- `pnpm --filter getwrite-cli typecheck`: run, no errors.

## Coverage against "Done when"

- Lineage entry written through the adapter and read back; entries of other documents kept: tests "writes an entry...", "keeps other documents' entries...".
- Latest-operation written, read, replaced, cleared; `merge` kind accepted: "writes, reads, replaces and clears", "accepts the merge kind...".
- Per project: "is stored per project" (lineage, other project reads none and no file exists), latest-operation file under the project's own `meta/`.
- Encrypted project: stored bytes do not contain a plaintext marker string; unlocked read returns the record; a read with the keyring locked rethrows the locked-access error for both files (never an empty read); a write and a clear with the keyring locked reject with it. The fixture is the in-memory adapter behind `workspaceEncryptionAdapter`; a real-filesystem encrypted project, Android and the object-store adapter were not run.
- Failed read is a distinct outcome: unparseable file and wrong-shaped entry give `failed`; a write over an unreadable lineage file throws `SplitRecordsUnreadableError` and the stored bytes are unchanged.
- No client sidecar update writes or clears either: the names are not in `CLIENT_WRITABLE_SIDECAR_KEYS`; `updateSidecarCore` with `lineage` and `latestOperation` keys leaves both files' bytes unchanged and `clearKeys` naming them is refused (both files are `meta/` files, not sidecar keys, so the check is by bytes).
- Trash, restore, prune, purge and a `project.json` write (via `setModuleEnabledCore`) leave both files byte-identical; the lineage entry of a purged document is still readable afterwards (measured; whether a reader should ignore such an entry is for Task 29).

## Not run / not established

- Several server instances sharing a project (the lock is per process).
- A hosted tenant: tenancy is by the project root the caller passes; no second tenant was run here (Task 3 measured the root resolution).
- `writeLineageEntry` and `writeLatestOperation` take `withMetaLock`, which is not reentrant; Task 20 must not call them inside its own `withMetaLock` step for the same project.
