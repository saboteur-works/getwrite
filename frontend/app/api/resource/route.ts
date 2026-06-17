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

export async function POST(req: Request) {
  try {
    const { projectPath, resourceData } = (await req.json()) as {
      projectPath: string;
      resourceData: CreateResourceOpts;
    };
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
