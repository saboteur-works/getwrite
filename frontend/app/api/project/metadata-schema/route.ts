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

const SLUG_RE = /^[a-z0-9-]+$/;

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

interface AddFieldRequest {
  action: "add-field";
  projectPath: string;
  groupId: string;
  field: MetadataField;
}

interface RemoveFieldRequest {
  action: "remove-field";
  projectPath: string;
  groupId: string;
  fieldKey: string;
}

interface DeprecateFieldRequest {
  action: "deprecate-field";
  projectPath: string;
  groupId: string;
  fieldKey: string;
}

interface ClearFieldRequest {
  action: "clear-field";
  projectPath: string;
  groupId: string;
  fieldKey: string;
}

interface ReorderFieldsRequest {
  action: "reorder-fields";
  projectPath: string;
  groupId: string;
  newKeyOrder: string[];
}

interface RenameFieldRequest {
  action: "rename-field";
  projectPath: string;
  groupId: string;
  fieldKey: string;
  newLabel: string;
}

interface UpdateFieldOptionsRequest {
  action: "update-field-options";
  projectPath: string;
  groupId: string;
  fieldKey: string;
  options: string[];
}

interface AddGroupRequest {
  action: "add-group";
  projectPath: string;
  group: MetadataGroup;
}

interface RemoveGroupRequest {
  action: "remove-group";
  projectPath: string;
  groupId: string;
}

interface ReorderGroupsRequest {
  action: "reorder-groups";
  projectPath: string;
  newGroupIdOrder: string[];
}

interface RenameFieldKeyRequest {
  action: "rename-key";
  projectPath: string;
  groupId: string;
  fieldKey: string;
  newKey: string;
}

interface ChangeFieldTypeRequest {
  action: "change-field-type";
  projectPath: string;
  groupId: string;
  fieldKey: string;
  newType: MetadataFieldType;
}

interface UpdateRefPropertiesRequest {
  action: "update-ref-properties";
  projectPath: string;
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
  projectPath: string;
  groupId: string;
  fieldKey: string;
  newType: MetadataFieldType;
  newOptions: string[];
  migrations: Record<string, TypeMigrationEntry>;
}

interface UpdateFieldOptionsWithMigrationRequest {
  action: "update-field-options-with-migration";
  projectPath: string;
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

export async function POST(
  req: NextRequest,
): Promise<NextResponse<SchemaResponse | ErrorResponse>> {
  let body: MetadataSchemaRequestBody;
  try {
    body = (await req.json()) as MetadataSchemaRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  try {
    if (body.action === "add-field") {
      if (!SLUG_RE.test(body.field.key)) return invalidFieldKey(body.field.key);
      return okSchema(
        await addField(body.projectPath, body.groupId, body.field),
      );
    }

    if (body.action === "remove-field") {
      return okSchema(
        await removeField(body.projectPath, body.groupId, body.fieldKey),
      );
    }

    if (body.action === "deprecate-field") {
      return okSchema(
        await deprecateField(body.projectPath, body.groupId, body.fieldKey),
      );
    }

    if (body.action === "clear-field") {
      return okSchema(
        await clearField(body.projectPath, body.groupId, body.fieldKey),
      );
    }

    if (body.action === "reorder-fields") {
      return okSchema(
        await reorderFields(body.projectPath, body.groupId, body.newKeyOrder),
      );
    }

    if (body.action === "rename-field") {
      return okSchema(
        await renameField(
          body.projectPath,
          body.groupId,
          body.fieldKey,
          body.newLabel,
        ),
      );
    }

    if (body.action === "update-field-options") {
      return okSchema(
        await updateFieldOptions(
          body.projectPath,
          body.groupId,
          body.fieldKey,
          body.options,
        ),
      );
    }

    if (body.action === "add-group") {
      return okSchema(await addGroup(body.projectPath, body.group));
    }

    if (body.action === "remove-group") {
      return okSchema(await removeGroup(body.projectPath, body.groupId));
    }

    if (body.action === "reorder-groups") {
      return okSchema(
        await reorderGroups(body.projectPath, body.newGroupIdOrder),
      );
    }

    if (body.action === "rename-key") {
      if (!SLUG_RE.test(body.newKey)) return invalidFieldKey(body.newKey);
      return okSchema(
        await renameFieldKey(
          body.projectPath,
          body.groupId,
          body.fieldKey,
          body.newKey,
        ),
      );
    }

    if (body.action === "change-field-type") {
      return okSchema(
        await changeFieldType(
          body.projectPath,
          body.groupId,
          body.fieldKey,
          body.newType,
        ),
      );
    }

    if (body.action === "change-field-type-with-migration") {
      return okSchema(
        await changeFieldTypeWithMigration(
          body.projectPath,
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
          body.projectPath,
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
          body.projectPath,
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
// GET /api/project/metadata-schema?projectPath=...&fieldKey=...
// Returns a serialized frequency map of distinct values for a single field.
// ---------------------------------------------------------------------------

export interface FieldValueEntry {
  /** Canonical string key (use NULL_VALUE_KEY / MISSING_VALUE_KEY sentinels). */
  canonicalKey: string;
  count: number;
  /** One representative value for display and type introspection. */
  sample: unknown;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const projectPath = searchParams.get("projectPath");
  const fieldKey = searchParams.get("fieldKey");

  if (!projectPath) {
    return NextResponse.json(
      { error: "projectPath is required" },
      { status: 400 },
    );
  }
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
