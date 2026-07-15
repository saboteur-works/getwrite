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
import path from "node:path";
import { deleteTag } from "../../../../../src/lib/models/tags";
import { resolveProjectsDir } from "../../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../../src/lib/models/project-path";
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

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(body.projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }
  const projectPath = path.join(resolveProjectsDir(), validatedProjectId);

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
