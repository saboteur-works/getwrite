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

Recorded in [experiments/task-29.md](experiments/task-29.md) (2026-11-11): Pixel 7 Pro (Android 17, WebView 157) by hand, an emulator run (Android 16, WebView 134, CDP scripting; an emulator run, not a device run), and a paired device (the Pixel's browser against a packaged desktop build). Every FR-24 item passed or is listed below as a known limit or not run. The run found defects that were fixed and re-run: the claim controls unreachable on a phone (D6), the Source line shown with the module off (D1), the Claims tab never showing a detached claim (D2), Open not opening the panel, keep-your-place lost at phone width after D6, and `crypto.randomUUID` missing on a paired device (plain HTTP). See [experiments/task-fixes-device-run.md](experiments/task-fixes-device-run.md); post-integration fixes A to E in [experiments/task-fixes-a-e.md](experiments/task-fixes-a-e.md).

Known limits: on Android a copied claim is not carried by paste (the context-menu Paste is refused clipboard read in the WebView, measured; note_db4eb79f); on a phone the passage can sit a little above the visible area after Open; project types cannot be saved on Android.

## Task records

[1](experiments/task-1.md) · [2](experiments/task-2.md) · [3](experiments/task-3.md) · [4](experiments/task-4.md) · [5](experiments/task-5.md) · [6](experiments/task-6.md) · [7](experiments/task-7.md) · [8](experiments/task-8.md) · [9](experiments/task-9.md) · [10](experiments/task-10.md) · [11](experiments/task-11.md) · [12](experiments/task-12.md) · [13](experiments/task-13.md) · [14](experiments/task-14.md) · [15](experiments/task-15.md) · [16](experiments/task-16.md) · [17](experiments/task-17.md) · [18](experiments/task-18.md) · [19](experiments/task-19.md) · [20](experiments/task-20.md) · [21](experiments/task-21.md) · [22](experiments/task-22.md) · [23](experiments/task-23.md) · [24](experiments/task-24.md) · [25](experiments/task-25.md) · [26](experiments/task-26.md) · [27](experiments/task-27.md) · [27-core-imports](experiments/task-27-core-imports.md) · [28](experiments/task-28.md) · [29](experiments/task-29.md) · [30](experiments/task-30.md) · [31](experiments/task-31.md)

## Not verified

- Any device or Android version other than the Pixel 7 Pro (the emulator run is not a device run; `getwrite_min_api24` not run).
- Claims in an encrypted-marked project on Android (the refusal is read from code, not run).
- A claim in a resource near the 500-annotation cap.
- The project-wide claim list on a large project (emulator: 102 ms for two claims in one document; FR-1(e) scan numbers in task-1).
- An older build's treatment of the `claim` key and of a saved project type with `modules` (read and partly probed in task-1 (c) and (d); no older build was run).
- Revision restore and document duplicate with claims on the Pixel (run on the emulator only).
- TalkBack and real-browser contrast on the new controls.
- The full suites after `240c7ddf` (export keywords only; targeted tests run).

## Acceptance

Task 31 ([experiments/task-31.md](experiments/task-31.md)), 2026-11-11, main checkout outside the sandbox: format check, lint (0 errors), no-hex, typecheck, frontend build, `build:native`, Electron typecheck/test (565)/build, CLI typecheck/test (164)/build/smoke, Android placeholder build and e2e (249) exit 0. `test:ci`: 12,153 passed, 1 failed (the Feature 103 timing test in `indexer-queue.test.ts`, 25/25 when run alone). knip after `240c7ddf`: unused exports 154 and exported types 175, equal to main. No `package.json` or lockfile change.

Desktop project-type flow (Stage 6.5), 2026-11-11, owner, packaged desktop app built from `310e2c84`: a writer-made type with Claims set to On started a new project with Claims on. PASS. Seen at the same time: in dark mode the module names in the Project Type Manager's Modules section were black; fixed in the commit after this record (see `git log`), not re-checked in the app.
