import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AnyResource } from "../lib/models";

interface ResourcesState {
    selectedResourceId: string | null;
    resources: AnyResource[];
}

const initialState: ResourcesState = {
    selectedResourceId: null,
    resources: [],
};

const resourcesSlice = createSlice({
    name: "resources",
    initialState,
    reducers: {
        setResources(state, action: PayloadAction<AnyResource[]>) {
            state.resources = action.payload;
        },
        setSelectedResourceId(state, action: PayloadAction<string | null>) {
            state.selectedResourceId = action.payload;
        },
    },
});

export const { setResources, setSelectedResourceId } = resourcesSlice.actions;
export default resourcesSlice.reducer;

export const selectedResource = (state: ResourcesState) => {
    return (
        state.resources.find(
            (resource) => resource.id === state.selectedResourceId,
        ) || null
    );
};
