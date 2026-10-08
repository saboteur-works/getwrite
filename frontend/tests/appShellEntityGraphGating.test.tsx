import { describe, it, expect, vi, afterEach } from "vitest";
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
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import { flushPendingEffects } from "./helpers/flushEffects";

const PROJECT_ID = "proj_entity_graph_gating";

/**
 * Seed an in-memory store with a single text resource and render the full
 * AppShell with the given project feature flags.
 *
 * `selectResource` controls whether that resource is the selected one. It
 * defaults to true because most cases here are about the tab's flag gating,
 * but passing false is the case that matters for a project-wide view: the
 * graph reads across every declared entity, so it must render with nothing
 * selected at all — the state a freshly opened project is in.
 */
async function renderShell(
  features: ProjectFeatureFlags,
  { selectResource = true }: { selectResource?: boolean } = {},
) {
  const resource = createTextResource({ name: "Scene A", plainText: "" });
  const project = {
    id: PROJECT_ID,
    name: "Entity Graph Gating Project",
    rootPath: "/test/entity-graph-gating",
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
  if (selectResource) {
    store.dispatch(setSelectedResourceId(resource.id));
  }

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

describe("AppShell — Relationship Graph view gating (Task 2)", () => {
  setupAppShellFetchStub();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enables the Graph tab and mounts EntityRelationshipGraphView when the entities flag is on", async () => {
    await renderShell({ entities: true });

    const graphTab = screen.getByRole("tab", { name: /Graph/i });
    expect(graphTab).not.toBeDisabled();

    fireEvent.click(graphTab);
    // Mounting the Graph tab fires EntityRelationshipGraphView's own batch
    // of fetch-then-setState effects (cooccurrence, relationships,
    // backlinks, kind styles, settings) — flush them before asserting.
    await flushPendingEffects();
    expect(
      screen.getByTestId("entity-relationship-graph-view"),
    ).toBeInTheDocument();
  });

  it("disables the Graph tab and never mounts EntityRelationshipGraphView when the entities flag is off", async () => {
    await renderShell({ entities: false });

    const graphTab = screen.getByRole("tab", { name: /Graph/i });
    expect(graphTab).toBeDisabled();

    // Clicking the disabled tab is a no-op — the graph view must not mount.
    fireEvent.click(graphTab);
    expect(
      screen.queryByTestId("entity-relationship-graph-view"),
    ).not.toBeInTheDocument();
  });

  it("treats an absent entities flag as disabled", async () => {
    await renderShell({});

    const graphTab = screen.getByRole("tab", { name: /Graph/i });
    expect(graphTab).toBeDisabled();
    expect(
      screen.queryByTestId("entity-relationship-graph-view"),
    ).not.toBeInTheDocument();
  });

  // Regression class covered here: AppShell gates its whole view switch on a
  // resource being selected, exempting only project-wide views handled in a
  // pre-guard block (`data`, `entityRoster`). Timeline was placed in the
  // post-guard `switch` instead and is still unreachable from a freshly
  // opened project as a result (POS task_a7d8581a). This test guards against
  // the graph view repeating that mistake.
  it("mounts the graph with no resource selected, since it is project-wide", async () => {
    await renderShell({ entities: true }, { selectResource: false });

    const graphTab = screen.getByRole("tab", { name: /Graph/i });
    expect(graphTab).not.toBeDisabled();

    fireEvent.click(graphTab);
    await flushPendingEffects();

    expect(
      screen.getByTestId("entity-relationship-graph-view"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Resource not found/i)).not.toBeInTheDocument();
  });
});
