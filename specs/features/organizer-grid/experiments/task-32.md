# Task 32: arrangements hook

Results only. Feature 109, FR-14, FR-15, FR-16, FR-19. Files: `frontend/components/WorkArea/Views/OrganizerView/useOrganizerArrangements.ts`, `frontend/tests/useOrganizerArrangements.test.tsx`.

## Measured

- Tests first: before the hook existed, `pnpm exec vitest run tests/useOrganizerArrangements.test.tsx` (from `frontend/`) failed at import, no tests ran.
- After the hook: 1 file, 26 tests passed (first run).
- `pnpm typecheck`: one error, `src/lib/api/organizer-arrangements.ts(171,12) TS2307` for `store/transport/native-organizer-arrangements-backend`, which is not in this worktree (`ls src/store/transport | grep organizer` lists only the field-write backend pair). No error in the two new files. Same error was recorded in task-27.md.
- `pnpm exec eslint` on the two files: no output after renaming two booleans (`naming-convention` required an `is` prefix). `prettier --write` applied.

## Contract as built

- Inputs: `{ current: {source, rows, columns}, defaultPicks, onApply(picks) }`. The caller owns the picks and the filters; `onApply` receives only `source`, `rows`, `columns` (tested by key list).
- Outputs: `arrangements` (the selector's list, same reference), `appliedId` (`null` = Default), `availability` (per id), `isChanged`, `notice`, `error`, `isBusy`, `apply(id|null)`, `save(name)`, `rename(id, name)`, `remove(id)`.
- The transport project id is the active project's directory id.
- Write result carries only `{ ok, id }`, so after success the stored project is updated with `setProject({ ...stored, organizerArrangements: next })`, the list built from the request (name trimmed) plus the returned id, from the latest store state. Before success nothing changes (tested with a pending promise). Refusal, `request-failed` and a rejected transport (for example locked) return `{ ok: false, message }`, set `error`, and leave the list.
- Save applies the new arrangement (`appliedId`) and remembers its id; delete of the applied one resets to Default.
- Availability: from `getArrangementAvailability`. Folders and schema are loaded when the stored project exists; queries only when `queryState.projectId` equals the selected project and not loading. A failed query list (not loaded, not loading, `errorMessage` non-empty) gives `{ status: "failed", message }` for smart-folder arrangements; others are checked normally. Not loaded yet gives `pending`; `apply` refuses pending, failed and unavailable with text.
- Remembered id on open (once per project): none stored, no message, Default stays; id not in list, malformed or unreadable storage, or unavailable: Default plus `notice`, nothing written or removed (spied `setItem`/`removeItem`); pending or failed: waits, and applies when the list loads (tested after a failed then successful load).
- `isChanged`: canonical (key-order independent) comparison of current picks to the applied arrangement's, or to `defaultPicks` for Default.

## Limits and deviations (not verified beyond unit tests)

- `readLastOrganizerArrangementId` returns null for missing, malformed and unreadable, so the hook does a second read-only `localStorage.getItem` on the same key (via `organizerArrangementStorageKey`) to tell missing from unreadable. Not a change to Task 30's module.
- Applying Default does not write the preference (the module has no clear function), so after choosing Default the previous remembered id is applied again on the next open. Decision for the owner.
- Entries built client-side may differ from the stored copy if the core normalises more than trim; not compared with Task 25's core (not in this tree).
- Not run: full `pnpm test:ci`, `pnpm lint` over the whole tree, a running app. No unlisted files edited.
