import { describe, it, expect, vi, beforeEach } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — renderHook exists at runtime but TS can't resolve it due to react-dom/test-utils having no types in React 19
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import queriesReducer from "../../src/store/querySlice";
import type { GoalFilteredTotalResult } from "../../src/lib/api/goal-filtered-total";

const getGoalFilteredTotal = vi.fn();

vi.mock("../../src/lib/api/goal-filtered-total", () => ({
  getGoalFilteredTotal: (...args: unknown[]) => getGoalFilteredTotal(...args),
}));

import { useFilteredGoalTotal } from "../../src/hooks/useFilteredGoalTotal";
import { notifyWritingLogGoalChanged } from "../../src/lib/writing-log-signal";

function makeStore() {
  return configureStore({ reducer: { queries: queriesReducer } });
}

function makeWrapper(store: ReturnType<typeof makeStore>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

function render(isFilterSet: boolean, store = makeStore()) {
  return renderHook(() => useFilteredGoalTotal("p1", isFilterSet), {
    wrapper: makeWrapper(store),
  });
}

const resolveWith = (r: GoalFilteredTotalResult): void => {
  getGoalFilteredTotal.mockResolvedValue(r);
};

describe("useFilteredGoalTotal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("makes no request and reports not-filtered with no filter", async () => {
    const { result } = render(false);
    expect(result.current.state.status).toBe("not-filtered");
    expect(result.current.isFiltered).toBe(false);
    await act(async () => {});
    expect(getGoalFilteredTotal).not.toHaveBeenCalled();
  });

  it("is loading, then total", async () => {
    resolveWith({ status: "total", total: 420 });
    const { result } = render(true);
    expect(result.current.state.status).toBe("loading");
    expect(result.current.isLoading).toBe(true);
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "total", total: 420 }),
    );
    expect(getGoalFilteredTotal).toHaveBeenCalledWith("p1");
  });

  it("reports no-match with total 0", async () => {
    resolveWith({ status: "no-match", total: 0 });
    const { result } = render(true);
    await waitFor(() => expect(result.current.isNoMatch).toBe(true));
    expect(result.current.state).toEqual({ status: "no-match", total: 0 });
  });

  it("passes an unavailable result through with no total", async () => {
    resolveWith({
      status: "unavailable",
      reason: "read-failed",
      cause: "corrupt",
    });
    const { result } = render(true);
    await waitFor(() => expect(result.current.isUnavailable).toBe(true));
    expect("total" in result.current.state).toBe(false);
  });

  it("maps a rejected request to unavailable, never a number", async () => {
    getGoalFilteredTotal.mockRejectedValue(new Error("boom"));
    const { result } = render(true);
    await waitFor(() => expect(result.current.isUnavailable).toBe(true));
    expect("total" in result.current.state).toBe(false);
  });

  it("re-reads on the goal-change signal", async () => {
    getGoalFilteredTotal.mockResolvedValueOnce({ status: "total", total: 1 });
    getGoalFilteredTotal.mockResolvedValueOnce({ status: "total", total: 2 });
    const { result } = render(true);
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "total", total: 1 }),
    );
    act(() => notifyWritingLogGoalChanged());
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "total", total: 2 }),
    );
    expect(getGoalFilteredTotal).toHaveBeenCalledTimes(2);
  });

  it("re-reads when the filter is cleared then set again", async () => {
    resolveWith({ status: "total", total: 5 });
    const { result, rerender } = renderHook(
      ({ isSet }: { isSet: boolean }) => useFilteredGoalTotal("p1", isSet),
      { wrapper: makeWrapper(makeStore()), initialProps: { isSet: true } },
    );
    await waitFor(() => expect(result.current.state.status).toBe("total"));
    rerender({ isSet: false });
    expect(result.current.state.status).toBe("not-filtered");
    rerender({ isSet: true });
    await waitFor(() => expect(getGoalFilteredTotal).toHaveBeenCalledTimes(2));
  });

  it("ignores a stale response after the signal fires again", async () => {
    let resolveFirst: (r: GoalFilteredTotalResult) => void = () => {};
    getGoalFilteredTotal.mockImplementationOnce(
      () =>
        new Promise<GoalFilteredTotalResult>((res) => {
          resolveFirst = res;
        }),
    );
    getGoalFilteredTotal.mockResolvedValueOnce({ status: "total", total: 2 });
    const { result } = render(true);
    act(() => notifyWritingLogGoalChanged());
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "total", total: 2 }),
    );
    await act(async () => resolveFirst({ status: "total", total: 1 }));
    expect(result.current.state).toEqual({ status: "total", total: 2 });
  });

  it("leaves querySlice unchanged after a read", async () => {
    resolveWith({ status: "total", total: 9 });
    const store = makeStore();
    const before = store.getState().queries;
    const { result } = render(true, store);
    await waitFor(() => expect(result.current.state.status).toBe("total"));
    const after = store.getState().queries;
    expect(after.activeQueryDefinition).toBe(before.activeQueryDefinition);
    expect(after.activeQueryIds).toBe(before.activeQueryIds);
    expect(after).toBe(before);
  });
});
