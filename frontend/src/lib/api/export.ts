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
