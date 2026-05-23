import type { EditorBodyConfig } from "../models/types";
import type { EditorHeadingMap } from "../editor-heading-settings";

interface EditorConfigResponse {
  editorConfig?: { headings?: EditorHeadingMap; body?: EditorBodyConfig };
  error?: string;
}

export async function saveHeadingSettings(
  projectPath: string,
  headings: EditorHeadingMap,
): Promise<EditorConfigResponse> {
  const response = await fetch("/api/project/editor-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, headings }),
  });
  const body = (await response
    .json()
    .catch(() => null)) as EditorConfigResponse | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to save heading settings.");
  }
  return body ?? {};
}

export async function saveBodySettings(
  projectPath: string,
  body: EditorBodyConfig,
): Promise<EditorConfigResponse> {
  const response = await fetch("/api/project/editor-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, body }),
  });
  const responseBody = (await response
    .json()
    .catch(() => null)) as EditorConfigResponse | null;
  if (!response.ok) {
    throw new Error(responseBody?.error ?? "Failed to save body settings.");
  }
  return responseBody ?? {};
}
