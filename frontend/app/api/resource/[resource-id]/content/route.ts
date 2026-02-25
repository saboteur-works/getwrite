import { NextResponse, NextRequest } from "next/server";
import { persistResourceContent } from "../../../../../src/lib/tiptap-utils";
import { TipTapDocument } from "../../../../../src/lib/models";

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ "resource-id": string }> },
) {
    const body = await req.json();
    const { projectPath, doc } = body as {
        projectPath: string;
        doc: TipTapDocument;
    };
    const resourceId = await (await params)["resource-id"];
    console.log(resourceId);
    persistResourceContent(projectPath, resourceId, doc);
    return NextResponse.json({ message: "Content persisted successfully" });
}
