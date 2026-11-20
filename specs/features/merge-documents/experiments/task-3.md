# Task 3: FR-1 (b): every reader of a document's word figure or membership

No production file, `package.json` or lockfile was edited. Two throwaway probe tests were copied into `frontend/tests/`, run with `npx vitest run <file>` from `frontend/`, and deleted before this record was written (`git status --short` is empty apart from this file).

## Probe method

- Server probe (node environment): a temporary project of three text documents, run twice. Document A held the key `mergedMark` (`{ targetId, snapshotRevisionId, date: 2026-11-15 }`) in one run and no key in the other. Document B had no extra key. Document C held an unrelated extra key `zzExtraKey` in both runs. Sidecar `wordCount` was A 100, B 50, C 30; all three had `userMetadata.status = "draft"`. Writing-log entries: A 7 words on 2026-11-10, A 11 and B 13 on 2026-11-16.
- The server probe called: `loadProjectFromDisk`, `evaluateGoalTotal`, `evaluateGoalMembership`, `evaluateGoalFilteredTotal` (filter `type = text`), `getWritingLogAggregateCore` (one-day windows, with and without the filter), `computeStatusRollup`, `buildCompileTree` with `initAllChecked` and `orderResourceIdsByTreePosition`, `compileTextCore`, `exportTextCore`, `rebuildDerivedIndexes` then `executeSearch("marmalade")`, and `isMergedDocument`.
- Client probe (jsdom): `DataView` rendered with the three resources as props (A with and without the key), reading the rendered text.
- Every value below came from those runs. A "no change" entry means the output was identical between the run with the key and the run without it.

## Observed: what each reader does today with an extra sidecar key

| Surface | File and function that decides whether a document counts | Observed with `mergedMark` on A (against no key) |
|---|---|---|
| Client resource shape | `frontend/src/lib/models/project-loader.ts` `loadProjectFromDisk` (spreads `...sidecar`) | Key present on the loaded resource (`mergedMark` in A: true with the key); C's `zzExtraKey` also present. Loaded `wordCount` of A was 3 (recomputed from `content.txt`), not the sidecar's 100, in both runs. |
| `isMergedDocument` | `frontend/src/lib/models/split-eligibility.ts` | true for A with the key, false without. |
| Compile dialog list | `frontend/components/common/compileSelection.ts` `buildCompileTree` and `initAllChecked(tree)`, called from `CompilePreviewModal.tsx`; the tree item type (`ResourceItemData` in `ResourceTree/buildResourceTree.ts`) keeps no sidecar key | `initAllChecked` returned a, b, c in both runs: no change. |
| Compile Entity Resources dialog | `frontend/components/Sidebar/EntityCompileSection.tsx` `orderedResourceIds`, from `orderResourceIdsByTreePosition` in `compileSelection.ts` | Returned a, b, c in both runs: no change. |
| Export dialog list | none beyond the selection: `ShellModalCoordinator.tsx` passes `exportModal.resourceIds` and `ExportPreviewModal.tsx` lists them (`ids`, `resolveInitialSelection`); no sidecar is read | By reading, no sidecar key is consulted. |
| Server compile and export | `frontend/src/lib/export/section-loader.ts` `loadTextSections` (used by `compile-core.ts` and `export-core.ts`) takes the client's `resourceIds`, filters by `type` only, reads no sidecar for membership | `compileTextCore` and `exportTextCore` output contained A, B and C in both runs: no change. There is no server-side compile list. |
| CLI compile and export | none exists | `cli/src/getwrite-cli.ts` registers prune, templates, screenshots, project, reindex, doctor, repair-revisions and qa. `grep -rli compile cli/src` finds only `cli/src/qa/server.ts`, where the word names the Next.js dev compile. No compile or export command exists. |
| Project total goal, server | `frontend/src/lib/models/goal-filtered-total-core.ts` `evaluateGoalTotal`, via `sumOutsideInbox` (text type, outside Inbox, `sidecarWordCount`) | Total 180 (100+50+30) in both runs: A still counted. |
| Project total goal, client | `frontend/components/WorkArea/DataView.tsx` `goalWords` (`getWordCount`, skips `source` and Inbox) | Rendered text identical in both runs (Writing Goal 150 / 1,000 on the probe's loader-style counts 100+50+0). |
| Goal filter membership | `frontend/src/lib/models/goal-filter-membership-core.ts` `evaluateGoalMembership` (`isTextBodied`, evaluator over `goal-evaluation-input.ts`) | Members a, b, c in both runs. |
| Filtered total | `goal-filtered-total-core.ts` `evaluateGoalFilteredTotal` (`sidecarWordCount` of members) | Total 180 in both runs. |
| Daily goal, no filter | `frontend/src/lib/models/writing-log-core.ts` `aggregateForRoot`, `findExcludedDocumentIds` (excludes `source` type and Inbox folder only) | Day of 2026-11-10: 7 added; day of 2026-11-16: 24 added (A 11 + B 13), identical in both runs. |
| Daily goal, filtered | `writing-log-core.ts` `resolveFilterMembers`, which calls `evaluateGoalMembership` | Same figures, 7 and 24, in both runs. |
| Search | `frontend/src/lib/search/execute-search.ts` `executeSearch` over `inverted-index.ts` | "marmalade" returned A in both runs: no change. |
| Sidecar `wordCount` | written at canonical save by `revision-core.ts` (the `wordCount` merge at the sidecar write, around line 548) | A's sidecar wordCount was 100 in both runs; nothing reads the key to alter it (by the server probe's totals). |
| Tree figure | none found: no word figure in `components/ResourceTree/*` (`grep -in word components/ResourceTree/*.tsx *.ts` matched only `newOrderIndex`/`resourceOrder` text) | n/a. If the tree gains no figure, Task 31 has no tree file to edit. |
| Data view figures | `DataView.tsx` `getWordCount`, `totalWords`, `resourceGroups`, `stubResources`/`contentResources`, and `StubResourcesSection.tsx`, `ResourceBreakdown.tsx`, `ResourceListItem.tsx` fed from it | Rendered "Total words 150", "By status draft 3 / 150", stub list (doc-c) and content list identical in both runs. |
| Status roll-up | `frontend/src/lib/status-rollup.ts` `computeStatusRollup` | `draft:3/9`, `No status:0/0` in both runs (the 9 is the loader's recomputed counts). |
| Stub flag | `DataView.tsx` `STUB_WORD_THRESHOLD = 50` compared with `getWordCount` (the glossary's zero-word rule is not what the Data view applies: it uses at most 50 words) | A (100) was not a stub in both runs; C with 0 words was listed under "Needs content" in both runs. |

## Readers found beyond the list

- `frontend/components/WorkArea/Views/OrganizerView/organizerFilters.ts` `matchesWordCountRange` (Organizer word-range filter, reads `resource.wordCount`) and `OrganizerCard.tsx` ("Words:" figure): read by source only, not probed. These are per-card figures in a layout view; FR-20 names project-level figures, so whether they are in scope is for Task 31 to decide and record.
- `frontend/src/lib/models/query-intrinsics.ts` (`wordCount` intrinsic for smart folders and the Goal filter query) and `query-evaluate-core.ts` (derives a count from `content.txt`): read by source only. The filter's membership uses the evaluator, so the predicate belongs in `goal-filter-membership-core.ts`, not in the intrinsic (a smart folder showing a marked document is not a goal figure).
- `frontend/components/WorkArea/EditView.tsx` ("Words:" of the open document) and `Sidebar/WordCountGoalSection.tsx` (per-resource goal): the document's own figure; to stay unchanged by FR-20 and FR-19.
- `app/api/projects` and the Start page list: grep for `wordCount` in `app/api/projects`, `app/api/project-resources` and `components/Start` found no reader.

## File each of Tasks 28 to 31 must edit

- Task 28 (compile): `frontend/components/common/compileSelection.ts` (the one place both dialogs get their list: `buildCompileTree`/`initAllChecked` for the Compile dialog and `orderResourceIdsByTreePosition` for the Compile Entity Resources dialog; the item type carries no sidecar key, so the predicate is applied to the `AnyResource[]` before the tree is built), `frontend/components/common/CompilePreviewModal.tsx` (the dialog's statement of the exclusion) and `frontend/components/Sidebar/EntityCompileSection.tsx` (its entry list). No server-side compile list exists (`loadTextSections` takes the client's ids), so no server file is added. No CLI compile exists, so no CLI file is added.
- Task 29 (export and search): no production file is indicated by the probe. The Export list (`ExportPreviewModal.tsx`, `ShellModalCoordinator.tsx`) and `section-loader.ts` read no sidecar key, and `executeSearch` returned the marked document; the task is the test file only unless its tests show otherwise.
- Task 30 (goals): `frontend/src/lib/models/goal-filtered-total-core.ts` (`sumOutsideInbox` is the server total with no filter, and `evaluateGoalFilteredTotal`), `frontend/src/lib/models/goal-filter-membership-core.ts` (membership) and `frontend/src/lib/models/writing-log-core.ts` (`findExcludedDocumentIds`, which needs the mark's date). All three are already in Task 30's files; the server total needs no further file.
- Task 31 (word counts): `frontend/components/WorkArea/DataView.tsx` (`totalWords`, `resourceGroups`, `goalWords`, and the stub and content lists) and `frontend/src/lib/status-rollup.ts`. No tree word figure was found, so `frontend/components/ResourceTree/ResourceTree.tsx` is not named for a figure by this record. `OrganizerView/organizerFilters.ts` and `OrganizerCard.tsx` are readers beyond the list for Task 31 to rule on.

## Not measured

- The Compile and Export dialog components were not rendered; their lists were measured at the functions they call (`initAllChecked`, `orderResourceIdsByTreePosition`) and the Export list by reading.
- Organizer, smart-folder intrinsic and editor figures were read, not probed.
