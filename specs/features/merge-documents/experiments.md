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

Document cap: 25, 2026-11-19, the owner (recorded by the lead from the owner's word at Gate 5). Detail: `experiments/task-14.md`. Task 13 timed 2, 10 and 50 documents through the core. Medians at 50 documents: merge writes about 92 ms, awaited index update about 271 ms, and a queue drain after the writes of about 8.0 s. What makes up that drain was not established (`experiments/task-13.md`). At 25 documents, Task 27 measured `applyMerge` returning in 110 to 120 ms with a drain of 388 to 431 ms (`experiments/task-27.md`). Why the drain differs from Task 13's was not tested.

## Task records

Every task's results are in its own file: [task-1](experiments/task-1.md) [task-2](experiments/task-2.md) [task-3](experiments/task-3.md) [task-4](experiments/task-4.md) [task-5](experiments/task-5.md) [task-6](experiments/task-6.md) [task-7](experiments/task-7.md) [task-8](experiments/task-8.md) [task-9](experiments/task-9.md) [task-9b](experiments/task-9b.md) [task-10](experiments/task-10.md) [task-11](experiments/task-11.md) [task-12](experiments/task-12.md) [task-13](experiments/task-13.md) [task-14](experiments/task-14.md) [task-15](experiments/task-15.md) [task-16](experiments/task-16.md) [task-17](experiments/task-17.md) [task-18](experiments/task-18.md) [task-19](experiments/task-19.md) [task-20](experiments/task-20.md) [task-21](experiments/task-21.md) [task-22](experiments/task-22.md) [task-23](experiments/task-23.md) [task-24](experiments/task-24.md) [task-25](experiments/task-25.md) [task-26](experiments/task-26.md) [task-27](experiments/task-27.md) [task-28](experiments/task-28.md) [task-29](experiments/task-29.md) [task-30](experiments/task-30.md) [task-31](experiments/task-31.md) [task-32](experiments/task-32.md) [task-33](experiments/task-33.md) [task-34](experiments/task-34.md) [task-35](experiments/task-35.md) [task-36](experiments/task-36.md) [task-37](experiments/task-37.md) [task-38](experiments/task-38.md) [task-39](experiments/task-39.md) [task-40](experiments/task-40.md) [task-41](experiments/task-41.md) [task-42](experiments/task-42.md) [task-43](experiments/task-43.md) [task-44](experiments/task-44.md) [task-45](experiments/task-45.md) [task-46](experiments/task-46.md) [task-47](experiments/task-47.md).

## Runs (FR-26)

- Unit, integration, component and a11y suite at `3af3c2f5`: `pnpm test:ci`, 1053 files, 15078 passed, 8 expected fail, 1 skipped (`experiments/task-46.md`).
- Every CI workflow command that can run locally was run twice: at `6261aa6e` (`experiments/task-43.md`) and at `3af3c2f5` (`experiments/task-46.md`). Each exited 0. The exception is `pnpm knip`, which is not a workflow command and exited 1 with findings across the repository. The commands not run are named in both records.
- Sharing smoke at `3af3c2f5`: 134 enumerated entries (the same as Task 32's `MIN_ENTRIES`), 37 checks, 0 failures (`experiments/task-46.md`).
- Packaged desktop app on macOS arm64 (signed, not notarized), with the owner, on the generated sample project (seed 121) and its encrypted copy (`experiments/task-44.md`). Two defects were found and fixed during the run: the merge dialog wording, changed by the owner (`experiments/task-43.md`), and Undo merge being disabled after a real merge (`experiments/task-44.md`). Apart from those, the owner reported every checklist step as working as expected.
- Hosted web, production build with hosted auth on the owner's machine, one server process, with the owner as tenant A (`experiments/task-45.md`). The owner reported the same behaviour as on desktop. A second tenant got the same answer for tenant A's ids as for made-up ids on the preview, merge, Undo and latest-operation routes. That held while tenant A had no record and while tenant A held a live merge record. Tenant A's files were unchanged.

## Not verified

- Android. Merge is not offered there by design, and nothing was run on a device.
- A paired device over home-network sharing, beyond the sharing smoke's route enumeration and refusals.
- Screen-reader use.
- Documents of hundreds of thousands of words.
- A hosted deployment of several server instances, and a deployed hosted service behind a real proxy over https.
- Windows and Linux.
- Notarized macOS builds.
- The browser name and version of the hosted run.
- Merges of more than 25 documents in the app (refused by the cap). The 50-document figures are from Task 13's probe of the core only.
- What makes up the queue drain measured in Task 13, and why it differs from Task 27's.
- What wrote a document's canonical revision again 3 s after an Undo merge, with the same text (`experiments/task-44.md`).
- Every path not named in a task record.

## Follow-ups recorded during the run

- Once a later split or merge replaces the latest-operation record, an older merge's marks cannot be cleared in the app (owner decision: tracked, not changed here; POS `task_f8423a8d`; `experiments/task-44.md`).
- Citations appear to render only a checkbox. The owner reports this as an issue that predates this feature; it was not investigated (POS `task_3032a6f2`).
- An unused import of `SPLIT_OPERATION_KINDS` in `frontend/src/lib/api/split.ts`, left by the Task 44 fix, is the one lint warning added since Task 43 (`experiments/task-46.md`).
- knip findings in exports this branch added (`experiments/task-43.md`).

## Acceptance

Acceptance of the feature is the owner's, at the pipeline's Gate 6. This index records the runs and their results. It does not record acceptance.
