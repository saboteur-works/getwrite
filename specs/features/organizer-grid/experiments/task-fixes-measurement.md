# Fixes after the desktop measurement and the docs review (Feature 109)

Approved by the owner 2026-11-11. Worked in the main checkout on `feat/organizer-grid` (HEAD eba46efb), uncommitted for the lead. `ORGANIZER_GRID_CARD_CAP` is still `null`. Sources of the problems: `task-42-measurement-desktop.md` ("Failed or looked wrong") and `task-43.md` (spec contradictions). Everything below is jsdom with fakes unless it says otherwise; none of it is a browser, device or `next dev` result, so the observed browser symptoms were not re-measured.

Where a test was written in the same step as the change instead of before it, that is said; otherwise the test was run red first.

## 1. Excerpts above 1000 cards

- Change: `src/lib/api/resource-excerpts.ts`. `fetchResourceExcerptsOrThrow` splits ids into batches of at most `EXCERPT_BATCH_SIZE` (1000, equal to the route's `MAX_RESOURCE_IDS`), calls the transport's `fetchOrThrow` per batch with `Promise.all` and merges. One rejected batch rejects the whole call, so a partial map is never shown as complete. Done in the shared function, so the native backend (which has no limit of its own in `resource-excerpts-core.ts`) takes the same path; I did not add a limit to the native backend.
- Tests (`tests/unit/resource-excerpts-transport.test.ts`): 2500 ids go out as 1000 / 1000 / 500 and merge to 2500 entries; 1000 ids make one request; a failing second batch rejects. Test and change were written together (the tests were not run red first).
- Result: 13 tests pass.

## 2. Repeat switch to a smart folder shows loading, not old cards

- Cause as read (not separately experimented): `useOrganizerSmartFolderCards` kept its last `evaluation` in state and showed it whenever the inputs (query id, project directory, nonce, saved-query list identity) matched. Switching to a folder and back to the same smart folder matched again, so the old ids were `ready` immediately while the new request was in flight.
- Choice: an `activation` counter, bumped during render (the derive-from-props state pattern) every time the hook's `queryId` changes, including away from a smart folder (`null`) and back. It is part of the evaluation's inputs, so an evaluation from an earlier selection never matches and the hook is `loading` until the current request answers. `OrganizerGridView` already renders "Loading the smart folder…" for `loading`, so no view change was needed. The existing per-effect `isStale` flag still discards a late result of a superseded request.
- Tests (`tests/useOrganizerSmartFolderCards.test.tsx`): selecting the same smart folder again reads `loading` (not the earlier ids) until the new request resolves (red before the change, green after); a first request that resolves after a newer request for the same folder is ignored (this one also passed before the change, because of `isStale`; it pins the behaviour).
- Not measured: whether the painted-before-answer gap seen at 2000 cards in the browser is gone.

## 3. Keyboard drag: one arrow press is one cell

- Cause as read: `createCoordinateGetter` picked the nearest droppable by centre distance, with the perpendicular offset weighted 1000x, and excluded only the active card's own draggable id, not the card's own cell. A card sits at the top of a tall cell, so the own cell's centre lay below the card's centre and won the first ArrowDown. The existing test harnesses used equal 100x100 cells with the card exactly the cell's size, so they could not show it. Reproduced in `tests/useOrganizerGridDrag.test.tsx` with cells of different heights and a smaller card (2 of 5 new tests red: ArrowDown landed on the own cell, and two presses reached only the second row).
- Choice: for cell targets (`cell:` prefix) the getter now finds the current cell (the one whose rect holds the dragged card's centre, else the nearest centre) and moves to the adjacent cell by edges: for Up/Down the nearest cell that starts where the current one ends and overlaps its column; for Left/Right the same by row. Empty cells are targets as before; at the grid's edge it returns `undefined` (no move). Cell heights may differ. The order-mode getter (targets are cards, `card:` prefix) keeps the earlier nearest-centre rule, since there the dragged card's own draggable is excluded and the measurement did not show the problem there. The destination coordinates still centre the card in the target cell, and collision detection (`closestCenter`) is unchanged.
- Tests: `tests/useOrganizerGridDrag.test.tsx` new describe "one arrow press is one cell" (Down from row 1 reaches row 2; Down twice reaches row 3, an empty refusing cell; Right and Left one column; Up one row; no move at the edge). `tests/organizerGridKeyboard.test.tsx`: the rect mock now gives cells different heights and cards a smaller rect at the top of their cell, and a new test asserts one press per cell across Down, Down, Right, Up, Left with the announced row and column. With the old getter the new test and the existing "refuses a drop on Other values" test (two Down presses to the third row) fail in that harness; with the new getter both pass.
- Not verified: a real browser. In jsdom the rects are mocked, so the 2 to 3 press symptom was reproduced only in a model of the layout, not in the Chromium grid.

## 4. No excerpt request at phone width

- Change: `OrganizerGridView.tsx` passes `isExcerptWanted: !isPhone && isShowingBody && cardBodyConfig?.source === "text-excerpt"`. The default list (`OrganizerView`, Rows none) is a separate branch; at phone width with the default arrangement it still shows bodies and still requests excerpts.
- Tests (`tests/organizerGridWiring.test.tsx`, "excerpt requests follow what the shown layout renders"): desktop grid with a text-excerpt body requests the two shown ids; phone grid requests none after the switch to Rows = Status (the phone case failed before the change); desktop with the card body set to notes requests none. The phone test clears the mock after the default list's own request, then picks Rows.

## 5. Duplicate marking (FR-5)

- Change: `OrganizerGrid.tsx` marks a placement only when `appearance > 0` (appearances are numbered row-major in `buildOrganizerGridModel`). `alsoInOtherCells` on the model is unchanged (it still counts the other cells).
- Tests: `tests/organizerGrid.test.tsx` (the old duplicate test now expects 1 mark for two appearances; new test: three cells, first unmarked, two marked "also in 2 other cells"), `tests/organizerGridModel.test.ts` (appearance order is reading order over two multi axes), `tests/a11y/organizerGrid.a11y.test.tsx` (count 2 to 1), and the story `TwoAxisGrid` play function in `stories/WorkArea/OrganizerGrid.stories.tsx` (2 to 1; story not rendered or run).
- The phone grouped lists still mark every group of a card that is in several ("Same document, also in N other groups"). The request named the grid and FR-5; FR-10 has its own wording for phone and I left it.

## 6. "Other values" only when needed

- Change: `organizerGridModel.ts` `buildAxisLines` adds the Other line only when a shown card lands in it (`otherUsed`); a list's own Other entry (the wired view's list always has one) now only supplies the label. `buildAxisValueList` is unchanged (its tests still say it lists Other, then None). "None" is unchanged and always shown.
- Tests: `tests/organizerGridModel.test.ts` (listed Other omitted when no card needs it; shown with the list's label before None when one does), `tests/organizerGridWiring.test.tsx` (wired view: rows Draft, Final, None with in-list or no status; Draft, Final, Other values, None with an off-list status). `tests/organizerView.test.tsx` expected the old always-listed row and now expects the three headings.

## 7. Project-type seeds with Columns "none" or Rows "order"

- Observed in code: Rows `order` was already refused by the seed schema (`seedAxisSchema(false)`); Columns `none` was accepted. Both are now refused by one rule: `seedAxisSchema("rows" | "columns")` allows `none` for Rows only and `order` for Columns only, same as the arrangements core.
- Message (existing style, names no client input): "Arrangements must each have a name, a folder source, rows (none or a field) and columns (order or a field), with no repeated names." The text of the single `PROJECT_TYPE_ARRANGEMENTS_MESSAGE` changed, so it now also states the axis rule for the other refusals of that list.
- Tests (`tests/unit/project-type.test.ts`): Columns `none` and Rows `order` fail with an issue at path `arrangements` carrying the message; every allowed Rows x Columns pair validates. Built-in types: validated by the `*roject*ype*` tests that load them (all pass). `docs/features/project-types.md` and `docs/features/organizer-grid.md` quote the new message.

## 8. Project Type Manager and `arrangements`

- Choice: no change to the Manager. The draft keeps the key because every edit path spreads the whole definition (`{ ...current, ... }`), and `normalizeDefinition` spreads it too. `ProjectTypeDefinition` (`src/types/project-types.ts`) does not declare `arrangements`; I did not add it, since nothing reads it in the Manager.
- Tests (`tests/unit/project-type-draft-service-hook.test.tsx`): a saved type carrying `arrangements` is loaded into `useProjectTypeDraftService`, `description` and the word-count goal are edited, and saved; the `update` payload and the kept item definition both hold `arrangements` equal to the loaded value. A rename keeps them in the draft. They passed on the first run, so they pin existing behaviour. Scope: the hook and service, not the Manager page or the PUT route.

## 9. Fixture generator

- `scripts/organizer-grid-fixture/generate.mjs`: `project.json` now has `rootPath` (the absolute project directory). The project id comes from its own stream keyed by seed and count (`mulberry32(imul(seed, 100003) + count)`); the main random stream still draws one (unused) id first, so every other id and value is what it was. Checked by generating 100 cards before and after: resource ids and sidecar content are identical, only the project id (and the `rootPath` and revision `filePath` fields that contain it) differ. The default (seed 109) output is deterministic: two runs gave the same id. Counts for 100 and 500 are the same as `task-4.md` (folders 4 / 20; status 87 / 447; subtype 91 / 454). 100 and 500 generated into one directory sit side by side with different ids.
- The default project id for each count changed (for 100 it was `ed925881-...`, now `0173b64b-...`), so anything quoting the old id (the `task-42` record names `ed925881-…`) refers to the earlier generator. `task-4.md` is history and was not edited. The script has no test; the README was updated. A loader or Start page open of a generated project was not run.

## 10. Docs

- `docs/features/folder-metadata.md`: a sentence on `clearFieldKeys`.
- `docs/user/handbook/protect-and-finish/project-configuration.md`: `organizerArrangements` entry in "Keys inside `config`".
- `docs/features/organizer-grid.md`: Other values only when used, first appearance unmarked, smart-folder loading on a repeat switch, excerpt batching and the no-request rule, one-cell keyboard moves, seed axis rule and message, Manager keeps `arrangements`, stored schema vs seed schema, unsaved picks reset after reload.
- `docs/user/handbook/views/organizer.md`: Other values, duplicate marking, loading on smart-folder switch, one press per cell, and "Choices you make in Source, Rows and Columns are remembered only when you save them as an arrangement" (FR-16: only the applied arrangement's id is remembered). `docs/user/handbook/organize/project-types.md`: seed axis rule and message, Manager keeps `arrangements` on save; I also removed "when two arrangements share a name" from the list of silent omissions there, because a duplicate name in one type is refused when the type is validated (the module-versus-type duplicate case has no shipped module and no writer-facing path).
- `docs/features/project-types.md`: Columns/Rows rule, message, Manager statement.
- The excerpt batching has no handbook text (it is not writer-visible apart from the error it removes).

## Checks run (from `frontend/`)

- `pnpm typecheck`: clean.
- `pnpm lint`: 0 errors, 459 warnings (the same count as the previous record). `eslint` on the Organizer folder, the story and `resource-excerpts.ts`: 0 errors, the one existing warning in `OrganizerCard.tsx`.
- `pnpm run check:no-hex`: no violations.
- `vitest run rganizer roject-type rojectType resource-excerpts`: 67 files, 1208 passed, 1 expected fail (the existing `it.fails` in `organizerGridKeyboard.test.tsx`). Before updating `tests/organizerView.test.tsx` and `tests/a11y/organizerGrid.a11y.test.tsx` (both asserted the old Other values row and old duplicate count) 2 of these failed; both are consequences of items 5 and 6 and were updated.
- `pnpm test:ci` once: 931 files passed, 12745 tests passed, 8 expected fail, 1 skipped. No flake failures. (The run was before the one-line story edit.)
- Touched files formatted with `prettier --write`.

## Not verified

- No browser, device, Electron or paired-device run. None of the observed browser symptoms (excerpt 400 at 2000, cards before the smart-folder answer, 2 to 3 arrow presses, excerpts at phone width) was re-measured; each is covered by jsdom tests with fakes only. The keyboard fix is tested against mocked rects.
- Storybook and e2e were not run. The edited `TwoAxisGrid` play function was changed from the unit-test result only. Read, not run: the stories' seed data has a card with the off-list status "Parked", so the Other values row that `e2e/organizer-grid-phone.e2e.spec.ts` expects should still be listed under item 6; the e2e spec itself checks no "also in" text.
- `next build`, `build:native` not run.
- Excerpt batching on the native path: same shared function, not run against the native backend. Batches are sent in parallel; their effect on the server at 2000 cards was not measured.
- Focus after a drop at 2000 cards (problem 9 of the measurement) and the first-drag slowness (10) were not in scope and are unchanged.
- The seed validation message was read in the Project Type Manager only through `validateProjectType` issues, not on the rendered page.
