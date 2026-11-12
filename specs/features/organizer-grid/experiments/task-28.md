# Task 28: Arrangements native backend with web stub (results only)

## Measurements
- Red first: `pnpm exec vitest run tests/unit/native-organizer-arrangements-backend.test.ts` before the module existed: 1 file failed, no tests (import of the backend could not resolve).
- After: same file plus `native-encrypted-project-guard.test.ts`: 2 files, 28 tests passed.
- `pnpm typecheck` (frontend): clean (was one error, src/lib/api/organizer-arrangements.ts(171,12), missing module).
- eslint on the 4 touched source/test files: no output (clean).
- `pnpm --filter getwrite-electron typecheck` (`tsc --noEmit && tsc --noEmit --project tsconfig.worker.json`, both passes): run, clean.
- `pnpm --filter getwrite-cli typecheck`: run, clean.
- Electron worker constraint: no file under `lib/models/`, `core.ts`, `cli/` or `electron/` was edited; the commands were run anyway and recorded above.

## Unlisted wiring
- `frontend/src/lib/api/encrypted-project-refusal.ts`: added subject `"arrangements"` with its two messages, because the existing "fields" wording ("Fields can't be changed...") would be wrong for arrangement writes.

## Tests cover
Add, rename, delete pass through to the cores and return results unchanged; refusal results returned as values; core errors propagate unchanged; encrypted-marked project refused for all three operations (typed error, no write, no core call, arrangements wording); web stub export names, native-only throw, no `node:*`, type-only imports; alias present and in the web branch of `resolveAlias`.

## Not verified
- Parity with the real route/core: `organizer-arrangements-core.ts` is Task 25's (stub at this commit); the cores are spied. The backend passes core results through unchanged, so parity rests on the core; real-core parity is to be verified at integration.
- No device run, no `next build` / `build:native` (not run in a worktree); alias effect on a real web build is checked only by config-text tests.
