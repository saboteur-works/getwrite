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
    reorderFields,
    renameField,
    updateFieldOptions,
    addGroup,
    removeGroup,
    reorderGroups,
    renameFieldKey,
} from "../../../../src/lib/models/metadata-schema";
import type {
    MetadataField,
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

type MetadataSchemaRequestBody =
    | AddFieldRequest
    | RemoveFieldRequest
    | ReorderFieldsRequest
    | RenameFieldRequest
    | UpdateFieldOptionsRequest
    | AddGroupRequest
    | RemoveGroupRequest
    | ReorderGroupsRequest
    | RenameFieldKeyRequest;

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
            if (!SLUG_RE.test(body.field.key)) {
                return NextResponse.json(
                    {
                        error: "Invalid field key",
                        details: `Key "${body.field.key}" must match /^[a-z0-9-]+$/`,
                    },
                    { status: 400 },
                );
            }
            const schema = await addField(
                body.projectPath,
                body.groupId,
                body.field,
            );
            return NextResponse.json({ schema });
        }

        if (body.action === "remove-field") {
            const schema = await removeField(
                body.projectPath,
                body.groupId,
                body.fieldKey,
            );
            return NextResponse.json({ schema });
        }

        if (body.action === "reorder-fields") {
            const schema = await reorderFields(
                body.projectPath,
                body.groupId,
                body.newKeyOrder,
            );
            return NextResponse.json({ schema });
        }

        if (body.action === "rename-field") {
            const schema = await renameField(
                body.projectPath,
                body.groupId,
                body.fieldKey,
                body.newLabel,
            );
            return NextResponse.json({ schema });
        }

        if (body.action === "update-field-options") {
            const schema = await updateFieldOptions(
                body.projectPath,
                body.groupId,
                body.fieldKey,
                body.options,
            );
            return NextResponse.json({ schema });
        }

        if (body.action === "add-group") {
            const schema = await addGroup(body.projectPath, body.group);
            return NextResponse.json({ schema });
        }

        if (body.action === "remove-group") {
            const schema = await removeGroup(body.projectPath, body.groupId);
            return NextResponse.json({ schema });
        }

        if (body.action === "reorder-groups") {
            const schema = await reorderGroups(
                body.projectPath,
                body.newGroupIdOrder,
            );
            return NextResponse.json({ schema });
        }

        if (body.action === "rename-key") {
            if (!SLUG_RE.test(body.newKey)) {
                return NextResponse.json(
                    {
                        error: "Invalid field key",
                        details: `Key "${body.newKey}" must match /^[a-z0-9-]+$/`,
                    },
                    { status: 400 },
                );
            }
            const schema = await renameFieldKey(
                body.projectPath,
                body.groupId,
                body.fieldKey,
                body.newKey,
            );
            return NextResponse.json({ schema });
        }

        return NextResponse.json(
            {
                error: "Invalid action",
                details:
                    "Expected one of: add-field, remove-field, reorder-fields, rename-field, update-field-options, add-group, remove-group, reorder-groups, rename-key",
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

        if (isClientError) {
            return NextResponse.json(
                { error: "Metadata schema operation failed", details: message },
                { status: 400 },
            );
        }

        return NextResponse.json(
            { error: "Metadata schema operation failed", details: message },
            { status: 500 },
        );
    }
}
