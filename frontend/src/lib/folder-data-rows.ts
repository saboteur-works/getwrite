/**
 * @module folder-data-rows
 *
 * **Feature 102, Task 16 (FR-14).** Pure helpers behind the Data view's
 * folder rows: splitting a smart folder's result ids into resources and
 * folders, choosing the field columns, and building each row. A row carries
 * name, subtype and the column values only: no notes and no child count.
 */
import { getFieldsOfferedOnFolder } from "./models/field-subtype-scope";
import type {
  AnyResource,
  Folder,
  MetadataSchema,
  MetadataValue,
} from "./models/types";

/** What a row needs from a folder's sidecar. Notes are accepted and ignored. */
export interface FolderRowMetadata {
  notes: string;
  fieldValues: Record<string, MetadataValue>;
  resourceSubtype: string | undefined;
}

export interface FolderColumn {
  key: string;
  label: string;
}

interface FolderRowCell extends FolderColumn {
  /** Display text; empty when the folder has no value or is not offered the field. */
  value: string;
}

export interface FolderRow {
  id: string;
  name: string;
  subtype: string | undefined;
  cells: FolderRowCell[];
}

/**
 * Splits result ids into the live resources they name (in `resources` order,
 * exactly the previous filter) and the live folders they name (in `folders`
 * order). An id naming neither is dropped, as the previous filter dropped it.
 */
export function splitSmartFolderResults(
  ids: readonly string[],
  resources: readonly AnyResource[],
  folders: readonly Folder[],
): { resources: AnyResource[]; folders: Folder[] } {
  const idSet = new Set(ids);
  return {
    resources: resources.filter((r) => idSet.has(r.id)),
    folders: folders.filter((f) => idSet.has(f.id)),
  };
}

/** Display text for a stored field value; empty for none. */
export function formatFolderFieldValue(
  value: MetadataValue | undefined,
): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * The columns for a set of folders: every non-deprecated custom field that at
 * least one of them is offered (FR-9, `getFieldsOfferedOnFolder`), in schema
 * order. Notes is never a column.
 */
export function buildFolderColumns(
  schema: MetadataSchema,
  folders: readonly { id: string; resourceSubtype: string | undefined }[],
): FolderColumn[] {
  const columns = new Map<string, FolderColumn>();
  const offered = new Set<string>();
  for (const folder of folders) {
    for (const field of getFieldsOfferedOnFolder(
      schema,
      folder.resourceSubtype,
    )) {
      if (field.key === "notes" || field.deprecated) continue;
      offered.add(field.key);
    }
  }
  for (const group of schema.groups) {
    for (const field of group.fields) {
      if (offered.has(field.key) && !columns.has(field.key)) {
        columns.set(field.key, { key: field.key, label: field.label });
      }
    }
  }
  return [...columns.values()];
}

/** One row per folder, in the order given. */
export function buildFolderRows(
  folders: readonly Folder[],
  metadataById: Readonly<Record<string, FolderRowMetadata>>,
  columns: readonly FolderColumn[],
): FolderRow[] {
  return folders.map((folder) => {
    const metadata = metadataById[folder.id];
    return {
      id: folder.id,
      name: folder.name ?? "Unnamed",
      subtype: metadata?.resourceSubtype,
      cells: columns.map((column) => ({
        ...column,
        value: formatFolderFieldValue(metadata?.fieldValues[column.key]),
      })),
    };
  });
}
