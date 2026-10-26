/** @vitest-environment jsdom */
/**
 * axe-core checks for the editor-footer spell-check cue (Feature 96, Task 25,
 * spec FR-24): paused, notApplied and empty. Also the status role, the
 * button's accessible name and that the full reason is exposed as text.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";

vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import spellingReducer from "../../src/store/spellingSlice";
import availabilityReducer, {
  continueWithoutUserList,
  engineFailed,
  setUserListApplies,
} from "../../src/store/spellingAvailabilitySlice";
import userWordListReducer, {
  initialUserWordListState,
  loadUserList,
} from "../../src/store/userWordListSlice";
import { resetSpellcheckSessionValue } from "../../src/lib/spellcheck-preference";
import SpellCheckEditorCue from "../../components/WorkArea/SpellCheckEditorCue";
import { runAxe } from "./helpers/axe";

function makeStore() {
  const initial = spellingReducer(undefined, { type: "@@init" });
  return configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: availabilityReducer,
      userWordList: userWordListReducer,
    },
    preloadedState: {
      spelling: {
        ...initial,
        status: "loaded" as const,
        aliasTableStatus: "loaded" as const,
      },
      spellingAvailability: availabilityReducer(undefined, { type: "@@init" }),
      userWordList: initialUserWordListState,
    },
  });
}

function renderCue(store: ReturnType<typeof makeStore>): HTMLElement {
  return render(
    <Provider store={store}>
      <footer>
        <SpellCheckEditorCue />
      </footer>
    </Provider>,
  ).container;
}

beforeEach(() => {
  window.localStorage.clear();
  resetSpellcheckSessionValue();
});
afterEach(cleanup);

describe("SpellCheckEditorCue a11y", () => {
  it("has no violations when there is no cue", async () => {
    const container = renderCue(makeStore());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await runAxe(container);
  });

  it("has no violations when paused, and exposes the reason and the button", async () => {
    const store = makeStore();
    store.dispatch(engineFailed("worker crashed"));
    const container = renderCue(store);
    expect(screen.getByRole("status")).toHaveTextContent(
      "The spell checker stopped working (worker crashed).",
    );
    expect(
      screen.getByRole("button", { name: "Spell check settings" }),
    ).toBeVisible();
    await runAxe(container);
  });

  it("has no violations when user words are not applied", async () => {
    const store = makeStore();
    store.dispatch(
      loadUserList.rejected(null, "r", undefined, {
        reason: "read-failed",
        message: "x",
      }),
    );
    store.dispatch(setUserListApplies(true));
    store.dispatch(continueWithoutUserList());
    const container = renderCue(store);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your words aren't applied",
    );
    await runAxe(container);
  });
});
