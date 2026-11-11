# Experiments: Claim ledger (Feature 108)

Index only. Each task records its results in `experiments/task-<n>.md`; Task 31 links or summarises them here at close-out. Spec: `specs/features/claim-ledger.md`. Task list: `specs/features/claim-ledger/tasks.md`.

## Environment

Node v24.15.0, Vitest v4.1.6, base commit `7c66c6fd` (Task 1 run, worktree `agent-a42097359ddea1809`, inside the command sandbox, no `next build`). Commands and probes: see [experiments/task-1.md](experiments/task-1.md#environment) and its "Commands run" list.

## FR-1 inventory

Items (a) to (g) are recorded as observed values or readings in [experiments/task-1.md](experiments/task-1.md):

- (a) readers of `config.modules` and calls of the enablement functions
- (b) registry to manifest import and the worker import graph
- (c) a field added to a stored annotation through each path
- (d) project types with an unknown key
- (e) sidecar scan count and time
- (f) `NEXT_PUBLIC_GETWRITE_RUNTIME` convention (READ; the output grep is Task 28)
- (g) what `CitationControlSlot` renders

## Device run

Not run. Recorded by Task 29 (lead and owner, Pixel 7 Pro and a paired device) and added at close-out by Task 31.

## Not verified

At Task 1: the `frontend/out/_next/static` inlining grep (Task 28); any behaviour on a device or in a real WebView; the Manager page rendering a list that holds an unknown-key type (only the response schema was run); the scan time through the app's own read path or on a project with annotations; the worker import graph with the real `registry.ts` after Task 3 edits it.

## Acceptance

Open until Task 31.
