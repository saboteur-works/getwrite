# Task 15 results: route /api/claims

Environment: worktree `agent-ac5bb544e6bcf1b55`, 2026-11-11, vitest 4.1.6, base `feat/claim-ledger` at 6940b32d (Tasks 1 and 2).

## Order

Test `frontend/tests/unit/claims-route.test.ts` written first. First run: failed at import (`app/api/claims/route` absent), 0 tests ran. After `frontend/app/api/claims/route.ts` was added: 28 of 28 pass.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/claims-route.test.ts` (frontend) | run, 28 passed |
| `pnpm exec vitest run tests/unit/sharing-gate-enumeration.test.ts sharing-limits-routes.test.ts sharing-gate-proxy.test.ts resource-id-route-guard.test.ts` | run, 228 passed, 1 skipped (these walk the route tree; the new route is picked up and breaks none) |
| `pnpm typecheck` (frontend) | run, no errors (after fixing two constructor-arity errors in the test) |
| `pnpm exec eslint` and `prettier --check` on the 2 touched files | run, no findings |
| `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-cli typecheck` | not run: no file under `frontend/src/lib/models/` was touched |

Not run: the full vitest suite, `next build`, `build:native`, e2e.

## Route contract as built

- `GET ?projectId=`: project-wide list `{ claims, failures }` from `listClaimsCore(projectId)`. A `resourceId` key is tolerated and ignored (the core takes only a project id); any other query key is 400.
- `POST { projectId, resourceId, claim }` to `addClaimCore`; `PUT { projectId, resourceId, annotationId, update }` to `updateClaimCore`. Both return `{ annotation }`. Top-level keys outside the listed ones are 400; `claim` and `update` must be objects; a `status` in `update` outside `CLAIM_STATUSES` is 400 at the route.
- No DELETE export (asserted). No `lib/sharing` import and no `checkLimit` (asserted by source text).
- Wrapped in `withStorageContext`: locked project 401, missing project key 409, hosted CSRF 403 (observed in tests with the core mocked to throw the locked errors).

## Observed values

- Paired-device gate: through `runGate` with a stored paired credential, GET, POST and PUT on `/api/claims` and on `/api/annotations` pass; the same requests with no credential are refused. Observed identical for both routes. The gate classifies by `/api` prefix and method-agnostically; read from `gate.ts` and the test, no claims-specific entry was needed.
- Tenancy: with `resolveTenant` mocked to two temp roots and `listClaimsCore` faked to read `resolveProjectsDir()`, tenant B's GET for tenant A's project id returned no A data (a rejection or status >= 400). This shows the route establishes the tenant's storage context; it is a fake core, not the real list scan.

## Decisions and assumptions (named, not tested against the real cores)

- Error mapping reuses the annotation core's error classes (`InvalidAnnotationError`, `InvalidAnnotationResourceIdError`, `AnnotationResourceTypeError` to 400; `AnnotationResourceNotFoundError`, `AnnotationNotFoundError` to 404; `InvalidProjectIdCoreError` to the uniform invalid-project-id 400). Tasks 10 to 13 have not landed, so which classes the claim cores throw is an assumption. If they define their own, the route needs the mapping extended, otherwise such an error propagates as a 500.
- "Message that does not echo input": route-originated 400 messages are fixed sentences (tested with markers in the input that do not appear in the response). A 400 from a core passes the core's message through, as `/api/annotations` does; whether those messages echo input depends on Tasks 10 to 12 and is not verified here.
- The body shapes `claim` (POST) and `update` (PUT) are this task's choice. The Task 16 client and Task 17 native backend must send the same shapes: POST `{ projectId, resourceId, claim }`, PUT `{ projectId, resourceId, annotationId, update }`.
- Task 1 (c) was not needed here: this route stores nothing itself; the core's stored-record spread carries `claim`.

## Not verified

- Behaviour with the real cores (Tasks 11 to 13), exercised end to end in Task 26.
- A real paired client, a real hosted tenant, locked project behaviour against a real encrypted project: all by fakes or mocks only.
