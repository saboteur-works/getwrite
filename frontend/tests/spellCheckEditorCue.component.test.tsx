/** @vitest-environment jsdom */
/**
 * Feature 96, Task 25 (spec FR-24): the editor-footer cue about the spell
 * checker, its "Spell check settings" action, and the request that opens the
 * one App Settings dialog.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import { configureStore } from "@reduxjs/toolkit";
import spellingReducer from "../src/store/spellingSlice";
import userWordListReducer, {
  initialUserWordListState,
  loadUserList,
} from "../src/store/userWordListSlice";
import {
  continueWithoutUserList,
  engineFailed,
  setUserListApplies,
} from "../src/store/spellingAvailabilitySlice";
import availabilityReducer from "../src/store/spellingAvailabilitySlice";
import {
  SPELLCHECK_ENABLED_STORAGE_KEY,
  resetSpellcheckSessionValue,
} from "../src/lib/spellcheck-preference";
import {
  OPEN_APP_SETTINGS_EVENT,
  requestOpenAppSettings,
} from "../src/lib/app-settings-open";
import { useAppSettingsOpenRequests } from "../src/hooks/useAppSettingsOpenRequests";
import SpellCheckEditorCue from "../components/WorkArea/SpellCheckEditorCue";

type TestStore = ReturnType<typeof healthyStore>;

function createStore(loaded: boolean) {
  const initial = spellingReducer(undefined, { type: "@@init" });
  return configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: availabilityReducer,
      userWordList: userWordListReducer,
    },
    preloadedState: {
      spelling: loaded
        ? {
            ...initial,
            status: "loaded" as const,
            aliasTableStatus: "loaded" as const,
          }
        : initial,
      spellingAvailability: availabilityReducer(undefined, { type: "@@init" }),
      userWordList: initialUserWordListState,
    },
  });
}

function healthyStore() {
  return createStore(true);
}

function renderCue(store: TestStore) {
  return render(
    <Provider store={store}>
      <SpellCheckEditorCue />
    </Provider>,
  );
}

beforeEach(() => {
  resetSpellcheckSessionValue();
  window.localStorage.removeItem(SPELLCHECK_ENABLED_STORAGE_KEY);
});
afterEach(() => {
  cleanup();
  resetSpellcheckSessionValue();
  window.localStorage.removeItem(SPELLCHECK_ENABLED_STORAGE_KEY);
});

describe("SpellCheckEditorCue", () => {
  it("shows nothing when the checker is active", () => {
    const store = healthyStore();
    renderCue(store);
    expect(screen.queryByText(/spell check paused/i)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("shows nothing while the checker is only loading", () => {
    renderCue(createStore(false));
    expect(screen.queryByText(/spell check paused/i)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows nothing with the switch off, even when the engine failed", () => {
    window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
    const store = healthyStore();
    store.dispatch(engineFailed("worker crashed"));
    renderCue(store);
    expect(screen.queryByText(/spell check paused/i)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("when paused, shows short text with the full reason in the status and a settings button", () => {
    const store = healthyStore();
    store.dispatch(engineFailed("worker crashed"));
    renderCue(store);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Spell check paused");
    expect(status).toHaveTextContent(
      "The spell checker stopped working (worker crashed).",
    );
    expect(
      screen.getByRole("button", { name: "Spell check settings" }),
    ).toBeInTheDocument();
  });

  it("the settings button requests App Settings", () => {
    const store = healthyStore();
    store.dispatch(engineFailed("x"));
    const onRequest = vi.fn();
    window.addEventListener(OPEN_APP_SETTINGS_EVENT, onRequest);
    renderCue(store);
    fireEvent.click(
      screen.getByRole("button", { name: "Spell check settings" }),
    );
    window.removeEventListener(OPEN_APP_SETTINGS_EVENT, onRequest);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it("shows the quieter notApplied text after Continue without my dictionary", () => {
    const store = healthyStore();
    store.dispatch(
      loadUserList.rejected(null, "r", undefined, {
        reason: "read-failed",
        message: "x",
      }),
    );
    store.dispatch(setUserListApplies(true));
    store.dispatch(continueWithoutUserList());
    renderCue(store);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your words aren't applied",
    );
    expect(screen.queryByText(/spell check paused/i)).toBeNull();
  });

  it("follows the store: appears when the engine fails and goes when it clears", async () => {
    const store = healthyStore();
    renderCue(store);
    expect(screen.queryByText(/spell check paused/i)).toBeNull();
    store.dispatch(engineFailed("late"));
    expect(await screen.findByText(/spell check paused/i)).toBeInTheDocument();
  });
});

describe("requestOpenAppSettings and useAppSettingsOpenRequests", () => {
  it("calls the handler once per request and stops after unmount", () => {
    const onOpen = vi.fn();
    const { unmount } = renderHook(() => useAppSettingsOpenRequests(onOpen));
    requestOpenAppSettings();
    expect(onOpen).toHaveBeenCalledTimes(1);
    unmount();
    requestOpenAppSettings();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
