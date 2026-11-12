# Task 2 results: contract (types, constants, inert stubs)

Date: 2026-11-11. Worktree `agent-a3be4ca998e6fdeb9`. No behaviour added; nothing here is device evidence.

## Files

- `frontend/src/lib/models/organizer-grid-types.ts` (new): types and three constants, no imports except `import type { MetadataValue } from "./types"`.
- `frontend/src/lib/models/organizer-field-write-core.ts` (new): `setOrganizerFieldsCore`, body throws `not implemented`.
- `frontend/src/lib/models/organizer-arrangements-core.ts` (new): `validateOrganizerArrangementDraft`, `addOrganizerArrangementCore`, `renameOrganizerArrangementCore`, `deleteOrganizerArrangementCore`, bodies throw `not implemented`.
- `frontend/tests/unit/organizer-grid-types.test.ts` (new): written first.

## Observed

- Test written before the modules existed; the import of the missing modules would fail resolution (not run in that state; the file was created in the same step as the modules, so "fails first" was not separately observed).
- `pnpm exec vitest run tests/unit/organizer-grid-types.test.ts` (in `frontend/`): 1 file, 8 tests passed.
- Constants: `ORGANIZER_ARRANGEMENT_LIMIT` 50, `ORGANIZER_ARRANGEMENT_NAME_MIN_LENGTH` 1, `ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH` 100.
- Import-graph test (regex over import specifiers of the three files): no react, react-dom, `node:*`, `fs`, `.tsx`, `.jsx` or `.json` specifier.
- `pnpm typecheck` (frontend): no errors printed.
- `pnpm --filter getwrite-electron typecheck` (both passes: `tsc --noEmit && tsc --noEmit --project tsconfig.worker.json`): run, no errors printed.
- `pnpm --filter getwrite-cli typecheck`: run, no errors printed.
- Caveat: the three new files are not imported from `core.ts`, so the worker and CLI passes did not necessarily include them. Whether they are in those graphs was not checked; `core-import-graph.test.ts` was not run. Later tasks that import them from `core.ts`-reachable code should re-run both.
- `eslint` on the four touched files: 0 errors, 9 warnings (`@typescript-eslint/no-unused-vars` on underscore-prefixed stub parameters). These disappear when Tasks 10 and 25 replace the bodies. `prettier --write` applied.
- Not run: `pnpm knip` (new exports are unused until later tasks), full `test:ci`.

## Contract notes for later tasks

- Axis stored as `"none" | "order" | {kind:"status"} | {kind:"subtype"} | {kind:"field", key}` (OQ-2). `OrganizerAxisKind` names the five kinds.
- Field write: one `OrganizerFieldWriteInput { resourceId, changes[] }`, each change `set` with a `MetadataValue` or `clear`, target status, subtype or field key. Result is a discriminated union with a text-only refusal reason.
- Arrangement results use `OrganizerArrangementResult<T>`; the add result carries the new `id`.
- `validateOrganizerArrangementDraft` is an addition beyond the task's stated names, for Task 35's seeding ("uses the validation exported by Task 25").
