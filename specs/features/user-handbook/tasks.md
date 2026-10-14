# Tasks: User handbook, structure and the existing pages absorbed (Feature 81)

Source spec: `specs/features/user-handbook.md` (FR-1..FR-19, US-1..US-4). Gate 3 answers of 2026-10-14 are folded in (OQ-1 option b: unreleased-since-2.2.0 statements stay with a visible note; OQ-2 option c: every statement must be `run`; OQ-3: two run methods, no GitHub links to developer docs; OQ-4: six folders and file names accepted, owner takes a final look before merge; OQ-5: no placeholders for Features 82 to 85; OQ-6: recorded base commit stands, re-check only touched pages before merge). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 81. Features 82 to 85 are NOT part of this list.

Shape of the work: a run harness and CLI build; a baseline inventory of every statement on the 21 old pages with the per-section release check against `getwrite-v2.2.0`; then verification split by handbook part, each task producing its pages and their record rows; then index, stubs, link repair, the sharing grep, the pre-merge re-check, the one-off link check, final suites, and a stop for the owner. This list changes no app code. A defect found in the app is recorded and reported, never fixed.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Write only under `docs/user/`, `README.md`, the five developer docs repointed under FR-8 (`docs/features/project-types.md`, `docs/features/revisions.md`, `docs/features/editor/headings.md`, `docs/features/editor/settings.md`, `docs/features/data/metadata.md`) and `specs/features/user-handbook/` (FR-18). Never edit `frontend/components/help/help-content.ts` or any app code. No Features 82 to 85 content (no new coverage, no runtime-difference parts, no Upcoming section, no `status` key, no placeholders in `index.md`). Do not edit pages for style; edits are only those verification, the moves, splits and link repairs require.
- **Where things run.** Anything that starts Electron, `next dev`, `next start` or a standalone server, Storybook, Playwright, or uses `ps`/`lsof` on processes runs OUTSIDE the command sandbox (inside it these fail with `EMFILE` or `Operation not permitted`). Builds fail in git worktrees on this machine (cause not established), so builds and app runs happen in the main checkout, one at a time, never two at once. `pnpm cli:build`, unit suites (`pnpm test:ci`, `pnpm typecheck`, `pnpm lint`), `pnpm knip`, git, grep and the link check run INSIDE the sandbox. Every record row and every task note says which was used. Logs of out-of-sandbox commands go under `/tmp/getwrite-handbook/logs/` or under `specs/features/user-handbook/`, never under the sandbox `$TMPDIR`; never paste a log that contains a secret.
- **Process-safety rules, repeated by every task that starts anything (FR-17).** (1) Before starting any process, check each port it will use, and also 7340, 3000 and 6006, with `lsof -nP -iTCP:<port> -sTCP:LISTEN`. Record what is found on 7340 and 3000 (the owner's app may be open) and never touch it; refuse to run only if the task's own chosen port is busy. (2) Record every pid started and every descendant (`ps -o pid=,ppid=` walk); stop ONLY recorded pids, by pid, never by name or port, never `pkill`/`killall`; confirm they exited and that no listener remains on the task's own port. (3) Throwaway folders (projects folder, user-data folder, logs folder, fake repo root) live under `/tmp/getwrite-handbook/<run-id>/` with paths ASSERTED in the script before anything starts (exit unless `realpath` starts with that prefix), and are removed afterwards with the removal confirmed. (4) NEVER read, list or write `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite`, `~/Library/Logs/getwrite-electron` or the repo's `projects/`. (5) Never print, log or write secrets, cookies, pairing codes, passphrases or window secrets; record presence only.
- **Recording rule (FR-11, FR-12, FR-13).** `specs/features/user-handbook/verification.md` has one section per handbook page and one row per factual statement (a sentence claiming what the app shows or does, a label, a key, a default, a file or folder location, or a command): short quote; label `run` or `dropped` (a `read` label may appear in an evidence note for context but never earns a `kept` or `corrected` outcome); build and runtime named exactly as "desktop, Electron dev, fake root" or "web build of the same frontend" (or "CLI, built, throwaway project"); evidence (command and observed result); outcome `kept`, `corrected` or `dropped`. A contradicted statement is corrected to what was observed or dropped, and the row keeps the original and the observed result. A statement with no row is dropped from the page. Facts are written as measured; no cause is named unless an experiment separated it from the alternatives; causal or promissory wording ("so it never piles up", "signed-soon", "planned for a future release") is dropped or reduced to what was measured. A desktop-only control (Scrivener and Word import buttons, native file pickers, the workspace folder, the desktop global noise words) that cannot be run by the desktop method is dropped.
- **Per-page rules for every verification task.** Front matter holds exactly `title`, `order`, `summary` (summary is one sentence on one line) with `order` taken from the sequence fixed in Task 2. Links are relative and stay inside `docs/user/handbook/`; callouts to developer docs are dropped; no GitHub links to developer docs. Each page ends with a "Warnings and limits" section (only items confirmed during verification, otherwise "None recorded.") and then the line `Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit <short sha>.` (use the exact form from FR-10; the sha is the commit the page was checked on). Where the release check shows a statement came from a change merged after `getwrite-v2.2.0`, the section carries the plain line `Not yet in a release (merged after 2.2.0).` and the statement is entered in the separate "Not yet in a release" table of the record. No page may mention home-network sharing (FR-9).
- Implementors do not commit and do not push; the orchestrator commits. Do not switch branches (`docs/user-handbook` stays checked out).
- Task order: every dependency appears earlier in the list. Task 16 is a stop for the owner and is NOT executable by an implementor; the orchestrator leaves it unticked until the owner acts and does not treat that as a failure.

### Task 1: Run harness and CLI build
**What:** Produce the scripts that start the two runtimes and the CLI against throwaway folders under the FR-15 to FR-17 safety rules, and prove each works once.
**Files:** Creates `specs/features/user-handbook/scripts/lib/safety.mjs` (port check with `lsof`, pid recording and descendant walk, stop-by-pid, path assertion under `/tmp/getwrite-handbook/`, secret redaction), `specs/features/user-handbook/scripts/desktop-dev.mjs` (Electron dev run from a throwaway fake repo root with `--user-data-dir=<tmp>` and a throwaway app `name`, modelled on `specs/features/desktop-server-port/scripts/dev-ports.mjs`), `specs/features/user-handbook/scripts/web-standalone.mjs` (built standalone server with throwaway `GETWRITE_PROJECTS_DIR` and related variables, modelled on `specs/features/two-client-save-measurement/scripts/lib/server.mjs`), `specs/features/user-handbook/scripts/cli.mjs` (builds the CLI with `pnpm cli:build`, creates a throwaway project, prints the executable name the CLI answers to), `specs/features/user-handbook/runs.md` (how to start and stop each, ports, runtimes names to use in the record). No app code changes.
**Done when:** `desktop-dev.mjs` starts the unpackaged Electron app (outside the sandbox) with every path asserted throwaway, a screenshot or window title is captured, the pids are stopped by recorded pid and `lsof` shows no listener left on the chosen ports; a check afterwards shows nothing was created under `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite` or the repo's `projects/` (checked by `git status --short projects/` and by comparing a pre-run and post-run `ls -ld` modification time of the two home paths, without listing their contents); `web-standalone.mjs` starts the built standalone server on a free port and answers `GET /` with 200, then is stopped by pid with the same cleanup confirmation; `cli.mjs` builds the CLI, runs `--help` and one command against a throwaway project, and records the exact executable name the CLI answers to (the old pages write `getwrite`; the notes name `getwrite-cli`); `runs.md` records what was found on 7340, 3000 and 6006 before each run and the output of each proof run; throwaway folders are removed and removal confirmed. A busy chosen port makes the script refuse; a busy 7340 or 3000 is recorded and left untouched.
**Depends on:** none
**Estimate:** 5
**Notes:** Satisfies FR-15, FR-16, FR-17. The desktop and web runs and `lsof`/`ps` run OUTSIDE the command sandbox; `pnpm cli:build` runs inside. `GETWRITE_PROJECTS_DIR` alone does not redirect the dev desktop app (read, not run: `electron/src/projects-dir.ts:411-418`), so the fake repo root and `--user-data-dir` are required. A build that fails in a worktree must be run in the main checkout. If Electron cannot be pointed at throwaway folders, record that as a blocker; desktop-only statements are then dropped (OQ-2/FR-15), not read.
**Done:** [x]

### Task 2: Baseline inventory, release check and record skeleton
**What:** List every factual statement on the 21 old pages into the verification record skeleton, fix the handbook page order, and run the per-section release check against `getwrite-v2.2.0`.
**Files:** Creates `specs/features/user-handbook/verification.md` (one section per planned handbook page, every statement as a row with outcome blank, plus the empty "Not yet in a release" table and the order table); reads all 21 files under `docs/user/` and `git` history only.
**Done when:** `verification.md` has a section for each of the 22 handbook pages (`getting-started/installing.md`, `organize/start-page.md`, `organize/project-types.md`, `organize/resource-tree.md`, `write/editor.md`, `write/writing-log.md`, `write/headings.md`, `write/editor-appearance.md`, `write/search.md`, `story/metadata.md`, `story/metadata-queries.md`, `views/organizer.md`, `views/data.md`, `views/diff.md`, `views/timeline.md`, `views/entity-roster.md`, `views/entity-relationship-graph.md`, `protect-and-finish/revisions.md`, `protect-and-finish/trash.md`, `protect-and-finish/resources.md`, `protect-and-finish/compiling.md`, `protect-and-finish/project-configuration.md`) and the row count per old page is stated; each of the 21 old files is accounted for by name, with `features.md` statements assigned either to `index.md` intro, `write/editor.md`, or marked "duplicates another page, not carried" (the home-network-sharing section of `features.md` and the sharing sentence in `start-page.md` are marked excluded under FR-9, and are not given verification rows); an order table gives each page an `order` integer unique across the handbook, `index.md` as 0, then 10, 20, ... in the sequence of the index (parts in the order getting-started, organize, write, story, views, protect-and-finish; pages within a part in the mapping table's order); for every row that names a feature the release check records the introducing commit or PR (the PR list from OQ-1 as a starting point) and the result of `git merge-base --is-ancestor <commit> getwrite-v2.2.0` (exit status quoted), and those with exit status 1 are entered in the "Not yet in a release" table with page, section, statement, commit or PR and result; the decision per statement and its evidence are recorded; the base commit sha of the checkout (`git rev-parse --short HEAD`) and root `package.json` version are recorded, with `git rev-list --count getwrite-v2.2.0..HEAD`.
**Depends on:** none
**Estimate:** 5
**Notes:** Satisfies FR-9, FR-10, FR-11, FR-12, FR-6. Git and grep only: inside the sandbox, no app needed. Do not decide `kept`/`dropped` here; this task only inventories. Record the statement list verbatim in short quotes so Tasks 3 to 8 can pick it up without rereading by guess. Run-order-wise this can be done in parallel with Task 1.
**Done:** [ ]

### Task 3: Verify and write getting-started and organize pages
**What:** Run every statement on `installing.md`, `start-page.md`, `project-types.md` and `resource-tree.md` and write the four handbook pages.
**Files:** Creates `docs/user/handbook/getting-started/installing.md`, `docs/user/handbook/organize/start-page.md`, `docs/user/handbook/organize/project-types.md`, `docs/user/handbook/organize/resource-tree.md`; fills the corresponding sections of `specs/features/user-handbook/verification.md`.
**Done when:** every statement on the four old pages has a row marked `run` (runtime named) or `dropped`, outcome `kept`/`corrected`/`dropped`, with the command and observed result; installing steps that cannot be run (signing, drag to Applications, downloads) are dropped and recorded as dropped; the sharing sentence in the App Settings bullet of `start-page.md` is absent from the new page; each page has exactly the three front-matter keys with its `order` from Task 2, a "Warnings and limits" section, any "Not yet in a release" note per the release check (with the table updated), and the verified-against line with the sha used; no link leaves `docs/user/handbook/`; no causal or promissory wording remains.
**Depends on:** 1, 2
**Estimate:** 5
**Notes:** Needs the app running: desktop method for Start Page buttons, imports and workspace folder, web method for the rest. Out of the sandbox for app runs. Stop and clean up per the process-safety rules after each run. The original old files are left untouched until Task 10.
**Done:** [ ]

### Task 4: Verify and write the write part
**What:** Run every statement on `writing-log.md`, `editor/headings.md`, `editor/settings.md`, `search.md` and the "Rich text editor" statements of `features.md`, and write `write/` pages.
**Files:** Creates `docs/user/handbook/write/editor.md`, `docs/user/handbook/write/writing-log.md`, `docs/user/handbook/write/headings.md`, `docs/user/handbook/write/editor-appearance.md`, `docs/user/handbook/write/search.md`; fills their sections of `verification.md`.
**Done when:** each statement has a `run` or `dropped` row as in the recording rule; `editor.md` contains only statements that were on `features.md` and are now verified (nothing new); `features.md` statements found only there and kept are placed on the page for their topic and recorded as such; the writing-log page's known bag-of-words limit (a moved paragraph counts as nothing) appears under Warnings and limits only if observed; writing-log statements carry the "Not yet in a release" note and table row per the release check; `editor/settings.md` content lands in `editor-appearance.md` with the new name; front matter, warnings sections and verified-against lines are present on all five pages.
**Depends on:** 1, 2
**Estimate:** 5
**Notes:** Needs the app running (web build for most; desktop method for any desktop-only control). Out of the sandbox. Writing-log checks should use throwaway projects only. Facts as measured; no cause for any observed count.
**Done:** [ ]

### Task 5: Verify and write the story part
**What:** Run every statement on `metadata.md` and `metadata-queries.md` and write the two story pages.
**Files:** Creates `docs/user/handbook/story/metadata.md`, `docs/user/handbook/story/metadata-queries.md`; fills their sections of `verification.md`.
**Done when:** every statement (tags, providers, subtypes, field types, query operators, saved queries and smart folders as they occur in the old pages) has a `run` or `dropped` row with the observed result; tags, providers and subtypes remain inside `metadata.md`; subtype statements carry the "Not yet in a release" note and table row per the release check; front matter, warnings sections and verified-against lines are present; no link leaves the handbook.
**Depends on:** 1, 2
**Estimate:** 5
**Notes:** Needs the app running, web build of the same frontend unless a statement names a desktop control. Out of the sandbox. Statements the evaluator treats differently from the page's wording are corrected to the observed behaviour, with original and observed kept in the row.
**Done:** [ ]

### Task 6: Verify and write the views part
**What:** Run every statement on the six view pages and write them into the handbook.
**Files:** Creates `docs/user/handbook/views/organizer.md`, `data.md`, `diff.md`, `timeline.md`, `entity-roster.md`, `entity-relationship-graph.md`; fills their sections of `verification.md`.
**Done when:** each of the six pages has every statement as a `run` or `dropped` row; Organizer filtering, icons and drag reorder, entity graph connection types, positions and focal point, and status roll-up statements carry the "Not yet in a release" note and table row where the release check says so; keyboard-less drag and other limits are listed under Warnings and limits only if observed; front matter, verified-against lines and relative links are in place on all six.
**Depends on:** 1, 2
**Estimate:** 8
**Notes:** Needs the app running; the largest verification unit (timeline is 88 lines, graph 50). If it overruns one session, split by pages and record which pages are done in `verification.md`; do not tick the task until all six pages are complete. Out of the sandbox. Drag and pointer statements are run through the real UI (Playwright against the throwaway build is acceptable as the observation method, named in the row).
**Done:** [ ]

### Task 7: Verify and write revisions, trash and the CLI commands
**What:** Run every statement on `revisions.md` (including its Trash section) and every `prune`, `reindex` and `repair-revisions` command statement that occurs on the old pages, and write `revisions.md` and `trash.md`.
**Files:** Creates `docs/user/handbook/protect-and-finish/revisions.md`, `docs/user/handbook/protect-and-finish/trash.md`; fills their sections of `verification.md`.
**Done when:** `trash.md` holds only the statements the old "Deleting and recovering resources (Trash)" section already made, each with a `run` row; the page uses the command name the CLI answers to (from Task 1) and each command statement was run against a throwaway project with the built CLI, with the command and observed output in the row; statements about automatic pruning are corrected to the observed behaviour (the old pages contradict each other: `features.md` says GetWrite "quietly trims old history", `revisions.md` says the app does not prune on its own and ignores `maxRevisions` and `autoPrune`), with original and observed kept; candidate warnings (permanent Trash deletion cannot be undone, protected revisions and the revision cap) appear under Warnings and limits only when confirmed by a run; protect-revision and repair-revisions statements carry the "Not yet in a release" note and table row per the release check; front matter, verified-against lines and links are in place on both pages.
**Depends on:** 1, 2
**Estimate:** 5
**Notes:** Needs the app running (web build) and the built CLI. App runs out of the sandbox; CLI runs inside. Use throwaway projects only; a CLI command run against anything other than a path asserted under `/tmp/getwrite-handbook/` is a defect in the run.
**Done:** [ ]

### Task 8: Verify and write resources, compiling and project-configuration
**What:** Run every statement on `resources.md`, `compiling.md` and `project-configuration.md` and write the three pages.
**Files:** Creates `docs/user/handbook/protect-and-finish/resources.md`, `compiling.md`, `project-configuration.md`; fills their sections of `verification.md`.
**Done when:** each statement has a `run` or `dropped` row; configuration keys, defaults and file locations named on `project-configuration.md` are each shown by an observed run (an observed value, not a source quote); a goal field showing a stale value after save until reload appears under Warnings and limits only if observed; word-count goal statements carry the "Not yet in a release" note and table row per the release check; front matter, verified-against lines and links are in place on all three pages.
**Depends on:** 1, 2
**Estimate:** 5
**Notes:** Needs the app running (web build; desktop method for the workspace folder and any desktop-only setting, otherwise dropped). Out of the sandbox. Compile and export checks use throwaway content only. The CLI commands on `project-configuration.md` follow the Task 7 method and the executable name found in Task 1.
**Done:** [ ]

### Task 9: Write index.md
**What:** Write the handbook contents page and the intro statements kept from `features.md`.
**Files:** Creates `docs/user/handbook/index.md`; updates `verification.md` for any intro statement.
**Done when:** `index.md` has front matter with exactly `title`, `order: 0` and `summary`; it lists every one of the 22 handbook pages, grouped by the six parts, as a relative link with the page's title and one-line summary taken from that page's front matter, in `order` sequence; every page is linked from it and no link points to a missing file; it has no placeholder or unlinked entries and no mention of Features 82 to 85; it carries no verified-against line; any intro statement is verified with a `run` row or removed.
**Depends on:** 3, 4, 5, 6, 7, 8
**Estimate:** 2
**Notes:** Satisfies FR-2, FR-4. No app needed unless an intro statement requires a run, in which case use the harness outside the sandbox.
**Done:** [ ]

### Task 10: Replace the 21 old pages with stubs
**What:** Turn each old `docs/user/` page into a stub of at most five lines linking to its new page(s).
**Files:** Modifies the 21 files under `docs/user/` (the ones listed in the mapping table of the spec).
**Done when:** every old path exists and is at most five lines, with a heading naming the page, one sentence saying it moved, and a relative link to the new page (to each new page for `features.md` -> `handbook/index.md` and `handbook/write/editor.md`, and `revisions.md` -> `handbook/protect-and-finish/revisions.md` and `handbook/protect-and-finish/trash.md`), no front matter and no other content (`wc -l` output pasted); `editor/settings.md` links to `handbook/write/editor-appearance.md`; the `#why-desktop-not-web` anchor that `README.md` uses still resolves at the target (see Task 11); no old page contains any statement of its own.
**Depends on:** 3, 4, 5, 6, 7, 8, 9
**Estimate:** 2
**Notes:** Satisfies FR-6, FR-7. Inside the sandbox. If `#why-desktop-not-web` is not a heading on the stub, either keep a heading with that anchor on the `installing.md` stub or repoint README (Task 11) to the handbook page; record which.
**Done:** [ ]

### Task 11: Repair links in README and the five developer docs
**What:** Make every `docs/user/` link in `README.md` and the five developer docs resolve, pointing README at handbook pages.
**Files:** Modifies `README.md`, `docs/features/project-types.md`, `docs/features/revisions.md`, `docs/features/editor/headings.md`, `docs/features/editor/settings.md`, `docs/features/data/metadata.md`.
**Done when:** `grep -rn "docs/user\|\.\./user\|user/" ` over the six files lists every user-page link before and after (pasted); every one resolves, including `#why-desktop-not-web` (resolving to an existing heading anchor); README links point at the handbook page rather than a stub where a handbook page exists; each of the five developer docs still resolves (through the stub or repointed to the handbook); no other lines in these files are changed (`git diff --stat` pasted).
**Depends on:** 10
**Estimate:** 2
**Notes:** Satisfies FR-8, FR-18. Inside the sandbox. Before editing, grep for any other file referencing the old paths (including `CLAUDE.md`, `specs/`, `frontend/`); any outside the allowed set is reported to the orchestrator, not edited.
**Done:** [ ]

### Task 12: Sharing-text search
**What:** Run FR-9's search over the handbook and fix any match.
**Files:** Modifies handbook pages only if a match is found; records the result in `verification.md`.
**Done when:** a case-insensitive search of `docs/user/handbook/` for `sharing`, `paired`, `pairing`, `home network` and `7340` returns no match (command and empty output recorded); any match found was removed from its page and its row corrected to `dropped`, with the page's verified-against line unchanged by this edit; the "Not yet in a release" table has one entry per note and every note on a page appears in the table (and the reverse), checked with a grep for the exact note text.
**Depends on:** 9, 10
**Estimate:** 1
**Notes:** Satisfies FR-9, FR-11, FR-19(d), FR-19(f). Inside the sandbox.
**Done:** [ ]

### Task 13: Pre-merge re-check of pages touched by writer-visible commits
**What:** List the writer-visible commits since each page's base commit and re-check only the pages those commits touch.
**Files:** Updates affected handbook pages' verified-against lines and bodies, and `verification.md` (new section "Pre-merge re-check").
**Done when:** `verification.md` lists, for each handbook page, `git log --oneline <base sha>..HEAD` restricted to writer-visible paths (output pasted) and a stated judgement per commit (touches the page or not, with reason); every touched page's affected statements were re-run per the recording rule, and its verified-against line takes the new sha; an untouched page keeps its sha; if no commit touched any page this is stated with the command output; the base commit used in each page's line is a commit that exists (`git cat-file -t` output).
**Depends on:** 9, 10, 11, 12
**Estimate:** 3
**Notes:** Satisfies FR-10, OQ-6. A re-check that needs the app runs outside the sandbox under the safety rules; git inspection runs inside. If a re-checked page's text changes, rerun Task 12's search and Task 14's link check on it.
**Done:** [ ]

### Task 14: One-off link check
**What:** Run a link and anchor check over the handbook, stubs, README and the five repointed developer docs and record it.
**Files:** Creates `specs/features/user-handbook/scripts/check-links.mjs` (one-off, not a committed CI check; the committed check is Feature 85); records command and output in `verification.md`.
**Done when:** the script checks every relative link and `#anchor` in every file under `docs/user/handbook/`, the 21 stubs, `README.md` and the five developer docs, and its output (pasted into `verification.md`) shows zero unresolved links and anchors; it also asserts that no handbook page links to a file outside `docs/user/handbook/` (FR-5), that every handbook page is linked from `index.md` (FR-2), that every page except `index.md` ends with a line starting `Verified against GetWrite`, that each page's front matter has exactly `title`, `order`, `summary` with `order` unique and the `index.md` value 0, and that every stub is at most five lines with no front matter; the script was first shown to fail on a deliberately broken link in a scratch copy under the temp directory (output recorded), and the scratch copy removed.
**Depends on:** 13
**Estimate:** 3
**Notes:** Satisfies FR-19(a), FR-19(b), FR-19(c). Inside the sandbox. If the script finds a defect, repair that specific defect; do not rewrite pages.
**Done:** [ ]

### Task 15: Final suites and no-change confirmation
**What:** Confirm the change touched only docs and the allowed files, and run the final suites as a no-change confirmation.
**Files:** Records results in `specs/features/user-handbook/verification.md` (section "Final suites"); no source change.
**Done when:** `git diff --stat main..HEAD` and `git status --short` outputs are pasted and show changes only under `docs/user/`, `README.md`, the five developer docs, `specs/features/user-handbook/` and the already-present spec edits to `specs/product/getwrite.features.md` and `specs/product/getwrite.md` and `specs/features/user-handbook.md`; `git diff main..HEAD -- frontend electron cli` is empty and `frontend/components/help/help-content.ts` is unchanged (command output pasted); the harness left no processes (`lsof` on every port used and 7340, 3000, 6006 checked, with owner-owned listeners noted and untouched) and no throwaway folders; `pnpm test:ci`, `pnpm typecheck` and `pnpm lint` from `frontend/` and `pnpm knip` from the repo root are run and compared to a baseline run at `main` (counts pasted) as a no-change confirmation, and `pnpm test:e2e` (with `pnpm storybook` started on a port confirmed free, pid recorded and stopped by that pid) is also run as a no-change confirmation because the owner's standing rule is that pipeline final suites include it; the record states plainly that these suites cannot exercise the changed files (Markdown only) and that they confirm no app change, not handbook correctness; the handbook's correctness evidence is the verification record and the link check. A failing suite is recorded with test names and not fixed. Electron and CLI suites are not run, because those packages are untouched (stated, with `git diff --stat` for their paths empty).
**Depends on:** 14
**Estimate:** 3
**Notes:** Satisfies FR-18, FR-19. `pnpm test:e2e`, `pnpm storybook` and `lsof` run OUTSIDE the sandbox in the main checkout; unit suites, knip and git inside. If the baseline at `main` cannot be run in the time, compare against the figures reported by Feature 78 and label them "reported, not re-run".
**Done:** [ ]

### Task 16: Owner's final look at the paths (stop)
**What:** Stop for the owner to take the final look at the six folders, file names and `order` values before merge.
**Files:** Updates `specs/features/user-handbook/verification.md` with the owner's reply only.
**Done when:** the owner has stated in writing (a message the orchestrator records, quoted) that the paths are accepted or has named the changes wanted; a requested rename is applied across the handbook, `index.md`, stubs, README and developer docs with Task 14's link check re-run clean; until then the task stays unticked.
**Depends on:** 15
**Estimate:** 1
**Notes:** Satisfies FR-1, OQ-4. NOT executable by an implementor. Pause here: the paths become a published contract. The pipeline lead presents the `index.md` contents and the order table to the owner.
**Done:** [ ]

## Summary
- Total tasks: 16
- Total estimated effort: 60 story points
- Critical path: 1 → 6 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16
- Risks: Task 1 (Electron pointed at throwaway folders has not been tried; a failure drops all desktop-only statements); Task 6 (largest verification unit, pointer and drag behaviour, may need splitting); Task 7 (command names and prune contradictions; CLI must be run only on throwaway projects); Task 2 (the release check decides which sections get the "Not yet in a release" note, and 622 commits lie since the tag); Task 13 (a main branch that moves again forces re-runs); every task that starts a process (the owner's desktop app may hold 7340 or 3000; only recorded pids may be stopped).
