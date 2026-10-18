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
