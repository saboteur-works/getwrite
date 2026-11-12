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

Recorded in [experiments/task-42.md](experiments/task-42.md) (2026-11-11 and 2026-11-12, owner by hand): the Pixel 7 Pro with a debug build from `457b2e68`, and the Pixel's browser paired to a packaged desktop build from the same commit. Passed: the phone grouped lists, a status change in the sidebar moving the card to its group and kept after a later sidebar edit, a repeat smart-folder switch with no old cards, arrangements saved, renamed, applied, deleted and the last-used one kept after a full restart; on the paired device the same plus a desktop drag across a select column seen on the paired browser. A change made on the paired device shows in the desktop window only after a reload, as recorded for home-network sharing before this feature. Build and inlining check: [experiments/task-41.md](experiments/task-41.md) (0 occurrences of `NEXT_PUBLIC_GETWRITE_RUNTIME` under `frontend/out/_next/static`).

Known limits: a phone cannot move a card (no drag on the grouped lists by spec; owner accepted, note_f8dd50fa). Phone checks on hold for a phone layout pass (note_edd2e4d3): other axis types on the phone, a multiselect card in two groups, an unavailable arrangement.

## Card cap

500 cards, set by the owner on 2026-11-12 (`ORGANIZER_GRID_CARD_CAP`), from two desktop measurements on `next dev`: [task-42-measurement-desktop.md](experiments/task-42-measurement-desktop.md) (100 / 500 / 2000, before the fixes) and [task-42-measurement-desktop-2.md](experiments/task-42-measurement-desktop-2.md) (250 / 500 / 2000, after them). At 500 the two runs agree (render 534 and 696 ms, key press 319 and 316, drag 488 and 541). Summary and the reasons the 2000 figures differ: `task-42.md`. The desktop measurement found the excerpt request failing above 1000 cards, old cards on a repeat smart-folder switch, 2 to 3 arrow presses per row in keyboard drag and excerpt requests at phone width; fixed in `457b2e68` and re-measured in the second run ([task-fixes-measurement.md](experiments/task-fixes-measurement.md)).

## Not verified

- Phone: Rows Subtype and custom select, multiselect or reference fields; a multiselect card in two groups; an unavailable arrangement (on hold, see above). A two-field drop, a drop on None, a refused drop and a multiselect partial move on a device (the desktop drag in the paired run moved a card; which fields changed was not recorded). Keyboard with a keyboard attached to the phone. 360px on a device; other Android devices; TalkBack.
- The "N not shown" line in a running app (the cap was set after the device runs; unit tests only).
- Seeded arrangements from a project type in a running app (Android cannot save project types).
- A production build's timings; the Pixel was not timed, so no separate Android cap.
- Focus after a drop in a real browser: measured in the second desktop run (on the page body for 3 to 5 s while the smart folder reloads at 2000 cards, then back on the moved card); the keyboard test keeps one `it.fails` case for it.
- The full suites after `2cd2d11b` (export keywords only; targeted tests and knip run).
- Task 1 probes ran in jsdom or node under Vitest with fakes; none is evidence about a device or a running app.

## Acceptance

Task 44 ([experiments/task-44.md](experiments/task-44.md)), 2026-11-12, main checkout outside the sandbox, at `3b17f82f`: format check, lint (0 errors), no-hex, typecheck, `test:ci` (12,745 passed, none failed), frontend build, `build:native`, Electron typecheck/test (565)/build, CLI typecheck/test (164)/build/smoke, Android placeholder build and e2e (254) exit 0. knip after `2cd2d11b`: unused exports 153 and exported types 175 (main 154 and 175). No `package.json` or lockfile change.

## Task records

[1](experiments/task-1.md) · [2](experiments/task-2.md) · [3](experiments/task-3.md) · [4](experiments/task-4.md) · [5](experiments/task-5.md) · [6](experiments/task-6.md) · [7](experiments/task-7.md) · [8](experiments/task-8.md) · [9](experiments/task-9.md) · [10](experiments/task-10.md) · [11](experiments/task-11.md) · [12](experiments/task-12.md) · [13](experiments/task-13.md) · [14](experiments/task-14.md) · [15](experiments/task-15.md) · [16](experiments/task-16.md) · [17](experiments/task-17.md) · [18](experiments/task-18.md) · [19](experiments/task-19.md) · [20](experiments/task-20.md) · [21](experiments/task-21.md) · [22](experiments/task-22.md) · [23](experiments/task-23.md) · [24](experiments/task-24.md) · [25](experiments/task-25.md) · [26](experiments/task-26.md) · [27](experiments/task-27.md) · [28](experiments/task-28.md) · [29](experiments/task-29.md) · [30](experiments/task-30.md) · [31](experiments/task-31.md) · [32](experiments/task-32.md) · [33](experiments/task-33.md) · [34](experiments/task-34.md) · [35](experiments/task-35.md) · [36](experiments/task-36.md) · [37](experiments/task-37.md) · [38](experiments/task-38.md) · [39](experiments/task-39.md) · [40](experiments/task-40.md) · [41](experiments/task-41.md) · [42](experiments/task-42.md) · [42-measurement-desktop](experiments/task-42-measurement-desktop.md) · [42-measurement-desktop-2](experiments/task-42-measurement-desktop-2.md) · [43](experiments/task-43.md) · [44](experiments/task-44.md) · [fixes-measurement](experiments/task-fixes-measurement.md) · [fixes-post-integration](experiments/task-fixes-post-integration.md) · [fix-excerpts](experiments/fix-excerpts.md) · [fix-wiring](experiments/fix-wiring.md)
