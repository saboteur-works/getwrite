/**
 * @module organizerAxisFields
 * Pure axis model for the Organizer grid (Feature 109, FR-4, OQ-10, OQ-16):
 * which fields a Rows or Columns picker offers, and the ordered lines of one
 * axis. No React, Redux or `@dnd-kit`; the caller passes the schema, the
 * project's status and subtype lists, and the cards' values.
 */
import {
  getFieldsOfferedOnFolder,
  isFieldVisibleForSubtype,
} from "../../../../src/lib/models/field-subtype-scope";
import { isFieldDeprecated } from "../../../../src/lib/models/field-deprecation";
import type {
  MetadataField,
  MetadataFieldType,
  MetadataSchema,
  MetadataValue,
  ResourceRef,
} from "../../../../src/lib/models/types";
import type {
  OrganizerAxis,
  OrganizerAxisValue,
  OrganizerAxisValueList,
} from "../../../../src/lib/models/organizer-grid-types";

/** Heading of the line that holds stored values outside the field's list. */
export const OTHER_VALUES_LABEL = "Other values";

/** Heading of the line that holds cards with no value. */
export const NONE_LABEL = "None";

/** Source kinds the picker distinguishes: folder fields need `children`. */
type OrganizerAxisSource = "children" | "descendants" | "smart-folder";

/** One entry of a Rows or Columns picker. */
export interface OrganizerAxisChoice {
  axis: OrganizerAxis;
  label: string;
}

export interface AxisChoicesInput {
  schema: MetadataSchema;
  source: OrganizerAxisSource;
  /** Subtypes of the document cards, one entry per card; empty reads as one document with none. */
  documentSubtypes: readonly (string | undefined)[];
  /** Subtypes of the folder cards (children source only), one entry per folder card. */
  folderSubtypes: readonly (string | undefined)[];
  position: "rows" | "columns";
  /** The axis chosen on the other picker; its field is not offered again. */
  other: OrganizerAxis;
}

const AXIS_FIELD_TYPES: ReadonlySet<MetadataFieldType> = new Set([
  "select",
  "multiselect",
  "resource-ref",
  "multi-resource-ref",
]);

const REFERENCE_TYPES: ReadonlySet<MetadataFieldType> = new Set([
  "resource-ref",
  "multi-resource-ref",
]);

/** Built-in keys that are never a field axis: status has its own axis, notes is text. */
const NON_FIELD_AXIS_KEYS: ReadonlySet<string> = new Set(["status", "notes"]);

function isAxisField(field: MetadataField): boolean {
  return (
    AXIS_FIELD_TYPES.has(field.type) &&
    !isFieldDeprecated(field) &&
    !NON_FIELD_AXIS_KEYS.has(field.key)
  );
}

function allFields(schema: MetadataSchema): MetadataField[] {
  return schema.groups.flatMap((group) => group.fields);
}

function folderFieldKeys(
  schema: MetadataSchema,
  input: AxisChoicesInput,
): Set<string> {
  const keys = new Set<string>();
  if (input.source !== "children") return keys;
  for (const subtype of input.folderSubtypes) {
    for (const field of getFieldsOfferedOnFolder(schema, subtype)) {
      keys.add(field.key);
    }
  }
  return keys;
}

function isOfferedOnDocuments(
  field: MetadataField,
  subtypes: readonly (string | undefined)[],
): boolean {
  const list = subtypes.length === 0 ? [undefined] : subtypes;
  return list.some((subtype) =>
    isFieldVisibleForSubtype(field.key, field.appliesTo, subtype),
  );
}

function isSameAxis(a: OrganizerAxis, b: OrganizerAxis): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === "field" && b.kind === "field" ? a.key === b.key : true;
}

/**
 * The entries of a Rows or Columns picker, in order: None, Order (Columns
 * only), the status, the subtype, then fields in schema order. A field is
 * offered when its type is one of select, multiselect, resource-ref or
 * multi-resource-ref, it is not deprecated, and either some document card's
 * subtype shows it or (children source only) some folder card is offered it.
 * The axis already chosen on the other picker is left out, so one field
 * cannot serve both axes.
 */
export function getAxisChoices(input: AxisChoicesInput): OrganizerAxisChoice[] {
  const onFolders = folderFieldKeys(input.schema, input);
  const fields: OrganizerAxisChoice[] = allFields(input.schema)
    .filter(
      (field) =>
        isAxisField(field) &&
        (isOfferedOnDocuments(field, input.documentSubtypes) ||
          onFolders.has(field.key)),
    )
    .map((field) => ({
      axis: { kind: "field", key: field.key },
      label: field.label,
    }));

  const choices: OrganizerAxisChoice[] = [{ axis: "none", label: "None" }];
  if (input.position === "columns") {
    choices.push({ axis: "order", label: "Order" });
  }
  choices.push(
    { axis: { kind: "status" }, label: "Status" },
    { axis: { kind: "subtype" }, label: "Subtype" },
    ...fields,
  );
  return choices.filter(
    (choice) =>
      choice.axis === "none" ||
      choice.axis === "order" ||
      !isSameAxis(choice.axis, input.other),
  );
}

export interface AxisValueListInput {
  axis: OrganizerAxis;
  schema: MetadataSchema;
  /** `config.statuses`, in order. */
  statuses: readonly string[];
  /** `config.subtypes`, in order. */
  subtypes: readonly string[];
  /**
   * The axis field's stored value for each card, in tree order; used only by
   * a reference axis. Entries of any shape are tolerated and skipped when
   * they are not references.
   */
  presentValues: readonly unknown[];
}

function isResourceRef(value: unknown): value is ResourceRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as { id?: unknown; name?: unknown };
  return (
    (typeof candidate.id === "string" || candidate.id === null) &&
    typeof candidate.name === "string"
  );
}

function refsIn(value: unknown): ResourceRef[] {
  if (Array.isArray(value)) return value.filter(isResourceRef);
  return isResourceRef(value) ? [value] : [];
}

/** Key of a list value; prefixed when it would equal the `other` or `none` key. */
function valueKey(raw: string): string {
  return raw === "other" || raw === "none" ? `value:${raw}` : raw;
}

function listLine(raw: string, value: MetadataValue): OrganizerAxisValue {
  return {
    key: valueKey(raw),
    kind: "value",
    label: raw,
    isDropTarget: true,
    value,
  };
}

function textLines(options: readonly string[]): OrganizerAxisValue[] {
  const seen = new Set<string>();
  const lines: OrganizerAxisValue[] = [];
  for (const option of options) {
    if (seen.has(option)) continue;
    seen.add(option);
    lines.push(listLine(option, option));
  }
  return lines;
}

function referenceLines(
  presentValues: readonly unknown[],
): OrganizerAxisValue[] {
  const seen = new Set<string>();
  const lines: OrganizerAxisValue[] = [];
  for (const present of presentValues) {
    for (const ref of refsIn(present)) {
      if (ref.id === null || seen.has(ref.id)) continue;
      seen.add(ref.id);
      lines.push({
        key: valueKey(ref.id),
        kind: "value",
        label: ref.name,
        isDropTarget: true,
        value: { id: ref.id, name: ref.name },
      });
    }
  }
  return lines;
}

function fieldLines(
  input: AxisValueListInput,
  key: string,
): OrganizerAxisValue[] {
  const field = allFields(input.schema).find((f) => f.key === key);
  if (!field) return [];
  if (field.type === "select" || field.type === "multiselect") {
    return textLines(field.options ?? []);
  }
  return REFERENCE_TYPES.has(field.type)
    ? referenceLines(input.presentValues)
    : [];
}

function listValueLines(input: AxisValueListInput): OrganizerAxisValue[] {
  const { axis } = input;
  if (typeof axis === "string") return [];
  if (axis.kind === "status") return textLines(input.statuses);
  if (axis.kind === "subtype") return textLines(input.subtypes);
  return fieldLines(input, axis.key);
}

/**
 * The ordered lines of one axis: the field's own values (`options`,
 * `config.statuses`, `config.subtypes`, or for a reference field the ids
 * present among the cards in first-appearance order with the first saved
 * name), then "Other values" (never a drop target), then "None" last. A
 * reference with a null id gets no line of its own: it belongs to "Other
 * values". The `none` and `order` axes have no lines (the grid model treats
 * them as a single sequence). A field with no values, or one missing from
 * the schema, yields only the Other and None lines.
 */
export function buildAxisValueList(
  input: AxisValueListInput,
): OrganizerAxisValueList {
  if (input.axis === "none" || input.axis === "order") {
    return { axis: input.axis, values: [] };
  }
  return {
    axis: input.axis,
    values: [
      ...listValueLines(input),
      {
        key: "other",
        kind: "other",
        label: OTHER_VALUES_LABEL,
        isDropTarget: false,
      },
      { key: "none", kind: "none", label: NONE_LABEL, isDropTarget: true },
    ],
  };
}
