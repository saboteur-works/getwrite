import { NextResponse, NextRequest } from "next/server";
import { loadResourceContent } from "../../../../src/lib/tiptap-utils";
import {
    compileToText,
    type CompileSection,
} from "../../../../src/lib/export/compile-text";

interface ResourceMeta {
    id: string;
    name: string;
    type: string;
}

interface CompileTextBody {
    projectPath: string;
    resourceIds: string[];
    resources: ResourceMeta[];
    includeHeaders: boolean;
    projectName: string;
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "project";
}

export async function POST(req: NextRequest) {
    const body = (await req.json()) as CompileTextBody;
    const { projectPath, resourceIds, resources, includeHeaders, projectName } =
        body;

    // Build a lookup map for resource metadata
    const resourceMap = new Map<string, ResourceMeta>(
        resources.map((r) => [r.id, r]),
    );

    // Filter to text-only resources in the provided order
    const textIds = resourceIds.filter(
        (id) => resourceMap.get(id)?.type === "text",
    );

    // Load content for each text resource
    const sections: CompileSection[] = await Promise.all(
        textIds.map(async (id) => {
            const meta = resourceMap.get(id)!;
            const { plainText } = await loadResourceContent(projectPath, id);
            return { name: meta.name, content: plainText ?? "" };
        }),
    );

    const text = compileToText(sections, { includeHeaders });
    const filename = `${slugify(projectName)}.txt`;

    return NextResponse.json({ text, filename });
}
