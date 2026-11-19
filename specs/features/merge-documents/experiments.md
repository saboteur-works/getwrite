# Feature 121 merge documents: experiments index

This file is the index. Each measurement is recorded in its own task file under `specs/features/merge-documents/experiments/`; only Task 1 and Task 46 edit this index. A measurement is a fact with the command that produced it; a cause is a hypothesis and is not written here until an experiment separates it.

## Environment

Recorded by Task 1 (details in `experiments/task-1.md`). Commands and observed values:

| Item | Command | Observed |
|---|---|---|
| node | `node --version` | v24.15.0 |
| pnpm | `pnpm --version` | 10.28.0 |
| commit | `git rev-parse HEAD` | e4fd0f4d23d2d6d2c820d43c08caf1fb3d5bd8f0 |
| branch | `git rev-parse --abbrev-ref HEAD` | worktree-agent-abf785df8923ab11f (an orchestrator worktree whose HEAD equals the tip of `feat/merge-documents`, per `git branch --list 'feat/merge-documents' -v`) |
| tree state | `git status --short` | empty (clean) before Task 1 files were added |

## FR-1 (a): tree selection

Filled by Task 2: `experiments/task-2.md`.

## FR-1 (b): every reader of a document's word figure or membership

Filled by Task 3: `experiments/task-3.md`.

## FR-1 (c): daily goal and writing-log entries after the mark's date

Filled by Task 4: `experiments/task-4.md`.

## FR-1 (d): lock edges and failure injection

Filled by Task 5: `experiments/task-5.md`.

## FR-1 (e): annotations, ids and marks across a merge

Filled by Task 6: `experiments/task-6.md`.

## FR-1 (f): timings of a merge and its Undo

Filled by Task 13: `experiments/task-13.md`.

## FR-1 (g): what Undo needs when a document is in Trash, purged or edited

Filled by Task 7: `experiments/task-7.md`.

## FR-1 (h): whether a copy or duplicate carries `mergedMark`

Filled by Task 4: `experiments/task-4.md`.

## FR-1 (i): not required

OQ-1 adds no shortcut, so no key-binding clash check is made.

## Document cap decision (OQ-5)

Filled by Task 14 (LEAD/OWNER), from the Task 13 timings: `experiments/task-14.md`. Not yet chosen.

## Runs (FR-26)

Filled by Task 46 at close-out. No run is recorded yet.

## Not verified

Filled by Task 46 at close-out.

## Acceptance

Filled by Task 46 at close-out. Acceptance of the feature is the owner's, at the pipeline's Gate 6.
