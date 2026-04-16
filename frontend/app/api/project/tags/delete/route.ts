/**
 * @module app/api/project/tags/delete/route
 *
 * API endpoint for deleting a project-scoped tag and all its assignments.
 *
 * Route:
 * - `POST /api/project/tags/delete`
 *
 * Expected body:
 * - `{ projectPath: string, tagId: string }`
 */
import { NextRequest, NextResponse } from "next/server";
import { deleteTag } from "../../../../../src/lib/models/tags";

interface DeleteTagRequestBody {
    projectPath: string;
    tagId: string;
}

interface DeleteTagResponse {
    deleted: boolean;
}

interface ErrorResponse {
    error: string;
    details: string;
}

export async function POST(
    req: NextRequest,
): Promise<NextResponse<DeleteTagResponse | ErrorResponse>> {
    try {
        const body = (await req.json()) as DeleteTagRequestBody;
        const deleted = await deleteTag(body.projectPath, body.tagId);
        return NextResponse.json({ deleted });
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to delete tag",
                details: (error as Error).message,
            },
            { status: 500 },
        );
    }
}
