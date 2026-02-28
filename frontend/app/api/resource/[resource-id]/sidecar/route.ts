import { NextRequest, NextResponse } from "next/server";
import { writeSidecar } from "../../../../../src/lib/models/sidecar";

// Updates to resource metadata (notes, status, characters, locations, items, pov)
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const resourceId = await (await params)["resource-id"];
    const body = await req.json();
    const { projectRoot, updatedResource } = body as {
        projectRoot: string;
        updatedResource: any;
    };
    console.log(
        "Received metadata update for resource",
        resourceId,
        "with data:",
        body,
    );

    await writeSidecar(projectRoot, resourceId, updatedResource);
    return NextResponse.json({ message: "Hello from sidecar!" });
}
