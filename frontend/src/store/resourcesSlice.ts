import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AnyResource, Folder } from "../lib/models";

interface ResourcesState {
    selectedResourceId: string | null;
    resources: AnyResource[];
    folders: Folder[];
}

const initialState: ResourcesState = {
    selectedResourceId: null,
    resources: [],
    folders: [],
};

const resourcesSlice = createSlice({
    name: "resources",
    initialState,
    reducers: {
        setResources(state, action: PayloadAction<AnyResource[]>) {
            state.resources = action.payload;
            return state;
        },
        setFolders(state, action: PayloadAction<Folder[]>) {
            state.folders = action.payload;
            return state;
        },
        setSelectedResourceId(state, action: PayloadAction<string | null>) {
            state.selectedResourceId = action.payload;
            return state;
        },
        addResource(state, action: PayloadAction<AnyResource>) {
            state.resources.push(action.payload);
            return state;
        },
        updateResource(
            state,
            action: PayloadAction<Partial<AnyResource> & { id: string }>,
        ) {
            const index = state.resources.findIndex(
                (r) => r.id === action.payload.id,
            );
            if (index !== -1) {
                state.resources[index] = {
                    ...state.resources[index],
                    ...action.payload,
                };
            }
            return state;
        },
        updateFolder(
            state,
            action: PayloadAction<Partial<Folder> & { id: string }>,
        ) {
            const index = state.folders.findIndex(
                (r) => r.id === action.payload.id,
            );
            if (index !== -1) {
                state.folders[index] = {
                    ...state.folders[index],
                    ...action.payload,
                };
            }
            return state;
        },
    },
});

export const {
    setResources,
    setSelectedResourceId,
    updateResource,
    updateFolder,
    addResource,
    setFolders,
} = resourcesSlice.actions;
export default resourcesSlice.reducer;

export const selectedResource = (state: ResourcesState) => {
    return (
        state.resources.find(
            (resource) => resource.id === state.selectedResourceId,
        ) || null
    );
};

/**
 * Select all currently loaded resources. Note that this does not include folders, which are stored separately. Use `selectFoldersAndResources` if you want both.
 */
export const selectResources = (state: ResourcesState) => state.resources;

/**
 * Select all currently loaded folders. Note that this does not include resources, which are stored separately. Use `selectFoldersAndResources` if you want both.
 */
export const selectFolders = (state: ResourcesState) => state.folders;

/**
 * Select all currently loaded folders and resources as a single array. Note that this does not guarantee any particular order; if you want them sorted in a specific way, you should use `selectFolders` and `selectResources` separately and sort them in the selector or component.
 */
export const selectFoldersAndResources = createSelector(
    [selectFolders, selectResources],
    (folders, resources) => [...folders, ...resources],
);

/**
 * Select a resource by its ID.
 * @param state The current state of the resources slice.
 * @param id The ID of the resource to select.
 * @returns The resource with the specified ID, or null if not found.
 */
export const selectResourceById = (state: ResourcesState, id: string) => {
    return state.resources.find((resource) => resource.id === id) || null;
};

export const selectFolderById = (state: ResourcesState, id: string) => {
    return state.folders.find((folder) => folder.id === id) || null;
};

export const selectItemById = createSelector(
    [selectFoldersAndResources, (state: ResourcesState, id: string) => id],
    (items, id) => items.find((item) => item.id === id) || null,
);
