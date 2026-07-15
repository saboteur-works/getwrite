import { NextResponse, NextRequest } from "next/server";
import path from "node:path";
import {
  compileToText,
  type CompileSection,
} from "../../../../src/lib/export/compile-text";
import { loadTextSections } from "../../../../src/lib/export/section-loader";
import { slugify } from "../../../../src/lib/utils";
import type { ResourceMeta } from "../../../../src/lib/export/types";
import { resolveProjectsDir } from "../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

interface ExportBody {
  projectId: string;
  resourceIds: string[];
  resources: ResourceMeta[];
  /** Display name of the resource or folder being exported (used for the filename). */
  exportName: string;
}

async function handlePost(req: NextRequest) {
  const body = (await req.json()) as ExportBody;
  const { projectId, resourceIds, resources, exportName } = body;

  let validatedProjectId: string;
  try {
    validatedProjectId = validateProjectId(projectId);
  } catch (err) {
    if (err instanceof InvalidProjectIdError) return respondInvalidProjectId();
    throw err;
  }

  const projectPath = path.join(resolveProjectsDir(), validatedProjectId);

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

export const POST = withStorageContext(handlePost);
