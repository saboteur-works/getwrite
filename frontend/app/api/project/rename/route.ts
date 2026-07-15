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
  const { projectId, newName } = body as { projectId: string; newName: string };

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }

  const projectPath = path.join(resolveProjectsDir(), validatedProjectId);
  const projectFilePath = path.join(projectPath, "project.json");
  const projectFileContent = await fs.readFile(projectFilePath, "utf-8");
  const projectData = JSON.parse(projectFileContent);
  projectData.name = newName;
  await fs.writeFile(
    projectFilePath,
    JSON.stringify(projectData, null, 2),
    "utf-8",
  );
  return NextResponse.json({ success: true, data: projectData });
}

export const POST = withStorageContext(handlePost);
