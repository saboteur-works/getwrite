/** @vitest-environment jsdom */
/**
 * Feature 110, Task 22 (FR-14): pin that opening, scrolling and closing the
 * Narratives tab writes nothing, and that the only write is the per-device
 * remembered selection when the writer changes it. Pin tests over the
 * committed Task 20 tab; no production code is changed.
 *
 * Write paths watched: every call to a function of a typed API client whose
 * name is a write verb (revisions and sidecars through `resources`, writing
 * log, folder sidecar, modules, projects, attachments, tags, annotations,
 * claims, trash, project types, organizer, goals, spelling, entity graph),
 * every non-GET `fetch` (so `project.json`, the subtype list, the metadata
 * schema and `config.modules` routes are covered), the Redux `projects` and
 * `resources` slice references, and every `localStorage` write.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "react-redux";

const spy = vi.hoisted(() => {
  const calls: string[] = [];
  const WRITE =
    /^(create|update|delete|save|set|put|post|write|add|remove|rename|restore|purge|move|reorder|append|record|replace|toggle|empty|import|mutate|clear|apply|capture|upload|unlock|lock)/i;
  function wrap<T extends object>(mod: T, label: string): T {
    const out: Record<string, unknown> = {
      ...(mod as Record<string, unknown>),
    };
    for (const [key, value] of Object.entries(mod)) {
      if (typeof value !== "function") continue;
      const fn = value as (...a: unknown[]) => unknown;
      out[key] = (...args: unknown[]) => {
        if (WRITE.test(key)) calls.push(`${label}.${key}`);
        return fn(...args);
      };
    }
    return out as T;
  }
  return { calls, wrap };
});

vi.mock("../../src/lib/api/resources", async (o) =>
  spy.wrap(await o<object>(), "resources"),
);
vi.mock("../../src/lib/api/writing-log", async (o) =>
  spy.wrap(await o<object>(), "writing-log"),
);
vi.mock("../../src/lib/api/folder-metadata", async (o) =>
  spy.wrap(await o<object>(), "folder-metadata"),
);
vi.mock("../../src/lib/api/modules", async (o) =>
  spy.wrap(await o<object>(), "modules"),
);
vi.mock("../../src/lib/api/projects", async (o) =>
  spy.wrap(await o<object>(), "projects"),
);
vi.mock("../../src/lib/api/source-attachments", async (o) =>
  spy.wrap(await o<object>(), "source-attachments"),
);
vi.mock("../../src/lib/api/folklore", async (o) =>
  spy.wrap(await o<object>(), "folklore"),
);
vi.mock("../../src/lib/api/tags", async (o) =>
  spy.wrap(await o<object>(), "tags"),
);
vi.mock("../../src/lib/api/preferences", async (o) =>
  spy.wrap(await o<object>(), "preferences"),
);
vi.mock("../../src/lib/api/annotations", async (o) =>
  spy.wrap(await o<object>(), "annotations"),
);
vi.mock("../../src/lib/api/claims", async (o) =>
  spy.wrap(await o<object>(), "claims"),
);
vi.mock("../../src/lib/api/trash", async (o) =>
  spy.wrap(await o<object>(), "trash"),
);
vi.mock("../../src/lib/api/project-types", async (o) =>
  spy.wrap(await o<object>(), "project-types"),
);
vi.mock("../../src/lib/api/organizer-field-write", async (o) =>
  spy.wrap(await o<object>(), "organizer-field-write"),
);
vi.mock("../../src/lib/api/organizer-arrangements", async (o) =>
  spy.wrap(await o<object>(), "organizer-arrangements"),
);
vi.mock("../../src/lib/api/compile-defaults", async (o) =>
  spy.wrap(await o<object>(), "compile-defaults"),
);
vi.mock("../../src/lib/api/export-defaults", async (o) =>
  spy.wrap(await o<object>(), "export-defaults"),
);
vi.mock("../../src/lib/api/word-count-goal", async (o) =>
  spy.wrap(await o<object>(), "word-count-goal"),
);
vi.mock("../../src/lib/api/goal-filter", async (o) =>
  spy.wrap(await o<object>(), "goal-filter"),
);
vi.mock("../../src/lib/api/project-spelling", async (o) =>
  spy.wrap(await o<object>(), "project-spelling"),
);
vi.mock("../../src/lib/api/entity-relationships", async (o) =>
  spy.wrap(await o<object>(), "entity-relationships"),
);
vi.mock("../../src/lib/api/entity-graph-positions", async (o) =>
  spy.wrap(await o<object>(), "entity-graph-positions"),
);

import { makeStore } from "../../src/store/store";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setFolders, setResources } from "../../src/store/resourcesSlice";
import NarrativesView from "../../components/Folklore/NarrativesView";
import type { NarrativeListDeps } from "../../components/Folklore/useNarrativeList";
import type { VariantTextsDeps } from "../../components/Folklore/useVariantTexts";
import {
  folkloreSelectionStorageKey,
  readFolkloreSelection,
} from "../../src/lib/folklore-selection-preference";
import type { AnyResource, Folder } from "../../src/lib/models/types";

const PROJECT_DIR = "proj-narr22";

const narrativeFolder = {
  id: "n1",
  name: "Cinderella",
  slug: "n1",
  type: "folder",
  orderIndex: 0,
  parentId: null,
} as unknown as Folder;

function variant(id: string, order: number): AnyResource {
  return {
    id,
    slug: id,
    name: `Telling ${id}`,
    type: "source",
    folderId: "n1",
    orderIndex: order,
    resourceSubtype: "Variant",
  } as unknown as AnyResource;
}

const narrativeDeps: NarrativeListDeps = {
  getFolderMetadata: vi.fn(async () => ({
    notes: "",
    fieldValues: {},
    resourceSubtype: "Narrative",
  })),
};
const textDeps: VariantTextsDeps = {
  readVariantText: vi.fn(async (_p: string, id: string) => ({
    kind: "text" as const,
    text: `Body of ${id}`,
  })),
  listAttachments: vi.fn(async () => []),
};

let fetchCalls: { url: string; method: string }[] = [];
let storageWrites: string[] = [];

beforeEach(() => {
  spy.calls.length = 0;
  fetchCalls = [];
  storageWrites = [];
  window.localStorage.clear();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({
        url: String(input),
        method: (init?.method ?? "GET").toUpperCase(),
      });
      return new Response("{}", { status: 200 });
    },
  );
  const proto = Object.getPrototypeOf(window.localStorage) as Storage;
  for (const name of ["setItem", "removeItem", "clear"] as const) {
    const original = proto[name] as (...a: string[]) => void;
    vi.spyOn(proto, name).mockImplementation(function (
      this: Storage,
      ...a: string[]
    ) {
      storageWrites.push(`${name}:${a[0] ?? ""}`);
      return original.apply(this, a);
    });
  }
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount() {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_DIR,
      rootPath: `/projects/${PROJECT_DIR}`,
      name: "P",
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_DIR));
  store.dispatch(setFolders([narrativeFolder]));
  store.dispatch(setResources([variant("s1", 0), variant("s2", 1)]));
  const before = store.getState();
  const view = render(
    <Provider store={store}>
      <StaticSharingLimitsProvider value={{}}>
        <NarrativesView
          openInEditor={vi.fn()}
          deps={{ narratives: narrativeDeps, texts: textDeps }}
        />
      </StaticSharingLimitsProvider>
    </Provider>,
  );
  return { store, before, view };
}

function nonGetFetches(): string[] {
  return fetchCalls
    .filter((c) => c.method !== "GET")
    .map((c) => `${c.method} ${c.url}`);
}

describe("opening, scrolling and closing the comparison writes nothing", () => {
  it("writes nothing at all on the first open, before any choice", async () => {
    const { store, before } = mount();
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    expect(spy.calls).toEqual([]);
    expect(nonGetFetches()).toEqual([]);
    expect(storageWrites).toEqual([]);
    expect(readFolkloreSelection(PROJECT_DIR).status).toBe("none");
    expect(store.getState().projects).toBe(before.projects);
    expect(store.getState().resources).toBe(before.resources);
  });

  it("records no write across open, scroll and close with two columns", async () => {
    const { store, view } = mount();
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    // Choose both variants (a selection change, pinned below), then clear the
    // records so only scroll and close are measured.
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select Telling s1 for comparison",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select Telling s2 for comparison",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare (2)" }));
    await screen.findByTestId("comparison-columns");
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(2),
    );
    spy.calls.length = 0;
    storageWrites = [];
    fetchCalls = [];
    const stateAfterOpen = store.getState();

    for (const body of screen.getAllByTestId("comparison-column-body")) {
      fireEvent.scroll(body, { target: { scrollTop: 120 } });
      fireEvent.scroll(body, { target: { scrollTop: 0 } });
    }
    view.unmount();

    expect(spy.calls).toEqual([]);
    expect(nonGetFetches()).toEqual([]);
    expect(storageWrites).toEqual([]);
    expect(store.getState().projects).toBe(stateAfterOpen.projects);
    expect(store.getState().resources).toBe(stateAfterOpen.resources);
  });
});

describe("the one write is the remembered selection", () => {
  it("writes only the device preference key when the selection changes", async () => {
    mount();
    await screen.findByRole("list", { name: "Variants of Cinderella" });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select Telling s1 for comparison",
      }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select Telling s2 for comparison",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Compare (2)" }));
    await screen.findByTestId("comparison-columns");
    const key = folkloreSelectionStorageKey(PROJECT_DIR);
    expect(storageWrites.length).toBeGreaterThan(0);
    expect(storageWrites.every((w) => w === `setItem:${key}`)).toBe(true);
    expect(readFolkloreSelection(PROJECT_DIR)).toMatchObject({
      status: "stored",
      selection: { narrativeId: "n1", variantIds: ["s1", "s2"] },
    });
    expect(spy.calls).toEqual([]);
    expect(nonGetFetches()).toEqual([]);
  });
});
