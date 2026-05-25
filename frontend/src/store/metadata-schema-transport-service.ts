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

export interface MetadataSchemaRequestContext {
  projectPath: string;
  projectId: string;
}

/**
 * Resolves the project path needed for metadata schema requests.
 * State is typed as `any` to match the pattern in projectsSlice.ts and avoid
 * a circular import from ./store.
 */
export function resolveMetadataSchemaRequestContext(
  state: any,
  projectId: string,
): MetadataSchemaRequestContext | { error: string } {
  const project = state?.projects?.projects?.[projectId];
  if (!project) {
    return { error: "Project not found." };
  }
  if (!project.rootPath) {
    return { error: "Selected project is missing a root path." };
  }
  return { projectPath: project.rootPath, projectId };
}

interface SchemaResponse {
  schema: MetadataSchema;
}

function getApiErrorMessage(errorBody: unknown, fallback: string): string {
  if (
    errorBody &&
    typeof errorBody === "object" &&
    "error" in errorBody &&
    typeof (errorBody as { error?: unknown }).error === "string"
  ) {
    return (errorBody as { error: string }).error;
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
  return postToMetadataSchemaRoute({
    action: "add-field",
    projectPath: context.projectPath,
    groupId,
    field,
  });
}

export async function postRemoveField(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
): Promise<MetadataSchema> {
  return postToMetadataSchemaRoute({
    action: "remove-field",
    projectPath: context.projectPath,
    groupId,
    fieldKey,
  });
}

export async function postDeprecateField(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
): Promise<MetadataSchema> {
  return postToMetadataSchemaRoute({
    action: "deprecate-field",
    projectPath: context.projectPath,
    groupId,
    fieldKey,
  });
}

export async function postClearField(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
): Promise<MetadataSchema> {
  return postToMetadataSchemaRoute({
    action: "clear-field",
    projectPath: context.projectPath,
    groupId,
    fieldKey,
  });
}

export async function postReorderFields(
  context: MetadataSchemaRequestContext,
  groupId: string,
  newKeyOrder: string[],
): Promise<MetadataSchema> {
  return postToMetadataSchemaRoute({
    action: "reorder-fields",
    projectPath: context.projectPath,
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
  return postToMetadataSchemaRoute({
    action: "rename-field",
    projectPath: context.projectPath,
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
  return postToMetadataSchemaRoute({
    action: "update-field-options",
    projectPath: context.projectPath,
    groupId,
    fieldKey,
    options,
  });
}

export async function postAddGroup(
  context: MetadataSchemaRequestContext,
  group: MetadataGroup,
): Promise<MetadataSchema> {
  return postToMetadataSchemaRoute({
    action: "add-group",
    projectPath: context.projectPath,
    group,
  });
}

export async function postRemoveGroup(
  context: MetadataSchemaRequestContext,
  groupId: string,
): Promise<MetadataSchema> {
  return postToMetadataSchemaRoute({
    action: "remove-group",
    projectPath: context.projectPath,
    groupId,
  });
}

export async function postReorderGroups(
  context: MetadataSchemaRequestContext,
  newGroupIdOrder: string[],
): Promise<MetadataSchema> {
  return postToMetadataSchemaRoute({
    action: "reorder-groups",
    projectPath: context.projectPath,
    newGroupIdOrder,
  });
}

export async function postChangeFieldType(
  context: MetadataSchemaRequestContext,
  groupId: string,
  fieldKey: string,
  newType: MetadataFieldType,
): Promise<MetadataSchema> {
  return postToMetadataSchemaRoute({
    action: "change-field-type",
    projectPath: context.projectPath,
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
  return postToMetadataSchemaRoute({
    action: "rename-key",
    projectPath: context.projectPath,
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
  return postToMetadataSchemaRoute({
    action: "update-ref-properties",
    projectPath: context.projectPath,
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
  return postToMetadataSchemaRoute({
    action: "update-field-options-with-migration",
    projectPath: context.projectPath,
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
  return postToMetadataSchemaRoute({
    action: "change-field-type-with-migration",
    projectPath: context.projectPath,
    groupId,
    fieldKey,
    newType,
    newOptions,
    migrations,
  });
}

export async function fetchFieldValues(
  projectPath: string,
  fieldKey: string,
): Promise<FieldValueEntry[]> {
  const params = new URLSearchParams({ projectPath, fieldKey });
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
