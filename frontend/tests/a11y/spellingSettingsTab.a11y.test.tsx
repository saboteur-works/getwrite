/**
 * axe-core checks for `SpellingSettingsTab` in its four story states (empty,
 * populated, load failed, remove failed). Spell-checker Task 49, FR-40, FR-41,
 * AC-17. Also asserts the section, each remove button and the list headings
 * by role and accessible name.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

vi.mock("../../src/lib/api/project-spelling", () => ({
  getSpellingLists: vi.fn(),
  addSpellingWord: vi.fn(),
  removeSpellingWord: vi.fn(),
  ignoreSpellingWord: vi.fn(),
  unignoreSpellingWord: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
  getEntityAliasTableOrThrow: vi.fn(),
}));

import spellingReducer, {
  fetchSpellingLists,
} from "../../src/store/spellingSlice";
import {
  getSpellingLists,
  unignoreSpellingWord,
} from "../../src/lib/api/project-spelling";
import SpellingSettingsTab from "../../components/Layout/SpellingSettingsTab";
import { runAxe } from "./helpers/axe";

const mGet = vi.mocked(getSpellingLists);
const mUnignore = vi.mocked(unignoreSpellingWord);

type Lists = { spellingProjectWords: string[]; spellingIgnoredWords: string[] };

async function renderTab(lists: Lists | Error): Promise<HTMLElement> {
  if (lists instanceof Error) mGet.mockRejectedValue(lists);
  else mGet.mockResolvedValue(lists);
  const store = configureStore({ reducer: { spelling: spellingReducer } });
  await store.dispatch(fetchSpellingLists("p1"));
  return render(
    <Provider store={store}>
      <main>
        <SpellingSettingsTab />
      </main>
    </Provider>,
  ).container;
}

beforeEach(() => {
  mGet.mockReset();
  mUnignore.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("SpellingSettingsTab a11y", () => {
  it("has no violations when both lists are empty", async () => {
    const container = await renderTab({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
    expect(screen.getByRole("region", { name: "Spelling" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Project dictionary (0)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Ignored words (0)" }),
    ).toBeVisible();
    await runAxe(container);
  });

  it("has no violations when populated", async () => {
    const container = await renderTab({
      spellingProjectWords: ["Aria", "Zed"],
      spellingIgnoredWords: ["teh"],
    });
    expect(screen.getByRole("region", { name: "Spelling" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Project dictionary (2)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Ignored words (1)" }),
    ).toBeVisible();
    expect(
      screen.getByRole("list", { name: "Project dictionary (2)" }),
    ).toBeVisible();
    for (const name of [
      "Remove Aria from project dictionary",
      "Remove Zed from project dictionary",
      "Remove teh from ignored words",
    ]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    await runAxe(container);
  });

  it("has no violations when the lists failed to load", async () => {
    const container = await renderTab(new Error("boom"));
    expect(screen.getByRole("region", { name: "Spelling" })).toBeVisible();
    expect(screen.getByText(/Could not load the spelling lists/)).toBeVisible();
    await runAxe(container);
  });

  it("has no violations after a failed remove shows its alert", async () => {
    mUnignore.mockRejectedValue(new Error("nope"));
    const container = await renderTab({
      spellingProjectWords: [],
      spellingIgnoredWords: ["teh"],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Remove teh from ignored words" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/teh/);
    expect(
      screen.getByRole("button", { name: "Remove teh from ignored words" }),
    ).toBeVisible();
    await runAxe(container);
  });
});
