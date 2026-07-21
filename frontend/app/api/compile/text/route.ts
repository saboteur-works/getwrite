import { NextResponse, NextRequest } from "next/server";
import {
  compileToText,
  type CompileSection,
} from "../../../../src/lib/export/compile-text";
import { loadTextSections } from "../../../../src/lib/export/section-loader";
import { slugify } from "../../../../src/lib/utils";
import type { CompileBody } from "../../../../src/lib/export/types";
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

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

  const sections = await loadTextSections<CompileSection>(
    projectPath,
    resourceIds,
    resources,
    (meta, { plainText }) => ({ name: meta.name, content: plainText ?? "" }),
  );

  const text = compileToText(sections, {
    includeHeaders: shouldIncludeHeaders,
  });
  const filename = `${slugify(projectName)}.txt`;

  return NextResponse.json({ text, filename });
}

export const POST = withStorageContext(handlePost);
