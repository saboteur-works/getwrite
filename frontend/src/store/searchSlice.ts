import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
    executeSearchRequest,
    resolveSearchRequestContext,
    type SearchResult,
} from "./search-transport-service";
import type { RootState } from "./store";

export type { SearchResult } from "./search-transport-service";

export interface SearchState {
    requestedProjectId: string | null;
    requestedQuery: string;
    results: SearchResult[];
    isLoading: boolean;
    errorMessage: string;
}

interface SearchPayload {
    projectId: string;
    query: string;
}

interface SearchFulfilledResult {
    projectId: string;
    query: string;
    results: SearchResult[];
}

const initialState: SearchState = {
    requestedProjectId: null,
    requestedQuery: "",
    results: [],
    isLoading: false,
    errorMessage: "",
};

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return fallback;
}

export const runSearch = createAsyncThunk<
    SearchFulfilledResult,
    SearchPayload,
    { state: RootState; rejectValue: string }
>("search/runSearch", async ({ projectId, query }, thunkApi) => {
    const context = resolveSearchRequestContext(thunkApi.getState(), projectId);

    if ("error" in context) {
        return thunkApi.rejectWithValue(context.error);
    }

    try {
        const results = await executeSearchRequest(context, query);
        return { projectId, query, results };
    } catch (error) {
        return thunkApi.rejectWithValue(
            getErrorMessage(error, "Unable to perform search."),
        );
    }
});

const searchSlice = createSlice({
    name: "search",
    initialState,
    reducers: {
        clearSearch(state) {
            state.requestedProjectId = null;
            state.requestedQuery = "";
            state.results = [];
            state.isLoading = false;
            state.errorMessage = "";
            return state;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(runSearch.pending, (state, action) => {
            state.requestedProjectId = action.meta.arg.projectId;
            state.requestedQuery = action.meta.arg.query;
            state.isLoading = true;
            state.errorMessage = "";
        });

        builder.addCase(runSearch.fulfilled, (state, action) => {
            if (
                state.requestedProjectId !== action.payload.projectId ||
                state.requestedQuery !== action.payload.query
            ) {
                return state;
            }

            state.requestedProjectId = null;
            state.results = action.payload.results;
            state.isLoading = false;
            return state;
        });

        builder.addCase(runSearch.rejected, (state, action) => {
            if (
                state.requestedProjectId !== action.meta.arg.projectId ||
                state.requestedQuery !== action.meta.arg.query
            ) {
                return state;
            }

            state.requestedProjectId = null;
            state.isLoading = false;
            state.errorMessage =
                action.payload ?? "Unable to perform search.";
            return state;
        });
    },
});

export const { clearSearch } = searchSlice.actions;
export default searchSlice.reducer;

export const selectSearchResults = (state: RootState): SearchResult[] =>
    state.search.results;

export const selectSearchIsLoading = (state: RootState): boolean =>
    state.search.isLoading;

export const selectSearchErrorMessage = (state: RootState): string =>
    state.search.errorMessage;
