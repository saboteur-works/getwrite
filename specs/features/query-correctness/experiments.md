# Experiments: Query correctness (Feature 86)

Measurements only. Each entry is an observed value, the command that produced it, and the date. No cause is named.

## Baselines

Unfixed tree, branch `fix/query-correctness`, main checkout, date 2026-10-16. Logs are under `specs/features/query-correctness/logs-baseline/`.

### Tree state

- `git rev-parse HEAD` (start of task): `a0479b22e614cb616f5934234fb18bb0d00afddc`.
- `git status --short` (start of task): empty output (clean tree).
- `git status --short` (after all commands, before this file was written): empty output. The `logs-baseline/*.log` files did not appear in it.

### Listeners

- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` at the start of the task: no output, exit 1 (nothing listening).
- Same command immediately before `pnpm test:e2e` (after test:ci, typecheck, lint, knip): no output, exit 1.
- Same command after `pnpm test:e2e` finished: no output, exit 1. Nothing was listening on 6006 afterwards. The Storybook server that Playwright's webServer config started was not observed by pid (the run was a single foreground command); no process was stopped by this task.

### Unit suite

- Command: `pnpm test:ci` from `frontend/`. Exit 0.
- Test Files 610 passed (610). Tests 6505 passed, 1 skipped (6506), 0 failed.
- Log: `logs-baseline/test-ci.log`.

### Typecheck

- Command: `pnpm typecheck` from `frontend/`. Exit code 0.
- Log: `logs-baseline/typecheck.log`.

### Lint

- Command: `pnpm lint` from `frontend/`. Exit 0.
- 393 problems: 0 errors, 393 warnings (7 warnings reported as potentially fixable with `--fix`).
- Log: `logs-baseline/lint.log`.

### Knip

- Command: `pnpm knip` from the repo root. Exit 1 (findings reported).
- Category counts: Unused files 49; Unused dependencies 1; Unused devDependencies 4; Unlisted dependencies 6; Unlisted binaries 4; Unused exports 166; Unused exported types 170; Duplicate exports 14; Configuration hints 6.
- Full output saved at `specs/features/query-correctness/logs-baseline/knip.log` (435 lines). The output begins with a warning that `/Users/jedaisaboteur/.npmrc` could not be read (EPERM) inside the command sandbox.

### End-to-end suite

- Command: `pnpm test:e2e` from `frontend/`, run outside the command sandbox. Exit 0.
- 214 passed, 1 skipped, 0 failed (Playwright reported 53.9 s). No failing test names.
- Log: `logs-baseline/e2e.log`.
