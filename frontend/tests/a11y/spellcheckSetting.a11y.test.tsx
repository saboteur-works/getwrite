/** @vitest-environment jsdom */
/**
 * axe-core checks for `SpellcheckSetting` in its on, off and unavailable
 * states. Spell-checker Task 46, FR-40, FR-41, AC-17. Also asserts the switch
 * by role and accessible name and the status line by role.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";

vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import spellingReducer, {
  type SpellingState,
} from "../../src/store/spellingSlice";
import availabilityReducer, {
  engineFailed,
} from "../../src/store/spellingAvailabilitySlice";
import {
  SPELLCHECK_ENABLED_STORAGE_KEY,
  resetSpellcheckSessionValue,
} from "../../src/lib/spellcheck-preference";
import SpellcheckSetting from "../../components/AppSettings/SpellcheckSetting";
import { runAxe } from "./helpers/axe";

function makeStore(options: { engineFailure?: string }) {
  const initial = spellingReducer(undefined, { type: "@@init" });
  const loaded: SpellingState = {
    ...initial,
    status: "loaded",
    aliasTableStatus: "loaded",
  };
  const store = configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: availabilityReducer,
    },
    preloadedState: {
      spelling: loaded,
      spellingAvailability: availabilityReducer(undefined, { type: "@@init" }),
    },
  });
  if (options.engineFailure !== undefined) {
    store.dispatch(engineFailed(options.engineFailure));
  }
  return store;
}

function renderRow(options: { engineFailure?: string } = {}): HTMLElement {
  return render(
    <Provider store={makeStore(options)}>
      <main>
        <SpellcheckSetting />
      </main>
    </Provider>,
  ).container;
}

const SWITCH_NAME = "Check spelling while I write";

beforeEach(() => {
  window.localStorage.clear();
  resetSpellcheckSessionValue();
});
afterEach(cleanup);

describe("SpellcheckSetting a11y", () => {
  it("has no violations when on, and the switch is checked", async () => {
    const container = renderRow();
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeChecked();
    expect(screen.queryByRole("status")).toBeNull();
    await runAxe(container);
  });

  it("has no violations when off, and the switch is unchecked", async () => {
    window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
    const container = renderRow();
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).not.toBeChecked();
    await runAxe(container);
  });

  it("has no violations when unavailable, and the status line gives the reason", async () => {
    const container = renderRow({ engineFailure: "worker crashed" });
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(
      "The spell checker stopped working (worker crashed).",
    );
    await runAxe(container);
  });
});
