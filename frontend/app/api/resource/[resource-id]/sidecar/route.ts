import { NextRequest, NextResponse } from "next/server";
import {
  readSidecar,
  writeSidecar,
} from "../../../../../src/lib/models/sidecar";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

interface SidecarUpdateBody {
  projectId: string;
  updatedResource: Record<string, unknown>;
}

// Updates to resource metadata (notes, status, characters, locations, items, pov)
async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
): Promise<Response> {
  const resourceId = (await params)["resource-id"];

  let body: SidecarUpdateBody;
  try {
    body = (await req.json()) as SidecarUpdateBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const resolved = resolveProjectPath(body.projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath: projectRoot } = resolved;
  const { updatedResource } = body;

  const existing = await readSidecar(projectRoot, resourceId).catch(() => null);

  // Merge incoming update with existing sidecar data, preserving structural
  // fields that only the reorder route may change.
  const merged = {
    ...(existing ?? {}),
    ...updatedResource,
    orderIndex:
      existing?.orderIndex ??
      (updatedResource.orderIndex as number | undefined) ??
      0,
    folderId:
      existing?.folderId ??
      (updatedResource.folderId as string | null | undefined) ??
      null,
  };

  await writeSidecar(projectRoot, resourceId, merged);
  return NextResponse.json({ message: "Sidecar updated." });
}

export const POST = withStorageContext(handlePost);
