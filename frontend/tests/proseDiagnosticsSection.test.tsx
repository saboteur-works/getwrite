import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import ProseDiagnosticsSection from "../components/Sidebar/ProseDiagnosticsSection";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { createTextResource } from "../src/lib/models/resource";
import type { ProseDiagnosticsSummary } from "../src/lib/api/prose-diagnostics";

const PROJECT_PATH = "/tmp/test-project";
const PROJECT_ID = "proj-diagnostics-1";

vi.mock("../src/lib/api/prose-diagnostics", () => ({
  getProseDiagnostics: vi.fn(),
}));

import { getProseDiagnostics } from "../src/lib/api/prose-diagnostics";

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
    vi.mocked(getProseDiagnostics).mockImplementation(
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
    vi.mocked(getProseDiagnostics).mockResolvedValue(summary);
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    expect(await screen.findByText(/dialogue ratio/i)).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(screen.getByText(/average sentence length/i)).toBeInTheDocument();
    expect(screen.getByText(/14\.2/)).toBeInTheDocument();
    expect(screen.getByText(/top repeated words/i)).toBeInTheDocument();
    expect(screen.getByText(/the \(40\)/)).toBeInTheDocument();
    expect(screen.getByText(/and \(22\)/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("shows an error state when the fetch throws", async () => {
    vi.mocked(getProseDiagnostics).mockRejectedValue(new Error("boom"));
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
    vi.mocked(getProseDiagnostics).mockResolvedValue({
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

  it("never renders any red-associated class or style (FR-6 no-red convention)", async () => {
    vi.mocked(getProseDiagnostics).mockResolvedValue({
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
});
