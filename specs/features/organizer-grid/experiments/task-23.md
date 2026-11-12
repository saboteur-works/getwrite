# Task 23: Wire the grid into the Organizer (results only)

READ = read in source. OBSERVED = printed by a command in this worktree (command sandbox, Vitest/jsdom, tsc, eslint). jsdom is not evidence about a browser, touch, a device or real layout.

## What changed

- `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`: default arrangement kept as today's wrapping list (the existing `DndContext` / `SortableContext` branch, unedited in behaviour); a second branch for every other source/Rows/Columns combination. New imports: Tasks 5, 6, 7, 15, 16, 17, 18, 19, 20, 21, 22 pieces.
- `frontend/tests/organizerView.test.tsx`: 18 new tests (grid branch, field drop, smart-folder source); three transport mocks added at the top; no existing test edited.
- `frontend/tests/organizerFolderCards.test.tsx`: 2 new tests (folder cards by subtype in the grid; failed folder read in the grid branch); none edited.
- Unlisted files: none edited.

## Test order

Red first: after adding the new tests and before touching the view, `pnpm exec vitest run tests/organizerView.test.tsx` gave `15 failed | 43 passed (58)` (the 15 new tests failed on a missing "Rows" label; the 43 existing passed). After the view: all green. The drop, excerpt-failure and the two folder-card tests were added after the view worked (order inverted for those four; they were not seen red).

## Commands and results (from `frontend/`)

- `pnpm exec vitest run tests/organizerView.test.tsx tests/organizerFolderCards.test.tsx`: 2 files, 70 passed (43 + 7 existing, 18 + 2 new).
- Full organizer set plus a11y plus the one test that mounts the view next to settings: `pnpm exec vitest run tests/appShellOrganizerTitleClickViewSuppression.test.tsx tests/organizer tests/useOrganizer tests/a11y tests/component/StatusesSettings.test.tsx tests/unit/organizer`: 94 files, 944 tests passed. Includes `organizerCard.test.tsx` and all existing `tests/a11y/*` organizer tests, unchanged.
- `pnpm test:ci` (whole suite, once, before the last small fix): 925 files passed, 2 failed. (1) `tests/component/StatusesSettings.test.tsx` "after a save the Organizer filter options..." was a real regression from this change: its fixture folder has no `type`, and the new source model tells folders from documents by `type`, so the browsed folder was not found. Fixed in the view by tagging everything from `folders` as `type: "folder"` before the source model; re-run green. (2) `tests/unit/indexer-queue.test.ts` per-save timing test, failed at its 5004 ms limit under the full-suite load; green when run alone with the first file. Not related to the view; the cause (load) is not established, only that it passes alone.
- `pnpm typecheck`: no errors (the earlier `organizer-arrangements.ts` TS2307 reported by Tasks 19 to 22 no longer appears).
- `pnpm exec eslint components/WorkArea/Views/OrganizerView tests/organizerView.test.tsx tests/organizerFolderCards.test.tsx`: 0 errors, 64 warnings, all `no-explicit-any` in the test files and `OrganizerCard.tsx` (pre-existing style); none in `OrganizerView.tsx`.
- `prettier --check` on the three files: clean.

## Done-when, clause by clause

- Default arrangement unchanged: with `rows none`, `columns order`, children source the original branch renders; test "keeps today's list with the default picks" (no `role="grid"`); all 43 existing view tests, the 7 existing folder-card tests, `organizerCard.test.tsx` and the a11y tests pass unchanged.
- Choosing Rows renders the grid (desktop, tablet) or the phone groups (`useViewportTier` `phone`): tests "renders the grid...", "shows grouped lists, with no grid role, below 768px", "keeps the matrix on a tablet". Viewport tier is mocked; the `matchMedia` first-paint flash was not measured.
- Three sources: children (default), descendants (documents only, no folder card, tree order), smart folder (ids from the query transport, including a card from another folder). "This folder" follows the browsed folder live: test navigates by selecting a subfolder and the cards change. Smart-folder shell state untouched by construction (Task 15's hook calls the transport function, not the thunk).
- Filters: hide cards from every cell; reset on folder navigation; "No cards match the current filters." distinct from "This folder is empty." (and "No documents match this smart folder." for an empty smart source).
- Failed, deleted, loading smart folder: own messages (failed shows the message and a Retry that re-evaluates; deleted says "This smart folder no longer exists. Choose another source."; loading says "Loading the smart folder…"); none falls back to another source and none renders a grid. A folder source whose folder is missing says "This folder no longer exists." (code path for a pinned folder; not reachable from the UI today since "This folder" always tracks the browsed one, and not tested).
- Cap: `N not shown. Narrow the source or the filters to reach them.` when the `cardCap` prop (default `ORGANIZER_GRID_CARD_CAP`, currently `null`) leaves cards out; tested with an injected cap of 2; absent when no cap.
- File size: see below.
- typecheck, lint: above.

## Composition decisions and notes (checked against code)

- Cell keys come from the grid model's own lines (`model.rows` / `model.columns`), not from raw values; the drag hook gets `{ axis, values: model.rows }` for a field axis and `values: []` for `none` and `order` (Task 6/7/20 notes). Task 6's `buildAxisValueList` always yields an "Other values" line, so the grid always shows that row (test expects `Draft, Final, Other values, None`).
- Axis value lists are built from the unfiltered source cards (so a filter does not remove a row); the model's `values` map and cap use the filtered cards.
- Folder-sidecar reads: Task 16's hook reads folders for the shown ids only, but the filters and the axis values of a folder card need its sidecar before the filter and cap run (a circular input for one hook call). The view keeps its existing `useFolderRowMetadata` over every folder card of the source (one read per folder, as OQ-18 allows) and passes `shownFolderIds` empty to Task 16's hook, using it for excerpts only. A write to a folder card is merged over the read result (`onFolderSaved`) until the folder ids change.
- Excerpts: default branch requests ids for the whole source (an existing test requires that a filter change triggers no new request); the grid branch requests only the cards left after cap and filters (FR-12), so a filter change there does refetch. A rejected read renders `Card excerpts could not be loaded: <message>` with the cards kept. Task 16 caveat stands and is not fixed here: over HTTP `fetchResourceExcerpts` swallows errors and returns `{}`, so that failure arrives as ready-and-empty and shows no message. `resource-excerpts.ts` was not changed.
- Roving arrow keys vs a drag (Task 20): `OrganizerGrid`'s handler only acts when the event target has `role="gridcell"`; a keyboard drag is lifted from the drag-handle button, so the target is the button and the handler returns. No `isDragActive` prop was added (Grid is not a declared file). Not exercised by a test with a real keyboard drag.
- Order mode: cells are droppable always; cards are `useDroppable` only when Columns is `order` (Task 20 requirement). Cells are enabled even for "Other values" so a refused drop shows its reason instead of "outside the cells".
- Order drop uses the existing `useOrganizerCardReorder` over the browsed folder's full unfiltered siblings (`listChildrenSource`), whichever source is shown. `DRAG_DISABLED_WHILE_FILTERED_REASON` now takes its text from `ORGANIZER_FILTER_ACTIVE_REASON` (same string, no behaviour change).
- Drag outcomes: one `useOrganizerFieldDrop` write per drop; its announcement, a model refusal, or a failure with Retry appear in a `role="status"` line above the grid (desktop/tablet). After a saved drop focus returns to the card's handle in its new cell; a smart-folder source re-evaluates after each saved drop.
- Seams for Task 36: component state `source`, `isSourcePinned`, `rowsAxis`, `columnsAxis` with their setters (`setSource`, `setIsSourcePinned`, `setRowsAxis`, `setColumnsAxis`); `effectiveSource` is the one derived value. `cardCap` and `onResourceGone` are props.
- `onResourceGone` is a prop only; AppShell is not edited, so a "gone" result re-evaluates a smart-folder source but triggers no project re-read in the running app.
- The folder-card Open in the descendants/smart sources does nothing special (no folder cards exist there); in the children source it navigates as before.
- A folder in the store without a `type` is tagged `"folder"` before the source model (see the full-suite regression above).

## File size (FR-2: "the component MUST NOT grow past what it renders")

`OrganizerView.tsx`: 603 lines before, 1108 after; git numstat `+565 -60`. Components it composes, current lines: `OrganizerGrid` 238, `OrganizerGridCell` 161, `OrganizerGridToolbar` 192, `OrganizerPhoneGroups` 159, `OrganizerCard` 275, `OrganizerFilterBar` 350 (sum 1375). The file is smaller than that sum and larger than each single component; whether the clause means the sum or each one is the owner's reading, not settled here. About 190 of the added lines are the two small drag wrappers, the pure helpers and the source-problem text; the rest is the hook wiring and the render branches.

## Not verified

- No browser, touch, device, screen-reader or 360px/767px layout run; the phone view and the grid were rendered in jsdom only. No axe run on the wired view.
- Real pointer or keyboard drag in the wired grid (only the captured `onDragEnd` was driven with synthetic events); focus return after a saved drop was not asserted.
- The smart-folder "card left the smart folder" toast (FR-9) is not implemented here; only the re-evaluation after a saved drop is.
- Phone groups show no card bodies and no drag (component contract of Task 21); the "Hide bodies" toggle has no effect there.
- Behaviour with a saved arrangement, a pinned folder source, or an axis field that stops being offered after a source change (the axis is kept as chosen).
- Cost on large projects: the grid recomputes the model every render (not memoised); not measured.
