import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { runAxe } from "./helpers/axe";
import ProseDiagnosticsSection from "../../components/Sidebar/ProseDiagnosticsSection";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { ProseDiagnosticsSummary } from "../../src/lib/api/prose-diagnostics";

vi.mock("../../src/lib/api/prose-diagnostics", () => ({
  getProseDiagnosticsOrThrow: vi.fn(),
}));

import { getProseDiagnosticsOrThrow } from "../../src/lib/api/prose-diagnostics";

const PROJECT_ID = "proj-diagnostics-a11y";
const PROJECT_PATH = "/tmp/proj-diagnostics-a11y";

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

describe("a11y: ProseDiagnosticsSection", () => {
  it("axe passes in the loading state", async () => {
    vi.mocked(getProseDiagnosticsOrThrow).mockImplementation(
      () => new Promise(() => {}),
    );
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    const { container } = render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    await screen.findByRole("status");
    await runAxe(container);
  });

  it("axe passes in the ready state", async () => {
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

    const { container } = render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    await screen.findByText(/dialogue ratio/i);
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    await runAxe(container);
  });

  it("axe passes in the error state", async () => {
    vi.mocked(getProseDiagnosticsOrThrow).mockRejectedValue(new Error("boom"));
    const resource = createTextResource({ name: "Chapter One" });
    const store = setupStore();

    const { container } = render(
      <Provider store={store}>
        <ProseDiagnosticsSection resource={resource} />
      </Provider>,
    );

    await screen.findByRole("alert");
    await runAxe(container);
  });
});
