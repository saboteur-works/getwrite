# Task 20: split apply with ordered writes (forward path)

Files: `frontend/src/lib/models/split-core.ts`, `frontend/tests/unit/split-core.test.ts`, this record. Node v24.15.0.

## Failing run (tests first)

`pnpm exec vitest run tests/unit/split-core.test.ts` (from `frontend/`) with the test file written and `split-core.ts` absent: 1 file failed, "no tests"; the import of `../../src/lib/models/split-core` did not resolve.

## Green run

`pnpm exec vitest run tests/unit/split-core.test.ts tests/unit/split-core-import-graph.test.ts`: 2 files, 29 tests passed (24 + 5). No assertion failed on the first green run.

## Design as built

- `applySplit(projectId, request, { now? })`; request = `SplitPreviewRequest` plus `carryOver` (`SplitCarryOverChoice`). Types `SplitApplyRequest`, `SplitApplyOptions`, `SplitApplyResult` are defined in `split-core.ts` (only Task 9 edits `split-types.ts`).
- Result: `applied` (new document id, `notices: string[]`, snapshot revision id and number), `refused` (Task 11 reason, including `stale-cursor`), `failed` (`failedStep`, `remainingState`, `cause`). A read failure or an annotation-partition failure before any write returns `failed` with step `lock-original` or `move-annotations` and state `original-restored` (no write had happened).
- Lock: `acquireLock(revisionContentLockKey(root, id))` first, held to the end, released in `finally`. `evaluateSplitRequest` (Task 19) runs inside it, so the staleness check and the snapshot read are under the lock. The truncation is `writeCanonicalContentWithoutLog(..., { lockHeld: true })`. A test asserts exactly one `acquireLock` call, with that key, and the `lockHeld` argument. The lock-order guard of Feature 93 is installed for every test (`tests/setup.ts`); none of the 24 tests raised a violation.
- Order, asserted by spies in pass-through mode: `createRevision` (snapshot), `createSplitDocument`, two `mutateSidecar` writes (new document, then original) between the create and the seed, `seedCompileExclusion`, `writeCanonicalContentWithoutLog`, `writeLineageEntry`, `writeLatestOperation`.
- Snapshot: `createRevision(root, id, { content: <stored text read in the lock>, isCanonical: false, metadata: { name: "Before split YYYY-MM-DD", preserve: true, splitSnapshot: true } })`; the date is UTC.
- Annotations: `partitionAnnotations` with the chosen ids; the new document's sidecar gets the carried list, the original's list is filtered by the moved ids inside `mutateSidecar` (so a concurrent edit of another annotation is not overwritten). With nothing carried neither sidecar is written for annotations.
- Exclusion: `project.json` is read; the original listed, or `compileDefaults` present but unusable, calls `seedCompileExclusion` with `SPLIT_COMPILE_EXCLUSION_NOTICE` for both notice slots; the returned notice goes into `notices`. Not listed and no `compileDefaults`: no call, no write.
- Records: lineage entry (source id, snapshot id and number, `split`, date) then the latest-operation record (`split`, `[original, new]`, the snapshot ref, new id, date), each through Task 15's writers, not nested in another `withMetaLock`.

## What the tests measured (facts)

- Revisions of the original after a split: the earlier ones plus one snapshot; exactly one canonical; the snapshot is non-canonical, `preserve` and `splitSnapshot` true, named `Before split <date>`, content equal to the pre-split stored text; no revision carries `automaticSnapshot`.
- Original: same id and name; canonical text `Alpha beta gamma.\nDelta epsilon`; sidecar `wordCount` 5; `content.txt` equal to that text.
- New document: exactly `v-1`, canonical, text ` zeta\nEta theta\nIota kappa.`; default name `<name> (part 2)`, a typed name is used; `orderIndex` is the original's plus one and the next sibling's is greater.
- A second document's content and revision files were byte-identical; its sidecar differed only in `orderIndex`.
- Writing-log directory contents identical before and after; `config.dailyWordGoal` unchanged.
- Annotations: chosen claim and citation sit in the new sidecar equal to their input (body, `target`, claim status and date); the original keeps the rest; no id in both lists; carried ids are marked only in the new text; the spanning annotation's mark remains in the original and its stored quote is unchanged; the unchosen after-annotation's mark is absent from the new text.
- Node ids: no id of the stored new text (read from `content.bin` of its canonical revision and from `content.tiptap.json`) appears in the stored original; every paragraph of the new text has an id; the original keeps its first two paragraph ids.
- Exclusion: original listed gives `[original, new]` and no notice; not listed writes nothing; at 5000 ids the split goes on with the notice and the list unchanged; `compileDefaults` set to a string goes on with the notice and the stored value unchanged.
- Metadata: with `fields: ["status"]` the new sidecar has `userMetadata { status }`, the original's subtype, and no `wordCountGoal` or `entityKind`; the original's metadata unchanged.
- Refusals (entity, empty first half, stale hash, an edit after the hash) and a chosen annotation with no passage: the directory snapshot (all files and directories, indexer drained) is equal before and after.
- A locked-access error from the sidecar read rejects with that error and the directory is unchanged.
- Two concurrent `applySplit` calls with one request: results `applied` and `refused` (`stale-cursor`); one `splitSnapshot` revision, one lineage entry.

## Not covered here

- A step that throws partway (compensation is Task 21; with this task alone the error propagates and the earlier writes stay).
- Several server instances, an encrypted project, a hosted tenant.
- The index update after commit (Task 22).

## Checks

- `pnpm typecheck` (frontend): exit 0. `pnpm lint` (frontend): 0 errors, 459 warnings (same as before). `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck`: no errors.
- Regression: `tests/unit/revision*`, `meta-locks`, `lock*`, `project-json-lock*`, `file-lock`, `resource-crud*`, `trash*`, `split-*`: 57 files, 736 tests passed.
- Not run: the full frontend suite, builds, e2e, any device.
