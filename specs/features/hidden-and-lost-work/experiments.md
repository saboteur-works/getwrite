# Feature 89 experiments

Measurements are recorded as observed values with the command that produced them. A cause is written only where an experiment separated it from the alternatives; anything else is labelled HYPOTHESIS.

## Baselines (Task 1)

Date: 2026-10-18 (the `date -u` of the first command read `Mon Oct 19 02:08:30 UTC 2026`; local time MDT). Tree: branch `fix/hidden-and-lost-work`, unfixed (no source change in this task). Node v24.15.0, pnpm 10.28.0. Main checkout, no worktree.

| Item | Command (cwd) | Observed |
| --- | --- | --- |
| Commit | `git rev-parse HEAD` | `23ac1c8e104be9e6379d284f49fdc98f75902657` |
| Listeners before any run | `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` (outside sandbox) | empty output, exit 1 (no listener on 7340, 3000 or 6006) |
| Listeners immediately before the e2e run | same command | empty output, exit 1 |
| Listeners after the e2e run | same command | empty output, exit 1 |
| frontend tests | `pnpm test:ci` (`frontend/`) | 612 files passed; 6967 passed, 2 expected fail, 1 skipped (6970 total), 0 failed |
| frontend typecheck | `pnpm typecheck` (`frontend/`) | exit 0 |
| frontend lint | `pnpm lint` (`frontend/`) | exit 0; 393 problems: 0 errors, 393 warnings |
| knip | `pnpm knip` (repo root) | exit 1; 413 findings across sections: unused files 49, unused dependencies 1, unused devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 166, unused exported types 169, duplicate exports 14 (plus 6 configuration hints, not counted). Output kept outside the repo. |
| e2e | `pnpm test:e2e` (`frontend/`, outside sandbox) | exit 0; 214 passed, 1 skipped, 0 failed (no failure names; no "flaky" or "retry" line in the output); Playwright duration 47.7s |
| electron tests | `pnpm test` (`electron/`) | exit 0; 32 files passed; 510 passed, 0 failed |
| cli tests | `pnpm test` (`cli/`, inside sandbox) | NOT RUN to completion. vitest printed `RUN v4.1.6` and no further output for about 10 minutes; the two processes it had started (pids 58290, 58322) were stopped by pid; the shell reported exit 143. No test counts were produced. A retry outside the sandbox was requested and was denied by the permission system, so it was not made. |
| git status | `git status --short` | empty at the start of the task; at the end, after the runs, it listed one modified file, `frontend/tsconfig.json` (see Process notes), which was then restored with `git checkout -- frontend/tsconfig.json`, after which `git status --short` was empty |

### Process notes

- No listener existed on 6006 before the e2e run. Playwright's webServer started its own Storybook server for the run (config as in Feature 88: `reuseExistingServer: true`); this task did not start Storybook separately, no pid was recorded, and the post-run `lsof` shows no listener on 7340, 3000 or 6006.
- No desktop app or other server was started by this task.
- After the first (sandboxed) test batch and the e2e run, `git status --short` listed ` M frontend/tsconfig.json`. The diff showed the `lib`, `types`, `plugins` and `exclude` arrays reformatted onto multiple lines and two added `include` entries, `.next-qa/getwrite-cli-qa-server-nhXUWU/dev/types/**/*.ts` and `.next-qa/getwrite-cli-qa-server-nhXUWU/dev/dev/types/**/*.ts`. Which command rewrote the file was not separated: the candidates run in that window were the cli test run, the frontend typecheck and lint, knip, `test:ci` and `test:e2e`. The file was restored to its committed content; it was not part of this task's change.
- `pnpm` printed a warning that it could not read `~/.npmrc` (EPERM, sandbox); not a test result.

### Not measured

- Figures from Feature 88 (frontend 6967 passed / 1 skipped, e2e 214 passed / 1 skipped, electron 488 passed at its baseline) were not used; the values above were measured on this tree. The frontend and e2e figures equal the Feature 88 baseline figures; the electron count differs (510 against 488).
- cli test counts: not obtained (see the table).
- Knip's per-finding contents were not analysed; only counts per section.
- Lint warnings were counted, not categorised.
