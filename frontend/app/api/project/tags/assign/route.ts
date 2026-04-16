/**
 * @module app/api/project/tags/assign/route
 *
 * API endpoint for assigning or unassigning a tag from a resource.
 *
 * Route:
 * - `POST /api/project/tags/assign`
 *
 * Expected body:
 * - `{ projectPath: string, resourceId: string, tagId: string, assign: boolean }`
 */
import { NextRequest, NextResponse } from "next/server";
import {
    assignTagToResource,
    unassignTagFromResource,
} from "../../../../../src/lib/models/tags";

interface AssignTagRequestBody {
    projectPath: string;
    resourceId: string;
    tagId: string;
    assign: boolean;
}

interface ErrorResponse {
    error: string;
    details: string;
}

export async function POST(
    req: NextRequest,
): Promise<NextResponse<Record<string, never> | ErrorResponse>> {
    try {
        const body = (await req.json()) as AssignTagRequestBody;
        if (body.assign) {
            await assignTagToResource(
                body.projectPath,
                body.resourceId,
                body.tagId,
            );
        } else {
            await unassignTagFromResource(
                body.projectPath,
                body.resourceId,
                body.tagId,
            );
        }
        return NextResponse.json({});
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to update tag assignment",
                details: (error as Error).message,
            },
            { status: 500 },
        );
    }
}
