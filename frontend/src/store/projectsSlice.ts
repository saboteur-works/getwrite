// Last Updated: 2026-03-11

/**
 * @module projectsSlice
 *
 * Redux Toolkit slice responsible for project-level state:
 * - the map of known projects keyed by project ID
 * - the currently selected project ID
 *
 * This slice intentionally stores a lightweight project projection used by
 * shell-level UI concerns (project selection, project-scoped resource lists),
 * while resource editing details are maintained in `resourcesSlice`.
 */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Project } from "../lib/models";
import type { MetadataValue } from "../lib/models/types";

/**
 * Minimal folder shape persisted within a stored project record.
 */
type Folder = { id: string; slug?: string; name?: string; orderIndex?: number };

/**
 * Minimal resource metadata shape persisted within a stored project record.
 */
type ResourceMeta = {
    /** Stable unique resource identifier. */
    id: string;
    /** Human-readable resource name shown in lists. */
    name: string;
    /** Parent folder ID, or `null`/`undefined` for top-level resources. */
    folderId?: string | null;
    /** Arbitrary metadata blob associated with the resource. */
    metadata?: Record<string, unknown>;
};

/**
 * Project record stored in the `projects` slice dictionary.
 */
export interface StoredProject {
    /** Stable unique project identifier. */
    id: string;
    /** Optional display name for the project. */
    name?: string;
    /** Absolute project root path on disk. */
    rootPath: string;
    /** Folder entries known for this project. */
    folders?: Folder[];
    /** Resource entries known for this project. */
    resources?: ResourceMeta[];
    /** Optional project-level metadata persisted in project.json. */
    metadata?: Record<string, MetadataValue>;
}

/**
 * Root state shape managed by this slice.
 */
export interface ProjectsState {
    /** ID of the currently active project, or `null` when none is selected. */
    selectedProjectId: string | null;
    /** Dictionary of stored projects keyed by project ID. */
    projects: Record<string, StoredProject>;
}

/**
 * Initial state for the `projects` slice.
 */
const initialState: ProjectsState = {
    selectedProjectId: null,
    projects: {},
};

/**
 * `projects` slice definition.
 */
const projectsSlice = createSlice({
    name: "projects",
    initialState,
    reducers: {
        /**
         * Upserts a single project record by ID.
         *
         * @param state - Current slice state draft.
         * @param action - Payload containing a full stored project snapshot.
         */
        setProject(state, action: PayloadAction<StoredProject>) {
            state.projects[action.payload.id] = action.payload;
            return state;
        },
        /**
         * Replaces/updates multiple project records from canonical project views.
         *
         * @param state - Current slice state draft.
         * @param action - Array of project view payloads containing canonical
         *   project metadata plus folder/resource arrays.
         */
        setProjects(
            state,
            action: PayloadAction<
                {
                    project: Project;
                    folders: Folder[];
                    resources: ResourceMeta[];
                }[]
            >,
        ) {
            action.payload.forEach((p) => {
                state.projects[p.project.id] = {
                    id: p.project.id,
                    name: p.project.name,
                    rootPath: p.project.rootPath ?? "",
                    folders: p.folders,
                    resources: p.resources,
                    metadata: p.project.metadata,
                };
            });
            return state;
        },
        /**
         * Sets the currently selected project ID.
         *
         * @param state - Current slice state draft.
         * @param action - Selected project ID, or `null` to clear selection.
         */
        setSelectedProjectId(state, action: PayloadAction<string | null>) {
            state.selectedProjectId = action.payload;
            return state;
        },
        /**
         * Updates a stored project's display name.
         *
         * @param state - Current slice state draft.
         * @param action - Target project ID and next display name.
         */
        renameProject(
            state,
            action: PayloadAction<{ projectId: string; newName: string }>,
        ) {
            const { projectId, newName } = action.payload;
            const project = state.projects[projectId];
            if (!project) {
                return state;
            }

            state.projects[projectId] = {
                ...project,
                name: newName,
            };
            return state;
        },
        /**
         * Removes a stored project by ID and clears selection when needed.
         *
         * @param state - Current slice state draft.
         * @param action - Project identifier to remove.
         */
        deleteProject(state, action: PayloadAction<{ projectId: string }>) {
            const { projectId } = action.payload;
            if (!(projectId in state.projects)) {
                return state;
            }

            delete state.projects[projectId];
            if (state.selectedProjectId === projectId) {
                state.selectedProjectId = null;
            }

            return state;
        },
        /**
         * Appends a resource to a project's `resources` array.
         *
         * @deprecated
         * Prefer resource mutations in `resourcesSlice` and project refresh
         * flows that avoid duplicating source-of-truth state.
         *
         * @param state - Current slice state draft.
         * @param action - Target project ID and resource payload to append.
         */
        addResource(
            state,
            action: PayloadAction<{
                projectId: string;
                resource: ResourceMeta;
            }>,
        ) {
            const { projectId, resource } = action.payload;
            const proj = state.projects[projectId] ?? {
                id: projectId,
                folders: [],
                resources: [],
            };
            proj.resources = proj.resources
                ? [...proj.resources, resource]
                : [resource];
            state.projects[projectId] = proj;
            return state;
        },
        /**
         * Removes a resource from a project's `resources` array by ID.
         *
         * @param state - Current slice state draft.
         * @param action - Target project/resource identifiers.
         */
        removeResource(
            state,
            action: PayloadAction<{ projectId: string; resourceId: string }>,
        ) {
            const { projectId, resourceId } = action.payload;
            const proj = state.projects[projectId];
            if (!proj || !proj.resources) return;
            proj.resources = proj.resources.filter((r) => r.id !== resourceId);
            state.projects[projectId] = proj;
            return state;
        },
    },
});

export const {
    setProject,
    setProjects,
    setSelectedProjectId,
    renameProject,
    deleteProject,
    addResource,
    removeResource,
} = projectsSlice.actions;
export default projectsSlice.reducer;

/**
 * Selects a normalized project record for `projectId`.
 *
 * The selector memoizes the normalized value per project ID using the raw
 * stored-project object reference as cache key. This avoids allocating a new
 * normalized object every call and reduces unnecessary re-renders in
 * components that subscribe to project data.
 *
 * @param state - Redux root state (typed as `any` here to avoid store-cycle
 *   imports).
 * @param projectId - Project ID to fetch.
 * @returns Normalized stored project, or `null` if missing.
 */
export const selectProject = (
    state: any,
    projectId: string,
): StoredProject | null => {
    const raw = state?.projects?.projects?.[projectId] ?? null;
    if (!raw) return null;
    // Memoize normalized results per projectId to avoid allocating a new
    // normalized object on every selector call which can trigger
    // unnecessary re-renders and effect loops in components consuming
    // the selector (e.g., ResourceTree). Use the raw stored project
    // reference as the cache key so cached results are reused until the
    // stored project reference changes.
    // NOTE: keep this cache conservative and per-process; it does not
    // attempt to detect deep equality — replacing the stored project in
    // the Redux state (the common case when mutating) will update the
    // raw reference and refresh the cache entry.
    const existing = selectProjectCache.get(projectId);
    if (existing && existing.raw === raw) return existing.result;
    const result = normalizeStoredProject(raw);
    selectProjectCache.set(projectId, { raw, result });
    return result;
};

/**
 * Per-project normalization cache used by {@link selectProject}.
 */
const selectProjectCache: Map<
    string,
    { raw: any; result: StoredProject | null }
> = new Map();

/**
 * Selects the currently selected project ID.
 *
 * @param state - Redux root state (typed as `any` to avoid circular imports).
 * @returns Selected project ID, or `null` if no project is active.
 */
export const selectSelectedProjectId = (state: any): string | null => {
    return state?.projects?.selectedProjectId ?? null;
};

/**
 * Normalizes legacy persisted project shapes to the runtime StoredProject shape
 * used by the UI. This accepts the historical `{ resources?: ResourceMeta[] }`
 * shape and ensures `resources` items have a `metadata` object and folders
 * are present as an array. Keep this small and conservative so it is safe to
 * remove once the app no longer persists the legacy shape.
 */
export function normalizeStoredProject(p: StoredProject): StoredProject {
    if (!p) return p;
    // If resources are already full canonical resource objects (contain `name`),
    // assume they're migrated and return as-is to preserve display fields.
    if (Array.isArray(p.resources) && p.resources.length > 0) {
        const first = p.resources[0] as any;
        if (first && typeof first.name === "string") {
            return {
                ...p,
                folders: p.folders ?? [],
            };
        }
    }

    const resources = Array.isArray(p.resources)
        ? p.resources.map((r) => ({
              id: r.id,
              name: r.name ?? "",
              metadata: r.metadata ?? {},
          }))
        : p.resources;
    const folders = p.folders ?? [];

    return { ...p, resources, folders };
}
