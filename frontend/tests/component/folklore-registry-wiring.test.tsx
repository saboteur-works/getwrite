/** @vitest-environment jsdom */
/**
 * Feature 110, Task 20 (FR-2, FR-7): the folklore module wired through the UI
 * registry. The Narratives tab (absent by default, present when the module is
 * on, falling back when switched off), `NarrativesView` fed by the folder
 * metadata read, and opening a variant in the editor through the host's
 * `openInEditor`. Modelled on `claims-registry-wiring.test.tsx`.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));
vi.mock("../../components/WorkArea/EditView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-edit" />,
}));
vi.mock("../../components/WorkArea/Media/MediaView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-media" />,
}));
vi.mock("../../components/WorkArea/DiffViewController", () => ({
  __esModule: true,
  default: () => <div data-testid="view-diff" />,
}));
vi.mock("../../components/WorkArea/Views/OrganizerView/OrganizerView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-organizer" />,
}));
vi.mock("../../components/WorkArea/DataView", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../components/WorkArea/DataView")>();
  return {
    ...actual,
    __esModule: true,
    default: () => <div data-testid="view-data" />,
  };
});
vi.mock("../../components/WorkArea/Views/TrashView/TrashView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-trash" />,
}));
vi.mock("../../src/lib/api/source-attachments", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/api/source-attachments")
    >();
  return { ...actual, listAttachments: vi.fn(async () => []) };
});
const getFolderMetadata = vi.fn();
vi.mock("../../src/lib/api/folder-metadata", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/api/folder-metadata")>();
  return {
    ...actual,
    getFolderMetadata: (...a: unknown[]) => getFolderMetadata(...a),
  };
});
const readVariantText = vi.fn();
vi.mock("../../src/lib/api/folklore", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/api/folklore")>();
  return {
    ...actual,
    readVariantText: (...a: unknown[]) => readVariantText(...a),
  };
});
const listTrash = vi.fn();
vi.mock("../../src/lib/api/trash", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/api/trash")>();
  return { ...actual, listTrash: (...a: unknown[]) => listTrash(...a) };
});

import AppShell from "../../components/Layout/AppShell";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import {
  createSourceResource,
  createTextResource,
} from "../../src/lib/models/resource-factory";
import { setupAppShellFetchStub } from "../helpers/appShellFetchStub";
import { flushPendingEffects } from "../helpers/flushEffects";

const PROJECT_ID = "proj_folklore_wiring";
const text = createTextResource({ name: "Scene A", plainText: "" });
const variantA = {
  ...createSourceResource({ name: "Telling A" }),
  folderId: "n1",
  resourceSubtype: "Variant",
};
const variantB = {
  ...createSourceResource({ name: "Telling B" }),
  folderId: "n1",
  resourceSubtype: "Variant",
};
const narrativeFolder = {
  id: "n1",
  slug: "n1",
  name: "Cinderella",
  type: "folder",
  orderIndex: 0,
  parentId: null,
};
const project = {
  id: PROJECT_ID,
  name: "Folklore Wiring Project",
  rootPath: "/test/folklore-wiring",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function seed(
  store: ReturnType<typeof makeStore>,
  modules?: Record<string, boolean>,
): void {
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: project.name,
      rootPath: project.rootPath,
      folders: [],
      resources: [],
      features: { timelineView: true, entities: true },
      modules,
    }),
  );
}

async function renderShell(modules?: Record<string, boolean>) {
  const all = [text, variantA, variantB];
  const store = makeStore();
  seed(store, modules);
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setFolders([narrativeFolder] as never));
  store.dispatch(setResources(all as never));
  store.dispatch(setSelectedResourceId(text.id));
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={all}
        />
      </TrashRefreshProvider>
    </Provider>,
  );
  await flushPendingEffects();
  return store;
}

const tab = () => screen.queryByRole("tab", { name: "Narratives" });
const isActive = (name: string) =>
  screen.getByRole("tab", { name }).getAttribute("aria-selected") === "true";

beforeEach(() => {
  getFolderMetadata
    .mockReset()
    .mockResolvedValue({
      notes: "",
      fieldValues: {},
      resourceSubtype: "Narrative",
    });
  readVariantText.mockReset().mockResolvedValue({ kind: "text", text: "x" });
  listTrash
    .mockReset()
    .mockResolvedValue({ resources: [], folders: [], sourceAttachments: [] });
});
afterEach(() => cleanup());

describe("Narratives tab (FR-2, FR-7)", () => {
  setupAppShellFetchStub();

  it("is absent by default (the module is off until switched on)", async () => {
    await renderShell();
    expect(tab()).toBeNull();
  });

  it("appears when the module is on and shows the narrative and its list", async () => {
    await renderShell({ folklore: true });
    expect(tab()).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Narratives" }));
    await flushPendingEffects();
    expect(isActive("Narratives")).toBe(true);
    expect(getFolderMetadata).toHaveBeenCalledWith("folklore-wiring", "n1");
    expect(
      await screen.findByRole("list", { name: "Variants of Cinderella" }),
    ).toBeInTheDocument();
  });

  it("shows a failed folder read as not read, never as no narratives", async () => {
    getFolderMetadata.mockRejectedValue(new Error("disk unreadable"));
    await renderShell({ folklore: true });
    fireEvent.click(screen.getByRole("tab", { name: "Narratives" }));
    await flushPendingEffects();
    expect(await screen.findByText(/Cinderella: not read/)).toBeInTheDocument();
    expect(screen.queryByText(/There are no narratives yet/)).toBeNull();
  });

  it("falls back from an open Narratives tab when the module is switched off", async () => {
    const store = await renderShell({ folklore: true });
    fireEvent.click(screen.getByRole("tab", { name: "Narratives" }));
    await flushPendingEffects();
    expect(isActive("Narratives")).toBe(true);
    act(() => seed(store, { folklore: false }));
    await flushPendingEffects();
    expect(tab()).toBeNull();
    expect(isActive("Edit")).toBe(true);
  });

  it("opening a variant passes the host's openInEditor: it selects the Source and shows the editor", async () => {
    const store = await renderShell({ folklore: true });
    fireEvent.click(screen.getByRole("tab", { name: "Narratives" }));
    await flushPendingEffects();
    fireEvent.click(
      await screen.findByRole("button", { name: "Open Telling B" }),
    );
    await waitFor(() => expect(isActive("Edit")).toBe(true));
    expect(store.getState().resources.selectedResourceId).toBe(variantB.id);
  });
});
