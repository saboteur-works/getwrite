/**
 * @module app/api/project/tags/assign/route
 *
 * API endpoint for assigning or unassigning a tag from a resource.
 *
 * Route:
 * - `POST /api/project/tags/assign`
 *
 * Expected body:
 * - `{ projectId: string, resourceId: string, tagId: string, assign: boolean }`
 */
import { NextRequest, NextResponse } from "next/server";
import {
  assignTagToResource,
  unassignTagFromResource,
} from "../../../../../src/lib/models/tags";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

interface AssignTagRequestBody {
  projectId: string;
  resourceId: string;
  tagId: string;
  assign: boolean;
}

async function handlePost(req: NextRequest): Promise<Response> {
  let body: AssignTagRequestBody;
  try {
    body = (await req.json()) as AssignTagRequestBody;
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
    if (body.assign) {
      await assignTagToResource(projectPath, body.resourceId, body.tagId);
    } else {
      await unassignTagFromResource(projectPath, body.resourceId, body.tagId);
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

export const POST = withStorageContext(handlePost);
