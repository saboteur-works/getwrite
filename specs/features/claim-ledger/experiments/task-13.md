# Task 13 results: project-wide claim list core

Environment: worktree `agent-a79dc3f0c318714f7`, 2026-11-11, vitest 4.1.6.

## Order

`frontend/tests/unit/claims-list-core.test.ts` written first. First run against the Task 2 stub: 13 of 14 failed (the stub throws `not implemented`; the one pass is the source-text `node:fs` check, which a stub also satisfies). After `claims-list-core.ts` was implemented: 14 of 14 pass.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/claims-list-core.test.ts` (frontend) | run, 14 passed |
| `pnpm exec vitest run tests/unit/claim-types.test.ts tests/unit/core-import-graph.test.ts` | run, 21 passed, 1 failed (see below) |
| `pnpm typecheck` (frontend) | run, no errors |
| `pnpm exec eslint` on `claims-list-core.ts` and `claims-list-core.test.ts` | run, no output |
| `pnpm --filter getwrite-electron typecheck` (both tsc passes) | run, no errors |
| `pnpm --filter getwrite-cli typecheck` | run, no errors |

Not run: the full vitest suite, `next build`, `build:native`, e2e, any device or paired-device run.

## Failing existing test (observed, outside this task's Files)

`tests/unit/claim-types.test.ts` "inert core stubs > each rejects with not implemented until its own task lands" asserts `listClaimsCore("p")` rejects with `not implemented`. It now rejects with `Invalid projectId`, because the stub is replaced. Observed, not hypothesised: the assertion pins Task 2's stub. That file is Task 2's, not in Task 13's Files, so it was not edited. The `listClaimsCore` line of that test needs removing (the orchestrator or the lead decides who).

## Behaviour implemented (what the tests show)

- Claims of every text resource with resource id and name; the annotation is returned whole (statement as `body`, `quote`, `claim.status`, `claim.statusChangedAt`, `target` with `sourceId` and `sourceName`).
- A non-claim annotation (no `claim` object) is not listed.
- A sidecar that fails to parse is named in `failures` (resource id, fixed message), and the other resources' claims are still returned. The message carries no stored content and no path (tested).
- An `annotations` value that is not an array is named in `failures`.
- A resource moved to Trash by `softDeleteResource` is not listed (its directory and sidecar leave the live tree).
- Locked workspace: the listing raises the locked-access error (tested with the real encrypting adapter and `keyring.lock()`). The code also rethrows a locked error from any single sidecar read; that branch is not separately exercised.
- Unknown project in the caller's scope raises `ClaimProjectNotFoundError` (an addition, so a missing or other-tenant project is not read as "no claims"); an invalid id raises `InvalidProjectIdCoreError`.
- Storage adapter: the source imports nothing from `node:fs` (a source-text test), and two in-memory tenants with the same project id each see only their own claim.
- `sidecarsRead` is returned for Task 1's measurement. It is the number of sidecars read successfully (including ones skipped as non-text); a failed read is not counted. It is on `ClaimListOutcome extends ClaimListResult`, declared in `claims-list-core.ts`, because `claim-types.ts` is not in this task's Files.

## Decisions and assumptions

- A resource of type `source` is scanned as well as `text`, matching `annotations-core.ts` (`isAnnotatableType`); the task text says "text resource". Whether Sources should hold claims is for the owner; scanning them cannot lose a claim that exists.
- A failure for an unreadable sidecar has `resourceName: ""`: the name lives in the sidecar that could not be read.
- A resource directory with no sidecar (ENOENT) is skipped silently, as `readSidecar` treats it as an ordinary absence.
- The named path `frontend/src/lib/models/claims-list-core.ts` was correct.

## Not verified

The Claims tab, route, transport and native backend do not exist yet, so nothing is claimed about them. No timing was measured (FR-1(e) belongs to Task 1's record). Behaviour on a device or a paired client is not covered.
