/**
 * @module app/api/project/metadata-schema/route
 *
 * API endpoint for managing the dynamic metadata schema stored in project.json.
 *
 * Route:
 * - `POST /api/project/metadata-schema`
 *
 * All requests are action-discriminated via the `action` field in the body.
 * Every success response returns the full updated schema so Redux can replace
 * state without a re-fetch.
 *
 * Slug validation (`/^[a-z0-9-]+$/`) is applied here, in the `add-field`
 * handler only, so that persisted camelCase built-in keys (e.g. `storyDate`)
 * round-trip cleanly through `ProjectConfigSchema.safeParse()` without hitting
 * this guard.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  addField,
  removeField,
  deprecateField,
  clearField,
  reorderFields,
  renameField,
  updateFieldOptions,
  updateFieldOptionsWithMigration,
  updateRefProperties,
  changeFieldType,
  changeFieldTypeWithMigration,
  addGroup,
  removeGroup,
  reorderGroups,
  renameFieldKey,
} from "../../../../src/lib/models/metadata-schema";
import type {
  TypeMigrationEntry,
  OptionsMigrationEntry,
} from "../../../../src/lib/models/metadata-schema";
import {
  scanAllFieldValues,
  NULL_VALUE_KEY,
  MISSING_VALUE_KEY,
} from "../../../../src/lib/models/field-values";
import type {
  MetadataField,
  MetadataFieldType,
  MetadataGroup,
  MetadataSchema,
} from "../../../../src/lib/models/types";
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

const SLUG_RE = /^[a-z0-9-]+$/;

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

interface AddFieldRequest {
  action: "add-field";
  projectId: string;
  groupId: string;
  field: MetadataField;
}

interface RemoveFieldRequest {
  action: "remove-field";
  projectId: string;
  groupId: string;
  fieldKey: string;
}

interface DeprecateFieldRequest {
  action: "deprecate-field";
  projectId: string;
  groupId: string;
  fieldKey: string;
}

interface ClearFieldRequest {
  action: "clear-field";
  projectId: string;
  groupId: string;
  fieldKey: string;
}

interface ReorderFieldsRequest {
  action: "reorder-fields";
  projectId: string;
  groupId: string;
  newKeyOrder: string[];
}

interface RenameFieldRequest {
  action: "rename-field";
  projectId: string;
  groupId: string;
  fieldKey: string;
  newLabel: string;
}

interface UpdateFieldOptionsRequest {
  action: "update-field-options";
  projectId: string;
  groupId: string;
  fieldKey: string;
  options: string[];
}

interface AddGroupRequest {
  action: "add-group";
  projectId: string;
  group: MetadataGroup;
}

interface RemoveGroupRequest {
  action: "remove-group";
  projectId: string;
  groupId: string;
}

interface ReorderGroupsRequest {
  action: "reorder-groups";
  projectId: string;
  newGroupIdOrder: string[];
}

interface RenameFieldKeyRequest {
  action: "rename-key";
  projectId: string;
  groupId: string;
  fieldKey: string;
  newKey: string;
}

interface ChangeFieldTypeRequest {
  action: "change-field-type";
  projectId: string;
  groupId: string;
  fieldKey: string;
  newType: MetadataFieldType;
}

interface UpdateRefPropertiesRequest {
  action: "update-ref-properties";
  projectId: string;
  groupId: string;
  fieldKey: string;
  /** `null` clears the property; absent leaves it unchanged. */
  refFolder?: string | null;
  /** `null` clears the property; absent leaves it unchanged. */
  includeSubfolders?: boolean | null;
  /** `null` clears the property; absent leaves it unchanged. */
  maxSelections?: number | null;
}

interface ChangeFieldTypeWithMigrationRequest {
  action: "change-field-type-with-migration";
  projectId: string;
  groupId: string;
  fieldKey: string;
  newType: MetadataFieldType;
  newOptions: string[];
  migrations: Record<string, TypeMigrationEntry>;
}

interface UpdateFieldOptionsWithMigrationRequest {
  action: "update-field-options-with-migration";
  projectId: string;
  groupId: string;
  fieldKey: string;
  newOptions: string[];
  migrations: Record<string, OptionsMigrationEntry>;
}

type MetadataSchemaRequestBody =
  | AddFieldRequest
  | RemoveFieldRequest
  | DeprecateFieldRequest
  | ClearFieldRequest
  | ReorderFieldsRequest
  | RenameFieldRequest
  | UpdateFieldOptionsRequest
  | AddGroupRequest
  | RemoveGroupRequest
  | ReorderGroupsRequest
  | RenameFieldKeyRequest
  | ChangeFieldTypeRequest
  | UpdateRefPropertiesRequest
  | ChangeFieldTypeWithMigrationRequest
  | UpdateFieldOptionsWithMigrationRequest;

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface SchemaResponse {
  schema: MetadataSchema;
}

interface ErrorResponse {
  error: string;
  details: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okSchema(schema: MetadataSchema): NextResponse<SchemaResponse> {
  return NextResponse.json({ schema });
}

function invalidFieldKey(key: string): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: "Invalid field key",
      details: `Key "${key}" must match /^[a-z0-9-]+$/`,
    },
    { status: 400 },
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handlePost(req: NextRequest): Promise<Response> {
  let body: MetadataSchemaRequestBody;
  try {
    body = (await req.json()) as MetadataSchemaRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const resolved = resolveProjectPath(body.projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  try {
    if (body.action === "add-field") {
      if (!SLUG_RE.test(body.field.key)) return invalidFieldKey(body.field.key);
      return okSchema(await addField(projectPath, body.groupId, body.field));
    }

    if (body.action === "remove-field") {
      return okSchema(
        await removeField(projectPath, body.groupId, body.fieldKey),
      );
    }

    if (body.action === "deprecate-field") {
      return okSchema(
        await deprecateField(projectPath, body.groupId, body.fieldKey),
      );
    }

    if (body.action === "clear-field") {
      return okSchema(
        await clearField(projectPath, body.groupId, body.fieldKey),
      );
    }

    if (body.action === "reorder-fields") {
      return okSchema(
        await reorderFields(projectPath, body.groupId, body.newKeyOrder),
      );
    }

    if (body.action === "rename-field") {
      return okSchema(
        await renameField(
          projectPath,
          body.groupId,
          body.fieldKey,
          body.newLabel,
        ),
      );
    }

    if (body.action === "update-field-options") {
      return okSchema(
        await updateFieldOptions(
          projectPath,
          body.groupId,
          body.fieldKey,
          body.options,
        ),
      );
    }

    if (body.action === "add-group") {
      return okSchema(await addGroup(projectPath, body.group));
    }

    if (body.action === "remove-group") {
      return okSchema(await removeGroup(projectPath, body.groupId));
    }

    if (body.action === "reorder-groups") {
      return okSchema(await reorderGroups(projectPath, body.newGroupIdOrder));
    }

    if (body.action === "rename-key") {
      if (!SLUG_RE.test(body.newKey)) return invalidFieldKey(body.newKey);
      return okSchema(
        await renameFieldKey(
          projectPath,
          body.groupId,
          body.fieldKey,
          body.newKey,
        ),
      );
    }

    if (body.action === "change-field-type") {
      return okSchema(
        await changeFieldType(
          projectPath,
          body.groupId,
          body.fieldKey,
          body.newType,
        ),
      );
    }

    if (body.action === "change-field-type-with-migration") {
      return okSchema(
        await changeFieldTypeWithMigration(
          projectPath,
          body.groupId,
          body.fieldKey,
          body.newType,
          body.newOptions,
          body.migrations,
        ),
      );
    }

    if (body.action === "update-field-options-with-migration") {
      return okSchema(
        await updateFieldOptionsWithMigration(
          projectPath,
          body.groupId,
          body.fieldKey,
          body.newOptions,
          body.migrations,
        ),
      );
    }

    if (body.action === "update-ref-properties") {
      const updates: {
        refFolder?: string | null;
        includeSubfolders?: boolean | null;
        maxSelections?: number | null;
      } = {};
      if ("refFolder" in body) updates.refFolder = body.refFolder;
      if ("includeSubfolders" in body)
        updates.includeSubfolders = body.includeSubfolders;
      if ("maxSelections" in body) updates.maxSelections = body.maxSelections;
      return okSchema(
        await updateRefProperties(
          projectPath,
          body.groupId,
          body.fieldKey,
          updates,
        ),
      );
    }

    return NextResponse.json(
      {
        error: "Invalid action",
        details:
          "Expected one of: add-field, remove-field, reorder-fields, rename-field, update-field-options, update-ref-properties, change-field-type, add-group, remove-group, reorder-groups, rename-key",
      },
      { status: 400 },
    );
  } catch (error) {
    const message = (error as Error).message;
    const isClientError =
      /locked/i.test(message) ||
      /not found/i.test(message) ||
      /already exists/i.test(message) ||
      /Invalid field key/i.test(message) ||
      /must contain exactly/i.test(message);

    return NextResponse.json(
      { error: "Metadata schema operation failed", details: message },
      { status: isClientError ? 400 : 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/project/metadata-schema?projectId=...&fieldKey=...
// Returns a serialized frequency map of distinct values for a single field.
// ---------------------------------------------------------------------------

export interface FieldValueEntry {
  /** Canonical string key (use NULL_VALUE_KEY / MISSING_VALUE_KEY sentinels). */
  canonicalKey: string;
  count: number;
  /** One representative value for display and type introspection. */
  sample: unknown;
}

async function handleGet(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get("projectId");
  const fieldKey = searchParams.get("fieldKey");

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  if (!fieldKey) {
    return NextResponse.json(
      { error: "fieldKey is required" },
      { status: 400 },
    );
  }

  try {
    const map = await scanAllFieldValues(projectPath, fieldKey);
    const values: FieldValueEntry[] = Array.from(
      map.entries(),
      ([canonicalKey, entry]) => ({
        canonicalKey,
        count: entry.count,
        sample: entry.sample,
      }),
    );
    return NextResponse.json({
      values,
      nullKey: NULL_VALUE_KEY,
      missingKey: MISSING_VALUE_KEY,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to enumerate field values",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}

export const POST = withStorageContext(handlePost);
export const GET = withStorageContext(handleGet);
