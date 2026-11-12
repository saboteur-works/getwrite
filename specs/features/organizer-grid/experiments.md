# Experiments: Organizer grid (Feature 109)

Index only. Each task records its results in `experiments/task-<n>.md`; Task 44 links or summarises them here at close-out. This file is edited by Task 1 (creation) and Task 44 (close-out) only. Spec: `specs/features/organizer-grid.md`. Task list: `specs/features/organizer-grid/tasks.md`.

One departure from FR-1's wording, stated in the task list: FR-1 (e) (excerpt and folder-sidecar read cost at 100, 500 and 2000 cards) and (h) (the card cap) need a generated large project and a device, so they are recorded in Task 42 (lead-run) with the fixture from Task 4, not in Task 1.

## Environment

Node v24.15.0, Vitest v4.1.6, pnpm run through the repository's own scripts. Base commit `928f52b4` (Task 1 run, worktree `agent-ab9dd5a494d6f473c`, branch `worktree-agent-ab9dd5a494d6f473c`, inside the command sandbox, no `next build`, no device). Commands and probes: see [experiments/task-1.md](experiments/task-1.md#environment) and its "Commands run" list. The probe test files were throwaway and are not in the tree; their text is summarised in that record.

## FR-1 inventory

Items (a), (b), (f), (g) and (i) are recorded as observed values or readings in [experiments/task-1.md](experiments/task-1.md):

- (a) order the Organizer shows today against the order the tree shows
- (b) two writes in one handler for one document; a write for a card that is not the globally selected resource
- (f) `NEXT_PUBLIC_GETWRITE_RUNTIME` convention (READ; the `frontend/out/_next/static` grep is Task 41)
- (g) a new `project.json` config key through each path, as the code is before Task 24
- (i) a project type with a key the schema does not know

Items (c) and (d): Task 3. Items (e) and (h): Task 42.

## Device run

Not run. Recorded by Task 42 and summarised by Task 44.

## Card cap

Not measured. No figure is stated anywhere before `experiments/task-42.md` exists.

## Not verified

- Everything in FR-1 (c), (d), (e), (f) output grep and (h): not run by Task 1.
- The Pixel 7 Pro, a paired device, the phone layout, keyboard drag and the card cap: not run.
- Task 1 probes ran in jsdom or node under Vitest with fakes (an in-memory storage adapter, a mocked `AppShell` and a mocked `updateSidecar` forwarding to the real `updateSidecarCore`); none is evidence about a device or a running app.

## Acceptance

Not started. Task 44 closes this file.

## Task records

[1](experiments/task-1.md)
