import type { Project, Folder, AnyResource } from "../models/types";

export interface ProjectApiEntry {
  project: Project;
  folders: Folder[];
  resources: AnyResource[];
}

function apiError(body: unknown, status: number): Error {
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : `Status ${status}`;
  return new Error(message);
}

export async function listProjects(): Promise<ProjectApiEntry[]> {
  const response = await fetch("/api/projects", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw apiError(body, response.status);
  }
  return (await response.json()) as ProjectApiEntry[];
}

/**
 * Opens a project by its on-disk directory id.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function openProject(projectId: string): Promise<ProjectApiEntry> {
  const response = await fetch("/api/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw apiError(body, response.status);
  }
  return (await response.json()) as ProjectApiEntry;
}

export async function createProject(
  name: string,
  projectType?: string,
): Promise<ProjectApiEntry> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, projectType }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw apiError(body, response.status);
  }
  return (await response.json()) as ProjectApiEntry;
}

export async function reindexProject(projectId: string): Promise<void> {
  await fetch(`/api/project/${projectId}/reindex`, { method: "POST" });
}
