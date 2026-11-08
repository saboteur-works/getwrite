# Experiments: Sources view, excerpts and citations, module registry (Feature 103)

Measurements are recorded as observed values. A cause is written only after an experiment has separated it from the alternatives.

## Environment

- Node: v24.15.0 (`node -v`), Darwin arm64 (Darwin 25.5.0), run inside the Bash sandbox.
- Base commit: `32924842` (`spec(feature-103): Sources module and first cut of the contribution seam`), branch `feat/sources-module-seam`, worktree for Wave 1 Task 1.
- Commands (from `frontend/`):
  - `pnpm exec vitest run tests/unit/indexer-queue.test.ts tests/unit/project-json-lock-scan.test.ts`
  - `F103_T1_OUT=<file> pnpm exec vitest run tests/unit/indexer-queue.test.ts -t "F103"` (appends the measurement line to `<file>`)
  - `pnpm typecheck`, `pnpm exec eslint tests/unit/indexer-queue.test.ts`
- Build: none. `next build`, `pnpm build:native` and `pnpm test:e2e` were not run (main checkout only, per `tasks.md`). No product source file was changed.

## Wave 1 config.modules read cost (FR-6)

Task 1. Test: `frontend/tests/unit/indexer-queue.test.ts`, `describe` "indexer queue per-save time with an extra project.json read (F103 Task 1)". It records; it asserts no timing threshold.

Method as built. `runTask` in `frontend/src/lib/models/indexer-queue.ts` is not exported, so each save is one `enqueueIndex` followed by `flushIndexer`, over a real-filesystem adapter wrapped to timestamp every adapter call. The span measured is the start of the first adapter call to the end of the last adapter call of that one task. In the "with" condition the wrapper, at the sidecar read that opens `runTask`, first awaits one plain `readFile` of `project.json` followed by `JSON.parse`, inside the measured span. No lock is taken for that read. The two conditions alternate (order flipped each iteration); 5 unmeasured warm-up saves precede them.

Project size: 40 text resources of 400 words each (`content.txt` plus sidecar), no entities, no backlinks authored; `project.json` 5252 bytes (200 statuses and 200 subtypes in `config`). Runs: 30 saves per condition per test run. The test was run 3 times in the same invocation shape (three test processes), giving these lines, with per-run median, min and max over 30 saves (milliseconds):

| Test run | Without extra read (median / min / max) | With one extra project.json read (median / min / max) |
| --- | --- | --- |
| 1 | 10.76 / 9.36 / 19.75 | 11.11 / 10.13 / 19.82 |
| 2 | 11.10 / 10.20 / 12.51 | 10.92 / 9.68 / 12.28 |
| 3 | 10.94 / 10.12 / 20.39 | 11.18 / 9.62 / 19.68 |

An earlier set of 3 runs with a 46-byte `project.json` gave medians of 10.72, 10.89, 10.92 ms without and 11.06, 10.82, 10.77 ms with the read; an intermediate set of 3 runs at 5252 bytes gave medians of 11.06, 11.22, 11.15 ms without and 10.97, 11.11, 11.04 ms with it.

Observed: across these runs the per-save median is about 10.7 to 11.2 ms in both conditions, and the difference between the two medians within a run ranges from -0.2 to +0.4 ms. Min and max vary by run. These are values from one machine and one project size; no cause is stated for them, and the 30-run samples were not tested statistically.

## FR-9 reindex runs

Not yet recorded.

## FR-10 spike

Not yet recorded.

## Module-switch cases

Not yet recorded.

## FR-13 inventory

Not yet recorded.

## Wave 2 Android image display

Not yet recorded.

## Wave 2 Android 100 MB baseline

Not yet recorded.

## Not verified

- Task 1: the measurement covers the extra read as issued from a wrapper adapter at the start of the task, not a read added inside `runTask` (that would be a product source change, which Task 1 does not make; Task 7 applies it). Only one machine, one project size and one storage adapter (real filesystem, no encryption, no hosted tenant adapter) were measured. A locked or encrypted project was not measured.
- `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck` were not run for Task 1 (the only file changed under the code tree is a frontend test; no models, `core.ts`, `cli/` or `electron/` file changed).

## Acceptance

Not yet recorded.
