# Task 30: merged-away rule, goals (FR-19)

## Files

- `frontend/src/lib/models/goal-filtered-total-core.ts`: `sumOutsideInbox` skips a sidecar for which `isMergedDocument` is true. `evaluateGoalFilteredTotal` needed no edit: it sums the ids `evaluateGoalMembership` returns.
- `frontend/src/lib/models/goal-filter-membership-core.ts`: `evaluateGoalMembership` takes an optional third argument `{ includeMerged?: boolean }`. By default a resource whose loaded sidecar (`input.sidecars[id]`, which keeps top-level keys) satisfies `isMergedDocument` is not a member.
- `frontend/src/lib/models/writing-log-core.ts`: `readMergeCutoffs` reads the mark's date for each marked document the window names; `aggregateForRoot` skips a non-import entry of that document whose timestamp is later than it. The filtered branch calls `evaluateGoalMembership` with `includeMerged: true`.
- `frontend/tests/unit/merge-rule-goals.test.ts` (new, 13 tests).

## Decisions

- The mark's date is an ISO instant, as `MergedMark.date` in `merge-types.ts` says. The daily goal compares entry timestamps (instants) with it: an entry later than the mark is skipped, an entry at the same instant or earlier counts.
- A date-only value (`2026-11-18`) or a mark with no string `date` makes the daily figure unavailable (`GoalFilteredFigureUnavailableError`, cause `corrupt`), not a number. Reason: a date-only value leaves the merge day ambiguous (UTC midnight would drop or keep the whole day). `experiments/task-22.md` was not in this worktree, so what Task 22 validates was not read; if it accepts any parseable string, a date-only mark written through it would show the daily figure as unavailable. Task 22 should write a full instant. This is a hypothesis about Task 22 not a measurement; reading its record would settle it.
- With a Goal filter set, membership must exclude a marked document (spec) while today's figure must not change at a merge (spec). Both hold only if the daily figure keeps marked documents in the selection and applies the date rule itself, hence the `includeMerged` option. Only `writing-log-core.ts` sets it.
- Filtered total and unfiltered total exclude a marked document whatever the mark's content (any non-null value, as `isMergedDocument` defines it). Only the daily figure reads the date.
- Not changed: the per-resource word-count goal (a test shows `wordCountGoal` and `wordCount` stay on a marked sidecar; no goal file reads them per resource), the root `CLAUDE.md` glossary (Task 42).
- The `experiments/task-3.md` list names these three files for the goal readers; no further file holds the server total.
- Known limit, not tested: a custom field in `userMetadata` named `mergedMark` is flattened over the top-level key by `flattenUserMetadata`, so the membership check could see it. Not measured.

## Tests first

Run before the production edits: `pnpm exec vitest run tests/unit/merge-rule-goals.test.ts --project node`: 8 failed, 5 passed. The 5 that passed need no new behaviour (for example the predicate read and the per-resource goal, which are guards; I did not record which five by name). The failures seen included the daily figure counting 130 where 110 was expected with a filter set, and the two malformed-mark tests resolving instead of rejecting.

After: 13 passed.

## Done when

| Clause | Verified by |
|---|---|
| Marked document not in the unfiltered total | `a marked document is not in the unfiltered project total` (157, not 257) |
| Not in the filtered total | `a marked document is not in the filtered total` |
| Not a member although the query matches | `... not a member even when the filter's query matches it`, plus the no-match case |
| Daily goal skips only entries after the mark's date | `skips only entries ... dated after the mark's date` (110), the exact-instant test, and the filtered-branch test |
| Today's figure same before and after a merge | `today's figure is the same before and after a merge` |
| Target words after the merge count | `words typed into the target after the merge count normally` |
| Per-resource goal unchanged | `stays on the sidecar of a marked document, unchanged` (sidecar only; no per-resource goal reader is in the three files) |
| Existing goal and writing-log tests pass unmodified | 20 files, 323 tests passed: `writing-log*`, `goal-*`, `revision-writing-log`, `core-import-graph`, `split-core-import-graph`, with the new file |
| Reads the one `isMergedDocument` predicate and the mark's date | imported from `split-eligibility.ts` in all three cores; date read via `MERGED_MARK_SIDECAR_KEY`. `merge-mark-core.ts` does not exist in this worktree, so the date is read in `writing-log-core.ts` directly |
| Checks | `pnpm typecheck` clean; `pnpm lint` 0 errors (459 existing warnings); Electron typecheck (both passes) clean; CLI typecheck clean; prettier clean on the four files |

Not run: the full `test:ci` suite, Storybook, e2e.
