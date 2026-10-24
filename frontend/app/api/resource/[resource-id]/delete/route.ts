import { NextRequest, NextResponse } from "next/server";
import { deleteResourceCore } from "../../../../../src/lib/models/resource-crud-core";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";
import {
  isResourceId,
  respondInvalidResourceId,
} from "../../../../../src/lib/models/resource-id";

interface DeleteResourceBody {
  projectId: string;
}

async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
): Promise<Response> {
  const resourceId = (await params)["resource-id"];
  if (!isResourceId(resourceId)) return respondInvalidResourceId();

  let body: DeleteResourceBody;
  try {
    body = (await req.json()) as DeleteResourceBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  // Same uniform 400 for a malformed projectId as before; the core then
  // resolves the project root itself.
  const resolved = resolveProjectPath(body.projectId);
  if (resolved instanceof Response) return resolved;

  await deleteResourceCore(body.projectId, resourceId);

  return NextResponse.json({ message: "Resource deleted successfully" });
}

export const POST = withStorageContext(handlePost);
