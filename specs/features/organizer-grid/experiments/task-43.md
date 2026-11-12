# Task 43: Documentation updates for the organizer grid

Results for this task only. Facts were read from the code on `feat/organizer-grid` (HEAD 6dc21292) and the records `task-*.md`, `fix-*.md`, `task-fixes-post-integration.md`. Nothing was run: no build, test, browser or device. "Read" below means read in source.

Device, paired-device and card-cap results are not stated in any document written here; they are recorded in `experiments/task-42.md`. The cap constant (`ORGANIZER_GRID_CARD_CAP`) is read as `null`; no figure appears in any doc.

## Files written

- `docs/user/handbook/views/organizer.md`: grid sections added under "Coming in the next release".
- `docs/user/handbook/organize/project-types.md`: section on starting new projects with arrangements.
- `docs/features/organizer-grid.md` (new): developer record.
- `docs/features/modules.md`: arrangements hook section.
- `docs/features/project-types.md`: `arrangements` key.
- `docs/features/project-configuration.md`: `config.organizerArrangements` and the per-device key.
- `frontend/components/WorkArea/Views/OrganizerView/README.md`: rewritten from the code.
- `frontend/CLAUDE.md`: one Code Map bullet for the grid, plus the `lib/api/*` list.
- `CLAUDE.md`: glossary entries Organizer grid, Arrangement, Axis, None row, Other values, Card cap.

## Verification record (statement, how checked, result)

- Source, Rows, Columns selects and their labels (None, Order, Status, Subtype, This folder, This folder and subfolders): read `OrganizerGridToolbar.tsx`, `organizerAxisFields.ts`. Confirmed.
- Field types offered (select, multiselect, resource-ref, multi-resource-ref; not deprecated; subtype scope; folder fields only in the children source): read `organizerAxisFields.ts`. Confirmed.
- Default arrangement renders the old list: read `OrganizerView.tsx` `isDefaultArrangement`. Confirmed.
- "Other values" line is always listed on a field axis in the wired view: read `buildAxisValueList` (always adds it) and `OrganizerGridView.tsx` (passes that list). Confirmed. This differs from the grid model's own "if used" wording, which only applies when the list has none.
- Every appearance of a multi-value card reads "also in N other cells": read `organizerGridModel.ts` (`alsoInOtherCells: coords.length - 1` on every placement), `OrganizerGrid.tsx`, `tests/organizerGrid.test.tsx` line 141 (2 matches for one duplicate). Confirmed. Contradicts spec FR-5 (see below).
- Drag behaviour (None clears; same cell no-op; multi-value moves only the dragged-from value; refusals): read `organizerDropModel.ts`, `useOrganizerFieldDrop.ts`. Confirmed, including that dragging out of Other values on a multiselect keeps only listed values.
- Refusal reasons shown to the writer: read `organizerDropModel.ts` messages. Confirmed.
- Card stays in old cell until save, failure text, Retry: read `useOrganizerFieldDrop.ts`, `OrganizerGridView.tsx`. Confirmed (jsdom tests only per records).
- Folder card drag writes via `updateFolderMetadata` with `clearFieldKeys`: read `useOrganizerFieldDrop.ts`, `folder-metadata-core.ts`. Confirmed.
- Order mode (Columns order): within-row reorder only; other row, descendants, smart folder, filter refused with fixed text: read `organizerOrderDrop.ts`. Confirmed.
- Smart-folder leave toast and focus follow-up: read `useOrganizerSmartDropFollowUp.ts`, `fix-wiring.md`. Confirmed for the text; focus is a jsdom result only.
- Phone: below 768px by `useViewportTier`, no drag, "Column: ...", "Same document, also in N other groups", headings "Label (count)", "No documents in Label", Rows none = one list, no bodies: read `OrganizerGridView.tsx`, `OrganizerPhoneGroups.tsx`, `task-23.md`. Confirmed.
- Keyboard (arrows, Home, End, Enter on a cell opens first card; handle lifts with Space or Enter, drops with Space, Enter or Tab, Escape cancels): read `OrganizerGrid.tsx`, `OrganizerGridCell.tsx`, `useOrganizerGridDrag.ts` header. Confirmed in source; no real keyboard or screen reader run.
- "N not shown. Narrow the source or the filters to reach them.": read `OrganizerGridView.tsx`. Confirmed. With the cap `null` it never shows in this build.
- Arrangement controls labels (Arrangements, Applied:, As applied, Changed since applied, Save current…, Rename, Delete, confirmation text, Unavailable: reason): read `OrganizerArrangementControls.tsx`. Confirmed.
- Name rules and limit 50, unique under trim and case-fold: read `organizer-arrangements-core.ts`. Confirmed.
- Unavailable arrangements, `axis-not-allowed`, failed check text: read `organizerArrangementAvailability.ts`, `fix-wiring.md`. Confirmed.
- Last-used key, Default clears it, fallback message: read `organizer-arrangement-preference.ts`, `useOrganizerArrangements.ts`, post-integration fix 3. Confirmed.
- Field-write core, route, statuses, transports, encrypted refusal on native: read the core, route, `native-organizer-field-write-backend.ts`, `encrypted-project-refusal.ts`. Confirmed.
- Arrangement route and core, `config.organizerArrangements` through `types.ts`, `schemas.ts`, `project.ts`, `projectsSlice.ts`: read. Confirmed.
- Project type `arrangements` shape, message, 50 limit, no smart folder: read `schemas.ts`, `task-33.md`. Confirmed.
- Module hook `arrangements` on `ModuleManifestEntry`, `registry.arrangements(config)`: read `registry.ts`, `task-34.md`. Confirmed.
- Seeding in `createProjectFromType` (second write, skip reasons, type beats module, console warn only, not surfaced by `createProjectCore`): read `project-creator.ts`, `task-35.md`. Confirmed. Note the type schema accepts Columns `none`; the core validator refuses it, so such a seed is skipped as `invalid` and logged only.
- Page save after a drop keeps the dropped value: read `app/(app)/page.tsx` diff and post-integration fix 5. Confirmed in source and in the one test named there. Described in `docs/features/organizer-grid.md` as the page building from Redux `userMetadata` for the selected resource; not narrated in the handbook.
- Card cap `null`, figure only from `task-42.md`: read `organizerGridCap.ts`, `OrganizerView.tsx` default. Confirmed.

## Left out of the handbook as unconfirmed

- Focus returning to the card after a drop: only jsdom (real view passes in `fix-wiring.md`; the stand-in harness in `organizerGridKeyboard.test.tsx` still has an `it.fails`). Not in a browser.
- A screen reader announcing refusals: not run. The handbook says GetWrite announces pick-up, target and drop or cancel, which is the announcement text in source.
- The first-paint flash of the phone layout, 360px layout: not measured.
- Behaviour in an encrypted, locked or paired-device project: not stated; only the native encrypted refusal is in the developer doc.
- That an older GetWrite refuses a type carrying `arrangements`: inferred from `.strict()`, stated in the developer doc as read, not observed.
- Whether saving an edited type in the Project Type Manager keeps `arrangements`: not tested.
- That a drag writes no writing-log entry or revision: spec requirement; the core calls neither, but no test was read for it, so it is not stated.

## Not verified

- No page was rendered. `check-copy.sh` was run on the two handbook pages: no FAIL lines; REVIEW lines are pre-existing words ("move", "ID", "key `arrangements`") kept on purpose.
- Links in new text were not link-checked beyond relative paths that exist.
- Storybook, the phone e2e spec, and the stories were recorded as not run or not rendered by their own tasks; docs state that status as recorded and no later run.
