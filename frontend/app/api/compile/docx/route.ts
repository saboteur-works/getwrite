import { NextRequest } from "next/server";
import { loadResourceContent } from "../../../../src/lib/tiptap-utils";
import {
    buildDocxDocument,
    Packer,
} from "../../../../src/lib/export/CompileDocxDocument";
import type { CompileSection } from "../../../../src/lib/export/compile-text";
import { slugify } from "../../../../src/lib/utils";
import type {
    CompileBody,
    ResourceMeta,
} from "../../../../src/lib/export/types";

export async function POST(req: NextRequest) {
    const body = (await req.json()) as CompileBody;
    const { projectPath, resourceIds, resources, includeHeaders, projectName } =
        body;

    const resourceMap = new Map<string, ResourceMeta>(
        resources.map((r) => [r.id, r]),
    );

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

    const filename = `${slugify(projectName)}.docx`;

    const doc = buildDocxDocument(sections, { includeHeaders });
    const buffer = await Packer.toBuffer(doc);

    return new Response(new Uint8Array(buffer), {
        headers: {
            "Content-Type":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
}
