# Task 1: experiments index and environment record

## Observed values

Each value is the output of the command beside it, run from the repository worktree root.

| Item | Command | Observed |
|---|---|---|
| node | `node --version` | v24.15.0 |
| pnpm | `pnpm --version` | 10.28.0 |
| commit | `git rev-parse HEAD` | bb3bcbc8c0670dfebb18b0d2ec7500731c974a09 |
| branch | `git rev-parse --abbrev-ref HEAD` | worktree-agent-a34c684cb5320ace5 |
| feature branch | `git branch --list 'feat/split-merge' -v` | feat/split-merge at bb3bcbc8, subject "docs(specs): Feature 120 split at the cursor, task list (37 tasks, 156 points)" |
| tree state | `git status --short` | empty before this task's files were added |

`pnpm --version` also printed one warning that reading the user-level npm config file failed with EPERM inside the command sandbox. The version printed was 10.28.0, the version pinned in the repository.

## Files created

- `specs/features/split-at-cursor/experiments.md` (index with headings Environment, FR-1 (a) to (m), Shortcut decision (OQ-8), Runs (FR-22), Not verified, Acceptance, each naming the task file that fills it)
- `specs/features/split-at-cursor/experiments/task-1.md` (this file)

## Behaviour

No behaviour change has been made. No production file, `package.json` or lockfile was edited. No test, typecheck or lint was run, because the task touches only specification records.
