# Tasks: Choose which documents count toward writing goals

Source spec: `specs/features/writing-goal-filter.md`. Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.md` FR-79, US-34; `specs/product/getwrite.features.md` Feature 98.

Conventions for every task: no `any`; boolean names take an `is`, `has`, `should`, `can`, `did` or `will` prefix; one module per concern; tests are written first where practical; a new component, prop or context gets Storybook coverage per `docs/standards/storybook-implementation.md` (a new context requirement also needs a Storybook decorator, or `pnpm test:e2e` fails). Handbook pages under `docs/user/handbook/` are not part of this feature. Tasks that name the same file are chained by dependency and must not run concurrently. `next build` and `build:native` work only in the main checkout, not in worktrees; any task that needs a build or `pnpm test:e2e` runs in the main checkout. Config key name used throughout: `goalFilter`.

Phase 1 (total goal) is Tasks 1 to 16. Phase 2 (daily goal) is Tasks 17 to 24. Release checks and final suites are Tasks 25 to 30; Task 29 (added at Gate 5) extends Task 24.

### Task 1: Goal filter validation module and shared bounds (FR-2, FR-41)
**What:** Add one module that validates a goal filter AST: schema, no `ref` or `param` node, at least one complete condition, depth 4 and 50 condition nodes from one shared constant, and no clock-dependent condition.
**Files:** frontend/src/lib/models/goal-filter-validation.ts (new), frontend/src/lib/models/query-evaluator.ts (export `isRelativeDateValue` so it is shared, not copied), frontend/tests/unit/goal-filter-validation.test.ts (new)
**Done when:** tests written first pass and confirm: a valid AST is accepted; each of schema failure, `ref`, `param`, no complete condition, depth 5, 51 condition nodes and a `gte` with a `{amount, unit}` value is refused with a distinct typed reason and the exact lines "A goal filter can't refer to a saved query." and "A goal filter can't use a relative date, because the figure would change without any edit."; the bounds constant is exported and used by the module; `isRelativeDateValue` is imported, not duplicated; `pnpm typecheck` clean.
**Depends on:** none
**Estimate:** 3
**Notes:** Requirements: FR-2, FR-41. F-15: the implementer MUST confirm no other clock-dependent route exists (search intrinsics and the advanced JSON editor) and record the result in a code comment and in the task's pull request text. If a string-length bound is needed, add it to the same constant with its value stated in the code. Smart-folder evaluation must not change.
**Done:** [x]

### Task 2: Add `goalFilter` to the project config and keep it through load and write (FR-1, FR-4, FR-5)
**What:** Add the optional `goalFilter` (query AST) to the config schemas, types, normalisation and API response schema so it round-trips, and make sure project creation and project types carry none.
**Files:** frontend/src/lib/models/schemas.ts (ProjectConfigSchema), frontend/src/lib/models/types.ts, frontend/src/lib/models/project.ts (`normalizeProjectConfig`), frontend/src/lib/api/schemas.ts, existing schema, project and project-creator tests
**Done when:** tests written first pass and confirm: a config with a filter parses and survives `normalizeProjectConfig`; a test loads a project with a filter, sets the daily goal, and reads the filter back unchanged; a config without a filter yields exactly today's output (key absent); project creation from every built-in project type copies no filter; `pnpm typecheck` clean.
**Depends on:** none
**Estimate:** 3
**Notes:** Requirements: FR-1, FR-4, FR-5. F-11: `normalizeProjectConfig` rebuilds from named keys, so an unnamed key is dropped on read. A stored value that fails the AST schema must still be readable by the config loader so later tasks can report it unavailable (FR-6); decide whether the schema stores it as a loose value and validate with Task 1 at use. Edits `schemas.ts`, `types.ts`, `project.ts` and `api/schemas.ts`, so later tasks touching those files depend on this one.
**Done:** [x]

### Task 3: Failure-aware listing and strict goal evaluation input (FR-17, FR-18)
**What:** Add a resource listing that returns empty only for a missing `resources/` directory and rethrows every other error, and a strict evaluation-input loader for goals that fails on a config read error, a sidecar read error and a `resources/<id>` directory with no sidecar.
**Files:** frontend/src/lib/models/list-resource-ids-strict.ts (new), frontend/src/lib/models/goal-evaluation-input.ts (new), frontend/src/lib/models/query-evaluate-core.ts (export reusable pieces only, no behaviour change), frontend/tests/unit/list-resource-ids-strict.test.ts (new), frontend/tests/unit/goal-evaluation-input.test.ts (new)
**Done when:** tests written first pass and confirm: `ENOENT` on `resources/` gives an empty list; a locked-access error and any other `readdir` error rethrow; a missing sidecar for a listed id fails; a non-`ENOENT` sidecar read error fails; a config read error fails; the existing `listResourceIds` and smart-folder `loadEvaluationInput` tests pass unmodified, and a test pins that smart-folder evaluation still skips a directory with no sidecar; `pnpm typecheck` clean.
**Depends on:** none
**Estimate:** 3
**Notes:** Requirements: FR-17, FR-18. Model on `pruneExecutor.ts:9-18`. Do not change `listResourceIds` or its seven callers listed in F-1. Failure-visibility standard: a failure must never return the same value as empty. Word counts for the goal come from `userMetadata.wordCount ?? wordCount ?? 0` (Task 5), so the loader need not read `content.txt` for goals; confirm and state the choice in a comment.
**Done:** [x]

### Task 4: Set and clear core for the goal filter (FR-2, FR-3, FR-41, FR-35)
**What:** Add a core that validates and writes `goalFilter` under `withMetaLock` through `updateProjectJson`, deleting the key to clear it and touching no other key.
**Files:** frontend/src/lib/models/goal-filter-core.ts (new), frontend/tests/unit/goal-filter-core.test.ts (new)
**Done when:** tests written first pass and confirm: a valid filter is stored; each refusal in Task 1 is refused with the same error text; clear removes the key (not `null`, not an empty AST) and leaves `wordCountGoal` and `dailyWordGoal` untouched; setting either goal leaves the filter untouched; the root is derived from a validated `projectId` and no path argument exists; a locked project rethrows; `pnpm typecheck` clean.
**Depends on:** 1, 2
**Estimate:** 3
**Notes:** Requirements: FR-2, FR-3, FR-35 (core). Model on `word-count-goal-core.ts:45-67`. Follow `docs/standards/security.md` sections 2 and 3 and `docs/standards/storage-context.md` section 2a. Setting a goal not touching the filter is tested here; the goal cores themselves are not edited unless that test fails.
**Done:** [x]

### Task 5: Goal membership core (FR-6, FR-8, FR-10, FR-12, FR-17, FR-18)
**What:** Add a server-side core that evaluates the stored filter over live resources and returns the matching live text resource ids, or a typed failure or a typed no-match result.
**Files:** frontend/src/lib/models/goal-filter-membership-core.ts (new), frontend/tests/unit/goal-filter-membership-core.test.ts (new)
**Done when:** tests written first pass and confirm: only `text` resources match (an image, audio and a folder-typed record that matches are excluded); a trashed resource is excluded and a restored one (same id) is included; a copy is evaluated on its own fields; a filter matching every text document yields every text id; a filter matching none returns a no-match result distinct from a failure; a stored filter that fails Task 1 returns an invalid-filter failure and is not rewritten or removed; a condition on a field absent from the metadata schema (deleted) returns a missing-field failure, a deprecated field evaluates normally, and an `eq` on an absent value still evaluates as the evaluator does; no filter set returns a not-filtered result; listing, sidecar and config failures from Task 3 surface as failures; `pnpm typecheck` clean.
**Depends on:** 1, 2, 3
**Estimate:** 5
**Notes:** Requirements: FR-6, FR-8, FR-10, FR-12, FR-17, FR-18. Membership uses the same evaluator as a smart folder with an `evaluationTime` fixed by the caller. This core is reused by Phase 2 (Task 20). It must not write to `querySlice`. A cache or index is a non-goal until Task 28.
**Done:** [x]

### Task 6: Filtered total core (FR-10, FR-13, FR-14)
**What:** Add a core that returns the filtered total word count as the sum of `userMetadata.wordCount ?? wordCount ?? 0` over the members from Task 5, plus the unavailable and no-match states.
**Files:** frontend/src/lib/models/goal-filtered-total-core.ts (new), frontend/tests/unit/goal-filtered-total-core.test.ts (new)
**Done when:** tests written first pass and confirm: a filter matching every text document equals the unfiltered text-only sum; the evaluator's content-derived counts are not summed; a no-match filter returns total 0 flagged as no-match; each failure in FR-13 (failed listing, sidecar error, missing directory sidecar, missing field, config read error, locked or keyless project, invalid stored filter) returns an unavailable result with no number; the result is recomputed on every call (a trashed, restored, copied or edited document changes the next result); `pnpm typecheck` clean.
**Depends on:** 5
**Estimate:** 3
**Notes:** Requirements: FR-10, FR-13, FR-14. The result type must make a number impossible in the unavailable branch (discriminated union).
**Done:** [x]

### Task 7: Set and clear transport: route, native backend, web stub, `lib/api` module (FR-35, FR-36)
**What:** Add the HTTP route under `withStorageContext`, the native in-process backend with its `.web-stub.ts` pair, and a `lib/api` module on `createTransport` for set and clear, with response schemas.
**Files:** frontend/app/api/project/goal-filter/route.ts (new), frontend/src/store/transport/native-goal-filter-backend.ts and native-goal-filter-backend.web-stub.ts (new), frontend/src/lib/api/goal-filter.ts (new), frontend/src/lib/api/schemas.ts, tests beside each
**Done when:** tests written first pass and confirm: the route validates `projectId`, accepts no client path, runs under `withStorageContext`, returns the same error body as the core on each refusal; the `lib/api` module rejects on any failure and never returns a fabricated empty value; a malformed response body calls `reportTransportValidationFailure` and the body is not passed to it; native and web-stub exports match; `pnpm typecheck` clean.
**Depends on:** 4
**Estimate:** 5
**Notes:** Requirements: FR-35, FR-36. No new paired-device limit switch is added. Edits `src/lib/api/schemas.ts`; Tasks 8 and 22 edit it too and are chained after this one. Check how existing native backends are registered (a shared registry file may also be edited here).
**Done:** [x]

### Task 8: Filtered total transport (FR-35, FR-36)
**What:** Add the read route, native backend, web stub and `lib/api` module that return the filtered total result from Task 6.
**Files:** frontend/app/api/project/goal-filtered-total/route.ts (new), frontend/src/store/transport/native-goal-total-backend.ts and its .web-stub.ts (new), frontend/src/lib/api/goal-filtered-total.ts (new), frontend/src/lib/api/schemas.ts, tests beside each
**Done when:** tests written first pass and confirm: the route and native backend call the one core from Task 6; an unavailable result is returned as a typed response, and a transport failure rejects (the module never returns a number for a failure); a malformed body calls `reportTransportValidationFailure` without the body; membership is not evaluated client-side; `pnpm typecheck` clean.
**Depends on:** 6, 7
**Estimate:** 3
**Notes:** Requirements: FR-35, FR-36. Depends on Task 7 only because both edit `src/lib/api/schemas.ts`.
**Done:** [x]

### Task 9: Phase 1 parity test across core, route and native (FR-35)
**What:** Add one test that runs the same fixtures through the cores, the HTTP route and the native backend for set, clear and filtered total, and asserts identical results and errors.
**Files:** frontend/tests/integration/goal-filter-parity.test.ts (new)
**Done when:** the test passes with fixtures covering a valid filter, each refusal, clear, a matching total, a no-match total and an unavailable total, comparing core, route and native outputs for equality.
**Depends on:** 7, 8
**Estimate:** 3
**Notes:** Requirements: FR-35. Test-only task; if it exposes a divergence, fix it in the owning transport file.
**Done:** [x]

### Task 10: Tab-side filter draft helper (FR-2, FR-8, FR-22, FR-41)
**What:** Add a pure module that turns a stored AST into builder groups while keeping conditions on unknown fields visible, detects incomplete conditions, and runs the shared validation before a save.
**Files:** frontend/src/lib/goal-filter-draft.ts (new), frontend/tests/unit/goal-filter-draft.test.ts (new)
**Done when:** tests written first pass and confirm: a condition on a field not in the field list is kept with its field key and flagged "This field no longer exists." and is still present in the AST after a no-change rebuild (not dropped, F-5); an incomplete chip is refused with "Finish or remove the incomplete conditions."; an AST deeper than two levels or beyond the Task 1 bounds is flagged; a relative-date condition is refused with the FR-41 line using Task 1's check; the module imports the shared bounds constant, not its own; `pnpm typecheck` clean.
**Depends on:** 1
**Estimate:** 3
**Notes:** Requirements: FR-2, FR-8, FR-22, FR-41. Uses `ast-chip-bridge.ts` helpers read-only; do not edit that file in this task. Estimate assumes the bridge can be wrapped; if it must change, split a follow-up task.
**Done:** [x]

### Task 11: Goal filter section component with stories (FR-7, FR-19, FR-20, FR-21, FR-22, FR-37)
**What:** Add the "Goal filter" section using the query builder with its own `useQueryBuilderState` instance, explicit Save and Clear buttons, and the status and alert lines.
**Files:** frontend/components/Layout/GoalFilterSection.tsx (new), frontend/components/Layout/GoalFilterSection.stories.tsx (new), frontend/tests/components/GoalFilterSection.test.tsx (new)
**Done when:** tests written first pass and confirm: the description reads "Choose which documents count toward both goals. Leave empty to count every text document."; the builder receives no `savedQueries` and offers no "Save query"; Save goal filter and Clear goal filter buttons exist with no autosave; success shows "Goal filter saved." or "Goal filter cleared." in `role="status"`; failure shows "Failed to save goal filter." plus the server message in `role="alert"`; an invalid stored filter shows "Your saved goal filter can't be used. Change it or clear it." and Clear still works; a missing-field condition shows its key and "This field no longer exists."; a refused `ref` shows "A goal filter can't refer to a saved query."; no live match count is shown; stories cover empty, set, invalid stored filter and missing-field states, and Storybook builds its stories without a context error.
**Depends on:** 7, 10
**Estimate:** 5
**Notes:** Requirements: FR-7, FR-19, FR-20, FR-21, FR-22, FR-37 (neutral colours, no red, meaning in words). New props need stories per the storybook standard. Read the existing `DailyWordGoalField.tsx` and the builder components and stories before using any prop.
**Done:** [x]

### Task 12: Wire the section into Project Settings and the shell config (FR-19, FR-23)
**What:** Render the section in the Writing Goals panel, pass the field list and resource and folder resolvers from the shell, accept `"goalFilter"` in `ProjectGoalSavedHandler`, update the shell's config copy after a save or clear, and signal the goal-change refresh.
**Files:** frontend/components/Layout/ProjectSettingsDialog.tsx, frontend/components/Layout/ShellModalCoordinator.tsx, frontend/components/Layout/AppShell.tsx, frontend/components/Layout/ProjectSettingsDialog.stories.tsx, existing dialog and coordinator tests
**Done when:** tests written first pass and confirm: the section renders below the two goal fields and only when `projectId` is set; edits survive a switch to another tab and back; after a save or clear a reopened dialog shows the saved filter; `ProjectGoalSavedHandler` accepts `"goalFilter"`; `notifyWritingLogGoalChanged` is called after a save or clear; the dialog stories include the new props and `pnpm test:e2e` smoke for the dialog stories is not broken.
**Depends on:** 11
**Estimate:** 3
**Notes:** Requirements: FR-19, FR-23. Edits `AppShell.tsx`, so Task 16 and any other AppShell task depend on this one. F-8: the panels are mounted for the dialog's lifetime and the dialog is `max-w-[900px]`; check the builder fits.
**Done:** [x]

### Task 13: Escape closes the open picker, not the dialog (FR-42)
**What:** Read the value picker and the dialog primitive, then make Escape close an open field or value picker without closing the dialog.
**Files:** frontend/components/QueryBuilder/FieldPicker.tsx, the value picker file found while reading, the dialog primitive if it must change, frontend/components/Layout/ProjectSettingsDialog.tsx, tests beside each
**Done when:** a test written first fails before the change and passes after: with the tab's builder open, pressing Escape with a field picker open closes the picker and leaves the dialog open; the same for the value picker; Escape with no picker open still closes the dialog; the capture-phase listener pattern of `SchemaManager.tsx:374-397` is used or the reason for a different one is stated in a comment; smart-folder builder tests pass unmodified.
**Depends on:** 12
**Estimate:** 3
**Notes:** Requirements: FR-42. The spec calls the defect likely, not confirmed: the first step is to read `FieldPicker.tsx:326-328`, the value picker and the dialog's Escape handler, and to reproduce the failure in a test before fixing. If Escape already works, record that in the test names and stop with no source change.
**Done:** [x]

### Task 14: Writing Goals tab accessibility tests (FR-37)
**What:** Add axe tests for the Writing Goals tab with a filter set, with an invalid stored filter and with a missing-field condition, and verify keyboard operation of every builder control inside the dialog.
**Files:** frontend/tests/a11y/goal-filter-tab.a11y.test.tsx (new), fixes in the files from Tasks 11 and 12 if a defect is found
**Done when:** the three axe checks pass using `tests/a11y/helpers/axe.ts`; a keyboard test reaches and operates add condition, field picker, operator, value, Save and Clear without a pointer; errors are `role="alert"` and confirmations `role="status"`.
**Depends on:** 13
**Estimate:** 2
**Notes:** Requirements: FR-37. Follows `docs/standards/accessibility.md`. Depends on Task 13 because a fix may touch the same files.
**Done:** [x]

### Task 15: Filtered total hook (FR-9, FR-14)
**What:** Add a hook that reads the filtered total from the Task 8 transport when a filter is set, re-reads on mount of the Data view and on the goal-change signal, and writes nothing to the shared query state.
**Files:** frontend/src/hooks/useFilteredGoalTotal.ts (new), frontend/tests/unit/useFilteredGoalTotal.test.tsx (new)
**Done when:** tests written first pass and confirm: with no filter the hook makes no request and returns a not-filtered state; with a filter it returns loading, total, no-match or unavailable; a rejected request yields unavailable and never a number; a goal-change signal triggers a re-read; `querySlice` state (`activeQueryDefinition`, `activeQueryIds`) is unchanged after a read.
**Depends on:** 8
**Estimate:** 3
**Notes:** Requirements: FR-9, FR-14. Booleans in the return type use the naming prefixes (for example `isFiltered`, `isUnavailable`). New file only; `DataView.tsx` is edited in Task 16.
**Done:** [x]

### Task 16: Data view goal bar: filtered label, no-match and unavailable states (FR-5, FR-9, FR-11, FR-12, FR-13, FR-15, FR-16)
**What:** Make the Data view goal section show the filtered total with "Counting selected documents", the no-match line and the unavailable line, leaving every other figure unchanged.
**Files:** frontend/components/WorkArea/DataView.tsx, frontend/components/Layout/AppShell.tsx, frontend/components/WorkArea/DataView.stories.tsx, existing DataView tests
**Done when:** tests written first pass and confirm: with a filter set the bar shows the filtered total independent of an active smart folder, with the text "Counting selected documents" in reading order; a no-match filter shows 0, the label and "No documents match your goal filter"; an unavailable result shows "Total word count is unavailable" and no number and no 0; with no filter the bar, strings and smart-folder following are exactly as today; the "Total words" tile, status roll-up and breakdown do not change when a filter is set; no label appears when no goal is set; stories cover filtered, no-match and unavailable states.
**Depends on:** 12, 15
**Estimate:** 5
**Notes:** Requirements: FR-5, FR-9, FR-11, FR-12, FR-13, FR-15, FR-16. Edits `AppShell.tsx`, hence the dependency on Task 12. Neutral colours only; meaning carried by words.
**Done:** [x]

### Task 17: Add `documentId` to writing-log word and marker entries (FR-24, FR-25)
**What:** Add an optional `documentId` (validated as a resource id) to word entries and marker entries while keeping entries without it valid, and pin that import entries carry none.
**Files:** frontend/src/lib/models/schemas.ts (lines 991-1009 area), frontend/src/lib/models/types.ts, existing writing-log schema tests
**Done when:** tests written first pass and confirm: a word entry and a marker entry with a valid `documentId` parse; one with an invalid id is rejected; entries without it parse as before; an import entry (with `source`) with a `documentId` is rejected or documented as never written, per the test; entries stay `.strict()` for every other key; `pnpm typecheck` clean.
**Depends on:** 2
**Estimate:** 2
**Notes:** Requirements: FR-24, FR-25. Edits `schemas.ts` after Task 2. F-9: an older release's strict schema will reject an entry with this key; Task 19 measures the effect before any release writes it.
**Done:** [x]

### Task 18: Write `documentId` on canonical saves and skipped-save markers (FR-24)
**What:** Pass the saved resource's id into `logCanonicalSave` so every new word entry, filtered or not, and every marker whose document is known carries `documentId`. Add an optional `documentId` to both `WritingLogEntryInput` variants in `writing-log.ts`; `buildEntry` writes it only when present, and import entries carry none.
**Files:** frontend/src/lib/models/revision-core.ts (`logCanonicalSave` :388-416, call in `updateRevisionInPlaceLocked` :507), frontend/src/lib/models/writing-log.ts, existing revision-core tests
**Done when:** tests written first pass and confirm: a canonical save writes an entry whose `documentId` equals the resource id; a skipped save writes a marker with the `documentId`; a non-canonical save appends none; importers still write entries with no `documentId`; existing content-loss and writing-log tests pass unmodified; `pnpm typecheck` clean.
**Depends on:** 17
**Estimate:** 3
**Notes:** Requirements: FR-24, FR-25. Touches the primary save path; a log failure must still not fail the content save (existing behaviour). `copyResourceCore` appends no entry and must stay that way (F-10).
**Done:** [x]

### Task 19: FR-38 experiment: older build reading a day file with `documentId` (FR-38)
**What:** Run and record the experiment in which the previous release reads and appends to a day file holding an entry with a `documentId`, on desktop and on a project folder opened by an older build.
**Files:** specs/features/writing-goal-filter/experiments.md (new)
**Done when:** `experiments.md` records, for the installed `/Applications/GetWrite.app` (2.2.0) and for a 2.3.0 build taken from the release, the exact steps, the day file used, what the log showed, whether a canonical save still stored the writer's text, and a verdict on whether the effect is limited to that UTC day's log (unavailable or failed log entries for that day) and the text still saves; no other record is needed. If the effect is worse than limited, the task halts and the result goes to the owner, with the tolerant-reader-a-release-earlier fallback named.
**Depends on:** 18
**Estimate:** 3
**Notes:** Requirements: FR-38. The lead runs Task 19 first, using a local packaged build of main as the 2.3.0 stand-in (`git diff getwrite-v2.3.0 main -- frontend/src/lib/models/schemas.ts frontend/src/lib/models/writing-log.ts` prints nothing, so the two read the log identically), with throwaway folders. The installed 2.2.0 is attempted; if the tooling can't drive it, it goes to the owner (opening apps is blocked in the sandbox). Use throwaway folders only; never `~/Documents/GetWrite` or `~/Library/Application Support/getwrite-electron/`; point each build at a throwaway workspace and user-data folder. State in the record which parts were measured and which are inferred; name no cause that the run did not discriminate. This task must be complete before any release that writes `documentId`.
**Done:** [ ]

### Task 20: Filtered daily figure in the aggregate core (FR-25, FR-26, FR-27, FR-28, FR-31)
**What:** Make the aggregate, with a filter set, sum non-import word entries that carry a `documentId` of a live text document matching the filter at read time, using the Task 5 membership core.
**Files:** frontend/src/lib/models/writing-log-core.ts (`aggregateForRoot` :135-162), frontend/tests/unit/writing-log-core.test.ts
**Done when:** tests written first pass and confirm: entries with no `documentId` are left out under a filter and counted without one; import entries never count; changing the filter or a document's fields changes the figure on the next read; an entry for a trashed or purged document is left out without a failure, a restored document's entries return, a copy is not attributed the original's entries, and metadata of trashed documents is never read; a corrupt or unreadable day file, a failed listing and every FR-13 failure give an unavailable error, not a number; with no filter set the result is byte-for-byte what it is today.
**Depends on:** 5, 17
**Estimate:** 5
**Notes:** Requirements: FR-25, FR-26, FR-27, FR-28, FR-31 (core part), FR-5. Reuse Task 5; do not re-implement membership. The window cap (26 hours, 3 day files) is unchanged.
**Done:** [x]

### Task 21: Incomplete flag under a filter (FR-32)
**What:** Raise `incomplete` under a filter when the window holds a non-import word entry without a `documentId`, and limit which markers raise it.
**Files:** frontend/src/lib/models/writing-log-core.ts, frontend/tests/unit/writing-log-core.test.ts
**Done when:** tests written first pass and confirm: under a filter an entry without `documentId` sets `incomplete`; with no filter such an entry does not; once the window holds only entries with a `documentId` the cause is gone; a marker for a matching document or with no `documentId` sets it; a marker for a non-matching document does not; with no filter every marker keeps its current effect.
**Depends on:** 20
**Estimate:** 3
**Notes:** Requirements: FR-32. Same file as Task 20, hence the chain.
**Done:** [x]

### Task 22: Aggregate response fields and transport parity (FR-29, FR-35, FR-36)
**What:** Add fields reporting whether the aggregate is filtered and whether the filter matched no live text document to `WritingLogAggregate` and `WritingLogAggregateResponseSchema`, identical on HTTP and native.
**Files:** frontend/src/lib/models/writing-log-core.ts, frontend/src/lib/api/schemas.ts (:597-602), frontend/app/api/project/writing-log/route.ts, frontend/src/store/transport/native-writing-log-backend.ts and web stub, frontend/src/lib/api/writing-log.ts, tests beside each
**Done when:** tests written first pass and confirm: the new fields (for example `isFiltered`, `hasNoMatch`) are present and equal across core, route and native for the same fixtures; existing fields keep their meaning and an unfiltered response matches today's; a malformed body calls `reportTransportValidationFailure` without the body; the transport still rejects on failure and fabricates no zero.
**Depends on:** 8, 21
**Estimate:** 3
**Notes:** Requirements: FR-29, FR-35, FR-36. Edits `src/lib/api/schemas.ts`, chained after Tasks 2, 7 and 8.
**Done:** [x]

### Task 23: Footer and details dialog filtered states (FR-30, FR-31, FR-34)
**What:** Show "Counting selected documents", the real zero with "No documents match your goal filter", and the existing unavailable line in the footer and the details dialog, keeping the Imported line.
**Files:** frontend/components/WorkArea/WritingLogFooterDisplay.tsx, frontend/components/WorkArea/WritingLogDetailsDialog.tsx, their stories and tests
**Done when:** tests written first pass and confirm: a filtered figure shows the label in both; a no-match filter shows 0, the label and the no-match line; a failure shows "Today's count is unavailable" and no number; "Imported (not counted toward goal): N" stays and shows the unfiltered import total; the unfiltered strings are unchanged; stories cover filtered, no-match, unavailable and incomplete states; red is not used.
**Depends on:** 22
**Estimate:** 3
**Notes:** Requirements: FR-30, FR-31, FR-34, FR-37.
**Done:** [x]

### Task 24: Footer re-read after filter change and after a sidecar field save (FR-33)
**What:** Re-read the footer after the filter is saved or cleared, on mount and on the existing refresh token, and after a resolved sidecar field save through `notifyWritingLogGoalChanged` only while a filter is set.
**Files:** frontend/src/lib/writing-log-goal-signal.ts (or wherever `notifyWritingLogGoalChanged` lives, found by search), the sidecar field save call site, frontend/components/WorkArea/WritingLogFooterDisplay.tsx, tests beside each
**Done when:** tests written first pass and confirm: a resolved sidecar field save calls the signal when a filter is set and does not when none is set; a rejected save does not call it; saving or clearing the filter triggers a footer re-read; the footer re-reads on mount and on the refresh token as before.
**Depends on:** 12, 23
**Estimate:** 2
**Notes:** Requirements: FR-33. Depends on 23 for the footer file and on 12 for the config copy that says whether a filter is set.
**Done:** [x]

### Task 25: Update feature docs and the OpenAPI file (FR-40)
**What:** Describe the filter, the `documentId` entry field, the new aggregate fields and the unavailable and no-match states in the docs and the API description.
**Files:** docs/features/writing-log.md, docs/features/word-count-goals.md, docs/api/openapi.yaml
**Done when:** each file describes the filter, both goals' behaviour under it, the new entry field, the new aggregate fields, the two new route(s) and the unavailable and no-match states; the OpenAPI file parses (run the repo's openapi lint or a YAML parse if no linter exists); docs do not state a cause the spec lists as unmeasured.
**Depends on:** 22
**Estimate:** 2
**Notes:** Requirements: FR-40 (SHOULD). Handbook pages are out of scope.
**Done:** [x]

### Task 26: Sharing smoke test (FR-35)
**What:** Run `pnpm test:sharing-smoke` and record the result.
**Files:** specs/features/writing-goal-filter/experiments.md (append the result under its own heading)
**Done when:** `pnpm test:sharing-smoke` exits 0 and the command, date and exit code are recorded; on a failure the output is recorded and the task stops.
**Depends on:** 19, 24
**Estimate:** 1
**Notes:** Requirements: FR-35. Find the script with `grep test:sharing-smoke package.json */package.json`. It may need running outside the sandbox (a local server and ports); retry outside only after a sandbox denial. Depends on Task 19 because both append to `experiments.md`. Run in the main checkout.
**Done:** [ ]

### Task 27: Manual pairing check (FR-35)
**What:** Confirm on a paired device that Project Settings opens, the filter saves and the filter applies to the goals, and record it.
**Files:** specs/features/writing-goal-filter/experiments.md (append the record)
**Done when:** the record states the device, the date, that Project Settings opened on a paired device, that a filter saved, and the total and daily figures that showed before and after.
**Depends on:** 26
**Estimate:** 1
**Notes:** Requirements: FR-35. Owner needed: a person must pair a second device with the desktop app and operate it. Do not mark done without the owner's result. Use a throwaway project, not real writing.
**Done:** [ ]

### Task 28: Measurement: filtered total and filtered daily read cost (FR-39)
**What:** Measure wall time, files read and memory for the filtered total and the filtered daily read on a large project, on web, desktop and a native device, and record the figures.
**Files:** specs/features/writing-goal-filter/experiments.md (append the record), a throwaway measurement script under the scratchpad (not committed)
**Done when:** `experiments.md` has a table with, for each of (a) filtered total and (b) filtered daily read and each of web, desktop and native: the project size, wall time, files read and memory, with the method; typing and autosave are shown not to block while a read runs; no cache or index is added by this task.
**Depends on:** 16, 19, 24
**Estimate:** 5
**Notes:** Requirements: FR-39. The lead runs Task 28's web and desktop parts; the native part remains the owner's (Pixel 7 Pro and adb, which fail inside the sandbox; retry outside). Record what was not measured instead of estimating it. Use a generated large project in a throwaway folder. Depends on Task 19 only because both write `experiments.md`. Do not name a cause for any slow figure without an experiment that discriminates it.
**Done:** [ ]

### Task 29: Footer re-reads after every sidecar save under a filter (FR-33)
**What:** Make every resolved `updateSidecar` call, not only the page's metadata field save from Task 24, call `notifyWritingLogGoalChanged` while a filter is set. `SubtypeSection`, `EntitySection`, `RemoveEntityControl` and `WordCountGoalSection` call `updateSidecar` without the signal; a search for other `updateSidecar` callers finds the rest.
**Files:** the module that defines `updateSidecar` or its client wrapper (found by search), `frontend/components/` callers `SubtypeSection`, `EntitySection`, `RemoveEntityControl`, `WordCountGoalSection` and any other caller the search finds, tests beside each
**Done when:** tests written first pass and confirm: a resolved save through each of those paths, plus any other `updateSidecar` caller a search finds, calls `notifyWritingLogGoalChanged` when a filter is set, does not when none is set, and a rejected save does not.
**Depends on:** 24
**Estimate:** 2
**Notes:** Requirements: FR-33. Prefer one shared place (the `updateSidecar` wrapper, or a single helper every caller uses) over repeating the call per call site, if the code allows; state the choice in a code comment and in the pull request text. If the filter-set state is not reachable from that place, say so and fall back to a shared helper taking the flag. Task 24's call site must keep working and not signal twice.
**Done:** [x]

### Task 30: Final suites (all requirements)
**What:** Run the full checks from `frontend/` and the electron tests and record the results.
**Files:** none (fixes go to the owning files)
**Done when:** `pnpm typecheck`, `pnpm lint`, `pnpm test:ci` and `pnpm test:e2e` all exit 0 from `frontend/`, the electron package tests exit 0, and `pnpm knip` from the repo root reports no new unused export from this feature; the exit codes are recorded in the pull request text.
**Depends on:** 14, 16, 19, 25, 27, 28, 29
**Estimate:** 2
**Notes:** Run in the main checkout, not a worktree (builds only work there). Stop `pnpm storybook` before `pnpm test:e2e`, which builds and serves Storybook itself on :6006; e2e may need running outside the sandbox. A missing Storybook decorator for a new context shows up here. Requirement coverage check: every FR-1 to FR-42 appears in at least one task above.
**Done:** [ ]

## Summary
- Total tasks: 30
- Total estimated effort: 92 story points
- Critical path: 3 → 5 → 20 → 21 → 22 → 23 → 24 → 26 → 27 → 30
- Risks: Task 19 (FR-38) can halt the Phase 2 release for the owner and needs a person to run installed apps; Task 18 touches the primary save path; Task 13 (FR-42) may find no defect or need a change in a shared dialog primitive; Task 10 assumes the chip bridge can be wrapped without edits; Tasks 19, 27 and 28 (native part) need the owner; Task 28 may show a cost that needs a cache, which is outside this feature; Tasks 2, 7, 8 and 22 all edit `src/lib/api/schemas.ts` and Tasks 12 and 16 both edit `AppShell.tsx`, so they are chained and cannot run in parallel; builds and e2e run only in the main checkout.
