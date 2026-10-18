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

### Task 5: unpacked build Word import (2026-10-18)

Build run: unpacked `--dir` build (arm64), not a `.dmg`, throwaway `productName`; built from the main checkout at commit `66a3a9f86ee48d0107dc2825aa9205d499c264c0` (branch `fix/desktop-defects`; `git status --short` clean before the build). Steps: `pnpm electron:build` (exit 0), then from `electron/`: `electron-builder --dir --arm64 --config electron-builder.yml -c.productName=GwF88Throwaway -c.appId=works.saboteur.gwf88throwaway -c.extraMetadata.name=gwf88-throwaway -c.extraMetadata.productName=GwF88Throwaway -c.directories.output=/tmp/getwrite-f88/build -c.mac.identity=null` (exit 0). `electron/electron-builder.yml` was not changed. Build output: `/tmp/getwrite-f88/build/mac-arm64/GwF88Throwaway.app`, outside the repo. Logs: `/tmp/getwrite-f88/task5-build.txt`, `task5-pack.txt`, `task5-run-slash.txt`, `task5-run-repo.txt`.

Deviations from the task text, stated as facts:
- The yml's `directories.output: ../dist-electron` resolves (relative to `electron/`) to `<repo>/dist-electron`, which is inside the repo directory (git-ignored by `.gitignore:28`) and already holds the owner's release `.dmg` files. I did not build there; I overrode the output to `/tmp/getwrite-f88/build` on the command line.
- The first pack, with only the `productName` override, left the packaged `package.json` `name` as `getwrite-electron` (read from the asar). Because which of `name`/`productName` gives `app.getPath("logs")` was not established, I did not run that build; I rebuilt with `-c.extraMetadata.name` and `-c.extraMetadata.productName` throwaway values (asar `package.json` then read `name: gwf88-throwaway`, `productName: GwF88Throwaway`). This goes beyond OQ-1's `productName` override alone; no repo file changed.
- Reading the asar with `asar extract-file ... package.json` from the repo root overwrote the repo's root `package.json` with the extracted one (my error). I restored it with `git show HEAD:package.json > package.json`; `git status --short` was clean afterwards and the file matches HEAD.

Launch method: `specs/features/desktop-defects/scripts/docx-import-packaged.mjs` (with `scripts/lib/safety.mjs`), Playwright `_electron.launch` of the build's binary with `--user-data-dir=<throwaway>`, a seeded throwaway `workspace.json` (`projectsDir` = throwaway folder), file picker stubbed with `dialog.showOpenDialog`, fixture `frontend/tests/fixtures/docx/multi-heading.docx`, default split level. Run outside the sandbox. Launch directories: `/` and `/Users/jedaisaboteur/Repositories/getwrite` (the repo root, the terminal directory used). The app was launched before the assertion could be read (Playwright starts it); it is the first action after launch, and before launch the names in the asar were checked to be non-protected.

Per run, `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` before: empty output, exit 1 (both runs). Asserted (both runs): `app.getPath("userData")` = the throwaway `<run-dir>/userdata` under `/tmp/getwrite-f88/runs/`; `app.getPath("logs")` = `~/Library/Logs/GwF88Throwaway`; `isPackaged=true`; `app.getName()=GwF88Throwaway`; neither under a protected folder (check printed `false`). `process.cwd()` of the app was `/` and the repo root respectively.

Observed, unpacked build launched from `/` and, separately, from `/Users/jedaisaboteur/Repositories/getwrite`:
- Blank: dialog text "Import from Word", "The Word document was imported successfully.", then the "# DOCX Import Report" (every section reads nothing found/skipped) and "OPEN PROJECT". Throwaway workspace entries 0 to 1; the entry has `project.json` (name `multi-heading`, `projectType` `blank`).
- Novel: same dialog text; entries 1 to 2; the new entry has `project.json` (`projectType` `novel`).
- Both identical in the two launch directories (the dialog text for the repo-root run was counted: "imported successfully" twice). Page console during each import: none. Whole-run page console: 3 lines, each "Failed to load resource ... 404 (Not Found)" (URL not captured). App log (15 lines) shows `projectsDir` = the throwaway workspace, `templatesDir` under the build's `Resources/getwrite-config/...`, the packaged server forked, and "Forking DOCX import worker: .../Resources/docx-import-worker.cjs" once per import; it also holds `[stderr] Couldn't load fs` / `Couldn't load zlib` from the server's output (not examined).

Processes (electron main plus descendants, recorded; run `/`): 41439, 41521, 41522, 41526 (next-server, held 7340), 41601, 41834, 42282. Run repo root: 43360, 43361, 43362, 43363 (next-server, held 7340), 43364, 43663, 44128. Stopped by pid by the harness after `app.close()`: "all exited after app.close" both runs; `lsof` on 7340 after stop: none; final `lsof` on 7340, 3000, 6006 empty (exit 1) after each run and again after both. Throwaway log folder and run folders were removed. `git status --short projects/` empty before and after.

End state (a). Result: with the Task 3 change, Blank and Novel Word imports completed and created a project in the unpacked build launched from `/` and from the repo root. This shows the fix works in this build; it does not show that the build failed before the fix (the unfixed tree was not run). Not covered: a Finder launch of an installed `.app`, a `.dmg` build, x64, a launch directory other than the two named, a signed build, a folder source or split levels.

## Part B: D-2 noise-word handlers (2026-10-18)

### Task 6: failing tests (run from `electron/`, sandbox, `pnpm exec vitest run`)

Added: `electron/tests/projects-dir.test.ts` new describe "the global noise-word list with an empty user-data directory (Feature 88, FR-8)" with one case; new `electron/tests/noise-words-ipc.test.ts` (3 cases) importing `createGlobalNoiseWordsHandlers` from `../src/noise-words-ipc` (`{ userDataDir, log }` -> `get()`, `set(words)`), a module that does not exist yet (Task 7). The FR-8 case chdirs into an empty throwaway directory under the test's tmp root, asserts `process.cwd()` is it, calls `writeGlobalNoiseWords("", ["said"])`, and restores cwd in `finally`. It is written to assert that the call does not throw, so it is red by design; it is a recorded reproduction and Task 7 removes it.

Full-suite result: 2 files failed, 30 passed; 1 test failed, 491 passed (492). The 38 other `projects-dir.test.ts` cases pass unchanged.

- FR-8 case, failing assertion `expect(caught).toBeUndefined()` (projects-dir.test.ts:239), received: `Error: ENOENT: no such file or directory, mkdir ''` with `errno: -2, code: 'ENOENT', syscall: 'mkdir', path: ''`.
- `tests/noise-words-ipc.test.ts`: suite fails to load, `Error: Cannot find module '../src/noise-words-ipc' imported from .../electron/tests/noise-words-ipc.test.ts`; 0 tests ran (the three cases are not individually red/green yet).

Handler cases written: get reads the list from the given directory; set writes `workspace.json` in the given directory and returns `{ ok: true }` without logging; a write that throws (user-data path beneath a regular file) returns `{ ok: false, message }` and logs `Failed to save the global noise-word list: <message>` once.

### Task 7: handlers use `app.getPath("userData")` (run from `electron/`, sandbox, 2026-10-18)

Changed: new `electron/src/noise-words-ipc.ts` (`createGlobalNoiseWordsHandlers({ userDataDir, log })` -> `get()`, `set(words)`; result `{ ok: true } | { ok: false, message }`; failure line `Failed to save the global noise-word list: <message>` unchanged); `electron/src/main.ts` `getwrite:global-noise-words-get` and `-set` now call the handlers built with `app.getPath("userData")` (both builds); `writeGlobalNoiseWords`, `readGlobalNoiseWords` and `projectsDirEnvironment()` unchanged (FR-10). The FR-8 reproduction case was removed from `projects-dir.test.ts`; `noise-words-ipc.test.ts` gained a fourth case pinning that, with a directory given and cwd an empty throwaway directory, set/get round-trip, `workspace.json` is created in the given directory and nothing is written to the cwd.

Results: `pnpm typecheck` exit 0; `pnpm test` 32 files passed, 495 tests passed (the 3 Task 6 handler cases green); `pnpm build:worker` completed (built `dist/docx-import-worker.cjs`). This is unit-level only; the running app was not exercised (Task 8).

Not done: no test asserts `projectsDirEnvironment()` still returns `userDataDir: ""` unpackaged, because it lives in `main.ts`, which imports `electron`; the function body is unchanged by this task (verified by diff reading, not by a test).

### Task 8: global noise word added in the development app (2026-10-18)

Harness: `specs/features/desktop-defects/scripts/noise-words-dev.mjs` (with `scripts/lib/safety.mjs`), modelled on `docx-import-dev.mjs`: copied fake root, `--user-data-dir=<throwaway>`, throwaway package `name` so `logs` is throwaway, launch cwd `<run-dir>/launchdir` (differs from `<fake root>/electron`: true). `electron/` was rebuilt first (`pnpm build`, `pnpm build:worker`), so `electron/dist` in the fake root holds the Task 7 change. Run outside the sandbox from the main checkout; full log kept at `/tmp/getwrite-f88/task8.log`.

- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` before: empty output, exit 1 (no listener on any of the three). The app was started only after that.
- Asserted paths (both launches): `app.getPath("userData")` = `<run-dir>/userdata` under `/tmp/getwrite-f88/runs/` (started empty); `app.getPath("logs")` = `~/Library/Logs/gw-f88-throwaway-<run id>` (throwaway name); `isPackaged=false`; under a protected folder: false.
- Add: the list on opening App Settings was empty; word `gwf88noiseword` typed in "New noise word" and Add clicked; the list then showed `gwf88noiseword`; the text "Could not save the noise-word list." was not present in the dialog or page body (checked 3 s after Add).
- Throwaway `workspace.json` after the Add (before closing the app): present, keys `["globalNoiseWords"]`, `globalNoiseWords = ["gwf88noiseword"]` (key and value only read; no other content).
- Restart with the same throwaway user-data directory (new fake-root app process, same `userdata`): App Settings listed `["gwf88noiseword"]` on open; `workspace.json` after the second close unchanged (same key and value).
- App log (throwaway logs folder; 27 lines after the first launch, 53 after the second): no line mentioning the noise-word list or "Failed"; the only lines matching `noise|workspace|Failed|error` were the `standaloneDir`/`projectsDir`/`templatesDir`/"Spawning dev server" start-up lines. Page console: React DevTools info, `[HMR] connected`, the Electron Security Warning, Fast Refresh lines (second launch) and one `Failed to load resource ... 404 (Not Found)` per launch (URL not captured; the same line appeared in the Task 4 run).
- Pids started, first launch: 55730(Electron), 55734, 55735, 55737(sh), 55741, 55760, 55766(next-server, held 7340), 55843. Second launch: 56603(Electron), 56604, 56605, 56606(sh), 56610, 56630, 56637(next-server, held 7340), 56720. Each was stopped by pid by the harness (SIGTERM; "none alive" afterwards); `lsof` on 7340 after each stop: none; final `lsof` on 7340, 3000, 6006: empty, exit 1. `git status --short projects/` before and after: empty. The throwaway log folder and run folder were removed.
- Result: in the development app (`electron/dist` rebuilt at the Task 7 commit), launched from a directory other than `<root>/electron`, Add succeeded, the word persisted across an app restart with the same user-data directory, and it is stored in the throwaway `workspace.json` under `globalNoiseWords`. This covers the development build only; the unpacked build, a Finder launch and the pre-fix behaviour in this setup were not run, so this run does not show that Add failed before Task 7.

### Task 9: failing tests for the atomic `workspace.json` write (run from `electron/`, sandbox, `pnpm exec vitest run`, 2026-10-18)

Added: `electron/tests/projects-dir.test.ts` new describe "writing workspace.json atomically (Feature 88, FR-12 to FR-15)" with 7 cases, all in throwaway tmp dirs. The injected failure is `vi.spyOn(fs, "writeFileSync")` replaced by a function that writes the first half of the body to the path it is given, then throws `injected write failure`. It stubs `fs.writeFileSync` only, so it fires for any write path that goes through that call (in-place, or a temporary file written with it); a Task 10 implementation that writes through `fs.openSync`/`fs.writeSync` would not be hit by it. No `electron/src` change.

Full suite: 1 failed, 501 passed (502); 31 files passed, 1 failed. Existing cases unchanged (the 38 earlier `projects-dir.test.ts` cases pass).

- (1) "leaves the existing bytes unchanged when the write fails part-way": RED. Failing assertion `expect(fs.readFileSync(configFile(), "utf8")).toBe(known)` at projects-dir.test.ts:316; received a truncated file ending `"sharingEnabled": tr` (expected `"sharingEnabled": true\n}\n`). Truncated bytes are the failing assertion, as the task requires.
- (2) "leaves no temporary file after a successful write" and "after a failed write": GREEN against the in-place write. Reason: the in-place write creates no temporary file, so they pass trivially; they are pins for Task 10 (they would turn red only if the new helper leaks a temporary file). The listing ignores the `projects` directory the fixture creates.
- (3) "writes the file with the process default mode, not 0600": GREEN, pin. Compares against the mode of a plain `fs.writeFileSync` file made in the same directory (umask-independent).
- (4) "keeps only the field being set after a damaged file reads as empty": GREEN, pin (damaged `{not json` then `writeSharingEnabled` leaves `{ sharingEnabled: true }`).
- (5) setting one field preserves the others: the existing cases at ~183, 193, 251 and 267 already cover noise words/projectsDir/sharing pairs; added one more case with all three fields on disk (`writeGlobalNoiseWords` keeps `projectsDir` and `sharingEnabled`): GREEN, pin. Also added a format pin (two-space JSON, trailing newline): GREEN.

What this shows: the old content survives an injected write failure only once Task 10 is in. It does not show that a real crash or power loss is survived.

### Task 10: temporary-file-and-rename write of `workspace.json` (`electron/src/projects-dir.ts`, run from `electron/`, sandbox, 2026-10-18)

Change: `writeWorkspaceConfig` still creates the directory, then calls a new local helper `writeFileViaTemporary`, which writes the same body (two-space JSON, trailing newline, default mode) with `fs.writeFileSync` to a dot-prefixed `.workspace.json.<pid>.<time>.tmp` in the same directory and `fs.renameSync`s it over `workspace.json`; on any failure it removes the temporary file (`fs.rmSync`, force) and rethrows the original error. All four setters go through `writeWorkspaceConfig`. The read path is unchanged (a damaged file still reads as `{}`); no locking, no backup.

Results (exit codes captured directly): `pnpm typecheck` 0; `pnpm test` 0 (32 files, 502 tests passed, the Task 9 cases now green including the one that was red); `pnpm build:worker` 0. `grep -n "sharing/" electron/src/projects-dir.ts`: no output; `git diff --stat -- electron/src/sharing`: empty. Only `electron/src/projects-dir.ts` has a source diff.

What this shows: the old content survives an injected `fs.writeFileSync` failure, and no temporary file is left after a failed or successful write. It does not show survival of a real crash or power loss (no fsync was added; not tested).

## Part C: D-40 desktop compile

### Task 11: manual compile in the development app and FR-17 classification (2026-10-18)

Harness: `specs/features/desktop-defects/scripts/compile-dev.mjs` (with `scripts/lib/safety.mjs`), same method as `docx-import-dev.mjs`: Playwright-launched Electron (34.5.8) from a copied fake root, `--user-data-dir=<throwaway>`, throwaway package `name` so `logs` is throwaway, launch cwd `<run-dir>/launchdir` (not `<fake root>/electron`). `electron/dist` was rebuilt first (`pnpm build`, `pnpm build:worker` in `electron/`, outside the sandbox, exit 0; output `/tmp/getwrite-f88/task11-build.txt`). Run outside the sandbox from the main checkout. Build covered: the development app only; the unpacked build is Task 12. Logs: `/tmp/getwrite-f88/task11-compile-dev.txt` (run 1), `/tmp/getwrite-f88/task11-compile-dev-oldhook.txt` (run 2).

Method: a Blank project "F88 Compile" with two text resources ("Doc B" and "Doc A", text typed in each) was created through the UI inside the fake root's `projects/`. Before Compile was clicked the harness (a) called `session.setDownloadPath(<throwaway>/downloads)` on the window's session (the call was made and did not throw; `typeof session.setDownloadPath` was `function`), and (b) installed a `will-download` hook on that session. The hook uses no `require`: the folder is passed in as an argument and joined by string concatenation, and it calls `item.setSavePath`. The window's session was the default session. `dialog.showSaveDialog` and `showSaveDialogSync` were wrapped to record a call and cancel. Then Project menu > Compile Project > SELECT ALL > COMPILE (2), format left at its default (`txt`). `~/Downloads` was not listed; the check against it is that the throwaway download path was set before Compile (it was, in both runs).

Run 1 (hook without `require`, the FR-16 run):

- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` before: empty output, exit 1, checked twice (by hand, then in the script); no listener on any of the three. After: empty, exit 1.
- Asserted paths: `app.getPath("userData")` = `<run-dir>/userdata` under `/tmp/getwrite-f88/runs/`; `app.getPath("logs")` = `~/Library/Logs/gw-f88-throwaway-<run id>` (throwaway name); `isPackaged=false`; under a protected folder: false.
- Hook installed: yes (`hooked: 1`, no errors). Download path set before Compile: yes.
- `will-download` fired: yes, once. Item: name `f88-compile.txt`, MIME `text/plain`, total 46 bytes, URL a `blob:` URL, save path empty before the hook, set by the hook to `<run-dir>/downloads/f88-compile.txt`; final state `completed`.
- File in the throwaway folder: `f88-compile.txt`, 46 bytes, content `Doc B\n=====\n\nBee text.\n\n\nDoc A\n=====\n\nAy text.` (both documents).
- Save dialog or download UI: no `showSaveDialog`/`showSaveDialogSync` call recorded; one BrowserWindow before and after; no `[role=dialog]` open in the page after Compile (the Compile dialog closed); no page text mentioning download or saved. Native UI outside the page (a download bar or notification) was not observed by this harness.
- Page console during/after Compile: `[Fast Refresh] rebuilding`, `[Fast Refresh] done in 166ms` only. Whole run: React DevTools info, `[HMR] connected`, the Electron Security Warning, Fast Refresh lines, one `Failed to load resource ... 404 (Not Found)` (URL not captured; also present in the Task 8 run) and six `[react-tooltip] Do not set style.border` warnings. App log: `POST /api/compile/text 200 in 227ms`; no error or failure line.
- Pids: 69979 (Electron), 70057, 70058, 70063 (sh), 70067, 70089, 70097 (next-server, held 7340), 70175. All stopped by pid by the harness (SIGTERM; "none alive"); `lsof` on 7340 after stop: none; throwaway log folder and run folder removed; `git status --short projects/` before and after: empty.

Run 2 (same harness, `HOOK_FORM=old`: the hook is the `task8-desk.mjs:23` shape, `require("node:path")` inside the handler before anything is recorded; `setDownloadPath` still set first, so nothing could land in `~/Downloads`; an `uncaughtException` listener in the main process records instead of showing an error box):

- `lsof` before: empty, exit 1 (twice). `typeof require` in the `app.evaluate` context: `undefined` (also `undefined` in run 1).
- Asserted paths: same assertion, same result (throwaway `userData` and `logs`, not under a protected folder).
- Hook installed: yes. `globalThis.__dl` (the hook's own record) after Compile: empty, i.e. "0 events" by the record `task8-desk.mjs` keeps. Main-process uncaught exception recorded: `require is not defined`. Files in the throwaway download folder after 10 s: none. Save-dialog calls: none; one window; page dialog after Compile: none; page console: Fast Refresh lines only; app log `POST /api/compile/text 200 in 195ms`.
- Pids: 72792 (Electron), 72793, 72794, 72795 (sh), 72799, 72818, 72824 (next-server, held 7340), 72901. Stopped by pid by the harness ("none alive"); `lsof` on 7340 after: none; folders removed; `git status --short projects/` empty before and after.

FR-17 class: (a), a fault in the verification script. Basis: with a hook that uses no `require`, `will-download` fired and a 46-byte file with both documents was written to the folder named; with the `task8-desk.mjs` hook shape in the same app, the handler threw `require is not defined`, the hook's own record stayed empty and no file appeared in the folder given to it, which is the D-40 observation (event not seen by the hook, no file in its folder, `POST /api/compile/text 200`).

What the runs separated:

- Separated: the script's hook is a sufficient cause of the D-40 observation as the verification script produced it ("no event recorded, no file in the hook's folder"): it reproduces under the old hook shape and does not under the require-free one. Also separated for this build: the synchronous `URL.revokeObjectURL` after `click()` in `download-file.ts:32-42` did not prevent the download here (the item started, had 46 bytes and completed). Interception elsewhere did not stop it here (the event reached a session hook).
- Not separated, so HYPOTHESIS: that the original D-40 run failed for the same reason (the original run was not repeated; its hook is the same text, `typeof require` was not measured then; Electron/Node versions may differ); where the file went in run 2 and in the original run (the throwaway download folder stayed empty with the `setDownloadPath` set, no `~/Downloads` listing was taken, and where the item went after the handler threw is not established); whether the revoke can ever lose a download on a slow or large compile (only a 46-byte file was compiled; the compile formats md, pdf and docx were not run); and any packaged-build behaviour (Task 12).

Result and consequence: class (a). D-40 is recorded as a script fault, not a product defect, for the development app. No product change. By the tasks' own conditions Task 13 (class (a): correct the script's hook) applies; Tasks 14 and 15 (class (b)) do not. No size-of-feature record is needed because the class is not (c). The result covers the development app, launched from a directory other than `<root>/electron`, for the `txt` format on a two-document project.
