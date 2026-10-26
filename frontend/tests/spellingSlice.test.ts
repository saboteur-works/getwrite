/**
 * Spell-checker Task 27: the spelling slice holds the active project's two
 * word lists with a `not-loaded | loaded | failed` state, loaded on project
 * load and replaced wholesale by every mutation's response (no optimistic
 * update). The alias-table read for the spelling path (Task 26's
 * `getEntityAliasTableOrThrow`) keeps its own failed state, distinct from an
 * empty table (FR-16, FR-19, AC-8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";

vi.mock("../src/lib/api/project-spelling", () => ({
  getSpellingLists: vi.fn(),
  addSpellingWord: vi.fn(),
  removeSpellingWord: vi.fn(),
  ignoreSpellingWord: vi.fn(),
  unignoreSpellingWord: vi.fn(),
}));
vi.mock("../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
  getEntityAliasTableOrThrow: vi.fn(),
}));

import spellingReducer, {
  addProjectWord,
  fetchSpellingState,
  ignoreWord,
  removeProjectWord,
  selectSpellingAliasTable,
  selectSpellingAliasTableStatus,
  selectSpellingLists,
  selectSpellingStatus,
  unignoreWord,
} from "../src/store/spellingSlice";
import projectsReducer, {
  buildStoredProject,
  loadProject,
} from "../src/store/projectsSlice";
import {
  addSpellingWord,
  getSpellingLists,
  ignoreSpellingWord,
  removeSpellingWord,
  unignoreSpellingWord,
} from "../src/lib/api/project-spelling";
import {
  getEntityAliasTable,
  getEntityAliasTableOrThrow,
} from "../src/lib/api/entity-alias-table";
import type { EntityAliasTable } from "../src/lib/models/entity-alias-table";
import type { Project } from "../src/lib/models/types";

const mGet = vi.mocked(getSpellingLists);
const mAdd = vi.mocked(addSpellingWord);
const mRemove = vi.mocked(removeSpellingWord);
const mIgnore = vi.mocked(ignoreSpellingWord);
const mUnignore = vi.mocked(unignoreSpellingWord);
const mAlias = vi.mocked(getEntityAliasTableOrThrow);

const LISTS = { spellingProjectWords: ["Aria"], spellingIgnoredWords: ["teh"] };
const EMPTY_TABLE: EntityAliasTable = { entities: {}, claimedBy: {} };

function makeStore() {
  return configureStore({
    reducer: { spelling: spellingReducer, projects: projectsReducer },
  });
}

beforeEach(() => {
  mAlias.mockResolvedValue(EMPTY_TABLE);
  vi.mocked(getEntityAliasTable).mockResolvedValue(EMPTY_TABLE);
});
afterEach(() => {
  vi.resetAllMocks();
});

describe("spellingSlice", () => {
  it("starts not-loaded with empty lists and no project", () => {
    const store = makeStore();
    const state = store.getState();
    expect(selectSpellingStatus(state)).toBe("not-loaded");
    expect(selectSpellingLists(state)).toEqual({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
    expect(selectSpellingAliasTableStatus(state)).toBe("not-loaded");
  });

  it("loads the lists when the project loads", async () => {
    mGet.mockResolvedValue(LISTS);
    const store = makeStore();
    const project: Project = {
      id: "p-internal",
      name: "P",
      rootPath: "/x/projects/dir-1",
    } as Project;
    await store.dispatch(loadProject(buildStoredProject(project, [], [])));
    await vi.waitFor(() =>
      expect(selectSpellingStatus(store.getState())).toBe("loaded"),
    );
    expect(mGet).toHaveBeenCalledWith("dir-1");
    expect(selectSpellingLists(store.getState())).toEqual(LISTS);
  });

  it("a failed load sets failed and never loaded with empty lists", async () => {
    mGet.mockRejectedValue(new Error("disk"));
    const store = makeStore();
    const pending = store.dispatch(fetchSpellingState("dir-1"));
    expect(selectSpellingStatus(store.getState())).toBe("not-loaded");
    await pending;
    const state = store.getState();
    expect(selectSpellingStatus(state)).toBe("failed");
    expect(state.spelling.errorMessage).toBe("disk");
  });

  it("a failed reload keeps no stale lists as loaded", async () => {
    mGet.mockResolvedValueOnce(LISTS);
    const store = makeStore();
    await store.dispatch(fetchSpellingState("dir-1"));
    mGet.mockRejectedValueOnce(new Error("boom"));
    await store.dispatch(fetchSpellingState("dir-1"));
    expect(selectSpellingStatus(store.getState())).toBe("failed");
  });

  it("ignores a stale load response for a project that is no longer requested", async () => {
    let resolveA: (v: typeof LISTS) => void = () => {};
    mGet.mockImplementationOnce(
      () => new Promise((r) => (resolveA = r as typeof resolveA)),
    );
    mGet.mockResolvedValueOnce({
      spellingProjectWords: ["B"],
      spellingIgnoredWords: [],
    });
    const store = makeStore();
    const a = store.dispatch(fetchSpellingState("dir-a"));
    await store.dispatch(fetchSpellingState("dir-b"));
    resolveA(LISTS);
    await a;
    expect(store.getState().spelling.projectId).toBe("dir-b");
    expect(selectSpellingLists(store.getState()).spellingProjectWords).toEqual([
      "B",
    ]);
  });

  describe("mutations", () => {
    async function loadedStore() {
      mGet.mockResolvedValue(LISTS);
      const store = makeStore();
      await store.dispatch(fetchSpellingState("dir-1"));
      return store;
    }

    it.each([
      ["addProjectWord", addProjectWord, mAdd],
      ["removeProjectWord", removeProjectWord, mRemove],
      ["ignoreWord", ignoreWord, mIgnore],
      ["unignoreWord", unignoreWord, mUnignore],
    ] as const)(
      "%s replaces both lists with the response, with no optimistic update",
      async (_name, thunk, mocked) => {
        const store = await loadedStore();
        const next = {
          spellingProjectWords: ["Aria", "Zed"],
          spellingIgnoredWords: [],
        };
        let resolve: (v: typeof next) => void = () => {};
        mocked.mockImplementation(
          () => new Promise((r) => (resolve = r as typeof resolve)),
        );
        const p = store.dispatch(thunk("Zed"));
        expect(selectSpellingLists(store.getState())).toEqual(LISTS);
        resolve(next);
        await p;
        expect(mocked).toHaveBeenCalledWith("dir-1", "Zed");
        expect(selectSpellingLists(store.getState())).toEqual(next);
        expect(selectSpellingStatus(store.getState())).toBe("loaded");
      },
    );

    it("a failed mutation leaves the lists unchanged and rejects", async () => {
      const store = await loadedStore();
      const before = selectSpellingLists(store.getState());
      mAdd.mockRejectedValue(new Error("HTTP 500"));
      await expect(
        store.dispatch(addProjectWord("Zed")).unwrap(),
      ).rejects.toMatchObject({ message: "HTTP 500" });
      expect(selectSpellingLists(store.getState())).toBe(before);
      expect(selectSpellingStatus(store.getState())).toBe("loaded");
    });

    it("rejects without calling the transport when no project is loaded", async () => {
      const store = makeStore();
      await expect(
        store.dispatch(addProjectWord("Zed")).unwrap(),
      ).rejects.toBeTruthy();
      expect(mAdd).not.toHaveBeenCalled();
    });

    it("drops a mutation response that arrives after the project changed", async () => {
      const store = await loadedStore();
      let resolve: (v: typeof LISTS) => void = () => {};
      mAdd.mockImplementation(
        () => new Promise((r) => (resolve = r as typeof resolve)),
      );
      const p = store.dispatch(addProjectWord("Zed"));
      mGet.mockResolvedValue({
        spellingProjectWords: ["B"],
        spellingIgnoredWords: [],
      });
      await store.dispatch(fetchSpellingState("dir-2"));
      resolve({ spellingProjectWords: ["Zed"], spellingIgnoredWords: [] });
      await p;
      expect(
        selectSpellingLists(store.getState()).spellingProjectWords,
      ).toEqual(["B"]);
    });
  });

  it("two consumers selecting the slice see the same change at once", async () => {
    mGet.mockResolvedValue(LISTS);
    const store = makeStore();
    await store.dispatch(fetchSpellingState("dir-1"));
    const seenA: string[][] = [];
    const seenB: string[][] = [];
    store.subscribe(() => {
      seenA.push(selectSpellingLists(store.getState()).spellingProjectWords);
      seenB.push(selectSpellingLists(store.getState()).spellingProjectWords);
    });
    mAdd.mockResolvedValue({
      spellingProjectWords: ["Aria", "Zed"],
      spellingIgnoredWords: ["teh"],
    });
    await store.dispatch(addProjectWord("Zed"));
    expect(seenA.at(-1)).toEqual(["Aria", "Zed"]);
    expect(seenB.at(-1)).toBe(seenA.at(-1));
  });

  describe("alias table for the spelling path", () => {
    it("holds a successfully fetched empty table as loaded, distinct from failed", async () => {
      mGet.mockResolvedValue(LISTS);
      const store = makeStore();
      await store.dispatch(fetchSpellingState("dir-1"));
      expect(mAlias).toHaveBeenCalledWith("dir-1");
      expect(selectSpellingAliasTableStatus(store.getState())).toBe("loaded");
      expect(selectSpellingAliasTable(store.getState())).toEqual(EMPTY_TABLE);
    });

    it("holds failed when the rejecting read fails, and that does not fail the lists", async () => {
      mGet.mockResolvedValue(LISTS);
      mAlias.mockRejectedValue(new Error("alias down"));
      const store = makeStore();
      await store.dispatch(fetchSpellingState("dir-1"));
      expect(selectSpellingAliasTableStatus(store.getState())).toBe("failed");
      expect(store.getState().spelling.aliasTableErrorMessage).toBe(
        "alias down",
      );
      expect(selectSpellingStatus(store.getState())).toBe("loaded");
      expect(selectSpellingAliasTable(store.getState())).toBeNull();
    });

    it("holds the fetched non-empty table", async () => {
      const table: EntityAliasTable = {
        entities: {
          e1: {
            entityId: "e1",
            entityKind: "character",
            name: "Aria",
            aliases: [],
            terms: ["Aria"],
          },
        },
        claimedBy: {},
      };
      mGet.mockResolvedValue(LISTS);
      mAlias.mockResolvedValue(table);
      const store = makeStore();
      await store.dispatch(fetchSpellingState("dir-1"));
      expect(selectSpellingAliasTable(store.getState())).toEqual(table);
    });
  });
});
