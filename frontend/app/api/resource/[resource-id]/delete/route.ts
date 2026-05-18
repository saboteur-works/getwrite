import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { readSidecar } from "../../../../../src/lib/models/sidecar";
import { nullifyResourceRefs } from "../../../../../src/lib/models/trash";
import { getSchema } from "../../../../../src/lib/models/metadata-schema";

const deleteResource = async (projectRoot: string, resourceId: string) => {
    const resourcePath = path.join(projectRoot, "resources", resourceId);
    if (fs.existsSync(resourcePath)) {
        fs.rmSync(resourcePath, { recursive: true, force: true });
    }
    const metaPath = path.join(
        projectRoot,
        "meta",
        `resource-${resourceId}.meta.json`,
    );
    if (fs.existsSync(metaPath)) {
        fs.rmSync(metaPath, { recursive: true, force: true });
    }
};

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const resourceId = await (await params)["resource-id"];
    const body = await req.json();
    const { projectRoot } = body as {
        projectRoot: string;
    };

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

    await deleteResource(projectRoot, resourceId);

    return NextResponse.json({ message: "Resource deleted successfully" });
}
