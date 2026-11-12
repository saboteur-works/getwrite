# Task 27: Arrangements client transport

Results only. Feature 109, FR-14, FR-1(f).

## Wire contract chosen (compare with Task 26)

- Route: `/api/project/organizer-arrangements` (one constant, `ENDPOINT`, in `frontend/src/lib/api/organizer-arrangements.ts`).
- Method: `POST`, header `Content-Type: application/json`.
- Body: flat `{ projectId, ...OrganizerArrangementOperation }`:
  - add: `{ projectId, op: "add", name, source, rows, columns }`
  - rename: `{ projectId, op: "rename", id, name }`
  - delete: `{ projectId, op: "delete", id }`
- Response body, parsed at any status: `OrganizerArrangementResult` JSON, `{ ok: true, id }` or `{ ok: false, reason, message }`. `reason` must be one of the nine `OrganizerArrangementRefusalReason` values; any other value is treated as malformed.
- Status handling by the client:
  - A parseable result body is returned as is, whatever the status (200, 400, 422 are tested). A refusal route may therefore use a 4xx status with the result body, or 200.
  - 401 (without `x-getwrite-gate: not-paired`) and 409 are read as locked project and REJECT with the locked-access error (`lockedAccessErrorFromResponse`). A refusal must not use 409 or 401.
  - Any other non-2xx without a result body, for example `{ error: "..." }` from a 400 malformed-body response, becomes a failed result with the `error` text, or `Could not <verb> the arrangement (HTTP <status>).`.
  - A 2xx with a malformed body is reported through `reportTransportValidationFailure` (issues only, never the body) and becomes a failed result.
  - A fetch rejection becomes a failed result.
- Client failed result: `{ ok: false, reason: "request-failed", message }`. `"request-failed"` is not in the contract's `OrganizerArrangementRefusalReason`, so the transport exports its own wider type `OrganizerArrangementTransportResult<R> = R | OrganizerArrangementRequestFailure`. The contract types are unchanged.
- Client does not generate ids (no `crypto.randomUUID`); the core makes the id.

## Native loader assumption (Task 28, not present in this tree)

`import("../../store/transport/native-organizer-arrangements-backend")` then `createNativeOrganizerArrangementsTransport()`, returning an object with `add(projectId, input)`, `rename(projectId, input)`, `delete(projectId, input)` that resolve to the contract result types (`OrganizerArrangementAddResult` and so on). Task 13's `organizer-field-write.ts` is not in the tree, so the shape follows `folder-metadata.ts`. The literal specifier is in the file for the `next.config.mjs` alias (Task 28's edit).

## Measurements

Commands run from `frontend/`.

- Test first: `npx vitest run tests/unit/organizer-arrangements-transport.test.ts` before the module existed: file failed to load (module not found), no tests ran.
- After implementation: first run 12 passed, 1 failed. The failure was my own test case, a refusal sent with status 409, which the client reads as `MissingProjectKeyError` (409 is the locked status). Changed that case to 422. Not a code defect.
- `npx vitest run tests/unit/organizer-arrangements-transport.test.ts`: 1 file, 13 tests passed.
- `npx eslint` on the two new files: no output (clean).
- `npx prettier --check` on the two new files: clean.
- `npx tsc --noEmit`: one error, `src/lib/api/organizer-arrangements.ts(171,12): TS2307 Cannot find module '../../store/transport/native-organizer-arrangements-backend'`. This was the only error. It is the Task 28 module not being in this tree. The check was run before the 409-to-422 test edit, which does not affect types; typecheck was not re-run after.

## Done-when clauses

- Each operation sends its payload: tested (add; rename and delete).
- Parses its result with a schema: `ResultSchema` (zod); tested for a malformed 2xx and an unknown reason.
- A refusal returns its message text: tested at 200, 400 and 422.
- A failed request returns a failed result, never an empty or successful one: tested for a fetch rejection, an `{ error }` body, an unreadable body, a malformed body and a not-paired 401.
- Runtime comparison is the raw one: the file uses `createTransport` (whose comparison is the raw `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`) and does not mention `resolveRuntime`; asserted by a source-text test.
- Typecheck: red only for the missing Task 28 module (above). Lint: green.

## Not verified

- The native path (no backend in this tree), the alias in `next.config.mjs`, and the real route (Task 26) were not exercised; the wire contract above is untested against them.
- A locked project rejecting rather than returning a failed result is my reading; Task 27's text does not mention locked projects.
