/**
 * Spell-checker Task 33: why the checker is unavailable (lists failed, alias
 * table failed, worker or engine failed, unsupported browser version), the
 * paused state that produces no decorations, and exactly one toast per
 * reason (FR-19, FR-23, FR-26, AC-8).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";

vi.mock("../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import spellingReducer, {
  fetchSpellingLists,
  fetchSpellingAliasTable,
} from "../src/store/spellingSlice";
import userWordListReducer, {
  loadUserList,
} from "../src/store/userWordListSlice";
import availabilityReducer, {
  MIN_CHROME_VERSION,
  setUserListApplies,
  browserUnsupported,
  clearBrowserUnsupported,
  clearEngineFailure,
  connectSpellClientAvailability,
  detectUnsupportedBrowser,
  engineFailed,
  selectSpellCheckerState,
  startUnavailableToasts,
} from "../src/store/spellingAvailabilitySlice";
import { toastService } from "../src/lib/toast-service";
import type {
  SpellClient,
  SpellClientEvent,
} from "../src/lib/spelling/spell-client";

vi.mock("../src/lib/api/user-word-list", async (orig) => ({
  ...(await orig<typeof import("../src/lib/api/user-word-list")>()),
  getUserWords: vi.fn(),
}));
import { getUserWords } from "../src/lib/api/user-word-list";

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
import { getSpellingLists } from "../src/lib/api/project-spelling";
import { getEntityAliasTableOrThrow } from "../src/lib/api/entity-alias-table";

function makeStore() {
  return configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: availabilityReducer,
      userWordList: userWordListReducer,
    },
  });
}
type TestStore = ReturnType<typeof makeStore>;

const LISTS = { spellingProjectWords: [], spellingIgnoredWords: [] };

async function load(
  store: TestStore,
  lists: "ok" | "fail",
  alias: "ok" | "fail",
) {
  vi.mocked(getSpellingLists).mockImplementation(async () => {
    if (lists === "fail") throw new Error("lists down");
    return LISTS;
  });
  vi.mocked(getEntityAliasTableOrThrow).mockImplementation(async () => {
    if (alias === "fail") throw new Error("alias down");
    return { entries: [] } as never;
  });
  await store.dispatch(fetchSpellingLists("p1"));
  await store.dispatch(fetchSpellingAliasTable("p1"));
}

const kinds = (store: TestStore) => {
  const s = selectSpellCheckerState(store.getState());
  return s.status === "paused" ? s.reasons.map((r) => r.kind) : [];
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checker state", () => {
  it("is paused with a loading reason while nothing has loaded", () => {
    const store = makeStore();
    expect(selectSpellCheckerState(store.getState()).status).toBe("paused");
    expect(kinds(store)).toEqual(["loading"]);
  });

  it("is paused (no decorations) when the lists failed, with the reason", async () => {
    const store = makeStore();
    await load(store, "fail", "ok");
    const state = selectSpellCheckerState(store.getState());
    expect(state.status).toBe("paused");
    expect(kinds(store)).toEqual(["lists-failed"]);
    if (state.status === "paused")
      expect(state.reasons[0].message).toContain("lists down");
  });

  it("is paused after a failed alias fetch and carries the reason", async () => {
    const store = makeStore();
    await load(store, "ok", "fail");
    expect(selectSpellCheckerState(store.getState()).status).toBe("paused");
    expect(kinds(store)).toEqual(["alias-table-failed"]);
  });

  it("underlines as normal after a successful fetch of an empty table", async () => {
    const store = makeStore();
    await load(store, "ok", "ok");
    expect(selectSpellCheckerState(store.getState())).toEqual({
      status: "active",
    });
  });

  it("pauses on an engine failure and is not active", async () => {
    const store = makeStore();
    await load(store, "ok", "ok");
    store.dispatch(engineFailed("worker crashed"));
    expect(kinds(store)).toEqual(["engine-failed"]);
    store.dispatch(clearEngineFailure());
    expect(selectSpellCheckerState(store.getState()).status).toBe("active");
  });

  it("pauses on an unsupported browser and lists every reason", async () => {
    const store = makeStore();
    await load(store, "fail", "fail");
    store.dispatch(
      browserUnsupported({ detected: 60, minimum: MIN_CHROME_VERSION }),
    );
    expect(kinds(store)).toEqual([
      "lists-failed",
      "alias-table-failed",
      "browser-unsupported",
    ]);
    store.dispatch(clearBrowserUnsupported());
    expect(kinds(store)).not.toContain("browser-unsupported");
  });

  it("returns a stable reference when nothing changed", async () => {
    const store = makeStore();
    await load(store, "fail", "ok");
    expect(selectSpellCheckerState(store.getState())).toBe(
      selectSpellCheckerState(store.getState()),
    );
  });
});

describe("detectUnsupportedBrowser", () => {
  it("minimum is 67", () => expect(MIN_CHROME_VERSION).toBe(67));
  it("flags Chrome below the minimum", () => {
    expect(
      detectUnsupportedBrowser(
        "Mozilla/5.0 (Linux) Chrome/66.0.3359.126 Mobile Safari/537.36",
      ),
    ).toEqual({ detected: 66, minimum: 67 });
  });
  it("accepts Chrome at or above the minimum", () => {
    expect(detectUnsupportedBrowser("Chrome/67.0.1 Safari/537.36")).toBeNull();
    expect(
      detectUnsupportedBrowser("Chrome/148.0.7778.96 Safari/537.36"),
    ).toBeNull();
  });
  it("does not flag a user agent with no Chrome version", () => {
    expect(detectUnsupportedBrowser("Mozilla/5.0 Firefox/130.0")).toBeNull();
  });
});

describe("connectSpellClientAvailability", () => {
  it("records an unavailable event from the client as an engine failure", () => {
    const store = makeStore();
    let listener: (e: SpellClientEvent) => void = () => {};
    const client = {
      subscribe: (l: (e: SpellClientEvent) => void) => {
        listener = l;
        return () => {};
      },
    } as unknown as SpellClient;
    connectSpellClientAvailability(client, store.dispatch);
    listener({ type: "ready" });
    expect(kinds(store)).not.toContain("engine-failed");
    listener({ type: "unavailable", reason: "no worker" });
    expect(kinds(store)).toContain("engine-failed");
  });
});

describe("one toast per reason", () => {
  it("toasts each reason exactly once and not for loading", async () => {
    const store = makeStore();
    startUnavailableToasts(store);
    expect(toastService.error).not.toHaveBeenCalled();
    await load(store, "fail", "ok");
    expect(toastService.error).toHaveBeenCalledTimes(1);
    // unrelated state changes while the reason persists do not re-toast
    store.dispatch(engineFailed("boom"));
    store.dispatch(engineFailed("boom again"));
    expect(toastService.error).toHaveBeenCalledTimes(2);
    await store.dispatch(fetchSpellingAliasTable("p1")); // still ok
    expect(toastService.error).toHaveBeenCalledTimes(2);
  });

  it("persists the reason as state after the toast and re-arms once cleared", async () => {
    const store = makeStore();
    startUnavailableToasts(store);
    await load(store, "ok", "ok");
    store.dispatch(engineFailed("one"));
    expect(kinds(store)).toEqual(["engine-failed"]);
    store.dispatch(clearEngineFailure());
    store.dispatch(engineFailed("two"));
    expect(toastService.error).toHaveBeenCalledTimes(2);
  });

  it("toasts reasons already present when the toaster starts, once", async () => {
    const store = makeStore();
    await load(store, "ok", "fail");
    startUnavailableToasts(store);
    expect(toastService.error).toHaveBeenCalledTimes(1);
  });

  it("stops toasting after unsubscribe", () => {
    const store = makeStore();
    const stop = startUnavailableToasts(store);
    stop();
    store.dispatch(engineFailed("x"));
    expect(toastService.error).not.toHaveBeenCalled();
  });
});

describe("user list as a third input (Feature 96, FR-15, FR-23)", () => {
  async function loadUser(store: TestStore, result: "ok" | "fail") {
    vi.mocked(getUserWords).mockImplementation(async () => {
      if (result === "fail") throw new Error("disk gone");
      return ["zorblax"];
    });
    await store.dispatch(loadUserList());
  }

  it("a failed read pauses with user-list-failed and the reason", async () => {
    const store = makeStore();
    await load(store, "ok", "ok");
    store.dispatch(setUserListApplies(true));
    await loadUser(store, "fail");
    const state = selectSpellCheckerState(store.getState());
    expect(state.status).toBe("paused");
    expect(kinds(store)).toEqual(["user-list-failed"]);
    if (state.status === "paused")
      expect(state.reasons[0].message).toBe(
        "Your dictionary could not be loaded (disk gone).",
      );
  });

  it("a not-yet-loaded list is loading (paused) and raises no toast", async () => {
    const store = makeStore();
    await load(store, "ok", "ok");
    startUnavailableToasts(store);
    store.dispatch(setUserListApplies(true));
    expect(kinds(store)).toEqual(["loading"]);
    expect(toastService.error).not.toHaveBeenCalled();
  });

  it("a loaded list leaves the checker active", async () => {
    const store = makeStore();
    await load(store, "ok", "ok");
    store.dispatch(setUserListApplies(true));
    await loadUser(store, "ok");
    expect(selectSpellCheckerState(store.getState())).toEqual({
      status: "active",
    });
  });

  it("is not an input when it does not apply (paired device, switch off)", async () => {
    const store = makeStore();
    await load(store, "ok", "ok");
    startUnavailableToasts(store);
    await loadUser(store, "fail");
    expect(selectSpellCheckerState(store.getState())).toEqual({
      status: "active",
    });
    expect(toastService.error).not.toHaveBeenCalled();
  });

  it("toasts once per failure transition and re-arms after it clears", async () => {
    const store = makeStore();
    await load(store, "ok", "ok");
    startUnavailableToasts(store);
    store.dispatch(setUserListApplies(true));
    await loadUser(store, "fail");
    expect(toastService.error).toHaveBeenCalledTimes(1);
    expect(toastService.error).toHaveBeenCalledWith(
      "Your dictionary could not be loaded (disk gone).",
      undefined,
      { id: "spell-checker-user-list-failed" },
    );
    // unrelated changes while the failure persists do not re-toast it
    store.dispatch(engineFailed("boom"));
    expect(toastService.error).toHaveBeenCalledTimes(2); // engine toast only
    store.dispatch(clearEngineFailure());
    // a retry that fails again is a new failure transition (via loading)
    await loadUser(store, "fail");
    expect(toastService.error).toHaveBeenCalledTimes(3);
    await loadUser(store, "ok");
    expect(toastService.error).toHaveBeenCalledTimes(3);
  });

  it("turning the gate off clears the reason and re-arms the toast", async () => {
    const store = makeStore();
    await load(store, "ok", "ok");
    startUnavailableToasts(store);
    store.dispatch(setUserListApplies(true));
    await loadUser(store, "fail");
    store.dispatch(setUserListApplies(false));
    expect(selectSpellCheckerState(store.getState()).status).toBe("active");
    store.dispatch(setUserListApplies(true));
    expect(toastService.error).toHaveBeenCalledTimes(2);
  });

  it("keeps the project-list reasons alongside the user-list one", async () => {
    const store = makeStore();
    await load(store, "fail", "ok");
    store.dispatch(setUserListApplies(true));
    await loadUser(store, "fail");
    expect(kinds(store)).toEqual(["lists-failed", "user-list-failed"]);
  });
});
