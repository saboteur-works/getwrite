# Task 23: latest-operation record accepts both kinds (FR-21)

## Measured

- Tests first: the new cases were added to `frontend/tests/unit/split-records-core.test.ts` before the change. Against the old validator, `vitest run` gave 10 failed, 25 passed of 35 (the missing `isLatestOperationRecord` export, and a merge record with no `newDocumentId` refused on write).
- After the change: 35 of 35 pass. The 25 pre-existing tests are unmodified and pass.
- `pnpm typecheck` (frontend), electron `pnpm typecheck` (both passes) and cli `pnpm typecheck`: no errors.
- `pnpm lint` (frontend): 0 errors; the warnings are pre-existing; eslint on the two touched files gives none.

## What changed

`isLatestOperationRecord` in `split-records-core.ts` is now exported and:

- requires kind `split` or `merge`, a non-empty `affectedDocumentIds` of UUIDs, snapshot refs of valid shape and an ISO date, for both kinds;
- `split`: requires a valid UUID `newDocumentId`;
- `merge` with no `newDocumentId`: requires exactly one snapshot ref per affected document (a list shorter than the affected list, or one that misses a document, is refused);
- any `newDocumentId` present must be a valid UUID;
- a revision id is only a non-empty string, never matched against `v-<n>`.

Write, read, replace (split then merge, merge then split), clear and re-read from the stored file go through the adapter; a malformed stored merge record reads `failed`, never `none`. Lineage-entry functions are untouched.

## Decision to confirm

An existing test (`accepts the merge kind so Feature 121 needs no migration`) stores a `merge` record that has a `newDocumentId` and one snapshot for two affected ids, and the task requires existing tests to pass unmodified. The snapshot-coverage rule therefore applies only to a merge record without `newDocumentId`; a merge record with a valid `newDocumentId` is accepted under the old rule. Task 25 writes merge records without `newDocumentId`, so it always meets the coverage rule. If the owner wants the rule on every merge record, that old test must change.
