import { useCallback, useRef, useState } from "react";
import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import type { AnyResource } from "../../../../src/lib/models/types";
import type { OrganizerGridPlacement } from "../../../../src/lib/models/organizer-grid-types";
import OrganizerCard, { type OrganizerCardProps } from "./OrganizerCard";
import OrganizerGridCell, {
  organizerCellId,
  organizerPlacementId,
  type OrganizerGridCellProps,
} from "./OrganizerGridCell";
import type { OrganizerGridResult } from "./organizerGridModel";

/**
 * @module OrganizerGrid
 * The Organizer grid matrix (Feature 109, FR-5, FR-11): an ARIA `grid` of
 * column headings, row headings and droppable cells holding `OrganizerCard`s,
 * fed by the output of `buildOrganizerGridModel`. Presentational.
 *
 * Drag wiring (Tasks 20 and 22) attaches through two props: `CellComponent`
 * replaces the cell (a wrapper calls `useDroppable` and renders
 * `OrganizerGridCell` with `droppableRef` and `isOver`), and `renderCard`
 * replaces the card (a wrapper calls `useSortable` with `sortableId` and
 * renders `OrganizerCard` with the sortable props).
 */

/** Everything `renderCard` needs for one appearance of a card in a cell. */
export interface OrganizerGridCardInfo {
  cardId: string;
  placement: OrganizerGridPlacement;
  /** Unique per appearance; the id a sortable uses. */
  sortableId: string;
  /** Droppable id of the cell holding this appearance. */
  cellId: string;
  resource: AnyResource;
  /** Props for the stock card: body, open, select, folder subtype. */
  cardProps: Partial<OrganizerCardProps>;
  /** `also in N other cells`, or `null` when the card sits in one cell. */
  alsoInOtherCellsText: string | null;
}

export interface OrganizerGridProps {
  model: OrganizerGridResult;
  /** Resources and folders by card id. */
  resources: ReadonlyMap<string, AnyResource>;
  /** Card props per card id (body, `onOpen`, `onSelect`, `isSelected`, `folderSubtype`). */
  getCardProps: (cardId: string) => Partial<OrganizerCardProps>;
  /** Replaces the whole card node, including its duplicate note. */
  renderCard?: (info: OrganizerGridCardInfo) => ReactNode;
  /** Replaces the cell; must render `OrganizerGridCell` with the props it is given. */
  CellComponent?: ComponentType<OrganizerGridCellProps>;
  /** Accessible name of the grid. */
  label?: string;
}

const ROW_HEADER_WIDTH = "8rem";
const COLUMN_MIN_WIDTH = "14rem";

export function alsoInOtherCellsText(count: number): string | null {
  if (count <= 0) return null;
  return `also in ${count} other ${count === 1 ? "cell" : "cells"}`;
}

function DefaultCard({ info }: { info: OrganizerGridCardInfo }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <OrganizerCard resource={info.resource} {...info.cardProps} />
      {info.alsoInOtherCellsText && (
        <p className="text-xs text-gw-secondary">{info.alsoInOtherCellsText}</p>
      )}
    </div>
  );
}

type Coord = { row: number; column: number };

/** The coordinate an arrow, Home or End key moves to, clamped at the edges. */
function nextCoord(
  key: string,
  at: Coord,
  rowCount: number,
  columnCount: number,
): Coord | null {
  switch (key) {
    case "ArrowRight":
      return { ...at, column: Math.min(columnCount - 1, at.column + 1) };
    case "ArrowLeft":
      return { ...at, column: Math.max(0, at.column - 1) };
    case "ArrowDown":
      return { ...at, row: Math.min(rowCount - 1, at.row + 1) };
    case "ArrowUp":
      return { ...at, row: Math.max(0, at.row - 1) };
    case "Home":
      return { ...at, column: 0 };
    case "End":
      return { ...at, column: columnCount - 1 };
    default:
      return null;
  }
}

/** The Organizer grid matrix. */
export default function OrganizerGrid({
  model,
  resources,
  getCardProps,
  renderCard,
  CellComponent = OrganizerGridCell,
  label = "Organizer grid",
}: OrganizerGridProps): JSX.Element {
  const { rows, columns, cells } = model;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<Coord>({ row: 0, column: 0 });
  const safe: Coord = {
    row: Math.min(active.row, Math.max(0, rows.length - 1)),
    column: Math.min(active.column, Math.max(0, columns.length - 1)),
  };

  const cellAt = useCallback(
    (rowKey: string, columnKey: string) =>
      cells.find((c) => c.rowKey === rowKey && c.columnKey === columnKey),
    [cells],
  );

  const onFocusCell = useCallback(
    (rowKey: string, columnKey: string): void => {
      const row = rows.findIndex((r) => r.key === rowKey);
      const column = columns.findIndex((c) => c.key === columnKey);
      if (row >= 0 && column >= 0) setActive({ row, column });
    },
    [rows, columns],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute("role") !== "gridcell") return;
    const to = nextCoord(event.key, safe, rows.length, columns.length);
    if (!to) return;
    event.preventDefault();
    const id = organizerCellId(rows[to.row].key, columns[to.column].key);
    const next = Array.from(
      gridRef.current?.querySelectorAll<HTMLElement>("[data-cell-id]") ?? [],
    ).find((el) => el.dataset.cellId === id);
    setActive(to);
    next?.focus();
  };

  const placementNode = (
    rowKey: string,
    columnKey: string,
    placement: OrganizerGridPlacement,
  ): ReactNode => {
    const resource = resources.get(placement.cardId);
    if (!resource) {
      return (
        <p className="text-xs text-gw-secondary">
          A document in this cell is no longer available.
        </p>
      );
    }
    const info: OrganizerGridCardInfo = {
      cardId: placement.cardId,
      placement,
      sortableId: organizerPlacementId(placement.cardId, rowKey, columnKey),
      cellId: organizerCellId(rowKey, columnKey),
      resource,
      cardProps: getCardProps(placement.cardId),
      // FR-5: the first appearance (reading order) is unmarked; each later
      // one says how many other cells hold the same document.
      alsoInOtherCellsText: alsoInOtherCellsText(
        placement.appearance === 0 ? 0 : placement.alsoInOtherCells,
      ),
    };
    return renderCard ? renderCard(info) : <DefaultCard info={info} />;
  };

  const template = `${ROW_HEADER_WIDTH} repeat(${columns.length}, minmax(${COLUMN_MIN_WIDTH}, 1fr))`;
  const rowStyle = { display: "grid", gridTemplateColumns: template };

  return (
    <div className="overflow-x-auto">
      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length + 1}
        onKeyDown={onKeyDown}
        style={{
          minWidth: `calc(${ROW_HEADER_WIDTH} + ${columns.length} * ${COLUMN_MIN_WIDTH})`,
        }}
      >
        <div role="row" style={rowStyle}>
          <div
            role="columnheader"
            className="p-2 text-xs text-gw-secondary border border-gw-border"
          >
            <span className="sr-only">Rows</span>
          </div>
          {columns.map((column) => (
            <div
              key={column.key}
              role="columnheader"
              className="p-2 text-sm font-medium text-gw-primary border border-gw-border bg-gw-chrome"
            >
              {column.label}
            </div>
          ))}
        </div>
        {rows.map((row, r) => (
          <div key={row.key} role="row" style={rowStyle}>
            <div
              role="rowheader"
              className="p-2 text-sm font-medium text-gw-primary border border-gw-border bg-gw-chrome"
            >
              {row.label}
            </div>
            {columns.map((column, c) => (
              <CellComponent
                key={column.key}
                rowKey={row.key}
                columnKey={column.key}
                rowLabel={row.label}
                columnLabel={column.label}
                droppableId={organizerCellId(row.key, column.key)}
                isDropTarget={row.isDropTarget && column.isDropTarget}
                isActive={r === safe.row && c === safe.column}
                onFocusCell={onFocusCell}
                onActivate={(placement) =>
                  getCardProps(placement.cardId).onOpen?.()
                }
                placements={cellAt(row.key, column.key)?.placements ?? []}
                renderPlacement={(placement) =>
                  placementNode(row.key, column.key, placement)
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
