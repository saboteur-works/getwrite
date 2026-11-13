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
| (b) option migration on a tagged Source | `experiments/task-2.md` | Task 2 |
| (c) exact-tag `in` query | `experiments/task-2.md` | Task 2 |
| (d) subtype label lost and another gained | `experiments/task-1.md` | recorded by Task 1 |
| (e) folder-sidecar read cost | `experiments/task-3.md` | Task 3 |
| (f) store versus fresh read of `userMetadata` | `experiments/task-1.md` | recorded by Task 1 |
| (g) canonical revision versus `content.txt`; `fetchResourceContent` failure shapes | `experiments/task-1.md` | recorded by Task 1 |
| (h) `NEXT_PUBLIC_GETWRITE_RUNTIME` inlining in new client modules | `experiments/task-27.md` | Task 27 (lead-run) |
| (i) shell fallback for an open view that is switched off | `experiments/task-1.md` | recorded by Task 1 |

## Column limit

Not yet measured. Set by Task 29 from Task 28 (FR-12, FR-25). Until then `COMPARISON_COLUMN_LIMIT` is `null` and no limit is claimed.

## Device run

Not run. Task 30 (lead-run).

## Not verified

Filled by Task 31 at close-out. As of Task 1: no device, WebView, build or Storybook behaviour has been run.

## Acceptance

Filled by Task 31.
