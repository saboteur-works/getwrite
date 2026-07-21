import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

async function handlePost(req: NextRequest): Promise<Response> {
  const body = await req.json();
  const { projectId, newName } = body as { projectId: string; newName: string };

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;

  const { projectPath } = resolved;
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
