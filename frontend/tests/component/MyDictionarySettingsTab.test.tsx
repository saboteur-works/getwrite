/**
 * "My dictionary" App Settings section (Feature 96, Task 16; FR-5, FR-8,
 * FR-11, FR-21, FR-23). The transport is mocked; the real store, slice and
 * lazy-load hook are used.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import MyDictionarySettingsTab from "../../components/Layout/MyDictionarySettingsTab";
import {
  continueWithoutUserList,
  setUserListApplies,
} from "../../src/store/spellingAvailabilitySlice";
import { makeStore } from "../../src/store/store";
import { UserWordListTransportError } from "../../src/lib/api/user-word-list";

const mocks = vi.hoisted(() => ({
  role: { state: "exempt" } as { state: string },
  getUserWords: vi.fn(),
  addUserWord: vi.fn(),
  removeUserWord: vi.fn(),
}));

vi.mock("../../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({ state: mocks.role }),
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

function renderSection(): void {
  render(
    <Provider store={makeStore()}>
      <MyDictionarySettingsTab />
    </Provider>,
  );
}

beforeEach(() => {
  mocks.role = { state: "exempt" };
  mocks.getUserWords.mockReset();
  mocks.addUserWord.mockReset();
  mocks.removeUserWord.mockReset();
});
afterEach(cleanup);

describe("MyDictionarySettingsTab", () => {
  it("shows the count and the words sorted ignoring case", async () => {
    mocks.getUserWords.mockResolvedValue(["zebra", "Apple", "mango"]);
    renderSection();
    expect(
      await screen.findByRole("heading", { name: /My dictionary \(3\)/ }),
    ).toBeTruthy();
    const items = screen
      .getAllByRole("listitem")
      .map((li: HTMLElement) => li.textContent);
    expect(items).toEqual(["Apple", "mango", "zebra"]);
  });

  it("opening the section triggers the lazy load", async () => {
    mocks.getUserWords.mockResolvedValue([]);
    renderSection();
    await waitFor(() => expect(mocks.getUserWords).toHaveBeenCalledTimes(1));
  });

  it("shows an empty-state sentence for a loaded empty list", async () => {
    mocks.getUserWords.mockResolvedValue([]);
    renderSection();
    expect(await screen.findByText(/No words in your dictionary/)).toBeTruthy();
  });

  it("gives each remove button an accessible name that includes the word", async () => {
    mocks.getUserWords.mockResolvedValue(["alpha", "beta"]);
    renderSection();
    expect(
      await screen.findByRole("button", { name: /Remove alpha/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove beta/ })).toBeTruthy();
  });

  it("moves focus to the next word's remove button after removal", async () => {
    mocks.getUserWords.mockResolvedValue(["a", "b", "c"]);
    mocks.removeUserWord.mockResolvedValue(["a", "c"]);
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: /Remove b / }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /Remove c / }),
      ),
    );
  });

  it("moves focus to the previous word's remove button when the last is removed", async () => {
    mocks.getUserWords.mockResolvedValue(["a", "b"]);
    mocks.removeUserWord.mockResolvedValue(["a"]);
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole("button", { name: /Remove b / }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: /Remove a / }),
      ),
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
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: /My dictionary/ }),
      ),
    );
  });

  it("shows an error and keeps the word when a removal fails", async () => {
    mocks.getUserWords.mockResolvedValue(["keep"]);
    mocks.removeUserWord.mockRejectedValue(
      new UserWordListTransportError("io", "disk full"),
    );
    const user = userEvent.setup();
    renderSection();
    await user.click(
      await screen.findByRole("button", { name: /Remove keep / }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("keep");
    expect(alert.textContent).toContain("disk full");
    expect(screen.getByRole("button", { name: /Remove keep / })).toBeTruthy();
  });

  it("adds a word, shows the returned list and clears the field", async () => {
    mocks.getUserWords.mockResolvedValue(["b"]);
    mocks.addUserWord.mockResolvedValue(["a", "b"]);
    const user = userEvent.setup();
    renderSection();
    const input = await screen.findByLabelText(/Add a word/);
    await user.type(input, "a");
    await user.click(screen.getByRole("button", { name: "Add word" }));
    expect(
      await screen.findByRole("button", { name: /Remove a / }),
    ).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("");
    expect(mocks.addUserWord).toHaveBeenCalledWith("a");
  });

  it("shows an error and keeps the typed word when an add fails", async () => {
    mocks.getUserWords.mockResolvedValue([]);
    mocks.addUserWord.mockRejectedValue(
      new UserWordListTransportError("list-full", "The list is full."),
    );
    const user = userEvent.setup();
    renderSection();
    const input = await screen.findByLabelText(/Add a word/);
    await user.type(input, "word");
    await user.click(screen.getByRole("button", { name: "Add word" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The list is full.",
    );
    expect((input as HTMLInputElement).value).toBe("word");
  });

  it("renders its title as a level-3 heading like the sibling sections", async () => {
    mocks.getUserWords.mockResolvedValue([]);
    renderSection();
    expect(
      await screen.findByRole("heading", { level: 3, name: /My dictionary/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("shows a failed read in plain words with Retry, never the empty state", async () => {
    mocks.getUserWords.mockRejectedValueOnce(
      new UserWordListTransportError(
        "corrupt",
        "The user word list is not valid JSON. Refusing to treat a corrupt file as an empty list.",
      ),
    );
    mocks.getUserWords.mockResolvedValueOnce(["back"]);
    const user = userEvent.setup();
    renderSection();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Its file is damaged and couldn't be read.",
    );
    expect(alert.textContent).not.toMatch(/corrupt|JSON|Refusing/);
    expect(screen.queryByText(/No words in your dictionary/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", { name: /Remove back / }),
    ).toBeTruthy();
  });

  it("falls back to a generic plain sentence for an unknown reason", async () => {
    mocks.getUserWords.mockRejectedValueOnce(new Error("disk gone"));
    renderSection();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Something went wrong while reading it.",
    );
    expect(alert.textContent).not.toContain("disk gone");
  });

  it("keeps its own Retry when the Spell check line is not showing the failure", async () => {
    mocks.getUserWords.mockRejectedValue(new Error("disk gone"));
    const store = makeStore();
    store.dispatch(setUserListApplies(true));
    render(
      <Provider store={store}>
        <MyDictionarySettingsTab withSpellCheckSection />
      </Provider>,
    );
    await waitFor(() =>
      expect(store.getState().userWordList.status).toBe("failed"),
    );
    store.dispatch(continueWithoutUserList());
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("with the failure shown elsewhere, says so briefly and offers no second Retry", async () => {
    mocks.getUserWords.mockRejectedValue(
      new UserWordListTransportError("corrupt", "File is corrupt."),
    );
    const store = makeStore();
    store.dispatch(setUserListApplies(true));
    render(
      <Provider store={store}>
        <MyDictionarySettingsTab withSpellCheckSection />
      </Provider>,
    );
    expect(
      await screen.findByText(
        "Your words can't be shown until your dictionary loads.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText(/No words in your dictionary/)).toBeNull();
  });

  it("works when the spelling switch is off", async () => {
    window.localStorage.setItem("getwrite-spellcheck-enabled", "false");
    mocks.getUserWords.mockResolvedValue(["x"]);
    renderSection();
    expect(
      await screen.findByRole("button", { name: /Remove x / }),
    ).toBeTruthy();
    window.localStorage.removeItem("getwrite-spellcheck-enabled");
  });

  it("has no add path, no list and no read for a paired device", async () => {
    mocks.role = { state: "paired" };
    renderSection();
    expect(
      await screen.findByText(/not available on this device/),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/Add a word/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Add word" })).toBeNull();
    expect(mocks.getUserWords).not.toHaveBeenCalled();
  });

  it("does not offer or read anything while the role is unknown", () => {
    mocks.role = { state: "unknown" };
    renderSection();
    expect(screen.queryByLabelText(/Add a word/)).toBeNull();
    expect(mocks.getUserWords).not.toHaveBeenCalled();
  });
});
