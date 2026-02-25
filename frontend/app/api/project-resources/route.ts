import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
const getProjectResource = (projectPath: string, resourceId: string) => {
    const resourcePath = path.join(projectPath, "resources", resourceId);

    // Read the content at the resource path
    // If it contains a content.tiptap.json file, it is a text resource
    const tiptapContentPath = path.join(resourcePath, "content.tiptap.json");
    if (fs.existsSync(tiptapContentPath)) {
        const content = fs.readFileSync(tiptapContentPath, "utf-8");
        return JSON.parse(content);
    }

    // If no valid content is found, throw an error
    throw new Error(
        `TipTap document was not found for Resource with ID ${resourceId} in project at path ${tiptapContentPath}`,
    );
};

// Fetch project resources from the filesystem
// Body expects a project file path
export async function POST(req: Request) {
    const body = await req.json();
    const { projectPath, resourceId } = body as {
        projectPath: string;
        resourceId: string;
    };
    // Get the project resources from the filesystem based on the provided project path and resource ID
    try {
        const resource = getProjectResource(projectPath, resourceId);
        return NextResponse.json({
            message: "Project resources endpoint",
            resource,
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
