# Organizer grid (developer)

Feature 109. The Organizer can lay its cards out as a grid of rows and columns chosen by field, set a field by dragging a card to a cell, show grouped lists on a phone, and save named arrangements. Spec: `specs/features/organizer-grid.md`. Records: `specs/features/organizer-grid/experiments.md` and `experiments/task-<n>.md`. Writer-facing page: [docs/user/handbook/views/organizer.md](../user/handbook/views/organizer.md). Merged, not yet released.

Device, paired-device and card-cap results are not in this document. They are recorded in `specs/features/organizer-grid/experiments/task-42.md`. This document states no cap figure, and nothing here says Android or a paired device was verified.

## Shape

The grid is a layout of the Organizer, not a new view: `ViewName` and the view switcher are unchanged. `OrganizerView.tsx` is the host. It renders today's wrapping, sortable list as the default arrangement (Rows `none`, Columns `order`, source = direct children of the browsed folder) and `OrganizerGridView.tsx` for every other combination. The default branch is unchanged for an existing project.

Source, Rows and Columns picks are local state in `useOrganizerPicks.ts`. Filters (`organizerFilters.ts`), the card body setting (`config.organizerCardBody`) and **Hide bodies** apply to both branches.

## Pure modules (no React, Redux or `@dnd-kit`)

All under `frontend/components/WorkArea/Views/OrganizerView/`:

| File                                  | Holds                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizerSource.ts`                  | Source resolution. `listChildrenSource` (folders by `parentId ?? folderId`, then resources, each by `orderIndex`), `listDescendantsSource` (documents only, depth-first tree order), `resolveSmartFolderSource` (matching ids in tree order), `resolveOrganizerSource`. |
| `organizerAxisFields.ts`              | `getAxisChoices` (what Rows and Columns offer) and `buildAxisValueList` (the lines of one axis).                                                                                                                                                                        |
| `organizerGridModel.ts`               | `buildOrganizerGridModel` places cards in cells; `buildOrganizerPhoneGroups` derives the phone groups.                                                                                                                                                                  |
| `organizerDropModel.ts`               | `planOrganizerDrop`: a drag between cells becomes one field-write payload, a no-op or a refusal with fixed text.                                                                                                                                                        |
| `organizerOrderDrop.ts`               | `resolveOrderDrop`: a drop when Columns is `order`, mapped onto the full unfiltered sibling order.                                                                                                                                                                      |
| `organizerArrangementAvailability.ts` | Whether a saved arrangement can be applied, and why not.                                                                                                                                                                                                                |
| `organizerGridCap.ts`                 | `ORGANIZER_GRID_CARD_CAP` and `applyCardCap`.                                                                                                                                                                                                                           |

Axis rules (`organizerAxisFields.ts`): a field is offered when its type is select, multiselect, resource-ref or multi-resource-ref, it is not deprecated, and some document card's subtype shows it (`isFieldVisibleForSubtype`) or, in the children source only, some folder card is offered it (`getFieldsOfferedOnFolder`). `status` and `notes` are never field axes: Status and Subtype have their own entries. Picker order is None, Order (Columns only), Status, Subtype, then fields in schema order; the field chosen on the other picker is left out. Values are the field's `options`, `config.statuses`, `config.subtypes`, or for a reference field the ids present among the unfiltered cards in first-appearance order. Each field axis ends with "Other values" then "None". "Other values" holds stored values not in the list (never a drop target, never rewritten) and is shown only when at least one shown card has such a value: `buildAxisValueList` still returns an Other entry, but `buildOrganizerGridModel` adds the line only when a shown card lands in it (the entry supplies the label). "None" is always shown and a drop on it clears the field. Rows `none` is one line "All"; Columns `order` is one line "Document order".

Placement (`organizerGridModel.ts`): a card with several values is placed in every matching cell. Appearances are numbered in the grid's reading order (row by row, then column by column), and every placement carries `alsoInOtherCells` (the number of other cells holding the card). `OrganizerGrid.tsx` marks only the appearances after the first, with "also in N other cells"; the first appearance is unmarked (FR-5). The card is counted once. Within a cell, cards are in tree order. The phone groups still mark every group of a card that is in several ("Same document, also in N other groups").

## State shared by both branches

- `useOrganizerSourceData.ts`: resolves the source, reads the folder sidecars (`describeSourceProblem` gives the "folder no longer exists", "smart folder no longer exists", loading and failed texts). A failed source is shown as failed with **Retry**, never as an empty grid, and nothing falls back to another source.
- `useOrganizerSmartFolderCards.ts`: evaluates a smart folder into the hook's own state through the query transport, so it changes no `querySlice` state, the shell's active smart folder or the Data view. A result is current only for the evaluation that was started for the current selection: each change of the query id (including away from a smart folder and back to the same one) starts a new activation, and a result from an earlier activation or request is never shown. The grid shows "Loading the smart folder…" until the current evaluation answers.
- `useOrganizerShownCardData.ts`: excerpts for the shown text cards only. It calls `fetchResourceExcerptsOrThrow` (`lib/api/resource-excerpts.ts`, `fetchOrThrow` on both transports), so an HTTP failure is `failed` and not an empty excerpt map. That function requests at most `EXCERPT_BATCH_SIZE` (1000, the route's `MAX_RESOURCE_IDS`) ids at a time and merges the answers, on the HTTP and the native path alike; if any batch fails the whole read fails, so a partial map is never shown as complete. Nothing is requested when the layout renders no excerpt: at phone width (the grouped lists show no body) or when the card body is not set to a text excerpt. `OrganizerExcerptsFailedNotice` shows "Card excerpts could not be loaded: ...".
- `OrganizerStateMessage.tsx`: source-problem, empty and "No cards match the current filters." texts, shared by both branches.
- `cardBody.ts`: `resolveCardTitle` is shared by both branches.

## The grid branch

- `OrganizerGridView.tsx`: builds the grid model, mounts the drag and drop hooks (only while a non-default arrangement is shown), the phone groups, the drop status line (`role="status"`) with **Retry**, the excerpts for shown cards and the "N not shown" line.
- `OrganizerGrid.tsx`: ARIA grid (`role="grid"`, row and column headers, `gridcell`), roving tabindex, Arrow keys, Home and End. `OrganizerGridCell.tsx`: a droppable cell with a text name (row, column, count); Enter on the cell opens its first card; an empty cell reads "No documents".
- `OrganizerPhoneGroups.tsx`: below 768px (`useViewportTier() === "phone"`) the grid is replaced by grouped lists, a separate DOM with no `role="grid"` and no drag. Each card names its column values ("Column: ...") and a card in several groups reads "Same document, also in N other groups". Rows `none` is one plain list. Tablets keep the grid. Phone cards show no body text.
- `useOrganizerGridDrag.ts`: pointer sensor (8 px) and keyboard sensor with a custom coordinate getter (first recorded in `experiments/task-3.md`), announcements, drop routing. Over cells, one arrow press moves to the adjacent cell in that direction (the row above or below for Up and Down, the column left or right for Left and Right), empty cells included, and nothing happens at the edge; the current cell is the one holding the dragged card's centre, so cells of different heights and a card smaller than its cell do not make the first press land on the card's own cell (`experiments/task-fixes-measurement.md`, fix 3). In order mode the targets are cards and the nearest card in the arrow's direction is chosen. Keys on the handle: Space or Enter lifts, arrows move, Space, Enter or Tab drops, Escape cancels. It writes nothing; it hands a payload to `onFieldDrop`, a new order to `onOrderDrop` or a text to `onRefuse`.
- `useOrganizerFieldDrop.ts`: runs a field write. The card stays in its old cell until the write succeeds; a failure shows the text and a toast, keeps the card in place and offers `retry`. A gone resource calls `onGone`. A resource write patches Redux `userMetadata` and subtype only; a folder card is written through `updateFolderMetadata`.
- `useOrganizerSmartDropFollowUp.ts`: after a saved drop in a smart-folder source, re-evaluation runs; a card that no longer matches leaves with a toast "<name> left the smart folder because it no longer matches.", and focus moves to the handle once the new ids arrive.
- `OrganizerGridToolbar.tsx` (Source, Rows, Columns selects), `OrganizerToolbarArea.tsx` (the toolbar plus the arrangement controls and their message), `OrganizerArrangementControls.tsx` (**Arrangements** list: apply, **Save current…**, **Rename**, **Delete** with a confirmation, availability text, "Applied: <name or Default>", "As applied" or "Changed since applied").

### Order drops

With Columns `order` and Rows a field, each row band is one sequence. A drop reorders inside one folder through the tree's reorder (`useOrganizerCardReorder`, `persistReorder`); it never sets the row field and never re-parents. Refused with fixed text: a drop in another row ("Use a field drag..."), among another folder's cards (done in the tree), in the descendants source, in a smart-folder source, and while a filter is on ("Clear filters to reorder cards").

### Field drops

`planOrganizerDrop` writes one change per axis the drop moved. A multiselect or multi-reference drop moves only the dragged-from value and keeps the rest, in the field's list order; a drop on None removes only that value and clears the key when none remain; a drag out of Other values keeps only values on the list. A drop on the cell the card holds is a no-op. Refused: a field out of the document's subtype scope, a value not on the list or not a drop target (Other values), a locked field, a reference selection past `maxSelections`.

## Field-write operation

`setOrganizerFieldsCore(projectId, { resourceId, changes })` (`lib/models/organizer-field-write-core.ts`). A change is `{ target, op: "set", value }` or `{ target, op: "clear" }`; a target is `status`, `subtype` or `field` with a key. One input carries 1 to 10 changes with distinct targets.

- Validation runs before any lock, against `config.statuses`, `config.subtypes` and the stored metadata schema (the built-in schema when none is stored). A refusal is a result `{ ok: false, reason, message }` with fixed text that echoes no client input.
- One `mutateSidecar` write applies every change, merged over the sidecar read inside the lock. Only the named keys change; `orderIndex`, `folderId`, `entityKind`, `aliases`, `wordCountGoal` and other `userMetadata` keys are kept. When the result equals what is stored, nothing is written.
- Status clear removes `userMetadata.status`. A subtype is stored in the project list's spelling.
- A missing sidecar throws `ResourceGoneError`. Locked-access errors propagate.
- Route: `PUT /api/project/organizer-field`, body `{ projectId, input }`, in `withStorageContext`. 200 with the core's result (a refusal is 200), 400 for a malformed envelope or project id, 404 `{ error, code: "resource-gone" }`. No `checkLimit`: none of the five paired-device limits guards a field edit.
- Client: `lib/api/organizer-field-write.ts` `setOrganizerFields` returns `done`, `refused`, `gone` or `failed`. Native: `store/transport/native-organizer-field-write-backend.ts` with a `.web-stub.ts` alias in `next.config.mjs`; it refuses an encrypted-marked project before the core runs ("Fields can't be changed in an encrypted project on this device...", `encrypted-project-refusal.ts`).

### Folder `clearFieldKeys`

A folder card's field is written by `updateFolderMetadata`. Its metadata payload accepts an optional `clearFieldKeys` list beside `notes`, `fieldValues` and `resourceSubtype` (`folder-metadata-core.ts`, `FOLDER_METADATA_CLEAR_KEY`). It removes those keys from `fieldValues`. It is a list of at most 50 distinct, non-blank, non-reserved strings, and may not name a key that `fieldValues` sets in the same write; a violation is the core's `InvalidFolderMetadataError`, with text that carries no input. The route passes it through unchanged.

### Page save after a drop

A drop patches Redux `userMetadata`. The page's `updateResource` (`app/(app)/page.tsx`, `applyUpdate`) builds the whole resource from its own copy, so for the selected resource it now hands the updater a copy whose `userMetadata` is Redux's. Without this, a sidebar edit after a drop sent the older local values (measured in `tests/page-stale-sidecar-save.test.tsx`; see `experiments/task-fixes-post-integration.md`, fix 5). A resource that is not the selected one still uses the page's copy.

## Arrangements

A saved arrangement is `{ id (UUID), name, source, rows, columns }` (types in `lib/models/organizer-grid-types.ts`). A source is `{ kind: "folder", folderId, scope: "children" | "descendants" }` or `{ kind: "smart-folder", queryId }`. An axis is `"none"`, `"order"`, `{ kind: "status" }`, `{ kind: "subtype" }` or `{ kind: "field", key }`. No filters are stored.

### Config key

`config.organizerArrangements` (array, at most 50, optional). It is declared in `types.ts`, `schemas.ts` (`OrganizerArrangementListSchema`, every object strict), `project.ts` (`normalizeProjectConfig` copies it only when present) and `projectsSlice.ts` (`selectActiveProjectOrganizerArrangements`). A project that never saves one never gains the key. It is written only by the arrangement operations below and by seeding at creation. See also [project-configuration.md](./project-configuration.md).

The stored-arrangement Zod schema accepts `order` on Rows and `none` on Columns, because the contract has one axis type, so a stored value of that kind still loads. (A project type's seed schema is stricter and refuses both; see Seeding.) The write check refuses them (below), and `organizerArrangementAvailability.ts` reports a stored one as unavailable with reason `axis-not-allowed` (text "This arrangement uses a Rows or Columns choice that cannot be applied."). Nothing is rewritten.

### Operations

`addOrganizerArrangementCore`, `renameOrganizerArrangementCore`, `deleteOrganizerArrangementCore` (`lib/models/organizer-arrangements-core.ts`). Each validates before any lock (`validateOrganizerArrangementDraft` also serves seeding), then re-reads the list inside `withMetaLock` plus `updateProjectJson` and writes only `config.organizerArrangements`.

- Name trimmed, 1 to 100 characters, unique under trim and case-fold; at most 50 arrangements. Rows refuse `order`; Columns refuse `none`. Objects are strict, so an unknown key is refused. The id of a new arrangement is made by the core.
- A refusal is a result with fixed text (`name-blank`, `name-too-long`, `name-duplicate`, `limit-reached`, `invalid-source`, `invalid-axis`, `invalid-id`, `not-found`, `invalid-input`). A stored list that does not parse throws and writes nothing, so it is never read as empty.
- An arrangement whose folder, smart folder or field is gone is stored as written; availability is decided on the read side only after folders, saved queries and the metadata schema have loaded (`pending` until then), and a failed check shows "Unavailable (could not be checked): ...", never "no arrangements".
- Route: `POST /api/project/organizer-arrangements`, one dispatch route, flat body `{ projectId, op: "add" | "rename" | "delete", ...fields }`. 200 `{ ok: true, id }` or a refusal result; 400 `{ error }` for a malformed envelope; locked projects are 401 or 409 through `withStorageContext`. No paired-device limit.
- Client: `lib/api/organizer-arrangements.ts` (`addOrganizerArrangement`, `renameOrganizerArrangement`, `deleteOrganizerArrangement`). Native: `store/transport/native-organizer-arrangements-backend.ts` with a `.web-stub.ts` alias; it refuses an encrypted-marked project first ("Arrangements can't be changed in an encrypted project on this device...").
- Hook: `useOrganizerArrangements.ts` holds the list, availability, the applied one and the notice texts; applying changes the source, rows and columns and leaves the filters alone. A folder arrangement pins its saved folder; picking a source in the toolbar unpins.

### Per-device key

The last-used arrangement is kept per device in `localStorage` under `getwrite-organizer-arrangement:<projectDirId>`, value the arrangement id, absent meaning the default (`lib/organizer-arrangement-preference.ts`: `readLastOrganizerArrangementId`, `writeLastOrganizerArrangementId`, `clearLastOrganizerArrangementId`). A malformed value reads as absent; a read never writes; a storage failure never throws. A read failure and "nothing stored" are both `null`. It is applied when the Organizer opens; a missing, unavailable or unreadable one falls back to the default with a message and rewrites nothing. Applying **Default** removes the key. Not in `project.json`. Source, Rows and Columns picks that were not saved as an arrangement are not stored anywhere: after a reload they reset to the default arrangement (FR-16). Only the id of an applied saved arrangement is remembered.

## Seeding at project creation

- A project type may carry `arrangements`, a list of at most 50 `{ name, source: { kind: "folder", folderName, scope }, rows, columns }` (`ProjectTypeSchema` is `.strict()`; `PROJECT_TYPE_SECTION_LABELS.arrangements`). Names are unique under trim and case-fold. No `id` and no smart-folder source. Rows accept `none`, `status`, `subtype`, field; Columns accept `order`, `status`, `subtype`, field. Rows `order` and Columns `none` are refused when the type is validated, the same rule as the arrangements core, so the Project Type Manager's validation shows it and a seed is never skipped at creation for that reason. A malformed list is refused with "Arrangements must each have a name, a folder source, rows (none or a field) and columns (order or a field), with no repeated names." See [project-types.md](./project-types.md).
- A module may carry `arrangements?: readonly ModuleArrangementSeed[]` on `ModuleManifestEntry` (`lib/models/modules/registry.ts`), plain data with no slot kind; `createModuleRegistry(...).arrangements(config)` returns the seeds of enabled modules. No shipped module sets it; only a test fixture does. See [modules.md](./modules.md).
- `createProjectFromType` (`project-creator.ts`) seeds after the folders exist, in a second `project.json` write: the type's seeds, then the enabled modules'. A `folderName` resolves by `slugify` equality with the created folders (first match, top level before subfolders). Each seed goes through `validateOrganizerArrangementDraft`. A seed is left out for `folder-not-found`, `invalid`, `duplicate-name` (earlier wins, so the type beats a module) or `limit-reached`. With none resolved there is no second write and no key.
- Left-out seeds are returned as `skippedArrangements` by `createProjectFromType` and logged with `console.warn`. `createProjectCore` and `createProjectCoreNative` do not pass them on, so a writer is not told. No built-in type seeds arrangements. Seeding runs only at creation; a later change to a type never reaches an existing project.
- `project-type.schema.json` is unchanged: nothing in the repository validates against it (`experiments/task-1.md`, item (i)).

## Card cap

`ORGANIZER_GRID_CARD_CAP` in `organizerGridCap.ts` is 500, set by the owner on 2026-11-12 from the two desktop measurements (`experiments/task-42-measurement-desktop.md`, `task-42-measurement-desktop-2.md`; summarised in `experiments/task-42.md`); at 500 cards the measured desktop medians were about 0.3 to 0.7 s for render, key press and drag on `next dev`. No separate Android figure was set (the Pixel was not timed). `buildOrganizerGridModel` shows at most that many cards (counted as cards, not appearances), in tree order, and the line reads "N not shown. Narrow the source or the filters to reach them." Excerpts are requested for shown cards only. `OrganizerView` takes an optional `cardCap` prop that overrides the constant.

## Tests, stories and their status

Unit and component tests sit beside the other Organizer tests in `frontend/tests/` (`organizerGridModel`, `organizerDropModel`, `organizerAxisFields`, `organizerOrderDrop`, `organizerSource`, `organizerGrid*`, `useOrganizer*`, `unit/organizer-*`, `unit/project-type-arrangements-creation`). The a11y and keyboard tests are `tests/a11y/organizerGrid.a11y.test.tsx`, `tests/a11y/organizerArrangementControls.a11y.test.tsx` and `tests/organizerGridKeyboard.test.tsx`, which keeps one `it.fails` case for focus after a drop in its stand-in harness. Stories: `stories/WorkArea/OrganizerGrid.stories.tsx`. Phone e2e: `e2e/organizer-grid-phone.e2e.spec.ts`. The fixture generator for large projects is `scripts/organizer-grid-fixture/` (see its README).

As recorded: the tests run in jsdom with fakes and say nothing about a browser or a device. The stories were type-checked and linted but not rendered or run under the a11y addon when recorded (`task-37.md`, `task-fixes-post-integration.md`). The phone e2e spec was written and not run when recorded (`task-39.md`). Any later e2e or Storybook run is not recorded in this document.

## Known limits (as recorded)

- Not measured: the first-paint flash of the phone layout (`useViewportTier` reads `matchMedia` after mount), focus after a drop in a real browser, the 360px and 767px layouts in a browser, a real screen reader, colour contrast, and the cost of recomputing the grid model on every render.
- A seed left out at creation is reported only on the console.
- The Project Type Manager has no section for `arrangements`. A test (`tests/unit/project-type-draft-service-hook.test.tsx`) loads a saved type carrying it, edits other fields and saves: the sent and the kept definition still hold `arrangements` (the draft edits spread the whole definition). That is a jsdom test of the draft service, not of the whole page.
- The grid hooks mount only while a non-default arrangement is shown, and the default list and the grid each call `useOrganizerShownCardData` and `useOrganizerCardReorder`, so excerpts are fetched again on a switch of branch. No user-visible effect was measured.
- Phone lists have no drag and show no card bodies.
- Out of scope by spec (FR-21): derived entity rows, creating a document from an empty cell, date axes, text, number, date or boolean axes, per-cell order, a "Move to..." menu, cross-folder moves, saved filters in an arrangement.
