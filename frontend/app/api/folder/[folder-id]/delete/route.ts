import { NextRequest, NextResponse } from "next/server";
import {
  InvalidProjectIdCoreError,
  softDeleteFolderCore,
} from "../../../../../src/lib/models/resource-crud-core";
import { respondInvalidProjectId } from "../../../../../src/lib/models/project-path";
import { isLockedAccessError } from "../../../../../src/lib/models/locked-access";
import { withStorageContext } from "../../../_tenant/with-storage-context";

interface DeleteFolderBody {
  projectId: string;
}

/**
 * `POST /api/folder/[folder-id]/delete` — soft-deletes a folder and its
 * entire descendant subtree (Feature 26 trash-ui, FR-3, Task 13).
 *
 * Mirrors `app/api/resource/[resource-id]/delete/route.ts`'s shape exactly:
 * the folder id comes from the URL segment, the project id from the POST
 * body, resolved and validated via {@link softDeleteFolderCore} (Trash UI
 * follow-ups, Task 3) rather than a client-supplied path. The actual cascade
 * (nullifying inbound `resource-ref` fields, writing the FR-20 manifest, and
 * moving every descendant resource/folder into `.trash/`) remains Task 6's
 * `softDeleteFolder`, called through that core.
 */
async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "folder-id": string }> },
): Promise<Response> {
  const folderId = (await params)["folder-id"];

  let body: DeleteFolderBody;
  try {
    body = (await req.json()) as DeleteFolderBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  try {
    await softDeleteFolderCore(body.projectId, folderId);
  } catch (err) {
    if (isLockedAccessError(err)) {
      throw err;
    }
    if (err instanceof InvalidProjectIdCoreError) {
      return respondInvalidProjectId();
    }
    return NextResponse.json(
      {
        error: "Folder not found",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ message: "Folder deleted successfully" });
}

export const POST = withStorageContext(handlePost);
