# Task 16: no-log truncating write (FR-8)

## Contradicts the spec

None found. Task 2 and Task 5 records were used as written (only `updateRevisionInPlace` logs and snapshots; `writeRevisionContent` and `syncDerivedResourceContent` are not exported from `revision-core.ts`, so the new function lives in that file).

## Design as built

`writeCanonicalContentWithoutLog(projectRoot, resourceId, revisionId, content, { lockHeld? })` in `frontend/src/lib/models/revision-core.ts`.

- Default: takes `revision-content:<resolved root>:<resourceId>`, then runs the locked body.
- `{ lockHeld: true }`: skips taking the lock. `acquireLock` is not reentrant, so a caller that holds the lock (Task 20 across the snapshot) must pass this; a second acquire by the same caller would queue behind itself. This option is an addition of this task; the task text says only that the function must not take the lock a second time when the caller holds it.
- Locked body: list revisions, throw `Revision <id> not found.` or `Only the canonical revision can be updated in place.`, then `writeRevisionContent`, `syncDerivedResourceContent`, `mutateSidecar` (`updatedAt`, and `wordCount` when content was synced). It does not call `snapshotBeforeDestructiveWrite` or `logCanonicalSave`.
- `updateRevisionInPlace` is untouched.

## Tests first: failing run

Command (from `frontend/`): `pnpm exec vitest run tests/unit/revision-core-no-log-write.test.ts`

Before the implementation: 1 file failed, 10 tests failed, 0 passed; every failure was `TypeError: writeCanonicalContentWithoutLog is not a function`.

## Green run

Same command after the implementation: 1 file passed, 10 tests passed.

Tests cover: lock key taken and the order persist-derived-files then sidecar (spies on `acquireLock`, `persistResourceContent`, `mutateSidecar`); no lock acquire with `lockHeld`; `content.txt`, `content.tiptap.json`, `wordCount`, `updatedAt` match the text; writing-log directory contents identical before and after (and absent when it was absent); no non-canonical revision for a truncation `isDestructiveContentChange` flags (asserted true in the test); a later `updateRevisionInPlace` logs only its own words (added 2, deleted 0); a non-canonical id and an unknown id are refused with the content of both revisions unchanged; an Undo-style overwrite from a snapshot's stored text.

Not tested here: the lock-order guard of Feature 93 is installed by `tests/setup.ts` for every test, so the nested `revision-content -> withMetaLock -> sidecar file lock` edge is exercised in every test above and none threw. No separate Task 20 caller exists yet, so the `lockHeld` path is covered only by the spy test.

## Regression and checks

- `pnpm exec vitest run tests/unit/revision tests/unit/meta-locks.test.ts tests/unit/project-json-lock-scan.test.ts tests/unit/trash-revisions.test.ts tests/unit/core-import-graph.test.ts` (from `frontend/`; the `tests/unit/revision` prefix matches the existing revision test files): 23 files passed, 210 tests passed, existing tests unmodified.
- `pnpm typecheck` (frontend): run, no errors.
- `pnpm lint` (frontend): run, 0 errors, 459 warnings repo-wide; `eslint` on the two touched files printed no warnings; `prettier --check` on them passed.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): run, no errors.
- `pnpm --filter getwrite-cli typecheck`: run, no errors.
