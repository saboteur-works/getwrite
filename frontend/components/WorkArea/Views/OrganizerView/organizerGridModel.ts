import { normalizeSubtypeLabel } from "../../../../src/lib/models/field-subtype-scope";
import type {
  OrganizerAxis,
  OrganizerAxisValue,
  OrganizerAxisValueList,
  OrganizerGridCard,
  OrganizerGridCell,
  OrganizerGridModel,
  OrganizerGridPlacement,
} from "../../../../src/lib/models/organizer-grid-types";
import type { MetadataValue } from "../../../../src/lib/models/types";
import { applyCardCap } from "./organizerGridCap";

/**
 * @module organizerGridModel
 * Pure placement model for the Organizer grid (Feature 109, FR-2, FR-5, FR-10,
 * FR-12): puts cards into cells by their field values and the axis value
 * lists, with the "None" line always last, one "Other values" line before it,
 * a card with several values in every matching cell, the card cap, and the
 * phone grouping. No React, Redux or `@dnd-kit` import. The axis value lists
 * are an input (they are produced elsewhere), and the cap is a parameter.
 */

/** Key of the single row or column of an axis that is `none` (rows) or `order` (columns). */
export const ORGANIZER_ALL_ROWS_KEY = "all";
export const ORGANIZER_ORDER_COLUMN_KEY = "order";

const OTHER_KEY = "other";
const NONE_KEY = "none";
const OTHER_LABEL = "Other values";
const NONE_LABEL = "None";

/** One axis as the model reads it. */
export interface OrganizerGridAxisInput {
  axis: OrganizerAxis;
  /** The axis lines; required for status, subtype and field axes, `null` for `none` and `order`. */
  list: OrganizerAxisValueList | null;
  /** Raw stored value per card id; an absent or blank entry places the card in None. */
  values: ReadonlyMap<string, MetadataValue | undefined>;
}

export interface OrganizerGridInput {
  /** Cards in tree order. */
  cards: readonly OrganizerGridCard[];
  rows: OrganizerGridAxisInput;
  columns: OrganizerGridAxisInput;
  /** Card cap, or `null` for none; a bad figure throws (see `applyCardCap`). */
  cap: number | null;
}

/** The placed grid plus what the layout needs beyond the shared contract type. */
export interface OrganizerGridResult extends OrganizerGridModel {
  /** Rows none and columns order: the one cell is one sequence in tree order. */
  isSingleSequence: boolean;
  /** Whether the columns carry values a phone card should name. */
  hasColumnValues: boolean;
  /** Ids of the shown cards in tree order. */
  shownCardIds: string[];
}

const isFieldLike = (axis: OrganizerAxis): boolean => typeof axis !== "string";

function singleLine(key: string, label: string): OrganizerAxisValue {
  return { key, kind: "value", label, isDropTarget: false };
}

/** Lines of one axis: list values, then Other values (only if a shown card uses it), then None. */
function buildAxisLines(
  input: OrganizerGridAxisInput,
  otherUsed: boolean,
): OrganizerAxisValue[] {
  const { axis, list } = input;
  if (axis === "none") return [singleLine(ORGANIZER_ALL_ROWS_KEY, "All")];
  if (axis === "order") {
    return [singleLine(ORGANIZER_ORDER_COLUMN_KEY, "Document order")];
  }
  if (list === null) {
    throw new RangeError("a field axis needs its value list");
  }
  const values = list.values.filter((v) => v.kind === "value");
  const listedOther = list.values.find((v) => v.kind === "other");
  const lines = [...values];
  // Shown only when a shown card has an off-list value; a list that carries
  // an Other entry (the wired view's does) only supplies its label.
  if (otherUsed) {
    lines.push({
      key: OTHER_KEY,
      kind: "other",
      label: listedOther?.label ?? OTHER_LABEL,
      isDropTarget: false,
    });
  }
  const listedNone = list.values.find((v) => v.kind === "none");
  lines.push(
    listedNone ?? {
      key: NONE_KEY,
      kind: "none",
      label: NONE_LABEL,
      isDropTarget: true,
    },
  );
  return lines;
}

/** Tokens a stored value names; `null` entries are values no list can match. */
function tokensOf(value: MetadataValue | undefined): (string | null)[] {
  if (value === undefined || value === null) return [];
  const items: MetadataValue[] = Array.isArray(value)
    ? (value as MetadataValue[])
    : [value];
  const tokens: (string | null)[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      if (item.trim() !== "") tokens.push(item);
    } else if (typeof item === "number" || typeof item === "boolean") {
      tokens.push(String(item));
    } else if (item !== null && typeof item === "object" && "id" in item) {
      const id = (item as { id: unknown }).id;
      tokens.push(typeof id === "string" && id !== "" ? id : null);
    } else if (item !== null) {
      tokens.push(null);
    }
  }
  return tokens;
}

/** The line keys of one card on one axis (never empty). */
function lineKeysFor(
  input: OrganizerGridAxisInput,
  lines: readonly OrganizerAxisValue[],
  cardId: string,
): string[] {
  if (input.axis === "none") return [ORGANIZER_ALL_ROWS_KEY];
  if (input.axis === "order") return [ORGANIZER_ORDER_COLUMN_KEY];
  const isSubtype =
    typeof input.axis !== "string" && input.axis.kind === "subtype";
  const norm = (s: string): string =>
    isSubtype ? normalizeSubtypeLabel(s) : s;
  const tokens = tokensOf(input.values.get(cardId));
  if (tokens.length === 0) return [NONE_KEY];
  const keys = new Set<string>();
  for (const token of tokens) {
    const match =
      token === null
        ? undefined
        : lines.find((l) => l.kind === "value" && norm(l.key) === norm(token));
    keys.add(match ? match.key : OTHER_KEY);
  }
  return [...keys];
}

/** Whether any shown card lands in Other values on this axis. */
function needsOther(
  input: OrganizerGridAxisInput,
  cards: readonly OrganizerGridCard[],
): boolean {
  if (!isFieldLike(input.axis) || input.list === null) return false;
  const lines = input.list.values.filter((v) => v.kind === "value");
  return cards.some((c) => lineKeysFor(input, lines, c.id).includes(OTHER_KEY));
}

const cellKey = (r: string, c: string): string => `${r}\u0000${c}`;

/**
 * Places the cards (after the cap, in tree order) into the grid. Every
 * row-by-column cell exists, empty or not. A card is counted once however many
 * cells hold it; each of its placements says how many other cells hold it.
 */
export function buildOrganizerGridModel(
  input: OrganizerGridInput,
): OrganizerGridResult {
  const { shown, notShown } = applyCardCap(input.cards.length, input.cap);
  const cards = input.cards.slice(0, shown);
  const rows = buildAxisLines(input.rows, needsOther(input.rows, cards));
  const columns = buildAxisLines(
    input.columns,
    needsOther(input.columns, cards),
  );
  const rowValueLines = rows.filter((l) => l.kind === "value");
  const colValueLines = columns.filter((l) => l.kind === "value");

  const cellMap = new Map<string, OrganizerGridCell>();
  const cells: OrganizerGridCell[] = [];
  for (const r of rows) {
    for (const c of columns) {
      const cell: OrganizerGridCell = {
        rowKey: r.key,
        columnKey: c.key,
        placements: [],
      };
      cellMap.set(cellKey(r.key, c.key), cell);
      cells.push(cell);
    }
  }

  const rowIndex = new Map(rows.map((r, i) => [r.key, i]));
  const colIndex = new Map(columns.map((c, i) => [c.key, i]));
  for (const card of cards) {
    const rowKeys = lineKeysFor(input.rows, rowValueLines, card.id);
    const colKeys = lineKeysFor(input.columns, colValueLines, card.id);
    const coords = rowKeys
      .flatMap((r) => colKeys.map((c) => ({ r, c })))
      .sort(
        (x, y) =>
          (rowIndex.get(x.r) ?? 0) - (rowIndex.get(y.r) ?? 0) ||
          (colIndex.get(x.c) ?? 0) - (colIndex.get(y.c) ?? 0),
      );
    coords.forEach(({ r, c }, appearance) => {
      const placement: OrganizerGridPlacement = {
        cardId: card.id,
        rowKey: r,
        columnKey: c,
        appearance,
        alsoInOtherCells: coords.length - 1,
      };
      cellMap.get(cellKey(r, c))?.placements.push(placement);
    });
  }

  return {
    rows,
    columns,
    cells,
    shownCardCount: shown,
    notShownCount: notShown,
    isSingleSequence:
      input.rows.axis === "none" && input.columns.axis === "order",
    hasColumnValues: isFieldLike(input.columns.axis),
    shownCardIds: cards.map((c) => c.id),
  };
}

// ---------------------------------------------------------------------------
// Phone grouping (FR-10)
// ---------------------------------------------------------------------------

/** One card in one phone group. */
export interface OrganizerPhoneGroupCard {
  cardId: string;
  /** Text naming the card's column value or values in this group; empty when columns carry none. */
  columnLabels: string[];
  /** 0 in the first group holding the card, 1.. in later ones. */
  appearance: number;
  /** Number of other groups holding the same card. */
  alsoInOtherGroups: number;
}

/** One group per row value; empty groups are kept. */
export interface OrganizerPhoneGroup {
  rowKey: string;
  label: string;
  kind: OrganizerAxisValue["kind"];
  cards: OrganizerPhoneGroupCard[];
}

/** Builds the phone grouped lists from a placed grid; no card is dropped. */
export function buildOrganizerPhoneGroups(
  model: OrganizerGridResult,
): OrganizerPhoneGroup[] {
  const columnLabel = new Map(model.columns.map((c) => [c.key, c.label]));
  const order = new Map(model.shownCardIds.map((id, i) => [id, i]));
  const perRow = model.rows.map((row) => {
    const byCard = new Map<string, string[]>();
    for (const cell of model.cells) {
      if (cell.rowKey !== row.key) continue;
      for (const p of cell.placements) {
        const labels = byCard.get(p.cardId) ?? [];
        labels.push(columnLabel.get(p.columnKey) ?? p.columnKey);
        byCard.set(p.cardId, labels);
      }
    }
    return { row, byCard };
  });
  const groupsHolding = new Map<string, number>();
  for (const { byCard } of perRow) {
    for (const id of byCard.keys()) {
      groupsHolding.set(id, (groupsHolding.get(id) ?? 0) + 1);
    }
  }
  const seen = new Map<string, number>();
  return perRow.map(({ row, byCard }) => {
    const ids = [...byCard.keys()].sort(
      (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0),
    );
    const cards = ids.map((cardId) => {
      const appearance = seen.get(cardId) ?? 0;
      seen.set(cardId, appearance + 1);
      return {
        cardId,
        columnLabels: model.hasColumnValues ? (byCard.get(cardId) ?? []) : [],
        appearance,
        alsoInOtherGroups: (groupsHolding.get(cardId) ?? 1) - 1,
      };
    });
    return { rowKey: row.key, label: row.label, kind: row.kind, cards };
  });
}
