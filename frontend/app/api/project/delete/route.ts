import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectsDir } from "../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

async function handlePost(req: NextRequest): Promise<Response> {
  const body = await req.json();
  const { projectId } = body as { projectId: string };

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }

  const projectRoot = path.join(resolveProjectsDir(), validatedProjectId);
  await fs.rm(projectRoot, { recursive: true, force: true });
  return NextResponse.json({ success: true });
}

export const POST = withStorageContext(handlePost);
