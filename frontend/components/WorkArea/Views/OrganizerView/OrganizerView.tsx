import React from "react";
import type {
  AnyResource,
  MetadataField,
  ResourceRef,
} from "../../../../src/lib/models/types";
import OrganizerCard, { type OrganizerCardProps } from "./OrganizerCard";
import OrganizerFilterBar from "./OrganizerFilterBar";
import OrganizerToolbarArea from "./OrganizerToolbarArea";
import OrganizerGridView from "./OrganizerGridView";
import {
  OrganizerExcerptsFailedNotice,
  organizerStateMessage,
} from "./OrganizerStateMessage";
import useAppSelector, { useAppDispatch } from "../../../../src/store/hooks";
import {
  selectFolders,
  setSelectedResourceId,
  setSuppressNextViewAutoSwitch,
} from "../../../../src/store/resourcesSlice";
import {
  selectActiveProjectStatuses,
  selectActiveProjectOrganizerCardBody,
  selectActiveProjectDirectoryId,
  selectActiveProjectMetadataSchema,
  selectNotesEnabled,
} from "../../../../src/store/projectsSlice";
import { Eye, EyeClosed } from "lucide-react";
import { shallowEqual } from "react-redux";
import Button from "../../../common/UI/Button";
import {
  resolveOrganizerCardBody,
  resolveCardTitle,
  DEFAULT_CARD_EXCERPT_LENGTH,
} from "./cardBody";
import {
  organizerFilterReducer,
  initialOrganizerFilterState,
  filterChildren,
} from "./organizerFilters";
import { useOrganizerCardReorder } from "./useOrganizerCardReorder";
import { ORGANIZER_GRID_CARD_CAP } from "./organizerGridCap";
import { ORGANIZER_FILTER_ACTIVE_REASON } from "./organizerOrderDrop";
import { useOrganizerPicks } from "./useOrganizerPicks";
import { useOrganizerSourceData } from "./useOrganizerSourceData";
import { useOrganizerShownCardData } from "./useOrganizerShownCardData";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Pointer movement (px) required before a drag starts, so an imprecise
 * click on the handle doesn't register as a drag attempt. */
const DRAG_ACTIVATION_DISTANCE = 8;

/** Copy shown as the drag handle's disabled-reason hint while a filter is active (FR-6). */
const DRAG_DISABLED_WHILE_FILTERED_REASON = ORGANIZER_FILTER_ACTIVE_REASON;

const NO_IDS: readonly string[] = [];
const NO_EXCERPTS: Record<string, string> = {};

/**
 * Wraps a single `OrganizerCard` with `@dnd-kit/sortable`'s `useSortable`,
 * translating its returned ref/attributes/listeners/transform into the
 * card's own Task-2 drag props. Kept as a small local component (rather than
 * inlined in the `.map(...)` below) since `useSortable` is a hook and must be
 * called once per rendered card.
 */
function SortableOrganizerCard({
  childId,
  disabled,
  disabledReason,
  ...cardProps
}: { childId: string; disabled: boolean; disabledReason?: string } & Omit<
  OrganizerCardProps,
  | "cardRef"
  | "dragHandleAttributes"
  | "dragHandleListeners"
  | "dragStyle"
  | "isDragDisabled"
  | "dragDisabledReason"
>): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: childId, disabled });

  // While this card is the one being dragged, its own slot fades to a
  // placeholder — the moving visual the user tracks is the `DragOverlay`
  // copy rendered separately, not this in-flow element (avoids the grid
  // reflowing visibly underneath a transform-following-pointer element).
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <OrganizerCard
      {...cardProps}
      cardRef={setNodeRef}
      dragHandleAttributes={attributes}
      dragHandleListeners={listeners}
      dragStyle={dragStyle}
      isDragDisabled={disabled}
      dragDisabledReason={disabled ? disabledReason : undefined}
    />
  );
}

/** Narrows a `MetadataValue` entry to a `ResourceRef`'s `name`, if it is one. */
function asResourceRefName(value: unknown): string | undefined {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "name" in (value as Record<string, unknown>)
  ) {
    return (value as ResourceRef).name;
  }
  return undefined;
}

export interface OrganizerViewProps {
  /** Whether to show the body/content of each resource */
  showBody?: boolean;
  /** Callback when the user toggles body visibility */
  onToggleBody?: (show: boolean) => void;
  /** Optional className for outer container */
  className?: string;
  /** Card cap for the grid; defaults to `ORGANIZER_GRID_CARD_CAP` (500). */
  cardCap?: number | null;
  /** Called when a drop finds the document gone, so the host can re-read the project. */
  onResourceGone?: () => void;
}

/**
 * `OrganizerView` shows the cards of the Organizer's source. The default
 * arrangement (Rows none, Columns order, direct children of the browsed
 * folder) stays today's wrapping, sortable list; every other arrangement is
 * the grid, rendered by `OrganizerGridView`. Clicking a card's Open button
 * selects that item, allowing navigation into subfolders.
 */
export default function OrganizerView({
  showBody = true,
  onToggleBody,
  className = "",
  cardCap = ORGANIZER_GRID_CARD_CAP,
  onResourceGone,
}: OrganizerViewProps): JSX.Element {
  const dispatch = useAppDispatch();
  const folders = useAppSelector(
    (s) => selectFolders(s.resources),
    shallowEqual,
  );
  const selectedResourceId = useAppSelector(
    (s) => s.resources.selectedResourceId,
  );
  // The filter's Status select offers the configured list only.
  const filterStatusOptions = useAppSelector(
    (s) => selectActiveProjectStatuses(s),
    shallowEqual,
  );
  // Card body source is project-configured (field / text-excerpt / none); the
  // Notes flag only drives the back-compat default when no config is set.
  const cardBodyConfig = useAppSelector(selectActiveProjectOrganizerCardBody);
  const isNotesEnabled = useAppSelector(selectNotesEnabled);
  const metadataSchema = useAppSelector(
    (s) => selectActiveProjectMetadataSchema(s),
    shallowEqual,
  );
  // Directory basename, not `project.id` (project.json's independently
  // generated internal id) — see `selectActiveProjectDirectoryId`'s doc
  // comment in `projectsSlice.ts`.
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  // The `{ id, rootPath }` shape `useOrganizerCardReorder`'s `persistReorder`
  // dispatch needs, distinct from the directory-basename `projectId` above.
  const currentProject = useAppSelector(
    (s) => s.projects.projects[s.projects.selectedProjectId ?? ""] ?? null,
  );

  const [isShowingBody, setIsShowingBody] = React.useState(showBody);

  // Collapse state for the filter bar itself (FR-12) and, nested within it,
  // the advanced-filters disclosure (FR-14). Deliberately session-only local
  // state, kept out of the filter reducer so it is never reset with the
  // filter values and never persisted.
  const [isFilterAreaOpen, setIsFilterAreaOpen] = React.useState(false);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] =
    React.useState(false);

  const handleToggle = React.useCallback(() => {
    setIsShowingBody((prev) => {
      const isNextShowing = !prev;
      if (onToggleBody) onToggleBody(isNextShowing);
      return isNextShowing;
    });
  }, [onToggleBody]);

  // The folder currently being browsed (FR-7). Deliberately separate from the
  // globally-selected resource: it only ever syncs from `selectedResourceId`
  // when that id resolves to an actual folder, so selecting a non-folder
  // resource elsewhere in the app does not change what the Organizer browses.
  const [browsingFolderId, setBrowsingFolderId] = React.useState<string | null>(
    null,
  );
  React.useEffect(() => {
    if (folders.some((f) => f.id === selectedResourceId)) {
      setBrowsingFolderId(selectedResourceId);
    }
  }, [selectedResourceId, folders]);
  const selectedFolder = folders.find((f) => f.id === browsingFolderId) ?? null;
  const folderId = selectedFolder?.id ?? "";

  const picks = useOrganizerPicks(folderId);
  const { effectiveSource, rowsAxis, columnsAxis } = picks;
  const data = useOrganizerSourceData({
    source: effectiveSource,
    browsedFolderId: selectedFolder?.id ?? null,
    projectId,
  });
  const { allChildren, filterableChildren, folderMetadataById } = data;

  const [filterState, dispatchFilter] = React.useReducer(
    organizerFilterReducer,
    initialOrganizerFilterState,
  );
  // Reset filters whenever the selected folder changes, so a filter set on
  // one folder never silently narrows a different folder's contents (FR-10).
  React.useEffect(() => {
    dispatchFilter({ type: "reset" });
  }, [selectedFolder?.id]);

  // FR-5: every resource-ref/multi-resource-ref field defined anywhere in
  // the active project's metadata schema, across all groups.
  const refFields: MetadataField[] = React.useMemo(
    () =>
      metadataSchema.groups
        .flatMap((group) => group.fields)
        .filter(
          (field) =>
            field.type === "resource-ref" ||
            field.type === "multi-resource-ref",
        ),
    [metadataSchema],
  );

  // FR-5: distinct values (by referenced resource name) among the *unfiltered*
  // set of the source's cards, one list per ref field, so narrowing one filter
  // never shrinks another filter's own option list.
  const refFieldValues: Record<string, string[]> = React.useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const field of refFields) {
      const distinct = new Set<string>();
      for (const child of filterableChildren) {
        const rawValue = child.userMetadata?.[field.key];
        const refs: unknown[] = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const entry of refs) {
          const name = asResourceRefName(entry);
          if (name !== undefined) distinct.add(name);
        }
      }
      result[field.key] = Array.from(distinct).sort((a, b) =>
        a.localeCompare(b),
      );
    }
    return result;
  }, [refFields, filterableChildren]);

  const visibleChildren = filterChildren(
    filterableChildren,
    filterState,
    refFields,
  ).filter(
    (child) => !(data.folderReadError !== null && child.type === "folder"),
  );

  // FR-9: whether any filter is currently active, used to distinguish a
  // genuinely empty folder from one filtered down to zero visible cards.
  const isAnyFilterActive =
    filterState.status !== undefined ||
    filterState.wordCountMin !== undefined ||
    filterState.wordCountMax !== undefined ||
    Object.values(filterState.refFilters).some(
      (value) => value !== undefined && value !== "",
    );

  // The default arrangement (Rows none, Columns order, direct children) stays
  // today's wrapping list; every other combination is the grid branch.
  const isDefaultArrangement =
    rowsAxis === "none" &&
    columnsAxis === "order" &&
    effectiveSource.kind === "folder" &&
    effectiveSource.scope === "children";

  // Excerpts for the whole source in the default list (a filter change never
  // refetches there); the grid branch reads its own, for its shown cards.
  const shownData = useOrganizerShownCardData({
    projectId: projectId ?? "",
    source: effectiveSource,
    shownTextIds: isDefaultArrangement
      ? allChildren.filter((c) => c.type === "text").map((c) => c.id)
      : NO_IDS,
    shownFolderIds: NO_IDS,
    isExcerptWanted: isShowingBody && cardBodyConfig?.source === "text-excerpt",
    excerptLength: cardBodyConfig?.excerptLength ?? DEFAULT_CARD_EXCERPT_LENGTH,
  });
  const excerpts: Record<string, string> =
    shownData.excerpts.status === "ready"
      ? shownData.excerpts.byId
      : NO_EXCERPTS;

  const handleOpen = (id: string) => dispatch(setSelectedResourceId(id));
  const handleSelect = (id: string) => {
    dispatch(setSuppressNextViewAutoSwitch(true));
    dispatch(setSelectedResourceId(id));
  };

  // Reorder of the browsed folder's full, unfiltered sibling order. Called
  // unconditionally per the rules of hooks; with nothing browsed the returned
  // function is never invoked.
  const reorderChildren = useOrganizerCardReorder({
    dispatch,
    currentProject,
    projectDirectoryId: projectId,
    browsedFolderId: folderId,
    allChildren: data.siblingCards,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const allChildIds = allChildren.map((child) => child.id);

  // Id (and measured width) of the card being dragged, for the `DragOverlay`.
  // The width is captured from the dragged element's rect at drag start, since
  // the overlay portals outside the grid and cannot inherit the column width.
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [activeDragWidth, setActiveDragWidth] = React.useState<number | null>(
    null,
  );
  const activeDragChild = activeDragId
    ? (allChildren.find((child) => child.id === activeDragId) ?? null)
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    setActiveDragWidth(event.active.rect.current.initial?.width ?? null);
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
    setActiveDragWidth(null);
  };

  // FR-4: touches only the reorder path; never reads or writes the filters.
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    setActiveDragWidth(null);
    if (isAnyFilterActive) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = allChildIds.indexOf(String(active.id));
    const newIndex = allChildIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    reorderChildren(arrayMove(allChildIds, oldIndex, newIndex));
  };

  // FR-8: announces a completed reorder, mirroring `handleDragEnd`'s own
  // no-op conditions so no announcement fires for a drag that moved nothing.
  // The other three callbacks are required by `Announcements` and say nothing.
  const announcements: Announcements = {
    onDragStart: () => undefined,
    onDragOver: () => undefined,
    onDragCancel: () => undefined,
    onDragEnd({ active, over }) {
      if (isAnyFilterActive) return undefined;
      if (!over || active.id === over.id) return undefined;

      const oldIndex = allChildIds.indexOf(String(active.id));
      const newIndex = allChildIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return undefined;

      const newOrder = arrayMove(allChildIds, oldIndex, newIndex);
      const movedChild = allChildren.find(
        (child) => child.id === String(active.id),
      );
      if (!movedChild) return undefined;

      const title = resolveCardTitle(movedChild);
      const position = newOrder.indexOf(String(active.id)) + 1;
      return `${title} moved to position ${position} of ${newOrder.length}`;
    },
  };

  /** Body, folder subtype and selection for a card of the default list. */
  const cardProps = (child: AnyResource): Partial<OrganizerCardProps> => ({
    showBody: isShowingBody,
    body: resolveOrganizerCardBody(child, cardBodyConfig, {
      notesEnabled: isNotesEnabled,
      textExcerpt: excerpts[child.id],
    }),
    folderSubtype: folderMetadataById?.[child.id]?.resourceSubtype,
    isSelected: child.id === selectedResourceId,
  });

  const stateMessage = organizerStateMessage({
    sourceProblem: data.sourceProblem,
    isSmartSource: effectiveSource.kind === "smart-folder",
    isSourceEmpty: allChildren.length === 0,
    isAnyFilterActive,
    visibleCount: visibleChildren.length,
  });

  return (
    <div className={`p-4 overflow-y-scroll h-[calc(100vh-12rem)] ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gw-h2 font-semibold text-gw-secondary">
          {selectedFolder ? selectedFolder.name : "Organizer"}
        </h2>
        <Button variant="secondary" onClick={handleToggle}>
          {isShowingBody ? (
            <EyeClosed
              size={16}
              className="inline-block mr-1 text-gw-secondary"
            />
          ) : (
            <Eye size={16} className="inline-block mr-1 text-gw-secondary" />
          )}{" "}
          {isShowingBody ? "Hide bodies" : "Show bodies"}
        </Button>
      </div>

      {selectedFolder && (
        <OrganizerToolbarArea
          picks={picks}
          folderId={selectedFolder.id}
          cards={allChildren}
          folderMetadataById={folderMetadataById}
        />
      )}

      {selectedFolder && allChildren.length > 0 && (
        <OrganizerFilterBar
          filterState={filterState}
          dispatchFilter={dispatchFilter}
          statuses={filterStatusOptions}
          refFields={refFields}
          refFieldValues={refFieldValues}
          isFilterAreaOpen={isFilterAreaOpen}
          setIsFilterAreaOpen={setIsFilterAreaOpen}
          isAdvancedFiltersOpen={isAdvancedFiltersOpen}
          setIsAdvancedFiltersOpen={setIsAdvancedFiltersOpen}
        />
      )}

      {selectedFolder && data.folderReadError !== null && (
        <p role="alert" className="text-sm text-gw-secondary mb-3">
          Folder details could not be loaded: {data.folderReadError} Folders in
          this folder are not shown.
        </p>
      )}

      {!selectedFolder ? (
        <p className="text-sm text-gw-secondary">
          Select a folder to view its contents.
        </p>
      ) : !isDefaultArrangement ? (
        <OrganizerGridView
          source={effectiveSource}
          rowsAxis={rowsAxis}
          columnsAxis={columnsAxis}
          folderId={selectedFolder.id}
          data={data}
          visibleChildren={visibleChildren}
          isAnyFilterActive={isAnyFilterActive}
          isShowingBody={isShowingBody}
          cardCap={cardCap}
          projectId={projectId}
          currentProject={currentProject}
          onResourceGone={onResourceGone}
        />
      ) : (
        <>
          {shownData.excerpts.status === "failed" && (
            <OrganizerExcerptsFailedNotice
              message={shownData.excerpts.message}
            />
          )}
          {stateMessage ?? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              accessibility={{ announcements }}
            >
              <SortableContext
                items={allChildIds}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleChildren.map((child) => (
                    <SortableOrganizerCard
                      key={child.id}
                      childId={child.id}
                      resource={child}
                      {...cardProps(child)}
                      onOpen={() => handleOpen(child.id)}
                      onSelect={() => handleSelect(child.id)}
                      disabled={isAnyFilterActive}
                      disabledReason={DRAG_DISABLED_WHILE_FILTERED_REASON}
                    />
                  ))}
                </div>
              </SortableContext>
              {/* The dragged card floats in a portal, independent of document
               * flow; its slot in the list fades instead (see
               * `SortableOrganizerCard`), so the list does not reflow under
               * the moving card. Fires for pointer and keyboard drags. */}
              <DragOverlay>
                {activeDragChild ? (
                  <div style={{ width: activeDragWidth ?? undefined }}>
                    <OrganizerCard
                      resource={activeDragChild}
                      {...cardProps(activeDragChild)}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </>
      )}
    </div>
  );
}
