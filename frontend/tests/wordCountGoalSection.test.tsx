import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import WordCountGoalSection from "../components/Sidebar/WordCountGoalSection";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import {
  createTextResource,
  createImageResource,
  createAudioResource,
} from "../src/lib/models/resource";
import type { AnyResource } from "../src/lib/models/types";

vi.mock("../src/lib/api/resources", () => ({
  updateSidecar: vi.fn().mockResolvedValue(undefined),
}));

import { updateSidecar } from "../src/lib/api/resources";

const PROJECT_ID = "proj-word-goal-1";

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

describe("WordCountGoalSection", () => {
  it("renders for a text resource", () => {
    const res = createTextResource({ name: "Chapter One" });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    expect(screen.getByLabelText("word-count-goal-input")).toBeInTheDocument();
  });

  it("does not render for an image resource", () => {
    const res = createImageResource({ name: "Cover" });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    expect(
      screen.queryByLabelText("word-count-goal-input"),
    ).not.toBeInTheDocument();
  });

  it("does not render for an audio resource", () => {
    const res = createAudioResource({ name: "Theme" });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    expect(
      screen.queryByLabelText("word-count-goal-input"),
    ).not.toBeInTheDocument();
  });

  it("clearing the input persists via clearKeys, with no wordCountGoal key in the body at all", async () => {
    const res = createTextResource({ name: "Chapter One" });
    Object.assign(res, { wordCountGoal: 1500 });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    const input = screen.getByLabelText(
      "word-count-goal-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });

    await waitFor(() => {
      expect(updateSidecar).toHaveBeenCalled();
    });

    const [resourceId, projectId, updatedResource, clearKeys] = (
      updateSidecar as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.at(-1)!;

    expect(resourceId).toBe(res.id);
    expect(projectId).toBe(PROJECT_ID);
    expect(clearKeys).toEqual(["wordCountGoal"]);
    expect("wordCountGoal" in updatedResource).toBe(false);
  });

  it("a non-negative integer sets the goal via the ordinary updateSidecar call (no clearKeys)", async () => {
    const res = createTextResource({ name: "Chapter One" });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    const input = screen.getByLabelText(
      "word-count-goal-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2000" } });

    await waitFor(() => {
      expect(updateSidecar).toHaveBeenCalled();
    });

    const [resourceId, projectId, updatedResource, clearKeys] = (
      updateSidecar as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.at(-1)!;

    expect(resourceId).toBe(res.id);
    expect(projectId).toBe(PROJECT_ID);
    expect(clearKeys).toBeUndefined();
    expect(updatedResource.wordCountGoal).toBe(2000);
  });

  it("rejects a negative value client-side with no request sent", async () => {
    const res = createTextResource({ name: "Chapter One" });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    const input = screen.getByLabelText(
      "word-count-goal-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-5" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /non-negative whole number/i,
    );
    expect(updateSidecar).not.toHaveBeenCalled();
  });

  it("rejects a non-integer value client-side with no request sent", async () => {
    const res = createTextResource({ name: "Chapter One" });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    const input = screen.getByLabelText(
      "word-count-goal-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12.5" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /non-negative whole number/i,
    );
    expect(updateSidecar).not.toHaveBeenCalled();
  });

  it("dispatches the Redux optimistic update after a successful save and reflects the new value", async () => {
    const res = createTextResource({ name: "Chapter One" });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    const input = screen.getByLabelText(
      "word-count-goal-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3000" } });

    await waitFor(() => {
      const updated = store
        .getState()
        .resources.resources.find((r) => r.id === res.id) as
        | AnyResource
        | undefined;
      expect(
        updated && updated.type === "text" ? updated.wordCountGoal : undefined,
      ).toBe(3000);
    });

    expect(input.value).toBe("3000");
  });
});
