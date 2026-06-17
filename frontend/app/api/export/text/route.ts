import { NextResponse, NextRequest } from "next/server";
import {
  compileToText,
  type CompileSection,
} from "../../../../src/lib/export/compile-text";
import { loadTextSections } from "../../../../src/lib/export/section-loader";
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

  const sections = await loadTextSections<CompileSection>(
    projectPath,
    resourceIds,
    resources,
    (meta, { plainText }) => ({ name: meta.name, content: plainText ?? "" }),
  );

  // Single resource: no section headers. Multiple: include them.
  const shouldIncludeHeaders = sections.length > 1;
  const text = compileToText(sections, {
    includeHeaders: shouldIncludeHeaders,
  });
  const filename = `${slugify(exportName)}.txt`;

  return NextResponse.json({ text, filename });
}
