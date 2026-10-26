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

/** The state a reader can see; excludes the slice's bookkeeping counters. */
function visible(state: {
  userWordList: ReturnType<typeof userWordListReducer>;
}) {
  const { status, words, reason, errorMessage } = state.userWordList;
  return { status, words, reason, errorMessage };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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
    const before = visible(store.getState());
    const d = deferred<string[]>();
    mAdd.mockReturnValue(d.promise);
    const p = store.dispatch(addToUserList("Bree"));
    expect(visible(store.getState())).toEqual(before);
    d.resolve(["Aria", "Bree", "Cole"]);
    await p;
    expect(selectUserWords(store.getState())).toEqual(["Aria", "Bree", "Cole"]);
    expect(mAdd).toHaveBeenCalledWith("Bree");
  });

  it("remove changes nothing until the transport resolves, then stores the returned list", async () => {
    mGet.mockResolvedValue(["Aria", "Bree"]);
    const store = makeStore();
    await store.dispatch(loadUserList());
    const before = visible(store.getState());
    const d = deferred<string[]>();
    mRemove.mockReturnValue(d.promise);
    const p = store.dispatch(removeFromUserList("Bree"));
    expect(visible(store.getState())).toEqual(before);
    d.resolve(["Aria"]);
    await p;
    expect(selectUserWords(store.getState())).toEqual(["Aria"]);
    expect(mRemove).toHaveBeenCalledWith("Bree");
  });

  it("a rejected add leaves state unchanged and surfaces the error", async () => {
    mGet.mockResolvedValue(["Aria"]);
    const store = makeStore();
    await store.dispatch(loadUserList());
    const before = visible(store.getState());
    mAdd.mockRejectedValue(new UserWordListTransportError("list-full", "full"));
    const result = await store.dispatch(addToUserList("Bree"));
    expect(addToUserList.rejected.match(result)).toBe(true);
    expect(result.payload).toEqual({ reason: "list-full", message: "full" });
    expect(visible(store.getState())).toEqual(before);
  });

  it("a rejected remove leaves state unchanged and surfaces the error", async () => {
    mGet.mockResolvedValue(["Aria"]);
    const store = makeStore();
    await store.dispatch(loadUserList());
    const before = visible(store.getState());
    mRemove.mockRejectedValue(new Error("boom"));
    const result = await store.dispatch(removeFromUserList("Aria"));
    expect(removeFromUserList.rejected.match(result)).toBe(true);
    expect(result.payload).toEqual({ reason: "boom", message: "boom" });
    expect(visible(store.getState())).toEqual(before);
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
  describe("ordering of reads and mutations", () => {
    it("a read that started before an add and resolves after it keeps the added list", async () => {
      const read = deferred<string[]>();
      const add = deferred<string[]>();
      mGet.mockReturnValue(read.promise);
      mAdd.mockReturnValue(add.promise);
      const store = makeStore();
      const readP = store.dispatch(loadUserList());
      const addP = store.dispatch(addToUserList("b"));
      add.resolve(["a", "b"]);
      await addP;
      read.resolve(["a"]);
      await readP;
      const s = store.getState();
      expect(selectUserWords(s)).toEqual(["a", "b"]);
      expect(selectUserWordListStatus(s)).toBe("loaded");
      expect(selectUserWordListReason(s)).toBeNull();
    });

    it("a read that starts while an add is in flight does not overwrite it", async () => {
      const add = deferred<string[]>();
      mAdd.mockReturnValue(add.promise);
      mGet.mockResolvedValue(["a"]);
      const store = makeStore();
      const addP = store.dispatch(addToUserList("b"));
      await store.dispatch(loadUserList());
      add.resolve(["a", "b"]);
      await addP;
      expect(selectUserWords(store.getState())).toEqual(["a", "b"]);
      expect(selectUserWordListStatus(store.getState())).toBe("loaded");
    });

    it("a read that resolves while an add is still in flight does not apply its list", async () => {
      const read = deferred<string[]>();
      const add = deferred<string[]>();
      mGet.mockReturnValue(read.promise);
      mAdd.mockReturnValue(add.promise);
      const store = makeStore();
      const readP = store.dispatch(loadUserList());
      const addP = store.dispatch(addToUserList("b"));
      read.resolve(["a"]);
      await readP;
      add.resolve(["a", "b"]);
      await addP;
      expect(selectUserWords(store.getState())).toEqual(["a", "b"]);
    });

    it("two adds resolving out of order keep the later one's list", async () => {
      const first = deferred<string[]>();
      const second = deferred<string[]>();
      mAdd
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const store = makeStore();
      const p1 = store.dispatch(addToUserList("b"));
      const p2 = store.dispatch(addToUserList("c"));
      second.resolve(["a", "b", "c"]);
      await p2;
      first.resolve(["a", "b"]);
      await p1;
      expect(selectUserWords(store.getState())).toEqual(["a", "b", "c"]);
    });

    it("a read that starts during an add and resolves after it keeps the added list", async () => {
      const read = deferred<string[]>();
      const add = deferred<string[]>();
      mAdd.mockReturnValue(add.promise);
      mGet.mockReturnValue(read.promise);
      const store = makeStore();
      const addP = store.dispatch(addToUserList("b"));
      const readP = store.dispatch(loadUserList());
      add.resolve(["a", "b"]);
      await addP;
      read.resolve(["a"]);
      await readP;
      expect(selectUserWords(store.getState())).toEqual(["a", "b"]);
    });

    it("a read with no mutations still applies its list", async () => {
      mGet.mockResolvedValue(["x"]);
      const store = makeStore();
      await store.dispatch(loadUserList());
      mGet.mockResolvedValue(["x", "y"]);
      await store.dispatch(loadUserList());
      expect(selectUserWords(store.getState())).toEqual(["x", "y"]);
    });

    it("a read after a settled mutation applies its list", async () => {
      mAdd.mockResolvedValue(["a", "b"]);
      mGet.mockResolvedValue(["a", "b", "c"]);
      const store = makeStore();
      await store.dispatch(addToUserList("b"));
      await store.dispatch(loadUserList());
      expect(selectUserWords(store.getState())).toEqual(["a", "b", "c"]);
    });

    it("a read that fails while an add is in flight still fails", async () => {
      const read = deferred<string[]>();
      const add = deferred<string[]>();
      mGet.mockReturnValue(read.promise);
      mAdd.mockReturnValue(add.promise);
      const store = makeStore();
      const readP = store.dispatch(loadUserList());
      const addP = store.dispatch(addToUserList("b"));
      read.reject(new UserWordListTransportError("unreadable", "x"));
      await readP;
      expect(selectUserWordListStatus(store.getState())).toBe("failed");
      add.resolve(["a", "b"]);
      await addP;
    });
  });
});
