import { NextRequest, NextResponse } from "next/server";
import { readSidecar } from "../../../../../src/lib/models/sidecar";
import {
  nullifyResourceRefs,
  softDeleteResource,
} from "../../../../../src/lib/models/trash";
import { getSchema } from "../../../../../src/lib/models/metadata-schema";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

interface DeleteResourceBody {
  projectId: string;
}

async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
): Promise<Response> {
  const resourceId = (await params)["resource-id"];

  let body: DeleteResourceBody;
  try {
    body = (await req.json()) as DeleteResourceBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const resolved = resolveProjectPath(body.projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath: projectRoot } = resolved;

  const sidecar = await readSidecar(projectRoot, resourceId);
  const deletedName = typeof sidecar?.name === "string" ? sidecar.name : "";

  let resourceRefKeys: string[] = [];
  try {
    const schema = await getSchema(projectRoot);
    resourceRefKeys = schema.groups
      .flatMap((g) => g.fields)
      .filter((f) => f.type === "resource-ref")
      .map((f) => f.key);
  } catch {
    // Schema unreadable — proceed without nullification
  }

  await nullifyResourceRefs(
    projectRoot,
    resourceId,
    deletedName,
    resourceRefKeys,
  );

  await softDeleteResource(projectRoot, resourceId);

  return NextResponse.json({ message: "Resource deleted successfully" });
}

export const POST = withStorageContext(handlePost);
