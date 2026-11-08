import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";

vi.mock("../components/Sharing/SharingLimitsContext", () => ({
  useSharingLimits: () => ({
    state: { state: "exempt" },
    hasDesktopBridge: false,
    refresh: async () => ({ state: "exempt" }),
    registerUnlockPrompt: () => () => undefined,
  }),
  useDeclareUnlockPromptMounted: () => undefined,
}));

// Each work-area view body is replaced by a marker so these tests assert which
// view the shell mounted, not what the view draws.
vi.mock("../components/WorkArea/EditView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-edit" />,
}));
vi.mock("../components/WorkArea/Media/MediaView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-media" />,
}));
vi.mock("../components/WorkArea/DiffViewController", () => ({
  __esModule: true,
  default: () => <div data-testid="view-diff" />,
}));
vi.mock("../components/WorkArea/Views/OrganizerView/OrganizerView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-organizer" />,
}));
vi.mock("../components/WorkArea/DataView", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../components/WorkArea/DataView")>();
  return {
    ...actual,
    __esModule: true,
    default: () => <div data-testid="view-data" />,
  };
});
vi.mock("../components/WorkArea/Views/TrashView/TrashView", () => ({
  __esModule: true,
  default: () => <div data-testid="view-trash" />,
}));

vi.mock("../src/lib/api/source-attachments", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/source-attachments")>();
  return { ...actual, listAttachments: vi.fn(async () => []) };
});

import AppShell from "../components/Layout/AppShell";
import TrashRefreshProvider from "../components/Layout/TrashRefreshContext";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
  setSuppressNextViewAutoSwitch,
} from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";
import {
  createAudioResource,
  createImageResource,
  createSourceResource,
} from "../src/lib/models/resource-factory";
import type { ProjectFeatureFlags, ViewName } from "../src/lib/models/types";
import { MODULE_MANIFEST } from "../src/lib/models/modules/manifest";
import { setupAppShellFetchStub } from "./helpers/appShellFetchStub";
import { flushPendingEffects } from "./helpers/flushEffects";

const PROJECT_ID = "proj_work_area_view_gating";
const FOLDER_ID = "55555555-5555-4555-8555-555555555555";
const ALL_ON: ProjectFeatureFlags = { timelineView: true, entities: true };

const folder = {
  id: FOLDER_ID,
  name: "Folder A",
  type: "folder" as const,
  createdAt: new Date().toISOString(),
  userMetadata: {},
  folderId: null,
  orderIndex: 0,
};
const text = createTextResource({ name: "Scene A", plainText: "" });
const source = createSourceResource({ name: "Source A" });
const image = createImageResource({ name: "Image A" });
const audio = createAudioResource({ name: "Audio A" });

type Pick = "none" | "text" | "folder" | "source" | "image" | "audio";
const IDS: Record<Exclude<Pick, "none">, string> = {
  text: text.id,
  folder: FOLDER_ID,
  source: source.id,
  image: image.id,
  audio: audio.id,
};

const project = {
  id: PROJECT_ID,
  name: "Work Area View Gating Project",
  rootPath: "/test/work-area-view-gating",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function seedProject(
  store: ReturnType<typeof makeStore>,
  features: ProjectFeatureFlags,
  modules?: Record<string, boolean>,
): void {
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: project.name,
      rootPath: project.rootPath,
      folders: [],
      resources: [],
      features,
      modules,
    }),
  );
}

async function renderShell(
  features: ProjectFeatureFlags,
  selected: Pick = "none",
  modules?: Record<string, boolean>,
) {
  const all = [text, source, image, audio];
  const store = makeStore();
  seedProject(store, features, modules);
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setFolders([folder] as never));
  store.dispatch(setResources(all as never));
  if (selected !== "none") {
    store.dispatch(setSelectedResourceId(IDS[selected]));
  }
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

async function select(
  store: ReturnType<typeof makeStore>,
  pick: Exclude<Pick, "none">,
) {
  act(() => {
    store.dispatch(setSelectedResourceId(IDS[pick]));
  });
  await flushPendingEffects();
}

const tab = (name: string) => screen.getByRole("tab", { name });
const isActive = (name: string) =>
  tab(name).getAttribute("aria-selected") === "true";
const mounted = (id: string) => screen.queryByTestId(id) !== null;
const VIEW_MARKERS = [
  "view-edit",
  "view-media",
  "view-diff",
  "view-organizer",
  "view-data",
  "view-trash",
];
const mountedMarkers = () => VIEW_MARKERS.filter(mounted);

async function open(name: string) {
  fireEvent.click(tab(name));
  await flushPendingEffects();
}

const TIMELINE_REASON =
  "The Timeline view is off. Turn it on in Project Settings → Timeline.";
const ENTITIES_REASON =
  "Entities are off. Turn them on in Project Settings → Entities.";
const reasonOf = (name: string) =>
  tab(name)
    .closest("[data-tooltip-content]")
    ?.getAttribute("data-tooltip-content") ?? null;

/**
 * Characterization of the Work Area view gating in AppShell.tsx, written
 * against the unchanged shell (Feature 103 Task 11, FR-10 first sentence).
 *
 * Reset conditions read in AppShell.tsx:
 * - 465-505: effect on [selectedResource?.id, selectedResource?.type]. If the
 *   one-shot suppressNextViewAutoSwitch flag is set it is cleared and the run
 *   returns with no view change (469-475). Otherwise, by selected type:
 *   text or source (478-483): "organizer" becomes "edit", any other view is
 *   kept; folder (484-490): "edit" or "diff" becomes "organizer", any other
 *   view is kept; image or audio (491-503): "organizer", "diff" or "timeline"
 *   becomes "edit", any other view is kept. Each of the three branches also
 *   clears the active smart folder and closes the query builder. No branch
 *   runs for no selection or any other type, so the view is untouched.
 *   "data", "entityRoster", "entityGraph" and "trash" are never reset by it.
 * - 508-516: effect on [isTimelineViewEnabled, selectedResource?.type]. When
 *   the Timeline view is off and the current view is "timeline", the view
 *   becomes "organizer" if a folder is selected, otherwise "edit".
 * - There is no reset for "entityRoster" or "entityGraph" when entities turn
 *   off: the render at 1627-1657 returns null for them.
 * - Initial view is "edit" (270).
 */
describe("AppShell — Work Area view gating (characterization, AppShell.tsx:270,465-516,1413-1467,1498-1690)", () => {
  setupAppShellFetchStub();

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("reachability per view with a resource selected", () => {
    it("edit: active and mounted for a text resource", async () => {
      await renderShell(ALL_ON, "text");
      expect(tab("Edit")).not.toBeDisabled();
      expect(isActive("Edit")).toBe(true);
      expect(mountedMarkers()).toEqual(["view-edit"]);
    });

    it("organizer: enabled and mounted for a folder, which lands on it", async () => {
      await renderShell(ALL_ON, "folder");
      expect(tab("Organizer")).not.toBeDisabled();
      expect(isActive("Organizer")).toBe(true);
      expect(mountedMarkers()).toEqual(["view-organizer"]);
    });

    it("diff: enabled for a text resource and mounts when chosen", async () => {
      await renderShell(ALL_ON, "text");
      expect(tab("Diff")).not.toBeDisabled();
      await open("Diff");
      expect(mountedMarkers()).toEqual(["view-diff"]);
    });

    it("data: mounts when chosen with a resource selected", async () => {
      await renderShell(ALL_ON, "text");
      await open("Data");
      expect(mountedMarkers()).toEqual(["view-data"]);
    });

    it("timeline: mounts when chosen with the view on", async () => {
      await renderShell(ALL_ON, "text");
      await open("Timeline");
      expect(isActive("Timeline")).toBe(true);
    });

    it("entityRoster and entityGraph: enabled with the entities flag on", async () => {
      await renderShell(ALL_ON, "text");
      expect(tab("Entities")).not.toBeDisabled();
      expect(tab("Graph")).not.toBeDisabled();
      await open("Entities");
      expect(screen.getByTestId("entity-roster-view")).toBeInTheDocument();
      await open("Graph");
      expect(
        screen.getByTestId("entity-relationship-graph-view"),
      ).toBeInTheDocument();
    });

    it("trash: mounts when chosen with a resource selected", async () => {
      await renderShell(ALL_ON, "text");
      await open("Trash");
      expect(mountedMarkers()).toEqual(["view-trash"]);
    });

    it("edit tab reads Media and mounts the media view for an image or audio resource", async () => {
      await renderShell(ALL_ON, "image");
      expect(tab("Media")).not.toBeDisabled();
      expect(isActive("Media")).toBe(true);
      expect(mountedMarkers()).toEqual(["view-media"]);
    });
  });

  describe("reachability of project-wide views with no resource selected", () => {
    it("starts on edit with nothing to show but the empty state", async () => {
      await renderShell(ALL_ON, "none");
      expect(isActive("Edit")).toBe(true);
      expect(mountedMarkers()).toEqual([]);
      expect(
        screen.getByText(/Select a file from the resource tree/i),
      ).toBeInTheDocument();
    });

    it("disables edit, diff and organizer, and leaves the project-wide tabs enabled", async () => {
      await renderShell(ALL_ON, "none");
      expect(tab("Edit")).toBeDisabled();
      expect(tab("Diff")).toBeDisabled();
      expect(tab("Organizer")).toBeDisabled();
      for (const name of ["Data", "Timeline", "Entities", "Graph", "Trash"]) {
        expect(tab(name)).not.toBeDisabled();
      }
    });

    it("data mounts", async () => {
      await renderShell(ALL_ON, "none");
      await open("Data");
      expect(mountedMarkers()).toEqual(["view-data"]);
    });

    it("trash mounts with every optional flag off", async () => {
      await renderShell({}, "none");
      expect(tab("Trash")).not.toBeDisabled();
      await open("Trash");
      expect(mountedMarkers()).toEqual(["view-trash"]);
    });

    it("timeline mounts", async () => {
      await renderShell(ALL_ON, "none");
      await open("Timeline");
      expect(isActive("Timeline")).toBe(true);
      expect(
        screen.queryByText(/Select a file from the resource tree/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Resource not found/i)).not.toBeInTheDocument();
    });

    it("entityRoster mounts", async () => {
      await renderShell(ALL_ON, "none");
      await open("Entities");
      expect(screen.getByTestId("entity-roster-view")).toBeInTheDocument();
    });

    it("entityGraph mounts", async () => {
      await renderShell(ALL_ON, "none");
      await open("Graph");
      expect(
        screen.getByTestId("entity-relationship-graph-view"),
      ).toBeInTheDocument();
    });
  });

  describe("disabled views by selected type", () => {
    const cases: ReadonlyArray<{
      pick: Pick;
      edit: string;
      disabled: string[];
    }> = [
      { pick: "text", edit: "Edit", disabled: ["Organizer"] },
      { pick: "source", edit: "Edit", disabled: ["Diff", "Organizer"] },
      { pick: "folder", edit: "Edit", disabled: ["Edit", "Diff"] },
      { pick: "image", edit: "Media", disabled: ["Diff", "Organizer"] },
      { pick: "audio", edit: "Media", disabled: ["Diff", "Organizer"] },
      { pick: "none", edit: "Edit", disabled: ["Edit", "Diff", "Organizer"] },
    ];
    for (const c of cases) {
      it(`exactly ${c.disabled.join(", ")} are type-disabled for ${c.pick}`, async () => {
        await renderShell(ALL_ON, c.pick);
        const names = ["Edit", "Diff", "Organizer"].map((n) =>
          n === "Edit" ? c.edit : n,
        );
        const off = names.filter((n) => tab(n).hasAttribute("disabled"));
        const expected = c.disabled.map((n) => (n === "Edit" ? c.edit : n));
        expect(off.sort()).toEqual(expected.sort());
        for (const n of ["Data", "Trash"]) {
          expect(tab(n)).not.toBeDisabled();
        }
      });
    }
  });

  describe("disabled-view reasons", () => {
    it("explains timeline, entities and graph when their flags are off", async () => {
      await renderShell({}, "text");
      expect(tab("Timeline")).toBeDisabled();
      expect(tab("Entities")).toBeDisabled();
      expect(tab("Graph")).toBeDisabled();
      expect(reasonOf("Timeline")).toBe(TIMELINE_REASON);
      expect(reasonOf("Entities")).toBe(ENTITIES_REASON);
      expect(reasonOf("Graph")).toBe(ENTITIES_REASON);
    });

    it("carries no reason on a type-disabled view or an always-enabled view", async () => {
      await renderShell(ALL_ON, "none");
      expect(tab("Edit")).toBeDisabled();
      expect(reasonOf("Edit")).toBeNull();
      expect(reasonOf("Diff")).toBeNull();
      expect(reasonOf("Organizer")).toBeNull();
      expect(reasonOf("Data")).toBeNull();
      expect(reasonOf("Trash")).toBeNull();
    });

    it("drops the reasons once the flags are on", async () => {
      await renderShell(ALL_ON, "text");
      expect(reasonOf("Timeline")).toBeNull();
      expect(reasonOf("Entities")).toBeNull();
      expect(reasonOf("Graph")).toBeNull();
    });

    it("keeps timeline off when only the entities flag is on, and the reverse", async () => {
      await renderShell({ entities: true }, "text");
      expect(tab("Timeline")).toBeDisabled();
      expect(tab("Entities")).not.toBeDisabled();
      expect(tab("Graph")).not.toBeDisabled();
    });
  });

  describe("view reset on selection change (AppShell.tsx:465-505)", () => {
    it("text selected while on organizer moves to edit", async () => {
      const store = await renderShell(ALL_ON, "folder");
      expect(isActive("Organizer")).toBe(true);
      await select(store, "text");
      expect(isActive("Edit")).toBe(true);
      expect(mountedMarkers()).toEqual(["view-edit"]);
    });

    it("source selected while on organizer moves to edit", async () => {
      const store = await renderShell(ALL_ON, "folder");
      await select(store, "source");
      expect(isActive("Edit")).toBe(true);
    });

    it("folder selected while on edit moves to organizer", async () => {
      const store = await renderShell(ALL_ON, "text");
      await select(store, "folder");
      expect(isActive("Organizer")).toBe(true);
      expect(mountedMarkers()).toEqual(["view-organizer"]);
    });

    it("folder selected while on diff moves to organizer", async () => {
      const store = await renderShell(ALL_ON, "text");
      await open("Diff");
      await select(store, "folder");
      expect(isActive("Organizer")).toBe(true);
    });

    it("image or audio selected while on organizer, diff or timeline moves to edit", async () => {
      const store = await renderShell(ALL_ON, "folder");
      await select(store, "image");
      expect(isActive("Media")).toBe(true);

      await select(store, "text");
      await open("Diff");
      await select(store, "audio");
      expect(isActive("Media")).toBe(true);

      await open("Timeline");
      await select(store, "image");
      expect(isActive("Media")).toBe(true);
    });

    it("keeps the data view across text, folder and media selections", async () => {
      const store = await renderShell(ALL_ON, "text");
      await open("Data");
      for (const pick of ["folder", "text", "source", "image"] as const) {
        await select(store, pick);
        expect(isActive("Data")).toBe(true);
        expect(mountedMarkers()).toEqual(["view-data"]);
      }
    });

    it("keeps timeline across text and folder selections", async () => {
      const store = await renderShell(ALL_ON, "text");
      await open("Timeline");
      await select(store, "folder");
      expect(isActive("Timeline")).toBe(true);
      await select(store, "text");
      expect(isActive("Timeline")).toBe(true);
    });

    it("keeps trash, entities and graph across selections", async () => {
      const store = await renderShell(ALL_ON, "text");
      await open("Trash");
      await select(store, "folder");
      expect(isActive("Trash")).toBe(true);
      await open("Entities");
      await select(store, "image");
      expect(isActive("Entities")).toBe(true);
      await open("Graph");
      await select(store, "text");
      expect(isActive("Graph")).toBe(true);
    });

    it("leaves the view alone when the selection is cleared", async () => {
      const store = await renderShell(ALL_ON, "folder");
      expect(isActive("Organizer")).toBe(true);
      act(() => {
        store.dispatch(setSelectedResourceId(null as never));
      });
      await flushPendingEffects();
      expect(isActive("Organizer")).toBe(true);
    });

    it("the one-shot suppression flag skips the reset once and is then cleared", async () => {
      const store = await renderShell(ALL_ON, "folder");
      act(() => {
        store.dispatch(setSuppressNextViewAutoSwitch(true));
        store.dispatch(setSelectedResourceId(text.id));
      });
      await flushPendingEffects();
      expect(isActive("Organizer")).toBe(true);
      expect(store.getState().resources.suppressNextViewAutoSwitch).toBe(false);

      await select(store, "source");
      expect(isActive("Edit")).toBe(true);
    });
  });

  describe("timeline fallback when the view is turned off (AppShell.tsx:508-516)", () => {
    it("falls back to edit for a text selection", async () => {
      const store = await renderShell(ALL_ON, "text");
      await open("Timeline");
      act(() => seedProject(store, { ...ALL_ON, timelineView: false }));
      await flushPendingEffects();
      expect(isActive("Edit")).toBe(true);
      expect(tab("Timeline")).toBeDisabled();
    });

    it("falls back to organizer for a folder selection", async () => {
      const store = await renderShell(ALL_ON, "folder");
      await open("Timeline");
      act(() => seedProject(store, { ...ALL_ON, timelineView: false }));
      await flushPendingEffects();
      expect(isActive("Organizer")).toBe(true);
    });

    it("falls back to edit with no selection", async () => {
      const store = await renderShell(ALL_ON, "none");
      await open("Timeline");
      act(() => seedProject(store, { ...ALL_ON, timelineView: false }));
      await flushPendingEffects();
      expect(isActive("Edit")).toBe(true);
    });

    it("does not touch other views when the timeline view is off", async () => {
      await renderShell({ entities: true }, "text");
      await open("Data");
      expect(isActive("Data")).toBe(true);
    });
  });

  describe("entities turned off while an entity view is open", () => {
    it("renders nothing for the roster and graph and does not reset the view", async () => {
      const store = await renderShell(ALL_ON, "text");
      await open("Entities");
      act(() => seedProject(store, { timelineView: true, entities: false }));
      await flushPendingEffects();
      expect(isActive("Entities")).toBe(true);
      expect(screen.queryByTestId("entity-roster-view")).toBeNull();
      expect(tab("Entities")).toBeDisabled();
    });
  });

  describe("Sources module view (Feature 103 Task 13, FR-6 (d), FR-15)", () => {
    const SOURCES_OFF = { sources: false };
    const sourceRow = () =>
      within(
        screen.getByRole("table", { name: "Sources in this project" }),
      ).getByRole("button", { name: "Source A" });
    const sourcesTab = () => screen.queryByRole("tab", { name: "Sources" });

    it("pins the ViewName literal to the registry view id", () => {
      expect(MODULE_MANIFEST.find((m) => m.id === "sources")?.view?.id).toBe(
        "sources",
      );
      const view: ViewName = "sources";
      expect(view).toBe(MODULE_MANIFEST[0].view?.id);
    });

    it("offers the tab when the module has no entry (on by default) and when on", async () => {
      await renderShell(ALL_ON, "text");
      expect(sourcesTab()).not.toBeNull();
      expect(tab("Sources")).not.toBeDisabled();
      cleanup();
      await renderShell(ALL_ON, "text", { sources: true });
      expect(sourcesTab()).not.toBeNull();
    });

    it("leaves the tab out of the list entirely when the module is off", async () => {
      await renderShell(ALL_ON, "text", SOURCES_OFF);
      expect(sourcesTab()).toBeNull();
      expect(
        screen
          .getAllByRole("tab")
          .map((t: HTMLElement) => t.textContent?.trim()),
      ).toEqual([
        "Edit",
        "Organizer",
        "Data",
        "Diff",
        "Timeline",
        "Entities",
        "Graph",
        "Trash",
      ]);
    });

    it("is reachable with no resource selected and renders before the guard", async () => {
      await renderShell(ALL_ON, "none");
      expect(tab("Sources")).not.toBeDisabled();
      await open("Sources");
      expect(isActive("Sources")).toBe(true);
      expect(
        screen.getByRole("heading", { name: "Sources" }),
      ).toBeInTheDocument();
      expect(sourceRow()).toBeInTheDocument();
      expect(screen.queryByText(/Resource not found/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Select a file from the resource tree/i),
      ).not.toBeInTheDocument();
    });

    it("is reachable with every optional flag off and with each selection kind", async () => {
      for (const pick of [
        "none",
        "text",
        "folder",
        "source",
        "image",
        "audio",
      ] as const) {
        await renderShell({}, pick);
        await open("Sources");
        expect(isActive("Sources")).toBe(true);
        expect(sourceRow()).toBeInTheDocument();
        cleanup();
      }
    });

    it("keeps the view across selections that reset other views", async () => {
      const store = await renderShell(ALL_ON, "folder");
      await open("Sources");
      for (const pick of ["text", "image", "folder", "source"] as const) {
        await select(store, pick);
        expect(isActive("Sources")).toBe(true);
      }
    });

    it("opening a row selects the Source and shows the editor", async () => {
      const store = await renderShell(ALL_ON, "none");
      await open("Sources");
      fireEvent.click(sourceRow());
      await flushPendingEffects();
      expect(store.getState().resources.selectedResourceId).toBe(source.id);
      expect(isActive("Edit")).toBe(true);
      expect(mountedMarkers()).toEqual(["view-edit"]);
    });

    // Task 39: the landing view is the one the shell's existing selection
    // reset produces from Edit (AppShell.tsx view reset, Task 11 cases "view
    // reset on selection change"); the shell has no landing for no selection.
    it.each([
      ["text", "Edit", "view-edit"],
      ["source", "Edit", "view-edit"],
      ["folder", "Organizer", "view-organizer"],
      ["image", "Media", "view-media"],
      ["audio", "Media", "view-media"],
    ] as const)(
      "lands on the view enabled for the selection when the module is switched off while the view is open (selection: %s lands on %s)",
      async (pick, landing, marker) => {
        const store = await renderShell(ALL_ON, pick);
        await open("Sources");
        expect(isActive("Sources")).toBe(true);
        act(() => seedProject(store, ALL_ON, SOURCES_OFF));
        await flushPendingEffects();
        expect(sourcesTab()).toBeNull();
        expect(isActive(landing)).toBe(true);
        expect(tab(landing)).not.toBeDisabled();
        expect(mountedMarkers()).toEqual([marker]);
      },
    );

    it("does not land on the type-disabled Edit tab with no selection (selection: none lands on no tab)", async () => {
      const store = await renderShell(ALL_ON, "none");
      await open("Sources");
      expect(isActive("Sources")).toBe(true);
      act(() => seedProject(store, ALL_ON, SOURCES_OFF));
      await flushPendingEffects();
      expect(sourcesTab()).toBeNull();
      expect(tab("Edit")).toBeDisabled();
      expect(isActive("Edit")).toBe(false);
      expect(
        screen
          .getAllByRole("tab")
          .filter(
            (t: HTMLElement) => t.getAttribute("aria-selected") === "true",
          ),
      ).toEqual([]);
    });

    it("does not move another open view when the module is switched off", async () => {
      const store = await renderShell(ALL_ON, "text");
      await open("Data");
      act(() => seedProject(store, ALL_ON, SOURCES_OFF));
      await flushPendingEffects();
      expect(isActive("Data")).toBe(true);
    });

    it("brings the tab back when the module is switched on again", async () => {
      const store = await renderShell(ALL_ON, "text", SOURCES_OFF);
      expect(sourcesTab()).toBeNull();
      act(() => seedProject(store, ALL_ON, { sources: true }));
      await flushPendingEffects();
      expect(sourcesTab()).not.toBeNull();
    });
  });
});
