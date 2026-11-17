# Feature 120 split at the cursor: experiments index

This file is the index. Each measurement is recorded in its own task file under `specs/features/split-at-cursor/experiments/`; only Task 1 and Task 37 edit this index. A measurement is a fact with the command that produced it; a cause is a hypothesis and is not written here until an experiment separates it.

## Environment

Recorded by Task 1 (details in `experiments/task-1.md`). Commands and observed values:

| Item | Command | Observed |
|---|---|---|
| node | `node --version` | v24.15.0 |
| pnpm | `pnpm --version` | 10.28.0 |
| commit | `git rev-parse HEAD` | bb3bcbc8c0670dfebb18b0d2ec7500731c974a09 |
| branch | `git rev-parse --abbrev-ref HEAD` | worktree-agent-a34c684cb5320ace5 (an orchestrator worktree whose HEAD equals the tip of `feat/split-merge`, per `git branch --list 'feat/split-merge' -v`) |
| tree state | `git status --short` | empty (clean) before Task 1 files were added |

## FR-1 (a): pending autosave and stale content hash

Filled by Task 2: `experiments/task-2.md`.

## FR-1 (b): canonical writers on a truncation

Filled by Task 2: `experiments/task-2.md`.

## FR-1 (c): `setCanonicalRevision` and revision restore

Filled by Task 2: `experiments/task-2.md`. Task 2 also records the version-number question of (g) (`createRevision` against `updateRevisionInPlace`).

## FR-1 (d): sidecar and project writers, new top-level sidecar key

Filled by Task 3: `experiments/task-3.md`.

## FR-1 (e): lineage record and latest-operation record files

Filled by Task 3: `experiments/task-3.md`.

## FR-1 (f): derived indexes before and after `enqueueIndex` and `rebuildDerivedIndexes`

Filled by Task 4: `experiments/task-4.md`.

## FR-1 (g): lock edges, failure injection, version numbers

Lock edges and failure injection: Task 5, `experiments/task-5.md`. The version-number half: Task 2, `experiments/task-2.md`.

## FR-1 (h): placing a new document directly after its original

Filled by Task 5: `experiments/task-5.md`.

## FR-1 (i): TipTap JSON cut points and annotation marks

Filled by Task 6: `experiments/task-6.md`.

## FR-1 (j): key bindings that could clash with a shortcut

Filled by Task 7: `experiments/task-7.md`.

## FR-1 (k): what a paired device and Android reach

Filled by Task 7: `experiments/task-7.md`.

## FR-1 (l): word counts available for a document

Filled by Task 4: `experiments/task-4.md`.

## FR-1 (m): sidecar keys a copy carries today

Filled by Task 3: `experiments/task-3.md`.

## Shortcut decision (OQ-8)

Filled by Task 8 (owner decision from the Task 7 shortlist): `experiments/task-8.md`.

## Runs (FR-22)

Filled by Task 37 from the lead-run tasks 34, 35 and 36 (build check, packaged desktop run, hosted web run). Nothing recorded yet.

## Not verified

Filled by Task 37. Nothing recorded yet.

## Acceptance

Filled by Task 37. Nothing recorded yet.
