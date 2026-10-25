/**
 * @module spellingSlice
 *
 * The active project's two spelling lists (spell-checker FR-15/FR-16) with a
 * `not-loaded | loaded | failed` state. Loaded on project load
 * (`projectsSlice.ts`'s `loadProject`) and replaced wholesale by every
 * mutation's response: there is no optimistic update, and a failed mutation
 * leaves the lists untouched and rejects.
 *
 * A failed load is `failed`, never `loaded` with empty lists
 * (`docs/standards/failure-visibility.md`). The entity alias table read for
 * the spelling path (`getEntityAliasTableOrThrow`) keeps its own status here,
 * so "the table failed to load" (FR-19) is distinct from "the project has no
 * entities". This is separate from `entityAliasTableSlice`, whose read
 * degrades to the empty table by design.
 */
import {
  createAsyncThunk,
  createSlice,
  type ThunkDispatch,
  type UnknownAction,
} from "@reduxjs/toolkit";
import {
  getSpellingLists,
  type SpellingLists,
} from "../lib/api/project-spelling";
import { getEntityAliasTableOrThrow } from "../lib/api/entity-alias-table";
import type { EntityAliasTable } from "../lib/models/entity-alias-table";
import { isStaleSpellingResponse } from "./spelling-guards";
import {
  postSpellingMutation,
  resolveSpellingRequestContext,
  type SpellingMutation,
} from "./spelling-transport-service";

/** Load state of a spelling input. */
export type SpellingLoadStatus = "not-loaded" | "loaded" | "failed";

/** State held by this slice. */
export interface SpellingState {
  /** Directory basename of the project the lists belong to. */
  projectId: string | null;
  /** Project most recently requested; used to drop stale responses. */
  requestedProjectId: string | null;
  /** Status of the two lists. */
  status: SpellingLoadStatus;
  /** Meaningful only when `status` is `loaded`. */
  lists: SpellingLists;
  /** Reason the lists failed to load; empty string otherwise. */
  errorMessage: string;
  /** Status of the alias-table read for the spelling path. */
  aliasTableStatus: SpellingLoadStatus;
  /** The table when `aliasTableStatus` is `loaded`; `null` otherwise. */
  aliasTable: EntityAliasTable | null;
  /** Reason the alias table failed to load; empty string otherwise. */
  aliasTableErrorMessage: string;
}

const EMPTY_LISTS: SpellingLists = {
  spellingProjectWords: [],
  spellingIgnoredWords: [],
};

const initialState: SpellingState = {
  projectId: null,
  requestedProjectId: null,
  status: "not-loaded",
  lists: EMPTY_LISTS,
  errorMessage: "",
  aliasTableStatus: "not-loaded",
  aliasTable: null,
  aliasTableErrorMessage: "",
};

/** Loads both lists for `projectId`. Rejects on any failure. */
export const fetchSpellingLists = createAsyncThunk<
  { projectId: string; lists: SpellingLists },
  string
>("spelling/fetchLists", async (projectId) => ({
  projectId,
  lists: await getSpellingLists(projectId),
}));

/** Loads the alias table for the spelling path. Rejects on any failure. */
export const fetchSpellingAliasTable = createAsyncThunk<
  { projectId: string; table: EntityAliasTable },
  string
>("spelling/fetchAliasTable", async (projectId) => ({
  projectId,
  table: await getEntityAliasTableOrThrow(projectId),
}));

/**
 * Loads everything the checker needs for `projectId` (both lists and the
 * alias table) and settles when both reads have settled. Never rejects; the
 * outcome of each read is in state.
 */
export const fetchSpellingState = createAsyncThunk<
  void,
  string,
  { dispatch: ThunkDispatch<unknown, unknown, UnknownAction> }
>("spelling/fetchState", async (projectId, thunkApi) => {
  await Promise.all([
    thunkApi.dispatch(fetchSpellingLists(projectId)),
    thunkApi.dispatch(fetchSpellingAliasTable(projectId)),
  ]);
});

function createMutationThunk(type: string, mutation: SpellingMutation) {
  return createAsyncThunk<
    { projectId: string; lists: SpellingLists },
    string,
    { state: { spelling: SpellingState } }
  >(type, async (word, thunkApi) => {
    const context = resolveSpellingRequestContext(thunkApi.getState());
    if ("error" in context) throw new Error(context.error);
    const lists = await postSpellingMutation(mutation, context.projectId, word);
    return { projectId: context.projectId, lists };
  });
}

/** Adds `word` to the project dictionary. */
export const addProjectWord = createMutationThunk(
  "spelling/addProjectWord",
  "add-word",
);
/** Removes `word` from the project dictionary. */
export const removeProjectWord = createMutationThunk(
  "spelling/removeProjectWord",
  "remove-word",
);
/** Adds `word` to the ignore list. */
export const ignoreWord = createMutationThunk(
  "spelling/ignoreWord",
  "ignore-word",
);
/** Removes `word` from the ignore list. */
export const unignoreWord = createMutationThunk(
  "spelling/unignoreWord",
  "unignore-word",
);

/** Points the slice at `projectId`, clearing data that belongs to another. */
function requestProject(state: SpellingState, projectId: string): void {
  state.requestedProjectId = projectId;
  if (state.projectId !== projectId) {
    Object.assign(state, { ...initialState, requestedProjectId: projectId });
  }
}

const spellingSlice = createSlice({
  name: "spelling",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSpellingLists.pending, (state, action) => {
        requestProject(state, action.meta.arg);
      })
      .addCase(fetchSpellingLists.fulfilled, (state, action) => {
        const { projectId, lists } = action.payload;
        if (isStaleSpellingResponse(state.requestedProjectId, projectId))
          return;
        state.projectId = projectId;
        state.status = "loaded";
        state.lists = lists;
        state.errorMessage = "";
      })
      .addCase(fetchSpellingLists.rejected, (state, action) => {
        if (isStaleSpellingResponse(state.requestedProjectId, action.meta.arg))
          return;
        state.projectId = action.meta.arg;
        state.status = "failed";
        state.lists = EMPTY_LISTS;
        state.errorMessage =
          action.error.message ?? "Failed to load spelling lists.";
      })
      .addCase(fetchSpellingAliasTable.pending, (state, action) => {
        requestProject(state, action.meta.arg);
      })
      .addCase(fetchSpellingAliasTable.fulfilled, (state, action) => {
        const { projectId, table } = action.payload;
        if (isStaleSpellingResponse(state.requestedProjectId, projectId))
          return;
        state.projectId = projectId;
        state.aliasTableStatus = "loaded";
        state.aliasTable = table;
        state.aliasTableErrorMessage = "";
      })
      .addCase(fetchSpellingAliasTable.rejected, (state, action) => {
        if (isStaleSpellingResponse(state.requestedProjectId, action.meta.arg))
          return;
        state.projectId = action.meta.arg;
        state.aliasTableStatus = "failed";
        state.aliasTable = null;
        state.aliasTableErrorMessage =
          action.error.message ?? "Failed to load the entity alias table.";
      });
    for (const thunk of [
      addProjectWord,
      removeProjectWord,
      ignoreWord,
      unignoreWord,
    ]) {
      builder.addCase(thunk.fulfilled, (state, action) => {
        const { projectId, lists } = action.payload;
        if (
          state.projectId !== projectId ||
          isStaleSpellingResponse(state.requestedProjectId, projectId)
        )
          return;
        state.lists = lists;
      });
    }
  },
});

export default spellingSlice.reducer;

type SpellingRoot = { spelling: SpellingState };

/** Status of the two lists. */
export const selectSpellingStatus = (state: SpellingRoot): SpellingLoadStatus =>
  state.spelling.status;

/** Both lists (empty arrays unless the status is `loaded`). */
export const selectSpellingLists = (state: SpellingRoot): SpellingLists =>
  state.spelling.lists;

/** Status of the spelling path's alias-table read. */
export const selectSpellingAliasTableStatus = (
  state: SpellingRoot,
): SpellingLoadStatus => state.spelling.aliasTableStatus;

/** The alias table, or `null` unless its status is `loaded`. */
export const selectSpellingAliasTable = (
  state: SpellingRoot,
): EntityAliasTable | null => state.spelling.aliasTable;
