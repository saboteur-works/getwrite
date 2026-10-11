import { NextRequest, NextResponse } from "next/server";
import {
  deleteProjectCore,
  InvalidProjectIdCoreError,
} from "../../../../src/lib/models/project-crud-core";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import { checkLimit } from "../../../../src/lib/sharing/limits-check";
import { withStorageContext } from "../../_tenant/with-storage-context";

async function handlePost(req: NextRequest): Promise<Response> {
  const body = await req.json();
  const { projectId } = body as { projectId: string };

  try {
    await deleteProjectCore(projectId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) {
      return respondInvalidProjectId();
    }
    throw error;
  }
}

const wrappedPost = withStorageContext(handlePost);

/**
 * Feature 77 (FR-11, FR-13): the limit check runs before `withStorageContext`
 * (tenant/session resolution) and before the handler parses the body, so the
 * refusal is the first thing that happens for a request.
 */
export async function POST(req: NextRequest): Promise<Response> {
  return checkLimit(req, "projectDeletion") ?? wrappedPost(req);
}
