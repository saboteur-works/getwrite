/**
 * Component tests for the Timeline-view toggle (User Preferences).
 *
 * Covers: the checkbox reflects `config.features.timelineView` (absent = off),
 * toggling dispatches `updateProjectFeatures` merged onto the full feature map
 * (so the metadata-field flags are preserved), and the section renders nothing
 * when no project is selected.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import TimelineViewToggle from "../components/preferences/TimelineViewToggle";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import type { ProjectFeatureFlags } from "../src/lib/models/types";

function setup(features?: ProjectFeatureFlags) {
  const store = makeStore();
  const projectId = "test-project-id";
  store.dispatch(
    setProject({
      id: projectId,
      rootPath: "/test",
      ...(features ? { features } : {}),
    }),
  );
  store.dispatch(setSelectedProjectId(projectId));
  const utils = render(
    <Provider store={store}>
      <TimelineViewToggle />
    </Provider>,
  );
  return { store, projectId, ...utils };
}

function mockFeatureRoute(features: ProjectFeatureFlags) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ features, organizerCardBody: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

describe("TimelineViewToggle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Timeline view checkbox", () => {
    setup();
    expect(
      screen.getByRole("checkbox", { name: /enable timeline view/i }),
    ).toBeInTheDocument();
  });

  it("is unchecked when timelineView is absent (even if the date fields are on)", () => {
    setup({ timeline: true });
    expect(
      screen.getByRole("checkbox", { name: /enable timeline view/i }),
    ).not.toBeChecked();
  });

  it("is checked when timelineView is enabled", () => {
    setup({ timelineView: true });
    expect(
      screen.getByRole("checkbox", { name: /enable timeline view/i }),
    ).toBeChecked();
  });

  it("dispatches timelineView while preserving the metadata-field flags", async () => {
    setup({ timeline: true, notes: true });
    const fetchSpy = mockFeatureRoute({
      timeline: true,
      notes: true,
      timelineView: true,
    });

    fireEvent.click(
      screen.getByRole("checkbox", { name: /enable timeline view/i }),
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/project/features");
    expect(JSON.parse(init.body as string).features).toEqual({
      timeline: true,
      notes: true,
      timelineView: true,
    });
  });

  it("renders nothing when no project is selected", () => {
    const store = makeStore();
    const { container } = render(
      <Provider store={store}>
        <TimelineViewToggle />
      </Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
