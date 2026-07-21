import { NextRequest } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import {
  CompilePDFDocument,
  registerIBMPlexFonts,
} from "../../../../src/lib/export/CompilePDFDocument";
import { CompilePDFFallbackDocument } from "../../../../src/lib/export/CompilePDFFallbackDocument";
import type { CompileSection } from "../../../../src/lib/export/compile-text";
import { loadTextSections } from "../../../../src/lib/export/section-loader";
import { slugify } from "../../../../src/lib/utils";
import type { CompileBody } from "../../../../src/lib/export/types";
import { resolveProjectPath } from "../../../../src/lib/models/project-path";
import { withStorageContext } from "../../_tenant/with-storage-context";

function isFontError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /font|fetch|404|network/i.test(msg);
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

  const sections = await loadTextSections<CompileSection>(
    projectPath,
    resourceIds,
    resources,
    (meta, { plainText }) => ({ name: meta.name, content: plainText ?? "" }),
  );

  const filename = `${slugify(projectName)}.pdf`;

  let buffer: Buffer;
  let didFontFallback = false;

  try {
    registerIBMPlexFonts();
    buffer = await renderToBuffer(
      React.createElement(CompilePDFDocument, {
        sections,
        includeHeaders: shouldIncludeHeaders,
      }) as React.ReactElement<DocumentProps>,
    );
  } catch (err) {
    if (!isFontError(err)) throw err;
    didFontFallback = true;
    buffer = await renderToBuffer(
      React.createElement(CompilePDFFallbackDocument, {
        sections,
        includeHeaders: shouldIncludeHeaders,
      }) as React.ReactElement<DocumentProps>,
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
  if (didFontFallback) {
    headers["X-Compile-Warning"] = "font-fallback";
  }

  return new Response(new Uint8Array(buffer), { headers });
}

export const POST = withStorageContext(handlePost);
