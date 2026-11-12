/**
 * @module organizerOrderDrop
 * Pure model for a drop in the Organizer grid when rows are a field and
 * columns are "order" (Feature 109, FR-9, OQ-15). It maps the drop onto the
 * full, unfiltered sibling order of the browsed folder, in the shape the
 * function returned by `useOrganizerCardReorder` takes (`newChildIds`), or
 * returns a refusal with the text to show. It writes nothing and imports no
 * React, Redux or `@dnd-kit`.
 *
 * Mapping: the row band shows a subsequence of the siblings. The band's new
 * order (the dragged card moved to the drop target's place, as `arrayMove`
 * does) is written back into the slots the band's cards held in the full
 * order; siblings outside the band keep their slots.
 */
import type { OrganizerFolderScope } from "../../../../src/lib/models/organizer-grid-types";

/** Shown while any filter is active (same text the Organizer shows today). */
export const ORGANIZER_FILTER_ACTIVE_REASON = "Clear filters to reorder cards";

/** Shown for a drop into another row: order never sets the row field. */
export const ORGANIZER_ORDER_USE_FIELD_DRAG_MESSAGE =
  "Use a field drag to change a card's row. Dropping on order only reorders within a row.";

/** Shown for a drop among another folder's cards. */
export const ORGANIZER_ORDER_USE_TREE_MESSAGE =
  "Moving a document between folders is done in the tree.";

/** Shown when the grid lists the descendants of a folder. */
export const ORGANIZER_ORDER_FLATTENED_REASON =
  "Cards from several folders are shown together, so they cannot be reordered here. Reorder in the tree.";

/** Shown when the source is a smart folder. */
export const ORGANIZER_ORDER_SMART_FOLDER_REASON =
  "A smart folder can hold cards from several folders, so they cannot be reordered here. Reorder in the tree.";

const INVALID_INPUT_MESSAGE = "This card could not be reordered.";

export type OrderDropSource =
  | { kind: "folder"; scope: OrganizerFolderScope }
  | { kind: "smart-folder" };

export interface OrderDropInput {
  source: OrderDropSource;
  /** True while any Organizer filter is active. */
  filterActive: boolean;
  /** Full unfiltered direct children of the browsed folder, in order. */
  siblingIds: readonly string[];
  activeCardId: string;
  activeRowKey: string;
  /** Row of the drop target. */
  overRowKey: string;
  /** Cards of the active card's row band, in the order shown. */
  rowCardIds: readonly string[];
  /** Card dropped on; null when dropped on no card. */
  overCardId: string | null;
}

export type OrderDropRefusalReason =
  | "filter-active"
  | "flattened-source"
  | "smart-folder-source"
  | "other-row"
  | "other-folder"
  | "invalid-input";

export type OrderDropResult =
  | { kind: "reorder"; newChildIds: string[] }
  | { kind: "noop" }
  | { kind: "refused"; reason: OrderDropRefusalReason; message: string };

function refuse(
  reason: OrderDropRefusalReason,
  message: string,
): OrderDropResult {
  return { kind: "refused", reason, message };
}

function hasDuplicates(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

function moveWithin(
  ids: readonly string[],
  from: number,
  to: number,
): string[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Refusals that depend on the source and filters alone, before any position. */
function refusalForSource(input: OrderDropInput): OrderDropResult | null {
  if (input.source.kind === "smart-folder") {
    return refuse("smart-folder-source", ORGANIZER_ORDER_SMART_FOLDER_REASON);
  }
  if (input.source.scope === "descendants") {
    return refuse("flattened-source", ORGANIZER_ORDER_FLATTENED_REASON);
  }
  if (input.filterActive) {
    return refuse("filter-active", ORGANIZER_FILTER_ACTIVE_REASON);
  }
  return null;
}

/**
 * Resolves a drop in an order-column layout. Refusals are checked in this
 * order: source, filter, malformed input, other row, other folder.
 */
export function resolveOrderDrop(input: OrderDropInput): OrderDropResult {
  const sourceRefusal = refusalForSource(input);
  if (sourceRefusal) return sourceRefusal;

  const { siblingIds, rowCardIds, activeCardId, overCardId } = input;
  if (hasDuplicates(siblingIds) || hasDuplicates(rowCardIds)) {
    return refuse("invalid-input", INVALID_INPUT_MESSAGE);
  }
  const from = rowCardIds.indexOf(activeCardId);
  if (from === -1) return refuse("invalid-input", INVALID_INPUT_MESSAGE);

  if (input.overRowKey !== input.activeRowKey) {
    return refuse("other-row", ORGANIZER_ORDER_USE_FIELD_DRAG_MESSAGE);
  }

  const siblingSet = new Set(siblingIds);
  if (!siblingSet.has(activeCardId)) {
    return refuse("other-folder", ORGANIZER_ORDER_USE_TREE_MESSAGE);
  }
  if (overCardId === null || overCardId === activeCardId) {
    return { kind: "noop" };
  }
  if (!siblingSet.has(overCardId)) {
    return refuse("other-folder", ORGANIZER_ORDER_USE_TREE_MESSAGE);
  }
  const to = rowCardIds.indexOf(overCardId);
  if (to === -1 || rowCardIds.some((id) => !siblingSet.has(id))) {
    return refuse("invalid-input", INVALID_INPUT_MESSAGE);
  }

  const newBand = moveWithin(rowCardIds, from, to);
  const bandSet = new Set(rowCardIds);
  let next = 0;
  const newChildIds = siblingIds.map((id) =>
    bandSet.has(id) ? newBand[next++] : id,
  );
  return { kind: "reorder", newChildIds };
}
