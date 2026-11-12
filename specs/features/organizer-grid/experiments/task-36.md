# Task 36: Arrangements wired into the Organizer toolbar (results only)

READ = read in source. OBSERVED = printed by a command in this worktree (sandbox, Vitest/jsdom, tsc, eslint). jsdom says nothing about real layout, a browser or a device.

## What changed

- `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`: mounts `useOrganizerArrangements` and `OrganizerArrangementControls` under the grid toolbar (inside the existing `selectedFolder` block), in a wrapper `div[data-organizer-arrangements]` with `min-w-0 max-w-full`. `onApply` sets source, rows and columns only (`setSource`, `setRowsAxis`, `setColumnsAxis`); filter state is not touched. A folder source with a folder id is pinned (`setIsSourcePinned(true)`) so the arrangement keeps its saved folder; the toolbar's own Source picker still unpins. `current` is `effectiveSource`, rows, columns; `defaultPicks` is children of the browsed folder, rows none, columns order. The hook's `notice` and a refused `apply` message show in a `role="status"` line. Two small adapters: `availabilityForControls`, `asArrangementResult`.
- `frontend/tests/organizerView.test.tsx`: 6 new tests (describe "OrganizerView arrangements (Feature 109, Task 36)"), one mock added (`organizer-arrangements` transport, `addOrganizerArrangement` only). No existing test edited.
- Unlisted files: none.
- Line diff (`git diff --numstat`): `OrganizerView.tsx` +88 -0 (1108 to 1196 lines); `organizerView.test.tsx` +181 -0.

## Test order

Red first (OBSERVED): after adding the 6 tests and before touching the view, `pnpm exec vitest run tests/organizerView.test.tsx` gave 6 failed, 61 passed. After the view, two fixture problems were fixed in the tests (not the clauses): the hook reads folders from the stored project (`project.folders`), and reports availability `pending` until the saved queries are loaded, so the fixture sets `project.folders` and dispatches `loadSavedQueries`; and `role="status"` also matches dnd-kit's live region, so the no-notice assertions use text. Then 67 of 67 passed.

## Commands (from `frontend/`)

- `pnpm exec vitest run tests/organizerView.test.tsx`: 67 passed (61 existing + 6 new).
- `pnpm exec vitest run tests/appShellOrganizerTitleClickViewSuppression.test.tsx tests/organizer tests/useOrganizer tests/a11y tests/component/StatusesSettings.test.tsx tests/unit/organizer`: 96 files, 968 passed, 1 expected fail.
- `pnpm typecheck`: no errors.
- `pnpm exec eslint` on the two files: 0 errors, 60 warnings (test-file style warnings; none were fixed or added on purpose).
- `prettier --check` on the two files: clean.

## Done-when, clause by clause

- Toolbar shows `Default` with no arrangements; existing tests unchanged: test "shows Default for a project with no arrangements" ("Applied: Default"); the 61 existing tests pass unedited.
- Saving then applying changes only source, rows, columns: "applies source, rows and columns only, leaving the filters" (status filter Draft stays and Bravo stays hidden) and "saves the current picks, then applying another..." (the add call carries exactly `name, source, rows, columns`; after saving, Flat is applied, Source, Rows, Columns change, the filter is unchanged).
- Remembered one applied on open, unavailable one falls back with a message: "applies the remembered arrangement on open" and "falls back to the default with a message..." (message text from the hook, containing "Showing the default arrangement"; Rows stays none).
- 360px: class assertion in "saves and applies at 360px...": the controls row has `flex-wrap`, the wrapper has `min-w-0` and `max-w-full`; save and apply run on the phone tier. This is a class assertion only; no width was measured.
- typecheck, lint: above.

## Findings and deviations

- The Columns picker (`OrganizerGridToolbar.tsx`, READ) offers `order` and fields, never `none`, although `none` is a valid stored columns axis. An arrangement saved with columns `none` would apply (the model gets `none`) while the select has no matching option. Not edited (file not declared); tests use columns `order`. Decision for the owner.
- A `failed` availability (saved queries did not load) is passed to the controls as `pending` (the controls type has no `failed`), so the row shows no reason and Apply is enabled; the hook's `apply` then refuses with its text, shown in the status line. Not tested in this file (the hook test covers `failed`).
- `asArrangementResult` labels a hook refusal with `reason: "invalid-input"` because the hook carries only a message; the controls show only `message`.
- Pinning: applying a folder arrangement pins to its saved folder, so navigating elsewhere afterwards does not change the source; this was my choice, not stated by the task.
- Choosing Default writes nothing (Task 32 decision), so a previously remembered arrangement comes back on next open.

## Not verified

- Real 360px layout, browser, touch, screen reader, focus return after saving or applying; no axe run on the wired view.
- `pnpm test:ci` over the whole suite, full-tree lint, builds.
- A saved-queries load that fails or arrives after mount, within the view (only the hook test covers it).
