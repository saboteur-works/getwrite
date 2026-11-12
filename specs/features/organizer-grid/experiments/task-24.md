# Task 24: `config.organizerArrangements` plumbing (FR-14, FR-1 (g) after)

Results only. Comparison point: `experiments/task-1.md` section (g), where a new config key was present in no in-process copy and only in the server read of `project.json`.

## Change

- `frontend/src/lib/models/types.ts`: `ProjectConfig.organizerArrangements?: OrganizerArrangement[]` (type import from `organizer-grid-types.ts`).
- `frontend/src/lib/models/schemas.ts`: `OrganizerArrangementSchema` (strict objects, UUID `id`, `folderId`, `queryId`, name 1 to 100, source union, axis union) and `OrganizerArrangementListSchema` (max 50); `ProjectConfigSchema.organizerArrangements` optional.
- `frontend/src/lib/models/project.ts`: `normalizeProjectConfig` copies the key only when present.
- `frontend/src/store/projectsSlice.ts`: `StoredProject.organizerArrangements`, `buildStoredProject` copies it only when present, new selector `selectActiveProjectOrganizerArrangements` (list, or one shared empty array).
- `frontend/src/lib/api/schemas.ts`: `ApiProjectConfigSchema.organizerArrangements` (shape only, no bounds).

## Observed (test: `tests/unit/organizer-arrangements-config.test.ts`, 20 tests)

Command: `pnpm exec vitest run tests/unit/organizer-arrangements-config.test.ts` printed `Tests 20 passed (20)`. The tests were first run before the change: 15 failed, 5 passed (the no-key assertions and the schema-bound refusals that pass whether or not the key is declared are not evidence of the change; the with-key assertions are).

With a two-arrangement list the key is present and equal in the output of each of: `ProjectConfigSchema.parse`; persisted `ProjectSchema.parse`; `normalizeProjectConfig`; `buildStoredProject`; Redux `setProject`; Redux `setProjects`; API `ProjectSchema.parse`; a reopen chain (a `project.json` on disk, `loadProjectConfig`, JSON round trip, API parse, `buildStoredProject`, `setProject`).

With no key the key is absent after each of: `ProjectConfigSchema.parse`, `normalizeProjectConfig`, `buildStoredProject`, Redux `setProject`, API parse, `loadProjectConfig` of a file with no key.

Selector: returns the list for the active project, `[]` for no project and for a project with none, and the same array instance for repeated empty reads.

Schema bounds: an unknown key on an arrangement, a non-UUID id, an empty name, a 101-character name and a bare-string `status` axis are refused; 51 arrangements refused, 50 accepted.

## Other commands

- `pnpm typecheck` (frontend): no `error TS` lines.
- `pnpm exec eslint` on the six touched files: 0 errors, 26 warnings (the `no-explicit-any` warnings in `projectsSlice.ts` selectors, present before).
- `pnpm exec vitest run projectsSlice project schemas config slice`: 109 files, 1593 tests passed, no existing test edited.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): RUN, exit 0.
- `pnpm --filter getwrite-cli typecheck`: RUN, exit 0.

## Deviations and notes

- The Zod arrangement schema accepts `"order"` on Rows because the contract's `OrganizerAxis` type is shared by rows and columns; a stricter Rows schema made `ProjectConfig` unassignable to the inferred schema type at `project-config.ts` (typecheck error, seen then removed). Refusing `order` on Rows is left to the arrangements core (Task 25). This is a reading, not a tested refusal.
- The persisted schema is strict, so a hand-edited `project.json` with a malformed arrangement fails the `ProjectSchema` parse. Not measured what the project open flow shows in that case.
- Not run: the HTTP route `POST /api/project`, the native backend, a running app; the test chain stands in for the page's open flow with the same functions.
