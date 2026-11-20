# Task 31: Merged-away rule, word counts (FR-20)

## Readers edited (from `experiments/task-3.md`)

- `frontend/components/WorkArea/DataView.tsx`: new `getCountedWords` (returns 0 when `isMergedDocument` is true, else `getWordCount`). Used by `totalWords`, the folder breakdown `wordCount` in `resourceGroups`, and the client project goal total `goalWords`.
- `frontend/src/lib/status-rollup.ts`: `computeStatusRollup` adds no words for a marked document.
- Both read the one predicate `isMergedDocument` from `frontend/src/lib/models/split-eligibility.ts`.

## Rulings

- Tree figure: `task-3.md` found no word figure in `components/ResourceTree/*`, so `ResourceTree.tsx` is not edited. Nothing to skip there.
- Organizer word-range filter (`organizerFilters.ts` `matchesWordCountRange`) and card "Words:" figure (`OrganizerCard.tsx`): not changed. They are a document's own figure in a layout view, not a project-level total; FR-20 leaves the document's own figure unchanged. This is a ruling, not a measurement.
- Row counts: the Data view "Resources" count, a status row's `resourceCount` and a folder group's `resourceCount` still include a marked document. FR-20 names word figures only. Assumption, stated so the owner can overrule.
- Stub flag: `getWordCount` is untouched, so the stub and content lists use the document's own figure. The marked document with text stays in the content list and the marked empty one stays under "Needs content" (both tests pass).
- Stored sidecar `wordCount` and the open document's figure (`EditView`): no file touched; the unit test checks the resource object is not mutated.
- Server-side project total, goal filter and daily goal: Task 30's files, not here.
- Model file touched: none (`status-rollup.ts` is under `src/lib/`, not `src/lib/models/`), so the Electron and CLI typechecks were not run.

## Tests first (failing run, before the edits)

`pnpm exec vitest run tests/unit/merge-rule-word-counts.test.ts tests/component/MergeRuleDataView.test.tsx`: 7 failed, 4 passed.
Failed: status row words, No status row words, target figure after merge (unit); Total words, client goal total, folder breakdown, by-status Data view (component).
Passed before the edit (they pin behaviour the edit must keep): unmarked rollup unchanged, stored wordCount not mutated, both stub tests.
The "by-status in the Data view" test asserts that 240 (140+100) appears nowhere; it failed before because "Total words" showed 240. It is a weak check of the roll-up itself, which the unit tests cover directly.

## Green

- New tests: 11 of 11 pass (5 unit, 6 component).
- Existing: `status-rollup.test.ts`, `dataView.test.tsx`, `dataViewFolderRows.test.tsx`, `dataViewGoalFilter.test.tsx`, `work-area-view-gating.test.tsx` pass unmodified. 140 tests across the 7 files.
- "After a merge the target's figure includes the appended text": the roll-up test feeds a target whose figure is 140 (100 own + 40 appended) with the 40-word marked document, and expects 140. The merge core's own `wordCount` write is not exercised here.
- `pnpm typecheck`: clean. `pnpm lint`: 0 errors (459 existing warnings; none attributed to these files was checked individually beyond eslint showing no errors).

## Not run

Electron typecheck (both passes) and CLI typecheck (no model file touched); full `pnpm test:ci`; Storybook and e2e.
