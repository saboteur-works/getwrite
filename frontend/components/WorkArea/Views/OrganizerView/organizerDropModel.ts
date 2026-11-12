/**
 * @module organizerDropModel
 * Pure drop model for the Organizer grid (Feature 109, FR-7, FR-8; OQ-6,
 * OQ-7, OQ-19). Turns a drag from one cell to another into one field-write
 * payload, a no-op, or a refusal with a text reason. No React, Redux or
 * `@dnd-kit`; it reads nothing and writes nothing.
 *
 * Refusal messages are fixed text: they echo no value, label or key.
 */
import {
  isFieldVisibleForSubtype,
  isLabelInList,
  normalizeSubtypeLabel,
} from "../../../../src/lib/models/field-subtype-scope";
import type {
  OrganizerAxisValue,
  OrganizerAxisValueList,
  OrganizerFieldChange,
  OrganizerFieldTarget,
  OrganizerFieldWriteInput,
  OrganizerFieldWriteRefusalReason,
} from "../../../../src/lib/models/organizer-grid-types";
import type {
  MetadataField,
  MetadataValue,
  ResourceRef,
} from "../../../../src/lib/models/types";

/** A cell's coordinates: the line key of each axis. */
export interface OrganizerDropCoordinates {
  rowKey: string;
  columnKey: string;
}

/** The dragged card with the stored values the drop may change. */
export interface OrganizerDropCard {
  id: string;
  kind: "resource" | "folder";
  /** The card's own subtype, for the field scope check. */
  resourceSubtype?: string;
  /** Stored `userMetadata` (or a folder's field values). Never mutated. */
  userMetadata?: Readonly<Record<string, MetadataValue>>;
}

export interface OrganizerDropInput {
  card: OrganizerDropCard;
  from: OrganizerDropCoordinates;
  to: OrganizerDropCoordinates;
  rows: OrganizerAxisValueList;
  columns: OrganizerAxisValueList;
  /** Every field of the project schema. */
  fields: readonly MetadataField[];
  /** `config.statuses`. */
  statuses: readonly string[];
  /** `config.subtypes`. */
  subtypes: readonly string[];
}

/** The outcome of a drop. */
export type OrganizerDropPlan =
  | { kind: "noop" }
  | { kind: "write"; input: OrganizerFieldWriteInput }
  | {
      kind: "refused";
      reason: OrganizerFieldWriteRefusalReason;
      message: string;
    };

/** Locked built-in fields the sidebar gives a working control to. */
const SIDEBAR_EDITABLE_LOCKED_KEYS: ReadonlySet<string> = new Set([
  "status",
  "pov",
]);

const MESSAGES: Record<OrganizerFieldWriteRefusalReason, string> = {
  "invalid-input": "This drop cannot be applied to these rows and columns.",
  "unknown-field": "The field for this row or column no longer exists.",
  "value-not-in-list": "That row or column is not a value this field allows.",
  "subtype-not-in-list": "That subtype is not in the project's subtype list.",
  "field-out-of-subtype-scope":
    "This field does not apply to the document's subtype.",
  "field-locked": "This field cannot be edited here.",
  "max-selections-exceeded":
    "This field cannot hold more references than its limit.",
};

type AxisOutcome =
  | { kind: "unchanged" }
  | { kind: "change"; change: OrganizerFieldChange }
  | { kind: "refused"; reason: OrganizerFieldWriteRefusalReason };

const refuse = (reason: OrganizerFieldWriteRefusalReason): AxisOutcome => ({
  kind: "refused",
  reason,
});
const UNCHANGED: AxisOutcome = { kind: "unchanged" };

const isRef = (v: unknown): v is ResourceRef =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  "name" in v &&
  "id" in v;

const sameRef = (a: ResourceRef, b: ResourceRef): boolean => a.id === b.id;

/** Stored value read as a list of strings; anything else reads as empty. */
function storedStrings(value: MetadataValue | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return (value as unknown[]).filter(
      (v): v is string => typeof v === "string",
    );
  }
  return [];
}

/** Stored value read as a list of references; anything else reads as empty. */
function storedRefs(value: MetadataValue | undefined): ResourceRef[] {
  if (isRef(value)) return [value];
  if (Array.isArray(value)) return (value as unknown[]).filter(isRef);
  return [];
}

/** List values in `options` order, then values outside it in stored order. */
function inListOrder(values: string[], options: readonly string[]): string[] {
  const inList = options.filter((o) => values.includes(o));
  const rest = values.filter((v) => !options.includes(v));
  return [...inList, ...rest];
}

function findLine(
  list: OrganizerAxisValueList,
  key: string,
): OrganizerAxisValue | undefined {
  return list.values.find((v) => v.key === key);
}

function setOrClear(
  target: OrganizerFieldTarget,
  remaining: string[] | ResourceRef[],
): OrganizerFieldChange {
  return remaining.length === 0
    ? { target, op: "clear" }
    : { target, op: "set", value: remaining };
}

/** Resolves the target line, refusing a missing line, Other values and a non-target. */
function targetLine(
  list: OrganizerAxisValueList,
  key: string,
): OrganizerAxisValue | AxisOutcome {
  const line = findLine(list, key);
  if (!line || line.kind === "other" || !line.isDropTarget) {
    return refuse("value-not-in-list");
  }
  return line;
}

/** An axis line carries a `key`; an outcome never does. */
const isOutcome = (v: OrganizerAxisValue | AxisOutcome): v is AxisOutcome =>
  !("key" in v);

function statusOutcome(
  line: OrganizerAxisValue,
  statuses: readonly string[],
): AxisOutcome {
  const target: OrganizerFieldTarget = { kind: "status" };
  if (line.kind === "none")
    return { kind: "change", change: { target, op: "clear" } };
  const value = line.value;
  if (typeof value !== "string" || !statuses.includes(value)) {
    return refuse("value-not-in-list");
  }
  return { kind: "change", change: { target, op: "set", value } };
}

function subtypeOutcome(
  line: OrganizerAxisValue,
  subtypes: readonly string[],
): AxisOutcome {
  const target: OrganizerFieldTarget = { kind: "subtype" };
  if (line.kind === "none")
    return { kind: "change", change: { target, op: "clear" } };
  const value = line.value;
  if (typeof value !== "string" || !isLabelInList(value, subtypes)) {
    return refuse("subtype-not-in-list");
  }
  const key = normalizeSubtypeLabel(value);
  const own = subtypes.find((s) => normalizeSubtypeLabel(s) === key) ?? value;
  return { kind: "change", change: { target, op: "set", value: own } };
}

interface MultiContext {
  target: OrganizerFieldTarget;
  line: OrganizerAxisValue;
  fromLine: OrganizerAxisValue | undefined;
  stored: MetadataValue | undefined;
}

function multiSelectOutcome(
  field: MetadataField,
  c: MultiContext,
): AxisOutcome {
  const options = field.options ?? [];
  const current = storedStrings(c.stored);
  const dragged = c.fromLine;
  let remaining = current;
  if (dragged?.kind === "value" && typeof dragged.value === "string") {
    remaining = current.filter((v) => v !== dragged.value);
  } else if (dragged?.kind === "other") {
    remaining = current.filter((v) => options.includes(v));
  }
  if (c.line.kind === "none") {
    if (remaining.length === current.length) return UNCHANGED;
    return {
      kind: "change",
      change: setOrClear(c.target, inListOrder(remaining, options)),
    };
  }
  const value = c.line.value;
  if (typeof value !== "string" || !options.includes(value)) {
    return refuse("value-not-in-list");
  }
  if (current.includes(value)) return UNCHANGED;
  const next = inListOrder([...remaining, value], options);
  return {
    kind: "change",
    change: { target: c.target, op: "set", value: next },
  };
}

function multiRefOutcome(field: MetadataField, c: MultiContext): AxisOutcome {
  const current = storedRefs(c.stored);
  const dragged = c.fromLine;
  let remaining = current;
  if (dragged?.kind === "value" && isRef(dragged.value)) {
    const gone = dragged.value;
    remaining = current.filter((r) => !sameRef(r, gone));
  } else if (dragged?.kind === "other") {
    remaining = current.filter((r) => r.id !== null);
  }
  if (c.line.kind === "none") {
    if (remaining.length === current.length) return UNCHANGED;
    return { kind: "change", change: setOrClear(c.target, remaining) };
  }
  const value = c.line.value;
  if (!isRef(value) || value.id === null) return refuse("value-not-in-list");
  if (current.some((r) => sameRef(r, value))) return UNCHANGED;
  const next = [...remaining, { id: value.id, name: value.name }];
  if (field.maxSelections !== undefined && next.length > field.maxSelections) {
    return refuse("max-selections-exceeded");
  }
  return {
    kind: "change",
    change: { target: c.target, op: "set", value: next },
  };
}

function singleOutcome(field: MetadataField, c: MultiContext): AxisOutcome {
  if (c.line.kind === "none") {
    return { kind: "change", change: { target: c.target, op: "clear" } };
  }
  const value = c.line.value;
  if (field.type === "select") {
    if (typeof value !== "string" || !(field.options ?? []).includes(value)) {
      return refuse("value-not-in-list");
    }
    return { kind: "change", change: { target: c.target, op: "set", value } };
  }
  if (!isRef(value) || value.id === null) return refuse("value-not-in-list");
  const ref: ResourceRef = { id: value.id, name: value.name };
  return {
    kind: "change",
    change: { target: c.target, op: "set", value: ref },
  };
}

function fieldOutcome(
  key: string,
  line: OrganizerAxisValue,
  fromLine: OrganizerAxisValue | undefined,
  input: OrganizerDropInput,
): AxisOutcome {
  const field = input.fields.find((f) => f.key === key);
  if (!field) return refuse("unknown-field");
  if (field.locked === true && !SIDEBAR_EDITABLE_LOCKED_KEYS.has(field.key)) {
    return refuse("field-locked");
  }
  if (
    !isFieldVisibleForSubtype(
      field.key,
      field.appliesTo,
      input.card.resourceSubtype,
    )
  ) {
    return refuse("field-out-of-subtype-scope");
  }
  const c: MultiContext = {
    target: { kind: "field", key },
    line,
    fromLine,
    stored: input.card.userMetadata?.[key],
  };
  switch (field.type) {
    case "select":
      return singleOutcome(field, c);
    case "multiselect":
      return multiSelectOutcome(field, c);
    case "resource-ref":
      return field.multiple === true
        ? multiRefOutcome(field, c)
        : singleOutcome(field, c);
    case "multi-resource-ref":
      return multiRefOutcome(field, c);
    default:
      return refuse("invalid-input");
  }
}

/** The change one axis makes, or why it is refused. */
function axisOutcome(
  list: OrganizerAxisValueList,
  fromKey: string,
  toKey: string,
  input: OrganizerDropInput,
): AxisOutcome {
  const axis = list.axis;
  if (axis === "none" || axis === "order") return UNCHANGED;
  if (fromKey === toKey) return UNCHANGED;
  const resolved = targetLine(list, toKey);
  if (isOutcome(resolved)) return resolved;
  if (axis.kind === "field") {
    return fieldOutcome(axis.key, resolved, findLine(list, fromKey), input);
  }
  if (input.card.kind === "folder" && axis.kind === "status") {
    return refuse("invalid-input");
  }
  return axis.kind === "status"
    ? statusOutcome(resolved, input.statuses)
    : subtypeOutcome(resolved, input.subtypes);
}

const targetId = (t: OrganizerFieldTarget): string =>
  t.kind === "field" ? `field:${t.key}` : t.kind;

const axisTargetId = (list: OrganizerAxisValueList): string | null => {
  const axis = list.axis;
  if (axis === "none" || axis === "order") return null;
  return axis.kind === "field" ? `field:${axis.key}` : axis.kind;
};

const refused = (
  reason: OrganizerFieldWriteRefusalReason,
): OrganizerDropPlan => ({
  kind: "refused",
  reason,
  message: MESSAGES[reason],
});

/**
 * Plans one drop. A drop on the same cell, or one that changes no stored
 * value, is a no-op. A refusal on either axis refuses the whole drop, so a
 * two-field drop never writes half. Pure: does not mutate its input.
 */
export function planOrganizerDrop(
  input: OrganizerDropInput,
): OrganizerDropPlan {
  const { from, to } = input;
  if (from.rowKey === to.rowKey && from.columnKey === to.columnKey) {
    return { kind: "noop" };
  }
  const rowId = axisTargetId(input.rows);
  if (rowId !== null && rowId === axisTargetId(input.columns)) {
    return refused("invalid-input");
  }
  const outcomes = [
    axisOutcome(input.rows, from.rowKey, to.rowKey, input),
    axisOutcome(input.columns, from.columnKey, to.columnKey, input),
  ];
  for (const outcome of outcomes) {
    if (outcome.kind === "refused") return refused(outcome.reason);
  }
  const changes = outcomes.flatMap((o) =>
    o.kind === "change" ? [o.change] : [],
  );
  if (changes.length === 0) return { kind: "noop" };
  if (new Set(changes.map((c) => targetId(c.target))).size !== changes.length) {
    return refused("invalid-input");
  }
  return { kind: "write", input: { resourceId: input.card.id, changes } };
}
