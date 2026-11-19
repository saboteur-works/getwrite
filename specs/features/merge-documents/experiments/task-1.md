# Task 1: experiments index and environment record

## Observed values

Each value is the output of the command beside it, run from the repository worktree root.

| Item | Command | Observed |
|---|---|---|
| node | `node --version` | v24.15.0 |
| pnpm | `pnpm --version` | 10.28.0 |
| commit | `git rev-parse HEAD` | e4fd0f4d23d2d6d2c820d43c08caf1fb3d5bd8f0 |
| branch | `git rev-parse --abbrev-ref HEAD` | worktree-agent-abf785df8923ab11f |
| feature branch | `git branch --list 'feat/merge-documents' -v` | feat/merge-documents at e4fd0f4d, subject "docs(specs): Feature 121 merge documents: feature spec and task list" |
| tree state | `git status --short` | empty before this task's files were added |

`pnpm --version` also printed one warning that reading the user-level npm config file failed with EPERM inside the command sandbox. The version printed was 10.28.0, the version pinned in the repository.

## Files created

- `specs/features/merge-documents/experiments.md` (index with headings Environment, FR-1 (a) to (h), FR-1 (i) not required, Document cap decision (OQ-5), Runs (FR-26), Not verified, Acceptance, each naming the task file that fills it)
- `specs/features/merge-documents/experiments/task-1.md` (this file)

## Behaviour

No behaviour change has been made. No production file, `package.json` or lockfile was edited. No test, typecheck or lint was run, because the task touches only specification records.
