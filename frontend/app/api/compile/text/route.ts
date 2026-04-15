import { NextResponse, NextRequest } from "next/server";
import { loadResourceContent } from "../../../../src/lib/tiptap-utils";
import {
    compileToText,
    type CompileSection,
} from "../../../../src/lib/export/compile-text";
import { slugify } from "../../../../src/lib/utils";
import type {
    CompileBody,
    ResourceMeta,
} from "../../../../src/lib/export/types";

export async function POST(req: NextRequest) {
    const body = (await req.json()) as CompileBody;
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
