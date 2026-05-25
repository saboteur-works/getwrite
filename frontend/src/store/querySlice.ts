import {
  createAsyncThunk,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import type { SavedQuery } from "../lib/models/saved-queries";
import type { QueryAST } from "../lib/models/query-ast";
import {
  evaluateQueryAst,
  fetchSavedQueryList,
  persistSavedQuery,
  removeSavedQuery,
  resolveQueryRequestContext,
} from "./query-transport-service";
import { setSelectedProjectId } from "./projectsSlice";
import type { RootState } from "./store";

export type { SavedQuery } from "../lib/models/saved-queries";
export type { QueryAST } from "../lib/models/query-ast";

export interface QueryState {
  /** Project whose saved queries are currently loaded. */
  projectId: string | null;
  /** Project currently being requested for the list load — used to ignore stale responses. */
  requestedProjectId: string | null;
  /** All loaded saved queries, keyed by id. */
  savedQueries: Record<string, SavedQuery>;
  /** True while the saved-query list is loading. */
  isLoadingQueries: boolean;
  /** True while a query evaluation is in flight. */
  isEvaluating: boolean;
  /** Project the current evaluation is scoped to — used to ignore stale results. */
  evaluatingForProjectId: string | null;
  /** AST of the last successfully evaluated query. */
  activeQueryDefinition: QueryAST | null;
  /** Resource IDs from the last successful evaluation. */
  activeQueryIds: string[];
  /** ID of the query currently being saved, or null. */
  savingQueryId: string | null;
  /** ID of the query currently being deleted, or null. */
  deletingQueryId: string | null;
  /** Latest error surfaced to the query UI. Empty string when none. */
  errorMessage: string;
}

// ─── Payload interfaces ───────────────────────────────────────────────────────

interface ProjectScopedPayload {
  projectId: string;
}

interface SaveQueryPayload extends ProjectScopedPayload {
  query: SavedQuery;
}

interface DeleteQueryPayload extends ProjectScopedPayload {
  queryId: string;
}

interface EvaluateQueryPayload extends ProjectScopedPayload {
  definition: QueryAST;
}

// ─── Result interfaces ────────────────────────────────────────────────────────

interface LoadSavedQueriesResult {
  projectId: string;
  savedQueries: Record<string, SavedQuery>;
}

interface SaveQueryResult {
  projectId: string;
  query: SavedQuery;
}

interface DeleteQueryResult {
  projectId: string;
  queryId: string;
}

interface EvaluateQueryResult {
  projectId: string;
  definition: QueryAST;
  ids: string[];
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: QueryState = {
  projectId: null,
  requestedProjectId: null,
  savedQueries: {},
  isLoadingQueries: false,
  isEvaluating: false,
  evaluatingForProjectId: null,
  activeQueryDefinition: null,
  activeQueryIds: [],
  savingQueryId: null,
  deletingQueryId: null,
  errorMessage: "",
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}

function resetQueryState(state: QueryState): void {
  state.projectId = null;
  state.requestedProjectId = null;
  state.savedQueries = {};
  state.isLoadingQueries = false;
  state.isEvaluating = false;
  state.evaluatingForProjectId = null;
  state.activeQueryDefinition = null;
  state.activeQueryIds = [];
  state.savingQueryId = null;
  state.deletingQueryId = null;
  state.errorMessage = "";
}

// ─── Async thunks ─────────────────────────────────────────────────────────────

/**
 * Loads all saved queries for the currently selected project.
 */
export const loadSavedQueries = createAsyncThunk<
  LoadSavedQueriesResult,
  ProjectScopedPayload,
  { state: RootState; rejectValue: string }
>("queries/loadSavedQueries", async ({ projectId }, thunkApi) => {
  const context = resolveQueryRequestContext(thunkApi.getState(), projectId);
  if ("error" in context) {
    return thunkApi.rejectWithValue(context.error);
  }

  try {
    const data = await fetchSavedQueryList(context);
    const savedQueries: Record<string, SavedQuery> = {};
    for (const query of data.queries) {
      savedQueries[query.id] = query;
    }
    return { projectId, savedQueries };
  } catch (error) {
    return thunkApi.rejectWithValue(
      getErrorMessage(error, "Unable to load saved queries."),
    );
  }
});

/**
 * Writes (creates or overwrites) a saved query for the currently selected project.
 */
export const saveQuery = createAsyncThunk<
  SaveQueryResult,
  SaveQueryPayload,
  { state: RootState; rejectValue: string }
>("queries/saveQuery", async ({ projectId, query }, thunkApi) => {
  const context = resolveQueryRequestContext(thunkApi.getState(), projectId);
  if ("error" in context) {
    return thunkApi.rejectWithValue(context.error);
  }

  try {
    const data = await persistSavedQuery(context, query);
    return { projectId, query: data.query };
  } catch (error) {
    return thunkApi.rejectWithValue(
      getErrorMessage(error, "Failed to save query."),
    );
  }
});

/**
 * Deletes a saved query from the currently selected project.
 */
export const deleteQuery = createAsyncThunk<
  DeleteQueryResult,
  DeleteQueryPayload,
  { state: RootState; rejectValue: string }
>("queries/deleteQuery", async ({ projectId, queryId }, thunkApi) => {
  const context = resolveQueryRequestContext(thunkApi.getState(), projectId);
  if ("error" in context) {
    return thunkApi.rejectWithValue(context.error);
  }

  try {
    await removeSavedQuery(context, queryId);
    return { projectId, queryId };
  } catch (error) {
    return thunkApi.rejectWithValue(
      getErrorMessage(error, "Failed to delete query."),
    );
  }
});

/**
 * Evaluates a query AST inline and stores the matching resource IDs.
 */
export const evaluateQuery = createAsyncThunk<
  EvaluateQueryResult,
  EvaluateQueryPayload,
  { state: RootState; rejectValue: string }
>("queries/evaluateQuery", async ({ projectId, definition }, thunkApi) => {
  const context = resolveQueryRequestContext(thunkApi.getState(), projectId);
  if ("error" in context) {
    return thunkApi.rejectWithValue(context.error);
  }

  try {
    const data = await evaluateQueryAst(context, definition);
    return { projectId, definition, ids: data.ids };
  } catch (error) {
    return thunkApi.rejectWithValue(
      getErrorMessage(error, "Query evaluation failed."),
    );
  }
});

// ─── Slice definition ─────────────────────────────────────────────────────────

const querySlice = createSlice({
  name: "queries",
  initialState,
  reducers: {
    /**
     * Clears all query state.
     */
    clearQueries(state) {
      resetQueryState(state);
      return state;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setSelectedProjectId, (state, action) => {
      if (state.projectId === action.payload) return state;
      resetQueryState(state);
      return state;
    });

    // ── loadSavedQueries ─────────────────────────────────────────────────
    builder.addCase(loadSavedQueries.pending, (state, action) => {
      state.requestedProjectId = action.meta.arg.projectId;
      state.isLoadingQueries = true;
      state.errorMessage = "";
    });
    builder.addCase(loadSavedQueries.fulfilled, (state, action) => {
      if (state.requestedProjectId !== action.payload.projectId) {
        return state;
      }
      state.projectId = action.payload.projectId;
      state.requestedProjectId = null;
      state.savedQueries = action.payload.savedQueries;
      state.isLoadingQueries = false;
      return state;
    });
    builder.addCase(loadSavedQueries.rejected, (state, action) => {
      if (state.requestedProjectId !== action.meta.arg.projectId) {
        return state;
      }
      state.requestedProjectId = null;
      state.isLoadingQueries = false;
      state.errorMessage = action.payload ?? "Unable to load saved queries.";
      return state;
    });

    // ── saveQuery ────────────────────────────────────────────────────────
    builder.addCase(saveQuery.pending, (state, action) => {
      state.savingQueryId = action.meta.arg.query.id;
      state.errorMessage = "";
    });
    builder.addCase(saveQuery.fulfilled, (state, action) => {
      if (
        state.projectId !== null &&
        state.projectId !== action.payload.projectId
      ) {
        return state;
      }
      state.savedQueries[action.payload.query.id] = action.payload.query;
      if (state.savingQueryId === action.payload.query.id) {
        state.savingQueryId = null;
      }
      return state;
    });
    builder.addCase(saveQuery.rejected, (state, action) => {
      if (state.savingQueryId === action.meta.arg.query.id) {
        state.savingQueryId = null;
      }
      state.errorMessage = action.payload ?? "Failed to save query.";
      return state;
    });

    // ── deleteQuery ──────────────────────────────────────────────────────
    builder.addCase(deleteQuery.pending, (state, action) => {
      state.deletingQueryId = action.meta.arg.queryId;
      state.errorMessage = "";
    });
    builder.addCase(deleteQuery.fulfilled, (state, action) => {
      if (
        state.projectId !== null &&
        state.projectId !== action.payload.projectId
      ) {
        return state;
      }
      if (state.deletingQueryId !== action.payload.queryId) {
        return state;
      }
      delete state.savedQueries[action.payload.queryId];
      state.deletingQueryId = null;
      return state;
    });
    builder.addCase(deleteQuery.rejected, (state, action) => {
      if (state.deletingQueryId !== action.meta.arg.queryId) {
        return state;
      }
      state.deletingQueryId = null;
      state.errorMessage = action.payload ?? "Failed to delete query.";
      return state;
    });

    // ── evaluateQuery ────────────────────────────────────────────────────
    builder.addCase(evaluateQuery.pending, (state, action) => {
      state.isEvaluating = true;
      state.evaluatingForProjectId = action.meta.arg.projectId;
      state.errorMessage = "";
    });
    builder.addCase(evaluateQuery.fulfilled, (state, action) => {
      if (state.evaluatingForProjectId !== action.payload.projectId) {
        return state;
      }
      state.isEvaluating = false;
      state.evaluatingForProjectId = null;
      state.activeQueryDefinition = action.payload.definition;
      state.activeQueryIds = action.payload.ids;
      return state;
    });
    builder.addCase(evaluateQuery.rejected, (state, action) => {
      if (state.evaluatingForProjectId !== action.meta.arg.projectId) {
        return state;
      }
      state.isEvaluating = false;
      state.evaluatingForProjectId = null;
      state.errorMessage = action.payload ?? "Query evaluation failed.";
      return state;
    });
  },
});

export const { clearQueries } = querySlice.actions;
export default querySlice.reducer;

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectQueryState = (state: RootState): QueryState => state.queries;

const selectSelectedProjectId = (state: RootState): string | null =>
  state.projects.selectedProjectId;

/**
 * Selects the saved-queries dict only when it belongs to the currently
 * selected project.
 */
export const selectSavedQueries = createSelector(
  [selectQueryState, selectSelectedProjectId],
  (queryState, selectedProjectId) => {
    if (!selectedProjectId || queryState.projectId !== selectedProjectId) {
      return {} as Record<string, SavedQuery>;
    }
    return queryState.savedQueries;
  },
);

/**
 * Selects saved queries as a sorted array (by name).
 */
export const selectSavedQueriesList = createSelector(
  [selectSavedQueries],
  (savedQueries) =>
    Object.values(savedQueries).sort((a, b) => a.name.localeCompare(b.name)),
);

export const selectIsLoadingQueries = (state: RootState): boolean =>
  state.queries.isLoadingQueries;

export const selectIsEvaluating = (state: RootState): boolean =>
  state.queries.isEvaluating;

export const selectActiveQueryDefinition = (
  state: RootState,
): QueryAST | null => state.queries.activeQueryDefinition;

export const selectActiveQueryIds = (state: RootState): string[] =>
  state.queries.activeQueryIds;

export const selectSavingQueryId = (state: RootState): string | null =>
  state.queries.savingQueryId;

export const selectDeletingQueryId = (state: RootState): string | null =>
  state.queries.deletingQueryId;

export const selectQueryErrorMessage = (state: RootState): string =>
  state.queries.errorMessage;
