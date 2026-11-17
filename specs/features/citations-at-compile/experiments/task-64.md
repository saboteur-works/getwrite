# Task 64: citation fields sidebar sends the project directory id

## Test

Added to `frontend/tests/metadataSidebarSource.test.tsx` (describe "MetadataSidebar Citation fields ids (Feature 116, Task 64)"). It mounts the real `MetadataSidebar` with a Source, `modules: { citations: true }`, a project whose `project.json` id is `eab25dde-0000-4000-8000-000000000001` and whose `rootPath` is `/projects/d278b38b-0000-4000-8000-000000000002`. `fetch` is stubbed to behave as the packaged server was measured to: `/api/citations/fields` answers 200 only for the directory id and 404 `{"error":"The resource was not found."}` for any other id. The store is set up as the app does, `setProject(project)` then `setSelectedProjectId(project.id)`.

## Measured: what Redux `selectedProjectId` holds

In that test, `selectedProjectId` equals the `project.json` id (`eab25dde-...`) and not the directory id (`d278b38b-...`). This is a test assertion on the store set up through `setProject` and `setSelectedProjectId(project.id)`, so it confirms what the slice does with that input. It is not a read of the live app store.

## Failing run (before the fix)

Command: `pnpm vitest run tests/metadataSidebarSource.test.tsx` in `frontend/`.

```
 ❯ |jsdom| tests/metadataSidebarSource.test.tsx (8 tests | 2 failed)
     × reads the fields with the directory id
     × saves the fields with the directory id
TestingLibraryElementError: Unable to find an element with the display value: Stored Title.
   ...  Error: The citation fields could not be loaded.   (in the rendered section)
 Tests  2 failed | 6 passed (8)
```

The "records what the Redux selectedProjectId holds" test passed in the same run.

## Fix

`frontend/components/Sidebar/MetadataSidebar.tsx`: the Citation fields section gets `projectDirectoryId` from `selectActiveProjectDirectoryId` instead of `selectedProjectId` (render guard and `projectId` prop). `selectedProjectId` stays for the add-field form.

## Passing run (after the fix)

```
 Tests  8 passed (8)    (tests/metadataSidebarSource.test.tsx)
```

The read test saw `GET` with `projectId` = directory id and the stored title shown. The save test saw exactly one `PUT` with `projectId` = directory id and no "could not be saved" text.

## Audit of Feature 116 client call sites

| Site | Id it passes | Result |
| --- | --- | --- |
| `components/Sidebar/MetadataSidebar.tsx:~534` to `CitationFieldsSection` (then `CitationFieldsEditor` to `readCitationFields` / `writeCitationFields`, `GET`/`PUT /api/citations/fields`) | was `selectedProjectId` (project.json id) | fixed, now directory id |
| `components/common/CompilePreviewModal.tsx:490` `runCitationCheck(projectId, ...)` (`POST /api/citations/check`) from the `projectId` prop | the prop, per mount below | see next rows |
| `components/Layout/ShellModalCoordinator.tsx:395` (`CompileModalWithCitations`) | `projectId` prop from `AppShell.tsx:1369`, `getProjectDirectoryId(project.rootPath)` | directory id |
| `components/Start/StartPage.tsx:638` `compileDefaultsProjectId` | `getProjectDirectoryId(rootPath)` (line 387-390) | directory id |
| `components/Sidebar/EntityCompileSection.tsx:123` | `selectActiveProjectDirectoryId` (line 43) | directory id; no citations option passed |
| `components/Layout/AppShell.tsx:1462` compile body `citations` | body `projectId: getProjectDirectoryId(project.rootPath)` (line 1445) | directory id |
| `components/Start/StartPage.tsx:677` compile body `citations` | body `projectId: getProjectDirectoryId(entry.project.rootPath)` (line 664) | directory id |
| `components/Layout/ShellModalCoordinator.tsx:364,415` other `projectId={projectId}` uses | same directory id prop | not citations-specific |

No other client site calls `/api/citations/*` (grep of `frontend/` outside tests: only `src/lib/api/citation-fields.ts` and `src/lib/api/citations-check.ts`, whose callers are listed above). `AppShell.tsx:1658` `project?.id` goes to `SaveQueryDialog` and is not a Feature 116 site. Only the sidebar site passed a non-directory id.

## Results (from `frontend/`)

- `pnpm test:ci`: 993 files passed; 13716 tests passed, 8 expected fail, 3 skipped.
- `pnpm typecheck`: no errors.
- `pnpm lint`: 0 errors, 459 warnings (all in existing code as reported by eslint).

## Cause

Measured only: the sidebar passed the value `selectedProjectId` holds, which is the `project.json` id when set from `setSelectedProjectId(project.id)`, and the routes answer 404 for it. Why the packaged app's `selectedProjectId` is a given project's `project.json` id is read from the slice's use in tests, not observed in the app; a debug read of the store in the packaged app would settle it.
