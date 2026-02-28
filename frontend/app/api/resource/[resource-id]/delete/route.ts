import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

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

// Updates to resource metadata (notes, status, characters, locations, items, pov)
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const resourceId = await (await params)["resource-id"];
    const body = await req.json();
    const { projectRoot } = body as {
        projectRoot: string;
    };

    await deleteResource(projectRoot, resourceId);

    return NextResponse.json({ message: "Resource deleted successfully" });
}
