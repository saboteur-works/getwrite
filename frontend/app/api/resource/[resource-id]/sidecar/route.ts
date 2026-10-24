import { NextRequest, NextResponse } from "next/server";
import {
  InvalidClearKeysCoreError,
  InvalidProjectIdCoreError,
  InvalidResourceSubtypeCoreError,
  updateSidecarCore,
} from "../../../../../src/lib/models/resource-crud-core";
import { respondInvalidProjectId } from "../../../../../src/lib/models/project-path";
import {
  RESOURCE_GONE_CODE,
  ResourceGoneError,
} from "../../../../../src/lib/models/resource-gone-error";
import { withStorageContext } from "../../../_tenant/with-storage-context";
import {
  isResourceId,
  respondInvalidResourceId,
} from "../../../../../src/lib/models/resource-id";

interface SidecarUpdateBody {
  projectId: string;
  updatedResource: Record<string, unknown>;
  clearKeys?: string[];
}

// Updates to resource metadata (notes, status, characters, locations, items, pov)
async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
): Promise<Response> {
  const resourceId = (await params)["resource-id"];
  if (!isResourceId(resourceId)) return respondInvalidResourceId();

  let body: SidecarUpdateBody;
  try {
    body = (await req.json()) as SidecarUpdateBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  try {
    await updateSidecarCore(
      body.projectId,
      resourceId,
      body.updatedResource,
      body.clearKeys,
    );
    return NextResponse.json({ message: "Sidecar updated." });
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) {
      return respondInvalidProjectId();
    }
    if (error instanceof InvalidClearKeysCoreError) {
      return NextResponse.json(
        { error: "Invalid clearKeys", details: error.message },
        { status: 400 },
      );
    }
    if (error instanceof ResourceGoneError) {
      return NextResponse.json(
        { error: "Resource not found", code: RESOURCE_GONE_CODE },
        { status: 404 },
      );
    }
    if (error instanceof InvalidResourceSubtypeCoreError) {
      return NextResponse.json(
        { error: "Invalid resourceSubtype", details: error.message },
        { status: 400 },
      );
    }
    throw error;
  }
}

export const POST = withStorageContext(handlePost);
