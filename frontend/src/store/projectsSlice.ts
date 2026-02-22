import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";

type Folder = { id: string; slug?: string; name?: string; orderIndex?: number };
type ResourceMeta = { id: string; metadata?: Record<string, unknown> };

export interface StoredProject {
    id: string;
    name?: string;
    folders?: Folder[];
    resources?: ResourceMeta[];
}

export interface ProjectsState {
    selectedProjectId: string | null;
    projects: Record<string, StoredProject>;
}

const initialState: ProjectsState = {
    selectedProjectId: null,
    projects: {},
};

/**
 * Persist reorder by calling the backend API and, on success, update local store
 * with the new orderIndex values for folders and resources.
 */
export const persistReorder = createAsyncThunk(
    "projects/persistReorder",
    async (payload: {
        projectId: string;
        folderOrder: Array<{ id: string; orderIndex: number }>;
        resourceOrder: Array<{ id: string; orderIndex: number }>;
    }) => {
        const { projectId, folderOrder, resourceOrder } = payload;
        await fetch(`/api/projects/${projectId}/reorder`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderOrder, resourceOrder }),
        });
        return { projectId, folderOrder, resourceOrder };
    },
);

const projectsSlice = createSlice({
    name: "projects",
    initialState,
    reducers: {
        setProject(state, action: PayloadAction<StoredProject>) {
            state.projects[action.payload.id] = action.payload;
        },
        setSelectedProjectId(state, action: PayloadAction<string | null>) {
            state.selectedProjectId = action.payload;
        },
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
        },
        removeResource(
            state,
            action: PayloadAction<{ projectId: string; resourceId: string }>,
        ) {
            const { projectId, resourceId } = action.payload;
            const proj = state.projects[projectId];
            if (!proj || !proj.resources) return;
            proj.resources = proj.resources.filter((r) => r.id !== resourceId);
            state.projects[projectId] = proj;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(persistReorder.fulfilled, (state, action) => {
            const { projectId, folderOrder, resourceOrder } = action.payload;
            const proj = state.projects[projectId];
            if (!proj) return;

            // merge folder orderIndex
            if (proj.folders) {
                const map = new Map(
                    folderOrder.map((f) => [f.id, f.orderIndex]),
                );
                proj.folders = proj.folders.map((f) => ({
                    ...f,
                    orderIndex: map.has(f.id)
                        ? (map.get(f.id) as number)
                        : f.orderIndex,
                }));
            }

            // merge resource orderIndex into metadata
            if (proj.resources) {
                const rmap = new Map(
                    resourceOrder.map((r) => [r.id, r.orderIndex]),
                );
                proj.resources = proj.resources.map((r) => ({
                    ...r,
                    metadata: {
                        ...(r.metadata ?? {}),
                        orderIndex: rmap.has(r.id)
                            ? (rmap.get(r.id) as number)
                            : (r.metadata?.orderIndex ?? undefined),
                    },
                }));
            }
        });
    },
});

export const { setProject, setSelectedProjectId, addResource, removeResource } =
    projectsSlice.actions;
export default projectsSlice.reducer;

// Selectors (simple helpers; avoid importing RootState here to prevent circular imports)
export const selectProject = (
    state: any,
    projectId: string,
): StoredProject | null => {
    const raw = state?.projects?.projects?.[projectId] ?? null;
    if (!raw) return null;
    return normalizeStoredProject(raw);
};

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
                folders: Array.isArray(p.folders)
                    ? p.folders
                    : (p.folders ?? []),
            };
        }
    }

    const resources = Array.isArray(p.resources)
        ? p.resources.map((r) => ({ id: r.id, metadata: r.metadata ?? {} }))
        : p.resources;
    const folders = Array.isArray(p.folders) ? p.folders : (p.folders ?? []);
    return { ...p, resources, folders };
}
