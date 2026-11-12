# Task 12 results: field-write route

Date: 2026-11-11. Results only; nothing here is device or running-app evidence.

## Files

- `frontend/app/api/project/organizer-field/route.ts` (new): `PUT` only, wrapped in `withStorageContext`, `dynamic = "force-dynamic"`.
- `frontend/tests/unit/organizer-field-write-route.test.ts` (new): written first.

## Contract implemented

- `PUT /api/project/organizer-field`, body `{ projectId, input }`.
- 200 with the core's result unchanged (`{ ok: true, resourceId }`); a refusal `{ ok: false, reason, message }` is also 200 (a refusal is a result).
- 400 `{ error: "Invalid projectId" }` for a missing or non-UUID `projectId` (`respondInvalidProjectId`); 400 with a constant text for bad JSON, a non-object body, or an `input` that is not an object with a string `resourceId` and an array `changes`. No 400 body echoes input.
- `ResourceGoneError` from the core: 404 `{ error: "Resource not found", code: "resource-gone" }` (same body as the sidecar route; no id in the text).
- `InvalidProjectIdCoreError` from the core: 400 `Invalid projectId`.
- Locked-access errors and any other error are rethrown; `withStorageContext` maps `ProjectLockedError` to 401 and `MissingProjectKeyError` to 409.
- The route does not validate individual changes; that is the core's job (Task 10), which returns the refusals.
- No limit check; a test reads the route source and asserts it contains no `checkLimit` and no sharing-limit reference.

## Observed

- Before the route existed, `vitest run tests/unit/organizer-field-write-route.test.ts` failed at import of the missing route (red for the right reason).
- After: 11 tests in the file. One run failed because the route's own doc comment contained the strings the source-scan test forbids; the comment was reworded (the test was kept). Final run, together with `resource-id-route-guard.test.ts` and `project-json-lock-scan.test.ts`: 3 files, 40 tests passed.
- `pnpm typecheck` (frontend): no errors printed.
- `eslint` on the two new files: no output.

## Not verified

- Real-core integration: the core module is mocked (Task 10 builds it concurrently; the Task 2 stub throws `not implemented`). Verify at wave integration that the real `setOrganizerFieldsCore` throws `ResourceGoneError` for a trashed resource and returns refusals as results, and that it throws `InvalidProjectIdCoreError` or the route's UUID check suffices.
- No route-inventory test needed an entry; `resource-id-route-guard.test.ts` walks only `[resource-id]` routes. No other route-listing test was found or edited.
- The route reads the body via `req.json()` with no size bound beyond the framework default.
