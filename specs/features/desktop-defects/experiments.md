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
