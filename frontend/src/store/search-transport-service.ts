import type { RootState } from "./store";

export interface SearchResult {
    resourceId: string;
    title: string;
    snippet: string;
    status?: string;
    folderId?: string | null;
    tags?: string[];
}

export interface SearchRequestContext {
    projectId: string;
}

export function resolveSearchRequestContext(
    state: RootState,
    expectedProjectId: string,
): SearchRequestContext | { error: string } {
    const { selectedProjectId } = state.projects;

    if (!selectedProjectId) {
        return { error: "No project selected." };
    }

    if (selectedProjectId !== expectedProjectId) {
        return { error: "Project changed before search completed." };
    }

    return { projectId: selectedProjectId };
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

export async function executeSearchRequest(
    context: SearchRequestContext,
    query: string,
): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query });
    const response = await fetch(
        `/api/project/${context.projectId}/search?${params.toString()}`,
    );

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
            getApiErrorMessage(errorBody, "Unable to perform search."),
        );
    }

    return (await response.json()) as SearchResult[];
}
