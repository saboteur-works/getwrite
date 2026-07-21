import { NextRequest } from "next/server";
import {
  buildDocxDocument,
  Packer,
} from "../../../../src/lib/export/CompileDocxDocument";
import type { CompileSection } from "../../../../src/lib/export/compile-text";
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
