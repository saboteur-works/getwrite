/**
 * @module app/api/project/tags/route
 *
 * API endpoint for listing, creating, and querying project-scoped tags.
 *
 * Route:
 * - `POST /api/project/tags`
 *
 * Expected body (list all project tags):
 * - `{ action: "list", projectPath: string }`
 *
 * Expected body (create tag):
 * - `{ action: "create", projectPath: string, name: string, color?: string }`
 *
 * Expected body (get tag IDs assigned to a resource):
 * - `{ action: "assignments", projectPath: string, resourceId: string }`
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { listTags, createTag } from "../../../../src/lib/models/tags";
import { PROJECT_FILENAME } from "../../../../src/lib/models/project-config";
import type { Tag, Project } from "../../../../src/lib/models/types";

interface ListTagsRequest {
    action: "list";
    projectPath: string;
}

interface CreateTagRequest {
    action: "create";
    projectPath: string;
    name: string;
    color?: string;
}

interface AssignmentsRequest {
    action: "assignments";
    projectPath: string;
    resourceId: string;
}

type TagsRequestBody = ListTagsRequest | CreateTagRequest | AssignmentsRequest;

interface ListTagsResponse {
    tags: Tag[];
}

interface CreateTagResponse {
    tag: Tag;
}

interface AssignmentsResponse {
    tagIds: string[];
}

interface ErrorResponse {
    error: string;
    details: string;
}

export async function POST(
    req: NextRequest,
): Promise<
    NextResponse<
        | ListTagsResponse
        | CreateTagResponse
        | AssignmentsResponse
        | ErrorResponse
    >
> {
    try {
        const body = (await req.json()) as TagsRequestBody;

        if (body.action === "list") {
            const tags = await listTags(body.projectPath);
            return NextResponse.json({ tags });
        }

        if (body.action === "create") {
            const tag = await createTag(
                body.projectPath,
                body.name,
                body.color,
            );
            return NextResponse.json({ tag });
        }

        if (body.action === "assignments") {
            const raw = await fs.readFile(
                path.join(body.projectPath, PROJECT_FILENAME),
                "utf8",
            );
            const project = JSON.parse(raw) as Project;
            const tagIds =
                project.config?.tagAssignments?.[body.resourceId] ?? [];
            return NextResponse.json({ tagIds });
        }

        return NextResponse.json(
            {
                error: "Invalid action",
                details: "Expected 'list', 'create', or 'assignments'",
            },
            { status: 400 },
        );
    } catch (error) {
        return NextResponse.json(
            {
                error: "Tags operation failed",
                details: (error as Error).message,
            },
            { status: 500 },
        );
    }
}
