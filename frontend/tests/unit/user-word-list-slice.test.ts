/**
 * Feature 96, Task 9: the user word list slice. Status is a distinct
 * `idle | loading | loaded | failed`; a failed read is never an empty
 * `words` array; add and remove make no change until the transport resolves,
 * then store exactly the returned list (no optimistic update); a rejected
 * mutation leaves state unchanged and rejects.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";

vi.mock("../../src/lib/api/user-word-list", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/api/user-word-list")
  >("../../src/lib/api/user-word-list");
  return {
    UserWordListTransportError: actual.UserWordListTransportError,
    getUserWords: vi.fn(),
    addUserWord: vi.fn(),
    removeUserWord: vi.fn(),
  };
});
vi.mock("../../src/lib/api/project-spelling", () => ({
  getSpellingLists: vi.fn(),
  addSpellingWord: vi.fn(),
  removeSpellingWord: vi.fn(),
  ignoreSpellingWord: vi.fn(),
  unignoreSpellingWord: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTableOrThrow: vi.fn(),
}));

import userWordListReducer, {
  addToUserList,
  loadUserList,
  removeFromUserList,
  selectUserWordListReason,
  selectUserWordListStatus,
  selectUserWords,
} from "../../src/store/userWordListSlice";
import spellingReducer, {
  fetchSpellingLists,
} from "../../src/store/spellingSlice";
import {
  addUserWord,
  getUserWords,
  removeUserWord,
  UserWordListTransportError,
} from "../../src/lib/api/user-word-list";
import { getSpellingLists } from "../../src/lib/api/project-spelling";

const mGet = vi.mocked(getUserWords);
const mAdd = vi.mocked(addUserWord);
const mRemove = vi.mocked(removeUserWord);

function makeStore() {
  return configureStore({
    reducer: { userWordList: userWordListReducer, spelling: spellingReducer },
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("userWordListSlice", () => {
  it("starts idle with no words and no reason", () => {
    const s = makeStore().getState();
    expect(selectUserWordListStatus(s)).toBe("idle");
    expect(selectUserWords(s)).toEqual([]);
    expect(selectUserWordListReason(s)).toBeNull();
  });

  it("load success stores the list and is loading while pending", async () => {
    const d = deferred<string[]>();
    mGet.mockReturnValue(d.promise);
    const store = makeStore();
    const p = store.dispatch(loadUserList());
    expect(selectUserWordListStatus(store.getState())).toBe("loading");
    d.resolve(["Aria", "zed"]);
    await p;
    const s = store.getState();
    expect(selectUserWordListStatus(s)).toBe("loaded");
    expect(selectUserWords(s)).toEqual(["Aria", "zed"]);
    expect(selectUserWordListReason(s)).toBeNull();
  });

  it("load failure sets failed with the reason, not a loaded empty list", async () => {
    mGet.mockRejectedValue(new UserWordListTransportError("corrupt", "bad"));
    const store = makeStore();
    await store.dispatch(loadUserList());
    const s = store.getState();
    expect(selectUserWordListStatus(s)).toBe("failed");
    expect(selectUserWordListReason(s)).toBe("corrupt");
    expect(selectUserWords(s)).toEqual([]);
  });

  it("a non-transport load failure still fails with a reason", async () => {
    mGet.mockRejectedValue(new Error("network down"));
    const store = makeStore();
    await store.dispatch(loadUserList());
    const s = store.getState();
    expect(selectUserWordListStatus(s)).toBe("failed");
    expect(selectUserWordListReason(s)).toBe("network down");
  });

  it("a failed re-read drops stale words and a later success clears the failure", async () => {
    mGet.mockResolvedValueOnce(["Aria"]);
    const store = makeStore();
    await store.dispatch(loadUserList());
    mGet.mockRejectedValueOnce(
      new UserWordListTransportError("unreadable", "x"),
    );
    await store.dispatch(loadUserList());
    expect(selectUserWordListStatus(store.getState())).toBe("failed");
    expect(selectUserWords(store.getState())).toEqual([]);
    mGet.mockResolvedValueOnce(["Aria"]);
    await store.dispatch(loadUserList());
    expect(selectUserWordListStatus(store.getState())).toBe("loaded");
    expect(selectUserWordListReason(store.getState())).toBeNull();
  });

  it("add changes nothing until the transport resolves, then stores the returned list", async () => {
    mGet.mockResolvedValue(["Aria"]);
    const store = makeStore();
    await store.dispatch(loadUserList());
    const before = store.getState().userWordList;
    const d = deferred<string[]>();
    mAdd.mockReturnValue(d.promise);
    const p = store.dispatch(addToUserList("Bree"));
    expect(store.getState().userWordList).toEqual(before);
    d.resolve(["Aria", "Bree", "Cole"]);
    await p;
    expect(selectUserWords(store.getState())).toEqual(["Aria", "Bree", "Cole"]);
    expect(mAdd).toHaveBeenCalledWith("Bree");
  });

  it("remove changes nothing until the transport resolves, then stores the returned list", async () => {
    mGet.mockResolvedValue(["Aria", "Bree"]);
    const store = makeStore();
    await store.dispatch(loadUserList());
    const before = store.getState().userWordList;
    const d = deferred<string[]>();
    mRemove.mockReturnValue(d.promise);
    const p = store.dispatch(removeFromUserList("Bree"));
    expect(store.getState().userWordList).toEqual(before);
    d.resolve(["Aria"]);
    await p;
    expect(selectUserWords(store.getState())).toEqual(["Aria"]);
    expect(mRemove).toHaveBeenCalledWith("Bree");
  });

  it("a rejected add leaves state unchanged and surfaces the error", async () => {
    mGet.mockResolvedValue(["Aria"]);
    const store = makeStore();
    await store.dispatch(loadUserList());
    const before = store.getState().userWordList;
    mAdd.mockRejectedValue(new UserWordListTransportError("list-full", "full"));
    const result = await store.dispatch(addToUserList("Bree"));
    expect(addToUserList.rejected.match(result)).toBe(true);
    expect(result.payload).toEqual({ reason: "list-full", message: "full" });
    expect(store.getState().userWordList).toEqual(before);
  });

  it("a rejected remove leaves state unchanged and surfaces the error", async () => {
    mGet.mockResolvedValue(["Aria"]);
    const store = makeStore();
    await store.dispatch(loadUserList());
    const before = store.getState().userWordList;
    mRemove.mockRejectedValue(new Error("boom"));
    const result = await store.dispatch(removeFromUserList("Aria"));
    expect(removeFromUserList.rejected.match(result)).toBe(true);
    expect(result.payload).toEqual({ reason: "boom", message: "boom" });
    expect(store.getState().userWordList).toEqual(before);
  });

  it("FR-17: a word in the project list is unaffected by add and remove in the user list", async () => {
    vi.mocked(getSpellingLists).mockResolvedValue({
      spellingProjectWords: ["Aria"],
      spellingIgnoredWords: [],
    });
    const store = makeStore();
    await store.dispatch(fetchSpellingLists("p1"));
    const projectBefore = store.getState().spelling.lists;
    expect(projectBefore.spellingProjectWords).toEqual(["Aria"]);
    mAdd.mockResolvedValue(["Aria"]);
    await store.dispatch(addToUserList("Aria"));
    expect(store.getState().spelling.lists).toEqual(projectBefore);
    expect(selectUserWords(store.getState())).toEqual(["Aria"]);
    mRemove.mockResolvedValue([]);
    await store.dispatch(removeFromUserList("Aria"));
    expect(store.getState().spelling.lists).toEqual(projectBefore);
  });
});
