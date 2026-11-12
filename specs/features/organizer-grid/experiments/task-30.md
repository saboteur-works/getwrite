# Task 30: Last-used arrangement preference

Results of this task only (FR-16, OQ-4).

## Built

- `frontend/src/lib/organizer-arrangement-preference.ts`: `organizerArrangementStorageKey`, `readLastOrganizerArrangementId`, `writeLastOrganizerArrangementId`. Key `getwrite-organizer-arrangement:<projectDirId>`; value is the arrangement id; absent reads as `null` (the default arrangement).
- `frontend/tests/unit/organizer-arrangement-preference.test.ts`: 9 cases.
- Id validation reuses `isWellFormedProjectId` from `capture-preferences.ts` (letters, digits, `-`, `_`, 1 to 128 characters), for the project id, the stored value and the written arrangement id.

## Measurements

- Before the source file existed, the new test file failed to load (no tests run), the expected red.
- `npx vitest run tests/unit/organizer-arrangement-preference.test.ts`: 1 file, 9 tests passed.
- `pnpm typecheck` (`tsc --noEmit`): no errors.
- `npx eslint` on the two new files: no output. `npx prettier --check` on them: clean.
- Not run: the full `pnpm test:ci` and `pnpm lint` over the whole tree (only the two new files were linted).

## Behaviours pinned by tests

- Key format and the stored value are exactly as above; a round trip returns the id.
- Nothing stored reads as `null`.
- Two project ids do not share a value.
- A malformed stored value (empty, path-like, space, over 128 characters, JSON) reads as `null`.
- A read calls neither `setItem` nor `removeItem`, and leaves a malformed value in place.
- A throwing `getItem` returns `null`; a throwing `setItem` returns `false`; neither throws.
- A malformed project id or arrangement id on write returns `false` and writes nothing.

## Limits

- A failed read returns `null`, the same as "nothing stored". The task text asks that a storage failure on read never throws and does not distinguish the two, so the caller (Task 32) cannot tell them apart from this module. If the hook is to say "unreadable" separately from "missing", the read would need a richer result; not decided here.
- The value is not checked against the project's arrangement list; that belongs to the hook (Task 32).
