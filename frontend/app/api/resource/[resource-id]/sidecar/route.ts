import { NextRequest, NextResponse } from "next/server";
import {
  readSidecar,
  writeSidecar,
} from "../../../../../src/lib/models/sidecar";

// Updates to resource metadata (notes, status, characters, locations, items, pov)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
) {
  const resourceId = await (await params)["resource-id"];
  const body = await req.json();
  const { projectRoot, updatedResource } = body as {
    projectRoot: string;
    updatedResource: Record<string, unknown>;
  };

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
