import React from "react";
import type {
  AnyResource,
  MetadataField,
  MetadataValue,
  ResourceRef,
} from "../../../../src/lib/models/types";
import OrganizerCard, { type OrganizerCardProps } from "./OrganizerCard";
import OrganizerFilterBar from "./OrganizerFilterBar";
import useAppSelector, { useAppDispatch } from "../../../../src/store/hooks";
import {
  selectFolders,
  selectResources,
  setSelectedResourceId,
  setSuppressNextViewAutoSwitch,
} from "../../../../src/store/resourcesSlice";
import {
  selectActiveProjectStatuses,
  selectActiveProjectSubtypes,
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
  DEFAULT_CARD_EXCERPT_LENGTH,
} from "./cardBody";
import {
  organizerFilterReducer,
  initialOrganizerFilterState,
  filterChildren,
} from "./organizerFilters";
import { useOrganizerCardReorder } from "./useOrganizerCardReorder";
import { useFolderRowMetadata } from "../../../../src/hooks/useFolderRowMetadata";
import type { FolderRowMetadata } from "../../../../src/lib/folder-data-rows";
import { withFolderFieldValues } from "./organizerFolderChildren";
import useViewportTier from "../../../../src/lib/hooks/useViewportTier";
import { selectSavedQueriesList } from "../../../../src/store/querySlice";
import type {
  OrganizerArrangementResult,
  OrganizerAxis,
  OrganizerAxisValue,
  OrganizerSource,
} from "../../../../src/lib/models/organizer-grid-types";
import { ORGANIZER_GRID_CARD_CAP } from "./organizerGridCap";
import { ORGANIZER_FILTER_ACTIVE_REASON } from "./organizerOrderDrop";
import { listChildrenSource, resolveOrganizerSource } from "./organizerSource";
import { buildAxisValueList, getAxisChoices } from "./organizerAxisFields";
import {
  buildOrganizerGridModel,
  buildOrganizerPhoneGroups,
  type OrganizerGridAxisInput,
  type OrganizerGridResult,
} from "./organizerGridModel";
import OrganizerGridToolbar from "./OrganizerGridToolbar";
import OrganizerArrangementControls from "./OrganizerArrangementControls";
import {
  useOrganizerArrangements,
  type OrganizerArrangementOutcome,
  type OrganizerPicks,
} from "./useOrganizerArrangements";
import OrganizerGrid, { type OrganizerGridCardInfo } from "./OrganizerGrid";
import OrganizerGridCell, {
  type OrganizerGridCellProps,
} from "./OrganizerGridCell";
import OrganizerPhoneGroups from "./OrganizerPhoneGroups";
import {
  useOrganizerSmartFolderCards,
  type OrganizerSmartFolderState,
} from "./useOrganizerSmartFolderCards";
import { useOrganizerShownCardData } from "./useOrganizerShownCardData";
import { useOrganizerFieldDrop } from "./useOrganizerFieldDrop";
import { useOrganizerSmartDropFollowUp } from "./useOrganizerSmartDropFollowUp";
import {
  cardDraggableId,
  cellDroppableId,
  useOrganizerGridDrag,
} from "./useOrganizerGridDrag";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
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

const DEFAULT_SOURCE: OrganizerSource = {
  kind: "folder",
  folderId: "",
  scope: "children",
};

const NO_IDS: readonly string[] = [];
const NO_EXCERPTS: Record<string, string> = {};

/** A source that cannot show cards, with the text to say so (FR-3). */
interface SourceProblem {
  kind: "loading" | "failed" | "deleted" | "missing";
  message: string;
  retry?: () => void;
}

function describeSourceProblem(
  source: OrganizerSource,
  smart: OrganizerSmartFolderState,
  isFolderMissing: boolean,
): SourceProblem | null {
  if (source.kind === "folder") {
    return isFolderMissing && source.folderId !== ""
      ? { kind: "missing", message: "This folder no longer exists." }
      : null;
  }
  switch (smart.status) {
    case "ready":
      return null;
    case "failed":
      return {
        kind: "failed",
        message: `The smart folder could not be read: ${smart.message}`,
        retry: smart.retry,
      };
    case "deleted":
      return {
        kind: "deleted",
        message: "This smart folder no longer exists. Choose another source.",
      };
    default:
      return { kind: "loading", message: "Loading the smart folder…" };
  }
}

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

/**
 * Best-effort display title fallback chain for a resource, mirroring
 * `OrganizerCard.tsx`'s own `title` derivation exactly, so a drag-end
 * announcement (FR-8) names the same title the card itself renders.
 */
/** Adapts the hook's outcome to the controls' result type; the controls show only `message`. */
function asArrangementResult(
  outcome: OrganizerArrangementOutcome,
): OrganizerArrangementResult<{ id: string }> {
  return outcome.ok
    ? outcome
    : { ok: false, reason: "invalid-input", message: outcome.message };
}

function resolveCardTitle(resource: AnyResource): string {
  return (resource as { title?: string }).title ?? resource.name ?? "Untitled";
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

/** A cell that registers itself as a drop target (every cell, so a refused drop says why). */
function DroppableGridCell(props: OrganizerGridCellProps): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: cellDroppableId(props.rowKey, props.columnKey),
  });
  return (
    <OrganizerGridCell {...props} droppableRef={setNodeRef} isOver={isOver} />
  );
}

/**
 * One appearance of a card in the grid: draggable by its handle and, with
 * Columns `order`, also a drop target (Task 20: order drops target cards).
 */
function DraggableGridCard({
  info,
  isOrderMode,
}: {
  info: OrganizerGridCardInfo;
  isOrderMode: boolean;
}): JSX.Element {
  const id = cardDraggableId(
    info.cardId,
    info.placement.rowKey,
    info.placement.columnKey,
  );
  const drag = useDraggable({ id });
  const drop = useDroppable({ id, disabled: !isOrderMode });
  const setRef = (element: HTMLElement | null): void => {
    drag.setNodeRef(element);
    drop.setNodeRef(element);
  };
  return (
    <div data-organizer-card-id={info.cardId} className="flex flex-col gap-1">
      <OrganizerCard
        resource={info.resource}
        {...info.cardProps}
        cardRef={setRef}
        dragHandleAttributes={drag.attributes}
        dragHandleListeners={drag.listeners}
        dragStyle={{ opacity: drag.isDragging ? 0.4 : undefined }}
      />
      {info.alsoInOtherCellsText && (
        <p className="text-xs text-gw-secondary">{info.alsoInOtherCellsText}</p>
      )}
    </div>
  );
}

/** Moves focus to a card's drag handle (the first button in its header). */
function focusCardHandle(cardId: string): void {
  document
    .querySelector<HTMLElement>(
      `[data-organizer-card-id="${window.CSS.escape(cardId)}"] button`,
    )
    ?.focus();
}

/** The value an axis reads from a card: status, subtype or a field. */
function storedValueOf(
  axis: OrganizerAxis,
  card: AnyResource,
  folderSubtype: string | undefined,
): MetadataValue | undefined {
  if (typeof axis === "string") return undefined;
  if (axis.kind === "status") return card.userMetadata?.status;
  if (axis.kind === "subtype") {
    return card.type === "folder"
      ? folderSubtype
      : (card as { resourceSubtype?: string }).resourceSubtype;
  }
  return card.userMetadata?.[axis.key];
}

export interface OrganizerViewProps {
  /** Whether to show the body/content of each resource */
  showBody?: boolean;
  /** Callback when the user toggles body visibility */
  onToggleBody?: (show: boolean) => void;
  /** Optional className for outer container */
  className?: string;
  /** Card cap for the grid; defaults to `ORGANIZER_GRID_CARD_CAP` (no cap until measured). */
  cardCap?: number | null;
  /** Called when a drop finds the document gone, so the host can re-read the project. */
  onResourceGone?: () => void;
}

/**
 * `OrganizerView` renders a flat grid of cards for the direct children
 * (files and subfolders) of the currently selected folder. Clicking a
 * card's Open button selects that item, allowing navigation into subfolders.
 */
export default function OrganizerView({
  showBody = true,
  onToggleBody,
  className = "",
  cardCap = ORGANIZER_GRID_CARD_CAP,
  onResourceGone,
}: OrganizerViewProps): JSX.Element {
  const dispatch = useAppDispatch();
  const viewportTier = useViewportTier();
  const resources = useAppSelector(
    (s) => selectResources(s.resources),
    shallowEqual,
  );
  const folders = useAppSelector(
    (s) => selectFolders(s.resources),
    shallowEqual,
  );
  const selectedResourceId = useAppSelector(
    (s) => s.resources.selectedResourceId,
  );
  const statuses = useAppSelector(
    (s) => selectActiveProjectStatuses(s),
    shallowEqual,
  );
  // The filter's Status select offers the configured list only.
  const filterStatusOptions = statuses;
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
  // Mirrors `ResourceTree.tsx`'s own `currentProject` selection — the
  // `{ id, rootPath }` shape `useOrganizerCardReorder`'s `persistReorder`
  // dispatch needs, distinct from the directory-basename `projectId` above.
  const currentProject = useAppSelector(
    (s) => s.projects.projects[s.projects.selectedProjectId ?? ""] ?? null,
  );

  const subtypes = useAppSelector(
    (s) => selectActiveProjectSubtypes(s),
    shallowEqual,
  );
  const savedQueries = useAppSelector(selectSavedQueriesList, shallowEqual);

  const [isShowingBody, setIsShowingBody] = React.useState(showBody);

  // The arrangement: source, Rows and Columns. Local state here; the saved
  // arrangements wiring (Task 36) drives these through the setters. A folder
  // source follows the browsed folder live unless `isSourcePinned`.
  const [source, setSource] = React.useState<OrganizerSource>(DEFAULT_SOURCE);
  const [isSourcePinned, setIsSourcePinned] = React.useState(false);
  const [rowsAxis, setRowsAxis] = React.useState<OrganizerAxis>("none");
  const [columnsAxis, setColumnsAxis] = React.useState<OrganizerAxis>("order");
  // Folder values written by a drop, until the next folder read replaces them.
  const [folderSaved, setFolderSaved] = React.useState<{
    key: string;
    byId: Record<string, FolderRowMetadata>;
  }>({ key: "", byId: {} });
  const [dropMessage, setDropMessage] = React.useState<string | null>(null);
  const [overlayWidth, setOverlayWidth] = React.useState<number | null>(null);

  // Collapse state for the filter bar itself (FR-12) and, nested within it,
  // the advanced-filters disclosure (FR-14). Deliberately session-only local
  // state — kept out of `organizerFilters.ts`'s reducer/`OrganizerFilterState`
  // so it is never reset by the filter-values reset effect below, and never
  // persisted alongside the filter values it collapses/expands.
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

  // The folder currently being browsed in the Organizer grid (FR-7). This is
  // deliberately separate from the globally-selected resource: it only ever
  // syncs from `selectedResourceId` when that id resolves to an actual
  // folder, so selecting a non-folder resource elsewhere in the app does not
  // change what the Organizer is browsing.
  const [browsingFolderId, setBrowsingFolderId] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    if (folders.some((f) => f.id === selectedResourceId)) {
      setBrowsingFolderId(selectedResourceId);
    }
  }, [selectedResourceId, folders]);

  const selectedFolder = folders.find((f) => f.id === browsingFolderId) ?? null;

  // The effective source: a folder source follows the browsed folder unless
  // pinned (Task 36 pins a saved arrangement's folder).
  const browsedFolderIdForSource = selectedFolder?.id ?? "";
  const effectiveSource: OrganizerSource = React.useMemo(
    () =>
      source.kind === "folder" && !isSourcePinned
        ? { ...source, folderId: browsedFolderIdForSource }
        : source,
    [source, isSourcePinned, browsedFolderIdForSource],
  );

  // Saved arrangements (FR-14 to FR-16, FR-19): applying one sets source,
  // rows and columns only; the filters are never touched. A folder source of
  // an applied arrangement is pinned to its saved folder.
  const [arrangementMessage, setArrangementMessage] = React.useState<
    string | null
  >(null);
  const arrangementCurrent: OrganizerPicks = React.useMemo(
    () => ({ source: effectiveSource, rows: rowsAxis, columns: columnsAxis }),
    [effectiveSource, rowsAxis, columnsAxis],
  );
  const arrangementDefaults: OrganizerPicks = React.useMemo(
    () => ({
      source: { ...DEFAULT_SOURCE, folderId: browsedFolderIdForSource },
      rows: "none",
      columns: "order",
    }),
    [browsedFolderIdForSource],
  );
  const applyArrangementPicks = React.useCallback((picks: OrganizerPicks) => {
    setSource(picks.source);
    setIsSourcePinned(
      picks.source.kind === "folder" && picks.source.folderId !== "",
    );
    setRowsAxis(picks.rows);
    setColumnsAxis(picks.columns);
  }, []);
  const arrangements = useOrganizerArrangements({
    current: arrangementCurrent,
    defaultPicks: arrangementDefaults,
    onApply: applyArrangementPicks,
  });
  const selectArrangement = (id: string | null): void => {
    const outcome = arrangements.apply(id);
    setArrangementMessage(outcome.ok ? null : outcome.message);
  };
  const smartFolder = useOrganizerSmartFolderCards(
    effectiveSource.kind === "smart-folder" ? effectiveSource.queryId : null,
  );
  // Everything in `folders` is a folder, so it is tagged as one for the
  // source model, which tells folders from documents by `type`.
  const allItems: AnyResource[] = React.useMemo(
    () => [
      ...folders.map((f) =>
        f.type === "folder" ? f : { ...f, type: "folder" as const },
      ),
      ...resources,
    ],
    [folders, resources],
  );
  const resolvedSource = React.useMemo(
    () =>
      resolveOrganizerSource(
        effectiveSource,
        allItems,
        smartFolder.state.status === "ready"
          ? smartFolder.state.ids
          : undefined,
      ),
    [effectiveSource, allItems, smartFolder.state],
  );
  const allChildren: AnyResource[] = resolvedSource.cards;
  // The browsed folder's full, unfiltered direct children: what a reorder
  // rewrites, whichever source the grid shows.
  const siblingCards = React.useMemo(
    () =>
      selectedFolder
        ? listChildrenSource(selectedFolder.id, allItems).cards
        : [],
    [selectedFolder, allItems],
  );

  // Child folders' sidecar metadata (Feature 102, FR-14): subtype for the
  // card, field values for the filters and the axes. No request without a
  // project directory or folder cards. A failed read is shown, never dropped.
  // Read for every folder card of the source (not only the shown ones),
  // since the filters and the axis values need them (OQ-18 allows one read
  // per folder).
  const childFolderIdsKey = projectId
    ? allChildren
        .filter((c) => c.type === "folder")
        .map((c) => c.id)
        .join(",")
    : "";
  const childFolderIds = React.useMemo(
    () => (childFolderIdsKey === "" ? [] : childFolderIdsKey.split(",")),
    [childFolderIdsKey],
  );
  const folderMetadata = useFolderRowMetadata(projectId ?? "", childFolderIds);
  const folderMetadataById = React.useMemo(
    () =>
      folderMetadata.status === "ready"
        ? {
            ...folderMetadata.byId,
            ...(folderSaved.key === childFolderIdsKey ? folderSaved.byId : {}),
          }
        : undefined,
    [folderMetadata, folderSaved, childFolderIdsKey],
  );
  const isFolderReadFailed = folderMetadata.status === "failed";
  // Same ids and order as `allChildren`; folders carry their field values so
  // the existing filters apply to them.
  const filterableChildren = withFolderFieldValues(
    allChildren,
    folderMetadataById,
  );

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

  // FR-5: distinct values (by referenced resource name) present among the
  // *unfiltered* set of the currently selected folder's direct children, one
  // list per ref field. Deliberately derived from `allChildren`, not
  // `visibleChildren`, so narrowing one filter never shrinks another
  // filter's own option list out from under the writer.
  const refFieldValues: Record<string, string[]> = React.useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const field of refFields) {
      const distinct = new Set<string>();
      for (const child of filterableChildren) {
        const rawValue = child.userMetadata?.[field.key];
        const refs: unknown[] = Array.isArray(rawValue) ? rawValue : [rawValue];
        for (const entry of refs) {
          const name = asResourceRefName(entry);
          if (name !== undefined) {
            distinct.add(name);
          }
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
  ).filter((child) => !(isFolderReadFailed && child.type === "folder"));

  // FR-9: whether any filter is currently active, used to distinguish a
  // genuinely empty folder from one filtered down to zero visible cards.
  const isAnyFilterActive =
    filterState.status !== undefined ||
    filterState.wordCountMin !== undefined ||
    filterState.wordCountMax !== undefined ||
    Object.values(filterState.refFilters).some(
      (value) => value !== undefined && value !== "",
    );

  const cardBodySource = cardBodyConfig?.source;
  const excerptLength = cardBodyConfig?.excerptLength;

  // The default arrangement (Rows none, Columns order, direct children) stays
  // today's wrapping list; every other combination is the grid branch.
  const isDefaultArrangement =
    rowsAxis === "none" &&
    columnsAxis === "order" &&
    effectiveSource.kind === "folder" &&
    effectiveSource.scope === "children";
  const isPhone = viewportTier === "phone";
  // Why the source shows nothing: never read as an empty source, never
  // replaced by another source.
  const sourceProblem = describeSourceProblem(
    effectiveSource,
    smartFolder.state,
    resolvedSource.missingIds.length > 0,
  );

  const axisChoices = getAxisChoices({
    schema: metadataSchema,
    source:
      effectiveSource.kind === "smart-folder"
        ? "smart-folder"
        : effectiveSource.scope,
    documentSubtypes: allChildren
      .filter((c) => c.type !== "folder")
      .map((c) => (c as { resourceSubtype?: string }).resourceSubtype),
    folderSubtypes: allChildren
      .filter((c) => c.type === "folder")
      .map((c) => folderMetadataById?.[c.id]?.resourceSubtype),
    position: "rows",
    other: "none",
  });

  const axisInput = (axis: OrganizerAxis): OrganizerGridAxisInput => ({
    axis,
    list:
      typeof axis === "string"
        ? null
        : buildAxisValueList({
            axis,
            schema: metadataSchema,
            statuses,
            subtypes,
            presentValues:
              axis.kind === "field"
                ? filterableChildren.map((c) => c.userMetadata?.[axis.key])
                : [],
          }),
    values: new Map(
      visibleChildren.map((c) => [
        c.id,
        storedValueOf(axis, c, folderMetadataById?.[c.id]?.resourceSubtype),
      ]),
    ),
  });
  const gridModel: OrganizerGridResult | null =
    isDefaultArrangement ||
    sourceProblem !== null ||
    visibleChildren.length === 0
      ? null
      : buildOrganizerGridModel({
          cards: visibleChildren.map((c) => ({
            id: c.id,
            kind: c.type === "folder" ? "folder" : "resource",
          })),
          rows: axisInput(rowsAxis),
          columns: axisInput(columnsAxis),
          cap: cardCap,
        });
  const cardsById = new Map(filterableChildren.map((c) => [c.id, c]));

  // Excerpts for the shown text cards only: the whole source in the default
  // list (a filter change never refetches there), the cards left after the
  // cap and the filters in the grid (FR-12). Folder sidecars are read above,
  // for every folder card, so none are requested here.
  const shownTextIds = (
    isDefaultArrangement
      ? allChildren.map((c) => c.id)
      : (gridModel?.shownCardIds ?? [])
  ).filter((id) => cardsById.get(id)?.type === "text");
  const shownData = useOrganizerShownCardData({
    projectId: projectId ?? "",
    source: effectiveSource,
    shownTextIds,
    shownFolderIds: NO_IDS,
    isExcerptWanted: isShowingBody && cardBodySource === "text-excerpt",
    excerptLength: excerptLength ?? DEFAULT_CARD_EXCERPT_LENGTH,
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

  /** Card props for the grid: body, folder subtype, selection, open and select. */
  const cardPropsFor = (id: string): Partial<OrganizerCardProps> => {
    const card = cardsById.get(id);
    if (!card) return {};
    return {
      showBody: isShowingBody,
      body: resolveOrganizerCardBody(card, cardBodyConfig, {
        notesEnabled: isNotesEnabled,
        textExcerpt: excerpts[id],
      }),
      folderSubtype: folderMetadataById?.[id]?.resourceSubtype,
      isSelected: id === selectedResourceId,
      onOpen: () => handleOpen(id),
      onSelect: () => handleSelect(id),
    };
  };

  // Task 3's reorder function, scoped to the currently browsed folder. Called
  // unconditionally (not just when `selectedFolder` exists) per the rules of
  // hooks; `browsedFolderId` falls back to `""` when nothing is browsed, at
  // which point `allChildren` is also empty and the returned function is
  // simply never invoked.
  const reorderChildren = useOrganizerCardReorder({
    dispatch,
    currentProject,
    projectDirectoryId: projectId,
    browsedFolderId: selectedFolder?.id ?? "",
    allChildren: siblingCards,
  });

  // Grid drags (Tasks 20 and 22): a field drop is one write through
  // `useOrganizerFieldDrop`; an order drop is the existing reorder; a refusal
  // is shown in text. A smart-folder source re-evaluates after each save.
  const refreshSmartFolder = smartFolder.refresh;
  const fieldDrop = useOrganizerFieldDrop({
    projectId: projectId ?? "",
    onGone: () => {
      refreshSmartFolder();
      onResourceGone?.();
    },
    onFolderSaved: (folderId, value) =>
      setFolderSaved((prev) => ({
        key: childFolderIdsKey,
        byId: {
          ...(prev.key === childFolderIdsKey ? prev.byId : {}),
          [folderId]: value,
        },
      })),
  });
  const lastDroppedCardId = React.useRef<string | null>(null);
  const lastDroppedCardName = React.useRef("Card");
  const isSmartSource = effectiveSource.kind === "smart-folder";
  // Runs once per saved drop (keyed on the state object), with the latest
  // closure: re-evaluate a smart-folder source, then hand focus back to the
  // card, which now sits in its new cell.
  const beginSmartFollowUp = useOrganizerSmartDropFollowUp({
    state: smartFolder.state,
    focusCard: focusCardHandle,
  });
  const afterSave = React.useRef<() => void>(() => undefined);
  afterSave.current = () => {
    const cardId = lastDroppedCardId.current;
    if (isSmartSource) {
      // The grid shows loading while it re-reads; the follow-up hook moves
      // focus, or toasts that the card left, once the new ids arrive.
      if (cardId) beginSmartFollowUp(cardId, lastDroppedCardName.current);
      refreshSmartFolder();
    } else if (cardId) {
      focusCardHandle(cardId);
    }
  };
  const dropState = fieldDrop.state;
  React.useEffect(() => {
    if (dropState.status === "saved") afterSave.current();
  }, [dropState]);

  const schemaFields = React.useMemo(
    () => metadataSchema.groups.flatMap((group) => group.fields),
    [metadataSchema],
  );
  const axisLines = (
    axis: OrganizerAxis,
    lines: OrganizerAxisValue[] | undefined,
  ) => ({ axis, values: typeof axis === "string" || !lines ? [] : lines });
  const gridDrag = useOrganizerGridDrag({
    rows: axisLines(rowsAxis, gridModel?.rows),
    columns: axisLines(columnsAxis, gridModel?.columns),
    fields: schemaFields,
    statuses,
    subtypes,
    getCard: (cardId) => {
      const card = cardsById.get(cardId);
      if (!card) return undefined;
      return {
        id: cardId,
        kind: card.type === "folder" ? "folder" : "resource",
        resourceSubtype:
          card.type === "folder"
            ? folderMetadataById?.[cardId]?.resourceSubtype
            : (card as { resourceSubtype?: string }).resourceSubtype,
        userMetadata: card.userMetadata,
      };
    },
    getCardTitle: (cardId) => {
      const card = cardsById.get(cardId);
      return card ? resolveCardTitle(card) : "Card";
    },
    orderDrop: {
      source: isSmartSource
        ? { kind: "smart-folder" }
        : { kind: "folder", scope: effectiveSource.scope },
      filterActive: isAnyFilterActive,
      siblingIds: siblingCards.map((card) => card.id),
      getRowCardIds: (rowKey) =>
        (gridModel?.cells ?? [])
          .filter((cell) => cell.rowKey === rowKey)
          .flatMap((cell) => cell.placements.map((p) => p.cardId)),
    },
    onFieldDrop: (input, context) => {
      setDropMessage(null);
      lastDroppedCardId.current = context.card.id;
      const card = cardsById.get(context.card.id);
      lastDroppedCardName.current = card ? resolveCardTitle(card) : "Card";
      void fieldDrop.drop({
        plan: { kind: "write", input },
        card: {
          id: context.card.id,
          kind: context.card.kind,
          name: card ? resolveCardTitle(card) : "Card",
        },
        destinationLabel: context.cellLabel,
      });
    },
    onOrderDrop: (newChildIds) => {
      setDropMessage(null);
      reorderChildren(newChildIds);
    },
    onRefuse: setDropMessage,
    focusCard: focusCardHandle,
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

  // Id (and measured width) of the card currently being dragged, if any —
  // drives the `DragOverlay` below. Pointer and keyboard drags both go
  // through `onDragStart`/`onDragEnd`/`onDragCancel`. The width is captured
  // from the dragged element's own rect at drag start, since `DragOverlay`
  // portals outside the grid and so cannot otherwise inherit the grid
  // column's width — without it, the overlay's card shrinks to its content's
  // intrinsic (narrow) width instead of matching the card it's lifted from.
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

  // FR-4: this handler touches only the reorder path — it never dispatches
  // `dispatchFilter` or otherwise reads/writes `filterState`/
  // `visibleChildren`.
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    setActiveDragWidth(null);
    if (isAnyFilterActive) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = allChildIds.indexOf(String(active.id));
    const newIndex = allChildIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(allChildIds, oldIndex, newIndex);
    reorderChildren(newOrder);
  };

  // FR-8: announces a completed keyboard (or pointer) reorder to assistive
  // technology, mirroring `handleDragEnd`'s own no-op conditions exactly so
  // no announcement fires for a disabled-by-filter, no-drop-target, or
  // dropped-without-moving drag. The announcement text is derived entirely
  // from data already in scope here (`allChildren`/`allChildIds`) — no new
  // fetch or store read is introduced for it. `onDragStart`/`onDragOver`/
  // `onDragCancel` are required by `@dnd-kit/core`'s `Announcements` type
  // but produce no announcement of their own — FR-8 only requires one on a
  // completed reorder.
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
        <div className="mb-4">
          <OrganizerGridToolbar
            fieldChoices={axisChoices.filter((c) => typeof c.axis !== "string")}
            rows={rowsAxis}
            columns={columnsAxis}
            onRowsChange={setRowsAxis}
            onColumnsChange={setColumnsAxis}
            source={effectiveSource}
            folderId={selectedFolder.id}
            smartFolders={savedQueries.map((q) => ({ id: q.id, name: q.name }))}
            onSourceChange={(next) => {
              setSource(next);
              setIsSourcePinned(false);
            }}
          />
          <div data-organizer-arrangements className="min-w-0 max-w-full mt-2">
            <OrganizerArrangementControls
              arrangements={arrangements.arrangements}
              selectedId={arrangements.appliedId}
              availability={arrangements.availability}
              isChangedSinceApplied={arrangements.isChanged}
              onSelect={selectArrangement}
              onAdd={async (name) =>
                asArrangementResult(await arrangements.save(name))
              }
              onRename={async (id, name) =>
                asArrangementResult(await arrangements.rename(id, name))
              }
              onDelete={async (id) =>
                asArrangementResult(await arrangements.remove(id))
              }
            />
            {(arrangementMessage ?? arrangements.notice) && (
              <p role="status" className="text-xs text-gw-secondary">
                {arrangementMessage ?? arrangements.notice}
              </p>
            )}
          </div>
        </div>
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

      {selectedFolder && folderMetadata.status === "failed" && (
        <p role="alert" className="text-sm text-gw-secondary mb-3">
          Folder details could not be loaded: {folderMetadata.message} Folders
          in this folder are not shown.
        </p>
      )}

      {selectedFolder && shownData.excerpts.status === "failed" && (
        <p role="alert" className="text-sm text-gw-secondary mb-3">
          Card excerpts could not be loaded: {shownData.excerpts.message}
        </p>
      )}

      {!isDefaultArrangement && !isPhone && (
        <div role="status" className="text-sm text-gw-secondary mb-2">
          {dropMessage ?? fieldDrop.announcement}
          {fieldDrop.state.status === "failed" && (
            <Button
              variant="secondary"
              className="ml-2"
              onClick={() => void fieldDrop.retry()}
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {!selectedFolder ? (
        <p className="text-sm text-gw-secondary">
          Select a folder to view its contents.
        </p>
      ) : sourceProblem ? (
        <div
          role={sourceProblem.kind === "failed" ? "alert" : "status"}
          className="text-sm text-gw-secondary flex items-center gap-3"
        >
          <p>{sourceProblem.message}</p>
          {sourceProblem.retry && (
            <Button variant="secondary" onClick={sourceProblem.retry}>
              Retry
            </Button>
          )}
        </div>
      ) : allChildren.length === 0 ? (
        <p className="text-sm text-gw-secondary">
          {isSmartSource
            ? "No documents match this smart folder."
            : "This folder is empty."}
        </p>
      ) : isAnyFilterActive && visibleChildren.length === 0 ? (
        <p className="text-sm text-gw-secondary">
          No cards match the current filters.
        </p>
      ) : isDefaultArrangement ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          accessibility={{ announcements }}
        >
          <SortableContext items={allChildIds} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleChildren.map((child) => (
                <SortableOrganizerCard
                  key={child.id}
                  childId={child.id}
                  resource={child}
                  showBody={isShowingBody}
                  body={resolveOrganizerCardBody(child, cardBodyConfig, {
                    notesEnabled: isNotesEnabled,
                    textExcerpt: excerpts[child.id],
                  })}
                  folderSubtype={
                    folderMetadataById?.[child.id]?.resourceSubtype
                  }
                  isSelected={child.id === selectedResourceId}
                  onOpen={() => handleOpen(child.id)}
                  onSelect={() => handleSelect(child.id)}
                  disabled={isAnyFilterActive}
                  disabledReason={DRAG_DISABLED_WHILE_FILTERED_REASON}
                />
              ))}
            </div>
          </SortableContext>
          {/* Renders the actively-dragged card in a floating portal,
           * independent of document flow — the sortable card in its
           * original grid slot fades out instead (see
           * `SortableOrganizerCard`'s `isDragging` handling) rather than
           * also tracking the pointer/keyboard move itself, which
           * previously caused the whole grid to visibly reflow underneath
           * the moving card. Fires for both pointer and keyboard drags
           * (`onDragStart` is sensor-agnostic); dnd-kit positions the
           * overlay at the active item's computed rect either way. */}
          <DragOverlay>
            {activeDragChild ? (
              <div style={{ width: activeDragWidth ?? undefined }}>
                <OrganizerCard
                  resource={activeDragChild}
                  showBody={isShowingBody}
                  body={resolveOrganizerCardBody(
                    activeDragChild,
                    cardBodyConfig,
                    {
                      notesEnabled: isNotesEnabled,
                      textExcerpt: excerpts[activeDragChild.id],
                    },
                  )}
                  folderSubtype={
                    folderMetadataById?.[activeDragChild.id]?.resourceSubtype
                  }
                  isSelected={activeDragChild.id === selectedResourceId}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : gridModel === null ? null : isPhone ? (
        <OrganizerPhoneGroups
          groups={buildOrganizerPhoneGroups(gridModel)}
          resourcesById={Object.fromEntries(cardsById)}
          rowsNone={rowsAxis === "none"}
          selectedId={selectedResourceId}
          onSelect={handleSelect}
          onOpen={handleOpen}
        />
      ) : (
        <DndContext
          {...gridDrag.dndContextProps}
          onDragStart={(event) => {
            setOverlayWidth(event.active.rect.current.initial?.width ?? null);
            gridDrag.dndContextProps.onDragStart(event);
          }}
        >
          <OrganizerGrid
            model={gridModel}
            resources={cardsById}
            getCardProps={cardPropsFor}
            CellComponent={DroppableGridCell}
            renderCard={(info) => (
              <DraggableGridCard
                info={info}
                isOrderMode={columnsAxis === "order"}
              />
            )}
          />
          <DragOverlay>
            {gridDrag.activeCardId && cardsById.get(gridDrag.activeCardId) ? (
              <div style={{ width: overlayWidth ?? undefined }}>
                <OrganizerCard
                  resource={cardsById.get(gridDrag.activeCardId)!}
                  {...cardPropsFor(gridDrag.activeCardId)}
                  onOpen={undefined}
                  onSelect={undefined}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {gridModel && gridModel.notShownCount > 0 && (
        <p role="status" className="text-sm text-gw-secondary mt-3">
          {gridModel.notShownCount} not shown. Narrow the source or the filters
          to reach them.
        </p>
      )}
    </div>
  );
}
