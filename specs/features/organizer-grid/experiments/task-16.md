# Task 16: Shown-card data hook

Results for this task only.

## What was added

- `frontend/components/WorkArea/Views/OrganizerView/useOrganizerShownCardData.ts`: `useOrganizerShownCardData({ projectId, source, shownTextIds, shownFolderIds, isExcerptWanted, excerptLength })` returning `{ excerpts, folders }`. `excerpts` is `idle | loading | ready { byId } | failed { message }`; `folders` is the `FolderRowMetadataState` of `useFolderRowMetadata`, called unedited with the shown folder ids only when the source is a folder source with scope `children`, else with an empty list (state `idle`, no read). Excerpts go through `fetchResourceExcerpts`, unedited, with only the shown text ids. A result for an earlier shown set is discarded.
- `frontend/tests/useOrganizerShownCardData.test.tsx`: 9 tests.

## Observed

- `cd frontend && npx vitest run tests/useOrganizerShownCardData.test.tsx`: 1 file, 9 tests passed.
- `cd frontend && npx tsc --noEmit`: no output.
- `cd frontend && npx eslint` on the two frontend files: no output.
- Test order: the test file and the hook were written before the first run, so the red run was not observed. Order inverted; the tests were not seen failing for the right reason.
- Covered: 600 cards with a cap of 100 (counts from `applyCardCap`), with 60 text and 40 folder cards shown, the excerpt call names exactly those 60 ids and exactly 40 folder reads occur; a changed shown set triggers a second excerpt request and new folder reads; a rejected excerpt read and a rejected folder read each give `failed` with the message and no `byId`; descendants and smart-folder sources make no folder reads; no request when bodies are not wanted, nothing is shown or no project; a stale result is discarded.

## Limit found (measured by reading the source, not by a test)

`fetchResourceExcerpts` as it stands cannot report most failures. Its HTTP transport catches every error, returns `{}` on a non-ok response and on a schema-validation failure, and only a rejection reaches the hook (for example the lazy native transport import failing). So a failed excerpt read over HTTP arrives as `ready` with an empty `byId`. The hook returns `failed` only for a rejection. The task forbids editing `resource-excerpts.ts`, so the done_when clause "a failed excerpt read is returned as a failure state" holds for a rejected read and does not hold for the swallowed HTTP failures. Settling it needs a change to the transport (a throwing variant, as `listTagsOrThrow` does for tags), which is outside this task's declared files.

## Not done here

- Wiring into `OrganizerView.tsx` (a later task).
- The exact figures of the cap (Task 42).
