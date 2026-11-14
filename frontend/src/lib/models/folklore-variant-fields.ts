/**
 * Feature 110 (folklore variants), Task 7 (FR-5, FR-10, FR-19): pure selection
 * and description of the custom fields limited to the Variant subtype.
 *
 * No fixed key and no role mapping: every custom text, select or multiselect field
 * whose `appliesTo` holds the Variant subtype is returned, in schema order,
 * under its current label. Reads nothing and writes nothing; no React, JSX,
 * JSON or `node:*`, so the CLI and the Electron workers can reach it.
 */

import { isFieldVisibleForSubtype } from "./field-subtype-scope";
import { NOT_IN_LIST, VARIANT_SUBTYPE } from "./folklore-types";
import type { MetadataField, MetadataSchema } from "./types";

/** One stored tag, kept exactly as stored. */
export interface VariantTag {
  text: string;
  /** True when the text equals an option of the field's current list. */
  isInList: boolean;
  /** `NOT_IN_LIST` when the tag is not among the current options, else null. */
  mark: string | null;
}

interface DescriptionBase {
  key: string;
  label: string;
}

/**
 * How one Variant field reads on one variant. `unexpected-value` is a stored
 * value of the wrong shape; it is never folded into `not-set`.
 */
export type VariantFieldDescription =
  | (DescriptionBase & { kind: "detail"; state: "set"; text: string })
  | (DescriptionBase & { kind: "detail"; state: "not-set" })
  | (DescriptionBase & {
      kind: "detail";
      state: "unexpected-value";
      /** A select's stored string that is not among its options, kept as stored. */
      text?: string;
    })
  | (DescriptionBase & { kind: "tags"; state: "set"; tags: VariantTag[] })
  | (DescriptionBase & { kind: "tags"; state: "not-set" })
  | (DescriptionBase & { kind: "tags"; state: "unexpected-value" });

function isVariantField(field: MetadataField): boolean {
  if (
    field.type !== "text" &&
    field.type !== "select" &&
    field.type !== "multiselect"
  ) {
    return false;
  }
  if (!field.appliesTo || field.appliesTo.length === 0) return false;
  if (field.appliesToFolders === true) return false;
  return isFieldVisibleForSubtype(field.key, field.appliesTo, VARIANT_SUBTYPE);
}

/** The custom fields limited to Variant, in metadata-schema order. */
export function selectVariantFields(schema: MetadataSchema): MetadataField[] {
  return schema.groups.flatMap((group) => group.fields.filter(isVariantField));
}

function describeDetail(
  base: DescriptionBase,
  value: unknown,
): VariantFieldDescription {
  if (value === undefined || value === null) {
    return { ...base, kind: "detail", state: "not-set" };
  }
  if (typeof value !== "string") {
    return { ...base, kind: "detail", state: "unexpected-value" };
  }
  if (value.trim() === "") return { ...base, kind: "detail", state: "not-set" };
  return { ...base, kind: "detail", state: "set", text: value };
}

function describeSelect(
  base: DescriptionBase,
  options: readonly string[],
  value: unknown,
): VariantFieldDescription {
  const detail = describeDetail(base, value);
  if (detail.kind !== "detail" || detail.state !== "set") return detail;
  if (options.includes(detail.text)) return detail;
  return {
    ...base,
    kind: "detail",
    state: "unexpected-value",
    text: detail.text,
  };
}

function describeTags(
  base: DescriptionBase,
  options: readonly string[],
  value: unknown,
): VariantFieldDescription {
  if (value === undefined || value === null) {
    return { ...base, kind: "tags", state: "not-set" };
  }
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    return { ...base, kind: "tags", state: "unexpected-value" };
  }
  if (value.length === 0) return { ...base, kind: "tags", state: "not-set" };
  const tags: VariantTag[] = (value as string[]).map((text) => {
    const isInList = options.includes(text);
    return { text, isInList, mark: isInList ? null : NOT_IN_LIST };
  });
  return { ...base, kind: "tags", state: "set", tags };
}

/**
 * Describes each Variant field for one variant's `userMetadata`, in schema
 * order. A project with no tag fields yields no tag entry.
 */
export function describeVariantFields(
  schema: MetadataSchema,
  userMetadata: Readonly<Record<string, unknown>> | undefined,
): VariantFieldDescription[] {
  return selectVariantFields(schema).map((field) => {
    const base: DescriptionBase = { key: field.key, label: field.label };
    const value = userMetadata?.[field.key];
    if (field.type === "multiselect") {
      return describeTags(base, field.options ?? [], value);
    }
    return field.type === "select"
      ? describeSelect(base, field.options ?? [], value)
      : describeDetail(base, value);
  });
}
