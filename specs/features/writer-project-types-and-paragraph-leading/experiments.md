# Feature 90 experiments

Measurements are recorded as observed values with the command that produced them. Each item is MEASURED (observed in a run, stated as values) or UNMEASURED (not run, with the reason). A cause is written only where an experiment separated it from the alternatives.

## Environment record

Date: 2026-10-19. Branch `feat/writer-project-types-and-paragraph-leading`, main checkout, no worktree. Node v24.15.0 and pnpm 10.28.0 were recorded in the Feature 88 baselines on this machine; they were not re-queried in this task (UNMEASURED for this run). Raw outputs for every command below are under `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/t1/` (outside the repo).

## Baselines (Task 1)

| Item | Command (cwd) | Observed |
| --- | --- | --- |
| Commit | `git rev-parse HEAD` | `65248d999f471175e043b43e4a1ec78824801ece` |
| Working tree before any run | `git status --short` | empty (clean) |
| Listeners before any run | `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` (`lsof-before.txt`) | one listener: `GetWrite` pid 88077, user jedaisaboteur, `TCP *:7340 (LISTEN)`. Nothing on 3000 or 6006. |
| 6006 free before the e2e run | `lsof -nP -iTCP:6006 -sTCP:LISTEN` (`lsof-6006-pre-e2e.txt`) | empty output, exit 1 |
| Listeners after the e2e run | same as the first (`lsof-after.txt`) | the same single listener (pid 88077 on 7340); nothing on 3000 or 6006 |
| frontend typecheck | `pnpm typecheck` (`frontend/`; `fe-typecheck.txt`) | exit 0 |
| frontend lint | `pnpm lint` (`frontend/`; `fe-lint.txt`) | 393 problems: 0 errors, 393 warnings; exit 0 |
| frontend tests | `pnpm test:ci` (`frontend/`; `fe-test-ci.txt`) | 615 files passed; 7094 passed, 2 expected fail, 1 skipped (7097 total), 0 failed; exit 0 |
| frontend e2e | `pnpm test:e2e` (`frontend/`, outside the sandbox; `e2e.txt`) | exit 0; 214 passed, 1 skipped, 0 failed (no failure names; no flaky or retry line) ; Playwright duration 51.9s |
| knip | `pnpm knip` (repo root; `knip.txt`) | exit 1; 411 findings: unused files 49, unused dependencies 1, unused devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 164, unused exported types 169, duplicate exports 14 (plus 6 configuration hints, not counted) |
| electron typecheck | `pnpm typecheck` (`electron/`; `el-typecheck.txt`) | exit 0 (covers `tsc --noEmit` and the worker tsconfig) |
| electron tests | `pnpm test` (`electron/`; `el-test.txt`) | 32 files passed; 512 passed, 0 failed; exit 0 |
| electron worker build | `pnpm build:worker` (`electron/`; `el-worker.txt`) | exit 0 |
| CLI tests | `pnpm test` (`cli/`; `cli-test.txt`) | 22 files passed; 144 passed, 0 failed; exit 0 |

Scratchpad directory: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/t1`.

### Process notes

- The listener on 7340 (GetWrite, pid 88077) existed before this task and was not started by it. The desktop app was not started and the process was not touched. Anything that needs the desktop app on 7340 (Task 13) must account for it.
- 6006 was free before the e2e run. Playwright's webServer started and stopped its own Storybook; the post-run `lsof` shows no listener on 3000 or 6006, so nothing started by this task remained. No pid was recorded separately because the task started no process outside the test commands.
- No known load-dependent flake (entity-roster, search-route, schemaManagerRestriction a11y) failed in the `test:ci` run, so no rerun was needed.
- `pnpm` printed a warning that it could not read `~/.npmrc` (EPERM, sandbox) in sandboxed commands; not a test result.
- Frontend, electron, CLI unit suites, typecheck, lint and knip ran inside the sandbox; only `pnpm test:e2e` ran outside it.
- No file under `projects/`, `~/Library/Application Support/{getwrite-electron,GetWrite}`, `~/Library/Logs/*` or `~/Documents/GetWrite` was read, listed or written.

### Not measured

- Node and pnpm versions for this run (see Environment record).
- Knip's per-finding contents were not analysed, only counts per section. The saved output is in the scratchpad, not in the repo.
- Lint warnings were counted, not categorised.
- Figures from earlier features were not used; the values above were measured on this tree.
