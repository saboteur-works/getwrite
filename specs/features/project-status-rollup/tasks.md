# Tasks: Project status roll-up

Source spec: `specs/features/project-status-rollup.md`. Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.md` FR-46, FR-50, US-19; `specs/product/getwrite.features.md` Feature 60. Client-side only (OQ-8): no route, core, native backend, web-stub or response schema, so no task adds one.

### Task 1: Pure status roll-up derivation (FR-1, FR-2, FR-3, FR-9, FR-10, FR-11, FR-12, FR-13)
**What:** Add a pure function taking resources and `config.statuses` and returning rows `{ label, kind: "configured" | "unknown" | "unset", resourceCount, words }` over text resources only.
**Files:** frontend/src/lib/status-rollup.ts (new), frontend/tests/unit/status-rollup.test.ts (new)
**Done when:** tests written first confirm: rows come out in `config.statuses` order, then unknown values (labelled as not in the current list, kind `unknown`), then one `unset` row labelled "No status" that is always last and present with count 0 when nothing is unset; words use `userMetadata.wordCount ?? wordCount ?? 0` (same source as `DataView.getWordCount`; a missing count adds 0); only `userMetadata.status` is read and `resource.statuses` is ignored (a resource with only `statuses: ["x"]` counts as unset); non-text resources (image/audio/folder-like) are excluded from both count and words; `config.statuses = []` returns only unset plus any unknown rows; an empty resource list returns configured rows and the unset row all at 0/0; a configured status with no resources appears with 0/0; the sum of row counts equals the number of text resources; the module imports no fs, React or store; `pnpm typecheck` clean.
**Depends on:** none
**Estimate:** 3
**Notes:** Reason: one pure function, about eight small cases, no I/O. Export a `getResourceWordCount`-style helper only if it can be shared with `DataView` without editing its existing tests; otherwise duplicate the one-line read and pin equality in a test against the same fixtures. Do not touch DataView here. A status that is absent or not a string is unset; that is all. Blank (empty or whitespace) statuses are not expected (user decision, Gate 4, 2026-09-26), so this task does not special-case them and has no test for them. Whether anything prevents a blank status from being written is unverified; a POS note titled 'Blank status values: not verified impossible' tracks verifying that nothing can write them. Amended at Gate 4 by the user, 2026-09-26.
**Done:** [ ]

### Task 2: Retired: not needed, resolved by OQ-11
**What:** Retired: not needed, resolved by OQ-11. No load-state signal is added; loading and load failure are unreachable in `DataView` (see the source spec's OQ-11).
**Files:** none
**Done when:** Retired; nothing to do.
**Depends on:** none
**Estimate:** 0
**Notes:** Id kept so numbering stays stable. Resolved at Gate 3 by the user ("take your recs"), 2026-09-26. Supersedes the loading/error part of OQ-9/FR-16, as the user acknowledged by accepting the recommendation. FR-5 and FR-6 hold because the roll-up only ever sees a successfully loaded project.
**Done:** [x] (retired)

### Task 3: "By status" CollapsibleSection in DataView (FR-1, FR-5, FR-6, FR-7, FR-13, FR-14, FR-15, FR-16)
**What:** Render the roll-up as a `CollapsibleSection` titled "By status" between Overview and Breakdown, with the empty state, the no-statuses-configured hint and the stale-note line. No loading or error branches (OQ-11).
**Files:** frontend/components/WorkArea/StatusRollup.tsx (new), frontend/components/WorkArea/DataView.tsx, frontend/tests/dataView.test.tsx (add cases; no existing case edited), frontend/tests/statusRollup.test.tsx (new)
**Done when:** tests written first confirm: DataView renders a section titled "By status" positioned after the Overview and before Breakdown; rows show label, resource count and words together, using a real `<table>` with `<th scope>` headers (or an equivalent list, fixed by reading `docs/standards/accessibility.md` first) so count and words are announced per status; the "No status" row is last; an unknown row's label says it is not in the current list as text, not colour alone; the working-copy line "Word totals may read low for resources with older plain-text revisions." is always visible; the section states it counts "text resources" and that its total may differ from the Overview total; a project with no text resources shows a neutral "no resources yet" (no zero table); no loading or error state is rendered and none is tested; with `config.statuses` empty a hint that no statuses are configured shows alongside the No status row; no class in the new component uses red tokens; existing dataView tests pass unmodified; `pnpm typecheck` and `pnpm lint` clean.
**Depends on:** 1
**Estimate:** 5
**Notes:** Read `DataView.tsx` and `CollapsibleSection.tsx` props before coding (`title`, `children`, `defaultOpen`, `variant`, `actions`, `onToggle`); the section id derives from the slugified title, so "By status" must not collide with an existing title. Copy strings are working copy for the user to confirm; keep them in one constants object so a wording change is one edit. Reason for 5: new component with its empty and no-statuses states plus a11y structure, edits the largest work-area view.
**Done:** [ ]

### Task 4: Feed the roll-up the FULL resource list, not the smart-folder-narrowed one (FR-17)
**What:** Give DataView a separate prop for the full project resource list, and pass `liveResources` from AppShell, while `resources` stays the narrowed `queryResources`.
**Files:** frontend/components/WorkArea/DataView.tsx, frontend/components/Layout/AppShell.tsx (:276, :1316-1320, :1375), frontend/tests/dataView.test.tsx, frontend/tests/appShellStatusRollupSmartFolder.test.tsx (new)
**Done when:** tests written first and observed failing, then passing: given `resources` (narrowed) differing from the new full-list prop, the roll-up counts follow the full list while the Overview and Resources list still follow `resources`; through AppShell with a smart folder active, the "By status" numbers are identical before and after selecting the smart folder, while the Overview "Resources" total changes; when the full-list prop is omitted the roll-up falls back so existing DataView callers and stories still render; existing tests pass unmodified.
**Depends on:** 3
**Estimate:** 3
**Notes:** Read AppShell.tsx and DataView props first; do not guess prop names. Task order differs from the brief's (b)/(c) listing because the smart-folder test needs the section to exist. Model the AppShell test on `tests/appShellEntityRosterGating.test.tsx`. Reason: two files of plumbing plus one integration test.
**Done:** [ ]

### Task 5: Storybook stories and axe a11y test for the section states (FR-7, FR-16)
**What:** Add stories for empty, populated, off-list and no-statuses-configured states and an axe test over them.
**Files:** frontend/stories/WorkArea/DataView.stories.tsx (existing; extend, or add a new StatusRollup stories file), frontend/tests/a11y/statusRollup.a11y.test.tsx (new)
**Done when:** each of the four states has a story that renders without console errors; the axe test (via `frontend/tests/a11y/helpers/axe.ts`) reports zero violations for each state, including a populated table; stories set `parameters: { a11y: { test: "error" } }` per `docs/standards/storybook-implementation.md`; a check confirms no story or test asserts a colour-only cue.
**Depends on:** 3
**Estimate:** 3
**Notes:** DataView stories already exist at stories/WorkArea/DataView.stories.tsx:56 and :313 (they render DataView directly with args); extend them or add a new file. Read `stories/WorkArea/DataView.stories.tsx` and `tests/a11y/collapsiblesection.a11y.test.tsx` for conventions. Story test execution needs Storybook and runs outside the sandbox (Task 8).
**Done:** [ ]

### Task 6: Wiring-level test through AppShell/DataView with mixed statuses (FR-1, FR-9, FR-10, FR-11, FR-12, FR-13, FR-17)
**What:** Add an integration test mounting AppShell with a project whose resources carry mixed statuses and asserting the rendered roll-up.
**Files:** frontend/tests/appShellStatusRollup.test.tsx (new)
**Done when:** with a project config of `["Draft", "Revised", "Final"]` and resources including configured statuses, an off-list status, no status, an image resource, a resource with only legacy `statuses`, and a stub-sized resource, the rendered section shows the exact expected count and words per row in order (configured, unknown, No status), excludes the image and legacy-only resource from configured rows, and the visible sum of row counts equals the number of text resources; changing a resource's status via the real sidebar StatusSelector path moves it between rows; an empty-statuses project shows the hint; all assertions read rendered text and roles, not internal state.
**Depends on:** 4
**Estimate:** 3
**Notes:** Lesson from Feature 59: unit tests alone missed real-app defects. The lead also exercises the running app; this test does not replace that. If the StatusSelector path is impractical to drive in jsdom, dispatch the same store update `handleChangeStatus` produces and say so in Notes.
**Done:** [ ]

### Task 7: Documentation (FR-3, FR-13, FR-15)
**What:** Document the roll-up for users and maintainers and update the project glossary and code map if needed.
**Files:** docs/user/views/data.md (existing Data view user page; docs/user/features.md also mentions the Data view and may need a one-line pointer), docs/features/status-rollup.md (new; developer doc), CLAUDE.md (Glossary entry "Status roll-up"; Code Map only if a new model file is listed there)
**Done when:** the user doc states what each row means, that only text resources count, that the total may differ from Overview, the "No status" and off-list rows, the stale-word-count caveat, and that it does not follow smart-folder selection; the feature doc names `status-rollup.ts`, the client-side-only decision (no transport, FR-50 not applicable) and that `resource.statuses` is not counted; the CLAUDE.md glossary entry exists and states the out-of-scope observation that the query intrinsic `statuses` and the sidebar `status` are disjoint; a grep of docs/ and CLAUDE.md for the section title and file name finds each mention consistent with the shipped copy; `pnpm knip` unaffected by doc edits.
**Depends on:** 4
**Estimate:** 2
**Notes:** Wording of the stale note is a working copy until the user confirms; docs must match whatever ships. Developer doc location, verified by reading docs/features/ and docs/features/data/: existing files cover data types, metadata, projects, sidecars, indexing, previews, revisions, tags, writing-log and CLI, and a grep of them finds no page documenting DataView or work-area views; docs/features/data/metadata.md documents the `status` field and `config.statuses` but is a data-model page, so a new docs/features/status-rollup.md is used and may link to it. Amended at Gate 4 by the user, 2026-09-26 (paths).
**Done:** [ ]

### Task 8: Final gate (all FRs)
**What:** Run the full verification against baselines and record the results.
**Files:** none (results recorded in this task's Notes)
**Done when:** `pnpm typecheck`, `pnpm lint` and `pnpm test:ci` pass; the test baseline is re-measured at the start (recorded at main 35c9af9c as 464 files, 4358 passed, 1 skipped) and the new run shows only added files and tests with no regressions or newly skipped tests; `pnpm knip` reports no more than the baseline of 47 unused files (re-measured first) and no new unused exports from `status-rollup.ts`; `pnpm build` succeeds; the Storybook story test for the new states passes when run outside the sandbox; a grep confirms no route, native backend or web-stub was added for the roll-up; the lead exercises the running app (mixed statuses, smart-folder selection, the empty state, the no-statuses hint) before merge.
**Depends on:** 5, 6, 7
**Estimate:** 2
**Notes:** Storybook and its Playwright runner fail inside the Bash sandbox; retry outside before filing a bug.
**Done:** [ ]

### Task 9: Pass the project's configured statuses to the roll-up (FR-9, FR-10, FR-11, FR-12, FR-16)
**What:** Make the By-status roll-up receive the project's configured statuses. Measured by the exercise agent in a disposable workspace at branch 4718752f (cause not yet confirmed by a fix): for a Novel project whose project.json has `config.statuses = [Outline, Draft, Revised, Polished]`, the Data view By-status section always showed the no-statuses hint and listed every status assigned via the sidebar as "<name> (not in the current list)"; this held on first open, after reload and after reopening. `GET /api/projects` returned the statuses and the sidebar selector listed all four. The query builder's Status value dropdown offered only "select..." (observed, not investigated). Read by the lead, not run: `DataView.tsx:182` passes `statuses={project?.config?.statuses ?? []}` to `StatusRollup`; `AppShell.tsx` (~:1377) passes `project={project ?? undefined}`; the page's project shape (`app/(app)/page.tsx:99-101`) types `config?: { wordCountGoal?: number; dailyWordGoal?: number }` and builds it at :269 and :319 without `statuses`; the statuses exist in Redux (`src/store/projectsSlice.ts:138`, `statuses: project.config?.statuses ?? []`). Hypothesis, unconfirmed: the list is dropped at the page/AppShell to DataView boundary. The implementor chooses the smallest mechanism consistent with existing patterns (for example reading statuses from the Redux project via an existing selector in AppShell and passing them to DataView, or widening the page's config shape) and records the choice and why in Notes. Also check every other reader of `project.config` in DataView and other views for the same loss and report; fix only what is needed here.
**Files:** frontend/components/Layout/AppShell.tsx, frontend/components/WorkArea/DataView.tsx, frontend/app/(app)/page.tsx (only if the page shape is widened), tests (frontend/tests/appShellStatusRollup.test.tsx extended; a new failing-first test as below)
**Done when:** a test written first FAILS on current code (observe and record the failure in Notes) and passes after: through AppShell (and/or a page-shaped project) with a project built the way `page.tsx` builds it (its `config` lacks `statuses`) while the Redux store carries statuses [Draft, Revised], the By-status rows are "Draft" and "Revised" as configured rows (not "(not in the current list)") and no no-statuses hint is shown; a project with genuinely empty statuses still shows the hint; Task 6's wiring test is extended (not weakened) to use the page-shaped project; no existing test is edited except where this task states, and every edit is listed in Notes (HALT if another existing test contradicts); `pnpm typecheck`, `pnpm lint`, full `pnpm test:ci` and `pnpm knip` (baseline 47) clean. Verification for the lead afterwards: re-exercise the running app with the Novel project.
**Depends on:** 3, 4, 6
**Estimate:** 3
**Notes:** Reason for 3: a small plumbing fix in two or three files, but the failing-first test must build a page-shaped project and drive AppShell with a seeded store, and the audit of other `project.config` readers adds reading. Why earlier tests missed it (hypothesis, verify by reading the tests): the DataView and Task 6 wiring tests hand the component a project that already has `config.statuses` filled in, so the page-shaped project was never exercised (the same class of miss as Feature 59 Task 16). Recorded by the lead as observations, not part of this task, causes untested: the word-count jump (14 to 24 total words on the same project after a reload with no edits) and the blank-status row behaviour. Implementor records here: the mechanism chosen and why, the observed failure of the first test, the list of edited existing tests, and the audit of other `project.config` readers.
**Done:** [ ]

## Summary
- Total tasks: 9
- Total estimated effort: 24 points (1: 3, 2: 0, 3: 5, 4: 3, 5: 3, 6: 3, 7: 2, 8: 2, 9: 3)
- Active tasks: 8 (Task 2 retired in place, estimate 0)
- Critical path: 1 -> 3 -> 4 -> 6 -> 9 (3 + 5 + 3 + 3 + 3 = 17 points); Task 8 then re-runs as the closing gate (see Parallelism)
- Risks: Task 3 edits the largest work-area view and must not disturb existing dataView tests. Task 4 is the trap named in FR-17: passing `queryResources` would silently make the roll-up follow smart folders. The unreachability of loading/failure in DataView (OQ-11) is high confidence on the production path (static-import grep: DataView mounts only from AppShell.tsx:1375; AppShell only from app/(app)/page.tsx:913); residual limits are that dynamic or lazy imports and test files were not checked, and that Storybook stories (DataView.stories.tsx:56, :313; AppShell.stories.tsx:22; AppShellAfterOpen.stories.tsx:216) can render DataView with any props, which is not a production concern. Amended at Gate 4 by the user, 2026-09-26. Copy strings are working copy pending user confirmation.
- Note: the uncaught rejection from the Start page's Open button (`page.tsx:936`, `StartPage.tsx:863`) is out of scope by the user's decision; a POS follow-up is filed by the lead. The agent did not read `docs/standards/failure-visibility.md` and read only the `onClick` region of `StartPage.tsx` (medium confidence on exact UX).

## Parallelism
- Task 1 has no dependencies and can start immediately. Task 2 is retired.
- After Task 3: Tasks 4 and 5 can proceed in parallel (both touch DataView tests or stories; sequence if they collide on `dataView.test.tsx`).
- After Task 4: Tasks 6 and 7 can proceed in parallel.
- Task 9 needs 3, 4 and 6 (it extends Task 6's test), so it starts after Task 6 and can run in parallel with Task 7. It is appended after Task 8 and ids are not renumbered, so the schema forbids Task 8 from listing it as a dependency; Task 8 (final gate) must be run after Task 9 is done, not before.

## FR coverage
- FR-1: 1, 3, 6
- FR-2: 1
- FR-3: 1, 3, 7
- FR-4: not applicable (OQ-8); Task 8 checks no transport was added
- FR-5: 3 (holds because the roll-up only sees a loaded project; OQ-11)
- FR-6: 3 (same reason)
- FR-7: 3, 5
- FR-8: 1, 3
- FR-9: 1, 6, 9
- FR-10: 1, 6, 9
- FR-11: 1, 6, 9
- FR-12: 1, 6, 9
- FR-13: 1, 3, 6, 7
- FR-14: 3
- FR-15: 3, 7
- FR-16: 3, 5, 9
- FR-17: 4, 6

## Open Questions

None.

Amended at Gate 4 by the user, 2026-09-26: Task 8 exercise list drops the stale failure state; Task 1 drops the blank-status rule (blank statuses not expected, unverified, POS note tracks it); Task 7 doc paths fixed (docs/user/views/data.md, new docs/features/status-rollup.md); Task 5 notes existing DataView stories; Summary risk line updated to OQ-11 evidence. No ids or estimates changed.
