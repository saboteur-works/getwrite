import type { Revision } from "../lib/models/types";
import type { RootState } from "./store";

/**
 * Response shape for `/api/project-resources` used by revision list loading.
 */
interface ProjectResourcesResponse {
    revisions?: unknown;
}

/**
 * Response shape for fetching a single revision preview.
 */
interface RevisionContentResponse {
    revision: Revision;
    content: string;
}

export interface RevisionRequestContext {
    projectPath: string;
    resourceId: string;
}

/**
 * Resolves selected resource/project context needed for revision requests.
 */
export function resolveRevisionRequestContext(
    state: RootState,
    expectedResourceId: string,
): RevisionRequestContext | { error: string } {
    const selectedProjectId = state.projects.selectedProjectId;
    const selectedResourceId = state.resources.selectedResourceId;

    if (!selectedProjectId) {
        return { error: "No project selected." };
    }

    if (!selectedResourceId || selectedResourceId !== expectedResourceId) {
        return { error: "Selected resource changed before revisions updated." };
    }

    const project = state.projects.projects[selectedProjectId];

    if (!project?.rootPath) {
        return { error: "Selected project is missing a root path." };
    }

    return {
        projectPath: project.rootPath,
        resourceId: selectedResourceId,
    };
}

function getApiErrorMessage(errorBody: unknown, fallback: string): string {
    if (
        errorBody &&
        typeof errorBody === "object" &&
        "error" in errorBody &&
        typeof (errorBody as { error?: unknown }).error === "string"
    ) {
        return (errorBody as { error: string }).error;
    }

    return fallback;
}

/**
 * Fetch persisted revisions for a selected resource.
 */
export async function fetchRevisionList(
    context: RevisionRequestContext,
): Promise<ProjectResourcesResponse> {
    const response = await fetch("/api/project-resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            projectPath: context.projectPath,
            resourceId: context.resourceId,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
            getApiErrorMessage(errorBody, "Unable to load revisions."),
        );
    }

    return (await response.json()) as ProjectResourcesResponse;
}

/**
 * Create a new explicit revision for a selected resource.
 */
export async function createRevision(
    context: RevisionRequestContext,
    revisionName: string,
): Promise<Revision> {
    const response = await fetch(
        `/api/resource/revision/${context.resourceId}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: context.projectPath,
                isCanonical: false,
                metadata: { name: revisionName },
            }),
        },
    );

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
            getApiErrorMessage(errorBody, "Failed to save revision."),
        );
    }

    return (await response.json()) as Revision;
}

/**
 * Delete a revision for a selected resource.
 */
export async function removeRevision(
    context: RevisionRequestContext,
    revisionId: string,
): Promise<void> {
    const response = await fetch(
        `/api/resource/revision/${context.resourceId}`,
        {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: context.projectPath,
                revisionId,
            }),
        },
    );

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
            getApiErrorMessage(errorBody, "Failed to delete revision."),
        );
    }
}

/**
 * Fetch revision preview content.
 */
export async function fetchRevisionContent(
    context: RevisionRequestContext,
    revisionId: string,
): Promise<RevisionContentResponse> {
    const params = new URLSearchParams({
        projectPath: context.projectPath,
        revisionId,
    });

    const response = await fetch(
        `/api/resource/revision/${context.resourceId}?${params.toString()}`,
    );

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
            getApiErrorMessage(errorBody, "Failed to fetch revision."),
        );
    }

    return (await response.json()) as RevisionContentResponse;
}

/**
 * Persist canonical revision selection.
 */
export async function persistCanonicalRevision(
    context: RevisionRequestContext,
    revisionId: string,
): Promise<void> {
    const response = await fetch(
        `/api/resource/revision/${context.resourceId}`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: context.projectPath,
                revisionId,
            }),
        },
    );

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
            getApiErrorMessage(errorBody, "Failed to set canonical revision."),
        );
    }
}
