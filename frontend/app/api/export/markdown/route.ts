import { NextResponse, NextRequest } from "next/server";
import { loadResourceContent } from "../../../../src/lib/tiptap-utils";
import {
  compileToMarkdown,
  type MarkdownSection,
} from "../../../../src/lib/export/compile-markdown";
import { slugify } from "../../../../src/lib/utils";
import type {
  ResourceMeta,
  MarkdownConstructWarning,
} from "../../../../src/lib/export/types";

interface ExportMarkdownBody {
  projectPath: string;
  resourceIds: string[];
  resources: ResourceMeta[];
  /** Display name of the resource or folder being exported (used for the filename). */
  exportName: string;
}

interface ExportMarkdownResponse {
  markdown: string;
  filename: string;
  warnings: MarkdownConstructWarning[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ExportMarkdownBody;
  const { projectPath, resourceIds, resources, exportName } = body;

  const resourceMap = new Map<string, ResourceMeta>(
    resources.map((r) => [r.id, r]),
  );

  // Only export text-type resources, preserving the requested order.
  const textIds = resourceIds.filter(
    (id) => resourceMap.get(id)?.type === "text",
  );

  const sections: MarkdownSection[] = await Promise.all(
    textIds.map(async (id) => {
      const meta = resourceMap.get(id)!;
      const { tiptap } = await loadResourceContent(projectPath, id);
      return { name: meta.name, doc: tiptap };
    }),
  );

  // Single resource: no section headers. Multiple: include them.
  const includeHeaders = textIds.length > 1;
  const { markdown, warnings } = compileToMarkdown(sections, {
    includeHeaders,
  });
  const filename = `${slugify(exportName)}.md`;

  const response: ExportMarkdownResponse = { markdown, filename, warnings };
  return NextResponse.json(response);
}
