/**
 * Feature 96, Task 14: lazy load and re-read on focus of the user word list.
 */
import React, { type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore } from "../../src/store/store";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import type { StaticSharingLimitsValue } from "../../components/Sharing/SharingLimitsContext";
import {
  SPELLCHECK_CHANGED_EVENT,
  SPELLCHECK_ENABLED_STORAGE_KEY,
  resetSpellcheckSessionValue,
} from "../../src/lib/spellcheck-preference";
import {
  useEnsureUserListLoaded,
  useUserListLifecycle,
} from "../../src/hooks/useUserListLoading";
import * as transport from "../../src/lib/api/user-word-list";

vi.mock("../../src/lib/api/user-word-list", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/api/user-word-list")>();
  return { ...actual, getUserWords: vi.fn() };
});

const getUserWords = vi.mocked(transport.getUserWords);

const PAIRED: StaticSharingLimitsValue = {
  state: {
    state: "paired",
    limits: {
      projectDeletion: true,
      unlocking: true,
      locking: true,
      encryptionChanges: true,
      permanentDeletion: true,
    },
  },
};
const EXEMPT: StaticSharingLimitsValue = { state: { state: "exempt" } };

function setup(role: StaticSharingLimitsValue, hook: () => void) {
  const store = makeStore();
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <Provider store={store}>
      <StaticSharingLimitsProvider value={role}>
        {children}
      </StaticSharingLimitsProvider>
    </Provider>
  );
  const view = renderHook(hook, { wrapper });
  return { store, ...view };
}

function setSwitch(value: "true" | "false"): void {
  window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, value);
  window.dispatchEvent(new Event(SPELLCHECK_CHANGED_EVENT));
}

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  window.localStorage.clear();
  resetSpellcheckSessionValue();
  getUserWords.mockReset();
  getUserWords.mockResolvedValue(["zorblax"]);
  setVisibility("visible");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("useUserListLifecycle", () => {
  it("makes no request at startup with the switch off", async () => {
    window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
    const { store } = setup(EXEMPT, useUserListLifecycle);
    await act(async () => {});
    expect(getUserWords).not.toHaveBeenCalled();
    expect(store.getState().userWordList.status).toBe("idle");
  });

  it("loads exactly once when the switch turns on", async () => {
    window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
    const { store } = setup(EXEMPT, useUserListLifecycle);
    await act(async () => {
      setSwitch("true");
    });
    await act(async () => {
      setSwitch("true");
    });
    expect(getUserWords).toHaveBeenCalledTimes(1);
    expect(store.getState().userWordList.words).toEqual(["zorblax"]);
  });

  it("loads at startup when the switch is on", async () => {
    setup(EXEMPT, useUserListLifecycle);
    await act(async () => {});
    expect(getUserWords).toHaveBeenCalledTimes(1);
  });

  it("re-reads on visible and the result replaces the stored list", async () => {
    const { store } = setup(EXEMPT, useUserListLifecycle);
    await act(async () => {});
    getUserWords.mockResolvedValue(["other"]);
    await act(async () => {
      setVisibility("visible");
    });
    expect(getUserWords).toHaveBeenCalledTimes(2);
    expect(store.getState().userWordList.words).toEqual(["other"]);
  });

  it("does not re-read on hidden", async () => {
    setup(EXEMPT, useUserListLifecycle);
    await act(async () => {});
    await act(async () => {
      setVisibility("hidden");
    });
    expect(getUserWords).toHaveBeenCalledTimes(1);
  });

  it("does not re-read when nothing was ever loaded (switch off)", async () => {
    window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
    setup(EXEMPT, useUserListLifecycle);
    await act(async () => {
      setVisibility("visible");
    });
    expect(getUserWords).not.toHaveBeenCalled();
  });

  it("sets failed, not stale words, when a re-read fails", async () => {
    const { store } = setup(EXEMPT, useUserListLifecycle);
    await act(async () => {});
    getUserWords.mockRejectedValue(new Error("disk gone"));
    await act(async () => {
      setVisibility("visible");
    });
    const state = store.getState().userWordList;
    expect(state.status).toBe("failed");
    expect(state.words).toEqual([]);
  });

  it("makes no request and adds no listener on a paired device", async () => {
    const add = vi.spyOn(document, "addEventListener");
    setup(PAIRED, useUserListLifecycle);
    await act(async () => {
      setVisibility("visible");
    });
    expect(getUserWords).not.toHaveBeenCalled();
    expect(add.mock.calls.some(([type]) => type === "visibilitychange")).toBe(
      false,
    );
    add.mockRestore();
  });

  it("removes its listeners on unmount", async () => {
    const { unmount } = setup(EXEMPT, useUserListLifecycle);
    await act(async () => {});
    unmount();
    await act(async () => {
      setVisibility("visible");
      setSwitch("true");
    });
    expect(getUserWords).toHaveBeenCalledTimes(1);
  });
});

describe("useUserListLifecycle: userListApplies follows switch and role", () => {
  const applies = (store: ReturnType<typeof makeStore>): boolean =>
    store.getState().spellingAvailability.userListApplies;

  it("is true with the switch on and an exempt role", async () => {
    const { store } = setup(EXEMPT, useUserListLifecycle);
    await act(async () => {});
    expect(applies(store)).toBe(true);
  });

  it("is false with the switch off, true again when it turns on", async () => {
    window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
    const { store } = setup(EXEMPT, useUserListLifecycle);
    await act(async () => {});
    expect(applies(store)).toBe(false);
    await act(async () => {
      setSwitch("true");
    });
    expect(applies(store)).toBe(true);
    await act(async () => {
      setSwitch("false");
    });
    expect(applies(store)).toBe(false);
  });

  it("is false on a paired device", async () => {
    const { store } = setup(PAIRED, useUserListLifecycle);
    await act(async () => {});
    expect(applies(store)).toBe(false);
  });

  it("is false while the role is unknown", async () => {
    const { store } = setup(
      { state: { state: "unknown" } },
      useUserListLifecycle,
    );
    await act(async () => {});
    expect(applies(store)).toBe(false);
  });

  it("is false again after unmount", async () => {
    const { store, unmount } = setup(EXEMPT, useUserListLifecycle);
    await act(async () => {});
    unmount();
    expect(applies(store)).toBe(false);
  });
});

describe("useEnsureUserListLoaded", () => {
  it("loads once on open even with the switch off", async () => {
    window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
    const { store, rerender } = setup(EXEMPT, useEnsureUserListLoaded);
    rerender();
    await act(async () => {});
    expect(getUserWords).toHaveBeenCalledTimes(1);
    expect(store.getState().userWordList.status).toBe("loaded");
  });

  it("does not load again once failed (the section's Retry does)", async () => {
    getUserWords.mockRejectedValue(new Error("nope"));
    const { store, rerender } = setup(EXEMPT, useEnsureUserListLoaded);
    await act(async () => {});
    rerender();
    await act(async () => {});
    expect(getUserWords).toHaveBeenCalledTimes(1);
    expect(store.getState().userWordList.status).toBe("failed");
  });

  it("does not load on a paired device", async () => {
    setup(PAIRED, useEnsureUserListLoaded);
    await act(async () => {});
    expect(getUserWords).not.toHaveBeenCalled();
  });
});
