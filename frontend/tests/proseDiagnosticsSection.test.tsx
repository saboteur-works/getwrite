import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import ProseDiagnosticsSection from "../components/Sidebar/ProseDiagnosticsSection";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { createTextResource } from "../src/lib/models/resource";
import type { ProseDiagnosticsSummary } from "../src/lib/api/prose-diagnostics";
import userEvent from "@testing-library/user-event";
import {
  getDialogueHighlightSettings,
  resetDialogueHighlightSettings,
} from "../components/Editor/dialogue-highlight-store";

const PROJECT_PATH = "/tmp/test-project";
const PROJECT_ID = "proj-diagnostics-1";

vi.mock("../src/lib/api/prose-diagnostics", () => ({
  getProseDiagnosticsOrThrow: vi.fn(),
}));

import { getProseDiagnosticsOrThrow } from "../src/lib/api/prose-diagnostics";

function setupStore() {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Test Project",
      rootPath: PROJECT_PATH,
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProseDiagnosticsSection", () => {
  it("shows a loading state on mount, before the fetch resolves", () => {
    vi.mocked(getProseDiagnosticsOrThrow).mockImplementation(
      () => new Promise(() => {}),
    );
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("shows the three metrics once the fetch resolves", async () => {
    const summary: ProseDiagnosticsSummary = {
      dialogueRatio: 0.25,
      averageSentenceLength: 14.2,
      topRepeatedWords: [
        { word: "the", count: 40 },
        { word: "and", count: 22 },
      ],
    };
    vi.mocked(getProseDiagnosticsOrThrow).mockResolvedValue(summary);
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    // Each figure is laid out like the other sidebar fields: the label above
    // its value (LabeledField), not "Label: value" run together in one line.
    const ratio = await screen.findByRole("group", { name: "Dialogue ratio" });
    expect(within(ratio).getByText("25%")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("group", { name: "Average sentence length" }),
      ).getByText(/14\.2/),
    ).toBeInTheDocument();
    const words = screen.getByRole("group", { name: "Top repeated words" });
    expect(within(words).getByText(/the \(40\)/)).toBeInTheDocument();
    expect(within(words).getByText(/and \(22\)/)).toBeInTheDocument();
    expect(screen.queryByText(/dialogue ratio:/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("shows an error state when the fetch throws", async () => {
    vi.mocked(getProseDiagnosticsOrThrow).mockRejectedValue(new Error("boom"));
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't load/i,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders a show-detail button in every state", async () => {
    vi.mocked(getProseDiagnosticsOrThrow).mockResolvedValue({
      dialogueRatio: 0,
      averageSentenceLength: 0,
      topRepeatedWords: [],
    });
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    expect(
      await screen.findByRole("button", { name: /show detail/i }),
    ).toBeInTheDocument();
  });

  it("refetches and re-renders when the same resource's updatedAt changes (post-save refresh)", async () => {
    const firstSummary: ProseDiagnosticsSummary = {
      dialogueRatio: 0.25,
      averageSentenceLength: 14.2,
      topRepeatedWords: [{ word: "the", count: 40 }],
    };
    const secondSummary: ProseDiagnosticsSummary = {
      dialogueRatio: 0.5,
      averageSentenceLength: 9.1,
      topRepeatedWords: [{ word: "she", count: 12 }],
    };
    vi.mocked(getProseDiagnosticsOrThrow).mockClear();
    vi.mocked(getProseDiagnosticsOrThrow)
      .mockResolvedValueOnce(firstSummary)
      .mockResolvedValueOnce(secondSummary);
    const resource = {
      ...createTextResource({ name: "Chapter One" }),
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const store = setupStore();

    const { rerender } = render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    expect(await screen.findByText(/the \(40\)/)).toBeInTheDocument();
    expect(getProseDiagnosticsOrThrow).toHaveBeenCalledTimes(1);

    const savedResource = {
      ...resource,
      updatedAt: "2026-01-01T00:05:00.000Z",
    };

    rerender(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={savedResource} />
      </Provider>,
    );

    expect(await screen.findByText(/she \(12\)/)).toBeInTheDocument();
    expect(getProseDiagnosticsOrThrow).toHaveBeenCalledTimes(2);
  });

  it("never renders any red-associated class or style (FR-6 no-red convention)", async () => {
    vi.mocked(getProseDiagnosticsOrThrow).mockResolvedValue({
      dialogueRatio: 0.5,
      averageSentenceLength: 10,
      topRepeatedWords: [{ word: "a", count: 3 }],
    });
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    const { container } = render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    await screen.findByText(/dialogue ratio/i);

    expect(container.innerHTML).not.toMatch(/red/i);
    expect(container.innerHTML).not.toMatch(/#D44040/i);
  });

  // -------------------------------------------------------------------------
  // Task 14 (FR-4/FR-7): a degraded/failed read must render distinguishably
  // from a genuinely empty (zero-metrics) result — both from each other and
  // from the ready-with-real-numbers case above. The component now calls
  // `getProseDiagnosticsOrThrow`, which rejects rather than degrading, so its
  // existing catch->error-state path is exercised directly.
  // -------------------------------------------------------------------------
  it("renders a distinguishable error state (role alert) when the read fails, not the zero-metrics ready state", async () => {
    vi.mocked(getProseDiagnosticsOrThrow).mockRejectedValue(
      new Error("Failed to load diagnostics (status 401)."),
    );
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load/i);
    // Not the ready state's zero-metrics rendering.
    expect(
      screen.queryByRole("group", { name: "Dialogue ratio" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the ready state (not an alert) for a genuinely empty resource with all-zero metrics", async () => {
    vi.mocked(getProseDiagnosticsOrThrow).mockResolvedValue({
      dialogueRatio: 0,
      averageSentenceLength: 0,
      topRepeatedWords: [],
    });
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    expect(
      within(
        await screen.findByRole("group", { name: "Dialogue ratio" }),
      ).getByText("0%"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("group", { name: "Top repeated words" }),
      ).getByText("None"),
    ).toBeInTheDocument();
    // Distinguishable from the error state: no alert role anywhere.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("dialogue highlight controls", () => {
    function renderSection() {
      vi.mocked(getProseDiagnosticsOrThrow).mockImplementation(
        () => new Promise(() => {}),
      );
      render(
        <Provider store={setupStore()}>
          <ProseDiagnosticsSection
            resource={createTextResource({ name: "Chapter One" })}
          />
        </Provider>,
      );
    }

    afterEach(() => resetDialogueHighlightSettings());

    it("starts off, with double quotes chosen", () => {
      renderSection();

      expect(
        screen.getByRole("switch", { name: "Highlight dialogue" }),
      ).not.toBeChecked();
      expect(screen.getByRole("radio", { name: /Double/ })).toBeChecked();
    });

    it("turns the highlight on for this window", async () => {
      renderSection();

      await userEvent.click(
        screen.getByRole("switch", { name: "Highlight dialogue" }),
      );

      expect(getDialogueHighlightSettings().isEnabled).toBe(true);
      expect(
        screen.getByRole("switch", { name: "Highlight dialogue" }),
      ).toBeChecked();
    });

    it("switches the highlight to single quotes", async () => {
      renderSection();

      await userEvent.click(screen.getByRole("radio", { name: /Single/ }));

      expect(getDialogueHighlightSettings().quoteStyle).toBe("single");
    });

    it("says the ratio still counts double quotes", () => {
      renderSection();

      expect(
        screen.getByText(/The dialogue ratio counts double quotes/),
      ).toBeInTheDocument();
    });
  });
});
