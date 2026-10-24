# Feature 92 experiments: one project.json lock

Each item is MEASURED (observed in a run, stated as values) or UNMEASURED (not run, with the reason). No cause is written for any value.

## Environment record

- Date of all runs below: 2026-10-23.
- Branch `fix/project-json-write-lock`, main checkout, no worktree.
- `git rev-parse HEAD`: `a8931fb2a7889d0c26daaa76bcf58be09bcf3fd1`.
- `git status --short` before any run: empty output (clean tree).
- Node `v24.15.0` (`node -v`). Vitest v4.1.6 (as printed by the runs).
- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN`, run immediately before `pnpm test:e2e`: no output, exit 1 (nothing listening on 7340, 3000 or 6006). Run again after the suites on 6006: no output, exit 1.
- `pnpm test:ci`, `pnpm test:e2e`, `pnpm knip` and the CLI and electron suites were run outside the sandbox; `typecheck` and `lint` inside it. Logs were written to the session scratchpad, not the repo.

## Baselines (unchanged tree)

| Command | Directory | Observed |
| --- | --- | --- |
| `pnpm typecheck` | `frontend/` | exit code 0 |
| `pnpm lint` | `frontend/` | exit code 0; `391 problems (0 errors, 391 warnings)`; 7 warnings reported as potentially fixable with `--fix` |
| `pnpm test:ci` (`vitest run`) | `frontend/` | exit 0; Test Files 660 passed (660); Tests 7925 passed, 2 expected fail, 1 skipped (7928); duration 46.44s. Failed: 0 |
| `pnpm test:e2e` (`playwright test`) | `frontend/` | exit 0; 230 passed, 1 skipped, 0 failed (1.1m). Names of failures: none |
| `pnpm knip` | repo root | exit 1 (`ELIFECYCLE`). Findings by section: Unused files 49; Unused dependencies 1; Unused devDependencies 4; Unlisted dependencies 6; Unlisted binaries 4; Unused exports 160; Unused exported types 174; Duplicate exports 14. Sum 412. Separately, 6 configuration hints (not counted as findings) |
| `pnpm --filter getwrite-cli test` | repo root | exit 0; Test Files 23 passed (23); Tests 153 passed (153). Stderr lines `error: missing required argument 'scrivPath'`, `error: missing required argument 'source'`, `error: unknown option '--saved-types-dir'` were printed during the passing run |
| `pnpm --filter getwrite-electron test` | repo root | exit 0; Test Files 34 passed (34); Tests 528 passed (528) |

Notes on the figures:

- The knip baseline is a non-zero exit on the unchanged tree; later tasks compare finding counts per section against this table, not against exit 0.
- The lint figure is warnings only; later tasks compare the count 391 and the error count 0.
- `git status --short` after all runs: empty output (no change outside `specs/`; this file is the only addition and was written after the check).

## Not measured

- Nothing in the Task 1 command list was skipped.

## FR-15 sidecar races

Task 2. Run on 2026-10-23 on branch `fix/project-json-write-lock` at `HEAD` `ce84dc34` (no source change; `main`'s sidecar and lock code is unchanged on this branch). Run inside the sandbox with Vitest v4.1.6 via an experiment-only config, so `frontend/vitest.config.ts` is not edited and the suite does not reach the script.

- Script: `specs/features/project-json-single-lock/scripts/fr15-sidecar-races.test.ts`; config: `specs/features/project-json-single-lock/scripts/vitest.fr15.config.ts`.
- Command, from `frontend/`: `timeout 580 pnpm exec vitest run --config ../specs/features/project-json-single-lock/scripts/vitest.fr15.config.ts < /dev/null`. Exit 0, 1 test passed (the test records counts and does not assert on them).
- Design: each repetition builds a fresh project in its own subdirectory (`rep-<n>`) with one sidecar `{ id, updatedAt: "1970-01-01T00:00:00.000Z", marker: "before", userMetadata: { tone: "ominous", other: "keep" } }`, one canonical revision and a one-field metadata schema. Two writers are started together via `Promise.allSettled`, the second delayed 0-3 ms by a per-repetition offset. Each writer changes a distinct field:
  - `sidecar` writer: `readSidecar` then `writeSidecar` (`withMetaLock`) setting `marker: "after"`.
  - `revision` writer: `updateRevisionInPlace` (`revision-content:` `acquireLock`), which sets `updatedAt`.
  - `migrate` writer: `clearField` (reaches `forEachUserMetadata`, `metadata-schema.ts:307`), which deletes `userMetadata.tone`.
- After both settle the sidecar is read from disk. A "lost change" is one writer's field not holding its new value (`marker !== "after"`, `updatedAt` still the 1970 value, `userMetadata.tone` still present). "Unparseable" is a sidecar that does not `JSON.parse`. Counts are per writer change, so one repetition can lose up to 2.
- Temp directories are left in place (not cleaned) so the sidecars can be inspected.

| Pair | Repetitions | Lost changes | Unparseable files | Rejected writer promises | Temp directory |
| --- | --- | --- | --- | --- | --- |
| `writeSidecar` vs `updateRevisionInPlace` | 100 | 41 | 0 | 0 | `/tmp/claude-501/gw-fr15-sidecar-revision-sDoVl3` |
| `writeSidecar` vs `forEachUserMetadata` (via `clearField`) | 100 | 10 | 0 | 0 | `/tmp/claude-501/gw-fr15-sidecar-migrate-xmpLAN` |
| `updateRevisionInPlace` vs `forEachUserMetadata` (via `clearField`) | 100 | 0 | 0 | 0 | `/tmp/claude-501/gw-fr15-revision-migrate-lpa4HL` |

Breakdown read back from the retained sidecars (observed final states):

- `writeSidecar` vs `updateRevisionInPlace`: 59 repetitions held both changes, 23 held `marker: "after"` with `updatedAt` unchanged, 18 held `updatedAt` changed with `marker: "before"`.
- `writeSidecar` vs `forEachUserMetadata`: 90 repetitions held both changes, 9 held `marker: "before"` with `tone` removed, 1 held `marker: "after"` with `tone` still present.

An earlier 3-repetition smoke run of the same script (directories deleted) recorded 0, 3 and 0 lost changes for the three pairs in the order above.

Observed, no cause stated: two pairs reproduced a lost update on this tree: `writeSidecar` vs `updateRevisionInPlace` (41 of 100 repetitions' worth of changes) and `writeSidecar` vs `forEachUserMetadata` (10 of 100). `updateRevisionInPlace` vs `forEachUserMetadata` did not (0 of 100). Per the Task 2 and spec FR-15 rule this is a scope question for the owner; sidecars are out of scope until decided, and no source was changed.

Closing line: lost update reproduced: YES for 2 of 3 pairs (`writeSidecar` vs `updateRevisionInPlace`; `writeSidecar` vs `forEachUserMetadata`); NO for `updateRevisionInPlace` vs `forEachUserMetadata`. Unparseable sidecars: 0 in all 300 repetitions.
