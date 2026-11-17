import { NextRequest, NextResponse } from "next/server";
import type { CompileBody } from "../../../../src/lib/export/types";
import {
  CitationsCompileError,
  CitationsUnavailableError,
  InvalidCitationsOptionError,
  compilePdfCore,
  parseCompileCitationsOption,
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
    parseCompileCitationsOption(body.citations);
  } catch (err) {
    if (err instanceof InvalidCitationsOptionError)
      return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  let resolved;
  try {
    resolved = await compilePdfCore(body);
  } catch (err) {
    if (err instanceof InvalidProjectIdCoreError)
      return respondInvalidProjectId();
    if (err instanceof CitationsUnavailableError)
      return NextResponse.json({ error: err.message }, { status: 501 });
    // The message names what failed and carries no client input, but may name
    // a resource, so only the status goes to the client with it and nothing is
    // logged (docs/standards/failure-visibility.md, security.md).
    if (err instanceof CitationsCompileError)
      return NextResponse.json(
        { error: err.message },
        { status: err.kind === "writer" ? 422 : 500 },
      );
    throw err;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${resolved.filename}"`,
  };
  if (resolved.warning === "font-fallback") {
    headers["X-Compile-Warning"] = "font-fallback";
  }

  return new Response(new Uint8Array(resolved.arrayBuffer), { headers });
}

export const POST = withStorageContext(handlePost);
