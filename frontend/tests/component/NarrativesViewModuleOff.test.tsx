/** @vitest-environment jsdom */
/**
 * Feature 110, Task 22 (FR-3): pin that switching the folklore module off
 * hides only the tab and writes nothing, keeps every narrative, variant, field
 * value and tag as ordinary folders, Sources and fields, shows the same
 * narratives and variants when switched on again, falls back from an open
 * Narratives tab as for Sources and Claims, and works with the Sources module
 * off. Pin tests over the committed Task 20 tab and registry wiring; no
 * production code is changed. Shell set-up follows
 * `folklore-registry-wiring.test.tsx`.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
vi.mock("../../components/Sources/AttachmentMedia", () => ({
  __esModule: true,
  default: (props: { name: string }) => (
    <p role="status">{`player ${props.name}`}</p>
  ),
}));
const listAttachments = vi.fn();
vi.mock("../../src/lib/api/source-attachments", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/api/source-attachments")
    >();
  return {
    ...actual,
    listAttachments: (...a: unknown[]) => listAttachments(...a),
  };
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
const setModuleEnabled = vi.fn();
vi.mock("../../src/lib/api/modules", () => ({
  setModuleEnabled: (...a: unknown[]) => setModuleEnabled(...a),
}));
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

const PROJECT_ID = "proj_folklore_off";
const text = createTextResource({ name: "Scene A", plainText: "" });
const variantA = {
  ...createSourceResource({ name: "Telling A" }),
  folderId: "n1",
  resourceSubtype: "Variant",
  userMetadata: { teller: "Anna", motifs: ["river", "mill"] },
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
  name: "Folklore Off Project",
  rootPath: "/test/folklore-off",
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

let fetchCalls: { url: string; method: string }[] = [];
const nonGet = () =>
  fetchCalls.filter((c) => c.method !== "GET").map((c) => c.method + c.url);

beforeEach(() => {
  getFolderMetadata
    .mockReset()
    .mockResolvedValue({
      notes: "",
      fieldValues: {},
      resourceSubtype: "Narrative",
    });
  readVariantText
    .mockReset()
    .mockImplementation(async (_p: string, id: string) => ({
      kind: "text",
      text: `Body of ${id}`,
    }));
  listAttachments.mockReset().mockResolvedValue([]);
  setModuleEnabled.mockReset();
  listTrash
    .mockReset()
    .mockResolvedValue({ resources: [], folders: [], sourceAttachments: [] });
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("switching the folklore module off and on (FR-3)", () => {
  setupAppShellFetchStub();

  beforeEach(() => {
    fetchCalls = [];
    // The shell stub installs `fetch` as a mock; wrap it by assignment, since
    // spying on a mock returns the same mock and would call itself.
    const stub = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({
        url: String(input),
        method: (init?.method ?? "GET").toUpperCase(),
      });
      return stub(input, init);
    }) as typeof fetch;
  });

  it("hides only the tab, writes nothing, keeps the data, and shows the same narratives when switched on again", async () => {
    const store = await renderShell({ folklore: true });
    const tabsOn = screen
      .getAllByRole("tab")
      .map((t: HTMLElement) => t.textContent);
    expect(tabsOn).toContain("Narratives");
    fireEvent.click(screen.getByRole("tab", { name: "Narratives" }));
    await flushPendingEffects();
    const listOn = await screen.findByRole("list", {
      name: "Variants of Cinderella",
    });
    const itemsOn = within(listOn)
      .getAllByRole("listitem")
      .map((i: HTMLElement) => i.textContent);
    expect(itemsOn).toHaveLength(2);

    const foldersBefore = store.getState().resources.folders;
    const resourcesBefore = store.getState().resources.resources;
    const sourceDataBefore = JSON.stringify(resourcesBefore);
    fetchCalls = [];

    act(() => seed(store, { folklore: false }));
    await flushPendingEffects();

    // Only the tab is gone; every other tab stays.
    expect(tab()).toBeNull();
    const tabsOff = screen
      .getAllByRole("tab")
      .map((t: HTMLElement) => t.textContent);
    expect(tabsOff).toEqual(
      tabsOn.filter((t: string | null) => t !== "Narratives"),
    );
    // Nothing written: no module write, no non-GET request, data untouched.
    expect(setModuleEnabled).not.toHaveBeenCalled();
    expect(nonGet()).toEqual([]);
    expect(store.getState().resources.folders).toBe(foldersBefore);
    expect(JSON.stringify(store.getState().resources.resources)).toBe(
      sourceDataBefore,
    );
    // Folder, Sources, subtype, field value and tags stay as ordinary data.
    const kept = store
      .getState()
      .resources.resources.find((r: { id: string }) => r.id === variantA.id) as
      | { resourceSubtype?: string; userMetadata?: Record<string, unknown> }
      | undefined;
    expect(kept?.resourceSubtype).toBe("Variant");
    expect(kept?.userMetadata).toEqual({
      teller: "Anna",
      motifs: ["river", "mill"],
    });

    act(() => seed(store, { folklore: true }));
    await flushPendingEffects();
    expect(tab()).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Narratives" }));
    await flushPendingEffects();
    const listAgain = await screen.findByRole("list", {
      name: "Variants of Cinderella",
    });
    expect(
      within(listAgain)
        .getAllByRole("listitem")
        .map((i: HTMLElement) => i.textContent),
    ).toEqual(itemsOn);
    expect(nonGet()).toEqual([]);
    expect(setModuleEnabled).not.toHaveBeenCalled();
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
});

describe("with the Sources module off and folklore on (FR-3)", () => {
  setupAppShellFetchStub();

  it("shows the tab, the list, the comparison and the player", async () => {
    // Variant B has no body and one audio attachment; variant A has text.
    readVariantText.mockImplementation(async (_p: string, id: string) =>
      id === variantB.id
        ? { kind: "none" }
        : { kind: "text", text: `Body of ${id}` },
    );
    listAttachments.mockImplementation(async (_p: string, id: string) =>
      id === variantB.id
        ? [
            {
              id: "att1",
              fileName: "att1.wav",
              originalName: "telling.wav",
              mime: "audio/wav",
              size: 10,
              addedAt: "2026-01-01T00:00:00.000Z",
            },
          ]
        : [],
    );
    await renderShell({ sources: false, folklore: true });
    // The Sources tab is absent, the Narratives tab is present.
    expect(screen.queryByRole("tab", { name: "Sources" })).toBeNull();
    expect(tab()).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Narratives" }));
    await flushPendingEffects();

    const list = await screen.findByRole("list", {
      name: "Variants of Cinderella",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Telling A for comparison" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Telling B for comparison" }),
    );
    await flushPendingEffects();
    expect(await screen.findByTestId("comparison-columns")).toBeInTheDocument();
    expect(
      await screen.findByText(`Body of ${variantA.id}`),
    ).toBeInTheDocument();
    expect(await screen.findByText("No text")).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("button", { name: "Play audio: telling.wav" }),
    );
    expect(await screen.findByText("player telling.wav")).toBeInTheDocument();
  });
});
