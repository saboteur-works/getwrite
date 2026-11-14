# Experiments: Folklore variants and motifs (Feature 110)

Index only. Each task records its measurements in `specs/features/folklore-variants/experiments/task-<n>.md`; this file is edited by Task 1 (creation) and Task 31 (close-out) only. Spec: `specs/features/folklore-variants.md` (FR-1, FR-25). Tasks: `specs/features/folklore-variants/tasks.md`.

## Environment

Recorded by Task 1.

- Node: v24.15.0 (`node -v`).
- pnpm: 10.28.0 (`pnpm -v`).
- Vitest: v4.1.6 (header of `pnpm --filter getwrite-frontend exec vitest run`).
- Platform: Darwin 25.5.0, run inside the Claude Code command sandbox.
- Base commit: `64823bc0` (`git rev-parse --short HEAD`, branch `worktree-agent-a9ca7280747077716`, from `feat/folklore-variants`).
- Commands: reads with `grep` and `sed`; throwaway vitest probe `probe-task1.test.ts` (kept outside the repository, copied into `frontend/tests/unit/` for one run and removed); `pnpm exec vitest run tests/page-stale-sidecar-save.test.tsx` from `frontend/`.
- Not run by Task 1: `next build`, Storybook, e2e, any device.

## FR-1 inventory

| Item | Recorded in | Status |
| --- | --- | --- |
| (a) readers of `config.modules` and module-registry callers | `experiments/task-1.md` | recorded by Task 1 |
| (b) option migration on a tagged Source | `experiments/task-2.md` | recorded by Task 2 |
| (c) exact-tag `in` query | `experiments/task-2.md` | recorded by Task 2 |
| (d) subtype label lost and another gained | `experiments/task-1.md` | recorded by Task 1 |
| (e) folder-sidecar read cost | `experiments/task-3.md` | recorded by Task 3 |
| (f) store versus fresh read of `userMetadata` | `experiments/task-1.md` | recorded by Task 1 |
| (g) canonical revision versus `content.txt`; `fetchResourceContent` failure shapes | `experiments/task-1.md` | recorded by Task 1 |
| (h) `NEXT_PUBLIC_GETWRITE_RUNTIME` inlining in new client modules | `experiments/task-27.md` | recorded by Task 27 (lead-run) |
| (i) shell fallback for an open view that is switched off | `experiments/task-1.md` | recorded by Task 1 |

## Task records

| Record | What it holds |
| --- | --- |
| [`task-1.md`](experiments/task-1.md) | FR-1 (a), (d), (f), (g), (i): readings of the code and a vitest probe |
| [`task-2.md`](experiments/task-2.md) | FR-1 (b) option migration on a tagged Source and (c) the exact-tag query, 14 unit tests |
| [`task-3.md`](experiments/task-3.md) | FR-1 (e) folder-sidecar read cost: 41 folders read in 0.55 to 1.28 ms per pass (5 passes, one machine) |
| [`task-5.md`](experiments/task-5.md) | Module declaration, view slot and switch; Narratives listed in the Project Types editor as not set |
| [`task-23.md`](experiments/task-23.md) | Accessibility and keyboard tests in jsdom; no screen-reader run |
| [`task-25.md`](experiments/task-25.md) | Long-text fixture generator (synthetic text) |
| [`task-26.md`](experiments/task-26.md) | Documentation sources |
| [`task-27.md`](experiments/task-27.md) | FR-1 (h): web build and native export exit 0; runtime variable inlined in 0 client files |
| [`task-28.md`](experiments/task-28.md) | Column-limit run on long text |
| [`task-30.md`](experiments/task-30.md) | Pixel 7 Pro device run |
| [`task-31.md`](experiments/task-31.md) | CI commands at close-out |

## Column limit

From `experiments/task-28.md` (production build, Playwright Chromium, synthetic text of 300 to 20000 words). Showing the comparison took at most 80 ms and no scroll frame exceeded 50 ms in any cell, so width decided. With "usable" meaning text at least 240 px wide, the largest usable N was 3 at 1440×900 with sidebars open, 4 with them closed, 3 at 1024×768 with sidebars closed, and none at 1024×768 with sidebars open. The owner set `COMPARISON_COLUMN_LIMIT` to 3 (Task 29) and raised the column floor from 12rem to 16.125rem (Task 37), so a column at the floor holds 240 px of text. The task-28 widths were measured with the 12rem floor; the 16.125rem floor is checked by the e2e spec's 240 px assertions, not by a rerun of task-28.

## Device run

From `experiments/task-30.md`: Pixel 7 Pro, Android 17, WebView 157.0.8103.50, debug build of `36a8bea7`. Portrait (411 CSS px) showed the list and the phone message; landscape (850 CSS px) showed Compare and two columns with 359 px of text each and no sideways scroll. Opening a variant, the remembered selection and the module switch worked, as reported by the owner. The owner closed Task 30 with the paths below unrun.

## Not verified

- A paired device (home-network sharing).
- Any Android device other than the Pixel 7 Pro; a tablet or foldable width on Android.
- An unreadable variant, an audio-only variant and its player, a file over the Android limit, and a locked or encrypted-marked project, on any device.
- A screen reader (VoiceOver, TalkBack, NVDA).
- A large narrative or long real (non-synthetic) text; touch scrolling inside a column; three columns on a device.
- Electron.
- The column-limit run on any machine but the lead's Mac, or any cell more than once.

## Acceptance

See `experiments/task-31.md` for the CI commands run at close-out.
