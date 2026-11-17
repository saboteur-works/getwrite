import { NextResponse, NextRequest } from "next/server";
import type { CompileBody } from "../../../../src/lib/export/types";
import {
  CitationsNotSupportedForFormatError,
  compileTextCore,
} from "../../../../src/lib/models/compile-core";
import { InvalidProjectIdCoreError } from "../../../../src/lib/models/project-crud-core";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";
import {
  areResourceIds,
  respondInvalidResourceId,
} from "../../../../src/lib/models/resource-id";

async function handlePost(req: NextRequest) {
  const body = (await req.json()) as CompileBody;
  if (!areResourceIds(body.resourceIds)) return respondInvalidResourceId();

  try {
    const resolved = await compileTextCore(body);
    return NextResponse.json(resolved);
  } catch (err) {
    if (err instanceof InvalidProjectIdCoreError)
      return respondInvalidProjectId();
    if (err instanceof CitationsNotSupportedForFormatError)
      return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export const POST = withStorageContext(handlePost);
