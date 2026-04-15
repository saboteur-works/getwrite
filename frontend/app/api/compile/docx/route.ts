import { NextRequest } from "next/server";
import { loadResourceContent } from "../../../../src/lib/tiptap-utils";
import { buildDocxDocument, Packer } from "../../../../src/lib/export/CompileDocxDocument";
import type { CompileSection } from "../../../../src/lib/export/compile-text";

interface ResourceMeta {
    id: string;
    name: string;
    type: string;
}

interface CompileDocxBody {
    projectPath: string;
    resourceIds: string[];
    resources: ResourceMeta[];
    includeHeaders: boolean;
    projectName: string;
}

function slugify(name: string): string {
    return (
        name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "project"
    );
}

export async function POST(req: NextRequest) {
    const body = (await req.json()) as CompileDocxBody;
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
