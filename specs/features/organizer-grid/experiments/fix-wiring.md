# Fix: four wiring gaps (results only)

READ = read in source. OBSERVED = printed by a command in this worktree (sandbox, Vitest/jsdom, tsc, eslint). jsdom says nothing about a browser, real focus behaviour or a device. Nothing was committed.

## Gap 1: smart-folder card that stops matching (FR-9)

- Red first (OBSERVED): new view test "removes the card and toasts a message naming it..." failed (`toastService.info` called 0 times).
- Fix: new `useOrganizerSmartDropFollowUp.ts` (called from `OrganizerView.tsx`). After a saved drop in a smart-folder source it holds the card id and name; when the re-evaluation returns `ready`, a card absent from the ids gets `toastService.info("<name> left the smart folder because it no longer matches.")`. A failed or deleted result clears it with no toast (the source's own state speaks).
- Tests (`tests/organizerView.test.tsx`, describe "grid wiring fixes"): leaves + toast names Alpha; still matches -> no toast and card in its new cell; re-evaluation fails -> no toast. 3 passed. The test file mocks `../src/lib/toast-service` (`info`, `error`).

## Gap 2: focus after a drop (FR-11)

- Real `OrganizerView`, children source (OBSERVED): the new test "focuses the handle of the card in its new cell" PASSED before any change. The view's effect (keyed on the saved state) focuses the handle after the card re-renders in its new cell. The hook `useOrganizerGridDrag.ts` was left alone.
- Real `OrganizerView`, smart-folder source (OBSERVED): the new test "focuses the handle after the smart-folder re-evaluation settles" FAILED red (`document.activeElement` was `<body>`). Hypothesis, not separately tested: the re-evaluation shows a loading state that unmounts the grid, so the focus call made at save time hit a card that was then removed. Fix: the same follow-up hook focuses the handle once the new ids arrive and the card is in the document. Test then passed.
- The `it.fails` case in `tests/organizerGridKeyboard.test.tsx` was NOT touched (its stand-in harness is unchanged; the real view passes the equivalent check, so the stand-in's failure is a harness property).

## Gap 3: Columns `none`

- Spec (READ): FR-2 says the Columns picker offers "order" or a field and Rows offers "none" or a field; FR-14 describes one shared axis type `"none" | "order" | ...`. The spec does not say a saved arrangement may carry columns `none`, and the picker cannot show it.
- Red first (OBSERVED): new core test "refuses `none` on Columns..." failed (the add returned `ok: true`).
- Fix: `organizer-arrangements-core.ts` `validateAxis` now takes the axis: Rows refuse `order`, Columns refuse `none` (`invalid-axis`, fixed text). It also covers `validateOrganizerArrangementDraft` used for seeded arrangements; no built-in project type seeds columns `none` (READ: grep of `getwrite-config/templates/project-types`).
- Zod schema (`schemas.ts`) deliberately NOT tightened: it gates reads, and refusing there would make a project that already holds a columns `none` arrangement fail to load. The existing Rows `order` case follows the same split (core is the write check). New config test records that a stored `none` Columns axis still parses. Not handled: what the UI does with such an already-stored arrangement (it would apply while the select has no matching option); decision for the owner.
- Existing tests with `columns: "none"` (hook, controls, a11y, route tests) build objects or mock the core and were left unchanged; the route test mocks the core, so its fixture is not refused.
- `pnpm --filter getwrite-electron typecheck`: run as `pnpm typecheck` in `electron/` (both tsconfigs), no errors. `cli/` `pnpm typecheck`: no errors.

## Gap 4: failed availability

- Red first (OBSERVED): controls test and view test for a failed check both failed.
- Fix: `OrganizerArrangementControls.tsx` exports `OrganizerArrangementControlAvailability` (model result or `{ status: "failed"; message }`); a failed row shows `Unavailable (could not be checked): <message>` (same `<p>` and `aria-describedby` as the existing "Unavailable: ..." text), Apply is disabled, Rename and Delete stay enabled. `OrganizerView.tsx` passes `arrangements.availability` straight through; the `availabilityForControls` adapter that mapped `failed` to `pending` was removed, with two now-unused type imports.
- Tests: `organizerArrangementControls.test.tsx` (failed row text, Apply disabled, no call, rename and delete enabled); `organizerView.test.tsx` (smart-folder arrangement with a rejected saved-queries load shows the text and a disabled Apply). Both passed.

## Commands (from `frontend/` unless stated)

- `pnpm typecheck`: no errors. `pnpm lint`: 0 errors, 459 warnings (project-wide, pre-existing style; none introduced on purpose).
- `pnpm exec vitest run tests/organizer tests/useOrganizer tests/a11y/organizer tests/unit/organizer tests/appShellOrganizerTitleClickViewSuppression.test.tsx tests/component/StatusesSettings.test.tsx`: 41 files, 654 passed, 1 expected fail (the Task 38 `it.fails`).
- `electron/` `pnpm typecheck`, `cli/` `pnpm typecheck`: clean.
- `OrganizerView.tsx`: 1196 lines before, 1197 after.

## Files

Edited: `OrganizerView.tsx`, `OrganizerArrangementControls.tsx`, `src/lib/models/organizer-arrangements-core.ts`, `tests/organizerView.test.tsx`, `tests/organizerArrangementControls.test.tsx`, `tests/unit/organizer-arrangements-core.test.ts`, `tests/unit/organizer-arrangements-config.test.ts`. New: `useOrganizerSmartDropFollowUp.ts`, this record.

## Not verified

Real browser focus, a real pointer or keyboard drag (the view tests drive the captured `onDragEnd`), the toast's on-screen look, 360px layout, axe on the failed-row text, the full `pnpm test:ci`, Storybook, e2e.
