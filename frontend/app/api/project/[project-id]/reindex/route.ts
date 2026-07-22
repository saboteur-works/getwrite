import { readFile, readdir } from "../../../../../src/lib/models/io";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { reindexMissingResources } from "../../../../../src/lib/models/inverted-index";
import { resolveProjectsDir } from "../../../../../src/lib/models/projects-dir";
import { withStorageContext } from "../../../_tenant/with-storage-context";

interface ReindexResponse {
  queued: number;
}

interface ErrorResponse {
  error: string;
}

async function findProjectRoot(
  projectsDir: string,
  projectId: string,
): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(projectsDir, entry.name);
    try {
      const raw = await readFile(path.join(candidate, "project.json"), "utf8");
      const parsed = JSON.parse(raw) as { id?: string };
      if (parsed?.id === projectId) return candidate;
    } catch {
      // skip unreadable or non-project directories
    }
  }

  return null;
}

async function reindex(
  _req: NextRequest,
  { params }: { params: Promise<{ "project-id": string }> },
): Promise<NextResponse<ReindexResponse | ErrorResponse>> {
  const projectId = (await params)["project-id"];
  const projectsDir = resolveProjectsDir();
  const projectRoot = await findProjectRoot(projectsDir, projectId);

  if (!projectRoot) {
    return NextResponse.json(
      { error: `Project ${projectId} not found.` },
      { status: 404 },
    );
  }

  const queued = await reindexMissingResources(projectRoot);
  return NextResponse.json({ queued }, { status: 200 });
}

export const POST = withStorageContext(reindex);

export const dynamic = "force-dynamic";
