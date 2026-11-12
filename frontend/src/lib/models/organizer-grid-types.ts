/**
 * @module organizer-grid-types
 *
 * Contract for the Organizer grid (Feature 109, FR-5, FR-7, FR-14, FR-20):
 * axes, sources, arrangements, grid cells and placements, axis value lists,
 * the field-write operation and the arrangement operations. Types and
 * constants only: no behaviour, no React, no JSX, no JSON, no `node:*`, so it
 * is reachable from `core.ts`, the CLI and the Electron workers.
 *
 * Record shapes follow OQ-2 of `specs/features/organizer-grid.md`.
 */
import type { MetadataValue } from "./types";

/** Most arrangements one project may hold; over it is refused, never truncated (OQ-2). */
export const ORGANIZER_ARRANGEMENT_LIMIT = 50;

/** Shortest arrangement name after trim (OQ-2). */
export const ORGANIZER_ARRANGEMENT_NAME_MIN_LENGTH = 1;

/** Longest arrangement name after trim (OQ-2). */
export const ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH = 100;

// ---------------------------------------------------------------------------
// Axes, sources, arrangements (FR-14, OQ-2)
// ---------------------------------------------------------------------------

/** Axis spelled as stored: the two plain words, or an object for a field. */
export type OrganizerAxis =
  | "none"
  | "order"
  | { kind: "status" }
  | { kind: "subtype" }
  | { kind: "field"; key: string };

/** Whether a folder source lists direct children or all descendants. */
export type OrganizerFolderScope = "children" | "descendants";

/** Where the grid's cards come from. */
export type OrganizerSource =
  | { kind: "folder"; folderId: string; scope: OrganizerFolderScope }
  | { kind: "smart-folder"; queryId: string };

/** A saved arrangement: source, rows and columns, no filters (OQ-203). */
export interface OrganizerArrangement {
  /** UUID. */
  id: string;
  /** Trimmed, 1 to 100 characters, unique under trim and case-fold. */
  name: string;
  source: OrganizerSource;
  rows: OrganizerAxis;
  columns: OrganizerAxis;
}

/** Why a saved arrangement cannot be applied (FR-15, OQ-2). */
export type OrganizerUnavailableReason =
  | "folder-missing"
  | "query-missing"
  | "field-missing"
  | "field-not-axis-type"
  | "axis-not-allowed";

/** Availability of a saved arrangement; `pending` while inputs still load. */
export type OrganizerArrangementAvailability =
  | { status: "available" }
  | { status: "pending" }
  | {
      status: "unavailable";
      reason: OrganizerUnavailableReason;
      message: string;
    };

// ---------------------------------------------------------------------------
// Axis value lists (FR-4, OQ-10, OQ-16)
// ---------------------------------------------------------------------------

/**
 * One line of an axis: a value from the field's own list, the "Other values"
 * line, or the "None" line. Order is list values, then other, then none.
 */
type OrganizerAxisValueKind = "value" | "other" | "none";

export interface OrganizerAxisValue {
  /** Stable key within the axis (the value, a reference id, `other`, `none`). */
  key: string;
  kind: OrganizerAxisValueKind;
  /** Heading text naming the value (never colour alone). */
  label: string;
  /** False for "Other values" and for a reference with a null id (OQ-16, OQ-217). */
  isDropTarget: boolean;
  /** The value a drop here writes; absent for `other` and `none`. */
  value?: MetadataValue;
}

/** The ordered lines of one axis. */
export interface OrganizerAxisValueList {
  axis: OrganizerAxis;
  values: OrganizerAxisValue[];
}

// ---------------------------------------------------------------------------
// Grid cells and placements (FR-5)
// ---------------------------------------------------------------------------

/** A card as the grid model sees it; documents and (children source) folders. */
export interface OrganizerGridCard {
  id: string;
  kind: "resource" | "folder";
}

/** One appearance of a card in one cell. */
export interface OrganizerGridPlacement {
  cardId: string;
  rowKey: string;
  columnKey: string;
  /** 0 for the first appearance in tree order, 1.. for later ones. */
  appearance: number;
  /** Number of other cells holding the same card, for "also in N other cells". */
  alsoInOtherCells: number;
}

/** A cell: its coordinates and the cards in it, in tree order. */
export interface OrganizerGridCell {
  rowKey: string;
  columnKey: string;
  placements: OrganizerGridPlacement[];
}

/** The placed grid: axis lines, cells and the cap report. */
export interface OrganizerGridModel {
  rows: OrganizerAxisValue[];
  columns: OrganizerAxisValue[];
  cells: OrganizerGridCell[];
  /** Cards shown, counted as cards and not appearances (FR-12). */
  shownCardCount: number;
  /** Cards past the cap, in tree order; 0 when none or no cap is set. */
  notShownCount: number;
}

// ---------------------------------------------------------------------------
// Field write (FR-7, FR-8, OQ-6, OQ-19)
// ---------------------------------------------------------------------------

/** Which stored location a field write targets. */
export type OrganizerFieldTarget =
  | { kind: "status" }
  | { kind: "subtype" }
  | { kind: "field"; key: string };

/** One change: set a value, or clear (status key removed, subtype cleared). */
export type OrganizerFieldChange =
  | { target: OrganizerFieldTarget; op: "set"; value: MetadataValue }
  | { target: OrganizerFieldTarget; op: "clear" };

/** One write for one resource; a two-field drop is one input with two changes. */
export interface OrganizerFieldWriteInput {
  resourceId: string;
  changes: OrganizerFieldChange[];
}

/** Why a field write was refused. */
export type OrganizerFieldWriteRefusalReason =
  | "invalid-input"
  | "unknown-field"
  | "value-not-in-list"
  | "subtype-not-in-list"
  | "field-out-of-subtype-scope"
  | "field-locked"
  | "max-selections-exceeded";

/** Outcome of a field write; a refusal carries text that echoes no client input. */
export type OrganizerFieldWriteResult =
  | { ok: true; resourceId: string }
  | { ok: false; reason: OrganizerFieldWriteRefusalReason; message: string };

// ---------------------------------------------------------------------------
// Arrangement operations (FR-14, OQ-3)
// ---------------------------------------------------------------------------

/** The writable part of an arrangement (no id; the core makes one). */
export interface OrganizerArrangementDraft {
  name: string;
  source: OrganizerSource;
  rows: OrganizerAxis;
  columns: OrganizerAxis;
}

export type OrganizerArrangementAddInput = OrganizerArrangementDraft;

export interface OrganizerArrangementRenameInput {
  id: string;
  name: string;
}

export interface OrganizerArrangementDeleteInput {
  id: string;
}

/** Why an arrangement operation was refused. */
export type OrganizerArrangementRefusalReason =
  | "name-blank"
  | "name-too-long"
  | "name-duplicate"
  | "limit-reached"
  | "invalid-source"
  | "invalid-axis"
  | "invalid-id"
  | "not-found"
  | "invalid-input";

/** Outcome of add, rename or delete; the refusal message echoes no input. */
export type OrganizerArrangementResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: OrganizerArrangementRefusalReason; message: string };

export type OrganizerArrangementAddResult = OrganizerArrangementResult<{
  id: string;
}>;
export type OrganizerArrangementRenameResult = OrganizerArrangementResult<{
  id: string;
}>;
export type OrganizerArrangementDeleteResult = OrganizerArrangementResult<{
  id: string;
}>;

/** The operation dispatched through the one arrangements route. */
export type OrganizerArrangementOperation =
  | ({ op: "add" } & OrganizerArrangementAddInput)
  | ({ op: "rename" } & OrganizerArrangementRenameInput)
  | ({ op: "delete" } & OrganizerArrangementDeleteInput);
