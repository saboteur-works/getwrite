# Fix: excerpt read failures reach the Organizer hook as failures

Results only. Date: 2026-11-11. Follows the "Limit found" section of `task-16.md`.

## Measurement being fixed
`fetchResourceExcerpts` returns `{}` on a non-ok response and on a schema failure (read from the source, recorded in task-16), so the Task 16 hook reported `ready` with an empty `byId`.

## What was changed
- `frontend/src/lib/api/resource-excerpts.ts`: `ResourceExcerptsTransport.fetchOrThrow` (HTTP: throws `Could not load card excerpts (<status>).` on non-ok, `Malformed card excerpts response.` on schema failure, reporting through `reportTransportValidationFailure("resource-excerpts.fetchOrThrow", ...)`; a network error rejects), and exported `fetchResourceExcerptsOrThrow`, following `listTagsOrThrow`. `fetch` and `fetchResourceExcerpts` are unedited.
- `frontend/src/store/transport/native-resource-excerpts-backend.ts`: `fetchOrThrow` without the catch (the interface requires both implementations; not named in the task, needed to compile).
- `useOrganizerShownCardData.ts`: calls `fetchResourceExcerptsOrThrow`.
- Test mock renames (no assertion changed): `tests/organizerView.test.tsx` and `tests/organizerFolderCards.test.tsx` now mock/import `fetchResourceExcerptsOrThrow` instead of `fetchResourceExcerpts` (the view uses the hook); prettier re-wrapped some lines in the first because of the longer name.

## Red run (tests first)
After editing the tests and before the source change, `npx vitest run tests/unit/resource-excerpts-transport.test.ts tests/useOrganizerShownCardData.test.tsx tests/organizerView.test.tsx tests/organizerFolderCards.test.tsx`: 3 files failed, 16 tests failed, 73 passed. The hook failures were `No "fetchResourceExcerpts" export is defined on the mock`, since the hook still called the old name.

## Green run
- Same files plus `tests/unit/native-resource-excerpts-backend.test.ts`: 5 files, 93 tests passed.
- New cases: non-ok -> rejects, message does not contain a body string; schema failure -> rejects, message does not contain the body string, reporter called with the new label; network failure rejects; `fetch`/`fetchResourceExcerpts` still resolve `{}` on non-ok and on schema failure; success unchanged; `fetchResourceExcerptsOrThrow` rejects via the resolved transport; native `fetchOrThrow` rejects on an invalid project id where `fetch` resolves `{}`.
- Hook-level: the existing rejection tests (message echoed, no `byId`) pass against the renamed mock; the hook maps any rejection to `failed { message }`. The end-to-end HTTP-failure-to-`failed` path is covered by the transport tests plus the hook tests together, not by a single test.
- `pnpm typecheck` (frontend): exit 0. `eslint` on touched files: 0 errors (63 warnings, `no-explicit-any` in existing view tests).

## Not verified
- Electron and CLI typecheck (no `src/lib/models` file touched; not run).
- Full-suite vitest; native on-device.
- The message from `failureMessage` is shown by the view as before; wording of the new messages was not reviewed by a writer.
