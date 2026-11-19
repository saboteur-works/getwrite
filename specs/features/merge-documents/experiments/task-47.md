# Task 47: merged-mark store refuses a date that is not a full instant (FR-5)

Results only.

## Tests first (before any change to `merge-mark-core.ts`)

Command: `npx vitest run tests/unit/merge-mark-core.test.ts` from `frontend/`.
Result: 4 failed, 22 passed (26).

- `refuses a date-only value on write and writes nothing`: failed (no refusal; `MergeMarkInvalidDateError` did not exist yet).
- `refuses an unparseable date on write and writes nothing`: failed, same reason.
- `reads a stored date of "2026-11-18" as failed...`: failed, read returned `found`.
- `reads a stored date of "2026-11-18T10:00:00" as failed...` (no zone designator): failed, read returned `found`.

The `"not a date"` read case and the full-instant acceptance test already passed (the old check rejected an unparseable string).

## Change

`merge-mark-core.ts`: `MergeMarkInvalidDateError`; `isFullInstant` (date, `T`, hours and minutes, optional seconds and fraction, and `Z` or a `+/-HH:MM` offset, and it must also parse). `writeMergedMark` throws before taking the sidecar lock, so nothing is written. `parseMark` uses the same check, so a stored date-only, zone-less or unparseable date reads as `failed`.

## Final results

- `merge-mark-core.test.ts`: 26 passed, 0 failed.
- `pnpm typecheck` (frontend): clean.
- `pnpm lint` (frontend): 0 errors (459 warnings repo-wide; `eslint` on the two changed files prints nothing).
- Electron `pnpm typecheck` (both passes, `tsc --noEmit` and `tsconfig.worker.json`): clean.
- CLI `pnpm typecheck`: clean.

## Existing tests changed

None. No existing test wrote a date-only value (the shared `mark()` helper uses `2026-11-18T10:00:00.000Z`); 22 existing tests pass unmodified. New tests only were added. `experiments/task-30.md` and Task 30's tests were not edited.

Not run: the full `test:ci` suite, only `merge-mark-core.test.ts`. A grep found no caller of `writeMergedMark` outside the store and its test.
