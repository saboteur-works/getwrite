# OrganizerView

The Organizer Work Area view. It shows the cards of one folder, or of a smart folder, either as today's wrapping list or as a grid of rows and columns chosen by field. Feature 109 added the grid; the feature record is `docs/features/organizer-grid.md`, the writer's page is `docs/user/handbook/views/organizer.md`.

## Two branches

`OrganizerView.tsx` is the host. It owns the header (title, **Hide bodies**), the browsed folder, the filters and the toolbar, then picks one branch:

- **Default arrangement** (Rows `none`, Columns `order`, source = direct children of the browsed folder): the wrapping, sortable list of `OrganizerCard`s, folders first, then resources, each by `orderIndex`. A pointer or keyboard drag reorders inside the folder through `useOrganizerCardReorder`; it is off while a filter is active ("Clear filters to reorder cards").
- **Every other combination**: `OrganizerGridView.tsx`.

Source, Rows and Columns picks live in `useOrganizerPicks.ts` (and its saved-arrangement wiring). Filters (`organizerFilters.ts`, `OrganizerFilterBar.tsx`), the card body setting and **Hide bodies** apply to both branches. Nothing is stored in the view; arrangements are project data (see below).

## Props

`OrganizerView` takes no resources: it reads `selectFolders`, `selectResources`, the selected folder and the project from Redux.

| Prop             | Type                      | Default                   | Meaning                                                                          |
| ---------------- | ------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `showBody`       | `boolean`                 | `true`                    | Initial state of the body toggle.                                                |
| `onToggleBody`   | `(show: boolean) => void` | none                      | Called when **Hide bodies** or **Show bodies** is pressed.                       |
| `className`      | `string`                  | `""`                      | Extra classes on the outer container.                                            |
| `cardCap`        | `number \| null`          | `ORGANIZER_GRID_CARD_CAP` | Card cap for the grid. `null` means no cap.                                      |
| `onResourceGone` | `() => void`              | none                      | Called when a drop finds the document gone, so the host can re-read the project. |

`OrganizerCard` props are documented in `OrganizerCard.tsx`; the card is presentational and controlled. It shows the title, the resource type, a date, an optional body, the stored status (no status line when none is stored) and, for a folder, its subtype. `body` comes from `resolveOrganizerCardBody` in `cardBody.ts`, driven by `config.organizerCardBody`.

## Files

Pure models (no React, Redux or `@dnd-kit`):

- `organizerSource.ts`: the source's cards in tree order (children, descendants, smart folder).
- `organizerAxisFields.ts`: which fields Rows and Columns offer, and the lines of one axis (list values, "Other values", "None").
- `organizerGridModel.ts`: places cards in cells; builds the phone groups.
- `organizerDropModel.ts`: a drag between cells becomes one field-write payload, a no-op or a refusal.
- `organizerOrderDrop.ts`: a drop when Columns is `order`, mapped onto the full sibling order.
- `organizerArrangementAvailability.ts`: whether a saved arrangement can be applied.
- `organizerGridCap.ts`: `ORGANIZER_GRID_CARD_CAP` (currently `null`; the figure comes from `experiments/task-42.md` only) and `applyCardCap`.
- `cardBody.ts`: card body and title resolution.

Hooks:

- `useOrganizerSourceData.ts`: resolves the source, reads folder sidecars, reports a missing, loading or failed source.
- `useOrganizerSmartFolderCards.ts`: evaluates a smart folder into local state (no `querySlice` change).
- `useOrganizerShownCardData.ts`: excerpts for the shown text cards; a failed read is `failed`, not empty.
- `useOrganizerPicks.ts`: source, rows and columns state and the arrangement wiring.
- `useOrganizerArrangements.ts`: saved list, availability, applied arrangement, last-used (per device).
- `useOrganizerGridDrag.ts`: sensors, coordinate getter, announcements, drop routing. Writes nothing.
- `useOrganizerFieldDrop.ts`: runs a field write; the card stays in its old cell until it succeeds; retry on failure.
- `useOrganizerSmartDropFollowUp.ts`: after a drop in a smart folder, re-reads, toasts when the card left, restores focus.
- `useOrganizerCardReorder.ts`, `organizerFolderChildren.ts`, `organizerFilters.ts`: the existing reorder, children and filter code.

Components:

- `OrganizerGridView.tsx`: the grid branch (model, drag, drop status line, phone groups, "N not shown").
- `OrganizerGrid.tsx` and `OrganizerGridCell.tsx`: the ARIA grid and its droppable cells.
- `OrganizerPhoneGroups.tsx`: the grouped lists shown below 768px (`useViewportTier`); no drag.
- `OrganizerToolbarArea.tsx`, `OrganizerGridToolbar.tsx`, `OrganizerArrangementControls.tsx`: the Source, Rows and Columns selects and the **Arrangements** controls.
- `OrganizerStateMessage.tsx`: source-problem, empty and no-match texts for both branches.
- `OrganizerCard.tsx`, `OrganizerFilterBar.tsx`.

## Behaviour to know

- With Rows `none` and Columns `order` the grid is one list in tree order; it is the default only with the children source.
- A card with several values appears in every matching cell; each appearance reads "also in N other cells". The cap, when set, counts cards, not appearances.
- A drop writes through `setOrganizerFields` (`lib/api/organizer-field-write.ts`). A folder card is written through `updateFolderMetadata`, clearing with `clearFieldKeys`. Refusals and failures show as text and a toast.
- Reorder stays a tree operation: with Columns `order` a drop reorders inside one folder only, and is refused for the descendants and smart-folder sources.
- Saved arrangements are `config.organizerArrangements`; the last-used one is a per-device `localStorage` key (`lib/organizer-arrangement-preference.ts`).
- Stories: `stories/WorkArea/OrganizerGrid.stories.tsx`. Tests: `frontend/tests/organizer*.test.tsx`, `use Organizer*` hook tests, `tests/a11y/organizerGrid*.test.tsx`.

## Not measured

First paint of the phone layout, focus after a drop in a real browser, the 360px layout, and a screen reader were not measured. Device and card-cap results are in `specs/features/organizer-grid/experiments/task-42.md`.
