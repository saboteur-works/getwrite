import { NextResponse, NextRequest } from "next/server";
import type { ExportCoreBody } from "../../../../src/lib/models/export-core";
import { exportTextCore } from "../../../../src/lib/models/export-core";
import { InvalidProjectIdCoreError } from "../../../../src/lib/models/project-crud-core";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";
import {
  areResourceIds,
  respondInvalidResourceId,
} from "../../../../src/lib/models/resource-id";

async function handlePost(req: NextRequest) {
  const body = (await req.json()) as ExportCoreBody;
  if (!areResourceIds(body.resourceIds)) return respondInvalidResourceId();

  try {
    const resolved = await exportTextCore(body);
    return NextResponse.json(resolved);
  } catch (err) {
    if (err instanceof InvalidProjectIdCoreError)
      return respondInvalidProjectId();
    throw err;
  }
}

export const POST = withStorageContext(handlePost);
