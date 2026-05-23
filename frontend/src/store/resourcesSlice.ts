import {
  createAsyncThunk,
  createSelector,
  createSlice,
  PayloadAction,
} from "@reduxjs/toolkit";
import { AnyResource, Folder } from "../lib/models";
import { renameMetadataFieldKey } from "./projectsSlice";
import { reorderResources } from "../lib/api/resources";

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

export const persistReorder = createAsyncThunk(
  "projects/persistReorder",
  async (payload: {
    projectId: string;
    projectRoot: string;
    folderOrder: Array<{
      id: string;
      orderIndex?: number;
      folderId?: string | null;
    }>;
    resourceOrder: Array<{
      id: string;
      orderIndex?: number;
      folderId?: string | null;
    }>;
  }) => {
    const { projectRoot, folderOrder, resourceOrder, projectId } = payload;
    await reorderResources(projectId, { folderOrder, resourceOrder });
    return { projectRoot, folderOrder, resourceOrder };
  },
);

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
      if (action.payload.type === "folder") {
        state.folders.push(action.payload as Folder);
        return state;
      }
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
    updateResources(
      state,
      action: PayloadAction<Array<Partial<AnyResource> & { id: string }>>,
    ) {
      const resourceMap = new Map(state.resources.map((r) => [r.id, r]));
      for (const update of action.payload) {
        if (resourceMap.has(update.id)) {
          resourceMap.set(update.id, {
            ...resourceMap.get(update.id)!,
            ...update,
          });
        }
      }
      state.resources = Array.from(resourceMap.values());
      return state;
    },
    updateFolder(
      state,
      action: PayloadAction<Partial<Folder> & { id: string }>,
    ) {
      const index = state.folders.findIndex((r) => r.id === action.payload.id);
      if (index !== -1) {
        state.folders[index] = { ...state.folders[index], ...action.payload };
      }
      return state;
    },
    updateFolders(
      state,
      action: PayloadAction<Array<Partial<Folder> & { id: string }>>,
    ) {
      const folderMap = new Map(state.folders.map((r) => [r.id, r]));
      for (const update of action.payload) {
        if (folderMap.has(update.id)) {
          folderMap.set(update.id, { ...folderMap.get(update.id)!, ...update });
        }
      }
      state.folders = Array.from(folderMap.values());
      return state;
    },
    removeResource(state, action: PayloadAction<string>) {
      state.resources = state.resources.filter((r) => r.id !== action.payload);
      state.folders = state.folders.filter((f) => f.id !== action.payload);
      return state;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(renameMetadataFieldKey.fulfilled, (state, action) => {
      const { fieldKey: oldKey, newKey } = action.meta.arg;
      for (const resource of state.resources) {
        if (!resource.userMetadata || !(oldKey in resource.userMetadata))
          continue;
        const { [oldKey]: value, ...rest } = resource.userMetadata;
        resource.userMetadata = { ...rest, [newKey]: value };
      }
    });
  },
});

export const {
  setResources,
  setSelectedResourceId,
  updateResource,
  updateFolder,
  addResource,
  setFolders,
  updateResources,
  updateFolders,
  removeResource,
} = resourcesSlice.actions;
export default resourcesSlice.reducer;

export const selectResource = (state: ResourcesState) => {
  return (
    state.resources.find(
      (resource) => resource.id === state.selectedResourceId,
    ) ||
    state.folders.find((folder) => folder.id === state.selectedResourceId) ||
    null
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
