import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { loadSavedQueries, clearQueries } from "../src/store/querySlice";
import type { SavedQuery } from "../src/lib/models/saved-queries";
import { useOrganizerSmartFolderCards } from "../components/WorkArea/Views/OrganizerView/useOrganizerSmartFolderCards";

vi.mock("../src/store/query-transport-service", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/store/query-transport-service")
    >();
  return { ...actual, evaluateQueryAst: vi.fn(), fetchSavedQueryList: vi.fn() };
});
import {
  evaluateQueryAst,
  fetchSavedQueryList,
} from "../src/store/query-transport-service";

const INTERNAL_ID = "11111111-1111-4111-8111-111111111111";
const DIRECTORY_ID = "22222222-2222-4222-8222-222222222222";
const QUERY_ID = "33333333-3333-4333-8333-333333333333";

const evaluate = vi.mocked(evaluateQueryAst);
const fetchList = vi.mocked(fetchSavedQueryList);

type Store = ReturnType<typeof makeStore>;

function savedQuery(id: string, name = "Q"): SavedQuery {
  return {
    id,
    name,
    definition: { op: "eq", field: "status", value: "draft" },
  } as SavedQuery;
}

function makeReadyStore(): Store {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: INTERNAL_ID,
      name: "P",
      rootPath: `/test/workspace/${DIRECTORY_ID}`,
      folders: [],
      resources: [],
    }),
  );
  store.dispatch(setSelectedProjectId(INTERNAL_ID));
  return store;
}

async function loadList(store: Store, queries: SavedQuery[]): Promise<void> {
  fetchList.mockResolvedValueOnce({ queries });
  await store.dispatch(loadSavedQueries({ projectId: INTERNAL_ID }));
}

function wrapperFor(store: Store) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

function setup(store: Store, queryId: string | null) {
  return renderHook(() => useOrganizerSmartFolderCards(queryId), {
    wrapper: wrapperFor(store),
  });
}

beforeEach(() => {
  evaluate.mockReset();
  fetchList.mockReset();
});

describe("useOrganizerSmartFolderCards", () => {
  it("is idle with no query id and never calls the transport", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID)]);
    const { result } = setup(store, null);
    expect(result.current.state.status).toBe("idle");
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("says loading while the saved-query list has not loaded, and does not report deleted", async () => {
    const store = makeReadyStore();
    // Before any load: isLoadingQueries false, projectId null.
    const { result } = setup(store, QUERY_ID);
    expect(result.current.state.status).toBe("loading");

    // While the load is pending.
    let resolveList: (v: { queries: SavedQuery[] }) => void = () => undefined;
    fetchList.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = store.dispatch(loadSavedQueries({ projectId: INTERNAL_ID }));
    });
    expect(result.current.state.status).toBe("loading");
    expect(evaluate).not.toHaveBeenCalled();

    evaluate.mockResolvedValueOnce({ ids: ["a"] });
    await act(async () => {
      resolveList({ queries: [savedQuery(QUERY_ID)] });
      await pending;
    });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
  });

  it("calls evaluateQueryAst with a ref node and the directory id, returning ready ids", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID)]);
    evaluate.mockResolvedValueOnce({ ids: ["r2", "r1"] });
    const { result } = setup(store, QUERY_ID);
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(evaluate).toHaveBeenCalledWith(
      { projectId: DIRECTORY_ID },
      { op: "ref", id: QUERY_ID },
    );
    expect(result.current.state).toEqual({
      status: "ready",
      ids: ["r2", "r1"],
    });
  });

  it("leaves activeQueryIds, activeQueryDefinition and isEvaluating unchanged", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID)]);
    const before = JSON.stringify(store.getState().queries);
    evaluate.mockResolvedValueOnce({ ids: ["a", "b"] });
    const { result } = setup(store, QUERY_ID);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(JSON.stringify(store.getState().queries)).toBe(before);
    expect(store.getState().queries.activeQueryIds).toEqual([]);
    expect(store.getState().queries.activeQueryDefinition).toBeNull();
    expect(store.getState().queries.isEvaluating).toBe(false);
  });

  it("reports failed with the message, never an empty list, and retry re-evaluates", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID)]);
    evaluate.mockRejectedValueOnce(new Error("boom"));
    const { result } = setup(store, QUERY_ID);
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    const failed = result.current.state;
    if (failed.status !== "failed") throw new Error("expected failed");
    expect(failed.message).toBe("boom");
    expect("ids" in failed).toBe(false);

    evaluate.mockResolvedValueOnce({ ids: ["x"] });
    act(() => failed.retry());
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "ready", ids: ["x"] }),
    );
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("uses a fallback message for a non-Error rejection", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID)]);
    evaluate.mockRejectedValueOnce("nope");
    const { result } = setup(store, QUERY_ID);
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.state).toMatchObject({
      message: "Unable to read the smart folder.",
    });
  });

  it("reports failed, not deleted or empty, when the saved-query list failed to load", async () => {
    const store = makeReadyStore();
    fetchList.mockRejectedValueOnce(new Error("list down"));
    await store.dispatch(loadSavedQueries({ projectId: INTERNAL_ID }));
    const { result } = setup(store, QUERY_ID);
    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.state).toMatchObject({ message: "list down" });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("reports deleted only after the list loaded and the id is absent, without evaluating", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery("44444444-4444-4444-8444-444444444444")]);
    const { result } = setup(store, QUERY_ID);
    expect(result.current.state.status).toBe("deleted");
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("re-evaluates after refresh()", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID)]);
    evaluate.mockResolvedValueOnce({ ids: ["a"] });
    const { result } = setup(store, QUERY_ID);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    evaluate.mockResolvedValueOnce({ ids: ["a", "b"] });
    act(() => result.current.refresh());
    expect(result.current.state.status).toBe("loading");
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: "ready",
        ids: ["a", "b"],
      }),
    );
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("re-evaluates when the saved-query list changes", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID)]);
    evaluate.mockResolvedValueOnce({ ids: ["a"] });
    const { result } = setup(store, QUERY_ID);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    evaluate.mockResolvedValueOnce({ ids: ["c"] });
    await act(async () => {
      await loadList(store, [savedQuery(QUERY_ID, "Renamed")]);
    });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "ready", ids: ["c"] }),
    );
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("turns to deleted when a reload drops the id", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID)]);
    evaluate.mockResolvedValueOnce({ ids: ["a"] });
    const { result } = setup(store, QUERY_ID);
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(async () => {
      await loadList(store, []);
    });
    await waitFor(() => expect(result.current.state.status).toBe("deleted"));
  });

  it("ignores a stale result when the query id changes mid-flight", async () => {
    const OTHER = "55555555-5555-4555-8555-555555555555";
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID), savedQuery(OTHER)]);
    let resolveFirst: (v: { ids: string[] }) => void = () => undefined;
    evaluate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    evaluate.mockResolvedValueOnce({ ids: ["other"] });
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useOrganizerSmartFolderCards(id),
      { wrapper: wrapperFor(store), initialProps: { id: QUERY_ID } },
    );
    rerender({ id: OTHER });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "ready", ids: ["other"] }),
    );
    await act(async () => {
      resolveFirst({ ids: ["stale"] });
    });
    expect(result.current.state).toEqual({ status: "ready", ids: ["other"] });
  });

  it("stays loading and does not evaluate when the loaded list is cleared", async () => {
    const store = makeReadyStore();
    await loadList(store, [savedQuery(QUERY_ID)]);
    store.dispatch(clearQueries());
    const { result } = setup(store, QUERY_ID);
    expect(result.current.state.status).toBe("loading");
    expect(evaluate).not.toHaveBeenCalled();
  });
});
