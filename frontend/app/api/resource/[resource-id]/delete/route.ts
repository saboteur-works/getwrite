import { NextRequest, NextResponse } from "next/server";
import { readSidecar } from "../../../../../src/lib/models/sidecar";
import {
  nullifyResourceRefs,
  softDeleteResource,
} from "../../../../../src/lib/models/trash";
import { getSchema } from "../../../../../src/lib/models/metadata-schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
) {
  const resourceId = (await params)["resource-id"];
  const body = await req.json();
  const { projectRoot } = body as { projectRoot: string };

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
