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

## Task records

Every task's own record, in task order:

| Task | Title | Record |
|---|---|---|
| 1 | Experiments index and environment record | [`experiments/task-1.md`](experiments/task-1.md) |
| 2 | FR-1 (a), (b), (c) and version numbers: canonical writers, stale hash, restore | [`experiments/task-2.md`](experiments/task-2.md) |
| 3 | FR-1 (d), (e), (m): sidecar writers, the two new `meta/` files, copied keys | [`experiments/task-3.md`](experiments/task-3.md) |
| 4 | FR-1 (f), (l): derived indexes and word counts | [`experiments/task-4.md`](experiments/task-4.md) |
| 5 | FR-1 (g) lock edges and failure injection, (h) placement after the original | [`experiments/task-5.md`](experiments/task-5.md) |
| 6 | FR-1 (i): TipTap cut points, marks and `UniqueID` | [`experiments/task-6.md`](experiments/task-6.md) |
| 7 | FR-1 (j) shortcut shortlist and (k) paired-device and Android reach | [`experiments/task-7.md`](experiments/task-7.md) |
| 8 | LEAD/OWNER: choose the shortcut (OQ-8) | [`experiments/task-8.md`](experiments/task-8.md) |
| 9 | Contract: split types, constants and result unions | [`experiments/task-9.md`](experiments/task-9.md) |
| 10 | Message constants module (drafted wording) | [`experiments/task-10.md`](experiments/task-10.md) |
| 11 | Eligibility function (pure, FR-2) | [`experiments/task-11.md`](experiments/task-11.md) |
| 12 | Document cut (pure, FR-3 text half) | [`experiments/task-12.md`](experiments/task-12.md) |
| 13 | Annotation partition and mark cut (pure, FR-11) | [`experiments/task-13.md`](experiments/task-13.md) |
| 14 | Lineage-state resolver (pure, FR-15) | [`experiments/task-14.md`](experiments/task-14.md) |
| 15 | Lineage and latest-operation records (store, FR-5 and FR-16) | [`experiments/task-15.md`](experiments/task-15.md) |
| 16 | No-log truncating write (sibling to `updateRevisionInPlace`, FR-8) | [`experiments/task-16.md`](experiments/task-16.md) |
| 17 | Per-document index update that reports failure (FR-9) | [`experiments/task-17.md`](experiments/task-17.md) |
| 18 | New document builder (FR-3 and FR-10) | [`experiments/task-18.md`](experiments/task-18.md) |
| 19 | Preview and staleness core (FR-7 server half, FR-12 data) | [`experiments/task-19.md`](experiments/task-19.md) |
| 20 | Split apply with ordered writes (FR-3 to FR-8, FR-10, FR-11, FR-16) | [`experiments/task-20.md`](experiments/task-20.md) |
| 21 | Reverse compensation and failure injection (FR-6) | [`experiments/task-21.md`](experiments/task-21.md) |
| 22 | Post-commit index update wiring and failure report (FR-9) | [`experiments/task-22.md`](experiments/task-22.md) |
| 23 | Preview and split routes, client, sharing-gate enumeration and smoke count (FR-14) | [`experiments/task-23.md`](experiments/task-23.md) |
| 24 | Split dialog component (FR-12, FR-19) | [`experiments/task-24.md`](experiments/task-24.md) |
| 25 | Split host (flush, request, reload, cursor at end) (FR-7 client half) | [`experiments/task-25.md`](experiments/task-25.md) |
| 26 | Editor context menu item with disabled reasons and Android exclusion (FR-13, FR-2) | [`experiments/task-26.md`](experiments/task-26.md) |
| 27 | Command palette row and keyboard shortcut (FR-13, FR-19) | [`experiments/task-27.md`](experiments/task-27.md) |
| 28 | LEAD/OWNER: wording review of the message constants (FR-2, OQ-12) | [`experiments/task-28.md`](experiments/task-28.md) |
| 29 | Undo split core (FR-15 read side, FR-17) | [`experiments/task-29.md`](experiments/task-29.md) |
| 30 | Undo rollback and failure injection (FR-6 rules applied to Undo) | [`experiments/task-30.md`](experiments/task-30.md) |
| 31 | Undo and latest-operation routes, client, enumeration and smoke count (FR-14) | [`experiments/task-31.md`](experiments/task-31.md) |
| 32 | Undo split action in the palette and the editor menu (FR-18, FR-19) | [`experiments/task-32.md`](experiments/task-32.md) |
| 33 | Documentation for the scribe (FR-22 documents) | [`experiments/task-33.md`](experiments/task-33.md) |
| 34 | LEAD-RUN: build check | [`experiments/task-34.md`](experiments/task-34.md) |
| 35 | LEAD-RUN: packaged desktop run with the owner | [`experiments/task-35.md`](experiments/task-35.md) |
| 36 | LEAD-RUN: hosted web run with the owner, including a second tenant | [`experiments/task-36.md`](experiments/task-36.md) |
| 37 | LEAD-RUN: CI, documents and close-out | [`experiments/task-37.md`](experiments/task-37.md) |

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

Shortcut: Mod+Shift+Enter, 2026-11-16, the owner (shortlist entry 1 in `task-7.md` (j), recorded by the lead from the owner's word). Mod is Cmd on macOS and Ctrl elsewhere. Record: `experiments/task-8.md`. In the packaged desktop app the key first did nothing with focus in the editor; it was fixed and rechecked during Task 35 (`task-35.md`, defect 2), and it opened the dialog in Chrome on hosted web (`task-36.md`).

## Runs (FR-22)

- **Build check, Task 34** (`task-34.md`): commit `3d17d8f9`. Typecheck, lint, `test:ci`, the import-graph tests, `build`, `build:native`, `build-storybook` and the Electron and CLI typechecks all exited 0.
- **Packaged desktop run, Task 35** (`task-35.md`): unsigned macOS arm64 package, app 2.3.0, macOS 26.5.1. The steps ran on four builds, from `7560d564` to `ccb04277`. The run found three defects, each fixed and rechecked during the run:
  - every split refused (`4a138565`);
  - Cmd+Shift+Enter ignored in the editor (`a2faec93`);
  - a locked project showing a read failure instead of the unlock prompt (`ccb04277`).
  On the last builds the owner observed every listed check as expected. The writing log showed no split or Undo entry through step 6. Two findings are left open: POS `task_2e5f4e45` and `task_fa772933`.
- **Hosted web run, Task 36** (`task-36.md`): commit `5e0adfc1`, hosted-mode production build on the owner's machine, Chrome 157.0.8103.79. The owner observed steps 1 to 6 as expected. The locked-project step does not apply, because encryption is not offered on hosted. A second tenant got the same status and body for the first tenant's ids as for made-up ids on all four split routes, and none of the first tenant's 79 files changed. This is stated under one writer instance per tenant.
- **CI commands, Task 37** (`task-37.md`): commit `ceca6f04`. Every workflow command that can run locally exited 0. `test:ci` failed once on `EntityGraphSettingsPanel.test.tsx`, which passed alone three times and on a full rerun; the cause was not established. `test:sharing-smoke`, which is not in a workflow, also exited 0. The release-only and Linux-only steps were not run.

## Not verified

- Android (the split is not offered there by design).
- A paired device.
- Screen-reader use.
- A document of hundreds of thousands of words.
- A hosted deployment of several server instances, and a deployed hosted service behind a real proxy over https.
- Windows and Linux, including Ctrl+Shift+Enter there.
- A signed or notarized package.
- Browsers other than Chrome.
- A merged-document refusal (needs Feature 121).
- Unticking a note in the moving text on hosted web (run on desktop).
- The writing log after the desktop locked-project step (the project's files were encrypted on disk).
- A positive control for the first tenant through the API on hosted web.
- The CI signing, notarization, release-upload, AppImage and release-please steps.
- Why `EntityGraphSettingsPanel.test.tsx` and `indexer-queue.test.ts` fail only sometimes in a full run.
- Every path not named in the task records.

## Acceptance

Against FR-22, at commit `ceca6f04`:

- The desktop and hosted runs recorded the build, the platform and the version, and what was observed for each listed check. The one exception is the locked-project check on hosted, which does not apply.
- The second-tenant check was run on the four new routes.
- Every CI workflow command was reported as run or not run.
- The "Not verified" list holds the required entries.

Acceptance of the feature is the owner's, at the pipeline's Gate 6.
