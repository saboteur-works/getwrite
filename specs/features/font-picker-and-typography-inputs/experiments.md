# Feature 91 experiments

Measurements are recorded as observed values with the command that produced them. Each item is MEASURED (observed in a run, stated as values) or UNMEASURED / NOT RUN (not run, with the reason). A cause is written only where an experiment separated it from the alternatives.

## Environment record

Date: 2026-10-21 (local; `date -u` read Thu Oct 22 02:16 UTC at the start of the run). Branch `feat/font-picker-and-typography-inputs`, main checkout, no worktree. Platform Darwin 25.5.0, arm64. Node v24.15.0, pnpm 10.28.0 (`node -v`, `pnpm -v`). Playwright 1.60.0 (`frontend/node_modules/@playwright/test/package.json`). Vitest v4.1.6 (from run banners). `pnpm build` and `pnpm test:e2e` ran outside the command sandbox; every other command ran inside it. Throwaway `GETWRITE_PROJECTS_DIR` (a `mktemp -d` folder under the system temp dir) was set for the build and e2e runs; no protected folder or the repo `projects/` was read, listed or written. No process was started that needed stopping (the build and e2e commands exited on their own).

## Baselines (Task 1)

| Item | Command (cwd) | Observed |
| --- | --- | --- |
| Commit | `git rev-parse HEAD` | `87803df5d7bfaf70de7494ed564b707f2272b140` |
| Working tree before any run | `git status --short` | empty (clean) |
| Listeners before any run | `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` | empty output, exit 1 (nothing listening on 7340, 3000 or 6006) |
| Listeners before `pnpm build` | same command | empty output, exit 1 |
| 6006 free before the e2e run | same command, run immediately before `pnpm test:e2e` | empty output, exit 1 |
| 6006 after the e2e run | `lsof -nP -iTCP:6006 -sTCP:LISTEN` | empty output |
| frontend typecheck | `pnpm typecheck` (`frontend/`) | exit 0 |
| frontend lint | `pnpm lint` (`frontend/`) | 393 problems: 0 errors, 393 warnings; exit 0 |
| frontend tests | `pnpm test:ci` (`frontend/`) | exit 0; 637 files passed; 7646 passed, 2 expected fail, 1 skipped (7649 total), 0 failed |
| frontend build | `pnpm build` (`frontend/`, outside the sandbox) | exit 0 |
| frontend e2e | `pnpm test:e2e` (`frontend/`, outside the sandbox) | exit 0; 222 passed, 1 skipped, 0 failed (no failure names). The name of the skipped test was not extracted. |
| knip | `pnpm knip` (repo root) | exit 1; 412 findings: unused files 49, unused dependencies 1, unused devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 161, unused exported types 173, duplicate exports 14 (plus 6 configuration hints, not counted) |
| electron typecheck | `pnpm typecheck` (`electron/`) | exit 0 |
| electron tests | `pnpm test` (`electron/`) | exit 0; 34 files passed; 528 passed, 0 failed |
| electron worker build | `pnpm build:worker` (`electron/`) | exit 0 (output `dist/docx-import-worker.cjs` 2.0mb) |
| cli tests | `pnpm test` (`cli/`) | exit 0; 23 files passed; 153 passed, 0 failed |
| Working tree after all runs | `git status --short` | empty (clean) at the time of the last check, before this file was created; build output is not shown by git status |

Notes: the `pnpm test:ci` run showed no failed test, so the known flaky-under-load files were not re-run. The four App Settings dialog stories that fail in the Storybook runner were not run here (Storybook-runner story tests are not part of `pnpm test:ci`); not measured.

## Not measured in this task

- Story-runner (`vitest.storybook.config.ts`) results: NOT RUN, not part of the Task 1 contract.
