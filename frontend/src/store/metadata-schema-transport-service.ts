import type {
  MetadataField,
  MetadataFieldType,
  MetadataGroup,
  MetadataSchema,
} from "../lib/models/types";
import type {
  TypeMigrationEntry,
  OptionsMigrationEntry,
} from "../lib/models/metadata-schema";
import type { FieldValueEntry } from "../../app/api/project/metadata-schema/route";
import { getProjectDirectoryId } from "./projectsSlice";

export interface MetadataSchemaRequestContext {
  projectId: string;
}

/**
 * Resolves the project context needed for metadata schema requests.
 *
 * `lookupProjectId` is the Redux-internal `projects.projects` map key
 * (mirrored from `project.json`'s `id` field) — it is used only to look up
 * the stored project record, never sent to the API. The `projectId` returned
 * in the context is that project's on-disk directory basename, derived from
 * its `rootPath` via {@link getProjectDirectoryId} (the same derivation
 * `selectActiveProjectDirectoryId` uses for the active project), which is
 * what every tenant-scoped metadata-schema route (ADR-017/018) actually
 * expects. Per FR12, a project's on-disk directory name and its
 * `project.json` `id` are two independently generated UUIDs — sending the
 * wrong one is a silent failure, not an auth error.
 *
 * State is typed as `any` to match the pattern in projectsSlice.ts and avoid
 * a circular import from ./store.
 */
export function resolveMetadataSchemaRequestContext(
  state: any,
  lookupProjectId: string,
): MetadataSchemaRequestContext | { error: string } {
  const project = state?.projects?.projects?.[lookupProjectId];
  if (!project) {
    return { error: "Project not found." };
  }
  if (!project.rootPath) {
    return { error: "Selected project is missing a root path." };
  }
  return { projectId: getProjectDirectoryId(project.rootPath) };
}

interface SchemaResponse {
  schema: MetadataSchema;
}

function getApiErrorMessage(errorBody: unknown, fallback: string): string {
  const body = errorBody as Record<string, unknown> | null | undefined;
  if (body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

async function postToMetadataSchemaRoute(
  body: object,
): Promise<MetadataSchema> {
  const response = await fetch("/api/project/metadata-schema", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      getApiErrorMessage(errorBody, "Metadata schema operation failed."),
    );
  }

  const data = (await response.json()) as SchemaResponse;
  return data.schema;
}

export async function postAddField(
  context: MetadataSchemaRequestContext,
  groupId: string,
  field: MetadataField,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "add-field",
    projectId,
    groupId,
    field,
  });
}

export async function postRemoveField(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "remove-field",
    projectId,
    groupId,
    fieldKey,
  });
}

export async function postDeprecateField(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "deprecate-field",
    projectId,
    groupId,
    fieldKey,
  });
}

export async function postClearField(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "clear-field",
    projectId,
    groupId,
    fieldKey,
  });
}

export async function postReorderFields(
  context: MetadataSchemaRequestContext,
  groupId: string,
  newKeyOrder: string[],
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "reorder-fields",
    projectId,
    groupId,
    newKeyOrder,
  });
}

export async function postRenameField(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
  newLabel: string,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "rename-field",
    projectId,
    groupId,
    fieldKey,
    newLabel,
  });
}

export async function postUpdateFieldOptions(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
  options: string[],
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "update-field-options",
    projectId,
    groupId,
    fieldKey,
    options,
  });
}

export async function postAddGroup(
  context: MetadataSchemaRequestContext,
  group: MetadataGroup,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({ action: "add-group", projectId, group });
}

export async function postRemoveGroup(
  context: MetadataSchemaRequestContext,
  groupId: string,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "remove-group",
    projectId,
    groupId,
  });
}

export async function postReorderGroups(
  context: MetadataSchemaRequestContext,
  newGroupIdOrder: string[],
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "reorder-groups",
    projectId,
    newGroupIdOrder,
  });
}

export async function postChangeFieldType(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
  newType: MetadataFieldType,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "change-field-type",
    projectId,
    groupId,
    fieldKey,
    newType,
  });
}

export async function postRenameFieldKey(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
  newKey: string,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "rename-key",
    projectId,
    groupId,
    fieldKey,
    newKey,
  });
}

export async function postUpdateRefProperties(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
  updates: {
    refFolder?: string | null;
    includeSubfolders?: boolean | null;
    maxSelections?: number | null;
  },
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "update-ref-properties",
    projectId,
    groupId,
    fieldKey,
    ...updates,
  });
}

export async function postUpdateFieldOptionsWithMigration(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
  newOptions: string[],
  migrations: Record<string, OptionsMigrationEntry>,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "update-field-options-with-migration",
    projectId,
    groupId,
    fieldKey,
    newOptions,
    migrations,
  });
}

export async function postChangeFieldTypeWithMigration(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
  newType: MetadataFieldType,
  newOptions: string[],
  migrations: Record<string, TypeMigrationEntry>,
): Promise<MetadataSchema> {
  const { projectId } = context;
  return postToMetadataSchemaRoute({
    action: "change-field-type-with-migration",
    projectId,
    groupId,
    fieldKey,
    newType,
    newOptions,
    migrations,
  });
}

/**
 * Fetch aggregated field values for a metadata field.
 *
 * @param projectId - The project's on-disk directory basename (per FR12,
 *   distinct from `project.json`'s internal `id` — source via
 *   `selectActiveProjectDirectoryId` / `getProjectDirectoryId`).
 * @param fieldKey - The metadata field key to enumerate values for.
 */
export async function fetchFieldValues(
  projectId: string,
  fieldKey: string,
): Promise<FieldValueEntry[]> {
  const params = new URLSearchParams({ projectId, fieldKey });
  const response = await fetch(
    `/api/project/metadata-schema?${params.toString()}`,
  );
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      getApiErrorMessage(errorBody, "Failed to enumerate field values."),
    );
  }
  const data = (await response.json()) as { values?: FieldValueEntry[] };
  return data.values ?? [];
}
