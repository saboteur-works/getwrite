# Task 10: field-write core (results only)

## Commands and observed results

Run from the worktree, 2026-11-11.

| Command | Result |
| --- | --- |
| `pnpm --filter getwrite-frontend exec vitest run tests/unit/organizer-field-write-core.test.ts` against the Task 2 stub (tests written first) | 43 failed, 1 passed (the import-graph test). |
| same command after the core | 44 passed (44). |
| `vitest run` of `organizer-field-write-core`, `organizer-grid-types`, `core-import-graph`, `project-json-lock-scan` | 4 files, 75 tests passed. |
| `pnpm typecheck` (frontend) | no errors. |
| `eslint` on the core, its test, `organizer-grid-types.test.ts` | no warnings or errors. |
| `pnpm --filter getwrite-electron typecheck` (`tsc --noEmit` and `tsc --noEmit --project tsconfig.worker.json`) | run, exit 0. |
| `pnpm --filter getwrite-cli typecheck` | run, exit 0. |

Not run: the full vitest suite, `next build`, `build:native`, any device or paired-client run.

## What the tests show (clause by clause)

- Two fields in one call are both in the stored sidecar after one write; unnamed `userMetadata` keys, `resourceSubtype`, `entityKind`, `aliases`, `wordCountGoal`, `orderIndex`, `folderId` are equal to their stored values (whole-sidecar `toEqual`).
- Two concurrent calls for one resource, one field each, both survive (observed in one run of one test; not a statement about other interleavings).
- Clear: status removes `userMetadata.status`; subtype removes `resourceSubtype`; a field clear removes only that key.
- A write whose result equals the stored sidecar leaves the file's mtime unchanged (no write, no `metadataRevision` bump through `SIDECAR_UNCHANGED`).
- Refusals, each with the sidecar equal to its prior value and a message containing neither the input nor the resource id: select value outside `options`; multiselect value outside `options`; status outside `config.statuses`; subtype outside `config.subtypes`; more references than `maxSelections`; locked field (set and clear); unknown key; deprecated field; field outside the subtype scope; wrong value type; reference with null id; `status` through the field target. Subtype is compared with `normalizeSubtypeLabel` and stored in the list's spelling. Scope is judged against the subtype the same write sets.
- 17 malformed payloads and an unknown field key return a refusal while the project's `withMetaLock` is held by the test; none blocked within 300 ms, so none waited for the meta lock. (This shows the refusal does not take that lock; it does not show the sidecar file lock is untouched, though the refusal returns before `mutateSidecar` is called.)
- Missing sidecar raises `ResourceGoneError` and creates none. A malformed project id raises `InvalidProjectIdCoreError`. A locked, encrypted project (locked keyring, memory adapter) raises a locked-access error.
- The core file imports no React, JSX, JSON or `node:*` (test reads its own source); `core-import-graph.test.ts` passes.

## Decisions to review

- `normalizeProjectConfig` omits `metadataSchema` (read in `project.ts`), so `loadProjectConfig` cannot supply the schema. The core reads raw `project.json` through `io.readFile` (path built as `${projectRoot}/project.json`, to keep `node:*` out of the file) and takes `statuses`, `subtypes` and `metadataSchema`. A project with no valid stored schema uses `DEFAULT_METADATA_SCHEMA`, as the sidebar does. The schema migrations in `metadata-schema.ts` (not exported) are not applied: a legacy `locked: true` on a built-in key is therefore not treated as a refusal (`BUILT_IN_KEYS`), and a legacy `resource-ref` with `multiple: true` is handled through `field.multiple`.
- "A locked field the sidebar does not edit": `locked` in the schema means not removable or renamable, and the sidebar renders a control for such a field. The core is fail-closed: a `locked` non-built-in field is refused with `field-locked`. This may refuse a field the sidebar lets a writer edit; no such field was found in the code read, none was run.
- Deprecated fields (hidden in the sidebar) are refused as `unknown-field`.
- Field-scope refusal is applied to `set` only; a `clear` of an out-of-scope field is allowed.
- A reference value must carry a non-null string id (spec: a reference with a null id is not a drop target). The existence of the referenced resource is not checked (the sidebar does not check it).
- Status writes require membership in `config.statuses` (exact match). The sidebar shows an off-list stored value but offers only listed ones.
- Limits chosen here: 1 to 10 changes per write; field key at most 200 characters; duplicate targets in one write are refused.

## Wiring outside the declared files

- `frontend/tests/unit/organizer-grid-types.test.ts`: its Task 2 case asserted that `setOrganizerFieldsCore` throws `not implemented`, which the real core no longer does. That one case now asserts only that the export is a function; behaviour is covered by the new test file. The arrangements stub assertions are unchanged.

## Not verified

- Route, transport, native backend (Tasks 12 to 14), device behaviour, a paired client, and the sidebar-versus-core refusal parity beyond the rules read above.
