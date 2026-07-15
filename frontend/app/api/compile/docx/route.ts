import { NextRequest } from "next/server";
import path from "node:path";
import {
  buildDocxDocument,
  Packer,
} from "../../../../src/lib/export/CompileDocxDocument";
import type { CompileSection } from "../../../../src/lib/export/compile-text";
import { loadTextSections } from "../../../../src/lib/export/section-loader";
import { slugify } from "../../../../src/lib/utils";
import type { CompileBody } from "../../../../src/lib/export/types";
import { resolveProjectsDir } from "../../../../src/lib/models/projects-dir";
import {
  InvalidProjectIdError,
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../src/lib/models/project-path";
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

  const filename = `${slugify(projectName)}.docx`;

  const doc = buildDocxDocument(sections, {
    includeHeaders: shouldIncludeHeaders,
  });
  const buffer = await Packer.toBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const POST = withStorageContext(handlePost);
