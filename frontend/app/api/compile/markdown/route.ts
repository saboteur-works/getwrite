import { NextResponse, NextRequest } from "next/server";
import { loadResourceContent } from "../../../../src/lib/tiptap-utils";
import {
  compileToMarkdown,
  type MarkdownSection,
} from "../../../../src/lib/export/compile-markdown";
import { slugify } from "../../../../src/lib/utils";
import type {
  CompileBody,
  ResourceMeta,
  MarkdownConstructWarning,
} from "../../../../src/lib/export/types";

interface CompileMarkdownResponse {
  markdown: string;
  filename: string;
  /** Loss warnings aggregated across every included section. */
  warnings: MarkdownConstructWarning[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CompileBody;
  const { projectPath, resourceIds, resources, includeHeaders, projectName } =
    body;

  // Build a lookup map for resource metadata.
  const resourceMap = new Map<string, ResourceMeta>(
    resources.map((r) => [r.id, r]),
  );

  // Filter to text-only resources in the provided order.
  const textIds = resourceIds.filter(
    (id) => resourceMap.get(id)?.type === "text",
  );

  // Load the TipTap document for each text resource (Markdown needs the JSON,
  // not the cached plain text).
  const sections: MarkdownSection[] = await Promise.all(
    textIds.map(async (id) => {
      const meta = resourceMap.get(id)!;
      const { tiptap } = await loadResourceContent(projectPath, id);
      return { name: meta.name, doc: tiptap };
    }),
  );

  const { markdown, warnings } = compileToMarkdown(sections, {
    includeHeaders,
  });
  const filename = `${slugify(projectName)}.md`;

  const response: CompileMarkdownResponse = { markdown, filename, warnings };
  return NextResponse.json(response);
}
