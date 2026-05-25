import { afterEach, describe, expect, it, vi } from "vitest";
import projectsReducer, {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import queryReducer, {
  clearQueries,
  deleteQuery,
  evaluateQuery,
  loadSavedQueries,
  saveQuery,
  selectActiveQueryDefinition,
  selectActiveQueryIds,
  selectDeletingQueryId,
  selectIsEvaluating,
  selectIsLoadingQueries,
  selectQueryErrorMessage,
  selectSavedQueries,
  selectSavedQueriesList,
  selectSavingQueryId,
  type QueryState,
  type SavedQuery,
} from "../../src/store/querySlice";
import type { QueryAST } from "../../src/lib/models/query-ast";
import { makeStore } from "../../src/store/store";
import type { RootState } from "../../src/store/store";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Explicit QueryAST types so .definition isn't widened to `unknown` (Zod v4
// types the SavedQuery.definition field as unknown via ZodTypeAny).
const DEF_A: QueryAST = { op: "exists", field: "type" };
const DEF_B: QueryAST = { op: "eq", field: "status", value: "draft" };

const QUERY_A = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  name: "Alpha query",
  definition: DEF_A,
};

const QUERY_B = {
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  name: "Beta query",
  definition: DEF_B,
};

function makeInitialQueryState(overrides?: Partial<QueryState>): QueryState {
  return {
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
    ...overrides,
  };
}

// ─── Store helpers ────────────────────────────────────────────────────────────

function seedProject(store: ReturnType<typeof makeStore>) {
  store.dispatch(
    setProject({
      id: "project-1",
      name: "Test Project",
      rootPath: "/tmp/project-1",
    }),
  );
  store.dispatch(setSelectedProjectId("project-1"));
}

function mockFetchSuccess(body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

function mockFetchError(status: number, error: string) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error, details: error }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Reducer: initial state ───────────────────────────────────────────────────

describe("querySlice — initial state", () => {
  it("initialises with empty, idle state", () => {
    const state = queryReducer(undefined, { type: "@@INIT" });
    expect(state.projectId).toBeNull();
    expect(state.savedQueries).toEqual({});
    expect(state.isLoadingQueries).toBe(false);
    expect(state.isEvaluating).toBe(false);
    expect(state.activeQueryIds).toEqual([]);
    expect(state.errorMessage).toBe("");
  });
});

// ─── Reducer: clearQueries ────────────────────────────────────────────────────

describe("querySlice — clearQueries", () => {
  it("resets all state to initial values", () => {
    const loaded = makeInitialQueryState({
      projectId: "project-1",
      savedQueries: { [QUERY_A.id]: QUERY_A as unknown as SavedQuery },
      activeQueryIds: ["r1", "r2"],
      activeQueryDefinition: DEF_A,
      isLoadingQueries: true,
      isEvaluating: true,
      errorMessage: "some error",
    });
    const state = queryReducer(loaded, clearQueries());
    expect(state).toEqual(makeInitialQueryState());
  });
});

// ─── Reducer: project change subscription ────────────────────────────────────

describe("querySlice — setSelectedProjectId subscription", () => {
  it("resets state when a different project is selected", () => {
    const loaded = makeInitialQueryState({
      projectId: "project-1",
      savedQueries: { [QUERY_A.id]: QUERY_A as unknown as SavedQuery },
    });
    const state = queryReducer(loaded, setSelectedProjectId("project-2"));
    expect(state.projectId).toBeNull();
    expect(state.savedQueries).toEqual({});
  });

  it("is a no-op when the same project is re-selected", () => {
    const loaded = makeInitialQueryState({
      projectId: "project-1",
      savedQueries: { [QUERY_A.id]: QUERY_A as unknown as SavedQuery },
    });
    const state = queryReducer(loaded, setSelectedProjectId("project-1"));
    expect(state.savedQueries).toEqual({ [QUERY_A.id]: QUERY_A });
  });
});

// ─── Reducer: loadSavedQueries ────────────────────────────────────────────────

describe("querySlice — loadSavedQueries reducer", () => {
  it("pending sets isLoadingQueries and requestedProjectId", () => {
    const state = queryReducer(
      makeInitialQueryState(),
      loadSavedQueries.pending("req-1", { projectId: "project-1" }),
    );
    expect(state.isLoadingQueries).toBe(true);
    expect(state.requestedProjectId).toBe("project-1");
    expect(state.errorMessage).toBe("");
  });

  it("fulfilled populates savedQueries and clears loading", () => {
    const pending = makeInitialQueryState({
      requestedProjectId: "project-1",
      isLoadingQueries: true,
    });
    const savedQueries = {
      [QUERY_A.id]: QUERY_A as unknown as SavedQuery,
      [QUERY_B.id]: QUERY_B as unknown as SavedQuery,
    };
    const state = queryReducer(
      pending,
      loadSavedQueries.fulfilled(
        { projectId: "project-1", savedQueries },
        "req-1",
        { projectId: "project-1" },
      ),
    );
    expect(state.projectId).toBe("project-1");
    expect(state.requestedProjectId).toBeNull();
    expect(state.isLoadingQueries).toBe(false);
    expect(state.savedQueries).toEqual(savedQueries);
  });

  it("fulfilled is discarded when requestedProjectId has changed (stale response)", () => {
    const pending = makeInitialQueryState({
      requestedProjectId: "project-2",
      isLoadingQueries: true,
    });
    const state = queryReducer(
      pending,
      loadSavedQueries.fulfilled(
        {
          projectId: "project-1",
          savedQueries: { [QUERY_A.id]: QUERY_A as unknown as SavedQuery },
        },
        "req-1",
        { projectId: "project-1" },
      ),
    );
    expect(state.requestedProjectId).toBe("project-2");
    expect(state.savedQueries).toEqual({});
  });

  it("rejected sets errorMessage and clears loading", () => {
    const pending = makeInitialQueryState({
      requestedProjectId: "project-1",
      isLoadingQueries: true,
    });
    const state = queryReducer(
      pending,
      loadSavedQueries.rejected(
        new Error("fail"),
        "req-1",
        { projectId: "project-1" },
        "Unable to load saved queries.",
      ),
    );
    expect(state.isLoadingQueries).toBe(false);
    expect(state.requestedProjectId).toBeNull();
    expect(state.errorMessage).toBe("Unable to load saved queries.");
  });

  it("rejected is discarded when requestedProjectId has changed (stale)", () => {
    const pending = makeInitialQueryState({
      requestedProjectId: "project-2",
      isLoadingQueries: true,
    });
    const state = queryReducer(
      pending,
      loadSavedQueries.rejected(
        new Error("fail"),
        "req-1",
        { projectId: "project-1" },
        "error",
      ),
    );
    expect(state.isLoadingQueries).toBe(true);
    expect(state.requestedProjectId).toBe("project-2");
    expect(state.errorMessage).toBe("");
  });
});

// ─── Reducer: saveQuery ───────────────────────────────────────────────────────

describe("querySlice — saveQuery reducer", () => {
  const qa = QUERY_A as unknown as SavedQuery;

  it("pending sets savingQueryId", () => {
    const state = queryReducer(
      makeInitialQueryState(),
      saveQuery.pending("req-1", { projectId: "project-1", query: qa }),
    );
    expect(state.savingQueryId).toBe(QUERY_A.id);
    expect(state.errorMessage).toBe("");
  });

  it("fulfilled upserts query in savedQueries and clears savingQueryId", () => {
    const pending = makeInitialQueryState({
      projectId: "project-1",
      savingQueryId: QUERY_A.id,
    });
    const state = queryReducer(
      pending,
      saveQuery.fulfilled({ projectId: "project-1", query: qa }, "req-1", {
        projectId: "project-1",
        query: qa,
      }),
    );
    expect(state.savedQueries[QUERY_A.id]).toEqual(QUERY_A);
    expect(state.savingQueryId).toBeNull();
  });

  it("fulfilled is discarded when a different project is loaded", () => {
    const pending = makeInitialQueryState({
      projectId: "project-2",
      savingQueryId: QUERY_A.id,
    });
    const state = queryReducer(
      pending,
      saveQuery.fulfilled({ projectId: "project-1", query: qa }, "req-1", {
        projectId: "project-1",
        query: qa,
      }),
    );
    expect(state.savedQueries).toEqual({});
    expect(state.savingQueryId).toBe(QUERY_A.id);
  });

  it("rejected clears savingQueryId and sets errorMessage", () => {
    const pending = makeInitialQueryState({ savingQueryId: QUERY_A.id });
    const state = queryReducer(
      pending,
      saveQuery.rejected(
        new Error("fail"),
        "req-1",
        { projectId: "project-1", query: qa },
        "Failed to save query.",
      ),
    );
    expect(state.savingQueryId).toBeNull();
    expect(state.errorMessage).toBe("Failed to save query.");
  });
});

// ─── Reducer: deleteQuery ─────────────────────────────────────────────────────

describe("querySlice — deleteQuery reducer", () => {
  it("pending sets deletingQueryId", () => {
    const state = queryReducer(
      makeInitialQueryState(),
      deleteQuery.pending("req-1", {
        projectId: "project-1",
        queryId: QUERY_A.id,
      }),
    );
    expect(state.deletingQueryId).toBe(QUERY_A.id);
    expect(state.errorMessage).toBe("");
  });

  it("fulfilled removes query from savedQueries and clears deletingQueryId", () => {
    const pending = makeInitialQueryState({
      projectId: "project-1",
      savedQueries: {
        [QUERY_A.id]: QUERY_A as unknown as SavedQuery,
        [QUERY_B.id]: QUERY_B as unknown as SavedQuery,
      },
      deletingQueryId: QUERY_A.id,
    });
    const state = queryReducer(
      pending,
      deleteQuery.fulfilled(
        { projectId: "project-1", queryId: QUERY_A.id },
        "req-1",
        { projectId: "project-1", queryId: QUERY_A.id },
      ),
    );
    expect(state.savedQueries[QUERY_A.id]).toBeUndefined();
    expect(state.savedQueries[QUERY_B.id]).toEqual(QUERY_B);
    expect(state.deletingQueryId).toBeNull();
  });

  it("fulfilled is discarded when a different query is being deleted", () => {
    const pending = makeInitialQueryState({
      projectId: "project-1",
      savedQueries: { [QUERY_A.id]: QUERY_A as unknown as SavedQuery },
      deletingQueryId: QUERY_B.id,
    });
    const state = queryReducer(
      pending,
      deleteQuery.fulfilled(
        { projectId: "project-1", queryId: QUERY_A.id },
        "req-1",
        { projectId: "project-1", queryId: QUERY_A.id },
      ),
    );
    expect(state.savedQueries[QUERY_A.id]).toEqual(QUERY_A);
    expect(state.deletingQueryId).toBe(QUERY_B.id);
  });

  it("rejected clears deletingQueryId and sets errorMessage", () => {
    const pending = makeInitialQueryState({ deletingQueryId: QUERY_A.id });
    const state = queryReducer(
      pending,
      deleteQuery.rejected(
        new Error("fail"),
        "req-1",
        { projectId: "project-1", queryId: QUERY_A.id },
        "Failed to delete query.",
      ),
    );
    expect(state.deletingQueryId).toBeNull();
    expect(state.errorMessage).toBe("Failed to delete query.");
  });

  it("rejected is discarded when a different query is being deleted", () => {
    const pending = makeInitialQueryState({ deletingQueryId: QUERY_B.id });
    const state = queryReducer(
      pending,
      deleteQuery.rejected(
        new Error("fail"),
        "req-1",
        { projectId: "project-1", queryId: QUERY_A.id },
        "error",
      ),
    );
    expect(state.deletingQueryId).toBe(QUERY_B.id);
    expect(state.errorMessage).toBe("");
  });
});

// ─── Reducer: evaluateQuery ───────────────────────────────────────────────────

describe("querySlice — evaluateQuery reducer", () => {
  it("pending sets isEvaluating and evaluatingForProjectId", () => {
    const state = queryReducer(
      makeInitialQueryState(),
      evaluateQuery.pending("req-1", {
        projectId: "project-1",
        definition: DEF_A,
      }),
    );
    expect(state.isEvaluating).toBe(true);
    expect(state.evaluatingForProjectId).toBe("project-1");
    expect(state.errorMessage).toBe("");
  });

  it("fulfilled sets activeQueryDefinition and activeQueryIds", () => {
    const pending = makeInitialQueryState({
      isEvaluating: true,
      evaluatingForProjectId: "project-1",
    });
    const state = queryReducer(
      pending,
      evaluateQuery.fulfilled(
        { projectId: "project-1", definition: DEF_A, ids: ["r1", "r2"] },
        "req-1",
        { projectId: "project-1", definition: DEF_A },
      ),
    );
    expect(state.isEvaluating).toBe(false);
    expect(state.evaluatingForProjectId).toBeNull();
    expect(state.activeQueryDefinition).toEqual(DEF_A);
    expect(state.activeQueryIds).toEqual(["r1", "r2"]);
  });

  it("fulfilled is discarded when project changed during evaluation (stale)", () => {
    const pending = makeInitialQueryState({
      isEvaluating: true,
      evaluatingForProjectId: "project-2",
    });
    const state = queryReducer(
      pending,
      evaluateQuery.fulfilled(
        { projectId: "project-1", definition: DEF_A, ids: ["r1"] },
        "req-1",
        { projectId: "project-1", definition: DEF_A },
      ),
    );
    expect(state.isEvaluating).toBe(true);
    expect(state.evaluatingForProjectId).toBe("project-2");
    expect(state.activeQueryIds).toEqual([]);
  });

  it("rejected clears isEvaluating and sets errorMessage", () => {
    const pending = makeInitialQueryState({
      isEvaluating: true,
      evaluatingForProjectId: "project-1",
    });
    const state = queryReducer(
      pending,
      evaluateQuery.rejected(
        new Error("fail"),
        "req-1",
        { projectId: "project-1", definition: DEF_A },
        "Query evaluation failed.",
      ),
    );
    expect(state.isEvaluating).toBe(false);
    expect(state.evaluatingForProjectId).toBeNull();
    expect(state.errorMessage).toBe("Query evaluation failed.");
  });

  it("rejected is discarded when project changed during evaluation (stale)", () => {
    const pending = makeInitialQueryState({
      isEvaluating: true,
      evaluatingForProjectId: "project-2",
    });
    const state = queryReducer(
      pending,
      evaluateQuery.rejected(
        new Error("fail"),
        "req-1",
        { projectId: "project-1", definition: DEF_A },
        "error",
      ),
    );
    expect(state.isEvaluating).toBe(true);
    expect(state.evaluatingForProjectId).toBe("project-2");
    expect(state.errorMessage).toBe("");
  });
});

// ─── Selectors ────────────────────────────────────────────────────────────────

function createRootState(overrides?: {
  queries?: Partial<QueryState>;
  selectedProjectId?: string | null;
}): RootState {
  return {
    projects: {
      selectedProjectId: overrides?.selectedProjectId ?? "project-1",
      projects: {
        "project-1": {
          id: "project-1",
          name: "Test Project",
          rootPath: "/tmp/project-1",
          folders: [],
          resources: [],
        },
      },
    },
    resources: { selectedResourceId: null, resources: [], folders: [] },
    revisions: {
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
    },
    editorConfig: { headings: {} },
    search: {
      requestedProjectId: null,
      requestedQuery: "",
      results: [],
      isLoading: false,
      errorMessage: "",
    },
    queries: makeInitialQueryState({
      projectId: "project-1",
      savedQueries: {
        [QUERY_A.id]: QUERY_A as unknown as SavedQuery,
        [QUERY_B.id]: QUERY_B as unknown as SavedQuery,
      },
      activeQueryDefinition: DEF_A,
      activeQueryIds: ["r1", "r2"],
      isLoadingQueries: false,
      isEvaluating: true,
      savingQueryId: QUERY_A.id,
      deletingQueryId: QUERY_B.id,
      errorMessage: "test-error",
      ...overrides?.queries,
    }),
  } as unknown as RootState;
}

describe("querySlice — selectors", () => {
  it("selectSavedQueries returns the dict when projectId matches", () => {
    const state = createRootState();
    const queries = selectSavedQueries(state);
    expect(queries[QUERY_A.id]).toEqual(QUERY_A);
    expect(queries[QUERY_B.id]).toEqual(QUERY_B);
  });

  it("selectSavedQueries returns empty dict when projectId mismatches", () => {
    const state = createRootState({ selectedProjectId: "project-99" });
    expect(selectSavedQueries(state)).toEqual({});
  });

  it("selectSavedQueriesList returns queries sorted by name", () => {
    const state = createRootState();
    const list = selectSavedQueriesList(state);
    expect(list.map((q) => q.name)).toEqual(["Alpha query", "Beta query"]);
  });

  it("selectSavedQueriesList is memoised — same reference on repeated calls", () => {
    const state = createRootState();
    expect(selectSavedQueriesList(state)).toBe(selectSavedQueriesList(state));
  });

  it("exposes status flags through stable selectors", () => {
    const state = createRootState();
    expect(selectIsLoadingQueries(state)).toBe(false);
    expect(selectIsEvaluating(state)).toBe(true);
    expect(selectActiveQueryDefinition(state)).toEqual(DEF_A);
    expect(selectActiveQueryIds(state)).toEqual(["r1", "r2"]);
    expect(selectSavingQueryId(state)).toBe(QUERY_A.id);
    expect(selectDeletingQueryId(state)).toBe(QUERY_B.id);
    expect(selectQueryErrorMessage(state)).toBe("test-error");
  });
});

// ─── Integration: thunk dispatch against a live store ────────────────────────

describe("querySlice — thunk integration", () => {
  const qa = QUERY_A as unknown as SavedQuery;

  it("loadSavedQueries — success path populates savedQueries in store", async () => {
    const store = makeStore();
    seedProject(store);

    mockFetchSuccess({ queries: [QUERY_A, QUERY_B] });

    await store.dispatch(loadSavedQueries({ projectId: "project-1" }));

    const state = store.getState().queries;
    expect(state.isLoadingQueries).toBe(false);
    expect(state.savedQueries[QUERY_A.id]).toEqual(QUERY_A);
    expect(state.savedQueries[QUERY_B.id]).toEqual(QUERY_B);
    expect(state.errorMessage).toBe("");
  });

  it("loadSavedQueries — API error stores errorMessage", async () => {
    const store = makeStore();
    seedProject(store);

    mockFetchError(500, "Disk read failed");

    await store.dispatch(loadSavedQueries({ projectId: "project-1" }));

    const state = store.getState().queries;
    expect(state.isLoadingQueries).toBe(false);
    expect(state.errorMessage).toBe("Disk read failed");
  });

  it("loadSavedQueries — rejected when no project selected", async () => {
    const store = makeStore();
    // no seedProject — selectedProjectId is null

    await store.dispatch(loadSavedQueries({ projectId: "project-1" }));

    const state = store.getState().queries;
    expect(state.errorMessage).toBe("No project selected.");
  });

  it("saveQuery — success path upserts query in store", async () => {
    const store = makeStore();
    seedProject(store);

    mockFetchSuccess({ query: qa });

    await store.dispatch(saveQuery({ projectId: "project-1", query: qa }));

    const state = store.getState().queries;
    expect(state.savingQueryId).toBeNull();
    expect(state.savedQueries[QUERY_A.id]).toEqual(QUERY_A);
  });

  it("deleteQuery — success path removes query from store", async () => {
    const store = makeStore();
    seedProject(store);

    mockFetchSuccess({ queries: [QUERY_A] });
    await store.dispatch(loadSavedQueries({ projectId: "project-1" }));

    mockFetchSuccess({ deleted: true });
    await store.dispatch(
      deleteQuery({ projectId: "project-1", queryId: QUERY_A.id }),
    );

    const state = store.getState().queries;
    expect(state.deletingQueryId).toBeNull();
    expect(state.savedQueries[QUERY_A.id]).toBeUndefined();
  });

  it("evaluateQuery — success path stores activeQueryIds", async () => {
    const store = makeStore();
    seedProject(store);

    mockFetchSuccess({ ids: ["r1", "r2", "r3"] });

    await store.dispatch(
      evaluateQuery({ projectId: "project-1", definition: DEF_A }),
    );

    const state = store.getState().queries;
    expect(state.isEvaluating).toBe(false);
    expect(state.activeQueryIds).toEqual(["r1", "r2", "r3"]);
    expect(state.activeQueryDefinition).toEqual(DEF_A);
  });

  it("evaluateQuery — API error stores errorMessage", async () => {
    const store = makeStore();
    seedProject(store);

    mockFetchError(400, "Query evaluation failed");

    await store.dispatch(
      evaluateQuery({ projectId: "project-1", definition: DEF_A }),
    );

    const state = store.getState().queries;
    expect(state.isEvaluating).toBe(false);
    expect(state.errorMessage).toBe("Query evaluation failed");
  });
});
