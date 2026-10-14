# Verification record: user handbook (Feature 81)

Source spec: `specs/features/user-handbook.md`. Task list: `specs/features/user-handbook/tasks.md`.

This file is the verification record required by FR-11. Task 2 (this pass) is the baseline inventory only: every factual statement on the 21 old pages is listed as one row, with the release check filled in. The columns `Label`, `Runtime`, `Evidence` and `Outcome` are blank on purpose; Tasks 3 to 8 fill them by running each statement (`run` or `dropped`; outcome `kept`, `corrected` or `dropped`). No statement has been run, decided, kept or dropped yet. Nothing below states what the app does; the quotes are what the old pages say.

Method of this pass: `git`, `grep` and reading the 21 files under `docs/user/`, inside the command sandbox, no app started, no process started. Nothing under `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite`, `~/Library/Logs/getwrite-electron` or the repo's `projects/` was read or written.

## 1. Base commit and version (measured 2026-10-14)

| Item | Value | Command |
| --- | --- | --- |
| Branch | `docs/user-handbook` | `git branch --show-current` |
| Base commit (short) | `eda64b07` | `git rev-parse --short HEAD` |
| Base commit (full) | `eda64b079062cb4423e59c849dd804064149d163` | `git rev-parse HEAD` |
| Root `package.json` version | `2.2.0` | `grep '"version"' package.json` |
| Tag commit | `a21e8af0f58c14e8e0b990df4f8354e144c25034` (`a21e8af0`, 2026-09-24) | `git rev-parse getwrite-v2.2.0` |
| Commits since the tag | `624` | `git rev-list --count getwrite-v2.2.0..HEAD` |
| Commits since the tag, `origin/main` | `622` (the spec's figure for `f06a7c3b`; HEAD here is two docs commits ahead on this branch) | `git rev-list --count getwrite-v2.2.0..origin/main` |
| Tag is not the checked commit | so the FR-10 second form applies: `Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit eda64b07.` | |

## 2. Page order table (FR-4)

`order`: `index.md` = 0, then steps of 10 in index sequence; parts in the order getting-started, organize, write, story, views, protect-and-finish; pages inside a part in the mapping table's order. Unique across the handbook (22 pages plus `index.md`).

| order | Handbook path (under `docs/user/handbook/`) | Part | Source old page |
| ---: | --- | --- | --- |
| 0 | `index.md` | (contents) | `features.md` (intro only) |
| 10 | `getting-started/installing.md` | getting-started | `installing.md` |
| 20 | `organize/start-page.md` | organize | `start-page.md` |
| 30 | `organize/project-types.md` | organize | `project-types.md` |
| 40 | `organize/resource-tree.md` | organize | `resource-tree.md` |
| 50 | `write/editor.md` | write | `features.md` ("Rich text editor") |
| 60 | `write/writing-log.md` | write | `writing-log.md` |
| 70 | `write/headings.md` | write | `editor/headings.md` |
| 80 | `write/editor-appearance.md` | write | `editor/settings.md` |
| 90 | `write/search.md` | write | `search.md` |
| 100 | `story/metadata.md` | story | `metadata.md` |
| 110 | `story/metadata-queries.md` | story | `metadata-queries.md` |
| 120 | `views/organizer.md` | views | `views/organizer.md` |
| 130 | `views/data.md` | views | `views/data.md` |
| 140 | `views/diff.md` | views | `views/diff.md` |
| 150 | `views/timeline.md` | views | `views/timeline.md` |
| 160 | `views/entity-roster.md` | views | `views/entity-roster.md` |
| 170 | `views/entity-relationship-graph.md` | views | `views/entity-relationship-graph.md` |
| 180 | `protect-and-finish/revisions.md` | protect-and-finish | `revisions.md` (all but its Trash section) |
| 190 | `protect-and-finish/trash.md` | protect-and-finish | `revisions.md` ("Deleting and recovering resources (Trash)") |
| 200 | `protect-and-finish/resources.md` | protect-and-finish | `resources.md` |
| 210 | `protect-and-finish/compiling.md` | protect-and-finish | `compiling.md` |
| 220 | `protect-and-finish/project-configuration.md` | protect-and-finish | `project-configuration.md` |

Sequence rule applied: the mapping table lists `revisions.md` before `resources.md`, `compiling.md`, `project-configuration.md`; `trash.md` is placed straight after `revisions.md` (it is split out of it). Task 9's `index.md` takes titles and summaries from page front matter in this order.

## 3. The 21 old files accounted for

Line counts measured with `wc -l`. "Rows" is the number of inventory rows in section 6 whose statements come from that file (home-network-sharing text is excluded and has no rows).

| # | Old file | Lines | Destination | Rows | Note |
| ---: | --- | ---: | --- | ---: | --- |
| 1 | `docs/user/installing.md` | 89 | `getting-started/installing.md` | 30 | |
| 2 | `docs/user/start-page.md` | 22 | `organize/start-page.md` | 17 | Sharing sentence on line 20 excluded under FR-9, no row |
| 3 | `docs/user/project-types.md` | 26 | `organize/project-types.md` | 17 | |
| 4 | `docs/user/resource-tree.md` | 15 | `organize/resource-tree.md` | 10 | |
| 5 | `docs/user/features.md` | 147 | `index.md` (intro), `write/editor.md`, otherwise "duplicates another page, not carried" | 50 (index.md intro 7, write/editor.md 4, not-carried accounting 39) | Section "Home-network sharing (not yet released)" (lines 37-39) excluded under FR-9, no row; see section 5 |
| 6 | `docs/user/writing-log.md` | 42 | `write/writing-log.md` | 46 | |
| 7 | `docs/user/editor/headings.md` | 27 | `write/headings.md` | 16 | |
| 8 | `docs/user/editor/settings.md` | 20 | `write/editor-appearance.md` | 12 | |
| 9 | `docs/user/search.md` | 5 | `write/search.md` | 5 | |
| 10 | `docs/user/metadata.md` | 93 | `story/metadata.md` | 68 | |
| 11 | `docs/user/metadata-queries.md` | 92 | `story/metadata-queries.md` | 50 | |
| 12 | `docs/user/views/organizer.md` | 35 | `views/organizer.md` | 23 | |
| 13 | `docs/user/views/data.md` | 27 | `views/data.md` | 16 | |
| 14 | `docs/user/views/diff.md` | 5 | `views/diff.md` | 5 | |
| 15 | `docs/user/views/timeline.md` | 88 | `views/timeline.md` | 53 | |
| 16 | `docs/user/views/entity-roster.md` | 22 | `views/entity-roster.md` | 16 | |
| 17 | `docs/user/views/entity-relationship-graph.md` | 50 | `views/entity-relationship-graph.md` | 35 | |
| 18 | `docs/user/revisions.md` | 41 | `protect-and-finish/revisions.md` and `protect-and-finish/trash.md` | 30 revisions + 13 trash | Lines 33-37 are the Trash section |
| 19 | `docs/user/resources.md` | 16 | `protect-and-finish/resources.md` | 9 | |
| 20 | `docs/user/compiling.md` | 15 | `protect-and-finish/compiling.md` | 12 | |
| 21 | `docs/user/project-configuration.md` | 68 | `protect-and-finish/project-configuration.md` | 34 | |

Total rows (all pages, including the `features.md` accounting rows): 567.

## 4. Release check against `getwrite-v2.2.0` (FR-9, OQ-1)

Exit status of `git merge-base --is-ancestor <commit> getwrite-v2.2.0`: `0` = the commit is in the tag; `1` = it is not (merged after 2.2.0). "Introducing commit" is the first commit that added the file or string named (`git log --diff-filter=A` for files, `git log -S"<string>" --reverse` for strings; searched under `frontend/components`, `frontend/src`, `frontend/app`, `cli/src`). PR = the merge that brought the commit to `main` (`git log --merges --ancestry-path <commit>..HEAD`). A probe shows when the file or string first appeared; it does not show that every sentence about that feature on a page is new. Rows cite the probe that applies to them; Tasks 3 to 8 re-judge a statement that sits between two probes. "NYR" below = not yet in a release.

| ID | Introducing commit | Date | PR | What it is | Result |
| --- | --- | --- | --- | --- | --- |
| RC-01 | `b294ce3ee` | 2026-09-26 | #236 | writing-log model (writing-log.ts) | `git merge-base --is-ancestor b294ce3ee getwrite-v2.2.0` -> exit 1 |
| RC-02 | `7551ebb58` | 2026-09-26 | #236 | footer Today's writing display | `git merge-base --is-ancestor 7551ebb58 getwrite-v2.2.0` -> exit 1 |
| RC-03 | `7c2b5f43f` | 2026-09-26 | #236 | Today's writing details dialog | `git merge-base --is-ancestor 7c2b5f43f getwrite-v2.2.0` -> exit 1 |
| RC-04 | `4fce8fe11` | 2026-09-26 | #236 | Daily word goal field (DailyWordGoalField.tsx) | `git merge-base --is-ancestor 4fce8fe11 getwrite-v2.2.0` -> exit 1 |
| RC-05 | `9c488c9d8` | 2026-09-26 | #236 | string dailyWordGoal first added | `git merge-base --is-ancestor 9c488c9d8 getwrite-v2.2.0` -> exit 1 |
| RC-06 | `e57412b3f` | 2026-09-27 | #238 | project word-count goal write path | `git merge-base --is-ancestor e57412b3f getwrite-v2.2.0` -> exit 1 |
| RC-07 | `6537acb10` | 2026-09-27 | #238 | string 'Total word-count goal' first added | `git merge-base --is-ancestor 6537acb10 getwrite-v2.2.0` -> exit 1 |
| RC-08 | `28a94c7c8` | 2026-09-27 | #238 | per-resource Word count goal sidebar section | `git merge-base --is-ancestor 28a94c7c8 getwrite-v2.2.0` -> exit 1 |
| RC-09 | `760e1e499` | 2026-05-16 | (in tag) | WordCountProgressBar.tsx (Data view progress bar) | `git merge-base --is-ancestor 760e1e499 getwrite-v2.2.0` -> exit 0 |
| RC-10 | `7ef350e78` | 2026-09-26 | #237 | status roll-up derivation | `git merge-base --is-ancestor 7ef350e78 getwrite-v2.2.0` -> exit 1 |
| RC-11 | `107952b18` | 2026-09-26 | #237 | By status section in DataView | `git merge-base --is-ancestor 107952b18 getwrite-v2.2.0` -> exit 1 |
| RC-12 | `0dd6d2462` | 2026-09-27 | #240 | prose diagnostics metrics | `git merge-base --is-ancestor 0dd6d2462 getwrite-v2.2.0` -> exit 1 |
| RC-13 | `3db4255dd` | 2026-09-27 | #240 | prose diagnostics sidebar section | `git merge-base --is-ancestor 3db4255dd getwrite-v2.2.0` -> exit 1 |
| RC-14 | `3057873b9` | 2026-09-27 | #240 | prose diagnostics Show detail dialog | `git merge-base --is-ancestor 3057873b9 getwrite-v2.2.0` -> exit 1 |
| RC-15 | `308600138` | 2026-09-28 | #247 | plain-text import orchestrator | `git merge-base --is-ancestor 308600138 getwrite-v2.2.0` -> exit 1 |
| RC-16 | `e4e250f2b` | 2026-10-08 | #260 | subtype scope module | `git merge-base --is-ancestor e4e250f2b getwrite-v2.2.0` -> exit 1 |
| RC-17 | `26d4b0824` | 2026-10-08 | #260 | Subtypes list editor | `git merge-base --is-ancestor 26d4b0824 getwrite-v2.2.0` -> exit 1 |
| RC-18 | `8911d2d4b` | 2026-10-08 | #260 | sidebar Subtype section | `git merge-base --is-ancestor 8911d2d4b getwrite-v2.2.0` -> exit 1 |
| RC-19 | `6ca785beb` | 2026-10-08 | #260 | string 'Applies to subtypes' first added | `git merge-base --is-ancestor 6ca785beb getwrite-v2.2.0` -> exit 1 |
| RC-20 | `07d838fc4` | 2026-10-08 | #261 | shared initial-revision writer used by template/copy/duplicate | `git merge-base --is-ancestor 07d838fc4 getwrite-v2.2.0` -> exit 1 |
| RC-21 | `cf63e1768` | 2026-02-20 | (in tag) | resource templates and duplication (models) | `git merge-base --is-ancestor cf63e1768 getwrite-v2.2.0` -> exit 0 |
| RC-22 | `1c8687605` | 2026-09-25 | #233 | protect revision (Protect/Unprotect, deletion refusal) | `git merge-base --is-ancestor 1c8687605 getwrite-v2.2.0` -> exit 1 |
| RC-23 | `04481320c` | 2026-03-11 | (in tag) | string 'Save Explicit Revision' first added | `git merge-base --is-ancestor 04481320c getwrite-v2.2.0` -> exit 0 |
| RC-24 | `aac3e724e` | 2026-10-05 | #256 | entity-noise-check core | `git merge-base --is-ancestor aac3e724e getwrite-v2.2.0` -> exit 1 |
| RC-25 | `7390ac8a5` | 2026-10-05 | #256 | App Settings dialog | `git merge-base --is-ancestor 7390ac8a5 getwrite-v2.2.0` -> exit 1 |
| RC-26 | `365bbda00` | 2026-10-05 | #256 | global noise-word list persistence | `git merge-base --is-ancestor 365bbda00 getwrite-v2.2.0` -> exit 1 |
| RC-27 | `075fae06` | 2026-10-05 | #256 | Noise Words Project Settings tab | `git merge-base --is-ancestor 075fae06 getwrite-v2.2.0` -> exit 1 |
| RC-28 | `6ada2cd67` | 2026-10-05 | #256 | config.customNoiseWords/excludedGlobalNoiseWords/dismissedNoiseTerms first added | `git merge-base --is-ancestor 6ada2cd67 getwrite-v2.2.0` -> exit 1 |
| RC-29 | `852e494d5` | 2026-09-07 | (in tag) | string 'Needs attention' (roster) first added | `git merge-base --is-ancestor 852e494d5 getwrite-v2.2.0` -> exit 0 |
| RC-30 | `3f13952c` | 2026-09-07 | (in tag) | Entities view wired into the Work Area | `git merge-base --is-ancestor 3f13952c getwrite-v2.2.0` -> exit 0 |
| RC-31 | `0fc87db1` | 2026-09-08 | (in tag) | Graph view wired (base) | `git merge-base --is-ancestor 0fc87db1 getwrite-v2.2.0` -> exit 0 |
| RC-32 | `83cd11d1` | 2026-09-08 | (in tag) | graph SVG canvas (base) | `git merge-base --is-ancestor 83cd11d1 getwrite-v2.2.0` -> exit 0 |
| RC-33 | `a530453a` | 2026-09-08 | (in tag) | graph accessible list (base) | `git merge-base --is-ancestor a530453a getwrite-v2.2.0` -> exit 0 |
| RC-34 | `cdc24490a` | 2026-10-01 | #253 | graph connection-type schema | `git merge-base --is-ancestor cdc24490a getwrite-v2.2.0` -> exit 1 |
| RC-35 | `6d0cbe967` | 2026-10-01 | #253 | graph position persistence | `git merge-base --is-ancestor 6d0cbe967 getwrite-v2.2.0` -> exit 1 |
| RC-36 | `85b27533` | 2026-10-01 | #253 | graph settings panel (connection types, hop radius) | `git merge-base --is-ancestor 85b27533 getwrite-v2.2.0` -> exit 1 |
| RC-37 | `13f1017e` | 2026-10-01 | #253 | hop-radius BFS / focal dimming | `git merge-base --is-ancestor 13f1017e getwrite-v2.2.0` -> exit 1 |
| RC-38 | `491de176b` | 2026-10-01 | #253 | string 'Set as focal point' first added | `git merge-base --is-ancestor 491de176b getwrite-v2.2.0` -> exit 1 |
| RC-39 | `ad99bc90c` | 2026-03-11 | (in tag) | OrganizerView (base) | `git merge-base --is-ancestor ad99bc90c getwrite-v2.2.0` -> exit 0 |
| RC-40 | `73c1729d4` | 2026-06-14 | (in tag) | Organizer card body setting; built-in features section; timelineView toggle | `git merge-base --is-ancestor 73c1729d4 getwrite-v2.2.0` -> exit 0 |
| RC-41 | `e9c66aa1` | 2026-09-29 | #249 | Organizer filter bar | `git merge-base --is-ancestor e9c66aa1 getwrite-v2.2.0` -> exit 1 |
| RC-42 | `9ebc46d2` | 2026-09-29 | #249 | Organizer filter-state module | `git merge-base --is-ancestor 9ebc46d2 getwrite-v2.2.0` -> exit 1 |
| RC-43 | `7d0554535` | 2026-09-29 | #249 | string 'No cards match the current filters' first added | `git merge-base --is-ancestor 7d0554535 getwrite-v2.2.0` -> exit 1 |
| RC-44 | `39da2d11e` | 2026-09-29 | #249 | string 'Clear all filters' first added | `git merge-base --is-ancestor 39da2d11e getwrite-v2.2.0` -> exit 1 |
| RC-45 | `e8432687` | 2026-09-30 | #251 | Organizer drag reorder hook | `git merge-base --is-ancestor e8432687 getwrite-v2.2.0` -> exit 1 |
| RC-46 | `9206ea93` | 2026-05-17 | (in tag) | TimelineView.tsx | `git merge-base --is-ancestor 9206ea93 getwrite-v2.2.0` -> exit 0 |
| RC-47 | `0257f189` | 2026-09-14 | (in tag) | TrashView | `git merge-base --is-ancestor 0257f189 getwrite-v2.2.0` -> exit 0 |
| RC-48 | `fa2d8e56c` | 2026-09-14 | (in tag) | string 'Empty trash' first added | `git merge-base --is-ancestor fa2d8e56c getwrite-v2.2.0` -> exit 0 |
| RC-49 | `308f43772` | 2026-02-20 | (in tag) | trash.ts soft delete/restore/purge | `git merge-base --is-ancestor 308f43772 getwrite-v2.2.0` -> exit 0 |
| RC-50 | `817cb5e07` | 2026-09-06 | (in tag) | string 'Compile this entity' first added | `git merge-base --is-ancestor 817cb5e07 getwrite-v2.2.0` -> exit 0 |
| RC-51 | `81355e4b` | 2026-09-08 | (in tag) | EntityCompileSection | `git merge-base --is-ancestor 81355e4b getwrite-v2.2.0` -> exit 0 |
| RC-52 | `bc36dd302` | 2026-02-18 | (in tag) | DiffView.tsx | `git merge-base --is-ancestor bc36dd302 getwrite-v2.2.0` -> exit 0 |
| RC-53 | `928571c9` | 2026-02-18 | (in tag) | DataView.tsx | `git merge-base --is-ancestor 928571c9 getwrite-v2.2.0` -> exit 0 |
| RC-54 | `e9cbd075` | 2026-03-11 | (in tag) | SearchBar.tsx | `git merge-base --is-ancestor e9cbd075 getwrite-v2.2.0` -> exit 0 |
| RC-55 | `cc3a88e1` | 2026-09-13 | (in tag) | ImportDocxDialog | `git merge-base --is-ancestor cc3a88e1 getwrite-v2.2.0` -> exit 0 |
| RC-56 | `e3f906e6` | 2026-09-12 | (in tag) | ImportScrivenerDialog | `git merge-base --is-ancestor e3f906e6 getwrite-v2.2.0` -> exit 0 |
| RC-57 | `7c65890de` | 2026-09-13 | (in tag) | string 'Import Word Document' first added | `git merge-base --is-ancestor 7c65890de getwrite-v2.2.0` -> exit 0 |
| RC-58 | `7178be4c` | 2026-04-16 | (in tag) | TagsSection | `git merge-base --is-ancestor 7178be4c getwrite-v2.2.0` -> exit 0 |
| RC-59 | `a6275329` | 2026-05-20 | (in tag) | QueryBuilder | `git merge-base --is-ancestor a6275329 getwrite-v2.2.0` -> exit 0 |
| RC-60 | `d70b523d` | 2026-05-20 | (in tag) | SmartFolders | `git merge-base --is-ancestor d70b523d getwrite-v2.2.0` -> exit 0 |
| RC-61 | `01a673018` | 2026-05-20 | (in tag) | string 'Back to chip view' first added | `git merge-base --is-ancestor 01a673018 getwrite-v2.2.0` -> exit 0 |
| RC-62 | `323cb3804` | 2026-04-08 | (in tag) | Heading Styles / Letter Spacing strings first added | `git merge-base --is-ancestor 323cb3804 getwrite-v2.2.0` -> exit 0 |
| RC-63 | `7b0d63583` | 2026-03-12 | (in tag) | string 'Project Type Manager' first added | `git merge-base --is-ancestor 7b0d63583 getwrite-v2.2.0` -> exit 0 |
| RC-64 | `05dd8dcd6` | 2026-02-20 | (in tag) | pruneExecutor.ts | `git merge-base --is-ancestor 05dd8dcd6 getwrite-v2.2.0` -> exit 0 |
| RC-65 | `0ac6feb84` | 2026-06-10 | (in tag) | CLI prune/reindex/templates strings first added | `git merge-base --is-ancestor 0ac6feb84 getwrite-v2.2.0` -> exit 0 |
| RC-66 | `caf9ef061` | 2026-02-20 | (in tag) | maxRevisions / autoPrune first added | `git merge-base --is-ancestor caf9ef061 getwrite-v2.2.0` -> exit 0 |
| RC-67 | `3c7b87ab5` | 2026-07-07 | (in tag) | ProjectSettingsDialog | `git merge-base --is-ancestor 3c7b87ab5 getwrite-v2.2.0` -> exit 0 |
| RC-68 | `acd91a367` | 2026-08-25 | (in tag) | EntityMentionsSection (mentioned-in) | `git merge-base --is-ancestor acd91a367 getwrite-v2.2.0` -> exit 0 |
| RC-69 | `a749ce992` | 2026-09-03 | (in tag) | entityHighlighting flag first added | `git merge-base --is-ancestor a749ce992 getwrite-v2.2.0` -> exit 0 |
| RC-70 | `825c26428` | 2026-10-08 | #262 | repair-revisions (no statement on the old pages) | `git merge-base --is-ancestor 825c26428 getwrite-v2.2.0` -> exit 1 |
| RC-71 | `2308e2819` | 2026-04-14 | (in tag) | compile docx/pdf strings first added | `git merge-base --is-ancestor 2308e2819 getwrite-v2.2.0` -> exit 0 |
| RC-72 | `e6b56ec4f` | 2026-05-17 | (in tag) | Duration (minutes)/Story End Date first added | `git merge-base --is-ancestor e6b56ec4f getwrite-v2.2.0` -> exit 0 |
| RC-73 | `f62b98ed5` | 2026-05-19 | (in tag) | Linked From first added | `git merge-base --is-ancestor f62b98ed5 getwrite-v2.2.0` -> exit 0 |
| RC-74 | `30eb075e0` | 2026-05-09 | (in tag) | Statuses first added | `git merge-base --is-ancestor 30eb075e0 getwrite-v2.2.0` -> exit 0 |
| RC-75 | `7cc6cc824` | 2026-05-20 | (in tag) | operators 'starts with'/'in the last' first added | `git merge-base --is-ancestor 7cc6cc824 getwrite-v2.2.0` -> exit 0 |

Home-network sharing and the other PRs of the OQ-1 list that no old-page statement depends on (#252 editor context menu, #257 mention navigation, #259 test cleanup, #263 to #268 sharing and related) have no rows. Commit `c0c60902` (prune cap excludes protected revisions) is exit 1, PR #233; entered as RC-76 below.

| ID | Introducing commit | Date | PR | What it is | Result |
| --- | --- | --- | --- | --- | --- |
| RC-76 | `c0c60902` | 2026-09-25 | #233 | prune cap count excludes protected revisions | `git merge-base --is-ancestor c0c60902 getwrite-v2.2.0` -> exit 1 |

Grep results on the old pages (measured): `repair-revisions` / `repair` does not occur anywhere under `docs/user/` (so no row and no "Not yet in a release" entry for it; RC-70 is recorded only because the spec's PR list names #262). `prune` occurs on `revisions.md` lines 25 and 39 and `project-configuration.md` lines 13, 14, 51 and 58; `reindex` occurs on `writing-log.md` line 42 only. Task 7's list of "prune, reindex and repair-revisions command statements" is therefore: prune and reindex statements as rowed below; repair-revisions has none.

## 5. `features.md` accounting (dissolved page)

`features.md` is dissolved (mapping table). Each paragraph is given a disposition. "dup:<page>" = the same claim is made on the named old page, so it is not carried; "intro" = assigned to `index.md` intro; "editor" = assigned to `write/editor.md`; "features-only" = no other old page makes it, destination named (kept only if later verified by a `run`); "contradicts" = the claim disagrees with another old page (the disagreement is recorded, nothing is decided here). The home-network sharing paragraph (lines 37-39) is excluded under FR-9: no rows.

Rows for `features.md` use IDs `F-nn` in the tables of section 6 (sections "index.md" and "write/editor.md" and "features.md, not carried").

## 6. Statement inventory (one section per handbook page)

Row columns: ID; statement (short verbatim quote); old page and line; release check (probe ID with exit status; `-` = no feature named that the probes cover); `Label`, `Runtime`, `Evidence`, `Outcome` left blank for Tasks 3 to 8; inventory note.

### index.md (from `features.md`, intro and "Projects")

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-01 | "GetWrite is a writing workspace built around a simple idea: keep everything for a piece of writing in one place" | features.md:3 | - | | | | | intro |
| F-02 | "Your projects live as plain folders on your own disk" | features.md:3 | - | | | | | intro |
| F-03 | "there's no account, no cloud lock-in" | features.md:3 | - | | | | | intro |
| F-04 | "nothing between you and your words" | features.md:3 | - | | | | | intro; not checkable as stated |
| F-05 | "This page is a tour of what GetWrite can do and how each feature helps your writing." | features.md:5 | - | | | | | describes the old page, not carried |
| F-06 | "A project is a self-contained writing workspace — a single folder that holds everything for one body of work" | features.md:11 | - | | | | | intro (features-only) |
| F-07 | "Because each project is just a folder on disk, your writing stays portable, backup-friendly, and entirely yours." | features.md:11 | - | | | | | intro (features-only); "backup-friendly" also on installing.md:76 |

### getting-started/installing.md (from `installing.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| I-01 | "GetWrite ships as a desktop app." | installing.md:3 | - | | | | | |
| I-02 | "This is a deliberate design choice, not a limitation" | installing.md:3 | - | | | | | rationale |
| I-03 | "Download the latest build for your platform from the Releases page" (link `https://github.com/saboteur-works/getwrite/releases/latest`) | installing.md:6-7 | - | | | | | external https link, allowed by FR-5 |
| I-04 | "macOS — Apple Silicon (M1/M2/M3/M4) \| `GetWrite-<version>-arm64.dmg`" | installing.md:11 | - | | | | | file name; download, cannot be run in this setup |
| I-05 | "macOS — Intel \| `GetWrite-<version>-x64.dmg`" | installing.md:12 | - | | | | | |
| I-06 | "Windows \| `GetWrite-<version>.exe`" | installing.md:13 | - | | | | | |
| I-07 | "Linux \| `GetWrite-<version>.AppImage`" | installing.md:14 | - | | | | | |
| I-08 | "Click the Apple menu → About This Mac. 'Apple M…' means Apple Silicon (arm64); 'Intel' means x64." | installing.md:16-17 | - | | | | | macOS dialog, not GetWrite |
| I-09 | "If you grab the wrong one, the app either won't launch or will run slowly under Rosetta" | installing.md:17-18 | - | | | | | |
| I-10 | "GetWrite is not yet signed or notarized by Apple (code-signing certification is in progress)" | installing.md:23-24 | - | | | | | promissory |
| I-11 | "macOS Gatekeeper will warn that the app 'cannot be opened because the developer cannot be verified' or is 'damaged.'" | installing.md:24-26 | - | | | | | |
| I-12 | "the app is safe; macOS simply can't verify the signature yet" | installing.md:26-27 | - | | | | | assurance plus cause |
| I-13 | "Open the downloaded .dmg and drag GetWrite into your Applications folder." | installing.md:29-30 | - | | | | | |
| I-14 | "Option A — Right-click → Open: right-click (or Control-click) GetWrite → Open; click Open again" | installing.md:34-36 | - | | | | | |
| I-15 | "macOS remembers this choice; afterwards you can launch it normally." | installing.md:37 | - | | | | | |
| I-16 | "Option B — Double-click once and dismiss the warning; System Settings → Privacy & Security → Security section → Open Anyway; confirm with Open" | installing.md:39-43 | - | | | | | |
| I-17 | "Option C — xattr -dr com.apple.quarantine /Applications/GetWrite.app" (when macOS reports the app is 'damaged') | installing.md:45-52 | - | | | | | command |
| I-18 | "You only need to do this once. After the first successful open, GetWrite launches like any other app." | installing.md:54-55 | - | | | | | |
| I-19 | "The installer is not yet signed, so Windows SmartScreen may show a 'Windows protected your PC' dialog. Click More info → Run anyway" | installing.md:59-60 | - | | | | | |
| I-20 | "Mark the AppImage as executable and run it: chmod +x GetWrite-<version>.AppImage; ./GetWrite-<version>.AppImage" | installing.md:64-69 | - | | | | | commands |
| I-21 | "GetWrite is local-first: your projects live as plain files and folders on your own machine, not in any cloud or database." | installing.md:73-74 | - | | | | | |
| I-22 | "The desktop app keeps them in a `projects/` directory alongside the app's data" | installing.md:74-75 | - | | | | | file location; to be measured |
| I-23 | "the first launch starts with an empty workspace" | installing.md:75-76 | - | | | | | |
| I-24 | "you can back it up, sync it, or inspect it with ordinary file tools" | installing.md:76-77 | - | | | | | |
| I-25 | "GetWrite has no database. Every project, resource, and piece of metadata is read and written directly to the filesystem." | installing.md:81-82 | - | | | | | |
| I-26 | "there's no per-user data isolation to host safely on a shared web server: a single hosted instance would put every visitor in the same projects directory" | installing.md:83-85 | - | | | | | causal claim about hosting; the repo also documents a hosted mode |
| I-27 | "Shipping as a desktop app gives each user their own private, on-disk workspace" | installing.md:85-86 | - | | | | | |
| I-28 | "Apple code-signing/notarization and automatic updates are planned for a future release" | installing.md:88-89 | - | | | | | promissory |
| I-29 | "until then the manual steps above are all that's required" | installing.md:89 | - | | | | | |
| I-30 | Anchor `#why-desktop-not-web` (heading "Why desktop, not web") used by `README.md` | installing.md:79 | - | | | | | not a statement; Tasks 10 and 11 must keep it resolving |

### organize/start-page.md (from `start-page.md`)

The last sentence of the App Settings bullet (start-page.md:20, about the home-network sharing controls) is excluded under FR-9: no row, absent from the new page.

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | "The Start Page is the first thing you see when you open GetWrite — your home base across all your writing." | start-page.md:3 | - | | | | | |
| S-02 | "Every project you've created is listed here" | start-page.md:7 | - | | | | | |
| S-03 | "running totals of how many projects and resources you've made" | start-page.md:7 | - | | | | | |
| S-04 | "From the Start Page you can act on a project without opening it first" | start-page.md:11 | - | | | | | |
| S-05 | "Create a new project — you'll choose a project type and give it a name." | start-page.md:13 | - | | | | | |
| S-06 | "Open a project to start writing." | start-page.md:14 | - | | | | | |
| S-07 | "Rename a project." | start-page.md:15 | - | | | | | |
| S-08 | "Delete a project you no longer need." | start-page.md:16 | - | | | | | |
| S-09 | "Compile a project into a single output." | start-page.md:17 | RC-71 (0) | | | | | compile formats probe |
| S-10 | "Import a Scrivener 3 project (created on a Mac) as a new GetWrite project — desktop app only." | start-page.md:18 | RC-56 (0) | | | | | desktop-only control |
| S-11 | "Choose the .scriv project, name the new project, and GetWrite carries over its folders, documents, and metadata, then shows a report of anything it couldn't convert." | start-page.md:18 | RC-56 (0) | | | | | native file picker; desktop-only |
| S-12 | "Import Word Document — desktop app only. Choose a single .docx file or a folder of them, name the new project" | start-page.md:19 | RC-57 (0) | | | | | desktop-only control; native picker |
| S-13 | "GetWrite converts the text (splitting a single file into one resource per heading, by default), then shows a report of anything it couldn't convert." | start-page.md:19 | RC-55 (0) | | | | | |
| S-14 | "App Settings — opens a standalone settings dialog that isn't tied to any one project and needs no login or account." | start-page.md:20 | RC-25 (1) NYR | | | | | PR #256 |
| S-15 | "Today it manages your cross-project list of custom noise words, used everywhere GetWrite flags an entity name or alias as risking false matches" | start-page.md:20 | RC-26 (1) NYR | | | | | PR #256; desktop global noise words are desktop-only |
| S-16 | "This list lives on this device/install only — it isn't synced between desktop, web, and mobile." | start-page.md:20 | RC-26 (1) NYR | | | | | "mobile" cannot be run (Feature 83) |
| S-17 | "Keeping these actions in one place means less time managing files and more time writing." | start-page.md:22 | - | | | | | benefit claim; not checkable as stated |

### organize/project-types.md (from `project-types.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P-01 | "A project type is a template that defines how a new project starts out — which folders are created and which starter documents they contain." | project-types.md:3 | - | | | | | |
| P-02 | "Choosing a project type ... gives you a consistent, ready-to-write structure instead of an empty folder." | project-types.md:3 | - | | | | | |
| P-03 | "When you create a new project from the Start Page, you pick a project type." | project-types.md:7 | - | | | | | |
| P-04 | "GetWrite then scaffolds the project's folders and any placeholder documents the type defines" | project-types.md:7 | - | | | | | |
| P-05 | "GetWrite ships with these built-in types" (six rows) | project-types.md:11 | - | | | | | |
| P-06 | "Blank — A minimal project with a single Workspace folder" | project-types.md:15 | - | | | | | |
| P-07 | "Novel — Long-form fiction. Includes Workspace, Story Elements, Outline, and Notes folders." | project-types.md:16 | - | | | | | |
| P-08 | "Serial — Serialized fiction for episodes or installments." | project-types.md:17 | - | | | | | |
| P-09 | "Article — Short-form articles and essays, with Workspace, References, Sources, and Ideas folders." | project-types.md:18 | - | | | | | |
| P-10 | "Game Writing — ... Workspace, Research, and Notes folders for lore, characters, and quests." | project-types.md:19 | - | | | | | |
| P-11 | "Poetry and Lyrics — ... Workspace, Inspiration, and Experiments folders." | project-types.md:20 | - | | | | | |
| P-12 | "Open the Project Type Manager from the settings menu (gear icon)" | project-types.md:24 | RC-63 (0) | | | | | |
| P-13 | "to create your own types" | project-types.md:24 | RC-63 (0) | | | | | |
| P-14 | "edit existing ones" | project-types.md:24 | RC-63 (0) | | | | | |
| P-15 | "configure their default folders and starter documents" | project-types.md:24 | RC-63 (0) | | | | | |
| P-16 | "delete types you no longer need" | project-types.md:24 | RC-63 (0) | | | | | |
| P-17 | Callout "developer reference at docs/features/project-types.md" | project-types.md:26 | - | | | | | link out of the handbook; dropped under FR-5, no verification |

### organize/resource-tree.md (from `resource-tree.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | "The Resource Tree is the panel that shows everything inside a project — your documents, images, audio, and folders — in a familiar, file-explorer-style layout." | resource-tree.md:3 | - | | | | | |
| R-02 | "Click any item to open it in the Work Area." | resource-tree.md:7 | - | | | | | |
| R-03 | "From the tree you can create new documents and folders" | resource-tree.md:7 | - | | | | | |
| R-04 | "rename them" | resource-tree.md:7 | - | | | | | |
| R-05 | "and move things around" | resource-tree.md:7 | - | | | | | |
| R-06 | "Drag documents and folders to reorder them within the tree." | resource-tree.md:11 | - | | | | | pointer drag |
| R-07 | "it's the order your work appears everywhere else in GetWrite, including the Organizer view" | resource-tree.md:11 | RC-39 (0) | | | | | |
| R-08 | "Arranging the tree to match the shape of your story means the rest of the app follows suit." | resource-tree.md:11 | - | | | | | restates R-07 |
| R-09 | "The tree holds resources of several kinds — text documents, images, audio, and folders" | resource-tree.md:15 | - | | | | | |
| R-10 | "Selecting a folder opens its contents in the Work Area so you can work at the chapter or section level" | resource-tree.md:15 | - | | | | | |

### write/editor.md (from `features.md`, "Rich text editor")

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-08 | "When you open a text document, GetWrite gives you a focused rich-text editor designed to get out of the way." | features.md:35 | - | | | | | editor |
| F-09 | "You get inline formatting (bold, italic, underline, and more) from the toolbar" | features.md:35 | - | | | | | editor |
| F-10 | "or keyboard shortcuts" | features.md:35 | - | | | | | editor |
| F-11 | "a live word, character, and paragraph count in the footer so you always know where you stand" | features.md:35 | - | | | | | editor |

### write/writing-log.md (from `writing-log.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W-01 | "GetWrite keeps a record of the words you write each day, so you can see whether you wrote today and compare it with a daily goal." | writing-log.md:3 | RC-01 (1) NYR | | | | | PR #236 |
| W-02 | "At the bottom of the editor, Today's writing shows today's figure next to it" | writing-log.md:7 | RC-02 (1) NYR | | | | | |
| W-03 | "With a goal set: `Today: 420 / 1000`." | writing-log.md:9 | RC-02 (1) NYR | | | | | |
| W-04 | "With no goal: `Today: 420` (today's net words)." | writing-log.md:10 | RC-02 (1) NYR | | | | | |
| W-05 | "Select Today's writing ... to open a details window." | writing-log.md:12 | RC-03 (1) NYR | | | | | |
| W-06 | "hover it to see 'Show today's writing details'" | writing-log.md:12 | RC-03 (1) NYR | | | | | |
| W-07 | "It shows Added, Deleted and Net words" | writing-log.md:12 | RC-03 (1) NYR | | | | | |
| W-08 | "a separate Imported (not counted toward goal) figure" | writing-log.md:12 | RC-02 (1) NYR | | | | | |
| W-09 | "'Today's count may be incomplete' when that applies" | writing-log.md:12 | RC-03 (1) NYR | | | | | |
| W-10 | "The window is read-only: set the goal in Project Settings." | writing-log.md:12 | RC-03 (1) NYR | | | | | |
| W-11 | "Press Esc or Close to dismiss it" | writing-log.md:12 | RC-03 (1) NYR | | | | | |
| W-12 | "focus returns to the button" | writing-log.md:12 | RC-03 (1) NYR | | | | | |
| W-13 | "The window is meant to be the place where further writing diagnostics may later appear; none exist yet." | writing-log.md:12 | RC-03 (1) NYR | | | | | promissory; drop candidate |
| W-14 | "The display is never red." | writing-log.md:12 | RC-02 (1) NYR | | | | | |
| W-15 | "If today's figure cannot be read, it says 'Today's count is unavailable' rather than showing zero." | writing-log.md:12 | RC-02 (1) NYR | | | | | failure path |
| W-16 | "'Today' is your local calendar day." | writing-log.md:14 | RC-01 (1) NYR | | | | | |
| W-17 | "Open Project Settings and use Daily word goal. It is in the Writing Goals tab." | writing-log.md:18 | RC-04 (1) NYR | | | | | |
| W-18 | "Enter a whole number of words (0 or more), or leave it empty to clear the goal." | writing-log.md:18 | RC-04 (1) NYR | | | | | |
| W-19 | "After saving, the field may show the old value if you reopen Project Settings before reloading the project." | writing-log.md:18 | RC-04 (1) NYR | | | | | candidate warning (FR-14) |
| W-20 | "This is separate from any total word-count goal for the project." | writing-log.md:18 | RC-06 (1) NYR | | | | | |
| W-21 | "GetWrite also has two other word-count goals you can set, change, or clear from inside the app" | writing-log.md:22 | RC-06 (1) NYR | | | | | |
| W-22 | "A total goal for the whole project — also in Project Settings, Writing Goals tab, in the field below 'Daily word goal', labeled 'Total word-count goal'." | writing-log.md:24 | RC-07 (1) NYR | | | | | PR #238 |
| W-23 | "Reopening the tab right after saving, before reloading the project, can show the old value ...; the save itself takes effect immediately." | writing-log.md:24 | RC-07 (1) NYR | | | | | candidate warning |
| W-24 | "A goal for one resource — in that resource's own sidebar, under a 'Word count goal' section (shown for text resources only)." | writing-log.md:25 | RC-08 (1) NYR | | | | | |
| W-25 | "When set, a progress bar appears in that section." | writing-log.md:25 | RC-08 (1) NYR | | | | | |
| W-26 | "Neither is shown in the footer described above, and neither is ever shown in red." | writing-log.md:27 | RC-08 (1) NYR | | | | | |
| W-27 | "Each autosave of a document's current (canonical) revision that adds or deletes at least one word adds an entry: words added, words deleted, and net" | writing-log.md:31 | RC-01 (1) NYR | | | | | |
| W-28 | "Saves to other revisions are not counted." | writing-log.md:31 | RC-01 (1) NYR | | | | | |
| W-29 | "Words are compared as a bag of words between the previous and new saved text." | writing-log.md:32 | RC-01 (1) NYR | | | | | |
| W-30 | "a paragraph you move counts as nothing" | writing-log.md:32 | RC-01 (1) NYR | | | | | candidate warning |
| W-31 | "a rewrite that reuses many of the same words counts fewer changes than you might expect" | writing-log.md:32 | RC-01 (1) NYR | | | | | |
| W-32 | "Words must match exactly, so a change in capitalization or attached punctuation counts as one word deleted and one added." | writing-log.md:32 | RC-01 (1) NYR | | | | | |
| W-33 | "A word you add and delete between two saves is not counted." | writing-log.md:32 | RC-01 (1) NYR | | | | | |
| W-34 | "An autosave that adds and deletes no words adds no entry" | writing-log.md:32 | RC-01 (1) NYR | | | | | |
| W-35 | "a save that swaps one word for another is counted as one added and one deleted" | writing-log.md:32 | RC-01 (1) NYR | | | | | |
| W-36 | "A Word (docx), Scrivener, or plain-text (.txt) import is logged once, on the day of the import, and shown on the separate Imported line." | writing-log.md:33 | RC-15 (1) NYR | | | | | plain-text import PR #247; docx and Scrivener importers RC-55/RC-56 (0); the log hook is RC-01; imports are desktop-only (Word, Scrivener) or CLI-only (.txt) |
| W-37 | "Imported words are never counted toward your daily goal." | writing-log.md:33 | RC-01 (1) NYR | | | | | |
| W-38 | "There is no backfill: writing from before this feature existed is not included." | writing-log.md:34 | RC-01 (1) NYR | | | | | |
| W-39 | "If the previous content of a document could not be read, or is legacy plain text, that save is not counted." | writing-log.md:38 | RC-01 (1) NYR | | | | | failure path; may not be reproducible |
| W-40 | "GetWrite records that it was skipped, shows a toast, and adds 'Today's count may be incomplete' to the footer display for that day." | writing-log.md:38 | RC-01 (1) NYR | | | | | |
| W-41 | "Each day is a file at `meta/writing-log/YYYY-MM-DD.json` in your project folder" | writing-log.md:42 | RC-01 (1) NYR | | | | | file location |
| W-42 | "named by the UTC date of the entry" | writing-log.md:42 | RC-01 (1) NYR | | | | | |
| W-43 | "Entries are only added, never edited." | writing-log.md:42 | RC-01 (1) NYR | | | | | |
| W-44 | "Your local day is worked out from each entry's timestamp when you view it." | writing-log.md:42 | RC-01 (1) NYR | | | | | |
| W-45 | "Re-running the `reindex` command does not clear the log." | writing-log.md:42 | RC-01 (1) NYR | | | | | command; CLI method (FR-16); `reindex` itself RC-65 (0) |
| W-46 | Callout "For developers, see features/writing-log.md" | writing-log.md:42 | - | | | | | link out of the handbook; dropped under FR-5 |

### write/headings.md (from `editor/headings.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H-01 | "The editor supports up to six heading levels" | editor/headings.md:3 | - | | | | | |
| H-02 | "you can customize how each one looks per project" | editor/headings.md:3 | RC-62 (0) | | | | | |
| H-03 | "By default three heading levels (H1–H3) are available; you can enable up to six (H1–H6)." | editor/headings.md:7 | - | | | | | |
| H-04 | "Apply a heading to the current line using the heading buttons in the editor's menu bar." | editor/headings.md:7 | - | | | | | |
| H-05 | "Open Project Settings from the gear menu in the app shell, then select the Heading Styles tab." | editor/headings.md:11 | RC-62 (0) | | | | | |
| H-06 | "Heading styles are saved per project and take effect in the editor immediately after saving." | editor/headings.md:11 | - | | | | | |
| H-07 | "Font Size — the size of the heading, in pixels." | editor/headings.md:15 | - | | | | | |
| H-08 | "Font Family — the typeface (any font available to the app)." | editor/headings.md:16 | - | | | | | |
| H-09 | "Font Weight — Normal or Bold." | editor/headings.md:17 | - | | | | | |
| H-10 | "Letter Spacing — spacing between letters, in `em`." | editor/headings.md:18 | RC-62 (0) | | | | | |
| H-11 | "Color — a custom heading color, chosen with the color picker (click the pipette icon)." | editor/headings.md:19 | - | | | | | |
| H-12 | "H1–H3 are always available. H4–H6 can be added when you need them and removed when you don't." | editor/headings.md:21 | - | | | | | |
| H-13 | "Changes are staged in the modal as you edit — nothing is applied until you click Save." | editor/headings.md:23 | - | | | | | |
| H-14 | "Clicking Cancel discards everything you changed in that session." | editor/headings.md:23 | - | | | | | |
| H-15 | "setting a custom heading color overrides the theme's default text color, so that heading won't follow light/dark mode switching" | editor/headings.md:25 | - | | | | | observation plus use advice |
| H-16 | Callout "Developer reference ... docs/features/editor/headings.md" | editor/headings.md:27 | - | | | | | link out of the handbook; dropped under FR-5 |

### write/editor-appearance.md (from `editor/settings.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-01 | "Heading styles are the main thing you can customize in the app." | editor/settings.md:7 | - | | | | | |
| A-02 | "Use the Heading Styles tab of Project Settings (gear menu) to set the size, font, weight, letter spacing, and color of each heading level, per project." | editor/settings.md:7 | RC-62 (0) | | | | | |
| A-03 | "Typeface: IBM Plex Serif" | editor/settings.md:13 | - | | | | | default |
| A-04 | "Font size: 15px" | editor/settings.md:14 | - | | | | | default |
| A-05 | "Line height: 1.8" | editor/settings.md:15 | - | | | | | default |
| A-06 | "the editor never goes below 1.8" | editor/settings.md:15 | - | | | | | |
| A-07 | "a deliberate choice to keep long-form writing comfortable" | editor/settings.md:15 | - | | | | | rationale; not checkable |
| A-08 | "Paragraph spacing: a small gap between paragraphs" | editor/settings.md:16 | - | | | | | |
| A-09 | "Body text appearance isn't exposed as an in-app setting yet — these values are fixed" | editor/settings.md:18 | - | | | | | "yet" is promissory |
| A-10 | "a project type template can change them when a project is created" | editor/settings.md:18 | - | | | | | |
| A-11 | "Text color follows your light/dark mode automatically." | editor/settings.md:18 | - | | | | | |
| A-12 | Callout "Developer reference ... docs/features/editor/settings.md" | editor/settings.md:20 | - | | | | | link out of the handbook; dropped under FR-5 |

### write/search.md (from `search.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SE-01 | "Press Cmd+K (macOS) or Ctrl+K (Windows/Linux) to open search" | search.md:5 | RC-54 (0) | | | | | key; macOS key not runnable on a non-macOS check, runtime to be named |
| SE-02 | "start typing a document's name" | search.md:5 | RC-54 (0) | | | | | |
| SE-03 | "and jump straight to it" | search.md:5 | RC-54 (0) | | | | | |
| SE-04 | "It's the fastest way to navigate a large project" | search.md:5 | - | | | | | comparative; not checkable as stated |
| SE-05 | "you shouldn't have to scroll the resource tree to find it" | search.md:3 | - | | | | | framing; not checkable |

### story/metadata.md (from `metadata.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M-01 | "Metadata is the extra information attached to each resource — notes, status, point-of-view, dates, and any custom fields" | metadata.md:3 | - | | | | | |
| M-02 | "You edit it through the Metadata sidebar on the right of the Work Area when a resource is selected." | metadata.md:3 | - | | | | | |
| M-03 | Callout "developer doc at docs/features/data/metadata.md" | metadata.md:5 | - | | | | | link out of the handbook; dropped under FR-5 |
| M-04 | "System metadata is created and maintained automatically — the resource's ID, creation date, file location, and word count." | metadata.md:11 | - | | | | | |
| M-05 | "You don't edit these directly" | metadata.md:11 | - | | | | | |
| M-06 | "User metadata is the information you add — synopsis, notes, status, point-of-view, story dates, and any custom fields." | metadata.md:12 | - | | | | | |
| M-07 | "🤖 Managed by the system — don't edit by hand; changes may break the file." | metadata.md:16 | - | | | | | legend; consequence claim |
| M-08 | "✏️ Safe to edit directly in a text editor or through the sidebar." | metadata.md:17 | - | | | | | |
| M-09 | "Everything else should be changed through the app UI so the app can keep related data consistent." | metadata.md:19 | - | | | | | advice plus reason |
| M-10 | "Every project includes a Status field, plus a set of optional built-in fields you can switch on as needed." | metadata.md:23 | RC-40 (0) | | | | | |
| M-11 | "Status — ... (e.g. Draft, In Review, Published). Always available. The options come from your project's status list" | metadata.md:25 | RC-74 (0) | | | | | |
| M-12 | "Synopsis — a short summary of the resource. (optional)" | metadata.md:26 | RC-40 (0) | | | | | |
| M-13 | "Notes — free-text notes for the resource. (optional)" | metadata.md:27 | RC-40 (0) | | | | | |
| M-14 | "Point of View — the POV character, set by linking to another resource ... The Timeline view uses this to color-code scenes. (optional)" | metadata.md:28 | RC-40 (0) | | | | | |
| M-15 | "Story Date, Duration (minutes), and Story End Date — ... grouped under the Timeline section of the sidebar." | metadata.md:29 | RC-72 (0) | | | | | |
| M-16 | "Adding a Story Date places the resource on the Timeline." | metadata.md:29 | RC-46 (0) | | | | | |
| M-17 | "The optional fields are off by default, so a new project shows only Status until you turn on the ones you want." | metadata.md:31 | RC-40 (0) | | | | | |
| M-18 | "Toggle them per project from the Built-in features section at the top of the Metadata Fields manager (settings menu → Project Settings → Metadata tab)." | metadata.md:31 | RC-40 (0) | | | | | |
| M-19 | "Hiding a field keeps every value you have already saved, so turning it back on restores them untouched." | metadata.md:31 | RC-40 (0) | | | | | |
| M-20 | "Apart from Status, the built-in fields can also be renamed or removed just like custom fields." | metadata.md:31 | RC-40 (0) | | | | | |
| M-21 | "you can add your own custom fields of any type — text, number, date, yes/no, single- or multiple-choice, or links to other resources" | metadata.md:33 | - | | | | | |
| M-22 | "Fields that link to other resources draw their choices from metadata-provider folders" | metadata.md:33 | - | | | | | |
| M-23 | "Image and audio resources carry the same editable fields and tags as text documents" | metadata.md:35 | - | | | | | |
| M-24 | "with a read-only technical section (image dimensions and EXIF data, or audio format and duration) shown above them" | metadata.md:35 | - | | | | | |
| M-25 | "By default, every custom field appears on every resource." | metadata.md:39 | - | | | | | |
| M-26 | "A subtype is a label you give a resource to say what kind of document it is — for example Scene, Profile, or Outline. You choose the labels; GetWrite has no fixed list." | metadata.md:41 | RC-16 (1) NYR | | | | | PR #260 |
| M-27 | "A resource has at most one subtype, and text, image, and audio resources can all have one." | metadata.md:41 | RC-16 (1) NYR | | | | | |
| M-28 | "Define your subtypes. Open the settings menu → Project Settings → Metadata tab. The Subtypes section sits above the Metadata Fields manager." | metadata.md:45 | RC-17 (1) NYR | | | | | |
| M-29 | "Type a name and select Add (or press Enter). You can reorder and remove entries there too." | metadata.md:45 | RC-17 (1) NYR | | | | | |
| M-30 | "Give a resource its subtype. Select the resource and pick one from the Subtype section of the Metadata sidebar." | metadata.md:46 | RC-18 (1) NYR | | | | | |
| M-31 | "Choose No subtype to clear it." | metadata.md:46 | RC-18 (1) NYR | | | | | |
| M-32 | "Restrict a field. ... each custom field has an Applies to subtypes group of checkboxes. Tick the subtypes the field belongs to." | metadata.md:47 | RC-19 (1) NYR | | | | | |
| M-33 | "A field with nothing ticked appears on every resource, exactly as before." | metadata.md:51 | RC-19 (1) NYR | | | | | |
| M-34 | "A restricted field appears only on resources whose subtype is one of the ticked ones." | metadata.md:52 | RC-19 (1) NYR | | | | | |
| M-35 | "A resource with no subtype shows only the unrestricted fields." | metadata.md:53 | RC-19 (1) NYR | | | | | |
| M-36 | "Only custom fields can be restricted. The built-in fields ... have their own on/off switches instead" | metadata.md:54 | RC-19 (1) NYR | | | | | |
| M-37 | "Hiding never deletes. ... any values in fields that drop out of view are kept. Set the subtype back and they reappear unchanged." | metadata.md:58 | RC-19 (1) NYR | | | | | |
| M-38 | "A hidden value is still stored with the resource, so smart folders and saved queries that use that field still find it." | metadata.md:58 | RC-19 (1) NYR | | | | | cause claim ("so") |
| M-39 | "'Scene' and 'scene' are the same subtype, and you can't add both." | metadata.md:59 | RC-16 (1) NYR | | | | | |
| M-40 | "Removing a subtype is safe. Resources and fields that use it keep it, and it is shown as not in the current list until you add it back or choose something else. Nothing is cleared." | metadata.md:60 | RC-16 (1) NYR | | | | | |
| M-41 | "There is no rename. To rename a subtype, remove it and add the new name, then update the resources and fields that used the old one." | metadata.md:61 | RC-17 (1) NYR | | | | | |
| M-42 | "Changing only the capitalisation needs no follow-up, since the two already match." | metadata.md:61 | RC-16 (1) NYR | | | | | |
| M-43 | "Moving a resource to another folder doesn't change its subtype, and marking a resource as an entity is a separate setting." | metadata.md:62 | RC-16 (1) NYR | | | | | |
| M-44 | "If you haven't defined any subtypes yet, the sidebar's Subtype control is greyed out and points you to the Metadata tab." | metadata.md:63 | RC-18 (1) NYR | | | | | |
| M-45 | "Not available yet: filtering by subtype in smart folders and the query builder." | metadata.md:65 | RC-16 (1) NYR | | | | | "yet" is promissory |
| M-46 | "A resource created from a resource template (available through the command-line tool only, not in the app) takes the template's subtype" | metadata.md:65 | RC-20 (1) NYR | | | | | PR #261; CLI method; templates themselves RC-21 (0) |
| M-47 | "a copy or duplicate of a resource keeps the original's subtype" | metadata.md:65 | RC-20 (1) NYR | | | | | PR #261 |
| M-48 | "Text resources also carry a read-only Prose diagnostics section in the sidebar, showing three cheap, automatic observations ... computed with no AI or network call" | metadata.md:69 | RC-13 (1) NYR | | | | | PR #240 |
| M-49 | "Dialogue ratio — roughly how much of the text is quoted speech (text inside quotation marks), as a percentage of the whole." | metadata.md:71 | RC-12 (1) NYR | | | | | |
| M-50 | "Average sentence length — the average number of words per sentence." | metadata.md:72 | RC-12 (1) NYR | | | | | |
| M-51 | "Top repeated words — the words that occur most often in the document (at least 3 times), most-frequent first, with common words like 'the' and 'and' excluded." | metadata.md:73 | RC-12 (1) NYR | | | | | |
| M-52 | "Select Show detail to open a window listing exactly where each repeated word occurs (its position in the document)" | metadata.md:75 | RC-14 (1) NYR | | | | | |
| M-53 | "computed fresh each time you open it and never saved anywhere" | metadata.md:75 | RC-14 (1) NYR | | | | | |
| M-54 | "they are never shown in red or as an error, and they don't flag anything as wrong" | metadata.md:77 | RC-13 (1) NYR | | | | | |
| M-55 | "an abbreviation like 'Mr.' is currently detected as ending a sentence, which can make average sentence length read shorter than the sentence actually is" | metadata.md:77 | RC-12 (1) NYR | | | | | candidate warning; causal wording |
| M-56 | "A more careful detector is a possible future improvement." | metadata.md:77 | RC-12 (1) NYR | | | | | promissory; drop candidate |
| M-57 | "The wording of this section and its detail window is still working copy — it has not yet been finalized with product review." | metadata.md:79 | RC-13 (1) NYR | | | | | internal-process statement; drop candidate |
| M-58 | "Tags are project-scoped labels you can assign to any resource." | metadata.md:83 | RC-58 (0) | | | | | |
| M-59 | "Assign or remove them from the Tags section of the Metadata sidebar" | metadata.md:83 | RC-58 (0) | | | | | |
| M-60 | "create, rename, and delete tags from the project settings UI" | metadata.md:83 | RC-58 (0) | | | | | |
| M-61 | "Because tag assignments are tracked across the whole project, manage tags through the app rather than editing files by hand." | metadata.md:83 | - | | | | | advice with cause |
| M-62 | "Folders can act as metadata providers — collections like Characters, Locations, or Items — that other documents can link to." | metadata.md:87 | - | | | | | metadata-provider string not found by `git log -S` (no introducing commit established here) |
| M-63 | "you point those scenes at the Elena document in your Characters folder" | metadata.md:87 | - | | | | | |
| M-64 | "Over time this builds a connected web of the people, places, and things in your work." | metadata.md:89 | - | | | | | promissory framing |
| M-65 | "to see at a glance everywhere a given entity shows up" | metadata.md:89 | RC-68 (0) | | | | | |
| M-66 | "from that entity's own view, to compile everywhere it appears into a single document" | metadata.md:89 | RC-50 (0) | | | | | |
| M-67 | "Some metadata applies to the whole project rather than a single resource — for example your preferred color mode (light/dark) and your workflow status list." | metadata.md:93 | - | | | | | |
| M-68 | "These live in the project's configuration" | metadata.md:93 | - | | | | | |

### story/metadata-queries.md (from `metadata-queries.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Q-01 | "Metadata queries let you ask questions of all that information at once: show me every scene from Mara's POV, tagged flashback, under 500 words." | metadata-queries.md:3 | RC-59 (0) | | | | | |
| Q-02 | "Save a query and it becomes a smart folder — a living collection that always reflects whatever currently matches, no manual upkeep required." | metadata-queries.md:3 | RC-60 (0) | | | | | |
| Q-03 | "this turns a pile of documents into something you can interrogate" | metadata-queries.md:5 | - | | | | | framing; not checkable |
| Q-04 | "Search (Cmd/Ctrl+K) is for quickly jumping to a document when you know roughly what it's called." | metadata-queries.md:11 | RC-54 (0) | | | | | |
| Q-05 | "Metadata queries are for filtering your project by what documents are — their status, POV, dates, tags, length, and relationships — and for saving those filters to reuse." | metadata-queries.md:12 | RC-59 (0) | | | | | |
| Q-06 | "Smart folders live in the Smart folders section of the sidebar." | metadata-queries.md:16 | RC-60 (0) | | | | | |
| Q-07 | "Click the + there to start a new query and open the query builder." | metadata-queries.md:16 | RC-59 (0) | | | | | |
| Q-08 | "You build a query from filter chips. Each chip is one condition and reads like a sentence: Status is Draft" | metadata-queries.md:18-20 | RC-59 (0) | | | | | |
| Q-09 | "To add a condition, add a chip and choose: a field; an operator; a value" | metadata-queries.md:22-26 | RC-59 (0) | | | | | |
| Q-10 | "the choices adapt to the field" (operator) | metadata-queries.md:25 | RC-59 (0) | | | | | |
| Q-11 | "A value — a text box, number, date, or a picker of the field's allowed values" | metadata-queries.md:26 | RC-59 (0) | | | | | |
| Q-12 | "You can group conditions and choose whether each group requires all of its conditions (AND) or any of them (OR)." | metadata-queries.md:30 | RC-59 (0) | | | | | |
| Q-13 | "Two levels of grouping are supported" | metadata-queries.md:30 | RC-59 (0) | | | | | |
| Q-14 | "POV is Mara AND ( Status is Draft OR Status is In Review )" | metadata-queries.md:32 | RC-59 (0) | | | | | example |
| Q-15 | "For logic more intricate than two levels allow, switch to advanced mode" | metadata-queries.md:34 | RC-61 (0) | | | | | |
| Q-16 | "Your metadata fields — everything defined for the project, including the built-ins (Synopsis, Notes, Status, Point of View, Story Date, Duration, Story End Date) and any custom fields" | metadata-queries.md:40 | RC-72 (0) | | | | | |
| Q-17 | "Type — Whether the resource is text, image, audio, or a folder." | metadata-queries.md:46 | RC-73 (0) | | | | | built-in attribute |
| Q-18 | "Folder — Which folder the resource lives in." | metadata-queries.md:47 | RC-73 (0) | | | | | |
| Q-19 | "Word Count — Length of a text document, in words." | metadata-queries.md:48 | RC-73 (0) | | | | | |
| Q-20 | "Character Count — Length of a text document, in characters." | metadata-queries.md:49 | RC-73 (0) | | | | | |
| Q-21 | "Created At — When the resource was created." | metadata-queries.md:50 | RC-73 (0) | | | | | |
| Q-22 | "Updated At — When the resource was last changed." | metadata-queries.md:51 | RC-73 (0) | | | | | |
| Q-23 | "Statuses — The workflow status values applied to the resource." | metadata-queries.md:52 | RC-74 (0) | | | | | the query field `statuses` and the sidebar status are separate in developer notes; to be measured |
| Q-24 | "Tags — The tags assigned to the resource." | metadata-queries.md:53 | RC-58 (0) | | | | | |
| Q-25 | "Linked From — Other resources that link to this one." | metadata-queries.md:54 | RC-73 (0) | | | | | |
| Q-26 | "Links To — Resources this one links to." | metadata-queries.md:55 | RC-73 (0) | | | | | |
| Q-27 | "Linked From and Links To let you walk the web of connections in your project" | metadata-queries.md:57 | RC-73 (0) | | | | | |
| Q-28 | "The operators offered depend on the field's type, so you can never build a nonsensical condition." | metadata-queries.md:61 | RC-75 (0) | | | | | "never" is absolute |
| Q-29 | "Every field also supports is empty and has any value" | metadata-queries.md:61 | RC-75 (0) | | | | | |
| Q-30 | "Text: is · is not · contains · does not contain · starts with · matches regex · is empty · has any value" | metadata-queries.md:65 | RC-75 (0) | | | | | |
| Q-31 | "Number: equals · does not equal · is less than · is at most · is greater than · is at least · is between · is empty · has any value" | metadata-queries.md:66 | RC-75 (0) | | | | | |
| Q-32 | "Date: is on · is before · is after · is between · in the last · is empty · has any value" | metadata-queries.md:67 | RC-75 (0) | | | | | |
| Q-33 | "Yes/No: is true · is false · is empty · has any value" | metadata-queries.md:68 | RC-75 (0) | | | | | |
| Q-34 | "Single choice / single reference: is · is not · is any of · is none of · is empty · has any value" | metadata-queries.md:69 | RC-75 (0) | | | | | |
| Q-35 | "Multiple choice / multiple references: includes · does not include · includes all of · includes any of · includes none of · is empty · has any value" | metadata-queries.md:70 | RC-75 (0) | | | | | |
| Q-36 | "give it a name and save it. It then appears as a smart folder in the sidebar, marked with a search icon." | metadata-queries.md:74 | RC-60 (0) | | | | | |
| Q-37 | "Click a smart folder any time to run it and see what currently matches." | metadata-queries.md:76 | RC-60 (0) | | | | | |
| Q-38 | "the results stay current as you write and edit — a smart folder called Needs a POV empties itself as you fill in the missing fields" | metadata-queries.md:76 | RC-60 (0) | | | | | |
| Q-39 | "Hover a smart folder to edit it (refine the query) or delete it." | metadata-queries.md:78 | RC-60 (0) | | | | | |
| Q-40 | "Editing opens the query builder pre-filled with the saved conditions." | metadata-queries.md:78 | RC-60 (0) | | | | | |
| Q-41 | "When a query's logic goes beyond the two levels of grouping the chip builder supports, GetWrite switches it into advanced mode" | metadata-queries.md:82 | RC-61 (0) | | | | | |
| Q-42 | "chip editing is disabled and you edit the query directly as JSON ... in a text box" | metadata-queries.md:82 | RC-61 (0) | | | | | |
| Q-43 | "A Back to chip view button returns you to the chip builder once the query is simple enough to represent that way again." | metadata-queries.md:82 | RC-61 (0) | | | | | |
| Q-44 | "The chip builder and advanced mode are two views of the same query." | metadata-queries.md:82 | RC-61 (0) | | | | | |
| Q-45 | "Find a specific set of scenes — Tags includes flashback AND POV is Mara AND Word Count is less than 500." | metadata-queries.md:88 | RC-59 (0) | | | | | example |
| Q-46 | "Story-time slice — Story Date is between two in-story dates" | metadata-queries.md:89 | RC-59 (0) | | | | | example |
| Q-47 | "Pairs naturally with the Timeline view." | metadata-queries.md:89 | - | | | | | framing; not checkable |
| Q-48 | "Quality control — Status is empty ..., or POV is empty to find scenes missing a viewpoint." | metadata-queries.md:90 | RC-59 (0) | | | | | example |
| Q-49 | "Staleness — Updated At is before a given date" | metadata-queries.md:91 | RC-59 (0) | | | | | example |
| Q-50 | "Co-occurrence — a custom multi-value field (say, Characters) that includes all of Alice and Bob" | metadata-queries.md:92 | RC-59 (0) | | | | | example |

### views/organizer.md (from `views/organizer.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O-01 | "The Organizer View turns a folder's contents into a board of cards" | views/organizer.md:3 | RC-39 (0) | | | | | |
| O-02 | "its resources are laid out as cards, left-to-right and top-to-bottom, in the same order as the resource tree" | views/organizer.md:7 | RC-39 (0) | | | | | |
| O-03 | "Text documents show a trimmed preview of their content." | views/organizer.md:9 | RC-39 (0) | | | | | |
| O-04 | "Images show a thumbnail." | views/organizer.md:10 | RC-39 (0) | | | | | |
| O-05 | "Audio files show an inline player." | views/organizer.md:11 | RC-39 (0) | | | | | |
| O-06 | "This gives you a bird's-eye read on a chunk of your project" | views/organizer.md:13 | - | | | | | framing; not checkable |
| O-07 | "Each card can show a line of context beneath its title." | views/organizer.md:17 | RC-40 (0) | | | | | |
| O-08 | "Choose what that body is from User Preferences → Organizer Card Body: nothing, a text excerpt of the resource's content, or the value of any metadata field" | views/organizer.md:17 | RC-40 (0) | | | | | |
| O-09 | "The toggle in the view header shows or hides the body" | views/organizer.md:17 | RC-40 (0) | | | | | |
| O-10 | "Status — a dropdown populated from the project's configured statuses, plus a 'No status' option." | views/organizer.md:23 | RC-41 (1) NYR | | | | | PR #249 |
| O-11 | "Word count — a free-form minimum/maximum range." | views/organizer.md:24 | RC-41 (1) NYR | | | | | |
| O-12 | "Only text resources have a word count, so this filter hides every other resource type while it's active." | views/organizer.md:24 | RC-42 (1) NYR | | | | | |
| O-13 | "Resource-reference fields — one dropdown per resource-ref/multi-resource-ref metadata field the project defines (for example, POV character), populated from the values actually present among the current folder's cards." | views/organizer.md:25 | RC-41 (1) NYR | | | | | |
| O-14 | "Active filters combine — a card must match all of them to stay visible." | views/organizer.md:27 | RC-42 (1) NYR | | | | | |
| O-15 | "Each filter has its own clear control, plus a 'Clear all filters' button once any filter is active." | views/organizer.md:27 | RC-44 (1) NYR | | | | | |
| O-16 | "When filters exclude every card, the grid shows 'No cards match the current filters.' instead of the empty-folder message." | views/organizer.md:27 | RC-43 (1) NYR | | | | | |
| O-17 | "Filter selections are per-folder: they reset whenever you navigate to a different folder." | views/organizer.md:27 | RC-42 (1) NYR | | | | | |
| O-18 | "Drag a card by its grip handle to move it to a new position among its siblings" | views/organizer.md:31 | RC-45 (1) NYR | | | | | PR #251; pointer drag |
| O-19 | "the same order used by the resource tree, so reordering here also reorders the tree" | views/organizer.md:31 | RC-45 (1) NYR | | | | | |
| O-20 | "The handle also works from the keyboard: focus it, pick up the card, move it earlier or later, and confirm, with a screen-reader announcement on completion." | views/organizer.md:31 | RC-45 (1) NYR | | | | | |
| O-21 | "Reordering is disabled whenever a filter is active" | views/organizer.md:31 | RC-45 (1) NYR | | | | | |
| O-22 | "the handle shows why when it's disabled" | views/organizer.md:31 | RC-45 (1) NYR | | | | | |
| O-23 | "Folders that mix content types (text and images together, say) open in the Organizer automatically" | views/organizer.md:35 | RC-39 (0) | | | | | |

### views/data.md (from `views/data.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D-01 | "The Data View is a high-level dashboard for a project" | views/data.md:3 | RC-53 (0) | | | | | |
| D-02 | "How many documents the project contains." | views/data.md:7 | RC-53 (0) | | | | | |
| D-03 | "Your total word count." | views/data.md:8 | RC-53 (0) | | | | | |
| D-04 | "A list of the documents you've edited most recently." | views/data.md:9 | RC-53 (0) | | | | | |
| D-05 | "It's especially handy for tracking momentum across a long project." | views/data.md:11 | - | | | | | framing; not checkable |
| D-06 | "The By status section shows how your text resources are spread across the project's statuses." | views/data.md:15 | RC-11 (1) NYR | | | | | PR #237 |
| D-07 | "It is a table with three columns: Status, Resources and Words." | views/data.md:15 | RC-11 (1) NYR | | | | | |
| D-08 | "this many text resources currently have this status, holding this many words between them" | views/data.md:15 | RC-10 (1) NYR | | | | | |
| D-09 | "Rows appear in the order of your project's status list, including statuses no resource uses yet (shown as 0)." | views/data.md:17 | RC-10 (1) NYR | | | | | |
| D-10 | "A status a resource carries that is no longer in the project's list gets its own row, labelled '<value> (not in the current list)'." | views/data.md:18 | RC-10 (1) NYR | | | | | |
| D-11 | "Resources with no status are counted in the final No status row." | views/data.md:19 | RC-10 (1) NYR | | | | | |
| D-12 | "If the project has no statuses configured, the section says: 'No statuses are configured for this project, so every resource shows under No status.'" | views/data.md:20 | RC-11 (1) NYR | | | | | |
| D-13 | "A project with no text resources shows 'No text resources yet.' instead of the table, so the zero rows and the No status row are not shown in that case." | views/data.md:21 | RC-11 (1) NYR | | | | | |
| D-14 | "Only text resources are counted, across the whole project. The section says so: 'Text resources only, across the whole project. Not affected by the selected smart folder.'" | views/data.md:25 | RC-11 (1) NYR | | | | | |
| D-15 | "Word totals come from each resource's stored word count, which can lag behind. The section says: 'Word counts for some older resources may read low.'" | views/data.md:26 | RC-11 (1) NYR | | | | | candidate warning |
| D-16 | "The section covers the whole project. It does not follow smart-folder selection, even when a smart folder is selected in the resource tree." | views/data.md:27 | RC-11 (1) NYR | | | | | |

### views/diff.md (from `views/diff.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DF-01 | "The Diff View compares two versions of a document" | views/diff.md:3 | RC-52 (0) | | | | | |
| DF-02 | "shows exactly what changed between them — what was added, what was removed, and what was modified" | views/diff.md:3 | RC-52 (0) | | | | | |
| DF-03 | "every document keeps a revision history" | views/diff.md:5 | RC-52 (0) | | | | | link to revisions page |
| DF-04 | "you can look back at how a passage evolved instead of guessing" | views/diff.md:5 | - | | | | | framing |
| DF-05 | "The Diff View makes the answer precise, so you can revise with confidence and recover wording you thought was lost." | views/diff.md:5 | - | | | | | framing; not checkable |

### views/timeline.md (from `views/timeline.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-01 | "Each scene is represented as a chip placed along a date axis according to its Story Date" | views/timeline.md:5 | RC-46 (0) | | | | | |
| T-02 | "Story Date — the in-story date and time the scene takes place, not the date the writer worked on it" | views/timeline.md:5 | RC-46 (0) | | | | | |
| T-03 | "The Timeline View is enabled per project. Turn it on from User Preferences → Timeline view" | views/timeline.md:7 | RC-40 (0) | | | | | |
| T-04 | "enabling it also turns those fields on (and turning the date fields off turns the view off)" | views/timeline.md:7 | RC-40 (0) | | | | | |
| T-05 | "writers open the Timeline by switching to the Timeline tab in the Work Area" | views/timeline.md:7 | RC-46 (0) | | | | | |
| T-06 | "it reflects whatever story dates have been entered in the metadata sidebar" | views/timeline.md:7 | RC-46 (0) | | | | | |
| T-07 | "While the view is disabled, its tab is greyed out with a tooltip pointing to the preference." | views/timeline.md:7 | RC-40 (0) | | | | | |
| T-08 | "A scene appears on the timeline only after a Story Date has been set in its metadata." | views/timeline.md:11 | RC-46 (0) | | | | | |
| T-09 | "The date can be as coarse as a calendar day or as precise as a date and time." | views/timeline.md:11 | RC-46 (0) | | | | | |
| T-10 | "Writers who also set a Story Duration or Story End Date will see their scenes rendered as spans rather than point events." | views/timeline.md:11 | RC-46 (0) | | | | | |
| T-11 | "The axis spans from the earliest dated scene to the latest, with a small margin on each side." | views/timeline.md:15 | RC-46 (0) | | | | | |
| T-12 | "Writers can zoom in and out using the +/− controls in the toolbar, or with Ctrl+scroll (Cmd+scroll on Mac)." | views/timeline.md:15 | RC-46 (0) | | | | | |
| T-13 | "At higher zoom levels the axis labels grow more precise — switching from month/day to hour:minute as needed — and chips that were previously too dense to read become individually legible." | views/timeline.md:15 | RC-46 (0) | | | | | |
| T-14 | "Clicking a chip navigates directly to that scene in the editor." | views/timeline.md:17 | RC-46 (0) | | | | | |
| T-15 | "Hovering over any chip opens a tooltip showing the scene's full name, in-story date and time, duration (if set), point of view, workflow status, folder or act, and any notes" | views/timeline.md:17 | RC-46 (0) | | | | | |
| T-16 | "each distinct POV is given its own color" | views/timeline.md:21 | RC-46 (0) | | | | | |
| T-17 | "A legend appears above the timeline whenever two or more POVs are present, pairing each color swatch with the POV name" | views/timeline.md:21 | RC-46 (0) | | | | | |
| T-18 | "Scenes assigned to a folder (typically an act or chapter) are rendered in a labeled row for that folder. The row label appears to the left of the track." | views/timeline.md:25 | RC-46 (0) | | | | | |
| T-19 | "Scenes with no folder fall into an ungrouped row at the bottom." | views/timeline.md:25 | RC-46 (0) | | | | | |
| T-20 | "A writer can therefore see how acts interleave in story time" | views/timeline.md:25 | - | | | | | inference; not checkable as stated |
| T-21 | "Only scenes with a Story Date set are shown. Scenes without a date are silently omitted" | views/timeline.md:33 | RC-46 (0) | | | | | |
| T-22 | "the empty-state message prompts the writer to set dates via the metadata sidebar" | views/timeline.md:33 | RC-46 (0) | | | | | |
| T-23 | "The scene count shown in the toolbar reflects only the dated scenes." | views/timeline.md:33 | RC-46 (0) | | | | | |
| T-24 | "The axis start and end are computed automatically from the earliest and latest dated scenes, padded by 5% on each side." | views/timeline.md:37 | RC-46 (0) | | | | | |
| T-25 | "Zooming multiplies the track width" | views/timeline.md:37 | RC-46 (0) | | | | | |
| T-26 | "the number of axis tick labels scales with the zoom level, up to a maximum of 24 ticks" | views/timeline.md:37 | RC-46 (0) | | | | | |
| T-27 | "Ctrl+scroll and the toolbar buttons adjust zoom in 0.5× increments between 1× and 10×." | views/timeline.md:37 | RC-46 (0) | | | | | |
| T-28 | "When two adjacent scenes (within the same row) have a large gap between them — more than 5% of the total axis span — a small label appears between them showing how much story time separates them (e.g., 3d, 2h, 6mo)." | views/timeline.md:41 | RC-46 (0) | | | | | |
| T-29 | "the timeline automatically stacks overlapping chips into parallel lanes within the same row" | views/timeline.md:45 | RC-46 (0) | | | | | |
| T-30 | "Each additional lane increases the row height proportionally." | views/timeline.md:45 | RC-46 (0) | | | | | |
| T-31 | "it happens whenever two chips in the same row would collide at the current zoom level" | views/timeline.md:45 | RC-46 (0) | | | | | |
| T-32 | "a title bar showing Timeline — Project Name, an optional POV legend, and the timeline track below" | views/timeline.md:53 | RC-46 (0) | | | | | |
| T-33 | "The track area is horizontally scrollable when the content is wider than the viewport." | views/timeline.md:53 | RC-46 (0) | | | | | |
| T-34 | "a row of color swatches and labels appears between the title and the track" (POV legend) | views/timeline.md:57 | RC-46 (0) | | | | | |
| T-35 | "Each entry is a small filled circle in the POV's color followed by the POV name in subdued mono text." | views/timeline.md:57 | RC-46 (0) | | | | | |
| T-36 | "The legend is omitted when all scenes share a single POV or when no POV is set." | views/timeline.md:57 | RC-46 (0) | | | | | |
| T-37 | "A slim bar sits above the track. On the left it shows the count of dated scenes (N scenes)." | views/timeline.md:61 | RC-46 (0) | | | | | |
| T-38 | "On the right are the zoom-out (−), zoom percentage, and zoom-in (+) buttons." | views/timeline.md:61 | RC-46 (0) | | | | | |
| T-39 | "Zoom buttons dim when the minimum or maximum zoom level is reached." | views/timeline.md:61 | RC-46 (0) | | | | | |
| T-40 | "A row of evenly spaced tick marks runs above the scene rows. Each tick has a short vertical line and a date label below it." | views/timeline.md:65 | RC-46 (0) | | | | | |
| T-41 | "At wide spans: Jan 12 or 2024 Jan" | views/timeline.md:67 | RC-46 (0) | | | | | label format |
| T-42 | "At narrow spans: Jan 12 14:30" | views/timeline.md:68 | RC-46 (0) | | | | | label format |
| T-43 | "Each chip is a colored, rounded rectangle placed on the track according to the scene's story date. The chip's left edge corresponds to the scene's start time; its width represents the scene's duration." | views/timeline.md:72 | RC-46 (0) | | | | | |
| T-44 | "Three visual variants are chosen dynamically based on how much horizontal space the chip has at the current zoom level" | views/timeline.md:72 | RC-46 (0) | | | | | |
| T-45 | "Bar — the default chip. Displays the full scene name, truncated with an ellipsis if it runs long." | views/timeline.md:74 | RC-46 (0) | | | | | |
| T-46 | "Pill — a narrower chip used when the scene's duration is short relative to the axis span. Displays only the first word of the scene name. Has a smaller minimum width than the bar" | views/timeline.md:76 | RC-46 (0) | | | | | |
| T-47 | "Pin — a thin vertical bar used for scenes with no duration. Carries no label ... Spans the full height of the track row" | views/timeline.md:78 | RC-46 (0) | | | | | |
| T-48 | "Chips are fully opaque. A chip's background color reflects its POV assignment; chips with no POV use a neutral default color." | views/timeline.md:80 | RC-46 (0) | | | | | |
| T-49 | "Hovering a chip brightens it slightly. Focusing a chip via keyboard shows a focus ring." | views/timeline.md:80 | RC-46 (0) | | | | | |
| T-50 | "Hovering any chip opens a styled tooltip above it. The tooltip always shows the scene name in bold and the in-story date (and time, if set)." | views/timeline.md:84 | RC-46 (0) | | | | | |
| T-51 | "Below that it shows, when available: the POV character, the workflow status, the folder or act the scene belongs to, and a short excerpt from the scene's notes." | views/timeline.md:84 | RC-46 (0) | | | | | |
| T-52 | "The tooltip is fully opaque and renders above all other UI elements." | views/timeline.md:84 | RC-46 (0) | | | | | |
| T-53 | "A subtle horizontal rule separates each group row from the next" | views/timeline.md:88 | RC-46 (0) | | | | | |

### views/entity-roster.md (from `views/entity-roster.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ER-01 | "The Entities view is a project-wide list of every entity you've declared" | views/entity-roster.md:3 | RC-30 (0) | | | | | |
| ER-02 | "Each row lists: The entity's name and its kind" | views/entity-roster.md:9 | RC-30 (0) | | | | | |
| ER-03 | "Its declared aliases, if any." | views/entity-roster.md:10 | RC-30 (0) | | | | | |
| ER-04 | "How many times it's mentioned across the project and how many documents those mentions are spread across — for example '593 mentions in 32 documents'" | views/entity-roster.md:11 | RC-30 (0) | | | | | example string |
| ER-05 | "'No mentions yet' if it hasn't appeared in your prose" | views/entity-roster.md:11 | RC-30 (0) | | | | | |
| ER-06 | "Both numbers are shown because they answer different questions" | views/entity-roster.md:11 | - | | | | | rationale |
| ER-07 | "A 'Needs attention' indicator when its name or one of its aliases is claimed by more than one entity" | views/entity-roster.md:12 | RC-29 (0) | | | | | |
| ER-08 | "or also reads as an ordinary English word or name (either too short, or a match against a bundled common-word list, your project's own custom noise-word list, or the cross-project noise-word list from App Settings)" | views/entity-roster.md:12 | RC-24 (1) NYR | | | | | PR #256 |
| ER-09 | "Each flagged term has its own 'Dismiss' control" | views/entity-roster.md:12 | RC-28 (1) NYR | | | | | |
| ER-10 | "dismissing it stops the indicator from reappearing for that exact term until its text changes" | views/entity-roster.md:12 | RC-28 (1) NYR | | | | | |
| ER-11 | "Rows are sorted alphabetically by name." | views/entity-roster.md:14 | RC-30 (0) | | | | | |
| ER-12 | "Click (or press Enter/Space on) a row to jump straight to that entity's document in the editor" | views/entity-roster.md:18 | RC-30 (0) | | | | | |
| ER-13 | "where you can edit its aliases and see its full 'mentioned in' list" | views/entity-roster.md:18 | RC-68 (0) | | | | | |
| ER-14 | "The Entities view itself is read-only — it doesn't let you rename an entity or change its aliases directly." | views/entity-roster.md:18 | RC-30 (0) | | | | | |
| ER-15 | "the Entities tab depends on the Entities feature being turned on for the project (Built-in features section of the Metadata Fields manager)" | views/entity-roster.md:22 | RC-40 (0) | | | | | |
| ER-16 | "While it's off, the tab is greyed out with a tooltip pointing you to the setting." | views/entity-roster.md:22 | RC-30 (0) | | | | | |

### views/entity-relationship-graph.md (from `views/entity-relationship-graph.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-01 | "The Relationship Graph is a project-wide picture of how your declared entities ... connect to each other." | views/entity-relationship-graph.md:3 | RC-31 (0) | | | | | |
| G-02 | "Every entity you've declared appears as a node, even if it has no connections yet." | views/entity-relationship-graph.md:3 | RC-31 (0) | | | | | |
| G-03 | "Up to five kinds of connections can be drawn, and they look different on purpose ... Two are on by default; the other three you turn on yourself" | views/entity-relationship-graph.md:7 | RC-34 (1) NYR | | | | | PR #253 |
| G-04 | "Solid arrows (on by default) connect entities you've deliberately linked with an authored relationship ... from an entity's own sidebar view." | views/entity-relationship-graph.md:9 | RC-33 (0) | | | | | |
| G-05 | "These are directed, pointing from the entity the relationship was authored on to the other entity, and labeled with the relationship type." | views/entity-relationship-graph.md:9 | RC-32 (0) | | | | | |
| G-06 | "Dashed lines (on by default) connect entities that turn up mentioned in the same document ... undirected ... drawn thicker the more documents the two entities share." | views/entity-relationship-graph.md:10 | RC-32 (0) | | | | | |
| G-07 | "Backlinks connect entities whose own documents explicitly link to each other." | views/entity-relationship-graph.md:11 | RC-34 (1) NYR | | | | | |
| G-08 | "Proximity mentions connect entities whose mentions tend to fall close together within the same document — the closer together on average, the stronger the connection looks." | views/entity-relationship-graph.md:12 | RC-34 (1) NYR | | | | | |
| G-09 | "Shared tags/metadata connect entities that share a tag, or hold the identical value in the same custom metadata field." | views/entity-relationship-graph.md:13 | RC-34 (1) NYR | | | | | |
| G-10 | "A pair of entities can have more than one kind of line at once ... the different kinds are never merged into one line." | views/entity-relationship-graph.md:15 | RC-34 (1) NYR | | | | | |
| G-11 | "A settings panel near the reset-view button lets you turn each of the five connection types on or off for the project, and set how far the focal-point spotlight reaches." | views/entity-relationship-graph.md:19 | RC-36 (1) NYR | | | | | |
| G-12 | "Each change takes effect immediately — there's no separate save step." | views/entity-relationship-graph.md:19 | RC-36 (1) NYR | | | | | |
| G-13 | "Pan by clicking and dragging an empty area of the canvas." | views/entity-relationship-graph.md:23 | RC-32 (0) | | | | | pointer drag |
| G-14 | "Zoom with the scroll wheel." | views/entity-relationship-graph.md:24 | RC-32 (0) | | | | | wheel handler first added in #191 (exit 0) |
| G-15 | "Click a node (or press Enter/Space when it's focused) to jump straight to that entity's document in the editor" | views/entity-relationship-graph.md:25 | RC-32 (0) | | | | | |
| G-16 | "Drag a node to move it out of the way. This just repositions that one node on the canvas — connected lines stretch to follow it, but nothing else on the graph moves" | views/entity-relationship-graph.md:26 | RC-32 (0) | | | | | pointer drag; node drag introduced in #194 (`676da04b`, exit 0) |
| G-17 | "It works with a mouse, trackpad, or finger — on a phone, dragging a node moves it, while swiping empty space scrolls the view." | views/entity-relationship-graph.md:26 | RC-32 (0) | | | | | touch/phone: no device method in FR-15 |
| G-18 | "There's no keyboard equivalent for repositioning a node." | views/entity-relationship-graph.md:26 | RC-32 (0) | | | | | candidate warning |
| G-19 | "Shift-click a node (or long-press it on a touch screen) to make it the graph's focal point ... a different gesture from a plain click" | views/entity-relationship-graph.md:27 | RC-38 (1) NYR | | | | | |
| G-20 | "Hover or tap a connection to see a tooltip spelling out what it represents — the same text as its entry in the accessible list" (e.g. 'Amara and Kestrel share 3 resources', 'Amara → Kestrel (mentor of)') | views/entity-relationship-graph.md:28 | RC-33 (0) | | | | | tooltip text for the three new types is NYR |
| G-21 | "Connections aren't keyboard-focusable and show no tooltip on focus; the accessible list is the keyboard and screen-reader way" | views/entity-relationship-graph.md:28 | RC-33 (0) | | | | | |
| G-22 | "A node you've dragged stays where you put it — reload the view, navigate away and back, or reopen the project, and it's still there." | views/entity-relationship-graph.md:30 | RC-35 (1) NYR | | | | | PR #253 |
| G-23 | "The only thing that resets a saved position is turning a connection type on or off in the settings panel ... every node's position is recalculated fresh the next time you open the view." | views/entity-relationship-graph.md:30 | RC-35 (1) NYR | | | | | "only thing" is absolute |
| G-24 | "Positions aren't shared between projects or devices — they're stored with the project itself." | views/entity-relationship-graph.md:30 | RC-35 (1) NYR | | | | | |
| G-25 | "Shift-click a node (desktop) or long-press it (touch) to set it as the graph's focal point. Doing so centers the view on that entity and dims everything more than a few connections away" | views/entity-relationship-graph.md:34 | RC-37 (1) NYR | | | | | |
| G-26 | "How many connections count as 'nearby' is the same hop-radius setting from the settings panel" | views/entity-relationship-graph.md:34 | RC-36 (1) NYR | | | | | |
| G-27 | "Dimmed nodes and connections aren't hidden — they're still clickable, draggable, and show their tooltip as normal" | views/entity-relationship-graph.md:36 | RC-37 (1) NYR | | | | | |
| G-28 | "Selecting a different node as the focal point moves the spotlight there instead" | views/entity-relationship-graph.md:36 | RC-37 (1) NYR | | | | | |
| G-29 | "the accessible list has its own 'Set as focal point' button per entity, plus a 'Clear focal point' button at the top of the list" | views/entity-relationship-graph.md:36 | RC-38 (1) NYR | | | | | |
| G-30 | "The focal point itself isn't saved — it resets to 'none' the next time you open the view." | views/entity-relationship-graph.md:38 | RC-37 (1) NYR | | | | | |
| G-31 | "the same nodes and connections are also presented as a plain list: every entity as a clickable item, and every connection spelled out in words" | views/entity-relationship-graph.md:42 | RC-33 (0) | | | | | |
| G-32 | "This list stays in sync with the canvas" | views/entity-relationship-graph.md:42 | RC-33 (0) | | | | | |
| G-33 | "the Graph tab depends on the Entities feature being turned on for the project (Built-in features section of the Metadata Fields manager)" | views/entity-relationship-graph.md:46 | RC-40 (0) | | | | | |
| G-34 | "While it's off, the tab is greyed out with a tooltip pointing you to the setting." | views/entity-relationship-graph.md:46 | RC-31 (0) | | | | | |
| G-35 | "The Relationship Graph is read-only. To author a new relationship ..., or remove one, open the entity's own document and use the relationships section there" | views/entity-relationship-graph.md:50 | RC-31 (0) | | | | | |

### protect-and-finish/revisions.md (from `revisions.md`, lines 1-31 and 39-41)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RV-01 | "Every resource keeps a history of revisions — saved snapshots of its content over time." | revisions.md:3 | RC-23 (0) | | | | | |
| RV-02 | "This lets you look back at earlier versions of your work and restore them if you need to." | revisions.md:3 | RC-23 (0) | | | | | |
| RV-03 | "At any moment, exactly one revision is the canonical revision — the active version that the editor shows and saves to." | revisions.md:7 | RC-23 (0) | | | | | |
| RV-04 | "When you create a resource, its first revision becomes canonical automatically." | revisions.md:7 | RC-23 (0) | | | | | |
| RV-05 | "You can view earlier revisions from the Metadata Panel." | revisions.md:9 | RC-23 (0) | | | | | |
| RV-06 | "If you edit an earlier revision and save it, that version is promoted to become the newest, canonical revision." | revisions.md:9 | RC-23 (0) | | | | | |
| RV-07 | "The canonical revision cannot be deleted." | revisions.md:9 | RC-23 (0) | | | | | |
| RV-08 | "type a name into the 'Revision name' box under Save Explicit Revision and choose Save" | revisions.md:13 | RC-23 (0) | | | | | |
| RV-09 | "The name is stored with the revision (as its `metadata.name`)" | revisions.md:13 | RC-23 (0) | | | | | file/key; on-disk observation |
| RV-10 | "shown as the heading of its card in the list of existing revisions" | revisions.md:13 | RC-23 (0) | | | | | |
| RV-11 | "A revision without a name is shown as 'Revision vN', where N is its version number." | revisions.md:13 | RC-23 (0) | | | | | |
| RV-12 | "There is no rename action" | revisions.md:13 | RC-23 (0) | | | | | |
| RV-13 | "protecting or unprotecting a revision never changes its name or content" | revisions.md:13 | RC-22 (1) NYR | | | | | PR #233 |
| RV-14 | "You can protect a revision so that pruning never removes it, no matter how old it gets." | revisions.md:17 | RC-22 (1) NYR | | | | | |
| RV-15 | "Every revision card has a Protect button, including the canonical revision's card. Once a revision is protected, the button reads Unprotect." | revisions.md:19 | RC-22 (1) NYR | | | | | |
| RV-16 | "For screen readers the buttons are named 'Protect revision vN' and 'Unprotect revision vN'." | revisions.md:19 | RC-22 (1) NYR | | | | | |
| RV-17 | "A protected revision shows a Protected badge (shield icon plus the word 'Protected', not a colour alone) beside the Canonical badge. A protected canonical revision shows both badges." | revisions.md:20 | RC-22 (1) NYR | | | | | |
| RV-18 | "Delete Revision stays available on a protected revision's card, but it refuses: the deletion fails and a message appears saying 'Protected revisions cannot be deleted. Unprotect it first.'" | revisions.md:21 | RC-22 (1) NYR | | | | | |
| RV-19 | "Unprotect the revision, then delete it." | revisions.md:21 | RC-22 (1) NYR | | | | | |
| RV-20 | "GetWrite does not prune revisions on its own today. Saving, editing, and switching revisions in the app never delete old ones" | revisions.md:25 | - | | | | | contradicts `features.md` ("quietly trims old history so it never piles up"); see F-45 |
| RV-21 | "the app has no setting for a revision limit" | revisions.md:25 | - | | | | | contradicts `features.md` ("choose how much revision history to keep"); see F-50 |
| RV-22 | "Old revisions are removed only when you run the `getwrite prune` command ... which keeps at most a maximum number of revisions per resource (`--max`, default 50)." | revisions.md:25 | RC-65 (0) | | | | | command name to be taken from Task 1 (`getwrite` vs `getwrite-cli`); CLI method |
| RV-23 | "When a resource exceeds that number, the oldest revisions are removed first." | revisions.md:25 | RC-64 (0) | | | | | CLI |
| RV-24 | "Protected revisions do not count toward the cap, and they are never removed." | revisions.md:27 | RC-76 (1) NYR | | | | | PR #233 (`c0c60902`) |
| RV-25 | "The canonical revision is never removed, but it does count toward the cap, even when it is protected." | revisions.md:27 | RC-76 (1) NYR | | | | | |
| RV-26 | "the total number of revisions stored for a resource has no upper limit if you keep protecting them" | revisions.md:27 | RC-76 (1) NYR | | | | | |
| RV-27 | "with a maximum of 3 and 6 revisions of which 2 are protected (and the canonical one unprotected), 4 revisions count toward the cap, so the single oldest unprotected, non-canonical revision is removed" | revisions.md:29 | RC-76 (1) NYR | | | | | worked example; CLI |
| RV-28 | "The `maxRevisions` and `autoPrune` fields that appear in a project's `project.json` are not currently used when pruning; the limit comes from the command's `--max` option." | revisions.md:31 | RC-66 (0) | | | | | CLI |
| RV-29 | "the `getwrite` CLI includes a `prune` command for cleaning up revisions across an entire project from the command line" | revisions.md:39 | RC-65 (0) | | | | | CLI; link to CLI reference out of the handbook is dropped under FR-5 |
| RV-30 | Callout "Developer reference ... docs/features/revisions.md" | revisions.md:41 | - | | | | | link out of the handbook; dropped under FR-5 |

### protect-and-finish/trash.md (from `revisions.md`, lines 33-37, the Trash section)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TR-01 | "When you delete a resource or a folder, it isn't erased immediately. GetWrite moves it to a Trash area inside the project folder" | revisions.md:35 | RC-49 (0) | | | | | |
| TR-02 | "preserving its content, metadata, and revision history" | revisions.md:35 | RC-49 (0) | | | | | |
| TR-03 | "Deleting a folder moves its entire contents — every resource and sub-folder inside it — to Trash together." | revisions.md:35 | RC-49 (0) | | | | | |
| TR-04 | "The Trash tab (alongside Edit, Data, Timeline, Entities, and Graph) lists everything currently trashed in the project" | revisions.md:37 | RC-47 (0) | | | | | |
| TR-05 | "lets you restore or permanently delete items, individually or in a batch" | revisions.md:37 | RC-47 (0) | | | | | |
| TR-06 | "including an 'Empty trash' action for everything at once" | revisions.md:37 | RC-48 (0) | | | | | |
| TR-07 | "Restoring an item puts it back where it was" | revisions.md:37 | RC-49 (0) | | | | | |
| TR-08 | "if its original folder no longer exists, it's restored to the project root instead" | revisions.md:37 | RC-49 (0) | | | | | |
| TR-09 | "a name collision with something already there is resolved by appending '(restored)' to the name" | revisions.md:37 | RC-49 (0) | | | | | |
| TR-10 | "Any other resource's fields that referenced a since-deleted resource are automatically re-linked on restore, where possible." | revisions.md:37 | RC-49 (0) | | | | | re-link first added in #200 (`5c1594609`, exit 0) |
| TR-11 | "Permanently deleting an item from Trash cannot be undone." | revisions.md:37 | RC-47 (0) | | | | | candidate warning |
| TR-12 | "Trash is available on web and desktop" | revisions.md:37 | RC-47 (0) | | | | | runtime-difference claim (Feature 83 widens) |
| TR-13 | "Android support is built in but not yet released as an app you can install." | revisions.md:37 | - | | | | | Android cannot be run by the FR-15 methods; promissory; drop candidate |

### protect-and-finish/resources.md (from `resources.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RS-01 | "A resource is any item inside your project — a document, an image, an audio clip, or a folder." | resources.md:3 | - | | | | | |
| RS-02 | "Each resource has a stable identity that stays the same even if you rename it or move it to another folder, so links and references to it never break." | resources.md:3 | - | | | | | causal and absolute wording ("never break") |
| RS-03 | "Keeping different kinds of material together as resources means your reference images, recordings, and notes can live right alongside the writing they support." | resources.md:5 | - | | | | | framing |
| RS-04 | "Text — a rich-text document you edit in the editor." | resources.md:9 | - | | | | | link target in the old page is `editor/headings.md`; new target `write/headings.md` or `write/editor.md` (Task 8 chooses) |
| RS-05 | "Image — shown in the Work Area, with its resolution and EXIF details available in the metadata panel." | resources.md:10 | - | | | | | |
| RS-06 | "Audio — played with a built-in play/pause/scrub widget; its duration and format appear in the metadata." | resources.md:11 | - | | | | | |
| RS-07 | "Folder — groups other resources together. Selecting a folder opens its contents in the Work Area" | resources.md:12 | - | | | | | |
| RS-08 | "Every resource can carry metadata — notes, status, story dates, and more" | resources.md:16 | - | | | | | |
| RS-09 | "text resources keep a full revision history so earlier drafts are never lost" | resources.md:16 | - | | | | | absolute wording |

### protect-and-finish/compiling.md (from `compiling.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-01 | "Compiling brings them back together — pulling your work into a single, continuous output you can read, share, or export." | compiling.md:3 | RC-71 (0) | | | | | |
| C-02 | "You can compile a project three ways: From the Start Page, without opening the project." | compiling.md:5-7 | RC-71 (0) | | | | | |
| C-03 | "From within the project itself, once you're working in it." | compiling.md:8 | RC-71 (0) | | | | | |
| C-04 | "From an entity's own view, compiling just the documents associated with that entity" | compiling.md:9 | RC-51 (0) | | | | | |
| C-05 | "Before compiling you choose which documents to include and the output format — plain text, PDF, or Word (.docx)." | compiling.md:11 | RC-71 (0) | | | | | |
| C-06 | "The text documents are stitched together in the order of your resource tree" | compiling.md:11 | RC-71 (0) | | | | | |
| C-07 | "When a draft is ready to hand off ... compiling assembles the finished whole from its parts." | compiling.md:11 | - | | | | | framing; not checkable |
| C-08 | "Open a document you've declared as an entity ... and its sidebar lists every resource linked to or mentioning it." | compiling.md:15 | RC-68 (0) | | | | | |
| C-09 | "From there, Compile this entity's resources builds that same set — in resource-tree order — into a single output, using the same format choices as a regular compile." | compiling.md:15 | RC-50 (0) | | | | | |
| C-10 | "The resource list here is fixed to what the entity is already associated with, rather than a pick-your-own selection" | compiling.md:15 | RC-51 (0) | | | | | |
| C-11 | "only text documents are included; any image or audio resource in the set is shown but marked as excluded" | compiling.md:15 | RC-51 (0) | | | | | |
| C-12 | "Like every compile, this only produces a downloadable file — it never changes anything in your project." | compiling.md:15 | RC-51 (0) | | | | | desktop may differ from web in how the file is delivered (runtime to be named) |

### protect-and-finish/project-configuration.md (from `project-configuration.md`)

| ID | Statement | Old page:line | Release | Label | Runtime | Evidence | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PC-01 | "configure a GetWrite project by editing the `project.json` file at the root of your project folder" | project-configuration.md:3 | - | | | | | file location |
| PC-02 | "Open the project directory and edit `project.json` with your editor." | project-configuration.md:7 | - | | | | | |
| PC-03 | "`name` (required): The visible name of the project." | project-configuration.md:11 | - | | | | | key |
| PC-04 | "`description` (optional): Short description shown in project lists." | project-configuration.md:12 | - | | | | | key |
| PC-05 | "`maxRevisions` (optional, default 50): Stored in `project.json`, but not currently read by anything that prunes revisions. The `getwrite prune` command takes its limit from its own `--max` option (default 50)." | project-configuration.md:13 | RC-66 (0) | | | | | key; default; CLI |
| PC-06 | "`autoPrune` (optional, default true): Stored in `project.json`, but not currently read. The app does not prune revisions automatically" | project-configuration.md:14 | RC-66 (0) | | | | | key; default |
| PC-07 | "`config.statuses` (optional): Array of status strings available as options for all resources in the project." | project-configuration.md:15 | RC-74 (0) | | | | | key |
| PC-08 | "`config.subtypes` (optional): Your list of document subtypes (for example Scene or Chapter), in the order you set. Manage it in Project Settings, Metadata tab" | project-configuration.md:16 | RC-16 (1) NYR | | | | | key; PR #260; the "See Resource subtype" link goes outside the handbook (FR-5) |
| PC-09 | "`config.features` (optional): Per-project toggles ... `timeline`, `pov`, `synopsis`, `notes`, `timelineView`, `entities`, and `entityHighlighting` (each a boolean; an absent flag means off)." | project-configuration.md:17 | RC-69 (0) | | | | | keys |
| PC-10 | "These are normally set through the app — the Built-in features section of the Metadata tab and Project Settings' Timeline tab" | project-configuration.md:17 | RC-40 (0) | | | | | |
| PC-11 | "the Timeline view requires `timeline`, so `timelineView: true` forces `timeline: true`" | project-configuration.md:17 | RC-40 (0) | | | | | |
| PC-12 | "`entityHighlighting`'s toggle is only shown once `entities` is on, and highlighting has no effect without it" | project-configuration.md:17 | RC-69 (0) | | | | | |
| PC-13 | "`config.organizerCardBody` (optional) ... `{ \"source\": \"none\" }`, `{ \"source\": \"text-excerpt\", \"excerptLength\": 200 }`, or `{ \"source\": \"field\", \"fieldKey\": \"<metadata key>\" }`. Set this from Project Settings' Organizer tab." | project-configuration.md:18 | RC-40 (0) | | | | | key; JSON shapes |
| PC-14 | "`config.dailyWordGoal` (optional): ... a whole number of words (0 or more). Set it in Project Settings ('Daily word goal') ...; clear the field to remove it." | project-configuration.md:20 | RC-05 (1) NYR | | | | | key; PR #236 |
| PC-15 | "It is separate from any total word-count goal." | project-configuration.md:20 | RC-06 (1) NYR | | | | | |
| PC-16 | "`config.wordCountGoal` (optional): A total word-count goal for the whole project, a whole number of words (0 or more). ... Project Settings, Writing Goals tab, ... field below 'Daily word goal', labeled 'Total word-count goal'. Leave the field empty to clear the goal." | project-configuration.md:21 | RC-07 (1) NYR | | | | | key; PR #238 |
| PC-17 | "Progress toward it is never shown in red." | project-configuration.md:21 | RC-06 (1) NYR | | | | | |
| PC-18 | "Reopening Project Settings right after saving, before reloading the project, can show the value it had before the save ...; the save itself has already reached disk." | project-configuration.md:21 | RC-07 (1) NYR | | | | | candidate warning (FR-14) |
| PC-19 | "Per-resource word-count goal (not a `project.json` field ...): any text resource can have its own optional word-count goal, set from that resource's own sidebar in a 'Word count goal' section. Leave the field blank to clear it." | project-configuration.md:22 | RC-08 (1) NYR | | | | | PR #238 |
| PC-20 | "When a goal is set, a progress bar appears in that same section — also never shown in red." | project-configuration.md:22 | RC-08 (1) NYR | | | | | |
| PC-21 | "It has no project-wide total and does not appear in the Data view or any 'By status' breakdown; it only tracks that one resource." | project-configuration.md:22 | RC-08 (1) NYR | | | | | |
| PC-22 | "`config.customNoiseWords` (optional): This project's own list of words that should always be flagged as noise-prone when they appear as an entity's name or alias (on top of the bundled common-word list). Manage it from Project Settings → Noise Words" | project-configuration.md:23 | RC-28 (1) NYR | | | | | key; PR #256 |
| PC-23 | "`config.excludedGlobalNoiseWords` (optional): Specific words from the cross-project global noise-word list (managed in the standalone App Settings dialog, not Project Settings) that this project opts out of flagging. Also managed from Project Settings → Noise Words." | project-configuration.md:24 | RC-28 (1) NYR | | | | | key; PR #256 |
| PC-24 | "Example with custom statuses" JSON (`name` 'My Novel', `maxRevisions` 100, `config.statuses` ['Outline','First Draft','Revised','Final']) | project-configuration.md:26-34 | - | | | | | example; the file must load |
| PC-25 | "Minimal: { name 'My Novel', maxRevisions 50 }" | project-configuration.md:38-42 | - | | | | | example; the file must load |
| PC-26 | "Recommended for writers: name, description, maxRevisions 200, autoPrune true" | project-configuration.md:44-53 | - | | | | | example; "recommended" is an opinion |
| PC-27 | "After changing `project.json`, re-open the project in the app or restart the app so the loader picks up changes." | project-configuration.md:57 | - | | | | | |
| PC-28 | "Changing `maxRevisions` in `project.json` does not currently change how many revisions are kept; use `getwrite prune --max <n>`" | project-configuration.md:58 | RC-66 (0) | | | | | CLI |
| PC-29 | "If you run into unexpected behavior after editing `project.json`, check the app logs for schema validation errors; the loader validates configuration at runtime." | project-configuration.md:59 | - | | | | | log location is not named; desktop logs are under the forbidden path |
| PC-30 | "Some advanced features (indexing, previews) have additional toggle flags under `meta` in `project.json`." | project-configuration.md:63 | - | | | | | key |
| PC-31 | "consult your development team or the developer docs at `docs/features/project-configuration.md`" | project-configuration.md:63 | - | | | | | link out of the handbook; dropped under FR-5 |
| PC-32 | "Tags: Project-scoped tags (`config.tags` and `config.tagAssignments`) are managed through the Tags UI in the app." | project-configuration.md:64 | RC-58 (0) | | | | | keys |
| PC-33 | "Editing them directly in `project.json` is possible but not recommended" | project-configuration.md:64 | - | | | | | |
| PC-34 | "For CLI or scripting, treat `project.json` as a plain JSON file. Use `jq` or your editor to modify values." | project-configuration.md:68 | - | | | | | |

### features.md, not carried (statements that duplicate another page, or that are features-only or contradict)

Disposition key: `dup:<old page>` = same claim on the named page; `features-only -> <handbook page>`; `contradicts <old page>`; `intro`/`editor` rows are in the sections above. Sharing section: excluded (FR-9), no rows.

| ID | Statement | Old page:line | Release | Disposition | Outcome | Note |
| --- | --- | --- | --- | --- | --- | --- |
| F-12 | Projects section: "Project types: ... types for novels, serialized fiction, articles, game writing, and poetry/lyrics, plus a blank option... You can also create and edit your own types." | features.md:15 | RC-63 (0) | dup:project-types.md | | |
| F-13 | Resource tree: "browse, create, rename, and reorganize. Drag and drop to reorder; the order you choose is the order your work appears everywhere else, so the structure you see always matches the structure in your head." | features.md:21 | - | dup:resource-tree.md | | last clause ("matches the structure in your head") not on another page |
| F-14 | Start page: "shows all your projects at a glance, along with totals ... jump into a project, or create, rename, delete, and compile projects without digging through menus." | features.md:27 | - | dup:start-page.md | | |
| F-15 | Start page: "On desktop, you can also import an existing Scrivener 3 project or a Word document (or folder of them)" | features.md:27 | RC-56 (0) | dup:start-page.md | | desktop-only |
| F-16 | Daily writing log and goal: "keeps a per-project record of the words you add and delete each day, and shows today's figure in a 'Today's writing' control in the editor footer" | features.md:43 | RC-02 (1) NYR | dup:writing-log.md | | |
| F-17 | Headings: "Headings are styled per project ... customize the size, font, weight, spacing, and color of each heading level" | features.md:47 | RC-62 (0) | dup:editor/headings.md | | |
| F-18 | Headings: "The writing surface itself is tuned for long-form comfort, with generous line spacing that never drops below a readable minimum." | features.md:47 | - | dup:editor/settings.md | | |
| F-19 | Search: "Find any document by name and jump straight to it with Cmd/Ctrl+K" | features.md:53 | RC-54 (0) | dup:search.md | | |
| F-20 | Metadata: "a synopsis, notes, workflow status, point-of-view character, story dates, and any custom fields" | features.md:61 | - | dup:metadata.md | | |
| F-21 | Metadata: "Edited from a collapsible sidebar" | features.md:61 | - | features-only -> story/metadata.md | | "collapsible" is not on metadata.md |
| F-22 | Metadata: "it powers higher-level views of your project" | features.md:61 | - | features-only | | framing; not checkable; not carried |
| F-23 | Tags: "Project-scoped tags let you label documents ... Assign tags from the metadata sidebar." | features.md:67 | RC-58 (0) | dup:metadata.md | | quoted tag examples are illustrations |
| F-24 | Metadata providers: "Folders can act as metadata providers (Characters, Locations, Items, and the like), letting you link documents to the people, places, and things" | features.md:73 | - | dup:metadata.md | | |
| F-25 | Metadata queries: "build a filter from simple chips ... GetWrite gathers every matching document" | features.md:79 | RC-59 (0) | dup:metadata-queries.md | | |
| F-26 | Metadata queries: "filter on your own fields and on built-in attributes like word count, dates, tags, and which documents link to which" | features.md:79 | RC-73 (0) | dup:metadata-queries.md | | |
| F-27 | Metadata queries: "Save a query as a smart folder and it becomes a living collection that always reflects what currently matches" | features.md:79 | RC-60 (0) | dup:metadata-queries.md | | |
| F-28 | Organizer: "cards — text previews, image thumbnails, and inline audio players — in the same order as your resource tree" | features.md:89 | RC-39 (0) | dup:views/organizer.md | | |
| F-29 | Organizer: "Flip cards to show their notes instead of their contents." | features.md:89 | - | features-only -> views/organizer.md | | not on views/organizer.md; the page describes a header toggle for the card body instead |
| F-30 | Organizer: "Drag a card by its grip handle to reorder it (keyboard-operable too, with a screen-reader announcement on completion) — reordering here also reorders the resource tree, and is disabled while a filter narrows the grid." | features.md:89 | RC-45 (1) NYR | dup:views/organizer.md | | |
| F-31 | Organizer: "Filter the visible cards by status, word count, or any resource-reference field ... filters combine, and clear individually or all at once." | features.md:89 | RC-41 (1) NYR | dup:views/organizer.md | | |
| F-32 | Data view: "how many documents it holds, its total word count, and what you've edited recently" | features.md:95 | RC-53 (0) | dup:views/data.md | | |
| F-33 | Data view: "A 'By status' section breaks resources and words down by status." | features.md:95 | RC-11 (1) NYR | dup:views/data.md | | |
| F-34 | Diff view: "compares two versions of a document and shows exactly what was added, removed, or changed" | features.md:101 | RC-52 (0) | dup:views/diff.md | | |
| F-35 | Timeline view: "places dated scenes along a story-time axis" | features.md:107 | RC-46 (0) | dup:views/timeline.md | | |
| F-36 | Timeline view: "Zoom from minutes to decades" | features.md:107 | RC-46 (0) | features-only -> views/timeline.md | | "decades" is not on views/timeline.md, which names a 1x to 10x range and hour:minute labels |
| F-37 | Timeline view: "color-code by point of view, and spot unintended time jumps at a glance" | features.md:107 | RC-46 (0) | dup:views/timeline.md | | |
| F-38 | Timeline view: "Set a scene's story date in its metadata and it appears here automatically." | features.md:107 | RC-46 (0) | dup:views/timeline.md | | |
| F-39 | Entities view: "lists every entity you've declared ... name, kind, aliases, mention count, and a flag for a name or alias that needs attention (claimed by more than one entity, or risky because it also reads as an ordinary word)" | features.md:113 | RC-24 (1) NYR | dup:views/entity-roster.md | | |
| F-40 | Entities view: "Click a row to jump to that entity's document." | features.md:113 | RC-30 (0) | dup:views/entity-roster.md | | |
| F-41 | Relationship Graph: "connected by two kinds of edges: dashed lines ... and solid arrows" | features.md:119 | RC-33 (0) | contradicts views/entity-relationship-graph.md (which says up to five kinds) | | not carried |
| F-42 | Relationship Graph: "Click a node to jump straight to that entity's document." | features.md:119 | RC-31 (0) | dup:views/entity-relationship-graph.md | | |
| F-43 | Revisions: "Every document keeps a history of revisions — saved snapshots you can look back at and restore. The newest is the active version" | features.md:127 | RC-23 (0) | dup:revisions.md | | |
| F-44 | Revisions: "you can mark milestones to protect them permanently" | features.md:127 | RC-22 (1) NYR | dup:revisions.md | | |
| F-45 | Revisions: "GetWrite quietly trims old history so it never piles up." | features.md:127 | - | contradicts revisions.md (RV-20) | | not carried; causal and promissory; Task 7 records what is observed |
| F-46 | Revisions: "Your drafts are never lost to a stray edit." | features.md:127 | - | features-only | | absolute claim; not carried |
| F-47 | Resource types: "A resource can be a text document, an image, or an audio file" | features.md:133 | - | dup:resources.md | | |
| F-48 | Resource types: "Images show resolution and EXIF details, audio gets a play/scrub widget with duration, and folders group it all together." | features.md:133 | - | dup:resources.md | | |
| F-49 | Compiling projects: "compile a project — from the start screen or from within the project — to pull your work together into a single output" | features.md:139 | RC-71 (0) | dup:compiling.md | | |
| F-50 | Configuring a project: "customize the status options your documents move through, choose how much revision history to keep, and set per-project preferences like color mode" | features.md:145 | - | statuses and color mode dup:metadata.md/project-configuration.md; "choose how much revision history to keep" contradicts project-configuration.md (PC-05, PC-06) | | not carried |

## 7. "Not yet in a release" table (FR-9, FR-11)

Starting list for Features 84 and 85. Entries are the sections of the old pages whose statements the release check found to come from commits that are not ancestors of `getwrite-v2.2.0` (exit status 1). Tasks 3 to 8 keep this table in step with the note `Not yet in a release (merged after 2.2.0).` on the handbook pages: one entry per note, one note per entry. Entries below name the destination page; "statements" lists the inventory row IDs.

| # | Handbook page | Section (old page section) | Statements (row IDs) | Introducing commit or PR | Ancestor-of-tag result |
| ---: | --- | --- | --- | --- | --- |
| 1 | `organize/start-page.md` | Working with projects, "App Settings" bullet | S-14, S-15, S-16 | `7390ac8a5`, `365bbda00` / #256 | exit 1 (RC-25, RC-26) |
| 2 | `write/writing-log.md` | The footer display | W-01 to W-16 | `b294ce3ee`, `7551ebb58`, `7c2b5f43f` / #236 | exit 1 (RC-01, RC-02, RC-03) |
| 3 | `write/writing-log.md` | Setting a daily goal | W-17 to W-20 | `4fce8fe11`, `9c488c9d8` / #236 | exit 1 (RC-04, RC-05) |
| 4 | `write/writing-log.md` | Total and per-resource word-count goals | W-21 to W-26 | `e57412b3f`, `6537acb10`, `28a94c7c8` / #238 | exit 1 (RC-06, RC-07, RC-08) |
| 5 | `write/writing-log.md` | What is counted | W-27 to W-38 | `b294ce3ee` / #236; plain-text import `308600138` / #247 | exit 1 (RC-01, RC-15) |
| 6 | `write/writing-log.md` | If a save could not be counted | W-39, W-40 | `b294ce3ee` / #236 | exit 1 (RC-01) |
| 7 | `write/writing-log.md` | Where it is stored | W-41 to W-45 | `b294ce3ee` / #236 | exit 1 (RC-01) |
| 8 | `story/metadata.md` | Subtypes: showing a field only where it belongs | M-26 to M-47 | `e4e250f2b`, `26d4b0824`, `8911d2d4b`, `6ca785beb` / #260; `07d838fc4` / #261 | exit 1 (RC-16 to RC-20) |
| 9 | `story/metadata.md` | Prose diagnostics | M-48 to M-57 | `0dd6d2462`, `3db4255dd`, `3057873b9` / #240 | exit 1 (RC-12, RC-13, RC-14) |
| 10 | `views/organizer.md` | Filtering | O-10 to O-17 | `e9c66aa1`, `9ebc46d2`, `7d0554535`, `39da2d11e` / #249 | exit 1 (RC-41 to RC-44) |
| 11 | `views/organizer.md` | Reordering cards | O-18 to O-22 | `e8432687` / #251 | exit 1 (RC-45) |
| 12 | `views/data.md` | By status | D-06 to D-16 | `7ef350e78`, `107952b18` / #237 | exit 1 (RC-10, RC-11) |
| 13 | `views/entity-roster.md` | What it shows ("Needs attention" noise-word and Dismiss parts) | ER-08, ER-09, ER-10 | `aac3e724e`, `6ada2cd67` / #256 | exit 1 (RC-24, RC-28) |
| 14 | `views/entity-relationship-graph.md` | What it shows (five connection types) | G-03, G-07 to G-10 | `cdc24490a` / #253 | exit 1 (RC-34) |
| 15 | `views/entity-relationship-graph.md` | Choosing your connections | G-11, G-12 | `85b27533` / #253 | exit 1 (RC-36) |
| 16 | `views/entity-relationship-graph.md` | Getting around (saved positions, focal-point gesture) | G-19, G-22, G-23, G-24 | `491de176b`, `6d0cbe967` / #253 | exit 1 (RC-38, RC-35) |
| 17 | `views/entity-relationship-graph.md` | Focusing on one entity | G-25 to G-30 | `13f1017e`, `85b27533` / #253 | exit 1 (RC-37, RC-36) |
| 18 | `protect-and-finish/revisions.md` | Naming revisions (protect/unprotect sentence) | RV-13 | `1c8687605` / #233 | exit 1 (RC-22) |
| 19 | `protect-and-finish/revisions.md` | Protecting milestone revisions | RV-14 to RV-19 | `1c8687605` / #233 | exit 1 (RC-22) |
| 20 | `protect-and-finish/revisions.md` | How old revisions are cleaned up (protected revisions and the cap) | RV-24 to RV-27 | `c0c60902` / #233 | exit 1 (RC-76) |
| 21 | `protect-and-finish/project-configuration.md` | `config.subtypes` | PC-08 | `e4e250f2b` / #260 | exit 1 (RC-16) |
| 22 | `protect-and-finish/project-configuration.md` | `config.dailyWordGoal` | PC-14, PC-15 | `9c488c9d8` / #236 | exit 1 (RC-05) |
| 23 | `protect-and-finish/project-configuration.md` | `config.wordCountGoal` and per-resource word-count goal | PC-16 to PC-21 | `e57412b3f`, `6537acb10`, `28a94c7c8` / #238 | exit 1 (RC-06, RC-07, RC-08) |
| 24 | `protect-and-finish/project-configuration.md` | `config.customNoiseWords`, `config.excludedGlobalNoiseWords` | PC-22, PC-23 | `6ada2cd67` / #256 | exit 1 (RC-28) |

The count of entries is 24. Statements in the inventory with release exit 0 are not entered. Release rows with `-` name no feature the probes cover; Tasks 3 to 8 may enter a further row here if a run shows a statement came from a post-tag change, and they must update this table when they do.

Features the spec's PR list names that no old-page statement depends on: #252 (editor context menu), #257 (mention navigation), #253/#255 beyond the rows above, #259, #262 (repair-revisions, not on any old page), #263 to #268 (sharing and related, excluded under FR-9).

## 8. Summary for Tasks 3 to 8

- Rows per old page and the total: see section 3.
- Statements with no verification possible by the two FR-15 methods that the inventory already flags: installing steps (downloads, Gatekeeper, SmartScreen, Rosetta), signing and "planned" promises, the Android sentence, phone and touch gestures, native file pickers, the Scrivener and Word import buttons (desktop method only), the global noise words on desktop. They remain rows; Tasks 3 to 8 decide `dropped` with the reason.
- Contradictions between old pages found while inventorying (recorded as facts about the text, nothing decided): `features.md` ("quietly trims old history", "choose how much revision history to keep") against `revisions.md` and `project-configuration.md` ("does not prune revisions on its own", "no setting for a revision limit"); `features.md` ("two kinds of edges") against `views/entity-relationship-graph.md` ("up to five kinds").
- Pages that name commands: `revisions.md` (`getwrite prune`), `project-configuration.md` (`getwrite prune --max <n>`), `writing-log.md` (`reindex`). No old page mentions `repair-revisions`.
