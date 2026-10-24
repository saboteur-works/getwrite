# Feature 92 experiments: one project.json lock

Each item is MEASURED (observed in a run, stated as values) or UNMEASURED (not run, with the reason). No cause is written for any value.

## Environment record

- Date of all runs below: 2026-10-23.
- Branch `fix/project-json-write-lock`, main checkout, no worktree.
- `git rev-parse HEAD`: `a8931fb2a7889d0c26daaa76bcf58be09bcf3fd1`.
- `git status --short` before any run: empty output (clean tree).
- Node `v24.15.0` (`node -v`). Vitest v4.1.6 (as printed by the runs).
- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN`, run immediately before `pnpm test:e2e`: no output, exit 1 (nothing listening on 7340, 3000 or 6006). Run again after the suites on 6006: no output, exit 1.
- `pnpm test:ci`, `pnpm test:e2e`, `pnpm knip` and the CLI and electron suites were run outside the sandbox; `typecheck` and `lint` inside it. Logs were written to the session scratchpad, not the repo.

## Baselines (unchanged tree)

| Command | Directory | Observed |
| --- | --- | --- |
| `pnpm typecheck` | `frontend/` | exit code 0 |
| `pnpm lint` | `frontend/` | exit code 0; `391 problems (0 errors, 391 warnings)`; 7 warnings reported as potentially fixable with `--fix` |
| `pnpm test:ci` (`vitest run`) | `frontend/` | exit 0; Test Files 660 passed (660); Tests 7925 passed, 2 expected fail, 1 skipped (7928); duration 46.44s. Failed: 0 |
| `pnpm test:e2e` (`playwright test`) | `frontend/` | exit 0; 230 passed, 1 skipped, 0 failed (1.1m). Names of failures: none |
| `pnpm knip` | repo root | exit 1 (`ELIFECYCLE`). Findings by section: Unused files 49; Unused dependencies 1; Unused devDependencies 4; Unlisted dependencies 6; Unlisted binaries 4; Unused exports 160; Unused exported types 174; Duplicate exports 14. Sum 412. Separately, 6 configuration hints (not counted as findings) |
| `pnpm --filter getwrite-cli test` | repo root | exit 0; Test Files 23 passed (23); Tests 153 passed (153). Stderr lines `error: missing required argument 'scrivPath'`, `error: missing required argument 'source'`, `error: unknown option '--saved-types-dir'` were printed during the passing run |
| `pnpm --filter getwrite-electron test` | repo root | exit 0; Test Files 34 passed (34); Tests 528 passed (528) |

Notes on the figures:

- The knip baseline is a non-zero exit on the unchanged tree; later tasks compare finding counts per section against this table, not against exit 0.
- The lint figure is warnings only; later tasks compare the count 391 and the error count 0.
- `git status --short` after all runs: empty output (no change outside `specs/`; this file is the only addition and was written after the check).

## Not measured

- Nothing in the Task 1 command list was skipped.
