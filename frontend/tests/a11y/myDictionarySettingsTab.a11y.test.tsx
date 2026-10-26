/** @vitest-environment jsdom */
/**
 * axe-core and focus checks for the user word list in App Settings (Feature
 * 96, Task 20, FR-9): the "My dictionary" section in its empty, populated,
 * load-failed, remove-failed and paired states, and the `SpellcheckSetting`
 * failed-read status line and persistent "not applied" notice. The transport
 * is mocked; the real store, slice and hooks run. The focus rule after a
 * removal (next word, else previous, else the heading) is asserted here too.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";

vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  getUserWords: vi.fn(),
  addUserWord: vi.fn(),
  removeUserWord: vi.fn(),
}));

vi.mock("../../src/lib/api/user-word-list", async (importActual) => {
  const actual =
    await importActual<typeof import("../../src/lib/api/user-word-list")>();
  return {
    ...actual,
    getUserWords: mocks.getUserWords,
    addUserWord: mocks.addUserWord,
    removeUserWord: mocks.removeUserWord,
  };
});

import MyDictionarySettingsTab from "../../components/Layout/MyDictionarySettingsTab";
import SpellcheckSetting from "../../components/AppSettings/SpellcheckSetting";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import { makeStore } from "../../src/store/store";
import { UserWordListTransportError } from "../../src/lib/api/user-word-list";
import spellingReducer, {
  type SpellingState,
} from "../../src/store/spellingSlice";
import availabilityReducer, {
  continueWithoutUserList,
  setUserListApplies,
} from "../../src/store/spellingAvailabilitySlice";
import userWordListReducer, {
  loadUserList,
} from "../../src/store/userWordListSlice";
import { resetSpellcheckSessionValue } from "../../src/lib/spellcheck-preference";
import { runAxe } from "./helpers/axe";

const PAIRED_ROLE = {
  state: {
    state: "paired" as const,
    limits: {
      projectDeletion: true,
      unlocking: true,
      locking: true,
      encryptionChanges: true,
      permanentDeletion: true,
    },
  },
};

function renderSection(role?: "paired"): HTMLElement {
  return render(
    <StaticSharingLimitsProvider
      value={role === "paired" ? PAIRED_ROLE : undefined}
    >
      <Provider store={makeStore()}>
        <main>
          <MyDictionarySettingsTab />
        </main>
      </Provider>
    </StaticSharingLimitsProvider>,
  ).container;
}

beforeEach(() => {
  window.localStorage.clear();
  resetSpellcheckSessionValue();
  mocks.getUserWords.mockReset();
  mocks.addUserWord.mockReset();
  mocks.removeUserWord.mockReset();
});
afterEach(cleanup);

describe("MyDictionarySettingsTab a11y", () => {
  it("has no violations when empty, and the empty sentence is shown", async () => {
    mocks.getUserWords.mockResolvedValue([]);
    const container = renderSection();
    await screen.findByText(/No words in your dictionary/);
    expect(
      screen.getByRole("heading", { level: 2, name: "My dictionary (0)" }),
    ).toBeTruthy();
    await runAxe(container);
  });

  it("has no violations when populated, with a named remove button per word", async () => {
    mocks.getUserWords.mockResolvedValue(["zebra", "Apple", "mango"]);
    const container = renderSection();
    await screen.findByRole("button", {
      name: "Remove Apple from my dictionary",
    });
    expect(screen.getByRole("list", { name: /My dictionary/ })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByLabelText("Add a word")).toBeTruthy();
    await runAxe(container);
  });

  it("has no violations when the load failed, and the reason and Retry are exposed", async () => {
    mocks.getUserWords.mockRejectedValue(
      new UserWordListTransportError("corrupt", "File is corrupt."),
    );
    const container = renderSection();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("File is corrupt.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    await runAxe(container);
  });

  it("has no violations when a removal failed, and the alert names the word", async () => {
    mocks.getUserWords.mockResolvedValue(["keep"]);
    mocks.removeUserWord.mockRejectedValue(
      new UserWordListTransportError("io", "disk full"),
    );
    const user = userEvent.setup();
    const container = renderSection();
    await user.click(
      await screen.findByRole("button", { name: /Remove keep / }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("keep");
    expect(alert).toHaveTextContent("disk full");
    await runAxe(container);
  });

  it("has no violations on a paired device, where the note replaces the list", async () => {
    const container = renderSection("paired");
    await screen.findByText(/not available on this device/);
    expect(screen.queryByLabelText("Add a word")).toBeNull();
    await runAxe(container);
  });
});

describe("MyDictionarySettingsTab focus after removal", () => {
  it("moves focus to the next word's remove button", async () => {
    mocks.getUserWords.mockResolvedValue(["a", "b", "c"]);
    mocks.removeUserWord.mockResolvedValue(["a", "c"]);
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: /Remove b / }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Remove c / })).toHaveFocus(),
    );
  });

  it("moves focus to the previous word's remove button when the last word is removed", async () => {
    mocks.getUserWords.mockResolvedValue(["a", "b", "c"]);
    mocks.removeUserWord.mockResolvedValue(["a", "b"]);
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: /Remove c / }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Remove b / })).toHaveFocus(),
    );
  });

  it("moves focus to the section heading when the only word is removed", async () => {
    mocks.getUserWords.mockResolvedValue(["solo"]);
    mocks.removeUserWord.mockResolvedValue([]);
    const user = userEvent.setup();
    renderSection();
    await user.click(
      await screen.findByRole("button", { name: /Remove solo / }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: /My dictionary/ }),
      ).toHaveFocus(),
    );
  });
});

describe("SpellcheckSetting user-list states a11y", () => {
  type SpellStore = ReturnType<typeof makeSpellStore>;

  function makeSpellStore() {
    const initial = spellingReducer(undefined, { type: "@@init" });
    const loaded: SpellingState = {
      ...initial,
      status: "loaded",
      aliasTableStatus: "loaded",
    };
    return configureStore({
      reducer: {
        spelling: spellingReducer,
        spellingAvailability: availabilityReducer,
        userWordList: userWordListReducer,
      },
      preloadedState: {
        spelling: loaded,
        spellingAvailability: availabilityReducer(undefined, {
          type: "@@init",
        }),
        userWordList: userWordListReducer(undefined, { type: "@@init" }),
      },
    });
  }

  function failRead(store: SpellStore): void {
    store.dispatch(setUserListApplies(true));
    store.dispatch(
      loadUserList.rejected(new Error("unreadable"), "request-1", undefined, {
        reason: "unreadable",
        message: "The word list file could not be read.",
      }),
    );
  }

  function renderRow(configure: (store: SpellStore) => void): HTMLElement {
    const store = makeSpellStore();
    configure(store);
    return render(
      <Provider store={store}>
        <main>
          <SpellcheckSetting />
        </main>
      </Provider>,
    ).container;
  }

  it("has no violations on the failed-read status line with Retry and Continue", async () => {
    const container = renderRow(failRead);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your dictionary could not be loaded",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue without my dictionary" }),
    ).toBeTruthy();
    await runAxe(container);
  });

  it("has no violations on the persistent not-applied notice", async () => {
    const container = renderRow((store) => {
      failRead(store);
      store.dispatch(continueWithoutUserList());
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your own words are not being applied.",
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    await runAxe(container);
  });
});
