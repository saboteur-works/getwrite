/**
 * @module project-actions-controller
 *
 * Centralized controller for project mutation orchestration used by start-page
 * project management surfaces.
 */

interface ApiErrorResponse {
    error?: unknown;
}

interface BaseProjectAction {
    projectId: string;
    projectPath?: string;
}

interface RenameProjectAction extends BaseProjectAction {
    newName: string;
    onRename?: (projectId: string, newName: string) => void;
}

interface DeleteProjectAction extends BaseProjectAction {
    onDelete?: (projectId: string) => void;
}

function getApiErrorMessage(errorBody: unknown, fallback: string): string {
    if (!errorBody || typeof errorBody !== "object") {
        return fallback;
    }

    const error = (errorBody as ApiErrorResponse).error;
    if (typeof error === "string" && error.trim().length > 0) {
        return error;
    }

    return fallback;
}

function requireProjectPath(
    projectPath: string | undefined,
    fallback: string,
): string {
    if (typeof projectPath === "string" && projectPath.trim().length > 0) {
        return projectPath;
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
        projectId,
        projectPath,
        newName,
        onRename,
    }: RenameProjectAction): Promise<void> {
        const resolvedProjectPath = requireProjectPath(
            projectPath,
            "Project path is required to rename project.",
        );

        if (onRename) {
            onRename(projectId, newName);
        }

        const response = await fetch("/api/project/rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: resolvedProjectPath,
                newName,
            }),
        });

        if (!response.ok) {
            const errorBody = await parseErrorBody(response);
            throw new Error(
                getApiErrorMessage(errorBody, "Failed to rename project."),
            );
        }
    },

    async deleteProject({
        projectId,
        projectPath,
        onDelete,
    }: DeleteProjectAction): Promise<void> {
        const resolvedProjectPath = requireProjectPath(
            projectPath,
            "Project path is required to delete project.",
        );

        if (onDelete) {
            onDelete(projectId);
        }

        const response = await fetch("/api/project/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: resolvedProjectPath,
            }),
        });

        if (!response.ok) {
            const errorBody = await parseErrorBody(response);
            throw new Error(
                getApiErrorMessage(errorBody, "Failed to delete project."),
            );
        }
    },
};
