// Last Updated: 2026-03-11

import {
    createAsyncThunk,
    createSelector,
    createSlice,
    PayloadAction,
} from "@reduxjs/toolkit";
import type { Revision } from "../lib/models/types";
import { setSelectedResourceId } from "./resourcesSlice";
import type { RootState } from "./store";

/**
 * Revision shape stored in Redux for the selected resource.
 *
 * This extends the persisted revision metadata with a display label used by
 * `RevisionControl`.
 */
export interface RevisionEntry extends Revision {
    /** Human-readable label shown in the revision list UI. */
    displayName: string;
}

/**
 * Redux state managed by the `revisions` slice.
 */
export interface RevisionsState {
    /** Resource whose revisions are currently loaded. */
    resourceId: string | null;
    /** Resource currently being requested, used to ignore stale responses. */
    requestedResourceId: string | null;
    /** Revision currently selected/viewed in `RevisionControl`. */
    currentRevisionId: string | null;
    /** Preview content for the currently selected revision. */
    currentRevisionContent: string | null;
    /** All known revisions for the currently loaded resource. */
    revisions: RevisionEntry[];
    /** True while the revision list is loading. */
    isLoading: boolean;
    /** True while a new revision is being saved. */
    isSaving: boolean;
    /** Revision currently being preview-fetched. */
    fetchingRevisionId: string | null;
    /** Revision currently being deleted. */
    deletingRevisionId: string | null;
    /** Latest recoverable error surfaced to the revision UI. */
    errorMessage: string;
}

/**
 * Request payload used when the caller expects a specific resource to still be
 * selected by the time the async operation resolves.
 */
interface ResourceScopedPayload {
    /** Resource expected to remain selected. */
    resourceId: string;
}

/**
 * Save payload for creating a named explicit revision.
 */
interface SaveRevisionPayload extends ResourceScopedPayload {
    /** User-provided display label for the saved revision. */
    revisionName: string;
}

/**
 * Delete payload for removing a persisted revision.
 */
interface DeleteRevisionPayload extends ResourceScopedPayload {
    /** Revision identifier to remove. */
    revisionId: string;
}

/**
 * Fetch payload for loading preview content for a specific revision.
 */
interface FetchRevisionContentPayload extends DeleteRevisionPayload {}

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

/**
 * Fulfilled payload for loading a resource's revisions.
 */
interface LoadRevisionsResult {
    resourceId: string;
    revisions: RevisionEntry[];
    currentRevisionId: string | null;
}

/**
 * Fulfilled payload for saving a single revision.
 */
interface SaveRevisionResult {
    resourceId: string;
    revision: RevisionEntry;
}

/**
 * Fulfilled payload for deleting a single revision.
 */
interface DeleteRevisionResult {
    resourceId: string;
    revisionId: string;
}

/**
 * Fulfilled payload for previewing a revision.
 */
interface FetchRevisionContentResult {
    resourceId: string;
    revisionId: string;
    content: string;
}

/**
 * Fulfilled payload for setting canonical revision.
 */
interface SetCanonicalRevisionResult {
    resourceId: string;
    revisionId: string;
}

/**
 * Initial `revisions` slice state.
 */
const initialState: RevisionsState = {
    resourceId: null,
    requestedResourceId: null,
    currentRevisionId: null,
    currentRevisionContent: null,
    revisions: [],
    isLoading: false,
    isSaving: false,
    fetchingRevisionId: null,
    deletingRevisionId: null,
    errorMessage: "",
};

/**
 * Returns a human-readable display label for a revision.
 *
 * @param revision - Persisted revision metadata.
 * @param fallbackName - Optional UI override, typically from the explicit save input.
 * @returns Display name for use in revision cards.
 */
function resolveRevisionDisplayName(
    revision: Revision,
    fallbackName?: string,
): string {
    const metadataName =
        revision.metadata && typeof revision.metadata === "object"
            ? revision.metadata["name"]
            : undefined;

    if (typeof metadataName === "string" && metadataName.trim().length > 0) {
        return metadataName.trim();
    }

    if (typeof fallbackName === "string" && fallbackName.trim().length > 0) {
        return fallbackName.trim();
    }

    return `Revision v${revision.versionNumber}`;
}

/**
 * Converts a persisted revision record into the slice entry shape.
 *
 * @param revision - Raw persisted revision metadata.
 * @param fallbackName - Optional UI label override.
 * @returns Normalized revision entry.
 */
function toRevisionEntry(
    revision: Revision,
    fallbackName?: string,
): RevisionEntry {
    return {
        ...revision,
        displayName: resolveRevisionDisplayName(revision, fallbackName),
    };
}

/**
 * Type guard for revision payload values.
 *
 * @param value - Unknown payload item.
 * @returns True when `value` matches the persisted revision shape.
 */
function isRevision(value: unknown): value is Revision {
    return (
        !!value &&
        typeof value === "object" &&
        "id" in value &&
        "resourceId" in value &&
        "versionNumber" in value &&
        "createdAt" in value &&
        "filePath" in value &&
        "isCanonical" in value
    );
}

/**
 * Sorts revisions newest-first by version number.
 *
 * @param revisions - Revision entries to order.
 * @returns Sorted revision entries.
 */
function sortRevisionsDescending(revisions: RevisionEntry[]): RevisionEntry[] {
    return [...revisions].sort((a, b) => b.versionNumber - a.versionNumber);
}

/**
 * Extracts and normalizes revisions from the list API payload.
 *
 * @param payload - JSON returned by `/api/project-resources`.
 * @returns Normalized revision entries.
 */
function parseRevisionEntries(payload: unknown): RevisionEntry[] {
    if (!payload || typeof payload !== "object") {
        return [];
    }

    const rawRevisions =
        "revisions" in payload
            ? (payload as ProjectResourcesResponse).revisions
            : payload;

    if (!Array.isArray(rawRevisions)) {
        return [];
    }

    return sortRevisionsDescending(
        rawRevisions
            .filter(isRevision)
            .map((revision) => toRevisionEntry(revision)),
    );
}

/**
 * Resolves the best default active revision for a loaded list.
 *
 * Prefers the canonical revision. If none is marked canonical, falls back to
 * the newest revision.
 *
 * @param revisions - Loaded revisions for the selected resource.
 * @returns Active revision ID, or `null` when the list is empty.
 */
function resolveCurrentRevisionId(revisions: RevisionEntry[]): string | null {
    const canonical = revisions.find((revision) => revision.isCanonical);
    if (canonical) {
        return canonical.id;
    }

    return revisions[0]?.id ?? null;
}

/**
 * Resolves the currently selected resource/project context needed for revision
 * API requests.
 *
 * @param state - Current Redux root state.
 * @param expectedResourceId - Resource the caller expects to be selected.
 * @returns Request context or a recoverable error string.
 */
function resolveRevisionRequestContext(
    state: RootState,
    expectedResourceId: string,
): { projectPath: string; resourceId: string } | { error: string } {
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

/**
 * Loads all revisions for the currently selected resource.
 */
export const loadRevisionsForSelectedResource = createAsyncThunk<
    LoadRevisionsResult,
    ResourceScopedPayload,
    { state: RootState; rejectValue: string }
>(
    "revisions/loadRevisionsForSelectedResource",
    async ({ resourceId }, thunkApi) => {
        const context = resolveRevisionRequestContext(
            thunkApi.getState(),
            resourceId,
        );

        if ("error" in context) {
            return thunkApi.rejectWithValue(context.error);
        }

        const response = await fetch("/api/project-resources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: context.projectPath,
                resourceId: context.resourceId,
            }),
        });

        if (!response.ok) {
            const errorBody = (await response.json().catch(() => ({}))) as {
                error?: string;
            };
            return thunkApi.rejectWithValue(
                errorBody.error ?? "Unable to load revisions.",
            );
        }

        const data = (await response.json()) as ProjectResourcesResponse;
        const revisions = parseRevisionEntries(data);

        return {
            resourceId,
            revisions,
            currentRevisionId: resolveCurrentRevisionId(revisions),
        };
    },
);

/**
 * Saves a new explicit revision for the currently selected resource.
 */
export const saveRevisionForSelectedResource = createAsyncThunk<
    SaveRevisionResult,
    SaveRevisionPayload,
    { state: RootState; rejectValue: string }
>(
    "revisions/saveRevisionForSelectedResource",
    async ({ resourceId, revisionName }, thunkApi) => {
        const context = resolveRevisionRequestContext(
            thunkApi.getState(),
            resourceId,
        );

        if ("error" in context) {
            return thunkApi.rejectWithValue(context.error);
        }

        const response = await fetch(`/api/resource/revision/${resourceId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: context.projectPath,
                isCanonical: false,
                metadata: { name: revisionName },
            }),
        });

        if (!response.ok) {
            const errorBody = (await response.json().catch(() => ({}))) as {
                error?: string;
            };
            return thunkApi.rejectWithValue(
                errorBody.error ?? "Failed to save revision.",
            );
        }

        const revision = toRevisionEntry(
            (await response.json()) as Revision,
            revisionName,
        );

        return {
            resourceId,
            revision,
        };
    },
);

/**
 * Removes a persisted revision for the currently selected resource.
 */
export const deleteRevisionForSelectedResource = createAsyncThunk<
    DeleteRevisionResult,
    DeleteRevisionPayload,
    { state: RootState; rejectValue: string }
>(
    "revisions/deleteRevisionForSelectedResource",
    async ({ resourceId, revisionId }, thunkApi) => {
        const context = resolveRevisionRequestContext(
            thunkApi.getState(),
            resourceId,
        );

        if ("error" in context) {
            return thunkApi.rejectWithValue(context.error);
        }

        const response = await fetch(`/api/resource/revision/${resourceId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: context.projectPath,
                revisionId,
            }),
        });

        if (!response.ok) {
            const errorBody = (await response.json().catch(() => ({}))) as {
                error?: string;
            };
            return thunkApi.rejectWithValue(
                errorBody.error ?? "Failed to delete revision.",
            );
        }

        return {
            resourceId,
            revisionId,
        };
    },
);

/**
 * Fetches preview content for a specific revision on the selected resource.
 */
export const fetchRevisionContentForSelectedResource = createAsyncThunk<
    FetchRevisionContentResult,
    FetchRevisionContentPayload,
    { state: RootState; rejectValue: string }
>(
    "revisions/fetchRevisionContentForSelectedResource",
    async ({ resourceId, revisionId }, thunkApi) => {
        const context = resolveRevisionRequestContext(
            thunkApi.getState(),
            resourceId,
        );

        if ("error" in context) {
            return thunkApi.rejectWithValue(context.error);
        }

        const params = new URLSearchParams({
            projectPath: context.projectPath,
            revisionId,
        });

        const response = await fetch(
            `/api/resource/revision/${resourceId}?${params.toString()}`,
        );

        if (!response.ok) {
            const errorBody = (await response.json().catch(() => ({}))) as {
                error?: string;
            };
            return thunkApi.rejectWithValue(
                errorBody.error ?? "Failed to fetch revision.",
            );
        }

        const data = (await response.json()) as RevisionContentResponse;

        return {
            resourceId,
            revisionId,
            content: data.content,
        };
    },
);

/**
 * Persists the canonical revision for the currently selected resource.
 */
export const setCanonicalRevisionForSelectedResource = createAsyncThunk<
    SetCanonicalRevisionResult,
    DeleteRevisionPayload,
    { state: RootState; rejectValue: string }
>(
    "revisions/setCanonicalRevisionForSelectedResource",
    async ({ resourceId, revisionId }, thunkApi) => {
        const context = resolveRevisionRequestContext(
            thunkApi.getState(),
            resourceId,
        );

        if ("error" in context) {
            return thunkApi.rejectWithValue(context.error);
        }

        const response = await fetch(`/api/resource/revision/${resourceId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: context.projectPath,
                revisionId,
            }),
        });

        if (!response.ok) {
            const errorBody = (await response.json().catch(() => ({}))) as {
                error?: string;
            };
            return thunkApi.rejectWithValue(
                errorBody.error ?? "Failed to set canonical revision.",
            );
        }

        return {
            resourceId,
            revisionId,
        };
    },
);

/**
 * Resets the slice back to its initial empty state.
 *
 * @param state - Slice draft state to reset.
 */
function resetRevisionState(state: RevisionsState): void {
    state.resourceId = null;
    state.requestedResourceId = null;
    state.currentRevisionId = null;
    state.currentRevisionContent = null;
    state.revisions = [];
    state.isLoading = false;
    state.isSaving = false;
    state.fetchingRevisionId = null;
    state.deletingRevisionId = null;
    state.errorMessage = "";
}

/**
 * `revisions` slice definition.
 */
const revisionsSlice = createSlice({
    name: "revisions",
    initialState,
    reducers: {
        /**
         * Clears all revision state.
         *
         * @param state - Current slice draft.
         */
        clearRevisions(state) {
            resetRevisionState(state);
            return state;
        },
        /**
         * Marks a revision as the active viewed revision without changing the
         * revision list itself.
         *
         * @param state - Current slice draft.
         * @param action - Active revision ID, or `null` to clear selection.
         */
        setCurrentRevisionId(state, action: PayloadAction<string | null>) {
            state.currentRevisionId = action.payload;
            if (action.payload === null) {
                state.currentRevisionContent = null;
            }
            return state;
        },
        /**
         * Updates the locally canonical revision selection.
         *
         * This mirrors the current `RevisionControl` behavior, which updates the
         * visible canonical badge client-side before a dedicated persistence flow
         * exists.
         *
         * @param state - Current slice draft.
         * @param action - Revision ID to mark canonical.
         */
        setCanonicalRevisionId(state, action: PayloadAction<string>) {
            const nextRevisionId = action.payload;
            state.revisions = state.revisions.map((revision) => ({
                ...revision,
                isCanonical: revision.id === nextRevisionId,
            }));
            state.currentRevisionId = nextRevisionId;
            return state;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(setSelectedResourceId, (state, action) => {
            if (state.resourceId === action.payload) {
                return state;
            }

            resetRevisionState(state);
            return state;
        });

        builder.addCase(
            loadRevisionsForSelectedResource.pending,
            (state, action) => {
                state.requestedResourceId = action.meta.arg.resourceId;
                state.isLoading = true;
                state.errorMessage = "";
            },
        );
        builder.addCase(
            loadRevisionsForSelectedResource.fulfilled,
            (state, action) => {
                if (state.requestedResourceId !== action.payload.resourceId) {
                    return state;
                }

                state.resourceId = action.payload.resourceId;
                state.requestedResourceId = null;
                state.currentRevisionId = action.payload.currentRevisionId;
                state.currentRevisionContent = null;
                state.revisions = action.payload.revisions;
                state.isLoading = false;
                return state;
            },
        );
        builder.addCase(
            loadRevisionsForSelectedResource.rejected,
            (state, action) => {
                if (state.requestedResourceId !== action.meta.arg.resourceId) {
                    return state;
                }

                state.requestedResourceId = null;
                state.isLoading = false;
                state.errorMessage =
                    action.payload ?? "Unable to load revisions.";
                return state;
            },
        );

        builder.addCase(saveRevisionForSelectedResource.pending, (state) => {
            state.isSaving = true;
            state.errorMessage = "";
        });
        builder.addCase(
            saveRevisionForSelectedResource.fulfilled,
            (state, action) => {
                if (
                    state.resourceId !== null &&
                    state.resourceId !== action.payload.resourceId
                ) {
                    return state;
                }

                state.resourceId = action.payload.resourceId;
                state.revisions = sortRevisionsDescending([
                    action.payload.revision,
                    ...state.revisions.filter(
                        (revision) =>
                            revision.id !== action.payload.revision.id,
                    ),
                ]);
                state.isSaving = false;
                return state;
            },
        );
        builder.addCase(
            saveRevisionForSelectedResource.rejected,
            (state, action) => {
                state.isSaving = false;
                state.errorMessage =
                    action.payload ?? "Failed to save revision.";
                return state;
            },
        );

        builder.addCase(
            fetchRevisionContentForSelectedResource.pending,
            (state, action) => {
                state.fetchingRevisionId = action.meta.arg.revisionId;
                state.errorMessage = "";
            },
        );
        builder.addCase(
            fetchRevisionContentForSelectedResource.fulfilled,
            (state, action) => {
                if (
                    state.resourceId !== null &&
                    state.resourceId !== action.payload.resourceId
                ) {
                    return state;
                }

                state.fetchingRevisionId = null;
                state.currentRevisionId = action.payload.revisionId;
                state.currentRevisionContent = action.payload.content;
                return state;
            },
        );
        builder.addCase(
            fetchRevisionContentForSelectedResource.rejected,
            (state, action) => {
                if (state.fetchingRevisionId !== action.meta.arg.revisionId) {
                    return state;
                }

                state.fetchingRevisionId = null;
                state.errorMessage =
                    action.payload ?? "Failed to fetch revision.";
                return state;
            },
        );

        builder.addCase(
            deleteRevisionForSelectedResource.pending,
            (state, action) => {
                state.deletingRevisionId = action.meta.arg.revisionId;
                state.errorMessage = "";
            },
        );
        builder.addCase(
            deleteRevisionForSelectedResource.fulfilled,
            (state, action) => {
                if (
                    state.resourceId !== null &&
                    state.resourceId !== action.payload.resourceId
                ) {
                    return state;
                }

                state.revisions = state.revisions.filter(
                    (revision) => revision.id !== action.payload.revisionId,
                );
                state.deletingRevisionId = null;

                if (state.currentRevisionId === action.payload.revisionId) {
                    state.currentRevisionId = resolveCurrentRevisionId(
                        state.revisions,
                    );
                    state.currentRevisionContent = null;
                }

                return state;
            },
        );
        builder.addCase(
            deleteRevisionForSelectedResource.rejected,
            (state, action) => {
                if (state.deletingRevisionId !== action.meta.arg.revisionId) {
                    return state;
                }

                state.deletingRevisionId = null;
                state.errorMessage =
                    action.payload ?? "Failed to delete revision.";
                return state;
            },
        );

        builder.addCase(
            setCanonicalRevisionForSelectedResource.pending,
            (state) => {
                state.errorMessage = "";
                return state;
            },
        );
        builder.addCase(
            setCanonicalRevisionForSelectedResource.fulfilled,
            (state, action) => {
                if (
                    state.resourceId !== null &&
                    state.resourceId !== action.payload.resourceId
                ) {
                    return state;
                }

                state.revisions = state.revisions.map((revision) => ({
                    ...revision,
                    isCanonical: revision.id === action.payload.revisionId,
                }));
                state.currentRevisionId = action.payload.revisionId;
                return state;
            },
        );
        builder.addCase(
            setCanonicalRevisionForSelectedResource.rejected,
            (state, action) => {
                state.errorMessage =
                    action.payload ?? "Failed to set canonical revision.";
                return state;
            },
        );
    },
});

export const { clearRevisions, setCurrentRevisionId, setCanonicalRevisionId } =
    revisionsSlice.actions;
export default revisionsSlice.reducer;

/**
 * Selects the raw `revisions` slice state.
 */
export const selectRevisionsState = (state: RootState): RevisionsState =>
    state.revisions;

/**
 * Selects the selected resource ID from the resources slice.
 */
const selectSelectedResourceId = (state: RootState): string | null =>
    state.resources.selectedResourceId;

/**
 * Selects revision entries only when they belong to the currently selected resource.
 */
export const selectVisibleRevisions = createSelector(
    [selectRevisionsState, selectSelectedResourceId],
    (revisionsState, selectedResourceId) => {
        if (
            !selectedResourceId ||
            revisionsState.resourceId !== selectedResourceId
        ) {
            return [];
        }

        return revisionsState.revisions;
    },
);

/**
 * Selects the active revision ID.
 */
export const selectCurrentRevisionId = (state: RootState): string | null =>
    state.revisions.currentRevisionId;

/**
 * Selects preview content for the active revision.
 */
export const selectCurrentRevisionContent = (state: RootState): string | null =>
    state.revisions.currentRevisionContent;

/**
 * Selects the revision loading flag.
 */
export const selectIsLoadingRevisions = (state: RootState): boolean =>
    state.revisions.isLoading;

/**
 * Selects the revision saving flag.
 */
export const selectIsSavingRevision = (state: RootState): boolean =>
    state.revisions.isSaving;

/**
 * Selects the currently preview-loading revision ID.
 */
export const selectFetchingRevisionId = (state: RootState): string | null =>
    state.revisions.fetchingRevisionId;

/**
 * Selects the currently delete-pending revision ID.
 */
export const selectDeletingRevisionId = (state: RootState): string | null =>
    state.revisions.deletingRevisionId;

/**
 * Selects the latest revision UI error message.
 */
export const selectRevisionsErrorMessage = (state: RootState): string =>
    state.revisions.errorMessage;
