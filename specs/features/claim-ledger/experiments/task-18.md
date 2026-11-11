# Task 18 results: claim flows

Environment: worktree `agent-affdc5106bcc13dba`, 2026-11-11, vitest 4.1.6.

## Order

Test `frontend/tests/unit/claim-flows.test.ts` written first. First run: the file failed at import (`claim-flows` module absent), 0 tests ran. After `frontend/src/lib/claim-flows.ts` was added: 12 of 12 pass.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/claim-flows.test.ts` (frontend) | run, 12 passed |
| `pnpm typecheck` (frontend) | run, no errors |
| `pnpm exec eslint src/lib/claim-flows.ts tests/unit/claim-flows.test.ts` | run, no findings |
| `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-cli typecheck` | not run (no file under `lib/models/`, `core.ts`, `cli/` or `electron/` touched) |

Not run: the full vitest suite, `next build`, `build:native`, e2e.

## What the tests show (with injected fakes, real TipTap editor in jsdom)

- Successful mark: the fake `add` runs, then one dispatch carrying `ANNOTATION_TRANSACTION_META`, and the marked text equals the quote under the stored id.
- Failed write: result `{ stage: "write", message }`, no mark in the document.
- Failed mark after a stored write (the document is replaced while the write is in flight): result `stage: "mark"` with the stored `annotation`, no mark in the document.
- Empty selection and blank statement are refused (`empty-selection`, `invalid`) with no call to `add`.
- Updates (status, link, unlink via `target: null`, statement): success returns the stored annotation; a failed write returns `{ ok: false, stage: "write", message }` with no `annotation` key, so a caller has nothing new to display; a status off the four or a blank statement is refused with no call to `update`.
- A source scan shows `claim-flows.ts` contains neither `config.statuses` nor `selectActiveProjectStatuses`. This is a text check, not proof of no other path.

## Decisions and notes

- Contract used: `ClaimFlowApi { add(projectId, resourceId, NewClaimInput), update(projectId, resourceId, annotationId, UpdateClaimInput) }`, both returning `Annotation`. Task 16's transport is not available here; the real functions must be adapted to this shape by the wiring task.
- `annotation-flows.ts` is read, not edited. `applyMark` and `quoteAt` are duplicated (about 20 lines) in `claim-flows.ts` because they are not exported there; `ANNOTATION_TRANSACTION_META` is imported from it.
- The client-side checks (blank statement, status list, selection) are early refusals only. The core remains the boundary; the client does not check the 500-character quote limit, so a longer selection surfaces as a `write` failure from the core.
- `OnMarkClaim` in `claim-types.ts` is `(statement) => Promise<void>`; Task 25 wires it to `addClaimFlow` and supplies the editor, range and ids.
