// Last Updated: 2026-09-11

/**
 * @module metadata-mapper
 *
 * Resolves per-document Status/Label/CustomMetaData values and builds the
 * project-level Status/Label/custom-field/tag-merge plan (Task 5,
 * `specs/features/scrivener-cli-importer.md` FR-6, FR-7, FR-8, FR-15), plus
 * (Task 13) FR-20's per-value resolution rules: a List field's per-document
 * `Option@ID` is resolved to its `ListOptions` display text, a Date field's
 * value is accepted only in one of the two measured shapes, and an
 * unresolvable `StatusID` is treated the same way — each an FR-8 skip for
 * that one value (`valueSkips`), never a thrown error.
 *
 * Pure function over an already-parsed {@link ScrivxParsed} (Task 2's
 * `parseScrivxFile` output) — no I/O, no project mutation. The orchestrator
 * (Task 8) is responsible for turning this plan into actual filesystem
 * writes: seeding `config.statuses`, calling `metadata-schema.ts`'s
 * `addField` for the Label field and each custom field, calling `tags.ts`'s
 * `createTag`/`assignTagToResource` for the keyword tag plan, and merging
 * `resourceUserMetadata` onto each created resource's sidecar via
 * `writeSidecar`.
 */
import { slugify } from "../../utils";
import type { MetadataField } from "../types";
import type {
  ScrivxBinderItem,
  ScrivxKeyword,
  ScrivxParsed,
} from "./scrivx-types";

/**
 * A single `CustomMetaData` field definition (`.scrivx` `Type`) that has no
 * GetWrite field-type mapping, recorded for the FR-9 report (FR-8 skip
 * style: identity + reason). The fixture only carries `Text`/`Date`/`List`
 * fields, all of which map, so this only ever populates on a synthetic
 * field type exercised by a test.
 */
export interface UnsupportedCustomMetaDataField {
  /** The `.scrivx` `CustomMetaData` field id, e.g. `"CMD4"`. */
  readonly fieldId: string;
  /** The field's `Title`, for a human-readable report entry. */
  readonly fieldTitle: string;
  /** The unmapped `.scrivx` field `Type` string, as encountered. */
  readonly type: string;
  /** Human-readable reason recorded for the report. */
  readonly reason: string;
}

/**
 * A single per-document metadata *value* the mapper declined to resolve
 * (FR-8, FR-20): a List field's `Option@ID` with no matching `ListOptions`
 * entry, a Date field's value matching neither measured shape, or a
 * `StatusID` with no matching `StatusSettings` entry (e.g. the measured
 * `-1`). The rest of the owning document still imports — only this one
 * `userMetadata` key is left unset. Field names echo
 * `UnsupportedCustomMetaDataField`'s `itemTitle`/`reason` shape; `sourceUuid`
 * stands in for a `binderPath` (which `buildMetadataPlan`, unlike
 * `mapBinderToImportPlan`, does not compute) so a caller that already has
 * the binder-mapper's plan can cross-reference a resource's binder path by
 * `sourceUuid` if it wants one for the report.
 */
export interface MetadataValueSkip {
  /** The owning binder item's title, or `"Untitled"` when it has none (FR-19), for a human-readable report entry. */
  readonly itemTitle: string;
  /** The owning binder item's `UUID`. */
  readonly sourceUuid: string;
  /** Human-readable reason this one value was skipped. */
  readonly reason: string;
}

/**
 * One planned GetWrite tag, merging every source keyword id that shares its
 * leaf `title` (case-sensitive, exact match) regardless of parent.
 */
export interface PlannedKeywordTag {
  /** Stable synthetic id for this planned tag, referenced by `resourceKeywordTagIds` below. Not a real `Tag.id` — Task 8 mints that by calling `createTag` and must remember the mapping from this id to the real one. */
  readonly id: string;
  /** The tag name — the shared leaf name of every merged keyword. */
  readonly name: string;
  /** Every source `.scrivx` keyword id (from the `keywords` tree) that merged into this tag. */
  readonly keywordIds: readonly string[];
}

/**
 * A recorded FR-15 leaf-name merge: 2+ distinct keyword ids under different
 * parents in the source keyword tree claimed the same leaf name.
 */
export interface KeywordMerge {
  /** The shared leaf name that caused the merge. */
  readonly leafName: string;
  /** The planned tag id every merged keyword resolved to. */
  readonly plannedTagId: string;
  /** Every distinct parent path (root-to-parent, exclusive of the leaf itself) that merged, rendered `>`-joined (e.g. `"Characters > Protagonists"`). */
  readonly parentPaths: readonly string[];
}

/** The keyword→tag portion of the metadata plan (FR-15, Keywords half). */
export interface KeywordTagPlan {
  /** Every planned tag, one per distinct leaf name across the whole keyword tree. */
  readonly tags: readonly PlannedKeywordTag[];
  /** Binder item UUID → planned tag ids that item's own `keywordIds` resolve to. */
  readonly resourceKeywordTagIds: ReadonlyMap<string, readonly string[]>;
  /** Every leaf name claimed by 2+ distinct keyword ids under different parents. */
  readonly merges: readonly KeywordMerge[];
}

/**
 * Full metadata plan returned by {@link buildMetadataPlan}.
 */
export interface MetadataPlan {
  /** Destination project's `config.statuses`, seeded from `StatusSettings` labels, in source order. */
  readonly statuses: readonly string[];
  /** The "Label" custom select field definition, seeded from `LabelSettings`. `undefined` when the source project has no labels at all. */
  readonly labelField: MetadataField | undefined;
  /** One field definition per `CustomMetaData` field whose `Type` has a GetWrite mapping (`Text`->`text`, `Date`->`date`, `List`->`select`). */
  readonly customFields: readonly MetadataField[];
  /** Custom-metadata field definitions with no GetWrite mapping, recorded for the FR-9 report. */
  readonly unsupportedFields: readonly UnsupportedCustomMetaDataField[];
  /** Binder item UUID -> resolved sidecar `userMetadata` key/value pairs (`status`, `label`, and each custom field's key). */
  readonly resourceUserMetadata: ReadonlyMap<
    string,
    Readonly<Record<string, string>>
  >;
  /** The Keywords-to-tags plan (FR-15, Keywords half). */
  readonly keywordTagPlan: KeywordTagPlan;
  /** Every per-document value the mapper declined to resolve (FR-8, FR-20), in encounter order. */
  readonly valueSkips: readonly MetadataValueSkip[];
}

const STATUS_KEY = "status";
const LABEL_KEY = "label";
const LABEL_FIELD_TITLE = "Label";

/**
 * The two measured `.scrivx` Date-value shapes (FR-18, FR-20):
 * `YYYY-MM-DD HH:MM:SS.fffff ±HHMM` (sub-second precision) and
 * `YYYY-MM-DD HH:MM:SS ±HHMM` (no sub-second precision — the same shape as
 * a `BinderItem`'s own `Created`/`Modified` timestamp).
 */
const SCRIVENER_DATE_RE =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)? [+-]\d{4}$/;

/** Whether `value` matches one of the two measured Scrivener Date-field shapes (FR-20). */
function isRecognizedScrivenerDate(value: string): boolean {
  return SCRIVENER_DATE_RE.test(value);
}

/** A binder item's title, or the FR-19 "Untitled" fallback when it has none, for a human-readable skip reason/report entry. */
function displayTitle(item: ScrivxBinderItem): string {
  return item.title !== "" ? item.title : "Untitled";
}

/** Maps a `.scrivx` `CustomMetaData` field `Type` to a GetWrite `MetadataFieldType`, or `undefined` when unmapped (FR-8). */
function mapFieldType(scrivxType: string): MetadataField["type"] | undefined {
  switch (scrivxType) {
    case "Text":
      return "text";
    case "Date":
      return "date";
    case "List":
      return "select";
    default:
      return undefined;
  }
}

/**
 * Derives a unique `[a-z0-9-]+` field key from a Scrivener field title,
 * satisfying `metadata-schema.ts`'s `SLUG_RE`. Falls back to the field id
 * (lowercased/slugified) on an empty slug or a collision with an
 * already-derived key, so two same-titled fields never clash.
 */
function deriveFieldKey(
  title: string,
  fieldId: string,
  usedKeys: Set<string>,
): string {
  const base = slugify(title);
  const candidate = base && base !== "project" ? base : slugify(fieldId);
  let key = candidate;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${candidate}-${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
}

/** Flattens the recursive binder tree into a single ordered list. */
function flattenBinder(items: readonly ScrivxBinderItem[]): ScrivxBinderItem[] {
  const flat: ScrivxBinderItem[] = [];
  for (const item of items) {
    flat.push(item);
    if (item.children.length > 0) {
      flat.push(...flattenBinder(item.children));
    }
  }
  return flat;
}

interface FlattenedKeyword {
  readonly id: string;
  readonly title: string;
  /** Root-to-parent path, exclusive of this keyword's own title. */
  readonly parentPath: readonly string[];
}

/** Flattens the recursive keyword tree, recording each node's parent path. */
function flattenKeywords(
  nodes: readonly ScrivxKeyword[],
  parentPath: readonly string[] = [],
): FlattenedKeyword[] {
  const flat: FlattenedKeyword[] = [];
  for (const node of nodes) {
    flat.push({ id: node.id, title: node.title, parentPath });
    if (node.children.length > 0) {
      flat.push(...flattenKeywords(node.children, [...parentPath, node.title]));
    }
  }
  return flat;
}

/** Builds the Keywords-to-tags plan: one planned tag per distinct leaf name, with merge tracking (FR-15). */
function buildKeywordTagPlan(
  keywords: readonly ScrivxKeyword[],
  binder: readonly ScrivxBinderItem[],
): KeywordTagPlan {
  const flatKeywords = flattenKeywords(keywords);

  const byLeafName = new Map<string, FlattenedKeyword[]>();
  for (const kw of flatKeywords) {
    const group = byLeafName.get(kw.title) ?? [];
    group.push(kw);
    byLeafName.set(kw.title, group);
  }

  const tags: PlannedKeywordTag[] = [];
  const merges: KeywordMerge[] = [];
  const keywordIdToTagId = new Map<string, string>();

  for (const [leafName, group] of byLeafName) {
    const tagId = `tag-${slugify(leafName) || group[0].id}`;
    tags.push({
      id: tagId,
      name: leafName,
      keywordIds: group.map((kw) => kw.id),
    });
    for (const kw of group) {
      keywordIdToTagId.set(kw.id, tagId);
    }

    const distinctParentPaths = Array.from(
      new Set(group.map((kw) => kw.parentPath.join(" > "))),
    );
    if (group.length > 1 && distinctParentPaths.length > 1) {
      merges.push({
        leafName,
        plannedTagId: tagId,
        parentPaths: distinctParentPaths,
      });
    }
  }

  const resourceKeywordTagIds = new Map<string, readonly string[]>();
  for (const item of flattenBinder(binder)) {
    if (item.keywordIds.length === 0) continue;
    const tagIds = Array.from(
      new Set(
        item.keywordIds
          .map((keywordId) => keywordIdToTagId.get(keywordId))
          .filter((tagId): tagId is string => tagId !== undefined),
      ),
    );
    if (tagIds.length > 0) {
      resourceKeywordTagIds.set(item.uuid, tagIds);
    }
  }

  return { tags, resourceKeywordTagIds, merges };
}

/**
 * Resolves per-document Status/Label/CustomMetaData values and builds the
 * project-level Status/Label/custom-field/tag-merge plan (FR-6, FR-7, FR-15).
 *
 * Pure — performs no I/O and mutates neither its input nor any project.
 */
export function buildMetadataPlan(parsed: ScrivxParsed): MetadataPlan {
  const statuses = parsed.statuses.map((status) => status.name);
  const statusNameById = new Map(parsed.statuses.map((s) => [s.id, s.name]));
  const labelNameById = new Map(parsed.labels.map((l) => [l.id, l.name]));

  const labelField: MetadataField | undefined =
    parsed.labels.length > 0
      ? {
          key: LABEL_KEY,
          label: LABEL_FIELD_TITLE,
          type: "select",
          options: parsed.labels.map((l) => l.name),
        }
      : undefined;

  const usedFieldKeys = new Set<string>([STATUS_KEY, LABEL_KEY]);
  const customFields: MetadataField[] = [];
  const unsupportedFields: UnsupportedCustomMetaDataField[] = [];
  const fieldKeyById = new Map<string, string>();
  const fieldById = new Map(
    parsed.customMetaDataFields.map((field) => [field.id, field]),
  );

  for (const field of parsed.customMetaDataFields) {
    const mappedType = mapFieldType(field.type);
    if (mappedType === undefined) {
      unsupportedFields.push({
        fieldId: field.id,
        fieldTitle: field.title,
        type: field.type,
        reason: `Custom metadata field type "${field.type}" has no GetWrite field-type mapping.`,
      });
      continue;
    }
    const key = deriveFieldKey(field.title, field.id, usedFieldKeys);
    fieldKeyById.set(field.id, key);
    customFields.push({ key, label: field.title, type: mappedType });
  }

  const keywordTagPlan = buildKeywordTagPlan(parsed.keywords, parsed.binder);

  const valueSkips: MetadataValueSkip[] = [];
  const resourceUserMetadata = new Map<string, Record<string, string>>();
  for (const item of flattenBinder(parsed.binder)) {
    const values: Record<string, string> = {};

    if (item.metaData.statusId !== undefined) {
      const statusName = statusNameById.get(item.metaData.statusId);
      if (statusName !== undefined) {
        values[STATUS_KEY] = statusName;
      } else {
        // FR-20/FR-8: an unresolvable StatusID (e.g. the measured `-1`) is a
        // recorded skip for this one value, not a thrown error — the rest
        // of the document still imports.
        valueSkips.push({
          itemTitle: displayTitle(item),
          sourceUuid: item.uuid,
          reason: `StatusID "${item.metaData.statusId}" does not match any configured Status id.`,
        });
      }
    }
    if (item.metaData.labelId !== undefined) {
      const labelName = labelNameById.get(item.metaData.labelId);
      if (labelName !== undefined) values[LABEL_KEY] = labelName;
    }
    for (const custom of item.metaData.customMetaData) {
      const key = fieldKeyById.get(custom.fieldId);
      if (key === undefined) continue;
      const field = fieldById.get(custom.fieldId);

      if (field?.type === "List") {
        // FR-20: resolve the stored Option@ID to its ListOptions display
        // text before writing it — an id with no matching Option is a
        // recorded skip for this one value.
        const option = field.listOptions.find((o) => o.id === custom.value);
        if (option === undefined) {
          valueSkips.push({
            itemTitle: displayTitle(item),
            sourceUuid: item.uuid,
            reason: `List field "${field.title}" value "${custom.value}" does not match any configured ListOptions Option id.`,
          });
          continue;
        }
        values[key] = option.text;
      } else if (field?.type === "Date") {
        // FR-20: accept either measured Date-value shape verbatim; a value
        // matching neither is a recorded skip for this one value.
        if (!isRecognizedScrivenerDate(custom.value)) {
          valueSkips.push({
            itemTitle: displayTitle(item),
            sourceUuid: item.uuid,
            reason: `Date field "${field.title}" value "${custom.value}" does not match either measured Scrivener date shape.`,
          });
          continue;
        }
        values[key] = custom.value;
      } else {
        values[key] = custom.value;
      }
    }

    if (Object.keys(values).length > 0) {
      resourceUserMetadata.set(item.uuid, values);
    }
  }

  return {
    statuses,
    labelField,
    customFields,
    unsupportedFields,
    resourceUserMetadata,
    keywordTagPlan,
    valueSkips,
  };
}
