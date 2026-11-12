# Task 40: Pins for the default arrangement, drag integration and wiring (results only)

OBSERVED = printed by a command in this worktree (command sandbox, Vitest/jsdom, tsc, eslint). READ = read in source, not run. Fakes only: every transport, the viewport tier and `@dnd-kit`'s `onDragEnd` entry are mocks or synthetic events in jsdom. Nothing here is device, browser, real-pointer, real-keyboard-drag or paired-device evidence. No component or hook was edited.

## File

`frontend/tests/organizerGridWiring.test.tsx` (new, 8 tests). Harness: the mocks and the captured `DndContext` `onDragEnd` of `tests/organizerView.test.tsx`, driven with synthetic events using `cardDraggableId` and `cellDroppableId`. Four extra spies guard "no writing-log or revision call": `updateSidecar`, `patchRevisionContent` (`src/lib/api/resources`), `getTodayWritingLog`, `setDailyWordGoal` (`src/lib/api/writing-log`); each drag test asserts none was called.

## Done-when, clause by clause (all OBSERVED green, 8 of 8)

- Default arrangement, same card sequence as Task 1 (a): "renders folders first then documents...": children `DocA 0, Folder1 1, DocB 2, Folder2 3, DocC 4`, no arrangements; no `grid` role, Rows `none`, Columns `order`; heading order `Folder1, Folder2, DocA, DocB, DocC`, equal to `ORGANIZER_ORDER` in task-1.md (a).
- Two-axis drop: one `setOrganizerFields` call with status `Final` and field `act` `One` in one `changes` array; while the write promise is pending the card is still in cell `Draft, None` and Redux status is still `Draft`; after resolving, the card is in `Final, One`.
- Failed write: outcome `failed`; card stays in `Draft, None` and Redux is unchanged; the live-region (`role="status"`) text is `Couldn't save the change to Alpha. It stays in its original cell. Try again.`. The outcome's own message (`disk said no`) goes to `toastService.error` as the detail, not into the live region (READ in `useOrganizerFieldDrop.ts` `fail`; the test asserts both).
- Drop onto None: one call with `changes: [{ target: { kind: "status" }, op: "clear" }]`; the card moves to `None, None`; Redux status undefined.
- Subtype scope: the Scene-only field is offered only when some card is in scope (the Columns picker did not offer it with no Scene card; first run of this test failed on that fixture, not on the behaviour), so Bravo is a Scene and Alpha has no subtype; dropping Alpha on the Mood column makes no call and shows `This field does not apply to the document's subtype.`; the card stays.
- Smart-folder card that stops matching: after a saved drop the second evaluation omits Alpha; Alpha leaves, `toastService.info` is called once with text matching `Alpha ... left the smart folder`.
- Reorder while a filter is active: Rows status, Columns order, status filter Draft; dropping one card on another in the row shows `Clear filters to reorder cards`, `reorderResources` and `setOrganizerFields` not called.
- No writing-log or revision call: asserted in every drag test above (list of spies in File).
- Locked project: (1) with no project open, the view renders `Select a folder to view its contents.` and no `grid`; (2) a write that rejects with `ProjectLockedError` leaves the card in its cell, Redux unchanged, and `toastService.error` is called. Limits: test (1) shows no grid for a store with no open project; it does not exercise the real open-project path that refuses a locked project (spec FR-13: "a locked project is not open"); that path (`loadProjectCore`, Start page) is covered elsewhere (`startPageLocked.test.tsx`, READ, not run here). Test (2) does not assert any unlock prompt.

## Commands (from `frontend/`)

- `pnpm exec vitest run tests/organizerGridWiring.test.tsx`: 1 file, 8 passed.
- `pnpm exec vitest run tests/organizer tests/useOrganizer tests/a11y/organizer tests/unit/organizer tests/appShellOrganizerTitleClickViewSuppression.test.tsx tests/component/StatusesSettings.test.tsx`: 42 files, 662 passed, 1 expected fail (the Task 38 `it.fails`).
- `pnpm typecheck`: no errors (two TS errors in the first draft of this file, a `ProjectLockedError` constructor argument and an untyped `container`, were fixed in the test).
- `pnpm exec eslint tests/organizerGridWiring.test.tsx`: no output. `prettier --check`: clean.
- `git status --short` after the mutation runs: only `?? frontend/tests/organizerGridWiring.test.tsx` (plus this record).

## Mutation checks (temporary edit, run, restore from a backup copy; OBSERVED)

Script kept in the session scratchpad only. Each edit was restored; the status check above shows no component diff.

- M1 `organizerSource.ts` `listChildrenSource` returns documents before folders: the default-order test failed (1 failed).
- M2 apply the Redux patch before awaiting the write (optimistic): three tests failed (two-axis drop, failed write, locked-access).
- M3 apply the Redux patch on a `failed` outcome: the failed-write test failed.
- M4 change the `ORGANIZER_FILTER_ACTIVE_REASON` text: the filtered-reorder test failed.
- M5 remove the `toastService.info` call in `useOrganizerSmartDropFollowUp.ts`: the smart-folder test failed.
- M6 remove the `field-out-of-subtype-scope` refusal in `organizerDropModel.ts`: the subtype-scope test failed.

Not mutation-checked: the drop onto None (clear) test, the "no writing-log or revision call" assertions (they only guard against a call that no current code path makes, so no one-line mutation was tried), the no-open-project half of the locked test, and the smart-folder "still matches" counterpart (not in this file; it is in `organizerView.test.tsx`).

## Not verified

Real pointer or keyboard drag, focus return, a real route or native backend, a real encrypted or locked project, any browser, device or paired-device run, the full `pnpm test:ci`, lint of the whole tree, e2e.
