# Task 12 results: updateClaimCore

Environment: worktree `agent-a7fd0885316cbd712`, 2026-11-11, vitest 4.1.6.

## Order

Tests written first in new `frontend/tests/unit/claims-update-core.test.ts` (21 tests). First run against the Task 2 stub: 18 failed, 3 passed (the three passing ones do not call the stub successfully: the "refuses" cases that expect any rejection, and the node:fs source check). After implementation: 21 of 21 pass.

## Implemented (`frontend/src/lib/models/claims-update-core.ts`)

- `validateUpdateClaim` runs before any lock; resource and annotation ids are checked as UUIDs first.
- One `mutateSidecar` call reads the stored array, finds the annotation, refuses one with no `claim`, and replaces it. A test counts renames onto the sidecar path through a wrapping in-memory adapter: exactly one for a call that changes status, statement and link together.
- `statusChangedAt` is set to the core's clock only when the requested status differs from the stored one. Statement edit, link change, link removal and same-status re-selection leave it as stored; a stored off-list status is spread back unchanged.
- Link: the Source's sidecar is read before the claim's lock is taken (so no lock is taken inside the claim's file lock). A missing id, a trashed Source (its sidecar is no longer live) or a non-`source` type is refused with the fixed message "A claim can only be linked to a Source."; the id is not echoed (tested). `sourceName` is taken from the Source's stored name at link time (cut to 500) and overrides any client-supplied `sourceName`; a later rename does not change it (tested). `target: null` removes the `target` key.
- `updatedAt` is set on every successful update.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/claims-update-core.test.ts` (frontend) | run, 21 passed |
| same plus `annotations-core.test.ts`, `core-import-graph.test.ts`, `claim-types.test.ts` | run, 70 passed, 1 failed (see below) |
| `pnpm typecheck` (frontend) | run; 5 errors, all the known `ClaimListResult` vs `ClaimListOutcome` ones in `tests/unit/claims-route.test.ts` and `tests/unit/native-claims-backend.test.ts`; none in Task 12 files |
| `pnpm exec eslint` on `claims-update-core.ts` and `claims-update-core.test.ts` | run, no output |
| `pnpm --filter getwrite-electron typecheck` (both tsc passes) | run, no errors |
| `pnpm --filter getwrite-cli typecheck` | run, no errors |

Not run: full vitest suite, whole-project `pnpm lint`, `next build`, `build:native`, e2e.

## Expected failure left for the lead

`tests/unit/claim-types.test.ts` "inert core stubs > each rejects with not implemented until its own task lands" now fails on its `updateClaimCore` line (it receives "A resource id must be a valid id." because the test passes `"r"` as resource id). That file was not edited, as instructed. The assertion for `updateClaimCore` is to be removed together with the `addClaimCore` one after Task 11.

## Decisions and notes

- `sourceName` is core-derived rather than client-supplied, so the saved name always matches the Source that was verified at link time. The Citation path takes it from the client; this differs deliberately for claims. If the owner wants client-supplied names, this is one line in `resolveLink`.
- The Source check and the claim write are two steps, not atomic: a Source trashed between them leaves a link to a now-removed Source, which is the state FR-13 already shows as "removed". Not measured under concurrency.
- No explicit `enqueueAnnotationIndex` call (the private helper in `annotations-core.ts`, which is not edited). `mutateSidecar`'s own post-write enqueue runs; whether it alone re-indexes a changed statement was not tested here.
- Errors reuse the classes exported by `annotations-core.ts` (`InvalidAnnotationError` -> 400, `AnnotationNotFoundError` -> 404, etc.), so Task 15's route mapping can treat them as it does the annotations route.
- Spec `tasks.md` `Done` checkbox for Task 12 not ticked (orchestrator's call).

## Not verified

Route, transports, paired-device classification, a device, and trash-to-restore of a linked Source are outside this task. A test for a link to a Source already in Trash was not written; the missing-id test covers the same `null` sidecar branch only by inference.
