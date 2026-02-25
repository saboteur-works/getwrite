import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { ResourceType, TipTapDocument } from "../../../src/lib/models";
const getProjectResource = (
    projectPath: string,
    resourceId: string,
    resourceType: ResourceType,
) => {
    const resourcePath = path.join(projectPath, "resources", resourceId);
    // Read the content at the resource path
    // If it contains a content.tiptap.json file, it is a text resource
    if (resourceType === "text") {
        const tiptapContentPath = path.join(
            resourcePath,
            "content.tiptap.json",
        );
        let tipTapContent: TipTapDocument | null = null;
        if (fs.existsSync(tiptapContentPath)) {
            const content = fs.readFileSync(tiptapContentPath, "utf-8");
            tipTapContent = JSON.parse(content) as TipTapDocument;
        }
        let plaintextContent: string | null = null;
        const plaintextContentPath = path.join(resourcePath, "content.txt");
        if (fs.existsSync(plaintextContentPath)) {
            plaintextContent = fs.readFileSync(plaintextContentPath, "utf-8");
        }

        return {
            tipTapContent,
            plaintextContent,
        };
    }
    // If no valid content is found, throw an error
    throw new Error(
        `No valid content found for resource ${resourceId} at path ${resourcePath}`,
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
        // For now, we assume all resources are text resources and fetch accordingly.
        // In the future, we can extend this to handle different resource types based on additional parameters in the request body.
        const resourceContent = getProjectResource(
            projectPath,
            resourceId,
            "text",
        );
        return NextResponse.json({
            message: "Project resources endpoint",
            resourceContent,
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
