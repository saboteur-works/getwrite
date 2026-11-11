# Task 11 results: addClaimCore

Environment: worktree `agent-acd5a7125dd73b9a9`, 2026-11-11.

## Order

Tests first: `frontend/tests/unit/claims-add-core.test.ts` (new, 13 tests). Against the Task 2 stub, 12 failed and 1 passed (the node:fs source check, which passes on any stub). After the implementation, 2 tests failed: an empty quote was accepted. Measured: `validateNewClaim` (Task 10) accepts `quote: ""` (the shared quote validator allows an empty quote for a note), so "an empty selection is refused" is enforced in `addClaimCore` itself, before the lock. After that, 13 of 13 pass.

## Implemented (`frontend/src/lib/models/claims-add-core.ts`)

- `addClaimCore(projectId, resourceId, input)`: resource id UUID check, project root from the validated id, `validateNewClaim(input, [])` and an empty-quote refusal before any lock; then one `mutateSidecar` call that refuses a missing sidecar (`AnnotationResourceNotFoundError`) and any type other than `text` (`AnnotationResourceTypeError`, so image, audio and Source are refused, unlike notes), re-runs `validateNewClaim` against the stored array (collision, 500 cap across claims and notes), and appends the annotation with `claim: { status: "unverified", statusChangedAt: now }`, body = statement, `createdAt` = `updatedAt` = `now`.
- Error classes are reused from `annotations-core.ts` so Task 15's route mapping applies unchanged. Imports no React, JSX or JSON; no `node:fs` (a test reads the source to check).
- The core does not call `enqueueIndex` itself; `mutateSidecar` does its own post-write enqueue (as `annotations-core.ts` documents). Annotation-body indexing for claims after `addClaimCore` was not separately tested here.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/claims-add-core.test.ts tests/unit/core-import-graph.test.ts tests/unit/annotations-core.test.ts tests/unit/project-json-lock-scan.test.ts` (frontend) | run, 63 passed |
| `pnpm exec vitest run tests/unit/claim-types.test.ts` | run, 1 failed (expected, below) |
| `pnpm typecheck` (frontend) | run, errors only in `tests/unit/claims-route.test.ts` and `tests/unit/native-claims-backend.test.ts` (`ClaimListResult` vs `ClaimListOutcome`, the known issue); none in Task 11 files |
| `pnpm exec eslint` on the 2 touched files | run, no output |
| `pnpm --filter getwrite-electron typecheck` (both tsc passes) | run, no errors |
| `pnpm --filter getwrite-cli typecheck` | run, no errors |

Not run: full vitest suite, whole-project `pnpm lint`, `next build`, `build:native`, e2e.

## Known failing test caused by this task

`tests/unit/claim-types.test.ts` > "inert core stubs" > "each rejects with not implemented until its own task lands" now fails: `addClaimCore` rejects with "A resource id must be a valid id." instead of "not implemented". Not edited, per instruction; the lead removes the add and update assertions together after Task 12.

## Not verified

- Locking beyond what `mutateSidecar` provides; no concurrent-add test was written.
- The "encrypted project stores it encrypted" criterion is tested with the in-memory adapter and the real `workspaceEncryptionAdapter` (sealed bytes contain neither the statement nor "unverified"); not tested on desktop or a device.
- The native encrypted-marker refusal is Task 17's, not exercised here.
