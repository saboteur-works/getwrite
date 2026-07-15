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
import path from "node:path";
import {
  assignTagToResource,
  unassignTagFromResource,
} from "../../../../../src/lib/models/tags";
import { resolveProjectsDir } from "../../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../../src/lib/models/project-path";
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

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(body.projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }
  const projectPath = path.join(resolveProjectsDir(), validatedProjectId);

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
