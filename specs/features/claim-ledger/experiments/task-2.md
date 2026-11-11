# Task 2 results: claim contract

Environment: worktree `agent-a006f62c73dc83314`, 2026-11-11, vitest 4.1.6.

## Order

Test `frontend/tests/unit/claim-types.test.ts` written first. First run: failed at import (`claim-types` module absent), 0 tests ran. After the source was added: 11 of 11 pass.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/claim-types.test.ts` (frontend) | run, 11 passed |
| `pnpm exec vitest run tests/unit/annotations-core.test.ts annotation-validation.test.ts core-import-graph.test.ts annotation-target-survival.test.ts` | run, 65 passed (existing annotation tests unchanged) |
| `pnpm typecheck` (frontend) | run, no errors |
| `pnpm exec eslint` on the 8 touched source and test files | run, no output (no findings) |
| `pnpm --filter getwrite-electron typecheck` (both tsc passes) | run, no errors |
| `pnpm --filter getwrite-cli typecheck` | run, no errors |

Not run: the full vitest suite, `next build`, `build:native`, e2e.

## Observed value: named path differs from the code

The task names `frontend/src/lib/api/schemas.ts` for "optional `claim` on `AnnotationResponseSchema`". Observed: `AnnotationResponseSchema` is a non-exported local constant in `frontend/src/lib/api/annotations.ts` (line 58), and `lib/api/schemas.ts` had no annotation schema. `annotations.ts` is Task 14's file, not Task 2's. What was done: an exported `AnnotationResponseSchema` (with optional `claim`) was added to `lib/api/schemas.ts`, and the test parses that. `annotations.ts` still uses its own local copy, which strips `claim` (zod object, undeclared keys stripped; read from the code, not run here). Task 14 should switch `annotations.ts` to import the new schema or add `claim` to its local one.

## Decisions

- `claim.status` is typed `string` on `Annotation` and `z.string()` in the schemas, so a stored status off the list is kept as stored (FR-9); the four-status list is enforced at the write boundary by later tasks. `ClaimStatus` (the union) lives in `claim-types.ts`.
- `ClaimMarkerSchema` added to `models/schemas.ts` (exported). `ClaimMarker` interface added to `types.ts`.
- Stub contract shapes (for sibling tasks): `addClaimCore(projectId, resourceId, input: unknown): Promise<Annotation>`, `updateClaimCore(projectId, resourceId, annotationId, input: unknown): Promise<Annotation>`, `listClaimsCore(projectId): Promise<ClaimListResult>` with `{ claims: ClaimListEntry[], failures: ClaimReadFailure[] }`. The bodies reject with `not implemented`.
- The add input uses `statement` (stored as `body`); `OnMarkClaim = (statement: string) => Promise<void>`. These names are my choice; the task did not fix them.

## Not verified

No behaviour was added, so nothing about writes, locks, encryption, transports or runtimes is claimed.
