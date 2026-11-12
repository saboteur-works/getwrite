# Feature 109, Task 15: smart-folder source hook, results

Date: 2026-11-11. Branch `feat/organizer-grid` (worktree). Results only.

## Files

- `frontend/components/WorkArea/Views/OrganizerView/useOrganizerSmartFolderCards.ts` (new): `useOrganizerSmartFolderCards(queryId)` returns `{ state, refresh }`. State is `idle | loading | failed { message, retry } | deleted | ready { ids }`.
- `frontend/tests/useOrganizerSmartFolderCards.test.tsx` (new): 13 tests.

## Calls and reads (from source, per experiments/task-3.md FR-1 (c))

- Evaluates with the transport function `evaluateQueryAst({ projectId: <directory id> }, { op: "ref", id })`, not the `evaluateQuery` thunk. The directory id comes from `selectActiveProjectDirectoryId`.
- "Loaded" = `queryState.projectId === selectedProjectId` and `isLoadingQueries === false` (from `selectQueryState`). Deleted = loaded and id absent from `savedQueries`; the transport is not called for it. Not loaded = loading. A list that is not loaded, not loading and has a non-empty `errorMessage` = failed with that message. Caveat: `errorMessage` is shared with save and delete failures, so such a failure while the list is also unloaded would read as failed; not separated.
- The hook does not load the saved-query list; AppShell does (`loadSavedQueries`, AppShell.tsx line 836). With no loader the hook stays loading.
- Re-evaluates on: refresh()/retry(), a change of the `savedQueries` object (any reload or save/delete of any saved query), query id, project directory id. A result is shown only while the inputs it ran for equal the current inputs; a stale resolution is dropped.
- `ready.ids` is in transport order; no order is promised. Task 5's `organizerSource.ts` (not present in this worktree) is to take `readonly string[]` and put them in tree order. That wiring was not exercised here.

## Commands (from `frontend/`)

- `pnpm exec vitest run tests/useOrganizerSmartFolderCards.test.tsx`: 13 passed.
- `pnpm typecheck`: no errors.
- `pnpm exec eslint <the two files>`: no errors or warnings (after renaming booleans to `is`/`has` and removing an over-built key helper).
- `pnpm exec prettier --write` on both files.

## Test order

The test file and the hook were both written before the first run, so the tests were not run red against a missing hook; the first run was green. Not checked: that each test fails when its behaviour is removed.

## Tested (jsdom, mocked transport, real store)

idle with null id; loading before any load and while the load is pending (no evaluate call); ref node and directory id passed; `JSON.stringify(state.queries)` identical before and after, `activeQueryIds` `[]`, `activeQueryDefinition` null, `isEvaluating` false; failed with Error message, `ids` absent, retry re-evaluates; non-Error fallback message; failed list load gives failed (no evaluate call); deleted with no evaluate call; refresh shows loading then new ids; list reload re-evaluates; reload that drops the id gives deleted; stale result after an id change ignored; cleared list stays loading.

## Not verified

- The shell's active smart folder (`activeSmartFolderId`, AppShell `useState`) is not reachable from a hook test; unchanged by construction (the hook touches no props or shell state), read not run.
- A real transport (HTTP or native), a real "ref not found" rejection through the hook, and any device. The deleted case is decided from the list, not from the rejection message.
- Cost: not measured here; each evaluation is one transport call per hook run (about 0.3 s on 2000 resources in task-3).
