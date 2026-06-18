import { NextResponse, NextRequest } from "next/server";
import {
  compileToMarkdown,
  type MarkdownSection,
} from "../../../../src/lib/export/compile-markdown";
import { loadTextSections } from "../../../../src/lib/export/section-loader";
import { slugify } from "../../../../src/lib/utils";
import type {
  CompileBody,
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
  const {
    projectPath,
    resourceIds,
    resources,
    includeHeaders: shouldIncludeHeaders,
    projectName,
  } = body;

  // Markdown needs the TipTap JSON, not the cached plain text.
  const sections = await loadTextSections<MarkdownSection>(
    projectPath,
    resourceIds,
    resources,
    (meta, { tiptap }) => ({ name: meta.name, doc: tiptap }),
  );

  const { markdown, warnings } = compileToMarkdown(sections, {
    includeHeaders: shouldIncludeHeaders,
  });
  const filename = `${slugify(projectName)}.md`;

  const response: CompileMarkdownResponse = { markdown, filename, warnings };
  return NextResponse.json(response);
}
