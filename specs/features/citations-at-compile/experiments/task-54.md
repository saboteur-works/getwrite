# Task 54: CI commands, results into docs, close-out (LEAD-RUN)

Run on 2026-11-17 (UTC) from the main checkout, outside the command sandbox, at commit `7bbc8d5d`. Platform: macOS 26.5.1, arm64, 12 cores. Node and pnpm as in `task-1.md`.

## Command list

The list was taken at run time with `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u`. Each multi-line `run: |` block was read from its workflow. Each command ran from the working directory its workflow gives.

The results below are from the run of record. The owner ran `pnpm install --frozen-lockfile` first. The lead then ran the rest in sequence from 01:29:40 to 01:34:09 UTC. Load averages were 20.75, 24.03 and 21.63 at the start and 18.54, 21.96 and 21.55 at the end.

| Command | Workflow | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | all | Run by the owner: "Lockfile is up to date, resolution step is skipped". `node_modules` changed by "+8 -140" packages. `git status` showed no tracked file changed. Ignored build scripts were listed for `@parcel/watcher`, `@prisma/client`, `better-sqlite3`, `electron-winstaller` and `sharp`. |
| `pnpm typecheck` (frontend) | frontend-checks | exit 0 |
| `pnpm lint` (frontend) | frontend-checks | exit 0: 0 errors, 459 warnings |
| `pnpm run format:check` (repo root) | frontend-checks | exit 0: "All matched files use Prettier code style!" |
| `pnpm run check:no-hex` (frontend) | frontend-checks | exit 0 |
| `pnpm test:ci` (frontend) | frontend-checks | exit 0, 92 s: 993 of 993 files passed; 13791 tests passed, 8 expected fail, 1 skipped (13800) |
| `pnpm build` (frontend, `.next/standalone` and `out` cleared first) | frontend-checks | exit 0. It printed the two Turbopack warnings Task 51 recorded: the `style-loader.ts` file pattern, and "Encountered unexpected file in NFT list" |
| `pnpm --filter getwrite-frontend build` | electron-checks | exit 0 |
| `pnpm --filter getwrite-electron typecheck` | electron-checks | exit 0 |
| `pnpm --filter getwrite-electron test` | electron-checks | exit 0: 565 tests passed |
| `pnpm --filter getwrite-electron build` | electron-checks, build-electron | exit 0 (`tsc`) |
| `pnpm --filter getwrite-cli typecheck` | cli-smoke-tests | exit 0 |
| `pnpm --filter getwrite-cli test` | cli-smoke-tests | exit 0: 164 tests passed |
| `pnpm --filter getwrite-cli build` | cli-smoke-tests | exit 0 |
| `node cli/dist/bin/getwrite-cli.cjs --help \| head -n 20`, and the same for `doctor --help` and `prune --help` | cli-smoke-tests | exit 0 each; usage printed |
| `pnpm --filter getwrite-android build` | build-android | exit 0. The script only prints that the build is a scaffold placeholder |
| `pnpm exec playwright install --with-deps chromium` | e2e-tests | **not run**: Chromium for Playwright was already installed, and `--with-deps` installs Linux system packages |
| `pnpm test:e2e` (frontend) | e2e-tests | exit 0, 68 s: 270 passed, 1 skipped |
| `electron-builder` with the signing and notarization steps, `codesign`, `stapler`, `spctl` | build-electron | **not run**: these need the CI signing secrets and build both architectures. Task 52 packaged arm64 locally, signed and not notarized |
| AppImage download, `xvfb-run` launch and the checks after it | linux-appimage-smoke | **not run**: it needs a Linux runner and tests published releases 1.8.0 and 2.0.0, not this branch |
| `gh release upload …` and `gh workflow run build-electron.yml …` | build-electron, release-please | **not run**: release-only |

## Earlier runs, on a tree that did not match the lockfile

These runs came before the owner's `pnpm install --frozen-lockfile`. That install then changed `node_modules` by "+8 -140" packages, so these runs used a dependency tree that differed from the lockfile. They are kept for the record and are not the result of record.

From 00:52:14 to 01:01:17 UTC, the same command list ran. Every command exited 0 except two:

- `pnpm run format:check` was run from `frontend/` by the lead's mistake and failed with `ERR_PNPM_NO_SCRIPT`. Run from the root, as the workflow does, it exited 0.
- `pnpm test:ci` failed, as shown in the table below.

| Run | Time (UTC) | Files | Tests |
|---|---|---|---|
| 1 | 00:52 to 00:56 | 1 failed, 992 passed (993) | 2 failed, 13789 passed |
| 2 | 01:02:13 to 01:05:40 | 3 failed, 990 passed (993) | 5 failed, 13786 passed |
| 3 | 01:22:00 to 01:23:52 | 993 passed (993) | 13791 passed |

Every run also had 8 expected fail and 1 skipped, of 13800 tests.

The failing tests:

- Runs 1 and 2, in `tests/unit/indexer-queue.test.ts`:
  - "records per-save time with and without one isExtra unlocked project.json read": "Test timed out in 5000ms".
  - "runs the module step on a save when config.modules has no entry": `expected 2 to be 1`.
- Run 2 only, in `tests/page-stale-sidecar-save.test.tsx`: two tests, each "Test timed out in 5000ms".
- Run 2 only, in `tests/component/ProjectTypesManagerPage.test.tsx`: one test, "Test timed out in 5000ms".

What was measured about them:

- None of the three test files, nor the code they test, differs from `main` (`git diff --stat main..HEAD`).
- Run alone, the three files passed 102 of 102, twice, and `indexer-queue.test.ts` passed 25 of 25, three times.
- The machine restarted between run 2 and run 3: `uptime` showed it up for 9 minutes before run 3.
- Load averages near those runs ranged from about 11 to 47 on the 1-minute figure. The suite produces load of that size by itself: 46.99 just after run 3, which passed.
- Not established: why runs 1 and 2 failed. The run of record above is on the lockfile tree, after the restart. These measurements do not separate the restart, the dependency tree and machine load as causes.
- The logs of these earlier runs were in the session scratchpad and were lost in the restart. The figures above were copied from them before it.

## Docs

- `experiments.md` links every record named in this task's Done line, plus the repair and run records.
- `frontend/CLAUDE.md` (Code Map, Feature 116 entry): its last sentence now states the run results as `task-52.md` and `task-53.md` record them, and the paths not verified.
- `docs/user/handbook/write/citations.md`: unchanged. It states no run results, and its fields steps already describe save as you type and the date rule (Task 66).
- Root `CLAUDE.md`: unchanged. Its Feature 116 glossary entries state no run results, and nothing they describe changed in Tasks 65 or 66.
