import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { readSidecar, writeSidecar } from "../../../../src/lib/models/sidecar";
import { generateUUID } from "../../../../src/lib/models/uuid";
import {
    nullifyResourceRefs,
    softDeleteResource,
} from "../../../../src/lib/models/trash";
import { getSchema } from "../../../../src/lib/models/metadata-schema";

const copyResource = async (
    projectRoot: string,
    sourceId: string,
    newName: string,
) => {
    const newId = generateUUID();
    const srcDir = path.join(projectRoot, "resources", sourceId);
    const dstDir = path.join(projectRoot, "resources", newId);

    if (fs.existsSync(srcDir)) {
        fs.cpSync(srcDir, dstDir, { recursive: true });
    }

    const sourceSidecar = await readSidecar(projectRoot, sourceId);
    const newSidecar = {
        ...(sourceSidecar ?? {}),
        id: newId,
        name: newName,
        createdAt: new Date().toISOString(),
    };

    await writeSidecar(projectRoot, newId, newSidecar);
    return newSidecar;
};

// Updates to resource metadata (notes, status, characters, locations, items, pov)
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const resourceId = await (await params)["resource-id"];
    const body = await req.json();
    const { projectRoot, action } = body as {
        projectRoot: string;
        action: "delete" | "copy";
        newName?: string;
    };

    switch (action) {
        case "delete": {
            // Read the resource name and resource-ref field keys before deletion.
            const sidecar = await readSidecar(projectRoot, resourceId);
            const deletedName =
                typeof sidecar?.["name"] === "string" ? sidecar["name"] : "";

            let resourceRefKeys: string[] = [];
            try {
                const schema = await getSchema(projectRoot);
                resourceRefKeys = schema.groups
                    .flatMap((g) => g.fields)
                    .filter((f) => f.type === "resource-ref")
                    .map((f) => f.key);
            } catch {
                // Schema unreadable — proceed without nullification
            }

            await nullifyResourceRefs(
                projectRoot,
                resourceId,
                deletedName,
                resourceRefKeys,
            );

            await softDeleteResource(projectRoot, resourceId);
            return NextResponse.json({ message: "Resource deleted successfully" });
        }
        case "copy": {
            const newResource = await copyResource(
                projectRoot,
                resourceId,
                body.newName ?? "Copy",
            );
            return NextResponse.json({ success: true, resource: newResource });
        }
        default:
            throw new Error(`Unknown action: ${action}`);
    }
}
