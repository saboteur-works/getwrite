import React from "react";
import { shallowEqual } from "react-redux";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import type {
  AnyResource,
  MetadataValue,
} from "../../../../src/lib/models/types";
import type {
  OrganizerAxis,
  OrganizerAxisValue,
  OrganizerSource,
} from "../../../../src/lib/models/organizer-grid-types";
import useAppSelector, { useAppDispatch } from "../../../../src/store/hooks";
import {
  setSelectedResourceId,
  setSuppressNextViewAutoSwitch,
} from "../../../../src/store/resourcesSlice";
import {
  selectActiveProjectStatuses,
  selectActiveProjectSubtypes,
  selectActiveProjectOrganizerCardBody,
  selectActiveProjectMetadataSchema,
  selectNotesEnabled,
} from "../../../../src/store/projectsSlice";
import Button from "../../../common/UI/Button";
import useViewportTier from "../../../../src/lib/hooks/useViewportTier";
import OrganizerCard, { type OrganizerCardProps } from "./OrganizerCard";
import OrganizerGrid, { type OrganizerGridCardInfo } from "./OrganizerGrid";
import OrganizerGridCell, {
  type OrganizerGridCellProps,
} from "./OrganizerGridCell";
import OrganizerPhoneGroups from "./OrganizerPhoneGroups";
import {
  OrganizerExcerptsFailedNotice,
  organizerStateMessage,
} from "./OrganizerStateMessage";
import {
  DEFAULT_CARD_EXCERPT_LENGTH,
  resolveCardTitle,
  resolveOrganizerCardBody,
} from "./cardBody";
import { buildAxisValueList } from "./organizerAxisFields";
import {
  buildOrganizerGridModel,
  buildOrganizerPhoneGroups,
  type OrganizerGridAxisInput,
  type OrganizerGridResult,
} from "./organizerGridModel";
import type { OrganizerSourceData } from "./useOrganizerSourceData";
import { useOrganizerCardReorder } from "./useOrganizerCardReorder";
import { useOrganizerFieldDrop } from "./useOrganizerFieldDrop";
import { useOrganizerShownCardData } from "./useOrganizerShownCardData";
import { useOrganizerSmartDropFollowUp } from "./useOrganizerSmartDropFollowUp";
import {
  cardDraggableId,
  cellDroppableId,
  useOrganizerGridDrag,
} from "./useOrganizerGridDrag";

/**
 * @module OrganizerGridView
 * The Organizer's grid branch (Feature 109, FR-2 to FR-13): every arrangement
 * other than the default list. Builds the grid model from the cards the view
 * hands it, shows the matrix or, on a phone, the grouped lists, and runs the
 * drags: a field drop is one write through `useOrganizerFieldDrop`, an order
 * drop is the existing reorder, a refusal is shown in text. It stays mounted
 * while the source is loading or empty so a drop's outcome and the smart-folder
 * re-read it triggers are not lost.
 */

const NO_EXCERPTS: Record<string, string> = {};

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

const axisLines = (
  axis: OrganizerAxis,
  lines: OrganizerAxisValue[] | undefined,
) => ({ axis, values: typeof axis === "string" || !lines ? [] : lines });

export interface OrganizerGridViewProps {
  /** The effective source (a followed folder already resolved). */
  source: OrganizerSource;
  rowsAxis: OrganizerAxis;
  columnsAxis: OrganizerAxis;
  /** The browsed folder's id. */
  folderId: string;
  /** The source's cards and folder data from `useOrganizerSourceData`. */
  data: OrganizerSourceData;
  /** The source's cards left by the filters. */
  visibleChildren: AnyResource[];
  isAnyFilterActive: boolean;
  isShowingBody: boolean;
  /** Card cap; `null` means no cap. */
  cardCap: number | null;
  /** The project's on-disk directory basename. */
  projectId: string | null;
  /** The project record `useOrganizerCardReorder` dispatches against. */
  currentProject: { id: string; rootPath: string } | null;
  onResourceGone?: () => void;
}

export default function OrganizerGridView({
  source,
  rowsAxis,
  columnsAxis,
  folderId,
  data,
  visibleChildren,
  isAnyFilterActive,
  isShowingBody,
  cardCap,
  projectId,
  currentProject,
  onResourceGone,
}: OrganizerGridViewProps): JSX.Element {
  const dispatch = useAppDispatch();
  const isPhone = useViewportTier() === "phone";
  const selectedResourceId = useAppSelector(
    (s) => s.resources.selectedResourceId,
  );
  const statuses = useAppSelector(
    (s) => selectActiveProjectStatuses(s),
    shallowEqual,
  );
  const subtypes = useAppSelector(
    (s) => selectActiveProjectSubtypes(s),
    shallowEqual,
  );
  const metadataSchema = useAppSelector(
    (s) => selectActiveProjectMetadataSchema(s),
    shallowEqual,
  );
  const cardBodyConfig = useAppSelector(selectActiveProjectOrganizerCardBody);
  const isNotesEnabled = useAppSelector(selectNotesEnabled);
  const {
    smartFolder,
    allChildren,
    siblingCards,
    filterableChildren,
    folderMetadataById,
    sourceProblem,
  } = data;
  const isSmartSource = source.kind === "smart-folder";
  const [dropMessage, setDropMessage] = React.useState<string | null>(null);
  const [overlayWidth, setOverlayWidth] = React.useState<number | null>(null);

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
    sourceProblem !== null || visibleChildren.length === 0
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

  // Excerpts for the cards left after the cap and the filters (FR-12). Folder
  // sidecars are read by the source data hook, so none are requested here.
  const shownTextIds = (gridModel?.shownCardIds ?? []).filter(
    (id) => cardsById.get(id)?.type === "text",
  );
  const shownData = useOrganizerShownCardData({
    projectId: projectId ?? "",
    source,
    shownTextIds,
    shownFolderIds: [],
    // The phone's grouped lists render no card body, so none is read for them.
    isExcerptWanted:
      !isPhone && isShowingBody && cardBodyConfig?.source === "text-excerpt",
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

  // Scoped to the browsed folder's full, unfiltered sibling order.
  const reorderChildren = useOrganizerCardReorder({
    dispatch,
    currentProject,
    projectDirectoryId: projectId,
    browsedFolderId: folderId,
    allChildren: siblingCards,
  });

  // A field drop is one write; a smart-folder source re-evaluates after each save.
  const refreshSmartFolder = smartFolder.refresh;
  const fieldDrop = useOrganizerFieldDrop({
    projectId: projectId ?? "",
    onGone: () => {
      refreshSmartFolder();
      onResourceGone?.();
    },
    onFolderSaved: data.recordFolderSaved,
  });
  const lastDroppedCardId = React.useRef<string | null>(null);
  const lastDroppedCardName = React.useRef("Card");
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
        : { kind: "folder", scope: source.scope },
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

  const stateMessage = organizerStateMessage({
    sourceProblem,
    isSmartSource,
    isSourceEmpty: allChildren.length === 0,
    isAnyFilterActive,
    visibleCount: visibleChildren.length,
  });

  return (
    <>
      {shownData.excerpts.status === "failed" && (
        <OrganizerExcerptsFailedNotice message={shownData.excerpts.message} />
      )}

      {!isPhone && (
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

      {stateMessage ??
        (gridModel === null ? null : isPhone ? (
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
        ))}

      {gridModel && gridModel.notShownCount > 0 && (
        <p role="status" className="text-sm text-gw-secondary mt-3">
          {gridModel.notShownCount} not shown. Narrow the source or the filters
          to reach them.
        </p>
      )}
    </>
  );
}
