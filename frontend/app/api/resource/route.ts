import path from "node:path";
import { NextResponse } from "next/server";
import {
  createResourceOfType,
  CreateResourceOpts,
  writeResourceToFile,
} from "../../../src/lib/models";
import { loadProjectConfig } from "../../../src/lib/models/project-config";
import { writeRevision } from "../../../src/lib/models/revision";
import { resolveInitialRevisionName } from "../../../src/lib/models/resource-revision";
import type { TextResource } from "../../../src/lib/models/types";
import { resolveProjectsDir } from "../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../src/lib/models/project-path";
import { withStorageContext } from "../_tenant/with-storage-context";

interface SaveResourceBody {
  projectId: string;
  resourceData: CreateResourceOpts;
}

async function handlePost(req: Request): Promise<Response> {
  let body: SaveResourceBody;
  try {
    body = (await req.json()) as SaveResourceBody;
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

  try {
    const { resourceData } = body;
    const resource = createResourceOfType(resourceData.type, resourceData);
    await writeResourceToFile(projectPath, resource);

    if (resource.type === "text") {
      const config = await loadProjectConfig(projectPath).catch(() => null);
      const revisionName = config
        ? resolveInitialRevisionName(config)
        : "Initial Draft";
      const content = (resource as TextResource).plainText ?? "";
      await writeRevision(projectPath, resource.id, 1, content, {
        isCanonical: true,
        metadata: { name: revisionName },
      });
    }

    return NextResponse.json({ success: true, resource });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save resource", details: (error as Error).message },
      { status: 500 },
    );
  }
}

export const POST = withStorageContext(handlePost);
