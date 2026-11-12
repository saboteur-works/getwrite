# Feature 109, Task 29: pure availability model for saved arrangements

Date: 2026-11-11. Results only.

Files: `frontend/components/WorkArea/Views/OrganizerView/organizerArrangementAvailability.ts`, `frontend/tests/organizerArrangementAvailability.test.ts`.

## Measured

- Tests first. Before the module existed, `pnpm exec vitest run tests/organizerArrangementAvailability.test.ts` (from `frontend/`) failed at import: 1 file failed, no tests ran (module not found).
- After implementing: the same command passed, 1 file, 12 tests.
- `pnpm typecheck` (tsc --noEmit): no errors. `pnpm exec eslint` on the two new files: no output (no findings).
- Imports of the module: only types from `src/lib/models/organizer-grid-types`. No React, Redux or `@dnd-kit` import (read from source).

## Behaviour as tested

- Function `getArrangementAvailability(arrangement, { folders, queries, schema })`. Each input is `{ state: "loading" }` or loaded with its ids or fields.
- Any of the three loading returns `pending`, including for an arrangement that would be unavailable when loaded (tested per input).
- Loaded: reasons `folder-missing`, `query-missing`, `field-missing`, `field-not-axis-type`, each with a distinct non-empty message; the message echoes no stored key (tested with a key value).
- Check order: source, then rows, then columns; first problem is returned.
- Axis types accepted for a field: select, multiselect, resource-ref, multi-resource-ref. A deprecated field returns `field-not-axis-type`. `none`, `order`, status and subtype axes are always available.
- Inputs are not mutated (JSON snapshot before and after equal); the function returns no arrangement.

## Decisions and limits (not verified beyond the unit tests)

- The caller decides `loaded`. Per `experiments/task-3.md`, for queries that means `queryState.projectId` equals the open project and `isLoadingQueries` is false; the selector alone cannot tell not-loaded from deleted. A failed load must not be passed as `loaded`; this module has no `failed` state, so how Task 32 shows a failed load is open.
- Not checked by this module: `order` used on Rows (Columns-only per the types comment), a folder field used with a `descendants` source (FR-4 offers folder fields in the children source only), a field that is out of the cards' subtype scope. Each would need a decision on which reason applies; none is in the `done_when`.
- A deprecated field mapped to `field-not-axis-type` is an assumption from FR-4 ("deprecated fields MUST NOT be offered").
- No wiring in unlisted files.
