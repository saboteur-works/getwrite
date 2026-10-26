/**
 * Spell-checker Task 47 (FR-38, FR-39, AC-16): the Spelling tab shows the
 * project dictionary and the ignored words from the spelling slice.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
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
  fetchSpellingLists,
  selectSpellingLists,
} from "../src/store/spellingSlice";
import {
  getSpellingLists,
  removeSpellingWord,
  unignoreSpellingWord,
} from "../src/lib/api/project-spelling";
import SpellingSettingsTab from "../components/Layout/SpellingSettingsTab";

const mGet = vi.mocked(getSpellingLists);
const mRemove = vi.mocked(removeSpellingWord);
const mUnignore = vi.mocked(unignoreSpellingWord);

type Lists = { spellingProjectWords: string[]; spellingIgnoredWords: string[] };

async function renderTab(lists: Lists | Error) {
  if (lists instanceof Error) mGet.mockRejectedValue(lists);
  else mGet.mockResolvedValue(lists);
  const store = configureStore({ reducer: { spelling: spellingReducer } });
  await store.dispatch(fetchSpellingLists("p1"));
  render(
    <Provider store={store}>
      <SpellingSettingsTab />
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  mGet.mockReset();
  mRemove.mockReset();
  mUnignore.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const listOf = (name: string) =>
  screen.getByRole("list", { name: new RegExp(name) });

describe("SpellingSettingsTab", () => {
  it("shows both lists with counts and words sorted ignoring case", async () => {
    await renderTab({
      spellingProjectWords: ["Zed", "aria", "Bo"],
      spellingIgnoredWords: ["teh", "Adn"],
    });
    expect(
      screen.getByRole("heading", { name: /Project dictionary/ }),
    ).toHaveTextContent("3");
    expect(
      screen.getByRole("heading", { name: /Ignored words/ }),
    ).toHaveTextContent("2");
    const dict = within(listOf("Project dictionary")).getAllByRole("listitem");
    expect(dict.map((li: HTMLElement) => li.textContent)).toEqual([
      "aria",
      "Bo",
      "Zed",
    ]);
    const ign = within(listOf("Ignored words")).getAllByRole("listitem");
    expect(ign.map((li: HTMLElement) => li.textContent)).toEqual([
      "Adn",
      "teh",
    ]);
  });

  it("shows an empty-state sentence for each empty list", async () => {
    await renderTab({ spellingProjectWords: [], spellingIgnoredWords: [] });
    expect(
      screen.getByText("No words in the project dictionary."),
    ).toBeVisible();
    expect(screen.getByText("No ignored words.")).toBeVisible();
  });

  it("names each remove button with the word and the list", async () => {
    await renderTab({
      spellingProjectWords: ["Aria"],
      spellingIgnoredWords: ["teh"],
    });
    expect(
      screen.getByRole("button", { name: "Remove teh from ignored words" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Remove Aria from project dictionary",
      }),
    ).toBeInTheDocument();
  });

  it("removes from the response and updates the slice at once", async () => {
    mUnignore.mockResolvedValue({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
    const store = await renderTab({
      spellingProjectWords: [],
      spellingIgnoredWords: ["teh"],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove teh from ignored words" }),
    );
    expect(await screen.findByText("No ignored words.")).toBeVisible();
    expect(mUnignore).toHaveBeenCalledWith("p1", "teh");
    expect(selectSpellingLists(store.getState()).spellingIgnoredWords).toEqual(
      [],
    );
  });

  it("removes a project dictionary word through remove-word", async () => {
    mRemove.mockResolvedValue({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
    await renderTab({
      spellingProjectWords: ["Aria"],
      spellingIgnoredWords: [],
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Aria from project dictionary",
      }),
    );
    expect(
      await screen.findByText("No words in the project dictionary."),
    ).toBeVisible();
    expect(mRemove).toHaveBeenCalledWith("p1", "Aria");
  });

  it("shows a load-failed message and no empty-state sentence", async () => {
    await renderTab(new Error("boom"));
    expect(screen.getByText(/Could not load the spelling lists/)).toBeVisible();
    expect(screen.queryByText("No ignored words.")).toBeNull();
    expect(
      screen.queryByText("No words in the project dictionary."),
    ).toBeNull();
  });

  it("shows an inline alert and leaves the list unchanged on a failed remove", async () => {
    mUnignore.mockRejectedValue(new Error("nope"));
    await renderTab({
      spellingProjectWords: [],
      spellingIgnoredWords: ["teh", "zzz"],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove teh from ignored words" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/teh/);
    expect(
      within(listOf("Ignored words"))
        .getAllByRole("listitem")
        .map((li: HTMLElement) => li.textContent),
    ).toEqual(["teh", "zzz"]);
  });

  it("moves focus to the next word's remove button after removal", async () => {
    mUnignore.mockResolvedValue({
      spellingProjectWords: [],
      spellingIgnoredWords: ["b", "c"],
    });
    await renderTab({
      spellingProjectWords: [],
      spellingIgnoredWords: ["a", "b", "c"],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove a from ignored words" }),
    );
    await screen.findByText("b");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove b from ignored words" }),
      ).toHaveFocus(),
    );
  });

  it("moves focus to the previous word when the last is removed", async () => {
    mUnignore.mockResolvedValue({
      spellingProjectWords: [],
      spellingIgnoredWords: ["a", "b"],
    });
    await renderTab({
      spellingProjectWords: [],
      spellingIgnoredWords: ["a", "b", "c"],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove c from ignored words" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove b from ignored words" }),
      ).toHaveFocus(),
    );
  });

  it("moves focus to the list heading when the list becomes empty", async () => {
    mUnignore.mockResolvedValue({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
    await renderTab({ spellingProjectWords: [], spellingIgnoredWords: ["a"] });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove a from ignored words" }),
    );
    await screen.findByText("No ignored words.");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Ignored words/ }),
      ).toHaveFocus(),
    );
  });

  it("uses native buttons so every control is keyboard operable", async () => {
    await renderTab({
      spellingProjectWords: ["Aria"],
      spellingIgnoredWords: ["teh"],
    });
    for (const b of screen.getAllByRole("button")) {
      expect(b.tagName).toBe("BUTTON");
      expect(b).not.toHaveAttribute("tabindex", "-1");
    }
  });
});
