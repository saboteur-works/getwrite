# Task 13: Field-write client transport

Results for this task only.

## What was added

- `frontend/src/lib/api/organizer-field-write.ts`: `setOrganizerFields(projectId, input)` through `createTransport`, `ORGANIZER_FIELD_WRITE_ENDPOINT` (`/api/project/organizer-field`, the only path in the file), result type `OrganizerFieldWriteOutcome`.
- `frontend/tests/unit/organizer-field-write-transport.test.ts`: 18 tests (12 HTTP, 6 native).

## Result contract

- `done` / `refused` (reason and message from the core) / `gone` / `failed`. A locked project rejects with the locked-access error instead (401 -> `ProjectLockedError`, 409 -> `MissingProjectKeyError` via `lockedAccessErrorFromResponse`; a not-paired 401 is left as `failed`).
- HTTP 404 with body `code: "resource-gone"` -> `gone`. A 404 without that code -> `failed` (assumption: Task 12's route sends the sidecar route's code; the route does not exist yet, unverified).
- Native: `ResourceGoneError` -> `gone` (same result as the 404); locked errors rethrown; any other error -> `failed`.
- Network failure, other non-2xx, non-JSON error body, malformed 200 body, unknown refusal reason -> `failed`. A malformed body is reported through `reportTransportValidationFailure` (the test checks the body is not passed).
- A refusal is accepted from a 200 or a 4xx body (assumption: the route's status for a refusal is not fixed yet).

## Assumptions

- Native backend (Task 14, not in this worktree): `createNativeOrganizerFieldWriteTransport()` returning `{ setOrganizerFields(projectId, input) }` resolving to the core's `OrganizerFieldWriteResult` and throwing `ResourceGoneError` for a gone resource.
- Request body: `PUT` with `{ projectId, input }`. Task 12 must match.

## Observed

- Tests first: before the module existed, 1 file failed with no tests collected.
- With a temporary shim of the Task 14 backend file in place (deleted afterwards; vitest cannot resolve a `vi.mock` of a missing file): 18 passed; `npx tsc --noEmit` no output; `npx eslint` on the two files no output.
- Shim removed (the worktree's final state): `npx tsc --noEmit` reports one error, `TS2307` at the dynamic import of `native-organizer-field-write-backend`; vitest 13 passed, 5 failed (the 5 native tests that resolve the backend, "Cannot find module"). These are expected to clear when Task 14's file is merged. Not re-run after the merge.
- Grep: no `/api/` literal outside the route constant; the runtime comparison is the raw `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` inside `createTransport`, which this file calls and does not reimplement.

## Not verified

- Behaviour against the real route (Task 12) and real native backend (Task 14).
- The `.web-stub.ts` alias and `next.config.mjs` entry (Task 14); the inlining check (Task 41).
