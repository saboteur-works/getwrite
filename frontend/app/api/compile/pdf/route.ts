import { NextRequest } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { loadResourceContent } from "../../../../src/lib/tiptap-utils";
import {
    CompilePDFDocument,
    registerIBMPlexFonts,
} from "../../../../src/lib/export/CompilePDFDocument";
import { CompilePDFFallbackDocument } from "../../../../src/lib/export/CompilePDFFallbackDocument";
import type { CompileSection } from "../../../../src/lib/export/compile-text";
import { slugify } from "../../../../src/lib/utils";

interface ResourceMeta {
    id: string;
    name: string;
    type: string;
}

interface CompilePDFBody {
    projectPath: string;
    resourceIds: string[];
    resources: ResourceMeta[];
    includeHeaders: boolean;
    projectName: string;
}

function isFontError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /font|fetch|404|network/i.test(msg);
}

export async function POST(req: NextRequest) {
    const body = (await req.json()) as CompilePDFBody;
    const { projectPath, resourceIds, resources, includeHeaders, projectName } =
        body;

    const resourceMap = new Map<string, ResourceMeta>(
        resources.map((r) => [r.id, r]),
    );

    const textIds = resourceIds.filter(
        (id) => resourceMap.get(id)?.type === "text",
    );

    const sections: CompileSection[] = await Promise.all(
        textIds.map(async (id) => {
            const meta = resourceMap.get(id)!;
            const { plainText } = await loadResourceContent(projectPath, id);
            return { name: meta.name, content: plainText ?? "" };
        }),
    );

    const filename = `${slugify(projectName)}.pdf`;

    let buffer: Buffer;
    let fontFallback = false;

    try {
        registerIBMPlexFonts();
        buffer = await renderToBuffer(
            React.createElement(CompilePDFDocument, {
                sections,
                includeHeaders,
            }) as React.ReactElement<DocumentProps>,
        );
    } catch (err) {
        if (!isFontError(err)) throw err;
        fontFallback = true;
        buffer = await renderToBuffer(
            React.createElement(CompilePDFFallbackDocument, {
                sections,
                includeHeaders,
            }) as React.ReactElement<DocumentProps>,
        );
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
    };
    if (fontFallback) {
        headers["X-Compile-Warning"] = "font-fallback";
    }

    return new Response(new Uint8Array(buffer), { headers });
}
