import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let fakeState: any = {
  projects: { selectedProjectId: null, projects: {} },
  resources: { resources: [], folders: [] },
};

const mockDispatch = vi.fn();

vi.mock("../src/store/hooks", () => ({
  __esModule: true,
  default: (selector: any) => selector(fakeState),
  useAppDispatch: () => mockDispatch,
}));

vi.mock("../src/store/resourcesSlice", () => ({
  setSelectedResourceId: (id: string) => ({
    type: "resources/setSelectedResourceId",
    payload: id,
  }),
}));

import TimelineView from "../components/WorkArea/Views/TimelineView";
import { createTextResource } from "../src/lib/models/resource";

beforeEach(() => {
  fakeState = {
    projects: {
      selectedProjectId: "proj1",
      projects: { proj1: { id: "proj1", name: "My Novel" } },
    },
    resources: { resources: [], folders: [] },
  };
});

describe("TimelineView", () => {
  it("shows empty state when no resources have storyDate", () => {
    fakeState.resources.resources = [
      createTextResource({ name: "Undated Scene", plainText: "" }),
    ];
    render(<TimelineView />);
    expect(screen.getByText(/no dated scenes/i)).toBeInTheDocument();
  });

  it("renders item chips for resources with storyDate", () => {
    const res = createTextResource({
      name: "Opening Scene",
      plainText: "",
      userMetadata: { storyDate: "2024-01-15" },
    });
    fakeState.resources.resources = [res];
    render(<TimelineView />);
    expect(
      screen.getByRole("listitem", { name: "Opening Scene" }),
    ).toBeInTheDocument();
  });

  it("renders multiple items from multiple resources", () => {
    fakeState.resources.resources = [
      createTextResource({
        name: "Scene A",
        plainText: "",
        userMetadata: { storyDate: "2024-01-01" },
      }),
      createTextResource({
        name: "Scene B",
        plainText: "",
        userMetadata: { storyDate: "2024-02-01" },
      }),
      createTextResource({
        name: "Scene C",
        plainText: "",
        userMetadata: { storyDate: "2024-03-01" },
      }),
    ];
    render(<TimelineView />);
    expect(
      screen.getByRole("listitem", { name: "Scene A" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Scene B" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Scene C" }),
    ).toBeInTheDocument();
  });

  it("shows group labels for folders referenced by dated items", () => {
    const folderId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    fakeState.resources.folders = [
      { id: folderId, name: "Act One", type: "folder" },
    ];
    fakeState.resources.resources = [
      createTextResource({
        name: "Inciting Incident",
        plainText: "",
        folderId,
        userMetadata: { storyDate: "2024-01-10" },
      }),
    ];
    render(<TimelineView />);
    expect(screen.getByText("Act One")).toBeInTheDocument();
  });

  it("shows the scene count in the toolbar", () => {
    fakeState.resources.resources = [
      createTextResource({
        name: "Scene A",
        plainText: "",
        userMetadata: { storyDate: "2024-01-01" },
      }),
      createTextResource({
        name: "Scene B",
        plainText: "",
        userMetadata: { storyDate: "2024-02-01" },
      }),
    ];
    render(<TimelineView />);
    expect(screen.getByText(/2 SCENES/i)).toBeInTheDocument();
  });

  it("omits resources without storyDate from the timeline", () => {
    fakeState.resources.resources = [
      createTextResource({
        name: "Dated",
        plainText: "",
        userMetadata: { storyDate: "2024-06-01" },
      }),
      createTextResource({ name: "Undated", plainText: "" }),
    ];
    render(<TimelineView />);
    expect(screen.getByRole("listitem", { name: "Dated" })).toBeInTheDocument();
    expect(
      screen.queryByRole("listitem", { name: "Undated" }),
    ).not.toBeInTheDocument();
  });
});

describe("TimelineView — POV / Notes feature gating (Task 9)", () => {
  /** Enable the given feature flags on the active project in fakeState. */
  function enableFeatures(features: Record<string, boolean>): void {
    fakeState.projects.projects.proj1.features = features;
  }

  it("renders POV pills and legend when POV is enabled and present", () => {
    enableFeatures({ pov: true });
    fakeState.resources.resources = [
      createTextResource({
        name: "Scene A",
        plainText: "",
        userMetadata: { storyDate: "2024-01-01", pov: "Alice" },
      }),
      createTextResource({
        name: "Scene B",
        plainText: "",
        userMetadata: { storyDate: "2024-02-01", pov: "Bob" },
      }),
    ];
    render(<TimelineView />);

    // "ALL" filter pill + one pill per POV, plus the legend header.
    expect(screen.getByRole("button", { name: "ALL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bob" })).toBeInTheDocument();
    expect(screen.getByText("POV")).toBeInTheDocument();
  });

  it("hides POV pills and legend when POV is disabled, even if resources carry POV", () => {
    enableFeatures({ pov: false });
    fakeState.resources.resources = [
      createTextResource({
        name: "Scene A",
        plainText: "",
        userMetadata: { storyDate: "2024-01-01", pov: "Alice" },
      }),
    ];
    render(<TimelineView />);

    // The scene still renders, but no POV affordances are present.
    expect(
      screen.getByRole("listitem", { name: "Scene A" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ALL" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Alice" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("POV")).not.toBeInTheDocument();
  });

  it("renders a plain chronology when POV is enabled but absent (FR4)", () => {
    enableFeatures({ pov: true });
    fakeState.resources.resources = [
      createTextResource({
        name: "Scene A",
        plainText: "",
        userMetadata: { storyDate: "2024-01-01" },
      }),
    ];
    render(<TimelineView />);

    expect(
      screen.getByRole("listitem", { name: "Scene A" }),
    ).toBeInTheDocument();
    // No POV in the data → no pills, no legend.
    expect(
      screen.queryByRole("button", { name: "ALL" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("POV")).not.toBeInTheDocument();
  });

  it("renders without error when Notes is disabled and a resource has a notes value", () => {
    enableFeatures({ notes: false });
    const res = createTextResource({
      name: "Scene A",
      plainText: "",
      // Notes is the userMetadata field, not the legacy resource-level `notes`.
      userMetadata: {
        storyDate: "2024-01-01",
        notes: "A private authoring note.",
      },
    });
    fakeState.resources.resources = [res];

    expect(() => render(<TimelineView />)).not.toThrow();
    expect(
      screen.getByRole("listitem", { name: "Scene A" }),
    ).toBeInTheDocument();
  });
});
