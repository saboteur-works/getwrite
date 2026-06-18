import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { ResourceType, TipTapDocument } from "../../../src/lib/models";
import { listRevisions } from "../../../src/lib/models/revision";

async function getProjectResource(
  projectPath: string,
  resourceId: string,
  resourceType: ResourceType,
) {
  const resourceDir = path.join(projectPath, "resources", resourceId);

  if (resourceType === "text") {
    const tiptapPath = path.join(resourceDir, "content.tiptap.json");
    let tipTapContent: TipTapDocument | null = null;
    try {
      tipTapContent = JSON.parse(
        await fs.readFile(tiptapPath, "utf-8"),
      ) as TipTapDocument;
    } catch {
      // no tiptap file
    }

    let plaintextContent: string | null = null;
    const plaintextPath = path.join(resourceDir, "content.txt");
    try {
      plaintextContent = await fs.readFile(plaintextPath, "utf-8");
    } catch {
      // no plaintext file
    }

    return { tipTapContent, plaintextContent };
  }

  throw new Error(
    `No valid content found for resource ${resourceId} at path ${resourceDir}`,
  );
}

// Fetch project resources from the filesystem
// Body expects a project file path
export async function POST(req: Request) {
  const body = await req.json();
  const { projectPath, resourceId } = body as {
    projectPath: string;
    resourceId: string;
  };
  const revisions = await listRevisions(projectPath, resourceId);
  // For now, we assume all resources are text resources and fetch accordingly.
  // In the future, we can extend this to handle different resource types based on additional parameters in the request body.
  try {
    const resourceContent = await getProjectResource(
      projectPath,
      resourceId,
      "text",
    );

    return NextResponse.json({
      message: "Project resources endpoint",
      resourceContent,
      revisions,
    });
  } catch (err) {
    console.error("Error fetching project resource:", err);
    return NextResponse.json(
      {
        message: "Error fetching project resource",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 404 },
    );
  }
}
