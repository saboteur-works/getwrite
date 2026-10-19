import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

// Avoid loading the real TipTap editor in jsdom — the default "edit" view
// mounts it for the selected text resource.
// Feature 77 Task 18: the components under test now read the shared limits
// state; this file is not about limits, so the hook is fixed at "exempt".
vi.mock("../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));

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
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import { flushPendingEffects } from "./helpers/flushEffects";

const PROJECT_ID = "proj_timeline_gating";

/**
 * Seed an in-memory store with a single selected text resource and render the
 * full AppShell with the given project feature flags.
 */
async function renderShell(
  features: ProjectFeatureFlags,
  { selectResource = true }: { selectResource?: boolean } = {},
) {
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
  if (selectResource) store.dispatch(setSelectedResourceId(resource.id));

  render(
    <Provider store={store}>
      <AppShell
        showSidebars={true}
        project={project as never}
        resources={[resource]}
      />
    </Provider>,
  );
  // AppShell mounts several sections (TagsSection, SmartFolders, SearchBar,
  // etc.) that each fire their own fetch-then-setState effect on mount;
  // none of this file's tests assert on them, so flush them inside act()
  // rather than leaving their eventual update to land outside any act()
  // scope.
  await flushPendingEffects();

  return { resource };
}

describe("AppShell — Timeline view gating (Task 8)", () => {
  setupAppShellFetchStub();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enables the Timeline tab and mounts TimelineView when the view is on", async () => {
    await renderShell({ timelineView: true });

    const timelineTab = screen.getByRole("tab", { name: /Timeline/i });
    expect(timelineTab).not.toBeDisabled();

    // Switching to the Timeline tab mounts TimelineView (empty-state marker).
    fireEvent.click(timelineTab);
    expect(screen.getByText(/no dated scenes/i)).toBeInTheDocument();
  });

  it("mounts TimelineView with no resource selected, as in a freshly opened project (task_a7d8581a)", async () => {
    await renderShell({ timelineView: true }, { selectResource: false });

    fireEvent.click(screen.getByRole("tab", { name: /Timeline/i }));
    expect(screen.getByText(/no dated scenes/i)).toBeInTheDocument();
  });

  it("tells the writer to turn the Timeline view on in Project Settings, where the setting is (D-32)", async () => {
    await renderShell({});

    const tab = screen.getByRole("tab", { name: /Timeline/i });
    const anchor = tab.closest("[data-tooltip-content]");
    expect(anchor?.getAttribute("data-tooltip-content")).toBe(
      "The Timeline view is off. Turn it on in Project Settings → Timeline.",
    );
  });

  it("disables the Timeline tab and never mounts TimelineView when the view is off", async () => {
    await renderShell({ timelineView: false });

    const timelineTab = screen.getByRole("tab", { name: /Timeline/i });
    expect(timelineTab).toBeDisabled();

    // Clicking the disabled tab is a no-op — TimelineView must not mount.
    fireEvent.click(timelineTab);
    expect(screen.queryByText(/no dated scenes/i)).not.toBeInTheDocument();
  });

  it("treats an absent timelineView flag as disabled", async () => {
    await renderShell({});

    const timelineTab = screen.getByRole("tab", { name: /Timeline/i });
    expect(timelineTab).toBeDisabled();
    expect(screen.queryByText(/no dated scenes/i)).not.toBeInTheDocument();
  });

  it("keeps the Timeline tab disabled when only the date fields are enabled (timeline without timelineView)", async () => {
    // The field toggle and the view toggle are independent: having the metadata
    // fields on must NOT enable the view.
    await renderShell({ timeline: true });

    const timelineTab = screen.getByRole("tab", { name: /Timeline/i });
    expect(timelineTab).toBeDisabled();
    expect(screen.queryByText(/no dated scenes/i)).not.toBeInTheDocument();
  });
});
