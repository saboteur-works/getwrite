/**
 * @module project-actions-controller
 *
 * Centralized controller for project mutation orchestration used by start-page
 * project management surfaces.
 *
 * `/api/project/rename` and `/api/project/delete` are hard-cutover,
 * tenant-scoped routes (ADR-017/018): they only accept `projectId` — the
 * target project's on-disk directory basename (`path.basename(rootPath)`,
 * per `resolveProjectsDir()`) — and reject the legacy `projectPath`/
 * `projectRoot` fields. Per FR12, that directory basename is a distinct,
 * independently generated UUID from `project.json`'s internal `id` field,
 * so callers must source it via `selectActiveProjectDirectoryId` or
 * `getProjectDirectoryId` (see `projectsSlice.ts`) rather than `project.id`
 * or an inline `path.basename(...)`.
 *
 * `storeProjectId` below is a distinct concept: it's the Redux-store key for
 * the project (mirrors `project.json`'s internal `id`), used only to
 * identify the project for local UI callbacks (`onRename`/`onDelete`) and
 * dispatch. It is never sent over the wire — only `projectId` is.
 */

interface BaseProjectAction {
  storeProjectId: string;
  projectId?: string;
}

interface RenameProjectAction extends BaseProjectAction {
  newName: string;
  onRename?: (projectId: string, newName: string) => void;
}

interface DeleteProjectAction extends BaseProjectAction {
  onDelete?: (projectId: string) => void;
}

function getApiErrorMessage(errorBody: unknown, fallback: string): string {
  const error = (errorBody as Record<string, unknown>)?.error;
  return typeof error === "string" && error.trim().length > 0
    ? error
    : fallback;
}

function requireProjectId(
  projectId: string | undefined,
  fallback: string,
): string {
  if (typeof projectId === "string" && projectId.trim().length > 0) {
    return projectId;
  }

  throw new Error(fallback);
}

async function parseErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export const projectActionsController = {
  async renameProject({
    storeProjectId,
    projectId,
    newName,
    onRename,
  }: RenameProjectAction): Promise<void> {
    const resolvedProjectId = requireProjectId(
      projectId,
      "Project ID is required to rename project.",
    );

    onRename?.(storeProjectId, newName);

    const response = await fetch("/api/project/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: resolvedProjectId, newName }),
    });

    if (!response.ok) {
      const errorBody = await parseErrorBody(response);
      throw new Error(
        getApiErrorMessage(errorBody, "Failed to rename project."),
      );
    }
  },

  async deleteProject({
    storeProjectId,
    projectId,
    onDelete,
  }: DeleteProjectAction): Promise<void> {
    const resolvedProjectId = requireProjectId(
      projectId,
      "Project ID is required to delete project.",
    );

    onDelete?.(storeProjectId);

    const response = await fetch("/api/project/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: resolvedProjectId }),
    });

    if (!response.ok) {
      const errorBody = await parseErrorBody(response);
      throw new Error(
        getApiErrorMessage(errorBody, "Failed to delete project."),
      );
    }
  },
};
