# Post-integration fixes (Feature 109)

Approved by the owner 2026-11-11. Worked in the main checkout on `feat/organizer-grid` (HEAD f4043ed1), uncommitted for the lead.

## 1. Split of `OrganizerView.tsx` (FR-2)

Measured with `wc -l`: `OrganizerView.tsx` was 1197 lines at HEAD (603 before the grid) and is now 567. Behaviour is meant to be unchanged; no existing test file was edited for the split (the full suite passes with the tests as they were, see below).

| File | Lines | Holds |
|---|---|---|
| `OrganizerView.tsx` | 567 | header, browsed folder, filters, default sortable list, switch to the grid |
| `OrganizerGridView.tsx` (new) | 489 | grid model, field/order drops, phone groups, drop status line, excerpts for shown cards, "N not shown" |
| `useOrganizerSourceData.ts` (new) | 195 | source resolution, smart-folder state, folder sidecar read, `describeSourceProblem` |
| `useOrganizerPicks.ts` (new) | 122 | source/rows/columns state, saved-arrangement wiring, `asArrangementResult` |
| `OrganizerToolbarArea.tsx` (new) | 101 | pickers, source select, arrangement controls, apply message |
| `OrganizerStateMessage.tsx` (new) | 72 | source-problem / empty / no-filter-match text shared by both branches |
| `cardBody.ts` | +8 | `resolveCardTitle` moved here (used by both branches) |

Two choices worth knowing:
- `OrganizerGridView` stays mounted while the source is loading, empty or filtered to nothing (it renders the shared state message in place of the grid). A smart-folder drop re-reads the source and shows "loading" meanwhile; unmounting then would lose the drop's saved state and the focus follow-up.
- The grid's hooks (field drop, grid drag) now mount only while a non-default arrangement is shown; before they ran in the default list too. Switching from the grid to the default drops a pending drop's status text. Not measured for any user-visible effect.
- The default list and the grid each call `useOrganizerShownCardData` and `useOrganizerCardReorder`, so excerpts are fetched again on a switch of branch (previously one hook instance). Not measured.

## 2. Stored Columns `"none"` / Rows `"order"` shown as unavailable

`organizerArrangementAvailability.ts` now reports `unavailable` with new reason `axis-not-allowed` (added to `OrganizerUnavailableReason`; text "This arrangement uses a Rows or Columns choice that cannot be applied.", echoes nothing stored) for Columns `"none"` or Rows `"order"`. It stays `pending` while folders, queries or schema load, like the other reasons. The Zod schema is untouched, so a stored value still loads; nothing is applied or rewritten (the existing remembered-arrangement path reports an unavailable one as a notice and rewrites nothing, covered by an existing test).
Tests (`tests/organizerArrangementAvailability.test.ts`): Columns none and Rows order unavailable; pending while loading; distinct message count now 5.
Fixture change, required by this behaviour: `tests/useOrganizerArrangements.test.tsx` used `columns: "none"` in `ARR_A`, `ARR_SMART`, `DEFAULT_PICKS` and one inline pick; these are now `{ kind: "subtype" }` / `"order"` since a Columns-none arrangement is no longer available. `tests/organizerArrangementControls.test.tsx` still has `columns: "none"` in a presentational fixture and was left alone (the controls take availability as a prop).

## 3. "Default" clears the remembered arrangement

`clearLastOrganizerArrangementId(projectDirId)` added to `src/lib/organizer-arrangement-preference.ts` (removes the key; false for a malformed project id or a storage failure, never throws). `useOrganizerArrangements.apply(null)` calls it.
Tests: `tests/unit/organizer-arrangement-preference.test.ts` (clears one project only; nothing stored; malformed id; removal throws), `tests/useOrganizerArrangements.test.tsx` (apply A then Default leaves the key absent; a fresh mount after Default applies nothing and shows no notice).

## 4. Whole-toolbar story

`stories/WorkArea/OrganizerGrid.stories.tsx`: story `WholeToolbar` renders `OrganizerToolbarArea` (pickers, source select, arrangement controls, message) with a smart folder that no longer exists and an arrangement stored with Columns none, both listed unavailable with their reason. The global preview already provides the sharing-limits decorator and the Redux store; nothing extra was added. I did not set `a11y.test: "error"` on it because I could not run Storybook here.

## 5. Drag then sidebar edit (stale overwrite)

Hypothesis: after a field drop, the page's `updateResource` sends its older local `userMetadata` and so reverts the dropped value.
Test first, `tests/page-stale-sidecar-save.test.tsx` ("a dropped userMetadata field and status survive a later edit of another field"): real page and sidebar, a harness running the real `useOrganizerFieldDrop` (only `setOrganizerFields` mocked, returning done) with a drop setting `plotline` and `status`, then an edit of the `mood` field.
Result before the fix: FAILED. Redux held `{ plotline, status }` after the drop; the `updateSidecar` payload was `userMetadata: { mood: "calm" }`, and Redux ended with the dropped values gone (the test's Redux assertion follows the payload assertion, so only the payload failure was observed directly; the page also writes `applyUpdate(resource)` back to Redux, which is the visible path for the revert). The hypothesis (page-local copy is stale) is consistent with this; I did not separately measure the local copy.
Fix, in the smallest place: `app/(app)/page.tsx` `applyUpdate` now hands the updater, for the selected resource, a copy whose `userMetadata` is the Redux `userMetadata`. Chosen over overlaying Redux `userMetadata` onto the result because the updater builds the new `userMetadata` from the copy it receives (`{ ...r.userMetadata, mood }`), so an overlay of the result would discard the edit being made; and over refreshing the page's copy after a grid write because that would add a Redux-to-page sync in the drop hook, a larger and wider change. `resourceSubtype` was already overlaid. After the fix the test passes.
Not covered: a drop on a card that is not the selected resource followed by an edit of another resource is unaffected (different resource); an edit made on a resource that is not selected still uses the page copy, as before. The real `updateSidecarCore` was not run in this test (mocked).

## Checks run (from `frontend/`)

- `pnpm typecheck`: clean.
- `pnpm lint`: 0 errors (459 warnings, not counted per file; `eslint` on the Organizer folder, the story and the page test: 0 errors, 1 existing warning in `OrganizerCard.tsx`).
- `pnpm run check:no-hex`: no violations.
- `pnpm test:ci`: 931 files passed, 12721 tests passed, 8 expected fail, 1 skipped. No flake failures in this run. This includes `organizerView`, `organizerFolderCards`, `organizerCard`, `organizerGridWiring`, `organizerGridKeyboard`, `useOrganizerArrangements`, `page-stale-sidecar-save` and the other `*rganizer*` tests.

## Not verified

- Storybook: the new story was type-checked only; not rendered, no axe run, no 360px check.
- No device, paired-device or browser run; the split was checked by the unit and component tests only.
- `pnpm test:e2e`, `next build` and `build:native` were not run.

## 2026-11-11: e2e `organizer view displays resource cards` failed (0 articles, expected 3)

**Observed (lead):** full `pnpm test:e2e`: 253 passed, 1 failed on all 3 retries,
`e2e/organizer-view.e2e.spec.ts:22`, story `workarea-organizerview--with-selected-folder`,
`getByRole("article")` count 0.

**Measured:** rebuilt Storybook at HEAD 6dc21292, loaded the story in headless
Chromium. The story threw during render:
`TypeError: Cannot read properties of undefined (reading 'isLoadingQueries')`
(from `organizerGridModel` chunk, reached through `OrganizerView`), and Storybook
reported "Error rendering story". So 0 articles because nothing rendered.

**Read (from code, not separately experimented):** `useOrganizerArrangements.ts`
and `useOrganizerSmartFolderCards.ts` read `state.queries.isLoadingQueries`. The
story's `selectedFolderStore` (and `filtersStore`) were built with only the
`projects` and `resources` reducers, so there was no `queries` slice. The real
store and the global Storybook preview store both register `queries`
(`querySlice`). I did not run the component against a store that has `queries`
and a modified component, so "the component did not regress" rests on the
passing result below plus the unchanged `Default` story and the Organizer unit
tests, not on a before/after bisect of the component.

**Fix:** `frontend/stories/WorkArea/OrganizerView.stories.tsx`: added
`queries: queryReducer` to both story-scoped stores (the second, `filtersStore`,
had the same gap). No component change; the e2e assertion is untouched.

**Results:** `playwright test e2e/organizer-view.e2e.spec.ts` 3/3 pass;
`pnpm typecheck` clean; `pnpm lint` 0 errors (459 warnings); vitest on
Organizer tests 43 files, 670 passed, 1 expected fail. Full `pnpm test:e2e` not
re-run by me.
