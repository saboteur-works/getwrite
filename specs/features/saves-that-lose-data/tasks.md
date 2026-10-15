# Tasks: Saves that lose or omit data (Feature 87)

Source spec: `specs/features/saves-that-lose-data.md` (FR-1..FR-28, US-1..US-4). Gate 3 answers of 2026-10-15 are folded in (OQ-1 option 2, conditional on FR-5; OQ-2 keep the loader recount; OQ-3 `/delete` route becomes a thin call to `deleteResourceCore`; OQ-4 one shared helper; OQ-5 leave the swallowed `getSchema` failure; OQ-6 narrow D-26 test only; OQ-7 no `docs/user/` edits; OQ-8 one branch). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 87. Branch: `fix/saves-that-lose-data`, main checkout.

Shape of the work: four independent parts, each starting with its experiment or failing test.
- Part A, D-9 (Tasks 1-2): CONFIRMED, so it starts with the failing tests (FR-4).
- Part B, D-26/D-29 (Tasks 3-7): starts with the FR-5 experiment; halts under FR-6.
- Part C, D-36 with the `/delete` route (Tasks 8-11): starts with the FR-10 experiment; halts under FR-11.
- Part D, D-3/D-39 (Tasks 12-13): starts with the FR-18 failing test; halts under FR-19.
- Task 14: final suites (FR-25).

Experiment results go in `specs/features/saves-that-lose-data/experiments.md`. Experiments state what was measured and name no cause beyond what the experiment separates: a measurement is a fact, a cause is a hypothesis.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tasks run one at a time, sequentially, in the main checkout on branch `fix/saves-that-lose-data`. No worktrees (builds and Storybook only work in the main checkout). Do not switch branches. Implementors do not commit and do not push; the orchestrator commits.
- Before starting any process, run `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` and record the output in the task's notes or in `experiments.md`. Anything on 7340 or 3000 may be the owner's app; leave it alone.
- Never stop a process the task did not start. Record the pid (and descendants) of every process the task starts and stop only those, by pid. Never stop by port or name; never `pkill` or `killall`. Confirm they exited.
- NEVER read, list or write `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite`, `~/Library/Logs/getwrite-electron`, or the repo's `projects/`.
- Never print, log or write credentials, cookies or secrets.
- Logs from out-of-sandbox commands go under `specs/features/saves-that-lose-data/` or `/tmp/getwrite-f87/`, never under the sandbox `$TMPDIR`. Anything that starts Storybook, Playwright, `next dev` or a standalone server, or uses `lsof`/`ps`, runs OUTSIDE the command sandbox; unit suites, typecheck, lint, knip and git run inside.
- No app run is required. If an experiment chooses one, it must use throwaway folders with asserted paths (exit unless `realpath` starts with the throwaway prefix), for example the Feature 81 harness in `specs/features/user-handbook/scripts/` (`web-standalone.mjs`, `lib/safety.mjs`).
- Write no cause that no experiment separated. A statement in `experiments.md`, a test name, a comment or a commit-bound note says what was measured; a cause is written only where an experiment discriminated it from the alternatives.
- Edit no file under `docs/user/`. Add no route, transport module, native backend or feature flag.
- Tests are written first (`docs/standards/testing.md`; tests in `frontend/tests/`, adding to an existing file before creating a new one) and code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions). Run the narrowest relevant vitest file(s) with `pnpm --filter getwrite-frontend exec vitest run <file>`; a fix is not done until the failing test it targets is shown green.
- Halt rule (FR-27): if the first task of a part halts, nothing further in that part runs and the later tasks of that part are left unticked with the halt noted; the other parts continue and the part's halt is reported, not worked around.

### Task 1: D-9 failing tests: flip the native assertion and add HTTP and FR-2/FR-3 cases
**What:** Change the native editor-config test to assert that saved headings survive a body-only save, and add the HTTP route case plus pins for FR-2 and FR-3, all red against current code.
**Files:** Modifies `frontend/tests/unit/native-editor-config-backend.test.ts` (lines ~64-67: replace `expect(bodyResult.editorConfig?.headings).toEqual({})` with an assertion that `h1.fontSize` "42px" saved earlier in the same test survives; update the comment that calls the reset intended), `frontend/tests/unit/project-editor-config-route.test.ts` (new case for `POST /api/project/editor-config` with a body-only save after a headings save; new case that a headings-only save leaves `body` unchanged; new case that an explicit `headings: {}` replaces stored headings).
**Done when:** the flipped native case and the new HTTP body-only case fail with the headings reset to `{}` as the reason (failing output recorded in the task note); the FR-2 case (headings-only save leaves `body`) passes already; the FR-3 case (explicit `{}` replaces) passes already; no other test in either file changes status.
**Depends on:** none
**Estimate:** 2
**Notes:** Satisfies FR-2, FR-3, FR-4. D-9 is CONFIRMED (handbook run `logs/task4/t4-sec2b.txt` showed `headings: {}`; the existing unit test asserts the reset), so no experiment is needed and no halt rule applies to this part. Read `frontend/src/lib/models/editor-config-core.ts` (the `headings` handling and the body branch near lines 106-109) before writing the assertions. Native parity is the same core; no separate native fix.
**Done:** [x]

### Task 2: D-9 fix: preserve stored headings when a save omits the `headings` key
**What:** Make `updateEditorConfigCore` leave `config.editorConfig.headings` unchanged when the request has no `headings` key, and correct the comment above it.
**Files:** Modifies `frontend/src/lib/models/editor-config-core.ts` (only an omitted key is preserved; an explicit value including `{}` is still sanitized and replaces; replace the "Lifted verbatim ... `headings` is always sanitized" comment with one that states the new behaviour).
**Done when:** the tests added or changed in Task 1 all pass; the rest of `native-editor-config-backend.test.ts`, `project-editor-config-route.test.ts` and any other test file mentioning `editor-config` pass (list of files run recorded); `pnpm typecheck` from `frontend/` exits 0.
**Depends on:** 1
**Estimate:** 1
**Notes:** Satisfies FR-1, FR-3, FR-4 (comment), FR-22 (one fix for HTTP and native). Do not change body-key behaviour.
**Done:** [x]

### Task 3: D-26/D-29 experiment: what the Status change sends and what the sidecar stores
**What:** Reproduce D-26 and record the sidecar `wordCount` after typing, the `wordCount` in the payload `updateResource` sends for a Status change, and the sidecar `wordCount` after it, then decide whether the hypothesis is confirmed or the part halts.
**Files:** Creates `specs/features/saves-that-lose-data/experiments.md` (Part B section; creates the file with a short header if absent) and any throwaway experiment test or script under `specs/features/saves-that-lose-data/scripts/` or `frontend/tests/` (a test that observes the stored sidecar through the real `updateSidecarCore` on the memory or a throwaway filesystem adapter rather than a mocked `updateSidecar`). Reads `frontend/app/(app)/page.tsx` (`updateResource`, ~460-525, `applyUpdate`), `frontend/src/lib/models/resource-crud-core.ts` (merge at ~467-469), `frontend/src/lib/models/revision-core.ts` (~479-491 where the canonical save writes `wordCount`), `frontend/tests/page-stale-sidecar-save.test.tsx` (as the model; do not edit it).
**Done when:** `experiments.md` has a Part B section recording (a) the sidecar `wordCount` after the canonical save of 10 words, (b) the `wordCount` value in the payload `updateResource` sends when a Status is chosen, (c) the sidecar `wordCount` after the Status change, each as a quoted observed value with the command or test name that produced it; the section also records by reading whether `updatedAt` is server-derived and client-sent (file and line); the section ends with one of two plain lines: "Hypothesis not disproved: payload carried a stale wordCount and the stored value followed it" (state exactly which of (a)-(c) show this) or "Hypothesis disproved: <what was measured>"; if disproved, the part HALTS per FR-6: Tasks 4-7 are left unticked, no fix is made, and the halt is reported with the measurements. The section names no cause beyond what (a)-(c) separate. The `lsof` output before any process start is recorded.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-5, FR-6. Halt rule: if the experiment shows the payload carries the correct `wordCount` and the stored value is still 0, or any result inconsistent with the hypothesis, stop; do not implement the OQ-1 option 2 fix or any other. Observing the stored value is the point; do not mock `updateSidecar`. Leave `page-stale-sidecar-save.test.tsx` untouched (OQ-6).
**Done:** [x]

### Task 4: D-26 failing tests: a Status choice after a canonical save leaves the stored wordCount
**What:** Add a failing test that a Status choice after a canonical save leaves the stored `wordCount` at the saved value, plus the narrow D-26-named Status-change test.
**Files:** Modifies an existing test file for the sidecar core (for example `frontend/tests/unit/resource-crud-core-*.test.ts`, whichever already covers `updateSidecarCore`) with a case that a client-sent `wordCount` in an update does not overwrite the stored value; adds to an existing page-level test file (not `page-stale-sidecar-save.test.tsx`; a new file only if no suitable one exists) a test named for D-26 covering the Status-change path only, whose description states that the wider stale-save family in `page-stale-sidecar-save.test.tsx` is not closed by it.
**Done when:** the new core test and the D-26 Status-change test are red, with the stored or sent `wordCount` as the failing assertion (output recorded); no existing test changes status; `frontend/tests/page-stale-sidecar-save.test.tsx` has no diff (`git diff --stat` on it is empty).
**Depends on:** 3
**Estimate:** 3
**Notes:** Satisfies FR-7, FR-26. Runs only if Task 3 left the hypothesis not disproved. The test description for the narrow test must not say the family is understood or closed.
**Done:** [x]

### Task 5: D-26 fix: updateSidecarCore ignores client-sent derived keys
**What:** Make `updateSidecarCore` drop `wordCount` (and `updatedAt` only if Task 3 recorded it as server-derived and client-sent) from a client sidecar update before the merge.
**Files:** Modifies `frontend/src/lib/models/resource-crud-core.ts` (before the merge at ~467-469; one named constant listing the ignored derived keys; no other key's merge changes). If `updatedAt` is included, the evidence is already in `experiments.md` from Task 3.
**Done when:** the core test from Task 4 is green; every existing sidecar test passes (`resource-crud-core-*.test.ts`, `page-stale-sidecar-save.test.tsx`, and the Feature 72 `resourceSubtype` overlay tests); file names run recorded; `pnpm typecheck` exits 0; a diff review confirms no key other than the listed derived keys has changed merge behaviour.
**Depends on:** 4
**Estimate:** 2
**Notes:** Satisfies FR-24, FR-28 (server half), FR-22 (shared core covers HTTP and native). The canonical save still writes `wordCount` through its own path (`revision-core.ts`); confirm that path does not go through the ignore.
**Done:** [x]

### Task 6: D-26/D-29 fix: update the page/Redux wordCount from the canonical save so By status agrees without a reload
**What:** Make the page/Redux copy of the resource's `wordCount` follow the canonical save so the Data view's By status figure matches the footer without a reload.
**Files:** Modifies `frontend/app/(app)/page.tsx` and/or the store slice or controller where the canonical autosave result is received (`useCanonicalAutosave.ts` or its caller; TBD by reading where the saved count is available), plus an existing test file for the matching area with a case that after a canonical save of 10 words and a Status choice, `computeStatusRollup` over the Redux resource list (`frontend/src/lib/status-rollup.ts:31`, fed by `AppShell.tsx` `liveResources`) reports the 10 words for that resource without a reload.
**Done when:** the new test is first shown red (output recorded) and then green; the D-26 Status-change test from Task 4 is green; the Status choice leaves the sidecar `wordCount` at the saved value (10 in the handbook scenario) in a test that observes the stored sidecar; the Feature 72 `resourceSubtype` overlay tests and `page-stale-sidecar-save.test.tsx` pass unchanged; `pnpm typecheck` exits 0.
**Depends on:** 5
**Estimate:** 3
**Notes:** Satisfies FR-8, FR-28 (page/Redux half), FR-24. Do not change the `applyUpdate` overlay semantics for `resourceSubtype`. If the saved count is not available at the page, record what was found rather than guessing a route; no new route or transport is allowed.
**Done:** [x]

### Task 7: Pin the loader recount (D-29 part 2 is not a defect)
**What:** Add a test pinning that a sidecar `wordCount` of 777 with an N-word `content.txt` loads as N.
**Files:** Modifies an existing test file for `project-loader.ts` (or the closest existing file; a new file only if none exists). No change to `frontend/src/lib/models/project-loader.ts`.
**Done when:** the test passes against unchanged code, with the sidecar value 777 and a `content.txt` of N words (N not 777) loading as N (output recorded); `git diff --stat -- frontend/src/lib/models/project-loader.ts` is empty.
**Depends on:** 3
**Estimate:** 1
**Notes:** Satisfies FR-9 (OQ-2 resolved to keep the recount, POS task_7f1afd5d). Subject to the Part B halt: if Task 3 halted the part, this task is not run. The handbook sentence at `views/data.md:26` is for the scribe follow-up; do not edit it.
**Done:** [x]

### Task 8: D-36 experiment: is `pov` in the reference-key list for a never-edited schema
**What:** Reproduce D-36 in a project whose `config.metadataSchema` was never edited, repeat after one schema edit, and record `project.json` `config.metadataSchema` and the other resource's `userMetadata.pov` after deletion each time.
**Files:** Appends a Part C section to `specs/features/saves-that-lose-data/experiments.md` (creates the file if absent); throwaway experiment test or script (memory adapter or a throwaway folder with an asserted path). Reads `frontend/src/lib/models/metadata-schema.ts` (`getSchema` ~448), `frontend/src/lib/models/resource-crud-core.ts` (~314-320), `frontend/src/lib/models/trash.ts` (~520-526), `frontend/app/api/resource/[resource-id]/delete/route.ts` (~43).
**Done when:** the Part C section records, for the never-edited project: whether `config.metadataSchema` is present in `project.json`, whether `pov` is in the `resource-ref` key list each site builds (the value observed), and the other resource's `userMetadata.pov` after deleting its target; and the same three observations after one schema edit that persists the schema; each as an observed value with the producing command or test name; the section ends with "Hypothesis not disproved: <which observations>" or "Hypothesis disproved: <what was measured>" and names no cause beyond what the observations separate. If disproved, the part HALTS per FR-11: Tasks 9-11 are left unticked, no different fix is chosen, and the halt is reported. The `lsof` output before any process start is recorded.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-10, FR-11. Halt rule: if `pov` is in the key list and is still not cleared, or it is cleared and the earlier sidecar read was wrong, stop. The sidecar is read from disk, not from Redux. The hypothesis to test is that `getSchema` returns no `resource-ref` keys for a never-edited project.
**Done:** [x]

### Task 9: D-36 failing tests: three delete paths, multi-resource-ref and restore
**What:** Add failing tests that deleting a resource clears the built-in Point of View reference at each of the three sites in a never-edited-schema project, that all three treat `multi-resource-ref` alike, and that restore re-links `pov`.
**Files:** Modifies existing test files: the one covering `deleteResourceCore` (for example `frontend/tests/unit/resource-crud-core-*.test.ts`), the one covering `softDeleteFolder` (`trash` tests), `frontend/tests/unit/resource-delete-route.test.ts` (the `/delete` route), and the restore test file (for `relinkResourceRefs`, `trash.ts:641-710`); includes a case with a schema-edited project to pin unchanged behaviour.
**Done when:** the three never-edited-schema deletion cases fail with `pov` left as `{"id":<id>,"name":"Mara"}` (output recorded), each shown red separately; the schema-edited cases pass already; the restore test for `pov` is recorded as red or green (green is acceptable if the ref record is written, its result recorded) with the reason; a `multi-resource-ref` case exists for each of the three paths; the existing `resource-delete-route.test.ts` and `sharing-limits-routes.test.ts` cases still pass.
**Depends on:** 8
**Estimate:** 3
**Notes:** Satisfies FR-12, FR-13, FR-14, FR-16. Runs only if Task 8 left the hypothesis not disproved. FR-16 expects restore to work from the ref record once deletion records `pov`; the test is what establishes it, so a restore case may only turn green after Task 10.
**Done:** [x]

### Task 10: D-36 fix: one shared helper for reference-field keys used by deleteResourceCore and softDeleteFolder
**What:** Add one helper computing the effective reference-field keys (`DEFAULT_METADATA_SCHEMA` merged with any persisted schema) and use it at the `deleteResourceCore` and `softDeleteFolder` sites.
**Files:** Creates or modifies (TBD by reading; one place only, not inside `getSchema`) a helper, for example in `frontend/src/lib/models/metadata-schema.ts` or `default-metadata-schema.ts`; modifies `frontend/src/lib/models/resource-crud-core.ts` (~314-320) and `frontend/src/lib/models/trash.ts` (~520-526). The swallowed `getSchema` failure `catch` at both sites (~322 and ~529) is left unchanged (OQ-5).
**Done when:** the `deleteResourceCore`, `softDeleteFolder` and restore tests from Task 9 are green; a test shows the helper does not write `project.json` (file unchanged after a read-only call); the Schema Manager and sidebar tests that use `getSchema` pass unchanged; the schema-edited cases pass; `pnpm typecheck` exits 0; the two sites call the helper (grep result recorded, only the helper builds the key list apart from the `/delete` route handled in Task 11).
**Depends on:** 9
**Estimate:** 3
**Notes:** Satisfies FR-13, FR-14, FR-16, FR-17, FR-22 (native uses the same core), FR-23. Keep the `catch { /* Schema unreadable */ }` as-is; the pipeline lead files a POS note about it.
**Done:** [x]

### Task 11: D-36: make the `/delete` route a thin call to deleteResourceCore
**What:** Replace the copy of the delete logic in the `/delete` route with a call to `deleteResourceCore`, keeping its path, `withStorageContext` wrapping, sharing-limits behaviour and response shape.
**Files:** Modifies `frontend/app/api/resource/[resource-id]/delete/route.ts`. No change to `docs/api/openapi.yaml`, `specs/features/paired-device-limits/scripts/verify-limits.mjs` or `electron-limits.mjs`.
**Done when:** the `/delete` route test from Task 9 is green; `resource-delete-route.test.ts` and `sharing-limits-routes.test.ts` pass unchanged; the route's response shape matches the pre-change shape (status codes and body keys compared against the existing tests, comparison recorded); `git diff --stat` shows none of `openapi.yaml`, `verify-limits.mjs`, `electron-limits.mjs`; the route no longer contains its own `resource-ref` filter (grep result recorded).
**Depends on:** 10
**Estimate:** 2
**Notes:** Satisfies FR-13, FR-14, FR-15. The route has no native counterpart (HTTP-only, FR-22). Do not remove the route (OQ-3).
**Done:** [x]

### Task 12: D-3/D-39 failing test: Start Page Package lists one of two
**What:** Add a test that renders `StartPage` with one resource in a folder and one with no `folderId`, opens Manage > Package > Compile Project, and shows the dialog listing one of two; also pin the Start Page resource count.
**Files:** Modifies an existing `StartPage` test file in `frontend/tests/` (a new file only if none exists); reads `frontend/components/Start/StartPage.tsx` (`compileResources` ~309-345; `totalRenderableResources` ~366-370; `resourceList` ~843-844) and `frontend/src/lib/models/project-view-adapter.ts` (~89-93, 123).
**Done when:** the compile-dialog test is red because the dialog lists one of the two resources (output recorded); a second case with a resource whose `folderId` names a missing folder is also recorded red or green with the reason; the resource-count test for the same project expects 2 and its result is recorded (green confirms the reading, red is recorded as a further defect in this feature's scope); no existing test changes status. If the dialog lists both resources and the test cannot be made red, the part HALTS per FR-19: Task 13 is left unticked, the observation is reported, and nothing else is changed.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-18, FR-19, FR-21. The cause stays a reading until the test is red for that reason; write the test's name and any comment as what is observed (dialog lists 1 of 2), not as a cause. No experiment file entry is required, but record the result in `experiments.md` Part D with one line if the part halts.
**Done:** [x]

### Task 13: D-3/D-39 fix: Start Page compile lists and compiles every non-folder resource
**What:** Make `compileResources` in `StartPage.tsx` include resources with no `folderId` and resources whose `folderId` names a missing folder, at the project root of the compile tree.
**Files:** Modifies `frontend/components/Start/StartPage.tsx` (and `frontend/src/lib/models/project-view-adapter.ts` only if the test shows the adapter is the dropping site).
**Done when:** the Task 12 compile-dialog tests are green and the compiled output contains both resources, in a test that asserts the compile input; the in-project Compile Project dialog lists the same set (comparison test or recorded read); the resource-count test still passes; existing StartPage and `project-view-adapter` tests pass unchanged; `pnpm typecheck` exits 0.
**Depends on:** 12
**Estimate:** 2
**Notes:** Satisfies FR-20, FR-22 (shared client code, covers native). Runs only if Task 12 produced a red test.
**Done:** [x]

### Task 14: Final suites (FR-25) and acceptance record
**What:** Run the final suites, record each result as run or not run against the baseline, and record which parts landed or halted.
**Files:** Appends a "Final suites" section to `specs/features/saves-that-lose-data/experiments.md`; no source change.
**Done when:** the section states for each part (A, B, C, D) whether it landed or halted and cites its experiment or failing-test record; `pnpm test:ci`, `pnpm typecheck` and `pnpm lint` from `frontend/` and `pnpm knip` from the repo root are each recorded as run (with counts) or not run, and compared to the baseline: frontend 6468 passed / 1 skipped and lint 0 errors / 395 warnings (Feature 81 figures, labelled reported, not re-run), with the delta explained by the added tests; knip has no clean baseline, so its output is recorded and the findings that name files this feature touched are listed separately from the rest; `pnpm test:e2e` is run with `pnpm storybook` started on 6006 (port confirmed free first, pid recorded, stopped by that pid, listener gone confirmed) and compared to 214 passed / 1 skipped (Feature 81 figure, labelled reported); the electron and cli suites are run if any touched code is shared with them, otherwise the section states they were not run and gives `git diff --stat -- electron cli` (empty) and the list of touched files; a failing suite is recorded with the test names and is not fixed here; `git status --short` shows no change outside `frontend/`, `specs/features/saves-that-lose-data/` and no edit under `docs/user/`; a suite that was not run is not reported as passing.
**Depends on:** 2, 6, 7, 11, 13
**Estimate:** 3
**Notes:** Satisfies FR-25, FR-27. `pnpm test:e2e`, `pnpm storybook` and `lsof` run OUTSIDE the sandbox in the main checkout; the others inside. If a part halted, its later tasks are unticked and this task records that; the dependency on a halted part's tasks is then treated as satisfied by the halt report. Any manual check in the running app is optional and is reported separately from the tests. The handbook warnings these fixes make stale go to the scribe as a follow-up (OQ-7); list them as a pointer only.
**Done:** [ ]

## Summary
- Total tasks: 14
- Total estimated effort: 34 story points
- Critical path: 3 → 4 → 5 → 6 → 14
- Risks: Task 3 (the hypothesis for D-26 is unmeasured; a disproof halts Part B, Tasks 4-7); Task 6 (where the canonical save's word count reaches the page is not yet read, and no new route or transport is allowed); Task 8 (a disproof halts Part C, Tasks 9-11; the third copy in the `/delete` route must keep its response shape and the two verification scripts); Task 12 (the cause of D-3/D-39 is a reading, if the test cannot be made red the part halts, Task 13); Task 14 (knip has no clean baseline; e2e needs Storybook started and stopped by pid outside the sandbox; the owner's app may hold 7340 or 3000).
