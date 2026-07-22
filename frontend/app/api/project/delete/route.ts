import { NextRequest, NextResponse } from "next/server";
import { rm } from "../../../../src/lib/models/io";
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

async function handlePost(req: NextRequest): Promise<Response> {
  const body = await req.json();
  const { projectId } = body as { projectId: string };

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;

  const { projectPath: projectRoot } = resolved;
  await rm(projectRoot, { recursive: true, force: true });
  return NextResponse.json({ success: true });
}

export const POST = withStorageContext(handlePost);
