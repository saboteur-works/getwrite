/**
 * Fixed PDF compile input shared by the server-path baseline (Feature 101,
 * Task 24) and the native-path parity tests (Tasks 25 and 26). Two text
 * resources compiled in this order with headers on.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";

import type { CompileBody } from "../../src/lib/export/types";
import { tiptapToPlainText } from "../../src/lib/tiptap-utils";

export interface FixedDocumentResource {
  id: string;
  name: string;
  paragraphs: string[];
}

export const FIXED_DOCUMENT_RESOURCES: FixedDocumentResource[] = [
  {
    id: "00000000-0000-4000-8000-0000000000a1",
    name: "Chapter One",
    paragraphs: [
      "The lighthouse keeper counted the ships at dusk.",
      "Seven passed, none stopped.",
    ],
  },
  {
    id: "00000000-0000-4000-8000-0000000000a2",
    name: "Chapter Two",
    paragraphs: ["Morning brought fog and a single bell."],
  },
];

export const FIXED_DOCUMENT_PROJECT_NAME = "Fixed Document";

/**
 * Per-page text `extractPdfPageTexts` returned for this document on the
 * unchanged server path (`renderToBuffer`), measured in Feature 101 Task 24.
 */
export const FIXED_DOCUMENT_SERVER_PAGE_TEXTS: string[] = [
  [
    "Chapter One",
    "The lighthouse keeper counted the ships at dusk.",
    "Seven passed, none stopped.",
    "Chapter Two",
    "Morning brought fog and a single bell.",
  ].join("\n"),
];

function toDoc(paragraphs: string[]): JSONContent {
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

/** Writes the fixed resources under `<projectPath>/resources/<id>/`. */
export async function writeFixedDocument(projectPath: string): Promise<void> {
  for (const r of FIXED_DOCUMENT_RESOURCES) {
    const dir = path.join(projectPath, "resources", r.id);
    await fs.mkdir(dir, { recursive: true });
    const doc = toDoc(r.paragraphs);
    await fs.writeFile(
      path.join(dir, "content.tiptap.json"),
      JSON.stringify(doc),
      "utf8",
    );
    await fs.writeFile(
      path.join(dir, "content.txt"),
      tiptapToPlainText(doc as Parameters<typeof tiptapToPlainText>[0]),
      "utf8",
    );
  }
}

/** The compile request body for the fixed document. */
export function fixedDocumentBody(projectId: string): CompileBody {
  return {
    projectId,
    resourceIds: FIXED_DOCUMENT_RESOURCES.map((r) => r.id),
    resources: FIXED_DOCUMENT_RESOURCES.map((r) => ({
      id: r.id,
      name: r.name,
      type: "text" as const,
    })),
    includeHeaders: true,
    projectName: FIXED_DOCUMENT_PROJECT_NAME,
  } as CompileBody;
}
