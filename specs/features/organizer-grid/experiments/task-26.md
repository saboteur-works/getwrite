# Task 26: Arrangements dispatch route

Results of this task only (FR-14, OQ-3).

## Built

- `frontend/app/api/project/organizer-arrangements/route.ts`: `POST` wrapped in `withStorageContext`. Flat body `{ projectId, op, ...fields }`; `op` is `add`, `rename` or `delete`. The route checks only the envelope (object, string `projectId` that is a UUID, known `op`) and passes every other field to the core, so the core refuses unknown keys.
- `frontend/tests/unit/organizer-arrangements-route.test.ts`: 10 cases, with the core module mocked wholesale (Task 25 builds the real core; the stub throws `not implemented`).

## Wire behaviour (as implemented and tested)

- Success: 200 `{ ok: true, id }`.
- Core refusal: 200 `{ ok: false, reason, message }` (never 401 or 409).
- Malformed JSON, non-object body, array, null, missing or unknown `op`, non-string `projectId`: 400 `{ error: "Invalid request body." }`, one constant message; a test checks a marker string in the input is not in the response.
- Non-UUID `projectId`: 400 `{ error: "Invalid projectId" }` (the repository's uniform message).
- `ProjectLockedError` 401 and `MissingProjectKeyError` 409, from `withStorageContext`.
- An unexpected core error is rethrown by `withStorageContext` (the test observes a rejection); it is not turned into a refusal or an ok body.
- Source assertion: the route source does not match `checkLimit|limits-check|refusalFor`.

## Measurements

- Before the route file existed, the test file failed to load (no tests run): the expected red.
- First run with the route: 9 passed, 1 failed. The failure was my test expecting a 5xx `Response`; `withStorageContext` rethrows instead. I changed the test to expect the rejection.
- `npx vitest run` on the route test, `sharing-gate-enumeration.test.ts` and `project-json-lock-scan.test.ts`: 3 files passed (58 passed, 1 skipped) before the prettier reformat of the test; the route test was re-run after it (see the report).
- `pnpm typecheck`: no errors. `npx eslint` on the two new files: no output. `prettier --check` on the route: clean; on the test it flagged formatting, fixed with `--write`.
- No route-listing or guard test needed the new route registered.

## Not verified

- Integration with the real Task 25 core: not run here, since the core is a stub. To be verified at wave integration.
- The full `pnpm test:ci` and `pnpm lint` over the whole tree: not run.
- Client transport (Task 27) against this route: not run; the wire shape follows the contract given in the task brief.
