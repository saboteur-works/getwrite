import {
    createResourceOfType,
    CreateResourceOpts,
    writeResourceToFile,
} from "../../../src/lib/models";
import { NextResponse } from "next/dist/server/web/spec-extension/response";

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const { projectPath, resourceData } = body as {
            projectPath: string;
            resourceData: CreateResourceOpts;
        };

        const resource = createResourceOfType(resourceData.type, resourceData);

        writeResourceToFile(projectPath, resource);
        return NextResponse.json({ success: true, resource });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to save resource" },
            { status: 500 },
        );
    }
}
