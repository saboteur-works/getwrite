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
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

interface CompileMarkdownResponse {
  markdown: string;
  filename: string;
  /** Loss warnings aggregated across every included section. */
  warnings: MarkdownConstructWarning[];
}

async function handlePost(req: NextRequest) {
  const body = (await req.json()) as CompileBody;
  const {
    projectId,
    resourceIds,
    resources,
    includeHeaders: shouldIncludeHeaders,
    projectName,
  } = body;

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;

  const { projectPath } = resolved;

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

export const POST = withStorageContext(handlePost);
