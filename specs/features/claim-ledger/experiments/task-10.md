# Task 10 results: claim validators

Environment: worktree `agent-a823c0048684aa0dc`, 2026-11-11, vitest 4.1.6.

## Order

Tests added first to `frontend/tests/unit/annotation-validation.test.ts` (new `describe` block, 16 tests). First run: 15 failed, 19 passed (34), the failures being the four validators not yet existing. After the source was added, two tests failed because my test keyed the no-echo check on the key `claim`, a substring of the fixed message "A claim ..."; the test was changed to use `claimMarker` (a test error, not a source error). Final: 34 of 34 pass.

## Added (`frontend/src/lib/models/annotation-validation.ts`)

- `validateClaimStatement(statement)`: 1 to 5000 UTF-16 code units, refused not truncated.
- `validateNewClaim(input, existing)`: keys `id`, `statement`, `quote`, `target` only (a client `status`, `statusChangedAt`, `claim` or `body` is refused); id, collision and 500-per-resource checks as `validateNewAnnotation`; statement may not be empty with or without `target`.
- `validateUpdateClaim(input)`: keys `status`, `statement`, `target` (`null` clears the link); status must be one of the four identifiers (so `unsourced` is refused); target through `validateAnnotationTarget`; at least one key present; `statusChangedAt` is an unknown key.
- `validateCarriedClaim(input)`: exactly `status` (known) and `statusChangedAt` (ISO shape and parseable); returns `ClaimMarker`.
- The new validators' messages are fixed strings and never include input. (Existing validators still echo an unknown key name; left unchanged by the task.)

`validateAnnotationBody` and `validateNewAnnotation` were not modified; the existing tests pass untouched.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/annotation-validation.test.ts tests/unit/annotations-core.test.ts tests/unit/core-import-graph.test.ts tests/unit/claim-types.test.ts` (frontend) | run, 83 passed |
| `pnpm typecheck` (frontend) | run, no errors |
| `pnpm exec eslint` on the 2 touched files | run, no output |
| `pnpm --filter getwrite-electron typecheck` (both tsc passes) | run, no errors |
| `pnpm --filter getwrite-cli typecheck` | run, no errors |

Not run: full vitest suite, `pnpm lint` over the whole project (eslint run on touched files only), `next build`, `build:native`, e2e.

## Decisions and notes

- `ClaimMarker.status` is `string`; `validateCarriedClaim` accepts only the four known identifiers (task requirement), so an off-list stored status is not carried by paste through this validator. Task 14 should know that a stored off-list status on a copied claim would be refused here; whether paste should drop the claim, keep it unvalidated or refuse is not decided by this task.
- ISO check is local (a shape regex plus `Date.parse`), because `IsoDateString` in `schemas.ts` is not exported and `schemas.ts` is not a declared file. It accepts `Z` or an offset and optional fractional seconds. A date like `2026-02-31T00:00:00.000Z` is not tested here; `Date.parse` behaviour for it was not measured.
- Open point in the task notes (FR-10 vs FR-18) is handled as the task says: the carried validator is separate and `validateNewClaim` refuses any client date.

## Not verified

Nothing about locks, writes, routes or transports is claimed; these are pure validators.
