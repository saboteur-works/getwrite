import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

// Avoid loading the real TipTap editor in jsdom — the default "edit" view
// mounts it for the selected text resource.
vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import type { ProjectFeatureFlags } from "../src/lib/models/types";

const PROJECT_ID = "proj_timeline_gating";

/**
 * Seed an in-memory store with a single selected text resource and render the
 * full AppShell with the given project feature flags.
 */
function renderShell(features: ProjectFeatureFlags) {
  // A resource with no storyDate so the Timeline view, when mounted, shows its
  // empty state ("no dated scenes") — a reliable marker that it rendered.
  const resource = createTextResource({ name: "Scene A", plainText: "" });
  const project = {
    id: PROJECT_ID,
    name: "Timeline Gating Project",
    rootPath: "/test/timeline-gating",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: project.name,
      rootPath: project.rootPath,
      folders: [],
      resources: [{ id: resource.id, name: resource.name }],
      features,
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setResources([resource]));
  store.dispatch(setSelectedResourceId(resource.id));

  render(
    <Provider store={store}>
      <AppShell
        showSidebars={true}
        project={project as never}
        resources={[resource]}
      />
    </Provider>,
  );

  return { resource };
}

describe("AppShell — Timeline view gating (Task 8)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    })) as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("enables the Timeline tab and mounts TimelineView when the feature is on", () => {
    renderShell({ timeline: true });

    const timelineTab = screen.getByRole("tab", { name: /Timeline/i });
    expect(timelineTab).not.toBeDisabled();

    // Switching to the Timeline tab mounts TimelineView (empty-state marker).
    fireEvent.click(timelineTab);
    expect(screen.getByText(/no dated scenes/i)).toBeInTheDocument();
  });

  it("disables the Timeline tab and never mounts TimelineView when the feature is off", () => {
    renderShell({ timeline: false });

    const timelineTab = screen.getByRole("tab", { name: /Timeline/i });
    expect(timelineTab).toBeDisabled();

    // Clicking the disabled tab is a no-op — TimelineView must not mount.
    fireEvent.click(timelineTab);
    expect(screen.queryByText(/no dated scenes/i)).not.toBeInTheDocument();
  });

  it("treats an absent timeline flag as disabled", () => {
    renderShell({});

    const timelineTab = screen.getByRole("tab", { name: /Timeline/i });
    expect(timelineTab).toBeDisabled();
    expect(screen.queryByText(/no dated scenes/i)).not.toBeInTheDocument();
  });
});
