import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { ResourceType, TipTapDocument } from "../../../src/lib/models";
import { listRevisions } from "../../../src/lib/models/revision";
import { resolveProjectsDir } from "../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../src/lib/models/project-path";
import { withStorageContext } from "../_tenant/with-storage-context";

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

interface ProjectResourcesRequestBody {
  projectId: string;
  resourceId: string;
}

// Fetch project resources from the filesystem
// Body expects a server-validated projectId (resolved to the on-disk project
// directory) plus a resourceId.
async function handlePost(req: NextRequest): Promise<Response> {
  let body: ProjectResourcesRequestBody;
  try {
    body = (await req.json()) as ProjectResourcesRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(body.projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }
  const projectPath = path.join(resolveProjectsDir(), validatedProjectId);
  const { resourceId } = body;

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

export const POST = withStorageContext(handlePost);
