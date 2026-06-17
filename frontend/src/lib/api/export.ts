import type { MarkdownConstructWarning } from "../export/types";

export interface MarkdownExportBody {
  projectPath: string;
  resourceIds: string[];
  resources: Array<{ id: string; name: string; type: string }>;
  /** Display name of the resource or folder being exported (used for the filename). */
  exportName: string;
}

export interface MarkdownExportResult {
  markdown: string;
  filename: string;
  warnings: MarkdownConstructWarning[];
}

export interface TextExportBody {
  projectPath: string;
  resourceIds: string[];
  resources: Array<{ id: string; name: string; type: string }>;
  /** Display name of the resource or folder being exported (used for the filename). */
  exportName: string;
}

export interface TextExportResult {
  text: string;
  filename: string;
}

/**
 * Export one or more text resources as a single plain-text file. The server
 * reads each resource's current saved content from disk, so the output always
 * reflects the latest autosave (not a client-side snapshot).
 */
export async function exportText(
  body: TextExportBody,
): Promise<TextExportResult> {
  const response = await fetch("/api/export/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Text export failed (${response.status})`);
  }

  return (await response.json()) as TextExportResult;
}

/**
 * Export one or more text resources as a single Markdown file. The server loads
 * each resource's TipTap document, serializes it to GitHub Flavored Markdown,
 * and returns the assembled file plus any loss warnings.
 */
export async function exportMarkdown(
  body: MarkdownExportBody,
): Promise<MarkdownExportResult> {
  const response = await fetch("/api/export/markdown", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Markdown export failed (${response.status})`);
  }

  return (await response.json()) as MarkdownExportResult;
}
