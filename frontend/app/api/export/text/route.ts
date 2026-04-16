import { NextResponse, NextRequest } from "next/server";
import { loadResourceContent } from "../../../../src/lib/tiptap-utils";
import {
    compileToText,
    type CompileSection,
} from "../../../../src/lib/export/compile-text";
import { slugify } from "../../../../src/lib/utils";
import type { ResourceMeta } from "../../../../src/lib/export/types";

interface ExportBody {
    projectPath: string;
    resourceIds: string[];
    resources: ResourceMeta[];
    /** Display name of the resource or folder being exported (used for the filename). */
    exportName: string;
}

export async function POST(req: NextRequest) {
    const body = (await req.json()) as ExportBody;
    const { projectPath, resourceIds, resources, exportName } = body;

    const resourceMap = new Map<string, ResourceMeta>(
        resources.map((r) => [r.id, r]),
    );

    // Only export text-type resources in the provided order
    const textIds = resourceIds.filter(
        (id) => resourceMap.get(id)?.type === "text",
    );

    const sections: CompileSection[] = await Promise.all(
        textIds.map(async (id) => {
            const meta = resourceMap.get(id)!;
            const { plainText } = await loadResourceContent(projectPath, id);
            return { name: meta.name, content: plainText ?? "" };
        }),
    );

    // Single resource: no section headers. Multiple: include them.
    const includeHeaders = textIds.length > 1;
    const text = compileToText(sections, { includeHeaders });
    const filename = `${slugify(exportName)}.txt`;

    return NextResponse.json({ text, filename });
}
