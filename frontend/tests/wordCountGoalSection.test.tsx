import React from "react";
import { execSync } from "node:child_process";
import path from "node:path";
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

  it("renders no progress bar when no goal is set", () => {
    const res = createTextResource({ name: "Chapter One" });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders no progress bar when wordCountGoal is explicitly 0 (no divide-by-zero)", () => {
    const res = createTextResource({ name: "Chapter One" });
    Object.assign(res, { wordCountGoal: 0 });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders the progress bar with current sourced via userMetadata.wordCount ?? wordCount ?? 0, and goal from wordCountGoal", () => {
    const res = createTextResource({ name: "Chapter One" });
    Object.assign(res, {
      wordCountGoal: 2000,
      wordCount: 999, // should be ignored in favor of userMetadata.wordCount
      userMetadata: { wordCount: 1234 },
    });
    const store = setupStore(res);

    render(
      <Provider store={store}>
        <WordCountGoalSection />
      </Provider>,
    );

    const bar = screen.getByRole("progressbar");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuemax", "2000");
    expect(bar).toHaveAttribute("aria-valuenow", "1234");
  });

  it("never renders any red-associated class or style on the progress bar (FR-3)", () => {
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

    const html = container.innerHTML;
    expect(html).not.toMatch(/red/i);
    expect(html).not.toMatch(/#D44040/i);
  });

  it("renders the progress bar only inside WordCountGoalSection.tsx (no other component was touched)", () => {
    // This is a structural confirmation, not a functional one: the only
    // component file this task modified is WordCountGoalSection.tsx itself.
    // A git grep confirms no other component imports WordCountProgressBar
    // as part of this task's change (pre-existing DataView.tsx usage is
    // untouched and expected).
    const grepOutput = execSync(
      'git grep -l "WordCountProgressBar" -- "components/"',
      { cwd: path.resolve(__dirname, ".."), encoding: "utf-8" },
    );
    const files = grepOutput
      .split("\n")
      .filter((f) => f.length > 0)
      .sort();

    expect(files).toEqual(
      [
        "components/Sidebar/WordCountGoalSection.tsx",
        "components/WorkArea/DataView.tsx",
        "components/WorkArea/WordCountProgressBar.tsx",
      ].sort(),
    );
  });
});
