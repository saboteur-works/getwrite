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
        updateResource(state, action: PayloadAction<AnyResource>) {
            const index = state.resources.findIndex(
                (r) => r.id === action.payload.id,
            );
            if (index !== -1) {
                state.resources[index] = action.payload;
            }
            return state;
        },
    },
});

export const {
    setResources,
    setSelectedResourceId,
    updateResource,
    addResource,
} = resourcesSlice.actions;
export default resourcesSlice.reducer;

export const selectedResource = (state: ResourcesState) => {
    return (
        state.resources.find(
            (resource) => resource.id === state.selectedResourceId,
        ) || null
    );
};
