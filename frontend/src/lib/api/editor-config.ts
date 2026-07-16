import type { EditorBodyConfig } from "../models/types";
import type { EditorHeadingMap } from "../editor-heading-settings";

interface EditorConfigResponse {
  editorConfig?: { headings?: EditorHeadingMap; body?: EditorBodyConfig };
  error?: string;
}

/**
 * Persists per-project heading typography settings.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/editor-config` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function saveHeadingSettings(
  projectId: string,
  headings: EditorHeadingMap,
): Promise<EditorConfigResponse> {
  const response = await fetch("/api/project/editor-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, headings }),
  });
  const body = (await response
    .json()
    .catch(() => null)) as EditorConfigResponse | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to save heading settings.");
  }
  return body ?? {};
}

/**
 * Persists per-project body-text typography settings.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/editor-config` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function saveBodySettings(
  projectId: string,
  body: EditorBodyConfig,
): Promise<EditorConfigResponse> {
  const response = await fetch("/api/project/editor-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, body }),
  });
  const responseBody = (await response
    .json()
    .catch(() => null)) as EditorConfigResponse | null;
  if (!response.ok) {
    throw new Error(responseBody?.error ?? "Failed to save body settings.");
  }
  return responseBody ?? {};
}
