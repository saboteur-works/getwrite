# Task 14: field-write native backend with web stub (results only)

## Measurements (commands run in the worktree)

- `pnpm exec vitest run tests/unit/native-organizer-field-write-backend.test.ts`: written first; failed before implementation (module not found, no tests collected). After implementation, with the neighbouring `native-encrypted-project-guard`, `native-claims-backend` and `native-folder-metadata-backend-web-exclusion` tests: 4 files, 43 tests passed.
- `pnpm typecheck` (frontend): no errors.
- `pnpm exec eslint` on the touched src, test and `next.config.mjs`: no output (clean). `prettier --check` on touched files: clean.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `tsconfig.worker.json`): run, exit clean.
- `pnpm --filter getwrite-cli typecheck`: run, exit clean.
- Electron worker constraint: this task's files are under `frontend/src/store/transport/` and `frontend/next.config.mjs`, plus one minimal edit in `frontend/src/lib/api/encrypted-project-refusal.ts` (not under `lib/models/`); the Electron and CLI typechecks were run anyway.

## What the tests show

- Set, clear, a core refusal result (`ok: false`) and a thrown `ResourceGoneError` each come back from the native transport as the core returned or threw them (core spied).
- Encrypted-marked project: typed `EncryptedProjectCaptureRefusedError` with a "Fields can't be changed in an encrypted project..." message, no filesystem write, core not called.
- Web stub: same export names as the backend, throws a message naming web-stub and native, has no `node:` text and only type imports; `next.config.mjs` carries the alias, in the web branch of `resolveAlias`.

## Deviations and notes

- Route and client (Tasks 12, 13) do not exist in this worktree, so parity with the route was tested as "native passes the core's result and errors through unchanged" over a spied core. Parity with the real core (Task 10, another lane) is NOT checked here; it is left to integration. The route's 404 for a gone resource is Task 12's mapping; whether Task 13's client maps a native `ResourceGoneError` as it maps a 404 is for that task's test.
- The transport interface (`NativeOrganizerFieldWriteTransport`, one method `setOrganizerFields(projectId, input)`) is declared in the backend because the client module does not exist yet. Task 13 may need to align its native-loader type with it.
- Unlisted file edited: `frontend/src/lib/api/encrypted-project-refusal.ts` gained a `"fields"` subject (two message strings) so the refusal does not say "captured" or "claims". Existing subjects are unchanged.
- No device run; nothing here is evidence about device behaviour. `next build` and `build:native` not run (worktree).
