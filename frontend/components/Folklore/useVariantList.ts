"use client";

import { useMemo } from "react";
import useAppSelector from "../../src/store/hooks";
import { selectActiveProjectMetadataSchema } from "../../src/store/projectsSlice";
import { selectFoldersAndResources } from "../../src/store/resourcesSlice";
import {
  resolveNarrativeScope,
  type FolderSubtypeRead,
} from "../../src/lib/models/folklore-narratives";
import {
  describeVariantFields,
  type VariantFieldDescription,
} from "../../src/lib/models/folklore-variant-fields";
import type {
  MetadataSchema,
  SourceResource,
} from "../../src/lib/models/types";

/** Mark shown on a Source in scope that does not carry the Variant subtype (FR-8). */
export const NOT_A_VARIANT_MARK =
  "not a Variant: teller, date and place do not apply";

/** One row of the picked narrative's variant list. */
export type VariantListRow =
  | {
      kind: "variant";
      id: string;
      name: string;
      fields: VariantFieldDescription[];
    }
  | {
      kind: "not-variant";
      id: string;
      name: string;
      mark: typeof NOT_A_VARIANT_MARK;
      /** A non-Variant Source can still be chosen for comparison (FR-8). */
      selectable: true;
    }
  | { kind: "unreadable"; id: string; name: string; reason: string };

/**
 * The list outcome. `failed` is a folder subtype that could not be read and
 * is never an empty scope; `scope` with no rows is a narrative with no Sources.
 */
export type VariantListResult =
  | { kind: "none" }
  | { kind: "missing"; folderId: string }
  | { kind: "failed"; folderId: string; reason: string }
  | { kind: "scope"; narrativeId: string; rows: VariantListRow[] };

const UNREADABLE_METADATA_REASON =
  "the stored metadata of this Source is not a set of fields";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRow(
  source: SourceResource,
  isVariant: boolean,
  schema: MetadataSchema,
): VariantListRow {
  const base = { id: source.id, name: source.name };
  const stored: unknown = source.userMetadata;
  if (stored !== undefined && !isPlainRecord(stored)) {
    return { ...base, kind: "unreadable", reason: UNREADABLE_METADATA_REASON };
  }
  if (!isVariant) {
    return {
      ...base,
      kind: "not-variant",
      mark: NOT_A_VARIANT_MARK,
      selectable: true,
    };
  }
  return {
    ...base,
    kind: "variant",
    fields: describeVariantFields(schema, stored),
  };
}

/**
 * The picked narrative's variants for the Narratives tab. Field source
 * (`experiments/task-1.md` item f): the store. The Sources come from the
 * resources slice and their `userMetadata` and the field labels from the
 * active project's metadata schema, so a sidebar edit or a field rename shows
 * without a reload. Nothing is read from disk and nothing is written.
 *
 * @param narrativeId - The picked Narrative folder id, or null.
 * @param folderSubtypes - One subtype read per folder, from the narrative list.
 */
export function useVariantList(
  narrativeId: string | null,
  folderSubtypes: ReadonlyMap<string, FolderSubtypeRead>,
): VariantListResult {
  const all = useAppSelector((s) => selectFoldersAndResources(s.resources));
  const schema = useAppSelector(selectActiveProjectMetadataSchema);
  return useMemo<VariantListResult>(() => {
    if (narrativeId === null) return { kind: "none" };
    const scope = resolveNarrativeScope(narrativeId, all, folderSubtypes);
    if (scope.kind !== "scope") return scope;
    return {
      kind: "scope",
      narrativeId,
      rows: scope.variants.map((entry) =>
        toRow(entry.resource, entry.isVariant, schema),
      ),
    };
  }, [narrativeId, all, folderSubtypes, schema]);
}
