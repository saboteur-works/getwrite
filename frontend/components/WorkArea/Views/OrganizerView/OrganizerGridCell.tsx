import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { OrganizerGridPlacement } from "../../../../src/lib/models/organizer-grid-types";

/**
 * @module OrganizerGridCell
 * One `gridcell` of the Organizer grid (Feature 109, FR-5, FR-11). Presentational:
 * it holds no drag state. A drag layer attaches by wrapping this component
 * (a component that calls `useDroppable` and passes `droppableRef` and
 * `isOver` through) and by rendering each placement through the grid's
 * `renderCard`. Roving tabindex: the active cell is the one tab stop, and the
 * buttons inside the other cells are taken out of tab order.
 */

const SEPARATOR = "␟";

/** Droppable id of the cell at a row and column key. */
export function organizerCellId(rowKey: string, columnKey: string): string {
  return `cell${SEPARATOR}${rowKey}${SEPARATOR}${columnKey}`;
}

/** Sortable id of one appearance of a card; unique per cell, since a card may sit in several. */
export function organizerPlacementId(
  cardId: string,
  rowKey: string,
  columnKey: string,
): string {
  return `card${SEPARATOR}${cardId}${SEPARATOR}${rowKey}${SEPARATOR}${columnKey}`;
}

export interface OrganizerGridCellProps {
  rowKey: string;
  columnKey: string;
  /** Row heading text, used in the cell's accessible name. */
  rowLabel: string;
  /** Column heading text, used in the cell's accessible name. */
  columnLabel: string;
  /** Droppable id for the drag layer (see {@link organizerCellId}). */
  droppableId: string;
  /** False for "Other values" lines and a reference with no id: a drop here is refused. */
  isDropTarget: boolean;
  /** Whether this is the one cell with `tabIndex` 0. */
  isActive: boolean;
  /** True while a drag is over the cell; set by the drag layer. */
  isOver?: boolean;
  /** Ref callback for the cell element, typically `useDroppable().setNodeRef`. */
  droppableRef?: (element: HTMLElement | null) => void;
  /** Called when the cell receives focus, so the grid can move the tab stop. */
  onFocusCell: (rowKey: string, columnKey: string) => void;
  /** Called on Enter on the cell itself, with the first placement; not called for an empty cell. */
  onActivate?: (placement: OrganizerGridPlacement) => void;
  placements: readonly OrganizerGridPlacement[];
  renderPlacement: (placement: OrganizerGridPlacement) => ReactNode;
}

const ROVED_ATTR = "data-roved-tabindex";

/** Takes the cell's inner buttons out of tab order unless the cell is active. */
function syncInnerTabStops(cell: HTMLElement, isActive: boolean): void {
  for (const el of Array.from(cell.querySelectorAll<HTMLElement>("button"))) {
    if (!isActive) {
      if (!el.hasAttribute(ROVED_ATTR)) {
        el.setAttribute(ROVED_ATTR, el.getAttribute("tabindex") ?? "");
      }
      el.tabIndex = -1;
    } else if (el.hasAttribute(ROVED_ATTR)) {
      const original = el.getAttribute(ROVED_ATTR) ?? "";
      el.removeAttribute(ROVED_ATTR);
      if (original === "") el.removeAttribute("tabindex");
      else el.setAttribute("tabindex", original);
    }
  }
}

function describeCell(
  rowLabel: string,
  columnLabel: string,
  count: number,
): string {
  const contents =
    count === 0 ? "empty" : `${count} ${count === 1 ? "card" : "cards"}`;
  return `${rowLabel}, ${columnLabel}, ${contents}`;
}

/** A droppable `gridcell` showing its placements, or an empty-cell text. */
export default function OrganizerGridCell({
  rowKey,
  columnKey,
  rowLabel,
  columnLabel,
  droppableId,
  isDropTarget,
  isActive,
  isOver = false,
  droppableRef,
  onFocusCell,
  onActivate,
  placements,
  renderPlacement,
}: OrganizerGridCellProps): JSX.Element {
  const elementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (elementRef.current) syncInnerTabStops(elementRef.current, isActive);
  });

  const setRef = (element: HTMLDivElement | null): void => {
    elementRef.current = element;
    droppableRef?.(element);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Enter" || event.target !== event.currentTarget) return;
    const first = placements[0];
    if (first && onActivate) {
      event.preventDefault();
      onActivate(first);
    }
  };

  return (
    <div
      ref={setRef}
      role="gridcell"
      tabIndex={isActive ? 0 : -1}
      aria-label={describeCell(rowLabel, columnLabel, placements.length)}
      data-cell-id={droppableId}
      data-row-key={rowKey}
      data-column-key={columnKey}
      data-drop-target={isDropTarget ? "true" : "false"}
      data-over={isOver ? "true" : "false"}
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          onFocusCell(rowKey, columnKey);
        }
      }}
      onKeyDown={onKeyDown}
      className={`flex flex-col gap-2 p-2 min-h-24 border border-gw-border text-gw-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-gw-primary${
        isOver ? " bg-gw-chrome2 border-dashed" : ""
      }`}
    >
      {placements.length === 0 ? (
        <p className="text-xs text-gw-secondary">
          {isDropTarget ? "No documents" : "No documents, cannot drop here"}
        </p>
      ) : (
        placements.map((placement) => (
          <div
            key={organizerPlacementId(
              placement.cardId,
              placement.rowKey,
              placement.columnKey,
            )}
          >
            {renderPlacement(placement)}
          </div>
        ))
      )}
    </div>
  );
}
