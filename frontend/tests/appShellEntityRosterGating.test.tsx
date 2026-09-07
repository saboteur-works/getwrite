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

const PROJECT_ID = "proj_entity_roster_gating";

/**
 * Seed an in-memory store with a single selected text resource and render the
 * full AppShell with the given project feature flags.
 */
function renderShell(features: ProjectFeatureFlags) {
  const resource = createTextResource({ name: "Scene A", plainText: "" });
  const project = {
    id: PROJECT_ID,
    name: "Entity Roster Gating Project",
    rootPath: "/test/entity-roster-gating",
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

describe("AppShell — Entity Roster view gating (Task 5)", () => {
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

  it("enables the Entities tab and mounts EntityRosterView when the entities flag is on", () => {
    renderShell({ entities: true });

    const entitiesTab = screen.getByRole("tab", { name: /Entities/i });
    expect(entitiesTab).not.toBeDisabled();

    fireEvent.click(entitiesTab);
    expect(screen.getByTestId("entity-roster-view")).toBeInTheDocument();
  });

  it("disables the Entities tab and never mounts EntityRosterView when the entities flag is off", () => {
    renderShell({ entities: false });

    const entitiesTab = screen.getByRole("tab", { name: /Entities/i });
    expect(entitiesTab).toBeDisabled();

    // Clicking the disabled tab is a no-op — EntityRosterView must not mount.
    fireEvent.click(entitiesTab);
    expect(screen.queryByTestId("entity-roster-view")).not.toBeInTheDocument();
  });

  it("treats an absent entities flag as disabled", () => {
    renderShell({});

    const entitiesTab = screen.getByRole("tab", { name: /Entities/i });
    expect(entitiesTab).toBeDisabled();
    expect(screen.queryByTestId("entity-roster-view")).not.toBeInTheDocument();
  });
});
