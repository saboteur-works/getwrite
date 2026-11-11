# Task 16 results: client transport `lib/api/claims.ts`

Environment: worktree `agent-acb775759cad0b6a8`, 2026-11-11, vitest 4.1.6.

## Order

Test `frontend/tests/unit/claims-transport.test.ts` written first. First run: failed at import (`lib/api/claims` absent), no tests ran. After `claims.ts` was added: 12 of 12 pass.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/claims-transport.test.ts` (frontend) | run, 12 passed |
| `pnpm typecheck` (frontend), with a throwaway stub of `native-claims-backend.ts` present | run, no errors |
| `pnpm typecheck` (frontend), stub removed (the state left in the worktree) | run, 1 error: `src/lib/api/claims.ts(173,12): TS2307 Cannot find module '../../store/transport/native-claims-backend'` |
| `pnpm exec eslint src/lib/api/claims.ts tests/unit/claims-transport.test.ts` | run, no findings |
| `pnpm exec prettier --check` on both files | run; the test file was reformatted with `--write`, then clean |
| `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-cli typecheck` | not run: no file under `frontend/src/lib/models/` was touched |

Not run: the full vitest suite, `next build`, `build:native`, e2e, anything against the real route or a device.

## Observed: typecheck depends on Task 17

`claims.ts` dynamically imports `store/transport/native-claims-backend` (a Task 17 file, as `annotations.ts` does for its backend). That file does not exist in this worktree. Observed: with a throwaway stub the typecheck is clean; without it, exactly the one TS2307 above. The stub was deleted (it is Task 17's file, not declared here). Expected, not run: the error clears when Task 17 lands with the export below.

## Contract assumed (not stated in Task 2, so recorded here for Tasks 15 and 17)

- Native backend export: `createNativeClaimsTransport(): ClaimsTransport`, where `ClaimsTransport` is exported from `lib/api/claims.ts` with `list(projectId)`, `add(projectId, resourceId, claim)` and `update(projectId, resourceId, annotationId, update)`.
- HTTP, `/api/claims`:
  - `GET ?projectId=` returns `{ claims: [{ resourceId, resourceName, annotation }], failures: [{ resourceId, resourceName, message }] }`. The list is project-wide, so it sends no `resourceId`.
  - `POST` body `{ projectId, resourceId, claim: NewClaimInput }` returns `{ annotation }`.
  - `PUT` body `{ projectId, resourceId, annotationId, update: UpdateClaimInput }` returns `{ annotation }`.
- Task 15's route must match these shapes; the test fakes `fetch`, so a mismatch would not show here.

## Behaviour pinned by the test (with fakes)

- Web: URL, method, body (no path key), response parsed with `AnnotationResponseSchema` (keeps `claim`).
- Failures: server `error` text surfaced; non-JSON error body falls back to an HTTP-status message; 401 and 409 become `ProjectLockedError` and `MissingProjectKeyError`; a 401 with `x-getwrite-gate: not-paired` is not treated as locked; malformed bodies are reported via `reportTransportValidationFailure` and rejected. A failed list never resolves empty. `failures` entries are returned, not dropped.
- Native (`NEXT_PUBLIC_GETWRITE_RUNTIME` stubbed to `native`): the faked backend is called with the same arguments, `fetch` is not called, and a native rejection is rethrown untouched.

## Not verified

The real route, the real native backend, locked-project behaviour against a real server, and any device. A mocked backend is not evidence about a device.
