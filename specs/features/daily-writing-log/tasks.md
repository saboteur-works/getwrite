# Tasks: Daily writing log and daily goal

Source spec: `specs/features/daily-writing-log.md`. Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.md` FR-48, FR-50, US-21; `specs/product/getwrite.features.md` Feature 59.

### Task 1: Add `dailyWordGoal` to config schemas and types (FR-6, FR-13)
**What:** Add optional `dailyWordGoal` beside `wordCountGoal` everywhere it must round-trip.
**Files:** frontend/src/lib/models/schemas.ts (:237, :615), frontend/src/lib/api/schemas.ts (:159), frontend/src/lib/models/types.ts (:95), frontend/src/lib/models/project.ts (:13), frontend/src/lib/models/project-creator.ts (:148, :233), existing schema/project tests
**Done when:** tests written first confirm `dailyWordGoal` (non-negative int, optional) parses, round-trips through project normalize and the API response schema, and is absent when unset; `wordCountGoal` behaviour unchanged; `pnpm typecheck` clean.
**Depends on:** none
**Estimate:** 2
**Notes:** Line numbers verified 2026-09-26 by grep. Feature 59 lands before Feature 61 (FR-13), which edits the same lines; sequence, do not parallelise. project-creator.ts copies from a project-type spec: decide only whether a spec may seed it; default no, plumb the field type only.
**Done:** [ ]

### Task 2: Add the writing-log entry and day-file schema (FR-1, FR-3, FR-4)
**What:** Define Zod schemas for a word entry (added, deleted, net, ISO timestamp, optional `source` marking import), a second marker-entry variant (`skipped: true`, ISO timestamp, no word counts), and a day file holding either variant.
**Files:** frontend/src/lib/models/schemas.ts, frontend/src/lib/models/types.ts, existing schemas test file
**Done when:** tests written first confirm: a valid entry parses; a missing or non-ISO timestamp is rejected; negative added/deleted rejected; net is stored and must equal added minus deleted (an entry with a mismatched net is rejected; pinned as a test); a marker entry with `skipped: true` and a valid timestamp parses, one carrying word counts or lacking `skipped: true`/timestamp is rejected, and a day file accepts a mix of both variants; `source` accepts `docx` and `scrivener` and is otherwise optional; `pnpm typecheck` clean.
**Depends on:** none
**Estimate:** 3
**Notes:** Keep this separate from the dailyWordGoal task so the two schemas.ts edits do not conflict textually. Estimate raised 2 -> 3 at Gate 4: added the marker-entry variant and its tests (FR-5).
**Done:** [ ]

### Task 3: Implement the writing-log model: append and read (FR-1, FR-4)
**What:** Add `writing-log.ts` that appends an entry (word or marker) to `meta/writing-log/YYYY-MM-DD.json`, keyed by the UTC date of the entry's ISO timestamp computed inside the model (never accepted from a client), and reads entries for a local-day window by loading the overlapping UTC day files (the window's validation lives in Task 9's core, not here).
**Files:** frontend/src/lib/models/writing-log.ts (new), frontend/tests/unit/writing-log.test.ts (new)
**Done when:** tests written first, using the memory adapter, confirm: append creates the day file; a second append keeps the first entry byte-for-byte and adds one with its own ISO timestamp; concurrent appends (Promise.all of 20) lose none, proving the `withMetaLock(projectRoot, ...)` read-modify-write; a corrupt day file is reported, not treated as empty; `isLockedAccessError` errors are rethrown, not degraded to empty on both append and read; the file key is the UTC date of the entry's timestamp and the append API takes no date or path argument; an entry timestamped just before and one just after a UTC midnight land in two different files; a read for a local day that spans two UTC files (e.g. a UTC+10 or UTC-8 window) assembles entries from both, ordered by timestamp, loading at most 2-3 files (the model trusts an already-validated window; rejection of bad windows is Task 9); a malformed key cannot be produced (invalid, non-ISO or out-of-range timestamps are rejected before any path is built, and the key always matches `^\d{4}-\d{2}-\d{2}$`); `pnpm typecheck` clean.
**Depends on:** 2
**Estimate:** 5
**Notes:** Follow mention-index.ts (withMetaLock at :65). Per OQ-8 (amended at Gate 4) the key encodes no day definition and there is no re-keying. The local-day window is supplied by the caller as ISO `from`/`to` instants and validated in Task 9 (OQ-14, resolved at Gate 4). Estimate stays 5: the UTC-key and multi-file-read work replaces, rather than adds to, the local-date-key work. Failure-visibility standard: a corrupt file must not look like an empty day.
**Done:** [ ]

### Task 4: Implement the word-bag diff function (FR-2, FR-11)
**What:** Add a pure function computing added, deleted and net between before and after text as a multiset difference, using `countWords` on `tiptapToPlainText`.
**Files:** frontend/src/lib/models/word-diff.ts (new) or beside writing-log.ts, frontend/tests/unit/word-diff.test.ts (new)
**Done when:** tests written first confirm: pure addition, pure deletion, empty before, empty after, identical text gives 0/0/0; net equals added minus deleted; word totals agree with `countWords` for the same inputs (matching sidecar `wordCount`, not `previews.ts:97`); documented blind spots are pinned as tests: a moved paragraph yields 0/0, and a rewrite reusing common words undercounts versus a naive replacement count; duplicated words are matched by multiplicity (before has 'the' x2, after x3 gives added 1); the function does not import fs.
**Depends on:** none
**Estimate:** 3
**Notes:** FR-11 states compute cost is unmeasured. No benchmark task is added: the spec explicitly leaves cost unmeasured, the diff is O(n) over one resource per debounced save, and a benchmark would be speculative. Revisit only if a large-resource save is observed slow.
**Done:** [ ]

### Task 5: Hook logging into `updateRevisionInPlace` for canonical saves (FR-2, FR-5)
**What:** Read the previous canonical content itself, diff against the new content, and append one entry; when previous content is unreadable or non-TipTap, append a marker entry (`skipped: true`) instead of a word entry and return a signal.
**Files:** frontend/src/lib/models/revision-core.ts (updateRevisionInPlace ~:333), frontend/src/lib/api/schemas.ts (response gains a log-incomplete flag, near :500), existing revision-core tests
**Done when:** tests written first confirm: a canonical save appends exactly one entry with the expected added/deleted; a non-canonical save appends none; unreadable previous content appends no word entry but exactly one marker entry, and the result carries a skipped-log signal (not a zero entry); legacy plain-text previous content (where `syncDerivedResourceContent` returns undefined) does the same; if the marker append itself fails, the content save still succeeds and the result carries a distinct marker-append-failed signal for the session-flag fallback; the check uses its own read and does not rely on `snapshotBeforeDestructiveWrite`; a log-append failure does not fail or roll back the content save but is signalled; a locked project rethrows via `isLockedAccessError`; existing content-loss tests pass unmodified.
**Depends on:** 3, 4
**Estimate:** 5
**Notes:** `snapshotBeforeDestructiveWrite` returns null for both unreadable and non-destructive cases, hence the own read (spec FR-5). Decide and record the exact result field name; Task 6 and 9 consume it. Highest-risk task: touches the primary save path. Estimate stays 5: the marker append reuses Task 3's append and Task 2's variant.
**Done:** [ ]

### Task 6: Surface the skipped-log signal as a deduplicated toast and persistent marker (FR-5)
**What:** Route the signal from the save result to `toastService.error` with a stable id and expose a persistent 'incomplete' flag for the goal display.
**Files:** frontend/src/lib/api/resources.ts and/or frontend/src/store/transport/native-resource-backend.ts, frontend/src/lib/toast-service.ts consumers, useCanonicalAutosave.ts, existing tests
**Done when:** tests written first confirm: two consecutive skipped saves raise one toast (same stable id); a normal save raises none; the incomplete indicator is derived from the log's marker entries per local day (a day with a marker shows it, a day without does not, independent of session); only when the marker append fails (Task 5's marker-append-failed signal) is an in-memory session flag set as the fallback; the toast text does not include document content; web and native paths behave identically.
**Depends on:** 5
**Estimate:** 3
**Notes:** Mirror reportTransportValidationFailure's stable-id toast. Native and HTTP both flow the field from Task 5; verify both.
**Done:** [ ]

### Task 7: Log docx and Scrivener imports with a `source` field (FR-3, FR-10)
**What:** Append one additions entry under the new project's id at the end of each import, marked as an import; do nothing for plain-text.
**Files:** frontend/src/lib/models/docx/import-docx-project.ts, frontend/src/lib/models/scrivener/import-scrivener-project.ts, existing import tests
**Done when:** tests written first confirm: a docx import writes exactly one entry with `source: 'docx'`, added equal to total imported words, deleted 0, under the new project's meta/writing-log; a Scrivener import does likewise with `source: 'scrivener'`; a fatal mid-write error that deletes the run-created projectRoot leaves no orphan log; the entry is written after the rebuild step so imported words are not also diff-logged by any save hook; no plain-text import path logs.
**Depends on:** 3
**Estimate:** 3
**Notes:** Imports write resources through paths that must not call the Task 5 hook; verify they do not, or the words would be double counted as non-import additions.
**Done:** [ ]

### Task 8: Guarantee `reindex` does not clear the writing log (FR-12)
**What:** Add a regression test, and a code change only if one is needed, so a from-scratch reindex leaves meta/writing-log intact.
**Files:** cli/src/commands/reindex.ts, frontend/src/lib/models/indexer-queue.ts, existing reindex test
**Done when:** a test written first seeds a day file, runs the reindex CLI action and `import-*` rebuild step, and asserts the day file is byte-identical afterward; the test fails if reindex is changed to remove `meta/writing-log`; `pnpm typecheck` clean.
**Depends on:** 3
**Estimate:** 2
**Notes:** Expected to pass without source changes; the value is pinning it. If reindex clears meta/ wholesale, that is a real defect to fix here.
**Done:** [ ]

### Task 9: Add core functions for reading the log and setting the goal (FR-6, FR-7)
**What:** Add transport-agnostic cores: get today's aggregate (non-import totals, import total, goal, incomplete flag) for a required client-supplied local-day window (`from`, `to` ISO instants), validating that window, and set or clear `dailyWordGoal`.
**Files:** frontend/src/lib/models/writing-log-core.ts (new), frontend/src/lib/models/project-preferences-core.ts or project-config.ts as appropriate, tests
**Done when:** tests written first confirm: aggregation derives the local calendar day from each entry's ISO timestamp across the UTC day files overlapping that day (a fixture with a local day spanning two UTC files sums entries from both and excludes entries from the neighbouring local days); the aggregate reports incomplete when the local day contains a marker entry and not otherwise, and marker entries add nothing to the totals; import entries are summed separately and excluded from the goal comparison figure; no goal gives goal undefined; set persists and clear removes `dailyWordGoal` without touching `wordCountGoal`; invalid (negative, non-integer) is rejected; a locked project rethrows via `isLockedAccessError`; window validation (OQ-14): a missing `from` or `to` is rejected (no server-timezone or UTC-day fallback), a non-ISO value is rejected, `to` equal to or before `from` is rejected, a window over 26 hours is rejected and not clamped (the result is an error, never a shortened aggregate), a 23-hour and a 25-hour (DST-length) window are accepted, and a window that would load more than the bound of UTC day files (3 or 4) is rejected with the file-count bound asserted by counting adapter reads.
**Depends on:** 1, 3
**Estimate:** 5
**Notes:** Uses project-root-resolver.ts like the other cores. Estimate raised 3 -> 5 at Gate 4: multi-file local-day assembly plus the incomplete flag. Window validation (Zod datetime, ordering, 26-hour cap, file-count bound) lives here so HTTP and native share it (OQ-14, resolved at Gate 4); the window is never a path component. Estimate stays 5: the validation is a small, test-heavy addition to the multi-file assembly already sized at 5.
**Done:** [ ]

### Task 10: Add HTTP routes and `createTransport` client with native backend, web-stub and response validation (FR-9)
**What:** Expose read-log and set-goal via API routes and a `lib/api` module resolving through `createTransport`, with a native backend, web-stub, and Zod-validated HTTP responses. The read route takes required `from`/`to` query parameters from `new URL(req.url).searchParams`; the `lib/api` client (this task, not Task 12) computes the local day's start and end ISO instants and sends them.
**Files:** frontend/app/api/project/writing-log/route.ts (new), frontend/src/lib/api/writing-log.ts (new), frontend/src/store/transport/native-writing-log-backend.ts and .web-stub.ts (new), frontend/src/lib/api/schemas.ts, frontend/next.config.mjs (turbopack resolveAlias for the new specifier), tests
**Done when:** tests written first confirm: the route derives the project root from a validated `projectId` and takes no client path; HTTP methods reject on non-2xx and report a malformed body via `reportTransportValidationFailure` per its module's contract (read rejects rather than degrading to zero); native returns the same result as HTTP for the same fixture; a locked project maps to 401/409 through with-storage-context; a rejected window (missing, non-ISO, `to` not after `from`, over the 26-hour cap) maps to HTTP 400 on the route and the native backend throws the same rejection for the same input, both via Task 9's core; the client computes the local day's start and end instants (including a DST-length day) and sends them as `from`/`to`, verified with a fake clock and timezone; the window never appears in a path; the web build has no `node:*` reachable from the web-stub; `pnpm typecheck` clean.
**Depends on:** 9
**Estimate:** 5
**Notes:** Follow entity-mention-counts.ts + native-entity-mention-counts-backend.ts. Failure must not render as zero words. Estimate stays 5: the window parameter, the 400 mapping and the client computation replace no existing work, but are small additions to a route and client already sized at 5, whose validation itself is in Task 9.
**Done:** [ ]

### Task 11: Add a `dailyWordGoal` control to ProjectSettingsDialog (FR-6)
**What:** Add a numeric field to set and clear the daily goal, saved through the goal transport.
**Files:** frontend/components/Layout/ProjectSettingsDialog.tsx, its existing tests, its story
**Done when:** read the component's props and story args first; tests written first confirm: the field shows the current goal or empty; entering a valid number saves via the transport; clearing saves as unset; a negative or non-integer value is rejected with an accessible error message; it is labelled distinctly from `wordCountGoal`; a failed save surfaces an error rather than silently reverting; existing dialog tests pass; `pnpm lint` no new errors.
**Depends on:** 10
**Estimate:** 3
**Done:** [ ]

### Task 12: Add the expandable footer goal display in EditView (FR-7, FR-8)
**What:** Add a collapsed-by-default disclosure to the footer showing today-versus-goal, expanding to added/deleted/net and the import line, with persisted state.
**Files:** frontend/components/WorkArea/EditView.tsx (footer ~:407), a new small component under frontend/components/WorkArea/, a localStorage helper in frontend/src/lib/ (modelled on update-notice-suppression.ts / user-preferences.ts), tests
**Done when:** tests written first confirm: collapsed shows 'Today: N / G' as text, or just net when no goal; expanded adds added, deleted, net and a separate import line excluded from the comparison; default is collapsed with no stored value; toggling writes `getwrite.editFooter.expanded` and a remount restores it; the helper survives `typeof window` undefined and a throwing localStorage; the toggle is a native `<button type="button">` with `aria-expanded`, `aria-controls` and a visible name 'Today's writing', and controls a region with that id; no Esc handler, no Radix; the goal display is outside the `aria-live` region (:423); the "today's count may be incomplete" text renders when the aggregate's incomplete flag (from log marker entries, Task 9) or Task 6's session-flag fallback is set, and not otherwise; no red class or token on the goal display; the existing red 'Unsaved edits' text (:419) is unchanged; existing editView tests pass.
**Depends on:** 6, 10
**Estimate:** 5
**Notes:** Not reusable: CollapsibleSection.tsx (only sidebar/workarea variants); use it and tests/a11y/collapsiblesection.a11y.test.tsx as pattern references only.
Superseded in part at Gate 6 (2026-09-26, Amended at Gate 6 by the user): the inline expand/collapse, the collapsed-by-default rule, the `getwrite.editFooter.expanded` persistence and the disclosure a11y (`aria-expanded`, `aria-controls`, no Esc, no Radix) are replaced by Task 17's overlay. The Done history above is unchanged.
**Done:** [ ]

### Task 13: Storybook story and a11y test for the footer display (FR-7, FR-8)
**What:** Add a story covering collapsed, expanded, no goal, import line, and incomplete marker, plus an axe a11y test.
**Files:** the new footer component's *.stories.tsx, frontend/tests/a11y/ (new file modelled on collapsiblesection.a11y.test.tsx), frontend/tests/a11y/helpers/axe.ts
**Done when:** an axe check passes for collapsed and expanded states; a keyboard test confirms Enter and Space toggle and focus stays on the button; the story renders all listed states and `pnpm test-storybook` for it passes (run outside the sandbox); story opts in with `a11y: { test: "error" }`.
**Depends on:** 12
**Estimate:** 2
**Notes:** Superseded in part at Gate 6 (2026-09-26, Amended at Gate 6 by the user): the collapsed/expanded story states and the disclosure toggle keyboard test are replaced by Task 18's overlay story and dialog tests. The Done history above is unchanged.
**Done:** [ ]

### Task 14: Update docs (all FRs)
**What:** Document the writing log, the daily goal, the footer, the blind spots and the reindex guarantee.
**Files:** docs/features/ (new writing-log.md; docs/features/project-configuration.md), docs/user/project-configuration.md, docs/user/ (footer/goal description), docs/features/cli.md (reindex does not clear the log), docs/api/openapi.yaml (new route), CLAUDE.md Code Map and Glossary entries
**Done when:** docs state: per-day file layout and append-only meaning, day files keyed by UTC date with the local day derived at read time from timestamps (OQ-8 as amended at Gate 4), the marker entry for skipped saves, word-bag blind spots, no backfill, imports shown separately and excluded from the goal, non-canonical saves not logged, the skipped-save signal, `dailyWordGoal` distinct from `wordCountGoal`; openapi parses as YAML; links resolve.
**Depends on:** 7, 8, 10, 12
**Estimate:** 2
**Notes:** Footer wording superseded in part at Gate 6 (2026-09-26, Amended at Gate 6 by the user): the expandable-footer and `localStorage` text this task wrote is corrected by Task 18. The Done history above is unchanged.
**Done:** [ ]

### Task 15: Final verification gate
**What:** Run the repository gates and confirm each FR has passing coverage.
**Files:** none (verification only)
**Done when:** from `frontend/`: `pnpm typecheck` clean, `pnpm lint` no new errors, `pnpm test:ci` passes; `pnpm knip` from the repo root shows no new findings; the footer story test passes (outside the sandbox); `pnpm build` completes with no `node:*` leak from the native writing-log backend.
**Depends on:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
**Estimate:** 1
**Notes:** Record baseline counts before starting.
**Done:** [ ]

### Task 16: Fix daily-goal save using the wrong project id (FR-6)
**What:** Make the Project Settings dialog's daily-goal save use the project's directory id, and check every other place Feature 59 passes a project id for the same mistake.
**Files:** frontend/components/Layout/AppShell.tsx (:1119 passes `projectId={project?.id}` to ProjectSettingsDialog; other call sites at :566, :774, :886, :908, :926, :1178 use `getProjectDirectoryId(project.rootPath)`, src/store/projectsSlice.ts:858), frontend/components/Layout/ProjectSettingsDialog.tsx, frontend/components/Layout/DailyWordGoalField.tsx, frontend/tests/dailyWordGoalField.test.tsx, frontend/tests/projectSettingsDialogDailyGoal.test.tsx, a new or existing AppShell-level test
**Done when:** a test written first FAILS on the current code and passes after the fix; it uses a project whose `id` differs from its directory basename and asserts the goal transport receives the directory id; a second test at the level that would have caught it (ProjectSettingsDialog rendered through AppShell wiring, not only the field with a mocked prop) does the same; every other Feature 59 site that passes a project id (footer GET reads, goal transport callers) is checked and the result recorded in Notes; `pnpm typecheck` and `pnpm lint` clean.
**Depends on:** 11
**Estimate:** 2
**Notes:** Measured by the exercise agent (Stage 6.5): saving the goal in Project Settings > Default Revision Name showed "Failed to save daily goal: Failed to save the daily word goal (HTTP 500)."; server log `PUT /api/project/writing-log 500` with `ENOENT ... open '<workspace>/4943675f-.../project.json'` at frontend/src/lib/models/writing-log-core.ts:182; 4943675f-... is the `id` field inside project.json while the project directory name was af142f76-...; the same PUT via curl with the directory id returned 200 and wrote dailyWordGoal. The footer GET reads returned 200 with the directory id. The cause (wrong id passed at AppShell.tsx:1119) is a hypothesis until the fix is tried; the lead verified the differing call sites by reading. Why the Task 11 tests did not catch it (read, not run): tests/dailyWordGoalField.test.tsx renders `DailyWordGoalField` with the literal `projectId="p1"`, and tests/projectSettingsDialogDailyGoal.test.tsx renders `ProjectSettingsDialog` with a `projectId` argument supplied by the test itself; neither renders AppShell or derives the id from a project object, so the id AppShell computes was never exercised. Verification step (lead, not an implementor task): after the fix, re-exercise the goal save in the running app. Also observed by the exercise, NOT part of this task, unresolved, cause not established: a 0/0/0 entry logged about one second after opening a resource before any typing, and the expanded footer wrapping into cramped lines at ~1200px width.
**Done:** [ ]

### Task 17: Replace the inline expandable footer with a writing-details overlay opened from the existing Today's writing button (FR-7, FR-8)
**What:** Keep the footer's "Today's writing" text button, the collapsed figure and the incomplete marker; stop expanding inline; open a closeable modal/overlay with added, deleted, net, the import line and the incomplete marker; give the button a HoverTip; remove the expanded-state persistence.
**Files:** frontend/components/WorkArea/WritingLogFooterDisplay.tsx, frontend/components/WorkArea/EditView.tsx (footer ~:407), a new overlay component under frontend/components/WorkArea/ built on the component chosen for OQ-15/OQ-16, frontend/components/common/UI/HoverTip.tsx (consumer only), frontend/src/lib/edit-footer-state.ts and frontend/tests/unit/edit-footer-state.test.ts (remove, or repurpose only if a use is found), existing footer tests
**Done when:** read `frontend/components/common/UI/Dialog` props and stories, `UnlockModal.tsx` and `ConfirmDialog.tsx` first (the pattern was confirmed from those two only); tests written first confirm: the footer shows the figure ("Today: N / G", or net with no goal) and the incomplete marker without opening anything; the button opens the overlay, which holds added, deleted, net, the separate import line (excluded from the comparison) and the incomplete marker; the overlay is a blocking modal built directly on `UI/Dialog` (`DialogContent` in the `UnlockModal.tsx` layout, `DialogTitle` "Today's writing", `DialogDescription` naming the goal or "No daily goal set", a single close button in `DialogFooter`), and does not use `ConfirmDialog` (no confirm button, no `onConfirm`/`onCancel`); if no description is rendered the Radix describedby warning is suppressed as `ConfirmDialog` does; its body shows exactly Added, Deleted, Net, "Imported (not counted toward goal)" and the incomplete marker, with no progress bar, local date, explanation text or goal editor (at most a plain-text hint pointing to Project Settings); its numbers are fetched on open and do not change while it is open, while the footer figure stays live; Esc closes it; focus moves into it on open and returns to the "Today's writing" button on close; the button's tooltip text is exactly "Show today's writing details" via HoverTip, and the details are also reachable without hover (the tooltip is the only hover-only element); nothing reads or writes `getwrite.editFooter.expanded` (a test asserts localStorage is untouched); `aria-expanded`/`aria-controls` are gone from the button; `edit-footer-state.ts` and its test file are removed (knip clean) or, if repurposed, a stated non-footer use exists; the goal display remains outside the `aria-live` region (:423) and has no red class or token; the existing red "Unsaved edits" text (:419) is unchanged; existing footer tests are updated only where they asserted the inline expansion or the localStorage key, each change listed in Notes; existing editView tests otherwise pass; nothing from Features 60/62 is added.
**Depends on:** 12, 13, 16
**Estimate:** 5
**Notes:** Amended at Gate 6 by the user (2026-09-26); supersedes parts of the Gate 3 resolutions (OQ-10 to OQ-13). OQ-15 to OQ-19 resolved at Gate 6 by the user ("Take your recs"), 2026-09-26: blocking modal on `UI/Dialog` (not `ConfirmDialog`); read-only overlay, goal set only in Project Settings; title "Today's writing"; figure stays inline in the footer. Known separate issue, not in scope: AppShell's config copy of `dailyWordGoal` is stale after a save until the project reloads (`DailyWordGoalField.tsx` `initialGoal` only seeds state; `AppShell.tsx:1124`). Tooltip copy "Show today's writing details" is the user's option A with only the collapsed-state wording applying (the lead's inference, since a modal has no expanded state). Estimate 5: UI restructure plus removal of persistence plus updating existing footer tests, on the footer Task 12 sized at 5.
**Done:** [ ]

### Task 18: Overlay story, dialog a11y tests and docs update (FR-7, FR-8)
**What:** Update the footer story and a11y tests for the overlay, and correct the docs that describe the expandable footer and the localStorage key.
**Files:** frontend/stories/WorkArea/WritingLogFooterDisplay.stories.tsx, frontend/tests/a11y/ (footer test, modelled on tests/a11y/dialog.a11y.test.tsx), frontend/tests/a11y/helpers/axe.ts, docs/features/writing-log.md (:64 footer line), docs/user/writing-log.md, CLAUDE.md (Code Map "Writing log (Feature 59)" line at :160 and the Glossary "Daily word goal" entry at :269)
**Done when:** the story shows the closed footer (goal, no goal, incomplete marker) and the open overlay (with import line and incomplete marker) and opts in with `a11y: { test: "error" }`; an axe check passes for the footer and for the open overlay; a keyboard test confirms Enter and Space open it, Esc closes it, and focus returns to the button; a test asserts the button tooltip copy "Show today's writing details" and the read-only content (title, goal description, Added/Deleted/Net/"Imported (not counted toward goal)", no goal editor); `pnpm test-storybook` for it passes (outside the sandbox); the three docs no longer describe an inline expandable footer, collapsed-by-default behaviour, or `getwrite.editFooter.expanded`, and describe the overlay, the tooltip copy and that it is intended as the later home for Feature 60/62 diagnostics without claiming they exist; a grep of docs/ and CLAUDE.md for `editFooter` and "expandable" finds no stale description.
**Depends on:** 17
**Estimate:** 3
**Notes:** Amended at Gate 6 by the user (2026-09-26). Estimate 3: story states and dialog tests replace Task 13's, plus three doc edits.
**Done:** [ ]

## Summary
- Total tasks: 18
- Total estimated effort: 59 points (was 51; Task 17 +5 and Task 18 +3, appended at Gate 6 to replace the inline expandable footer with a writing-details overlay; earlier: Task 2 +1, Task 9 +2, Task 16 +2)
- Critical path: 2 -> 3 -> 5 -> 6 -> 12 -> 13 -> 15 (Tasks 1 -> 9 -> 10 -> 11 -> 12 is comparable; Task 9 is now 5, so this second path is 1(2) + 9(5) + 10(5) + 11(3) + 12(5) = 20 points against the first path's 2(3) + 3(5) + 5(5) + 6(3) + 12(5) = 21 before Tasks 13 and 15, so 2 -> 3 -> 5 -> 6 -> 12 remains the critical path)
- Risks: Tasks 17 and 18 are no longer blocked in design (OQ-15 to OQ-19 resolved at Gate 6, "Take your recs"); the Task 15 gate must be re-run after them. Estimates unchanged (17 stays 5, 18 stays 3): the resolutions fix the component and content without adding or removing work. Task 5 edits the primary canonical save path and must never fail a content save because logging failed. Task 12 is the largest UI task and depends on props discovered from the existing footer. Task 1 shares schemas.ts lines with Feature 61, which must land after. Task 7 must ensure imports do not also trigger the Task 5 hook (double counting). The FR-11 diff cost is unmeasured; no benchmark task is added because a debounced per-save O(n) diff is not a suspected bottleneck.

## Parallelism
- Tasks 1, 2 and 4 have no dependencies and can start together (1 and 2 both edit schemas.ts, so sequence them or merge carefully).
- After 3: Tasks 5, 7 and 8 can proceed; Task 9 needs 1 and 3.
- Task 16 needs only Task 11 (done); it was appended after Task 15 and, as a bug fix, is worked first and before re-running the Task 15 gate.

- Task 17 needs 12, 13 and 16 and may start now that OQ-15 to OQ-19 are resolved; Task 18 follows 17. Critical path is now 2 -> 3 -> 5 -> 6 -> 12 -> 17 -> 18 (Task 13 is done history; 17 also needs 16).

## FR coverage
- FR-1: 2, 3, 9
- FR-2: 4, 5
- FR-3: 2, 7
- FR-4: 2, 3
- FR-5: 2, 5, 6, 9, 12
- FR-6: 1, 9, 11, 16
- FR-7: 9, 10, 12, 13, 17, 18
- FR-8: 12, 13, 17, 18
- FR-9: 10
- FR-10: 7
- FR-11: 4
- FR-12: 8
- FR-13: 1

## Open Questions

None.

OQ-14 (the local-day window) was resolved at Gate 4 by the user ("take your recs"). OQ-15 to OQ-19 (the writing-details overlay) were resolved at Gate 6 by the user ("Take your recs"), 2026-09-26; see the source spec for each resolution.
