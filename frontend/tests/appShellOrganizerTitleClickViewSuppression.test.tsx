import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { Provider } from "react-redux";

// Avoid loading the real TipTap editor in jsdom — the "edit" view mounts it
// for a selected text resource.
vi.mock("../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

import AppShell from "../components/Layout/AppShell";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import { flushPendingEffects } from "./helpers/flushEffects";

const PROJECT_ID = "proj_organizer_title_click_suppression";
const FOLDER_ID = "44444444-4444-4444-8444-444444444444";

const makeFolder = (id: string, name: string) => ({
  id,
  name,
  type: "folder" as const,
  createdAt: new Date().toISOString(),
  userMetadata: {},
  folderId: null,
  orderIndex: 0,
});

/**
 * Seeds a store with one folder (selected, so the shell's existing
 * folder-selection effect lands the view on "organizer") containing one text
 * resource, and renders the full `AppShell`, returning the store so a test
 * can dispatch against it directly (mirroring an ordinary, non-title-click
 * selection path such as `ResourceTree.tsx`/`SearchBar.tsx`).
 */
async function renderShell() {
  const textA = createTextResource({
    name: "Text Card A",
    folderId: FOLDER_ID,
  });
  const textB = createTextResource({
    name: "Text Card B",
    folderId: FOLDER_ID,
  });
  const project = {
    id: PROJECT_ID,
    name: "Organizer Title Click Project",
    rootPath: "/test/organizer-title-click",
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
      resources: [],
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setFolders([makeFolder(FOLDER_ID, "Folder A")] as never));
  store.dispatch(setResources([textA, textB] as never));
  store.dispatch(setSelectedResourceId(FOLDER_ID));

  render(
    <Provider store={store}>
      <AppShell
        showSidebars={true}
        project={project as never}
        resources={[textA, textB]}
      />
    </Provider>,
  );
  // AppShell mounts several sections (TagsSection, SmartFolders, SearchBar,
  // etc.) that each fire their own fetch-then-setState effect on mount;
  // none of this file's tests assert on them, so flush them inside act()
  // rather than leaving their eventual update to land outside any act()
  // scope.
  await flushPendingEffects();

  return { store, textA, textB };
}

describe("AppShell — OrganizerCard title click suppresses the auto-switch view effect (FR-3, FR-4, FR-6)", () => {
  setupAppShellFetchStub();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stays on the organizer view after a title click, but a later ordinary selection still switches to edit (one-shot regression)", async () => {
    const { store, textB } = await renderShell();

    // Selecting Folder A lands the shell on "organizer" via the existing
    // folder-selection effect.
    expect(screen.getByRole("tab", { name: "Organizer" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Clicking the card's title selects the resource via `onSelect`, which
    // dispatches the suppression flag immediately before
    // `setSelectedResourceId` (Task 9/10). The active view must not change.
    fireEvent.click(screen.getByRole("button", { name: "Text Card A" }));

    expect(screen.getByRole("tab", { name: "Organizer" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    // FR-7 regression, exercised at the AppShell integration level: the
    // grid still shows the other, unselected child's card rather than
    // falling back to the "Select a folder..." empty state.
    expect(screen.getByRole("button", { name: "Text Card B" })).toBeTruthy();

    // Regression (one-shot): a second, ordinary selection that does NOT go
    // through the title-click suppression path (mirroring how
    // `ResourceTree.tsx`/`SearchBar.tsx` dispatch `setSelectedResourceId`
    // directly) must still trigger the normal auto-switch-to-edit behavior,
    // proving the flag cleared after its one use and did not leak into
    // suppressing this unrelated, later selection.
    act(() => {
      store.dispatch(setSelectedResourceId(textB.id));
    });
    // Switching to the Edit view mounts EditView, which fires its own
    // revision-content-load effect — flush it before the test ends.
    await flushPendingEffects();

    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("clicking the footer Open button still switches the active view to edit (FR-6, unchanged)", async () => {
    await renderShell();

    expect(screen.getByRole("tab", { name: "Organizer" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const cardA = screen
      .getByText("Text Card A")
      .closest("article") as HTMLElement;
    fireEvent.click(within(cardA).getByRole("button", { name: "Open" }));
    // Switching to the Edit view mounts EditView, which fires its own
    // revision-content-load effect — flush it before the test ends.
    await flushPendingEffects();

    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
