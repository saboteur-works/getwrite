import { NextResponse, NextRequest } from "next/server";
import {
  compileToMarkdown,
  type MarkdownSection,
} from "../../../../src/lib/export/compile-markdown";
import { loadTextSections } from "../../../../src/lib/export/section-loader";
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

  // Markdown needs the TipTap JSON, not the cached plain text.
  const sections = await loadTextSections<MarkdownSection>(
    projectPath,
    resourceIds,
    resources,
    (meta, { tiptap }) => ({ name: meta.name, doc: tiptap }),
  );

  // Single resource: no section headers. Multiple: include them.
  const shouldIncludeHeaders = sections.length > 1;
  const { markdown, warnings } = compileToMarkdown(sections, {
    includeHeaders: shouldIncludeHeaders,
  });
  const filename = `${slugify(exportName)}.md`;

  const response: ExportMarkdownResponse = { markdown, filename, warnings };
  return NextResponse.json(response);
}
