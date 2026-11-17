# Task 29: Undo split core (FR-15 read side, FR-17)

Files: `frontend/src/lib/models/split-undo-core.ts` (new), `frontend/tests/unit/split-undo-core.test.ts` (new), this record. Node v24.15.0. Commands ran from `frontend/`.

## Failing run (tests first)

`pnpm exec vitest run tests/unit/split-undo-core.test.ts` with the test file written and no `split-undo-core.ts`: 1 file failed, "no tests"; the import of `../../src/lib/models/split-undo-core` did not resolve.

## Green run

Same command after the implementation: 1 file, 28 tests passed (first run after the file existed; run again after a lint fix, 28 passed). With `split-core-import-graph.test.ts`: 2 files, 33 tests passed.

## Design as built

- `undoLatestSplit(projectId, { now? })`. Reads `meta/latest-operation.json` from disk (no in-memory state), takes the original's `revision-content` lock then the split-off document's (one order, released in reverse), reads the record again inside the locks (a changed or cleared record ends the call), gathers probes, resolves through `resolveSplitLineageState` (Task 14), then runs the steps in `SPLIT_UNDO_STEPS` order: `save-current-text`, `restore-original`, `move-annotations`, `trash-split-off`, `remove-exclusion`, `clear-record`. After the locks are released: `flushIndexer`, then `updateDocumentIndexes(root, [original])`.
- Result outcomes (all distinct): `applied`, `index-failed` (committed, with failures), `nothing-to-undo`, `unsupported-operation` (a `merge` record; Feature 121), `refused` (reason plus the text from `SPLIT_UNDO_REFUSAL_MESSAGES`), `could-not-be-checked` (stable cause, no writer text), `failed` (step and error name).
- Resolver mapping: revision-no-longer-kept gives `snapshot-gone`; document-in-trash gives `original-in-trash`; document-permanently-removed gives `original-purged`; could-not-be-checked gives its own outcome. A lineage file with an entry whose source is the split-off document gives `split-off-split-since`.
- Preserved revisions: `createRevision` non-canonical, `metadata { name: "Before undo split <date>", preserve: true, splitUndoSave: true }`, one per live document. A split-off document already in Trash or purged gets none (its revisions stay under `.trash/revisions`, untouched).
- Original's text: `writeCanonicalContentWithoutLog(..., { lockHeld: true })` from the snapshot's stored text (not `setCanonicalRevision`).
- Notes: split-off notes whose `annotation` mark id is in the snapshot text go back on the original (each once); from a live split-off they are removed from it; from a trashed one they are copied and the trashed sidecar is left as stored. Other notes stay where they are.
- Trash: `deleteResourceCore` (the writer-facing soft delete) after `flushIndexer`; no-op when not live; no purge anywhere in Undo. The snapshot revision is not deleted and its preserve flag is not changed. The lineage entry is not cleared.
- A thrown step returns `failed` naming it. No earlier step is undone in this task (Task 30).

## What the tests measured (facts)

- After split then Undo: the original's canonical `content.bin` equals its pre-split bytes; `content.txt` equals the plain text; sidecar `wordCount` equals `countWords`; exactly one canonical revision.
- The split-off sidecar is under `.trash/meta`, not `meta/`; `meta/latest-operation.json` is gone; the lineage entry is still readable; the snapshot is still `preserve` and `splitSnapshot`.
- Second Undo: `nothing-to-undo`, directory unchanged. Two concurrent calls: one `applied`, one `nothing-to-undo`.
- Compile exclusion `[original, new]` becomes `[original]`.
- The three carried notes are on the original equal to their input (body, target, claim); the trashed sidecar holds none.
- Writing log: with entries present from two ordinary edits, `meta/writing-log` contents equal before and after Undo.
- Locks: `acquireLock` keys were the original's then the split-off's; the no-log write got `{ lockHeld: true }`. Order of calls (spies): `createRevision` x2, no-log write, `deleteResourceCore`, `removeCompileExclusions`, `clearLatestOperation`, `updateDocumentIndexes`.
- Edits between split and Undo: an edit of the original, and an edit of the split-off document, each appears as the content of a preserved revision of that document (the split-off one under `.trash/revisions`). Both texts are saved even with no edit. A note added to the original after the split is on the original; one added to the split-off is in the trashed sidecar; the carried ones are on the original.
- Reload: after `vi.resetModules()` and a fresh import, Undo applied from the record on disk.
- Split-off already in Trash: `deleteResourceCore` not called, `.trash/revisions/<id>` and the trashed sidecar byte-identical afterwards, preserved revisions only for the original, notes back on the original. Purged: applied, state `was-purged`, original restored.
- Refusals (`original-in-trash`, `original-purged`, `snapshot-gone`, `split-off-split-since`): result equals reason plus its text; whole-directory snapshot equal before and after; record still present. An unreadable original sidecar and an unreadable record file give `could-not-be-checked` with the directory unchanged. A `merge` record gives `unsupported-operation`, unchanged.
- Index failure (mocked): `index-failed`, original restored, split-off in Trash, record cleared. Failure of `clearLatestOperation` (mocked): `failed`, step `clear-record`.

## Clauses that cannot be met as worded, and gaps

- `original-gone` (a code in `SPLIT_UNDO_REFUSAL_REASONS`) is never returned: the resolver separates in Trash from purged and has no third case. The five Undo texts exist, four are used.
- `could-not-be-checked` and `index-failed` have no Undo text in `split-messages.ts` (not edited here); the existing `describeSplitIndexFailure` begins "The split was saved", which is wrong after an Undo, so `index-failed` carries failures only. Task 31 or 28 needs texts.
- The `lockHeld` test is by spy; compile-exclusion step on a not-listed split-off is a no-op by `removeCompileExclusions`.
- Not covered: a step failing partway (rollback is Task 30), several server instances, an encrypted project, a hosted tenant, a split-off document that a later `merge` touched.

## Checks

- `pnpm typecheck` (frontend): exit 0. `pnpm lint` (frontend): 0 errors, 460 warnings (459 before); the one new warning was fixed afterwards and `eslint` on the two files is clean.
- `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck`: no errors.
- Regression: `tests/unit/split-*`, `revision*`, `meta-locks`, `lock*`, `project-json-lock*`, `file-lock`, `trash*`, `saved-defaults*`, `resource-crud*`: 64 files, 864 tests passed (this run included the new files).
- Not run: the full frontend suite, builds, e2e, any device.
