# Task 31: final suites as CI runs them, and close-out (LEAD-RUN)

Run on 2026-11-11 by the lead from the main checkout, outside the sandbox, at `fb1a6d0d` (all code and docs), then knip again after `240c7ddf` (un-exports only).

## CI list

Re-read with `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u`. No command differs from the list in the task. `pnpm install --frozen-lockfile`, `playwright install` and `gh release upload` were not run (setup and release steps); no `package.json` or lockfile changed on the branch (`git diff --stat d845f2ee..HEAD -- '**/package.json' pnpm-lock.yaml` is empty).

## Results (observed)

| Command | Where | Exit | Detail |
|---|---|---|---|
| `pnpm run format:check` | root | 0 | "All matched files use Prettier code style!" |
| `pnpm lint` | frontend | 0 | 0 errors, 437 warnings |
| `pnpm run check:no-hex` | frontend | 0 | |
| `pnpm typecheck` | frontend | 0 | |
| `pnpm test:ci` | frontend | 1 | 898 files: 897 passed, 1 failed. 12,153 passed, 1 failed, 7 expected fail, 1 skipped. The failure is `tests/unit/indexer-queue.test.ts` "records per-save time with and without one isExtra unlocked project.json read" (Feature 103 timing test, also failed in Features 106 and 107; this branch does not change that file). Run alone afterwards: 25 of 25 passed. Cause not established. |
| `pnpm --filter getwrite-frontend build` | root | 0 | |
| `pnpm --filter getwrite-electron typecheck` | root | 0 | |
| `pnpm --filter getwrite-electron test` | root | 0 | 37 files, 565 tests |
| `pnpm --filter getwrite-electron build` | root | 0 | |
| `pnpm --filter getwrite-cli typecheck` / `test` / `build` | root | 0 / 0 / 0 | 23 files, 164 tests |
| CLI smoke (`--help`, `doctor --help`, `prune --help`) | root | 0 | |
| `pnpm --filter getwrite-android build` | root | 0 | placeholder |
| `pnpm build:native` | frontend | 0 | |
| `pnpm test:e2e` | frontend | 0 | 249 passed |
| `pnpm knip` | root | 1 (as on main) | Compared with knip run on `main` (`d845f2ee`) in a temporary worktree: the branch first added 2 unused exports and 9 unused exported types, all claim code. After `240c7ddf` removed those `export` keywords: Unused exports 154 and Unused exported types 175, equal to main. Unused files 297 against main's 50: local Gradle output and synced web assets that git ignores (same as Feature 107). |

Logs: the lead's scratchpad (`ci108/`), not kept in the repo.

## After the CI run

`240c7ddf` changed only `export` keywords. After it the implementor ran frontend typecheck (also the Storybook tsconfig), lint (0 errors) and 62 claim, project-type and annotation test files (1,239 tests, all passed). The full suites were not re-run after it.

## Desktop check (Stage 6.5)

The project-type flow (a writer-made type with Claims On starts a new project with Claims on) is run by the owner in the packaged desktop app; result recorded in `experiments.md` under Acceptance.
