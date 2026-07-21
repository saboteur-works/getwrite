/**
 * @module app/api/project/tags/delete/route
 *
 * API endpoint for deleting a project-scoped tag and all its assignments.
 *
 * Route:
 * - `POST /api/project/tags/delete`
 *
 * Expected body:
 * - `{ projectId: string, tagId: string }`
 */
import { NextRequest, NextResponse } from "next/server";
import { deleteTag } from "../../../../../src/lib/models/tags";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

interface DeleteTagRequestBody {
  projectId: string;
  tagId: string;
}

async function handlePost(req: NextRequest): Promise<Response> {
  let body: DeleteTagRequestBody;
  try {
    body = (await req.json()) as DeleteTagRequestBody;
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
    const didDelete = await deleteTag(projectPath, body.tagId);
    return NextResponse.json({ deleted: didDelete });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete tag", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export const POST = withStorageContext(handlePost);
