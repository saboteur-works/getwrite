import type { MarkdownConstructWarning } from "../export/types";

export interface CompileBody {
  projectPath: string;
  resourceIds: string[];
  resources: Array<{ id: string; name: string; type: string }>;
  includeHeaders: boolean;
  projectName: string;
}

export interface PdfCompileResult {
  arrayBuffer: ArrayBuffer;
  filename: string;
  warning?: string;
}

export interface DocxCompileResult {
  arrayBuffer: ArrayBuffer;
  filename: string;
}

export interface TextCompileResult {
  text: string;
  filename: string;
}

export interface MarkdownCompileResult {
  markdown: string;
  filename: string;
  /** Loss warnings aggregated across every included section. */
  warnings: MarkdownConstructWarning[];
}

function extractFilename(disposition: string, fallback: string): string {
  return disposition.match(/filename="([^"]+)"/)?.[1] ?? fallback;
}

async function postCompileRequest(
  format: string,
  body: CompileBody,
): Promise<Response> {
  const response = await fetch(`/api/compile/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Compile failed (${response.status})`);
  return response;
}

export async function compilePdf(body: CompileBody): Promise<PdfCompileResult> {
  const response = await postCompileRequest("pdf", body);
  const warning =
    response.headers.get("X-Compile-Warning") === "font-fallback"
      ? "font-fallback"
      : undefined;
  const filename = extractFilename(
    response.headers.get("Content-Disposition") ?? "",
    "project.pdf",
  );
  const arrayBuffer = await response.arrayBuffer();
  return { arrayBuffer, filename, warning };
}

export async function compileDocx(
  body: CompileBody,
): Promise<DocxCompileResult> {
  const response = await postCompileRequest("docx", body);
  const filename = extractFilename(
    response.headers.get("Content-Disposition") ?? "",
    "project.docx",
  );
  const arrayBuffer = await response.arrayBuffer();
  return { arrayBuffer, filename };
}

export async function compileText(
  body: CompileBody,
): Promise<TextCompileResult> {
  const response = await postCompileRequest("text", body);
  return (await response.json()) as TextCompileResult;
}

export async function compileMarkdown(
  body: CompileBody,
): Promise<MarkdownCompileResult> {
  const response = await postCompileRequest("markdown", body);
  return (await response.json()) as MarkdownCompileResult;
}
