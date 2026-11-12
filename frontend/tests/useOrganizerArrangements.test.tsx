/** @vitest-environment jsdom */
/**
 * Feature 109, Task 32 (FR-14, FR-15, FR-16, FR-19): the arrangements hook.
 * The transport is mocked; Redux, the availability model and the preference
 * module are real.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import {
  selectActiveProjectOrganizerArrangements,
  setProject,
  setSelectedProjectId,
} from "../src/store/projectsSlice";
import { loadSavedQueries, clearQueries } from "../src/store/querySlice";
import type { SavedQuery } from "../src/lib/models/saved-queries";
import type {
  OrganizerArrangement,
  OrganizerAxis,
  OrganizerSource,
} from "../src/lib/models/organizer-grid-types";
import {
  organizerArrangementStorageKey,
  readLastOrganizerArrangementId,
  writeLastOrganizerArrangementId,
} from "../src/lib/organizer-arrangement-preference";
import {
  useOrganizerArrangements,
  type OrganizerPicks,
} from "../components/WorkArea/Views/OrganizerView/useOrganizerArrangements";

vi.mock("../src/lib/api/organizer-arrangements", () => ({
  addOrganizerArrangement: vi.fn(),
  renameOrganizerArrangement: vi.fn(),
  deleteOrganizerArrangement: vi.fn(),
}));
vi.mock("../src/store/query-transport-service", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/store/query-transport-service")
    >();
  return { ...actual, fetchSavedQueryList: vi.fn() };
});
import {
  addOrganizerArrangement,
  renameOrganizerArrangement,
  deleteOrganizerArrangement,
} from "../src/lib/api/organizer-arrangements";
import { fetchSavedQueryList } from "../src/store/query-transport-service";

const add = vi.mocked(addOrganizerArrangement);
const rename = vi.mocked(renameOrganizerArrangement);
const del = vi.mocked(deleteOrganizerArrangement);
const fetchList = vi.mocked(fetchSavedQueryList);

const INTERNAL_ID = "11111111-1111-4111-8111-111111111111";
const DIRECTORY_ID = "22222222-2222-4222-8222-222222222222";
const FOLDER_ID = "f-1";
const A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SMART_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const ARR_A: OrganizerArrangement = {
  id: A_ID,
  name: "By status",
  source: { kind: "folder", folderId: FOLDER_ID, scope: "children" },
  rows: { kind: "status" },
  columns: { kind: "subtype" },
};
const ARR_B: OrganizerArrangement = {
  id: B_ID,
  name: "Gone folder",
  source: { kind: "folder", folderId: "missing-folder", scope: "children" },
  rows: "none",
  columns: "order",
};
const ARR_SMART: OrganizerArrangement = {
  id: SMART_ID,
  name: "Smart",
  source: { kind: "smart-folder", queryId: "q1" },
  rows: "none",
  columns: "order",
};

const DEFAULT_PICKS: OrganizerPicks = {
  source: { kind: "folder", folderId: FOLDER_ID, scope: "children" },
  rows: "none",
  columns: "order",
};

type Store = ReturnType<typeof makeStore>;

function makeReadyStore(
  arrangements: OrganizerArrangement[] | undefined,
): Store {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: INTERNAL_ID,
      name: "P",
      rootPath: `/test/workspace/${DIRECTORY_ID}`,
      folders: [{ id: FOLDER_ID, name: "F" }] as never,
      resources: [],
      ...(arrangements ? { organizerArrangements: arrangements } : {}),
    }),
  );
  store.dispatch(setSelectedProjectId(INTERNAL_ID));
  return store;
}

async function loadQueries(
  store: Store,
  queries: SavedQuery[] = [],
): Promise<void> {
  fetchList.mockResolvedValueOnce({ queries });
  await store.dispatch(loadSavedQueries({ projectId: INTERNAL_ID }));
}

async function failQueries(store: Store): Promise<void> {
  fetchList.mockRejectedValueOnce(new Error("boom"));
  await store.dispatch(loadSavedQueries({ projectId: INTERNAL_ID }));
}

function setup(
  store: Store,
  current: OrganizerPicks = DEFAULT_PICKS,
  onApply = vi.fn(),
) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    (props: { current: OrganizerPicks }) =>
      useOrganizerArrangements({
        current: props.current,
        defaultPicks: DEFAULT_PICKS,
        onApply,
      }),
    { wrapper, initialProps: { current } },
  );
  return { ...hook, onApply };
}

function remember(id: string): void {
  window.localStorage.setItem(organizerArrangementStorageKey(DIRECTORY_ID), id);
}

function storedList(store: Store): OrganizerArrangement[] {
  return selectActiveProjectOrganizerArrangements(store.getState());
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("list", () => {
  it("comes from selectActiveProjectOrganizerArrangements", async () => {
    const store = makeReadyStore([ARR_A, ARR_B]);
    await loadQueries(store);
    const { result } = setup(store);
    expect(result.current.arrangements).toBe(storedList(store));
    expect(result.current.arrangements.map((a) => a.id)).toEqual([A_ID, B_ID]);
  });

  it("is empty and nothing is applied when none are saved", async () => {
    const store = makeReadyStore(undefined);
    await loadQueries(store);
    const { result } = setup(store);
    expect(result.current.arrangements).toEqual([]);
    expect(result.current.appliedId).toBeNull();
  });
});

describe("write operations", () => {
  it("save calls the transport with the current picks and updates the list only after success", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    let resolveAdd: (v: { ok: true; id: string }) => void = () => {};
    add.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAdd = resolve;
      }),
    );
    const picks: OrganizerPicks = {
      source: { kind: "folder", folderId: FOLDER_ID, scope: "descendants" },
      rows: { kind: "subtype" },
      columns: "order",
    };
    const { result } = setup(store, picks);
    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = result.current.save("  Mine  ");
    });
    expect(add).toHaveBeenCalledWith(DIRECTORY_ID, {
      name: "  Mine  ",
      ...picks,
    });
    expect(storedList(store)).toHaveLength(1);
    await act(async () => {
      resolveAdd({ ok: true, id: "new-id" });
      await outcome;
    });
    const list = storedList(store);
    expect(list).toHaveLength(2);
    expect(list[1]).toEqual({ id: "new-id", name: "Mine", ...picks });
    expect(result.current.appliedId).toBe("new-id");
    expect(readLastOrganizerArrangementId(DIRECTORY_ID)).toBe("new-id");
  });

  it("a refused save leaves the list and returns the message", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    add.mockResolvedValueOnce({
      ok: false,
      reason: "name-duplicate",
      message: "Name taken.",
    });
    const { result } = setup(store);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.save("By status");
    });
    expect(outcome).toEqual({ ok: false, message: "Name taken." });
    expect(storedList(store)).toEqual([ARR_A]);
    expect(result.current.error).toBe("Name taken.");
  });

  it("a request failure and a throwing transport are text, never success", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    add.mockResolvedValueOnce({
      ok: false,
      reason: "request-failed",
      message: "Could not save the arrangement: the request failed.",
    });
    rename.mockRejectedValueOnce(new Error("Project is locked."));
    const { result } = setup(store);
    let first: unknown;
    let second: unknown;
    await act(async () => {
      first = await result.current.save("X");
      second = await result.current.rename(A_ID, "Y");
    });
    expect(first).toMatchObject({ ok: false });
    expect(second).toEqual({ ok: false, message: "Project is locked." });
    expect(storedList(store)).toEqual([ARR_A]);
  });

  it("rename updates the name only after success", async () => {
    const store = makeReadyStore([ARR_A, ARR_B]);
    await loadQueries(store);
    rename.mockResolvedValueOnce({ ok: true, id: B_ID });
    const { result } = setup(store);
    await act(async () => {
      await result.current.rename(B_ID, " Renamed ");
    });
    expect(rename).toHaveBeenCalledWith(DIRECTORY_ID, {
      id: B_ID,
      name: " Renamed ",
    });
    const list = storedList(store);
    expect(list[1]).toEqual({ ...ARR_B, name: "Renamed" });
    expect(list[0]).toEqual(ARR_A);
  });

  it("delete removes the arrangement after success and resets the applied one", async () => {
    const store = makeReadyStore([ARR_A, ARR_B]);
    await loadQueries(store);
    del.mockResolvedValueOnce({ ok: true, id: A_ID });
    const { result } = setup(store);
    await act(async () => {
      result.current.apply(A_ID);
    });
    expect(result.current.appliedId).toBe(A_ID);
    await act(async () => {
      await result.current.remove(A_ID);
    });
    expect(del).toHaveBeenCalledWith(DIRECTORY_ID, { id: A_ID });
    expect(storedList(store).map((a) => a.id)).toEqual([B_ID]);
    expect(result.current.appliedId).toBeNull();
  });

  it("a failed delete keeps the arrangement", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    del.mockResolvedValueOnce({
      ok: false,
      reason: "not-found",
      message: "Already gone.",
    });
    const { result } = setup(store);
    await act(async () => {
      await result.current.remove(A_ID);
    });
    expect(storedList(store)).toEqual([ARR_A]);
    expect(result.current.error).toBe("Already gone.");
  });

  it("an unavailable arrangement stays renameable and deletable", async () => {
    const store = makeReadyStore([ARR_B]);
    await loadQueries(store);
    rename.mockResolvedValueOnce({ ok: true, id: B_ID });
    del.mockResolvedValueOnce({ ok: true, id: B_ID });
    const { result } = setup(store);
    await act(async () => {
      await result.current.rename(B_ID, "New");
      await result.current.remove(B_ID);
    });
    expect(rename).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(1);
    expect(storedList(store)).toEqual([]);
  });
});

describe("apply", () => {
  it("passes only source, rows and columns to onApply", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result, onApply } = setup(store);
    await act(async () => {
      result.current.apply(A_ID);
    });
    expect(onApply).toHaveBeenCalledTimes(1);
    const picks = onApply.mock.calls[0][0];
    expect(Object.keys(picks).sort()).toEqual(["columns", "rows", "source"]);
    expect(picks).toEqual({
      source: ARR_A.source,
      rows: ARR_A.rows,
      columns: ARR_A.columns,
    });
    expect(readLastOrganizerArrangementId(DIRECTORY_ID)).toBe(A_ID);
  });

  it("apply(null) applies the default picks", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result, onApply } = setup(store);
    await act(async () => {
      result.current.apply(A_ID);
    });
    await act(async () => {
      result.current.apply(null);
    });
    expect(onApply).toHaveBeenLastCalledWith(DEFAULT_PICKS);
    expect(result.current.appliedId).toBeNull();
  });

  it("apply(null) clears the remembered arrangement for this project", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result } = setup(store);
    await act(async () => {
      result.current.apply(A_ID);
    });
    expect(readLastOrganizerArrangementId(DIRECTORY_ID)).toBe(A_ID);
    await act(async () => {
      result.current.apply(null);
    });
    expect(readLastOrganizerArrangementId(DIRECTORY_ID)).toBeNull();
    expect(
      window.localStorage.getItem(organizerArrangementStorageKey(DIRECTORY_ID)),
    ).toBeNull();
  });

  it("reopening after Default shows the default, with no remembered arrangement applied", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const first = setup(store);
    await act(async () => {
      first.result.current.apply(A_ID);
    });
    await act(async () => {
      first.result.current.apply(null);
    });
    first.unmount();
    const second = setup(store);
    await act(async () => {});
    expect(second.onApply).not.toHaveBeenCalled();
    expect(second.result.current.appliedId).toBeNull();
    expect(second.result.current.notice).toBeNull();
  });

  it("refuses an unavailable arrangement with its message and applies nothing", async () => {
    const store = makeReadyStore([ARR_B]);
    await loadQueries(store);
    const { result, onApply } = setup(store);
    let outcome: unknown;
    await act(async () => {
      outcome = result.current.apply(B_ID);
    });
    expect(onApply).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false });
    expect(result.current.availability[B_ID]).toMatchObject({
      status: "unavailable",
      reason: "folder-missing",
    });
    expect(storedList(store)).toEqual([ARR_B]);
  });
});

describe("availability while inputs load", () => {
  it("is pending, never unavailable, before the saved-query list loads", () => {
    const store = makeReadyStore([ARR_B]);
    const { result, onApply } = setup(store);
    expect(result.current.availability[B_ID]).toEqual({ status: "pending" });
    act(() => {
      expect(result.current.apply(B_ID)).toMatchObject({ ok: false });
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  it("becomes unavailable once the list has loaded", async () => {
    const store = makeReadyStore([ARR_B]);
    const { result } = setup(store);
    expect(result.current.availability[B_ID]?.status).toBe("pending");
    await act(async () => {
      await loadQueries(store);
    });
    expect(result.current.availability[B_ID]?.status).toBe("unavailable");
  });

  it("a failed saved-query list is failed for smart-folder arrangements, not unavailable", async () => {
    const store = makeReadyStore([ARR_A, ARR_SMART]);
    await failQueries(store);
    const { result } = setup(store);
    expect(result.current.availability[SMART_ID]).toMatchObject({
      status: "failed",
    });
    expect(result.current.availability[A_ID]).toEqual({ status: "available" });
  });
});

describe("changed since applied", () => {
  it("is false at open and true after a picker edit", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result, rerender } = setup(store);
    expect(result.current.isChanged).toBe(false);
    rerender({ current: { ...DEFAULT_PICKS, rows: { kind: "subtype" } } });
    expect(result.current.isChanged).toBe(true);
    rerender({ current: DEFAULT_PICKS });
    expect(result.current.isChanged).toBe(false);
  });

  it("compares against the applied arrangement, regardless of key order", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result, rerender } = setup(store);
    await act(async () => {
      result.current.apply(A_ID);
    });
    const same: OrganizerPicks = {
      columns: { kind: "subtype" } as OrganizerAxis,
      rows: { kind: "status" },
      source: {
        scope: "children",
        folderId: FOLDER_ID,
        kind: "folder",
      } as OrganizerSource,
    };
    rerender({ current: same });
    expect(result.current.isChanged).toBe(false);
    rerender({ current: { ...same, columns: "order" } });
    expect(result.current.isChanged).toBe(true);
  });
});

describe("remembered arrangement on open", () => {
  it("applies an available remembered id", async () => {
    remember(A_ID);
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result, onApply } = setup(store);
    await waitFor(() => expect(result.current.appliedId).toBe(A_ID));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toBeNull();
  });

  it("waits while pending, then falls back once the list has loaded", async () => {
    remember(B_ID);
    const store = makeReadyStore([ARR_B]);
    const { result, onApply } = setup(store);
    expect(result.current.notice).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
    await act(async () => {
      await loadQueries(store);
    });
    await waitFor(() => expect(result.current.notice).not.toBeNull());
  });

  it("falls back with a message for an unavailable remembered id and rewrites nothing", async () => {
    remember(B_ID);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const store = makeReadyStore([ARR_B]);
    await loadQueries(store);
    const { result, onApply } = setup(store);
    await waitFor(() => expect(result.current.notice).not.toBeNull());
    expect(result.current.notice).toMatch(/folder/i);
    expect(result.current.appliedId).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(readLastOrganizerArrangementId(DIRECTORY_ID)).toBe(B_ID);
    expect(storedList(store)).toEqual([ARR_B]);
  });

  it("falls back with a message for a remembered id not in the list", async () => {
    remember("deleted-elsewhere");
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result, onApply } = setup(store);
    await waitFor(() => expect(result.current.notice).not.toBeNull());
    expect(onApply).not.toHaveBeenCalled();
    expect(readLastOrganizerArrangementId(DIRECTORY_ID)).toBe(
      "deleted-elsewhere",
    );
  });

  it("falls back with a message when storage is unreadable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result, onApply } = setup(store);
    await waitFor(() => expect(result.current.notice).not.toBeNull());
    expect(onApply).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("falls back with a message for a malformed stored value and leaves it", async () => {
    remember("../../bad value");
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result } = setup(store);
    await waitFor(() => expect(result.current.notice).not.toBeNull());
    expect(
      window.localStorage.getItem(organizerArrangementStorageKey(DIRECTORY_ID)),
    ).toBe("../../bad value");
  });

  it("says nothing when nothing is remembered", async () => {
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    const { result, onApply } = setup(store);
    await act(async () => {});
    expect(result.current.notice).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
    expect(result.current.appliedId).toBeNull();
  });

  it("with a failed query list does not fall back for a smart-folder arrangement, then applies once it loads", async () => {
    writeLastOrganizerArrangementId(DIRECTORY_ID, SMART_ID);
    const store = makeReadyStore([ARR_SMART]);
    await failQueries(store);
    const { result, onApply } = setup(store);
    await waitFor(() => expect(result.current.notice).not.toBeNull());
    expect(onApply).not.toHaveBeenCalled();
    expect(readLastOrganizerArrangementId(DIRECTORY_ID)).toBe(SMART_ID);
    await act(async () => {
      store.dispatch(clearQueries());
      await loadQueries(store, [
        { id: "q1", name: "Q", definition: {} } as unknown as SavedQuery,
      ]);
    });
    await waitFor(() => expect(result.current.appliedId).toBe(SMART_ID));
    expect(result.current.notice).toBeNull();
  });
});

describe("source guard", () => {
  it("does not call crypto.randomUUID", async () => {
    const spy = vi.spyOn(globalThis.crypto, "randomUUID");
    const store = makeReadyStore([ARR_A]);
    await loadQueries(store);
    add.mockResolvedValueOnce({ ok: true, id: "n" });
    const { result } = setup(store);
    await act(async () => {
      await result.current.save("N");
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
