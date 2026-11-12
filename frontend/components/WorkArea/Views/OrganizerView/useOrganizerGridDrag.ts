/**
 * @module useOrganizerGridDrag
 * Drag setup for the Organizer grid (Feature 109, FR-9, FR-11; OQ-9). It
 * provides the pointer and keyboard sensors, the cell coordinate getter
 * recorded in Task 3, collision detection, screen-reader announcements and
 * drop routing, and spreads into `<DndContext>` as `dndContextProps`.
 *
 * It writes nothing. A field drop goes to `onFieldDrop` with the payload of
 * `planOrganizerDrop`, an order drop to `onOrderDrop` with the new sibling
 * order of `resolveOrderDrop`, and any refusal to `onRefuse` with its text.
 *
 * Ids: a card is draggable as `cardDraggableId(cardId, rowKey, columnKey)`
 * (a card in several cells needs one id per appearance), and a cell is
 * droppable as `cellDroppableId(rowKey, columnKey)`. In order mode (columns
 * axis `order`) the drop targets are the card draggables themselves.
 *
 * Keys: the keyboard sensor lifts from the drag handle with Space or Enter,
 * moves with the arrow keys, drops with Space, Enter or Tab and cancels with
 * Escape. A roving arrow-key handler on the grid must return early while
 * `activeCardId` is not null (Task 3: both handlers otherwise see the press).
 */
import {
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type SensorDescriptor,
  type SensorOptions,
} from "@dnd-kit/core";
import React from "react";
import type {
  OrganizerAxisValueList,
  OrganizerFieldWriteInput,
} from "../../../../src/lib/models/organizer-grid-types";
import type { MetadataField } from "../../../../src/lib/models/types";
import {
  planOrganizerDrop,
  type OrganizerDropCard,
  type OrganizerDropCoordinates,
} from "./organizerDropModel";
import { resolveOrderDrop, type OrderDropSource } from "./organizerOrderDrop";

/** Pointer drags start after this many pixels (as the existing Organizer). */
const ORGANIZER_GRID_DRAG_DISTANCE = 8;
/** Attribute the default focus return looks for on a card element. */
const ORGANIZER_CARD_ID_ATTRIBUTE = "data-organizer-card-id";
/** Attribute of the drag handle inside a card; focused first when present. */
const ORGANIZER_DRAG_HANDLE_ATTRIBUTE = "data-organizer-drag-handle";

const CELL_PREFIX = "cell:";
const CARD_PREFIX = "card:";
const enc = encodeURIComponent;

export const cellDroppableId = (rowKey: string, columnKey: string): string =>
  `${CELL_PREFIX}${enc(rowKey)}:${enc(columnKey)}`;

export const cardDraggableId = (
  cardId: string,
  rowKey: string,
  columnKey: string,
): string => `${CARD_PREFIX}${enc(cardId)}:${enc(rowKey)}:${enc(columnKey)}`;

function parts(id: string, prefix: string, count: number): string[] | null {
  if (!id.startsWith(prefix)) return null;
  const split = id.slice(prefix.length).split(":");
  if (split.length !== count) return null;
  try {
    return split.map(decodeURIComponent);
  } catch {
    return null;
  }
}

export function parseCellDroppableId(
  id: string,
): OrganizerDropCoordinates | null {
  const p = parts(id, CELL_PREFIX, 2);
  return p ? { rowKey: p[0], columnKey: p[1] } : null;
}

export function parseCardDraggableId(
  id: string,
): (OrganizerDropCoordinates & { cardId: string }) | null {
  const p = parts(id, CARD_PREFIX, 3);
  return p ? { cardId: p[0], rowKey: p[1], columnKey: p[2] } : null;
}

type ArrowDirection = readonly [number, number];
const ARROWS: Record<string, ArrowDirection> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

interface TargetRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Length of the overlap of [aStart, aEnd] and [bStart, bEnd]; 0 when they only touch. */
const overlap = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

/**
 * The cell the dragged card is in: the one whose rect holds the card's centre
 * (the card starts inside its own cell and each move centres it in a cell),
 * else the one with the nearest centre.
 */
function currentCellRect(
  cells: readonly TargetRect[],
  cx: number,
  cy: number,
): TargetRect | undefined {
  const holding = cells.find(
    (r) =>
      cx >= r.left &&
      cx <= r.left + r.width &&
      cy >= r.top &&
      cy <= r.top + r.height,
  );
  if (holding) return holding;
  let nearest: TargetRect | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const r of cells) {
    const distance = Math.hypot(
      r.left + r.width / 2 - cx,
      r.top + r.height / 2 - cy,
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = r;
    }
  }
  return nearest;
}

/**
 * The adjacent cell from `current` in `dir`: among the cells that start where
 * the current one ends and share some of its column (for Up and Down) or row
 * (for Left and Right), the nearest. Cell sizes may differ (a tall cell, an
 * empty short one), so adjacency is by edges, not by distance between centres.
 */
function adjacentCellRect(
  cells: readonly TargetRect[],
  current: TargetRect,
  dir: ArrowDirection,
): TargetRect | undefined {
  const right = current.left + current.width;
  const bottom = current.top + current.height;
  let best: TargetRect | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const r of cells) {
    if (r === current) continue;
    const rRight = r.left + r.width;
    const rBottom = r.top + r.height;
    let gap: number;
    let shares: number;
    if (dir[1] !== 0) {
      shares = overlap(current.left, right, r.left, rRight);
      gap = dir[1] > 0 ? r.top - bottom : current.top - rBottom;
    } else {
      shares = overlap(current.top, bottom, r.top, rBottom);
      gap = dir[0] > 0 ? r.left - right : current.left - rRight;
    }
    // A cell that overlaps the current one in the arrow's direction (gap
    // clearly negative) is not "next".
    if (shares <= 0 || gap < -1) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = r;
    }
  }
  return best;
}

/**
 * Keyboard coordinate getter. `prefix` selects the droppables it moves
 * between.
 *
 * Over cells (`cell:`), one arrow press moves to the adjacent cell in that
 * direction (the row above or below for Up and Down, the column left or right
 * for Left and Right), including an empty cell, and does nothing at the
 * grid's edge. The current cell is the one holding the card's centre, so a
 * card smaller than its cell, or cells of different heights, do not make the
 * first press land on the card's own cell.
 *
 * Over cards (`card:`, order mode), it moves to the nearest card in the
 * arrow's direction, a perpendicular offset weighted 1000x so the same row or
 * column wins before a nearer diagonal; the active card is skipped.
 *
 * Returns `undefined` (no move) when nothing lies that way.
 */
function createCoordinateGetter(prefix: string): KeyboardCoordinateGetter {
  const isCells = prefix === CELL_PREFIX;
  return (
    event,
    { context: { active, collisionRect, droppableRects, droppableContainers } },
  ) => {
    const dir = ARROWS[event.code];
    if (!dir || !active || !collisionRect) return undefined;
    event.preventDefault();
    const cx = collisionRect.left + collisionRect.width / 2;
    const cy = collisionRect.top + collisionRect.height / 2;
    const centered = (r: TargetRect): { x: number; y: number } => ({
      x: r.left + (r.width - collisionRect.width) / 2,
      y: r.top + (r.height - collisionRect.height) / 2,
    });
    const targets: Array<TargetRect> = [];
    droppableContainers.getEnabled().forEach((container) => {
      if (!String(container.id).startsWith(prefix)) return;
      if (container.id === active.id) return;
      const r = droppableRects.get(container.id);
      if (r) targets.push(r);
    });
    if (isCells) {
      const current = currentCellRect(targets, cx, cy);
      const next = current && adjacentCellRect(targets, current, dir);
      return next && centered(next);
    }
    let best: TargetRect | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const r of targets) {
      const dx = r.left + r.width / 2 - cx;
      const dy = r.top + r.height / 2 - cy;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 1) continue;
      const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      const score = across * 1000 + along;
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return best && centered(best);
  };
}

const prefixCollision =
  (prefix: string): CollisionDetection =>
  (args) =>
    closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        String(c.id).startsWith(prefix),
      ),
    });

/** What a drop resolved to, before any callback runs. */
interface OrganizerFieldDropContext {
  card: OrganizerDropCard;
  from: OrganizerDropCoordinates;
  to: OrganizerDropCoordinates;
  /** Text naming the target cell, e.g. `row Final, column Three`. */
  cellLabel: string;
}

export interface UseOrganizerGridDragOptions {
  rows: OrganizerAxisValueList;
  columns: OrganizerAxisValueList;
  fields: readonly MetadataField[];
  statuses: readonly string[];
  subtypes: readonly string[];
  getCard: (cardId: string) => OrganizerDropCard | undefined;
  getCardTitle: (cardId: string) => string;
  /** Needed when `columns.axis` is `order`. */
  orderDrop?: {
    source: OrderDropSource;
    filterActive: boolean;
    /** Full unfiltered direct children of the browsed folder, in order. */
    siblingIds: readonly string[];
    /** Cards of one row band, in the order shown. */
    getRowCardIds: (rowKey: string) => readonly string[];
  };
  onFieldDrop: (
    input: OrganizerFieldWriteInput,
    context: OrganizerFieldDropContext,
  ) => void;
  onOrderDrop: (newChildIds: string[]) => void;
  /** Receives the refusal text of either model (also fixed text for bad input). */
  onRefuse: (message: string) => void;
  /** Moves focus to the card; the default focuses its handle by attribute. */
  focusCard?: (cardId: string) => void;
}

type Resolved =
  | { kind: "none" }
  | { kind: "noop" }
  | { kind: "refused"; message: string }
  | {
      kind: "field";
      input: OrganizerFieldWriteInput;
      ctx: OrganizerFieldDropContext;
    }
  | { kind: "order"; newChildIds: string[]; cellLabel: string };

const UNMOVABLE = "This card could not be moved.";

function defaultFocusCard(cardId: string): void {
  const el = document.querySelector<HTMLElement>(
    `[${ORGANIZER_CARD_ID_ATTRIBUTE}="${CSS.escape(cardId)}"]`,
  );
  if (!el) return;
  (
    el.querySelector<HTMLElement>(`[${ORGANIZER_DRAG_HANDLE_ATTRIBUTE}]`) ?? el
  ).focus();
}

function labelOf(list: OrganizerAxisValueList, key: string): string {
  return list.values.find((v) => v.key === key)?.label ?? key;
}

export interface UseOrganizerGridDragResult {
  sensors: SensorDescriptor<SensorOptions>[];
  collisionDetection: CollisionDetection;
  announcements: Announcements;
  /** Id of the card being dragged, or null; roving key handlers check it. */
  activeCardId: string | null;
  /** Spread into `<DndContext>`. */
  dndContextProps: {
    sensors: SensorDescriptor<SensorOptions>[];
    collisionDetection: CollisionDetection;
    onDragStart: (e: DragStartEvent) => void;
    onDragEnd: (e: DragEndEvent) => void;
    onDragCancel: () => void;
    accessibility: { announcements: Announcements };
  };
}

export function useOrganizerGridDrag(
  options: UseOrganizerGridDragOptions,
): UseOrganizerGridDragResult {
  const isOrder = options.columns.axis === "order";
  const prefix = isOrder ? CARD_PREFIX : CELL_PREFIX;
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const coordinateGetter = React.useMemo(
    () => createCoordinateGetter(prefix),
    [prefix],
  );
  const collisionDetection = React.useMemo(
    () => prefixCollision(prefix),
    [prefix],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: ORGANIZER_GRID_DRAG_DISTANCE },
    }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const resolve = React.useCallback(
    (activeDragId: string, overId: string | null): Resolved => {
      const o = optionsRef.current;
      const active = parseCardDraggableId(activeDragId);
      if (!active || overId === null) return { kind: "none" };
      const overCard = parseCardDraggableId(overId);
      const overCell = overCard
        ? { rowKey: overCard.rowKey, columnKey: overCard.columnKey }
        : parseCellDroppableId(overId);
      if (!overCell) return { kind: "none" };
      const cellLabel = describeCell(o, overCell);
      if (o.columns.axis === "order") {
        return resolveOrder(o, active, overCard, overCell, cellLabel);
      }
      const card = o.getCard(active.cardId);
      if (!card) return { kind: "refused", message: UNMOVABLE };
      const from = { rowKey: active.rowKey, columnKey: active.columnKey };
      const plan = planOrganizerDrop({
        card,
        from,
        to: overCell,
        rows: o.rows,
        columns: o.columns,
        fields: o.fields,
        statuses: o.statuses,
        subtypes: o.subtypes,
      });
      if (plan.kind === "noop") return { kind: "noop" };
      if (plan.kind === "refused")
        return { kind: "refused", message: plan.message };
      return {
        kind: "field",
        input: plan.input,
        ctx: { card, from, to: overCell, cellLabel },
      };
    },
    [],
  );

  const announcements = React.useMemo<Announcements>(() => {
    const title = (id: string | number): string => {
      const parsed = parseCardDraggableId(String(id));
      return parsed ? optionsRef.current.getCardTitle(parsed.cardId) : "Card";
    };
    const overLabel = (over: { id: string | number } | null): string | null => {
      if (!over) return null;
      const cell =
        parseCellDroppableId(String(over.id)) ??
        parseCardDraggableId(String(over.id));
      return cell ? describeCell(optionsRef.current, cell) : null;
    };
    return {
      onDragStart: ({ active }) =>
        `Picked up ${title(active.id)}. Use the arrow keys to move between cells, Space to drop, Escape to cancel.`,
      onDragOver: ({ active, over }) => {
        const label = overLabel(over);
        return label === null
          ? `${title(active.id)} is not over a cell.`
          : `${title(active.id)} is over ${label}.`;
      },
      onDragEnd: ({ active, over }) => {
        const t = title(active.id);
        const r = resolve(String(active.id), over ? String(over.id) : null);
        switch (r.kind) {
          case "none":
            return `${t} dropped outside the cells. No change.`;
          case "noop":
            return `${t} dropped in its own cell. No change.`;
          case "refused":
            return `${t} was not moved. ${r.message}`;
          case "field":
            return `${t} dropped on ${r.ctx.cellLabel}.`;
          case "order":
            return `${t} dropped on ${r.cellLabel}.`;
        }
      },
      onDragCancel: ({ active }) =>
        `Move of ${title(active.id)} cancelled. No change.`,
    };
  }, [resolve]);

  const onDragStart = React.useCallback((e: DragStartEvent): void => {
    const p = parseCardDraggableId(String(e.active.id));
    setActiveId(p ? p.cardId : null);
  }, []);

  const onDragEnd = React.useCallback(
    (e: DragEndEvent): void => {
      setActiveId(null);
      const o = optionsRef.current;
      const active = parseCardDraggableId(String(e.active.id));
      const r = resolve(String(e.active.id), e.over ? String(e.over.id) : null);
      if (r.kind === "field") o.onFieldDrop(r.input, r.ctx);
      else if (r.kind === "order") o.onOrderDrop(r.newChildIds);
      else if (r.kind === "refused") o.onRefuse(r.message);
      if (
        active &&
        (r.kind === "field" || r.kind === "order" || r.kind === "refused")
      ) {
        (o.focusCard ?? defaultFocusCard)(active.cardId);
      }
    },
    [resolve],
  );

  const onDragCancel = React.useCallback((): void => setActiveId(null), []);

  return {
    sensors,
    collisionDetection,
    announcements,
    activeCardId: activeId,
    dndContextProps: {
      sensors,
      collisionDetection,
      onDragStart,
      onDragEnd,
      onDragCancel,
      accessibility: { announcements },
    },
  };
}

/** Names a cell by its row and column; an axis with no names is left out. */
function describeCell(
  o: UseOrganizerGridDragOptions,
  cell: OrganizerDropCoordinates,
): string {
  const named: string[] = [];
  if (o.rows.axis !== "none") named.push(`row ${labelOf(o.rows, cell.rowKey)}`);
  if (o.columns.axis !== "order") {
    named.push(`column ${labelOf(o.columns, cell.columnKey)}`);
  }
  return named.length > 0 ? named.join(", ") : "the list";
}

function resolveOrder(
  o: UseOrganizerGridDragOptions,
  active: OrganizerDropCoordinates & { cardId: string },
  overCard: (OrganizerDropCoordinates & { cardId: string }) | null,
  overCell: OrganizerDropCoordinates,
  cellLabel: string,
): Resolved {
  if (!o.orderDrop) return { kind: "refused", message: UNMOVABLE };
  const result = resolveOrderDrop({
    source: o.orderDrop.source,
    filterActive: o.orderDrop.filterActive,
    siblingIds: o.orderDrop.siblingIds,
    activeCardId: active.cardId,
    activeRowKey: active.rowKey,
    overRowKey: overCell.rowKey,
    rowCardIds: o.orderDrop.getRowCardIds(active.rowKey),
    overCardId: overCard ? overCard.cardId : null,
  });
  if (result.kind === "noop") return { kind: "noop" };
  if (result.kind === "refused")
    return { kind: "refused", message: result.message };
  return { kind: "order", newChildIds: result.newChildIds, cellLabel };
}
