import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { runAxe } from "./helpers/axe";
import WordCountGoalSection from "../../components/Sidebar/WordCountGoalSection";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";

vi.mock("../../src/lib/api/resources", () => ({
  updateSidecar: vi.fn().mockResolvedValue(undefined),
}));

import { updateSidecar } from "../../src/lib/api/resources";

const PROJECT_ID = "proj-word-goal-a11y";

function setupStore(resource: AnyResource) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Test Project",
      rootPath: `/tmp/${PROJECT_ID}`,
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setResources([resource]));
  store.dispatch(setSelectedResourceId(resource.id));
  return store;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("a11y: WordCountGoalSection", () => {
  it("axe passes with no goal set (empty)", async () => {
    const res = createTextResource({ name: "Chapter One" });
    const store = setupStore(res);
    const { container } = render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );
    await runAxe(container);
  });

  it("axe passes with a saved goal (filled)", async () => {
    const res = createTextResource({ name: "Chapter One" });
    Object.assign(res, { wordCountGoal: 2000 });
    const store = setupStore(res);
    const { container } = render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );
    await runAxe(container);
  });

  it("axe passes with a client-side validation error shown", async () => {
    const res = createTextResource({ name: "Chapter One" });
    const store = setupStore(res);
    const { container } = render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    fireEvent.change(screen.getByLabelText("word-count-goal-input"), {
      target: { value: "-5" },
    });
    await screen.findByRole("alert");
    expect(updateSidecar).not.toHaveBeenCalled();
    await runAxe(container);
  });

  it("axe passes with the progress bar rendered", async () => {
    const res = createTextResource({ name: "Chapter One" });
    Object.assign(res, {
      wordCountGoal: 2000,
      userMetadata: { wordCount: 1234 },
    });
    const store = setupStore(res);
    const { container } = render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );
    await waitFor(() => {
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });
    await runAxe(container);
  });
});
