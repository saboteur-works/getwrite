# Tasks: Desktop defects (Feature 88)

Source spec: `specs/features/desktop-defects.md` (FR-1..FR-27, US-1..US-4). Gate 3 answers of 2026-10-18 are folded in (OQ-1 throwaway `productName` via `-c.productName=...`, `--user-data-dir`, seeded `workspace.json`, safety decided by the FR-22 path assertion; OQ-2 (b) unpacked `--dir` build counts as packaged, launched from a terminal directory and from `/`, reported as "unpacked build launched from `/`", never "Finder-launched"; OQ-3 worker `cwd` is `getRepoRoot()` passed in by main, `GETWRITE_PROJECT_TYPES_DIR` primary; OQ-4 (b) local atomic-write helper in `electron/src/projects-dir.ts`, default file mode, no `sharing/` import, `writeAtomically` untouched; OQ-5 (b) dev app first, then the unpacked build if the safety assertion allows; OQ-6 Playwright-launched app, `will-download` hook without `require`, harness-only `session.setDownloadPath(<throwaway>)`). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 88. Branch: `fix/desktop-defects`, main checkout.

Shape of the work: three independent parts. A blocked or halted part is reported and does not stop the others (FR-27).
- Task 1: baselines.
- Part A, D-8 (Tasks 2-5): starts with the FR-2 failing test. Task 5 (packaged verification) is not a gate on the fix; it may end as "owner's manual check".
- Part B, D-2 (Tasks 6-10): noise-word handler fix (Tasks 6-8) and atomic `workspace.json` write (Tasks 9-10); the two halves do not depend on each other.
- Part C, D-40 (Tasks 11-15): starts with the FR-16 manual compile. Task 11 classifies the result under FR-17 and the later tasks run only for the matching class. Class (c) or (d) ends the part with a record and no build.
- Task 16: final suites (FR-26).

Measurements go in `specs/features/desktop-defects/experiments.md`, in the style of `specs/features/saves-that-lose-data/experiments.md` (environment record, method, observed values, what was not measured). A measurement states what was observed; a cause is written only where an experiment discriminated it from the alternatives.

Tasks that need the desktop app, a build, or any command that starts a process run OUTSIDE the command sandbox and in the main checkout, never a worktree (builds fail in worktrees in this repository): Tasks 1 (e2e, lsof), 4, 5, 8, 11, 12, 13 (re-run), 15 (re-run), 16 (e2e, lsof). Unit suites, typecheck, lint, knip and git run inside the sandbox.

Tasks whose outcome may halt for an owner decision: Task 5 (FR-22 safety not shown: the packaged import becomes the owner's manual check), Task 11 (FR-17 class (c): record and stop Part C; class (d): record, nothing built), Task 12 (same safety condition as Task 5: report as not run).

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tasks run one at a time, sequentially, in the main checkout on branch `fix/desktop-defects`. No worktrees. Do not switch branches. Implementors do not commit and do not push; the orchestrator commits.
- Before starting any app or server, run `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` and record the output. If anything listens on 7340 the run MUST NOT start (the desktop app has no fallback port); report it as not run.
- Never stop a process the task did not start. Record the pid (and descendants) of every process the task starts and stop only those, by pid. Never stop by port or name; never `pkill` or `killall`. Confirm they exited.
- NEVER read, list or write `~/Library/Application Support/getwrite-electron/`, `~/Library/Application Support/GetWrite/`, `~/Documents/GetWrite`, `~/Library/Logs/getwrite-electron`, `~/Library/Logs/GetWrite`, or the repo's `projects/`.
- Every desktop run uses a throwaway user-data directory, a throwaway workspace folder and a throwaway logs folder, and its first action reads `app.getPath("userData")` and `app.getPath("logs")` and stops if either is under a protected folder above (FR-22). That assertion decides safety.
- Never print, log or write credentials, cookies or secrets.
- Logs from out-of-sandbox commands go under `specs/features/desktop-defects/` or `/tmp/getwrite-f88/`, never under the sandbox `$TMPDIR`.
- Write no cause that no experiment separated. Reports say "unpacked build launched from `/`" (and name the other directory), never "Finder-launched". A suite or run not made is reported as not run, never as passing.
- Edit no file under `docs/user/`. Add no IPC channel, route, transport module, native backend, feature flag or user-visible copy. Do not unify `GETWRITE_PROJECT_TYPES_DIR` and `GETWRITE_TEMPLATES_DIR`; do not change the Scrivener worker fork or `frontend/src/lib/projectTypes.ts`.
- Tests are written first (`docs/standards/testing.md`; tests in `electron/tests/`, adding to `projects-dir.test.ts` before creating a file; `frontend/tests/` for any D-40 fix) and code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions) and `docs/standards/failure-visibility.md`. No test imports `electron/src/main.ts`. Run the narrowest relevant file with `pnpm --filter getwrite-electron exec vitest run <file>` (or `pnpm --filter getwrite-frontend exec vitest run <file>`); a fix is not done until the failing test it targets is shown green.
- Halt rule (FR-27): if a part halts, its later tasks are left unticked with the halt noted; the other parts continue and the halt is reported, not worked around.

### Task 1: Baselines on the unfixed tree
**What:** Record the process listing and the unfixed-tree results of the electron, frontend, knip and e2e suites, and create `experiments.md`.
**Files:** Creates `specs/features/desktop-defects/experiments.md` (header plus an environment record and a "Baselines" section). No source change.
**Done when:** `experiments.md` states, each as an observed value with the command and date: the `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` output; from `electron/`, `pnpm typecheck` (exit code), `pnpm test` (passed / failed / skipped) and `pnpm build:worker` (exit code); from `frontend/`, `pnpm test:ci` (counts), `pnpm typecheck` (exit code) and `pnpm lint` (errors and warnings counts); `pnpm knip` from the repo root (finding count and saved-output path); `pnpm test:e2e` from `frontend/` (counts, names of any failures); `git status --short` and `git rev-parse HEAD`. A command that cannot run is recorded as not run with the reason. `git status --short` shows no change outside `specs/`.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-21 (process listing), FR-25, FR-26 (baseline half). `pnpm test:e2e` and `lsof` run OUTSIDE the sandbox; Playwright's webServer config serves Storybook on 6006 with `reuseExistingServer`, so record the 6006 listener first, record the pid of anything this task starts and stop only that, by pid, confirming the listener is gone. Earlier figures (Feature 87: frontend 6468 passed / 1 skipped, e2e 214 passed / 1 skipped) are reported, not current; measure. The uncommitted edits to `specs/product/getwrite.features.md`, `specs/product/getwrite.md` and `specs/features/desktop-defects.md` are the pipeline's; leave them alone.
**Done:** [x]

### Task 2: D-8 extract the DOCX fork-options function and show the FR-2 test red
**What:** Move the options built for the DOCX worker fork (`electron/src/main.ts:661`) into a pure function that returns exactly what main passes today, and add the test that the options carry `GETWRITE_PROJECT_TYPES_DIR` and a `cwd`, red against it.
**Files:** Creates a module under `electron/src/docx-import/` (name TBD by reading; imports nothing from `electron` or `frontend/`) and `electron/tests/` test file for it (a new file only if no suitable one exists under the docx-import tests). Modifies `electron/src/main.ts` to call the function for the DOCX fork only (output identical to today: no `env`, no `cwd`). Reads `electron/src/main.ts` (~661, `resolveDirectories()` ~138-143, Scrivener fork ~540-560), `frontend/src/lib/projectTypes.ts` (~65-83), `electron/electron-builder.yml`, and the Scrivener import pipeline for any project-type read.
**Done when:** the test asserting that the output carries `GETWRITE_PROJECT_TYPES_DIR` equal to the templates directory given and a defined `cwd` is red against the extracted-as-is function, with the missing key as the failing assertion (output recorded in `experiments.md` under a Part A section); `pnpm typecheck` from `electron/` exits 0; the Scrivener fork lines have no diff; `experiments.md` records a reading check (file and line) that the Scrivener worker does not read project types (FR-5), or the contrary finding if it does; no other electron test changes status.
**Depends on:** 1
**Estimate:** 2
**Notes:** Satisfies FR-1, FR-2, FR-5 (reading check), FR-24. The red result reproduces the READ statement that the fork has neither; it does not reproduce the user-visible failure, which Task 4 measures. If the reading check shows the Scrivener worker does read project types, record it and stop Part A for the lead; do not change the Scrivener fork.
**Done:** [x]

### Task 3: D-8 fix: pass `GETWRITE_PROJECT_TYPES_DIR` and an explicit `cwd` to the DOCX worker
**What:** Make the fork-options function return the inherited environment plus `GETWRITE_PROJECT_TYPES_DIR` and an explicit `cwd`, and have main pass the templates directory and `getRepoRoot()` into it.
**Files:** Modifies the Task 2 module (inputs: templates directory, working directory, base environment; output: `env`, `cwd`), its test file, and `electron/src/main.ts` (DOCX fork only; the templates directory is the one `resolveDirectories()` already computes, the working directory is `getRepoRoot()`).
**Done when:** the Task 2 test is green; added tests assert that a variable present in the input environment is still present in the output (FR-3) and that the working directory given is passed through unchanged (FR-4); no `app.isPackaged` branch exists in the function or its call; `pnpm typecheck`, `pnpm test` and `pnpm build:worker` from `electron/` exit 0 (results recorded); `git diff` shows the Scrivener fork unchanged and `frontend/src/lib/projectTypes.ts` untouched.
**Depends on:** 2
**Estimate:** 2
**Notes:** Satisfies FR-3, FR-4, FR-5, FR-24 (OQ-3). Passing `env` replaces the inherited environment, hence the preservation test.
**Done:** [x]

### Task 4: D-8 measurement: development app Word import from another working directory
**What:** Run a Word import of one `.docx` with project type Blank and with Novel in the development app launched from a working directory other than `<root>/electron`, and record the outcomes.
**Files:** Appends to the Part A section of `specs/features/desktop-defects/experiments.md`. Creates or reuses a harness script under `specs/features/desktop-defects/scripts/`, modelled on `specs/features/user-handbook/scripts/desktop-dev.mjs` (copied fake root, `--user-data-dir=<throwaway>`, throwaway app `name` so `logs` is throwaway). Reads the D-8 record in `specs/features/user-handbook/verification.md` (~984) for the earlier method and a sample `.docx`.
**Done when:** `experiments.md` records the `lsof` output; the asserted `app.getPath("userData")` and `app.getPath("logs")` (the run stops if either is under a protected folder); the working directory the app was launched from; for Blank and for Novel, whether the import completed and created a project (observed dialog text and the throwaway project's `project.json` presence); the page console and app log lines for the import; and a sentence stating the result covers this build and working directory only. Processes started are recorded by pid and stopped by pid, listener gone confirmed. Nothing outside the throwaway locations was touched.
**Depends on:** 3
**Estimate:** 3
**Notes:** Satisfies FR-6, FR-21, FR-22, FR-25. Needs the desktop app: OUTSIDE the sandbox, main checkout. If a protected path is reported or 7340 is held, the run does not start and is reported as not run with the reason. A failure is recorded as observed; do not change code here.
**Done:** [x]

### Task 5: D-8 verification: packaged (unpacked) build Word import
**What:** Build the unpacked app with a throwaway `productName`, show by the path assertion that it is safe to run, and if so run a Word import from a terminal directory and from `/`.
**Files:** Appends to the Part A section of `experiments.md`. Creates or reuses a harness script under `specs/features/desktop-defects/scripts/`. Builds with `pnpm electron:build` then electron-builder `--dir` with `-c.productName=<throwaway>` (output under `../dist-electron/`, outside the repo; no change to `electron/electron-builder.yml`). Seeds a `workspace.json` in the throwaway user-data directory whose `projectsDir` is a throwaway folder.
**Done when:** `experiments.md` records which build was run (unpacked `--dir` build, throwaway `productName`, built from the main checkout at the recorded commit), the `lsof` output, the asserted `app.getPath("userData")` and `app.getPath("logs")`, and then either (a) for Blank and Novel imports launched from a terminal directory (named) and from `/`: completed or not, observed text and throwaway project presence, reported as "unpacked build launched from `/`" and the other directory, with the statement that it shows the fix works in that build and not that the build failed before the fix; or (b) the safety assertion could not be shown and the run did not happen: recorded as "not run; the packaged import is the owner's manual check" with the reason, and no further attempt. The build output location and any process started are recorded and stopped by pid.
**Depends on:** 3
**Estimate:** 5
**Notes:** Satisfies FR-7, FR-22, FR-23 (OQ-1, OQ-2). May HALT for an owner decision: (b) is a valid end state, reported to the lead; it does not block other parts. Verification, not a gate (OQ-95 decision 1). Needs a build and the app: OUTSIDE the sandbox, main checkout, never a worktree. The throwaway `productName` expectation that logs land in a throwaway folder is general Electron behaviour (medium confidence); the path assertion decides, not the name.
**Done:** [x]

### Task 6: D-2 failing tests: the noise-word handlers and the empty user-data directory
**What:** Add the red test that `writeGlobalNoiseWords("", ["said"])` fails today, and the red handler tests for a new directory-taking handler module.
**Files:** Modifies `electron/tests/projects-dir.test.ts` (FR-8 case). Creates a handler test under `electron/tests/` for a module with no `electron` import (name TBD by reading `electron/src/sharing/device-ipc.ts`'s `createDeviceHandlers` pattern and `main.ts:437-451`), asserting that `get` and `set` use the directory they were given, that a successful `set` returns `{ ok: true }` and a thrown write returns `{ ok: false, message }` and logs. Reads `electron/src/projects-dir.ts` (~268, `writeGlobalNoiseWords`), `electron/src/main.ts` (~124, 437-451).
**Done when:** the FR-8 case is red with ENOENT from `mkdir ''` as the failing reason and the handler tests are red because the module does not exist (outputs recorded in `experiments.md` Part B); the existing `projects-dir.test.ts` cases (including "ignores a recorded choice in development builds" and the legacy-directory cases) still pass unchanged.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-8, FR-9 (tests), FR-10, FR-24. The FR-8 case reproduces the READ mechanism at the model layer. The fix routes the handlers to a real directory and leaves `writeGlobalNoiseWords` and `projectsDirEnvironment()` as they are, so Task 7 replaces the FR-8 assertion with a handler-level one (the handler is never given `""`); the red run recorded here is the reproduction. FR-8 (amended) makes the red ENOENT run a recorded reproduction that is not expected to turn green, since FR-10 forbids changing the model.
**Done:** [x]

### Task 7: D-2 fix: noise-word IPC handlers use `app.getPath("userData")`
**What:** Move the handler bodies to the new module and have main pass `app.getPath("userData")` to it in both builds.
**Files:** Creates the handler module (receives the directory as an argument; preserves the `{ ok: true } | { ok: false, message }` result and the failure log line). Modifies `electron/src/main.ts` (`getwrite:global-noise-words-get` and `-set` only). Modifies the FR-8 case in `projects-dir.test.ts` as described in Task 6's notes.
**Done when:** the Task 6 handler tests are green; the FR-8 reproduction case is removed (it was recorded in Task 6) and replaced by the handler-level case that the handlers never pass `""` and use the directory they are given, which passes and states what it pins; `projectsDirEnvironment()` still returns `userDataDir: ""` unpackaged (an existing or added test asserts it); the existing `projects-dir.test.ts` cases pass unchanged; `pnpm typecheck`, `pnpm test` and `pnpm build:worker` from `electron/` exit 0; the existing `catch` still returns the message and logs.
**Depends on:** 6
**Estimate:** 3
**Notes:** Satisfies FR-9, FR-10, FR-24. Do not touch the workspace-folder chooser at `main.ts:298`.
**Done:** [x]

### Task 8: D-2 measurement: add a global noise word in the development app
**What:** In the development app with a throwaway user-data directory, add a global noise word in App Settings, restart the app, and record what is listed and stored.
**Files:** Appends to the Part B section of `experiments.md`. Reuses the Task 4 harness (a new script under `specs/features/desktop-defects/scripts/` only if it needs one).
**Done when:** `experiments.md` records the `lsof` output, the asserted `userData` and `logs` paths, whether Add succeeded (observed text, no "Could not save the noise-word list."), whether the word is listed after restarting the app with the same throwaway user-data directory, and whether it is found in the throwaway `workspace.json` (key and value only, no other content). Processes started are recorded and stopped by pid. The result is stated as a measurement of the development build only.
**Depends on:** 7
**Estimate:** 3
**Notes:** Satisfies FR-11, FR-21, FR-22, FR-25. Needs the desktop app: OUTSIDE the sandbox, main checkout. Not run if 7340 is held or a protected path is reported.
**Done:** [ ]

### Task 9: D-2 failing tests: `workspace.json` is written atomically
**What:** Add the red tests for an interrupted write, temporary-file cleanup, file mode, and the write after a damaged file.
**Files:** Modifies `electron/tests/projects-dir.test.ts`: (1) with `workspace.json` holding known content, an injected write failure (a stub of the file write that writes part of the body then throws) leaves the file's bytes unchanged; (2) a successful write and a failed write each leave no temporary file in the directory; (3) the written file's mode is the process default, not forced to 0600; (4) after a damaged `workspace.json` reads as empty, the next write keeps only the field being set; (5) setting one field preserves the others (confirm the existing cases at ~183, 193, 251, 267 cover it, add if not). Reads `electron/src/projects-dir.ts` (~264-273).
**Done when:** case (1) is red against the in-place `fs.writeFileSync` with changed or truncated bytes as the failing assertion, and (2) is recorded red or green with the reason (output in `experiments.md` Part B); (3), (4) and (5) are recorded red or green and any already green are noted as pins; no existing test changes status.
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-13, FR-14, FR-24. The test shows that old content survives an injected failure; it does not show a real crash or power loss is survived, and no note or report may say it does. How the write is stubbed (injectable `fs` argument or module mock) is decided by reading the existing test style.
**Done:** [ ]

### Task 10: D-2 fix: temporary-file-and-rename write of `workspace.json`
**What:** Make `writeWorkspaceConfig` create the parent directory, write the complete JSON to a temporary file in the same directory and rename it over `workspace.json`, using a local helper in `projects-dir.ts`.
**Files:** Modifies `electron/src/projects-dir.ts` only (a local helper; default file mode; two-space JSON and trailing newline unchanged; no import from `sharing/`). `electron/src/sharing/device-store-writer.ts` has no diff. Every setter that writes the file (`writeConfiguredProjectsDir`, `clearConfiguredProjectsDir` when other fields remain, `writeGlobalNoiseWords`, `writeSharingEnabled`) goes through it.
**Done when:** the Task 9 tests are green; all of `electron/tests/projects-dir.test.ts` passes; `grep` shows no `sharing/` import in `projects-dir.ts` and `git diff --stat -- electron/src/sharing` is empty (results recorded); a damaged `workspace.json` still reads as empty; `pnpm typecheck`, `pnpm test` and `pnpm build:worker` from `electron/` exit 0.
**Depends on:** 9
**Estimate:** 2
**Notes:** Satisfies FR-12, FR-13, FR-14, FR-15, FR-24 (OQ-4 (b)). Do not change how a damaged file is read, and do not add locking or a backup.
**Done:** [ ]

### Task 11: D-40 manual compile in the development app and FR-17 classification
**What:** Run a compile of a project with at least two text resources in a Playwright-launched development app with a `require`-free download hook and a throwaway download path, record the observations, and classify the result.
**Files:** Creates a harness script under `specs/features/desktop-defects/scripts/` (modelled on `desktop-dev.mjs`; the `will-download` hook uses no `require`, the throwaway path is passed in; a harness-only `session.setDownloadPath(<throwaway>)` is called on the window's session before Compile is clicked). Appends a Part C section to `experiments.md`. Reads `specs/features/user-handbook/scripts/task8-desk.mjs` (~23), `frontend/src/lib/compile/download-file.ts` (~32-42) and the D-40 record in `specs/features/user-handbook/verification.md` (~1229). No source change.
**Done when:** `experiments.md` records the `lsof` output; the asserted `userData` and `logs` paths; whether the hook was installed; whether `will-download` fired; whether a file appeared in the throwaway folder (name and size) and whether anything appeared in `~/Downloads` (a directory listing of that one folder is not taken; the check is that the throwaway download path was set before Compile); whether a save dialog or download UI appeared; the page console output; and exactly one FR-17 class: (a) fault in the verification script, (b) product defect fixable by a one-line change, (c) product defect needing a main-process download handler or a decision about where compiled files go, (d) not reproduced; stating which candidate causes the run did and did not separate, with unseparated ones left as HYPOTHESIS. Processes started are recorded and stopped by pid.
**Depends on:** 1
**Estimate:** 5
**Notes:** Satisfies FR-16, FR-17, FR-21, FR-22, FR-25 (OQ-5, OQ-6). May HALT for an owner decision: class (c) means nothing is built; the experiments file records what was measured and the size of what a separate feature would need, the part stops, and the lead takes it to the owner (FR-20). Class (d): record, nothing built. Tasks 13-15 run only for the matching class. Needs the desktop app: OUTSIDE the sandbox, main checkout. Not run if 7340 is held or a protected path is reported.
**Done:** [ ]

### Task 12: D-40 manual compile in the unpacked build
**What:** Repeat the Task 11 compile in the unpacked build from Task 5, if Task 5 showed it is safe to run, and record whether the result differs from the development app.
**Files:** Appends to the Part C section of `experiments.md`. Reuses the Task 5 build and the Task 11 hook. No source change.
**Done when:** `experiments.md` records either the same observations as Task 11 for the unpacked build (which build, which launch directory) and a plain statement of whether they match the development app's, or "not run" with the reason (Task 5's safety assertion was not shown, Task 5 did not run, or 7340 was held). A result is said to cover only the build it was made in.
**Depends on:** 5, 11
**Estimate:** 3
**Notes:** Satisfies FR-16, FR-23 (OQ-5 (b)). May HALT for an owner decision: "not run" is a valid end state and is reported; the dependency on Task 5 is treated as satisfied by Task 5's halt report. Skipped if Task 11 classified (c) only in that nothing is built from it; the run itself may still be recorded as extra evidence. Needs the app: OUTSIDE the sandbox, main checkout.
**Done:** [ ]

### Task 13: D-40 class (a): correct the verification script's hook
**What:** Correct the download hook in `task8-desk.mjs` so it works without `require`, and re-run it once to show it records a download.
**Files:** Modifies `specs/features/user-handbook/scripts/task8-desk.mjs` (~23). Appends to the Part C section of `experiments.md`. No file under `frontend/`, `electron/src/` or `cli/` changes.
**Done when:** `git diff --stat` shows only the script and `specs/`; the re-run with the throwaway locations records a `will-download` event or a file in the throwaway folder (observed values); `experiments.md` states that no product change was needed for D-40.
**Depends on:** 11
**Estimate:** 2
**Notes:** Satisfies FR-18. Runs only if Task 11 classified (a); otherwise left unticked with "not applicable: class <x>". The re-run needs the app: OUTSIDE the sandbox, with the same throwaway-path assertion and `lsof` check.
**Done:** [ ]

### Task 14: D-40 class (b): failing test for the measured cause
**What:** Add a unit test that reproduces the measured cause at the unit level (for example that `downloadInBrowser` revokes the object URL only after the browser has taken it), red against current code.
**Files:** Modifies an existing test file for `frontend/src/lib/compile/download-file.ts` under `frontend/tests/` (a new file only if none exists). Reads `frontend/src/lib/compile/download-file.ts` (~32-42).
**Done when:** the test is red with the measured behaviour as the failing assertion (output recorded in `experiments.md`); no existing test changes status; the test name and comment state what is observed, not a cause beyond what Task 11 separated.
**Depends on:** 11
**Estimate:** 2
**Notes:** Satisfies FR-19 (test half), FR-24. Runs only if Task 11 classified (b); otherwise left unticked with "not applicable: class <x>". The fix is one line; if the class (b) cause needs more than a one-line change, stop and report it as class (c) to the lead instead of building it.
**Done:** [ ]

### Task 15: D-40 class (b): the one-line fix and the compile re-run
**What:** Apply the one-line product fix and re-run the manual compile to show a file is written.
**Files:** Modifies `frontend/src/lib/compile/download-file.ts` (one line or equivalent). Appends to the Part C section of `experiments.md`.
**Done when:** the Task 14 test is green and the rest of the compile/download tests pass (files run recorded); `pnpm typecheck` from `frontend/` exits 0; the Task 11 compile re-run with the same harness records a file in the throwaway folder (observed), or "not run" with the reason; `experiments.md` says which of the unit test and the re-run was run, since only the re-run shows the effect.
**Depends on:** 14
**Estimate:** 3
**Notes:** Satisfies FR-19. Runs only if Task 14 ran. A main-process download handler or any decision about where compiled files go is not built here (OQ-95 decision 2). The re-run needs the app: OUTSIDE the sandbox.
**Done:** [ ]

### Task 16: Final suites (FR-26) and acceptance record
**What:** Run the final suites, record each as run or not run against the baseline, and record which parts landed, halted or were not run.
**Files:** Appends a "Final suites" section to `specs/features/desktop-defects/experiments.md`. No source change.
**Done when:** the section states for each part (A, B, C) whether it landed, halted or was not run, and cites its measurement and failing-test records; the measurements of FR-6, FR-7, FR-11 and FR-16 are listed separately from the suites, each as run or not run; from `electron/`, `pnpm typecheck`, `pnpm test` and `pnpm build:worker` are each recorded with counts or exit codes and compared to the Task 1 baseline; from `frontend/`, `pnpm test:ci`, `pnpm typecheck` and `pnpm lint`, and from the repo root `pnpm knip` (findings naming touched files listed separately), likewise; `pnpm test:e2e` is run with Storybook on 6006 (port confirmed free first, pid recorded, stopped by that pid, listener gone confirmed) and compared to the baseline; the `cli/` tests are run only if `cli/` or a module it imports is touched, otherwise the section gives `git diff --stat -- cli` (empty); a failing suite is recorded with test names and not fixed here; `git status --short` shows no change outside `electron/`, `frontend/` (only if class (b)), `specs/` and no edit under `docs/user/`; a suite not run is not reported as passing; the section says no real crash or power loss was tested.
**Depends on:** 4, 5, 8, 10, 12, 13, 15
**Estimate:** 3
**Notes:** Satisfies FR-25, FR-26, FR-27. `pnpm test:e2e`, `pnpm storybook` and `lsof` run OUTSIDE the sandbox in the main checkout; the others inside. If a part halted or a task was not applicable, its tasks are left unticked and this task records that; a dependency on a halted or not-applicable task is treated as satisfied by the halt report. Handbook warnings these fixes make stale go to the scribe as a follow-up; list them as a pointer only.
**Done:** [ ]

## Summary
- Total tasks: 16
- Total estimated effort: 47 story points
- Critical path: 1 → 2 → 3 → 5 → 12 → 16
- Risks: Task 5 and Task 12 (the packaged run depends on the FR-22 path assertion; if safety cannot be shown they end as the owner's manual check, which does not block the other parts); Task 11 (FR-17 class (c) stops Part C with a record for the owner, class (d) builds nothing; Tasks 13-15 are conditional and may be not applicable); Task 6 (the FR-8 reproduction stays red by design, since FR-10 forbids changing the model; Task 7 removes it and the handler-level assertion binds); Tasks 4, 5, 8, 11, 12 (need the desktop app or a build outside the sandbox in the main checkout, and port 7340 must be free because the desktop app has no fallback port); Task 1 and Task 16 (e2e needs Storybook started and stopped by pid outside the sandbox).
