# Feature 88 experiments

Measurements are recorded as observed values with the command that produced them. A cause is written only where an experiment separated it from the alternatives; anything else is labelled HYPOTHESIS.

## Baselines (Task 1)

Date: 2026-10-18. Tree: branch `fix/desktop-defects`, unfixed (no source change in this task). Node v24.15.0, pnpm 10.28.0. Main checkout, no worktree.

| Item | Command (cwd) | Observed |
| --- | --- | --- |
| Commit | `git rev-parse HEAD` | `7f0407545d5fd20e2df3ac75acef7831fa2d8286` |
| Listeners before any run | `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` (outside sandbox) | empty output, exit 1 (no listener on 7340, 3000 or 6006) |
| Listeners after the e2e run | same command | empty output, exit 1 |
| electron typecheck | `pnpm typecheck` (`electron/`) | exit 0 |
| electron tests | `pnpm test` (`electron/`) | 30 files passed; 488 passed, 0 failed (no skipped count reported by vitest, so 0 shown) |
| electron worker build | `pnpm build:worker` (`electron/`) | exit 0 |
| frontend tests | `pnpm test:ci` (`frontend/`) | 612 files passed; 6967 passed, 2 expected fail, 1 skipped (6970 total), 0 failed |
| frontend typecheck | `pnpm typecheck` (`frontend/`) | exit 0 |
| frontend lint | `pnpm lint` (`frontend/`) | 393 problems: 0 errors, 393 warnings |
| knip | `pnpm knip` (repo root), exit 1 | 413 findings across sections: unused files 49, unused dependencies 1, unused devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 166, unused exported types 169, duplicate exports 14 (plus 6 configuration hints, not counted). Saved output: `specs/features/desktop-defects/logs/knip-baseline.txt` |
| e2e | `pnpm test:e2e` (`frontend/`, outside sandbox) | exit 0; 214 passed, 1 skipped, 0 failed (no failure names; no retry or flaky line in output); Playwright duration 1.0m. Raw output kept at `/tmp/getwrite-f88/e2e.txt` (outside the repo) |
| git status before this file was created | `git status --short` | only `?? specs/features/desktop-defects/logs/` (the knip output); no change outside `specs/` |

### Process notes

- No listener existed on 6006 before the e2e run. Playwright's webServer (`pnpm run build-storybook && node scripts/serve-storybook-static.mjs`, `reuseExistingServer: true`) started its own Storybook server for the run; it was not started separately by this task, no pid was recorded, and the post-run `lsof` above shows no listener left on 7340, 3000 or 6006.
- No desktop app or other server was started.
- `pnpm` printed a warning that it could not read `~/.npmrc` (EPERM, sandbox); not a test result.

### Not measured

- Figures from Feature 87 (frontend 6468 passed / 1 skipped, e2e 214 passed / 1 skipped) were not used; the values above were measured on this tree. The e2e figure happens to equal the earlier one.
- Knip's per-finding contents were not analysed; only counts per section.
- Lint warnings were counted, not categorised.

## Part A: D-8 DOCX worker fork options

### Task 2: extraction and red test (2026-10-18)

Change: `electron/src/docx-import/fork-options.ts` exports `buildDocxWorkerForkOptions({ templatesDir, workingDir })`, returning `{}` (the as-is behaviour: no `env`, no `cwd`; the inputs are not yet used). `electron/src/main.ts` now calls `utilityProcess.fork(workerBundlePath, [], buildDocxWorkerForkOptions({...}))` for the DOCX fork only; before it was `utilityProcess.fork(workerBundlePath)`. The Scrivener fork line (`utilityProcess.fork(workerBundlePath)` in the Scrivener handler) has no diff. Test: `electron/tests/docx-import/fork-options.test.ts`.

Red run (`pnpm test`, `electron/`): 1 failed | 30 passed files; 1 failed | 488 passed tests (the other 488 are unchanged from the Baselines count). Failing test: `buildDocxWorkerForkOptions > carries GETWRITE_PROJECT_TYPES_DIR equal to the templates directory and a defined cwd`:

```
AssertionError: expected undefined to be '/root/getwrite-config/templates/proje…' // Object.is equality
- Expected: "/root/getwrite-config/templates/project-types"
+ Received: undefined
 ❯ tests/docx-import/fork-options.test.ts:18:53
     18|     expect(options.env?.GETWRITE_PROJECT_TYPES_DIR).toBe(
```

The failing assertion is the missing `GETWRITE_PROJECT_TYPES_DIR` key. The `cwd` assertion (`toBeDefined`) sits after it in the same test and was not reached; whether it also fails separately was not run (by reading, `options.cwd` is `undefined` for `{}`). This reproduces the READ statement that the options have neither; it does not reproduce the user-visible failure (Task 4).

`pnpm typecheck` (`electron/`): exit 0.

### Reading check: the Scrivener worker does not read project types (FR-5)

Reading, not a run. `electron/worker/scrivener-import-worker.ts:15-30` imports only from `@gw/core` and `../src/scrivener-import/handle-import-request`. `frontend/src/lib/models/scrivener/import-scrivener-project.ts:110-160` imports no `projectTypes` module and no `GETWRITE_PROJECT_TYPES_DIR` reference. `grep -rn 'projectTypes"' frontend/src` lists importers of `getProjectType` as only `project-crud-core.ts:48`, `plaintext/import-plaintext-project.ts:120` and `docx/import-docx-project.ts:136`; `GETWRITE_PROJECT_TYPES_DIR` is read only at `frontend/src/lib/projectTypes.ts:68`. Not checked: whether `../project` (`createProject`) or other transitively imported modules reach `projectTypes` beyond the direct imports listed (the grep over all of `frontend/src` shows no other importer of it). Finding: the Scrivener worker does not read project types.

### Task 3: fix (2026-10-18)

Change: `buildDocxWorkerForkOptions({ templatesDir, workingDir, baseEnv })` now returns `{ env: { ...baseEnv, GETWRITE_PROJECT_TYPES_DIR: templatesDir }, cwd: workingDir }`; main passes `resolveDirectories().templatesDir`, `getRepoRoot()` and `process.env` (DOCX fork only; no `app.isPackaged` branch). Tests added for FR-3 (input variable preserved) and FR-4 (working dir passed unchanged). From `electron/`: `pnpm typecheck` exit 0; `pnpm test` exit 0 (31 files, 491 tests passed, fork-options test green); `pnpm build:worker` exit 0. This shows the function's output and that the build succeeds; it does not show a Word import works (Tasks 4 and 5).


### Task 4: development app Word import from another working directory (2026-10-18)

Harness: `specs/features/desktop-defects/scripts/docx-import-dev.mjs` (with `scripts/lib/safety.mjs`, a copy of the handbook helper with its base folder changed to `/tmp/getwrite-f88/runs`). Pattern from `specs/features/user-handbook/scripts/desktop-dev.mjs`: copied fake root (`electron/dist` copied, `frontend` and `getwrite-config` symlinked), `--user-data-dir=<throwaway>`, throwaway package `name` so `logs` is throwaway, picker stubbed with `dialog.showOpenDialog`. Run outside the sandbox from the main checkout at commit `04af3ebd4ce04c78e1b7c4440f9e1449a4c8bdff` (branch `fix/desktop-defects`, tree with the Task 3 change). Before the run `pnpm build` and `pnpm build:worker` were run in `electron/` because the existing `electron/dist` had no `docx-import/fork-options.js`; afterwards `dist/main.js` contains `buildDocxWorkerForkOptions` and `dist/docx-import/fork-options.js` contains `GETWRITE_PROJECT_TYPES_DIR` (`dist` is git-ignored). Raw output: `/tmp/getwrite-f88/task4-run1.txt` (outside the repo).

- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` before: empty output, exit 1. The app was started only after that.
- Asserted `app.getPath("userData")` = the throwaway `<run-dir>/userdata` (under `/tmp/getwrite-f88/runs/`); `app.getPath("logs")` = `~/Library/Logs/gw-f88-throwaway-<run id>` (a throwaway name); `isPackaged=false`. Neither was under a protected folder (check result printed `false`).
- Launch working directory: `<run-dir>/launchdir` (`app` reported `process.cwd()` of that); not `<fake root>/electron` (the script printed `differ: true`). The development app started the Next server with `pnpm dev` (`next dev`) from `<fake root>/frontend`, not the standalone build (app log: "Spawning dev server in").
- Source file: `frontend/tests/fixtures/docx/multi-heading.docx`; split level left at the default.
- Blank: dialog text after Start (8 s wait): "Import from Word", "The Word document was imported successfully.", then the "# DOCX Import Report" with every section reading nothing found/skipped, and an "OPEN PROJECT" button. Throwaway projects dir went from 0 to 1 entry; that entry has `project.json` (name `multi-heading`, `projectType` `blank`).
- Novel: same dialog text ("The Word document was imported successfully." and the same report). Projects dir went from 1 to 2 entries; the new entry has `project.json` (name `multi-heading`, `projectType` `novel`).
- Page console lines during each import: none (empty list for both). Over the whole run the page console held 12 lines, in three groups (initial load and the two reloads): React DevTools info, `[HMR] connected`, the Electron Security Warning (insecure CSP), and one `Failed to load resource: ... 404 (Not Found)` each time; the URL of the 404 was not captured. The app log shows `GET /api/auth/get-session 404` at each page load; that these are the same request is a HYPOTHESIS (not separated).
- App log (39 lines, in the throwaway logs folder): for each import one line `Forking DOCX import worker: <run-dir>/repo/electron/dist/docx-import-worker.cjs` (at 20:19:32 and 20:19:44) and no line containing an error, "isn't recognized" or the worker's output. The log does not record the worker's result.
- Pids started (electron main + descendants, all recorded): 8506(Electron), 8532, 8533, 8534(sh), 8538, 8557, 8563(next-server), 8616, 8641, 8642, 8956, 9414. They were stopped by pid by the harness (SIGTERM; "none alive" afterwards). `lsof` on 7340 while running showed 8563 (node, the Next server this run started); after stop `lsof` on 7340 showed none, and the final `lsof` on 7340, 3000 and 6006 returned empty output, exit 1. The throwaway log folder and run folder were removed. `git status --short projects/` empty before and after. Nothing outside the throwaway locations was read or written.
- Result: both Blank and Novel imports completed and created a project when the development app was launched from `<run-dir>/launchdir`. This result covers this build (development app, `electron/dist` rebuilt at the commit above) and this working directory only. It shows the import works with the Task 3 change in this setup; it does not show that the same import failed before the change in this run (the failing case is the handbook D-8 record), and says nothing about a packaged build (Task 5).
