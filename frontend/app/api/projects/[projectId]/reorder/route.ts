import type { NextRequest } from "next/server";
import {
  InvalidProjectIdCoreError,
  ReorderProjectNotFoundError,
  ReorderSaveError,
  reorderResourcesCore,
} from "../../../../../src/lib/models/resource-crud-core";
import { respondInvalidProjectId } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";
import {
  isResourceId,
  respondInvalidResourceId,
} from "../../../../../src/lib/models/resource-id";

async function reorder(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const projectId = (await params)["projectId"];
  const body = await req.json().catch(() => ({}));
  const folderOrder: Array<{
    id: string;
    orderIndex: number;
    folderId?: string | null;
  }> = body.folderOrder ?? [];
  const resourceOrder: Array<{
    id: string;
    orderIndex: number;
    folderId?: string | null;
  }> = body.resourceOrder ?? [];

  // Every id, and every parent folder id stored with it, must be a UUID: a
  // resource id becomes a sidecar file name.
  const isOrderEntryValid = (entry: {
    id: unknown;
    folderId?: unknown;
  }): boolean =>
    isResourceId(entry.id) &&
    (entry.folderId == null || isResourceId(entry.folderId));
  if (
    !Array.isArray(folderOrder) ||
    !Array.isArray(resourceOrder) ||
    !folderOrder.every(isOrderEntryValid) ||
    !resourceOrder.every(isOrderEntryValid)
  ) {
    return respondInvalidResourceId();
  }

  try {
    await reorderResourcesCore(projectId, { folderOrder, resourceOrder });
  } catch (err) {
    if (err instanceof InvalidProjectIdCoreError) {
      return respondInvalidProjectId();
    }
    if (err instanceof ReorderProjectNotFoundError) {
      return new Response(JSON.stringify({ error: "project not found" }), {
        status: 404,
      });
    }
    if (err instanceof ReorderSaveError) {
      return new Response(
        JSON.stringify({ error: err.message, failedIds: err.failedIds }),
        { status: 500 },
      );
    }
    throw err;
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

export const POST = withStorageContext(reorder);

export const GET = withStorageContext(
  () => new Response(null, { status: 200 }),
);
