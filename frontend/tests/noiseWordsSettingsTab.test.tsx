import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../src/lib/api/project-noise-words", () => ({
  getNoiseWordLists: vi.fn(),
  addCustomNoiseWord: vi.fn(),
  removeCustomNoiseWord: vi.fn(),
  excludeGlobalNoiseWord: vi.fn(),
  unexcludeGlobalNoiseWord: vi.fn(),
}));
vi.mock("../src/lib/api/global-noise-words", () => ({
  getGlobalNoiseWords: vi.fn(),
}));

import {
  getNoiseWordLists,
  addCustomNoiseWord,
  removeCustomNoiseWord,
  excludeGlobalNoiseWord,
  unexcludeGlobalNoiseWord,
} from "../src/lib/api/project-noise-words";
import { getGlobalNoiseWords } from "../src/lib/api/global-noise-words";
import NoiseWordsSettingsTab from "../components/Layout/NoiseWordsSettingsTab";

const mockGetLists = vi.mocked(getNoiseWordLists);
const mockAddCustom = vi.mocked(addCustomNoiseWord);
const mockRemoveCustom = vi.mocked(removeCustomNoiseWord);
const mockExcludeGlobal = vi.mocked(excludeGlobalNoiseWord);
const mockUnexcludeGlobal = vi.mocked(unexcludeGlobalNoiseWord);
const mockGetGlobal = vi.mocked(getGlobalNoiseWords);

beforeEach(() => {
  mockGetLists.mockReset();
  mockAddCustom.mockReset();
  mockRemoveCustom.mockReset();
  mockExcludeGlobal.mockReset();
  mockUnexcludeGlobal.mockReset();
  mockGetGlobal.mockReset();
  mockGetLists.mockResolvedValue({
    customNoiseWords: [],
    excludedGlobalNoiseWords: [],
  });
  mockGetGlobal.mockResolvedValue([]);
});

describe("NoiseWordsSettingsTab", () => {
  it("loads and shows the project's custom noise words and the global list", async () => {
    mockGetLists.mockResolvedValue({
      customNoiseWords: ["said"],
      excludedGlobalNoiseWords: [],
    });
    mockGetGlobal.mockResolvedValue(["the", "very"]);

    render(<NoiseWordsSettingsTab projectId="p1" />);

    expect(await screen.findByText("said")).toBeInTheDocument();
    expect(screen.getByText("the")).toBeInTheDocument();
    expect(screen.getByText("very")).toBeInTheDocument();
  });

  it("adds a custom noise word through the transport", async () => {
    mockAddCustom.mockResolvedValue({
      customNoiseWords: ["suddenly"],
      excludedGlobalNoiseWords: [],
    });

    render(<NoiseWordsSettingsTab projectId="p1" />);
    await waitFor(() => expect(mockGetLists).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Add a custom noise word"), {
      target: { value: "suddenly" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add word" }));

    await waitFor(() =>
      expect(mockAddCustom).toHaveBeenCalledWith("p1", "suddenly"),
    );
    expect(await screen.findByText("suddenly")).toBeInTheDocument();
  });

  it("removes a custom noise word through the transport", async () => {
    mockGetLists.mockResolvedValue({
      customNoiseWords: ["said"],
      excludedGlobalNoiseWords: [],
    });
    mockRemoveCustom.mockResolvedValue({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });

    render(<NoiseWordsSettingsTab projectId="p1" />);
    await screen.findByText("said");

    fireEvent.click(
      screen.getByRole("button", { name: "Remove custom noise word said" }),
    );

    await waitFor(() =>
      expect(mockRemoveCustom).toHaveBeenCalledWith("p1", "said"),
    );
    await waitFor(() => expect(screen.queryByText("said")).toBeNull());
  });

  it("excludes a global noise word for this project when checked", async () => {
    mockGetGlobal.mockResolvedValue(["the"]);
    mockExcludeGlobal.mockResolvedValue({
      customNoiseWords: [],
      excludedGlobalNoiseWords: ["the"],
    });

    render(<NoiseWordsSettingsTab projectId="p1" />);
    const checkbox = (await screen.findByLabelText(
      "Excluded in this project",
    )) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(mockExcludeGlobal).toHaveBeenCalledWith("p1", "the"),
    );
  });

  it("un-excludes a previously-excluded global noise word when unchecked", async () => {
    mockGetGlobal.mockResolvedValue(["the"]);
    mockGetLists.mockResolvedValue({
      customNoiseWords: [],
      excludedGlobalNoiseWords: ["the"],
    });
    mockUnexcludeGlobal.mockResolvedValue({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
    });

    render(<NoiseWordsSettingsTab projectId="p1" />);
    const checkbox = (await screen.findByLabelText(
      "Excluded in this project",
    )) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(mockUnexcludeGlobal).toHaveBeenCalledWith("p1", "the"),
    );
  });

  it("surfaces a failed load with an accessible error", async () => {
    mockGetLists.mockRejectedValue(new Error("boom"));

    render(<NoiseWordsSettingsTab projectId="p1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/boom|failed/i);
  });
});
