import { NextRequest, NextResponse } from "next/server";
import { softDeleteFolder } from "../../../../../src/lib/models/trash";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
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
 * body, resolved and validated via `resolveProjectPath` — never a
 * client-supplied path. The actual cascade (nullifying inbound
 * `resource-ref` fields, writing the FR-20 manifest, and moving every
 * descendant resource/folder into `.trash/`) is Task 6's
 * `softDeleteFolder`.
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

  const resolved = resolveProjectPath(body.projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath: projectRoot } = resolved;

  try {
    await softDeleteFolder(projectRoot, folderId);
  } catch (err) {
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
