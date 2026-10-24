# Experiments: Feature 93, stale saves and index races

Source spec: `specs/features/stale-saves-and-index-races.md`. Vocabulary: every entry is MEASURED (values observed in a run), READ, not run, or UNMEASURED (with the reason). No cause is written for any value. A non-reproduction is recorded with its counts and construction and is not evidence that the case is safe under other timing (FR-2).

## Environment record (Task 1)

All entries MEASURED unless stated; recorded 2026-10-24 on the unchanged tree.

| Item | Value |
| --- | --- |
| Date | Sat Oct 24 14:22:10 MDT 2026 (`date`) |
| Branch | `fix/stale-saves-and-index-races` (`git branch --show-current`) |
| HEAD | `90ea2c5a36632220438ecb22744842e08b5a458d` (`git rev-parse HEAD`) |
| `git status --short` | empty output (clean tree) |
| Node | v24.15.0 (`node -v`) |
| Vitest | 4.1.6, darwin-arm64, node-v24.15.0 (`pnpm exec vitest --version` from `frontend/`) |
| pnpm warning on every command | `WARN Issue while reading "/Users/jedaisaboteur/.npmrc". EPERM: operation not permitted` (sandboxed runs) |

`lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN`: no output, exit 1 (no listener on any of the three ports). Run twice: 2026-10-24 14:22 and again immediately before `pnpm test:e2e`; both empty.

## Baselines (Task 1)

All MEASURED, 2026-10-24, HEAD `90ea2c5a`, one run each unless stated.

| Command (cwd) | Result |
| --- | --- |
| `pnpm typecheck` (`frontend/`) | exit code 0 |
| `pnpm lint` (`frontend/`) | exit code 0; 392 problems: 0 errors, 392 warnings; "0 errors and 7 warnings potentially fixable with `--fix`" |
| `pnpm test:ci` (`frontend/`) | exit code 1. Test Files: 1 failed, 674 passed (675). Tests: 1 failed, 8217 passed, 2 expected fail, 1 skipped (8221). Duration 95.33s. Failure: `tests/component/EntityGraphSettingsPanel.test.tsx > EntityGraphSettingsPanel > persists a changed hop radius` (`AssertionError: expected "vi.fn()" to be called with arguments: [ 'p1', ... ]`). |
| `pnpm exec vitest run tests/component/EntityGraphSettingsPanel.test.tsx` (`frontend/`), 3 repetitions after the failing full run | 3 of 3 runs: Test Files 1 passed (1); Tests 10 passed (10). |
| `pnpm test:e2e` (`frontend/`, outside sandbox) | exit code 0; 230 passed, 1 skipped, 0 failed (1.5m). Failure names: none. |
| `pnpm knip` (repo root) | exit code 1. Findings by section: Unused files 49; Unused dependencies 1; Unused devDependencies 4; Unlisted dependencies 6; Unlisted binaries 4; Unused exports 160; Unused exported types 174; Duplicate exports 14. Sum of these eight sections: 412. Configuration hints: 6 (not counted in the 412). |
| `pnpm --filter getwrite-cli test` | Test Files 23 passed (23); Tests 153 passed (153); duration 266.58s. Output also contained `error: missing required argument 'source'` and `error: unknown option '--saved-types-dir'` lines; the run reported all tests passed. |
| `pnpm --filter getwrite-electron test` | Test Files 34 passed (34); Tests 528 passed (528); duration 2.50s. |

Stated figures in the task text (0 errors / 392 warnings; knip 412) match the observed values.

`git status --short` after all suites (before this file was created): empty output. No stray files appeared from the test runs.

## E-1 Stale `name` after rename, then stale whole-resource `updateSidecarCore`

(empty; Task 3)

## E-2 Stale `updatedAt` after a canonical save

(empty; Task 3)

## E-3 Stale `dismissedNoiseTerms` after `setNoiseTermDismissedCore`

(empty; Task 3)

## E-4 Key inventory

(empty; Task 2)

## E-5 Features-route senders, two quick edits

(empty; Task 4)

## E-6 Editor config, overlapping and older-copy saves

(empty; Task 5)

## E-7 Entity-graph settings, older-copy save

(empty; Task 5)

## E-8 Mention index writer races

(empty; Task 6)

## E-9 Backlinks writer races

(empty; Task 7)

## FR-3 callers of updateSidecarCore

(empty; Task 2)

## FR-17 callers of the functions FR-15 and FR-16 change

(empty; Task 8)

## FR-20 test-edit list

(empty; Tasks 8 and 12)
