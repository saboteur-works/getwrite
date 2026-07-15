import { NextResponse, NextRequest } from "next/server";
import path from "node:path";
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
import { resolveProjectsDir } from "../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../src/lib/models/project-path";
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

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }

  const projectPath = path.join(resolveProjectsDir(), validatedProjectId);

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
