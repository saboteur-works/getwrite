# Task 17 results: native claims backend

Environment: worktree `agent-adbbc88de8b547daf`, 2026-11-11. Nothing here is a device run.

## Order

Test `frontend/tests/unit/native-claims-backend.test.ts` written first. First run: failed at import (backend module absent), 0 tests ran. After the backend, stub and alias: 8 of 8 pass.

## Commands (from `frontend/`)

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/native-claims-backend.test.ts` | run, 8 passed |
| `pnpm exec vitest run` on that file plus `native-source-attachments-backend-web-exclusion.test.ts` and `native-encrypted-project-guard.test.ts` | run, 32 passed |
| `pnpm typecheck` | run, no errors |
| `pnpm exec eslint` on the 3 new files and `next.config.mjs` | run, no findings |
| `pnpm exec prettier --check` on new files | run; test file reformatted with `--write`, then passes |
| `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-cli typecheck` | not run: nothing under `lib/models/` touched |

Not run: `next build`, `build:native`, e2e, full vitest suite.

## What was built (facts)

- `src/store/transport/native-claims-backend.ts`: `createNativeClaimsTransport(deps)` with `list`, `add`, `update` through `createNativeRunner`. `add` and `update` call `assertProjectNotEncrypted` (Feature 107's guard, unedited) before the core; `list` does not.
- `.web-stub.ts`: same export name, throws a message containing "native-only" and "web-stub"; imports only a type; no `node:` text.
- `next.config.mjs`: one alias, `"../../store/transport/native-claims-backend"` in the web (non-native) branch of `resolveAlias`. Key form follows the other `lib/api/` clients.
- No route added.

## Decisions and deviations

- `lib/api/claims.ts` (Task 16) does not exist in this worktree, so no `ClaimsTransport` type was available to import. The backend exports its own `NativeClaimsTransport` (methods `list(projectId)`, `add(projectId, resourceId, input)`, `update(projectId, resourceId, annotationId, input)`, inputs `unknown`, as the core stubs take them). Task 16's client should either import this type or declare a structurally compatible one; if its method names or arities differ, the factory needs a matching change at merge. Not checked against Task 16 code.
- The alias key assumes the Task 16 client's dynamic import specifier is `"../../store/transport/native-claims-backend"` (same as annotations/source-attachments clients). Unverified until Task 16 lands; the "client carries the literal specifier" test that sibling backends have was not written because the client file is absent.
- The refusal text of the reused typed error reads "Nothing was captured: ..." (Feature 107 wording); not edited, as the task says reuse. A claims UI may want to map it to its own sentence.
- The `NEXT_PUBLIC_GETWRITE_RUNTIME` raw comparison belongs at the decision point in Task 16's client (`createTransport`); this task has no such branch. Inlining check is Task 28.

## Not verified

Behaviour of the real claims cores (stubs throw "not implemented"; tests spy them). Native backend on a device. Web bundle exclusion in a real build (only the alias text and its branch position are tested). Lock parity with the server.
