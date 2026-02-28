import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { readSidecar } from "../../../../src/lib/models/sidecar";

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

const copyResource = async (projectRoot: string, resourceId: string) => {
    // const resourcePath = path.join(projectRoot, "resources", resourceId);
    const sidecar = await readSidecar(projectRoot, resourceId);
    console.log(sidecar);
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
    };

    switch (action) {
        case "delete":
            await deleteResource(projectRoot, resourceId);
            break;
        case "copy":
            await copyResource(projectRoot, resourceId);
            break;
        default:
            throw new Error(`Unknown action: ${action}`);
    }

    return NextResponse.json({ message: "Resource deleted successfully" });
}
