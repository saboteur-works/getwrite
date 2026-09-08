import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import EntityMentionsSection, {
  useEntityAliasTable,
  resolveCooccurringEntityName,
} from "../../components/Sidebar/EntityMentionsSection";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
  getProjectDirectoryId,
} from "../../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource, Folder } from "../../src/lib/models/types";
import type { EntityMentionedIn } from "../../src/lib/models/mentions-core";
import type { EntityCooccurrenceEntry } from "../../src/lib/api/entity-cooccurrence";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import { runCompileAndDownload } from "../../src/lib/compile/run-compile-and-download";

vi.mock("../../src/lib/compile/run-compile-and-download", () => ({
  runCompileAndDownload: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";

const runCompileAndDownloadMock = vi.mocked(runCompileAndDownload);
const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);

const PROJECT_PATH = "/tmp/test-project";

function setupStore(resourceId: string, overrides: Partial<AnyResource> = {}) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "proj-test-1",
      name: "Test Project",
      rootPath: PROJECT_PATH,
    }),
  );
  store.dispatch(setSelectedProjectId("proj-test-1"));
  const res = createTextResource({ name: "Aria" });
  (res as unknown as { id: string }).id = resourceId;
  Object.assign(res, { entityKind: "character" }, overrides);
  store.dispatch(setResources([res]));
  store.dispatch(setSelectedResourceId(resourceId));
  return store;
}

function mockMentionedIn(mentionedIn: EntityMentionedIn[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input.toString();
    if (url.includes("/mentioned-in")) {
      return { ok: true, json: async () => ({ mentionedIn }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

/**
 * Task 6 — mocks both the existing `/mentioned-in` fetch and the new
 * `/entity-cooccurrence` fetch behind a single `fetch` spy, matching how
 * `EntityMentionsSection.tsx` fetches them from two independent effects.
 */
function mockMentionedInAndCooccurrence(
  mentionedIn: EntityMentionedIn[],
  cooccurrence: Record<string, EntityCooccurrenceEntry[]> = {},
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input.toString();
    if (url.includes("/mentioned-in")) {
      return { ok: true, json: async () => ({ mentionedIn }) } as Response;
    }
    if (url.includes("/entity-cooccurrence")) {
      return { ok: true, json: async () => cooccurrence } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  runCompileAndDownloadMock.mockClear();
});

describe("EntityMentionsSection", () => {
  it("renders nothing when the selected resource has no entityKind", async () => {
    mockMentionedIn([]);
    const store = setupStore("res-plain", { entityKind: undefined });

    const { container } = render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows only a Linked badge for an explicit-only row", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-1",
        name: "Chapter One",
        snippets: [],
        isLinked: true,
        isMentioned: false,
        ambiguousWith: [],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    expect(await screen.findByText("Chapter One")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Chapter One-linked-badge"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Chapter One-mentioned-badge"),
    ).not.toBeInTheDocument();
  });

  it("shows only a Mentioned badge and its snippet for a detected-only row", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-2",
        name: "Chapter Two",
        snippets: ["Aria drew her blade."],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    expect(await screen.findByText("Chapter Two")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Chapter Two-mentioned-badge"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Chapter Two-linked-badge"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Aria drew her blade.")).toBeInTheDocument();
  });

  it("shows a single row with both badges for a resource that is both linked and mentioned", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-3",
        name: "Chapter Three",
        snippets: ["Aria nodded."],
        isLinked: true,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    expect(await screen.findAllByText("Chapter Three")).toHaveLength(1);
    expect(
      screen.getByLabelText("Chapter Three-linked-badge"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Chapter Three-mentioned-badge"),
    ).toBeInTheDocument();
  });

  it("shows an ambiguity indicator naming the other claiming entities", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-4",
        name: "Chapter Four",
        snippets: ["May arrived at dawn."],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [["Bob"]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    expect(await screen.findByText("May arrived at dawn.")).toBeInTheDocument();
    expect(screen.getByText(/Ambiguous/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it("navigates to the mentioning resource on click", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-5",
        name: "Chapter Five",
        snippets: ["Aria left."],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    fireEvent.click(await screen.findByText("Chapter Five"));

    await waitFor(() => {
      expect(store.getState().resources.selectedResourceId).toBe("scene-5");
    });
  });

  it("disables the compile trigger with a visible explanation when there are no associated resources", async () => {
    mockMentionedIn([]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    expect(
      screen.queryByLabelText("entity-mentions-list"),
    ).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: "Compile this entity's resources",
    });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("No associated resources to compile."),
    ).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(
      screen.queryByTestId("compile-preview-modal"),
    ).not.toBeInTheDocument();
  });

  describe("entity-scoped compile trigger", () => {
    function makeResource(
      id: string,
      name: string,
      orderIndex: number,
      type: AnyResource["type"] = "text",
    ): AnyResource {
      const res = createTextResource({ name });
      (res as unknown as { id: string }).id = id;
      Object.assign(res, { orderIndex, type });
      return res as AnyResource;
    }

    function setupStoreWithResources(
      entityId: string,
      resources: AnyResource[],
    ) {
      const store = makeStore();
      store.dispatch(
        setProject({
          id: "proj-test-1",
          name: "Test Project",
          rootPath: PROJECT_PATH,
        }),
      );
      store.dispatch(setSelectedProjectId("proj-test-1"));
      const entity = createTextResource({ name: "Aria" });
      (entity as unknown as { id: string }).id = entityId;
      Object.assign(entity, { entityKind: "character" });
      store.dispatch(setResources([entity, ...resources]));
      store.dispatch(setSelectedResourceId(entityId));
      return store;
    }

    it("is enabled, keyboard-operable, and has an accessible name when rows exist", async () => {
      mockMentionedIn([
        {
          resourceId: "res-b",
          name: "Scene B",
          snippets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
      ]);
      const resources = [makeResource("res-b", "Scene B", 0)];
      const store = setupStoreWithResources("entity-aria", resources);

      render(
        <Provider store={store}>
          <EntityMentionsSection />
        </Provider>,
      );

      const trigger = await screen.findByRole("button", {
        name: "Compile this entity's resources",
      });
      expect(trigger).not.toBeDisabled();

      trigger.focus();
      expect(trigger).toHaveFocus();
      fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
      fireEvent.click(trigger);

      expect(
        await screen.findByTestId("compile-preview-modal"),
      ).toBeInTheDocument();
    });

    it("opens the modal pre-populated with the FR-2 merged set in FR-3 tree order", async () => {
      mockMentionedIn([
        {
          resourceId: "res-b",
          name: "Scene B",
          snippets: ["mentioned"],
          isLinked: false,
          isMentioned: true,
          ambiguousWith: [[]],
        },
        {
          resourceId: "res-a",
          name: "Scene A",
          snippets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
      ]);
      // Tree order (by orderIndex) is A then B, opposite of fetch order.
      const resources = [
        makeResource("res-a", "Scene A", 0),
        makeResource("res-b", "Scene B", 1),
      ];
      const store = setupStoreWithResources("entity-aria", resources);

      render(
        <Provider store={store}>
          <EntityMentionsSection />
        </Provider>,
      );

      const trigger = await screen.findByRole("button", {
        name: "Compile this entity's resources",
      });
      fireEvent.click(trigger);

      const listItems = await screen.findAllByTestId(
        "entity-compile-resource-list-item",
      );
      expect(listItems).toHaveLength(2);
      expect(listItems[0]).toHaveTextContent("Scene A");
      expect(listItems[1]).toHaveTextContent("Scene B");
    });

    it("calls runCompileAndDownload with exactly the ordered merged-set ids on confirm", async () => {
      mockMentionedIn([
        {
          resourceId: "res-b",
          name: "Scene B",
          snippets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
        {
          resourceId: "res-a",
          name: "Scene A",
          snippets: ["mentioned"],
          isLinked: false,
          isMentioned: true,
          ambiguousWith: [[]],
        },
      ]);
      const resources = [
        makeResource("res-a", "Scene A", 0),
        makeResource("res-b", "Scene B", 1),
      ];
      const store = setupStoreWithResources("entity-aria", resources);

      render(
        <Provider store={store}>
          <EntityMentionsSection />
        </Provider>,
      );

      const trigger = await screen.findByRole("button", {
        name: "Compile this entity's resources",
      });
      fireEvent.click(trigger);

      const compileButton = await screen.findByRole("button", {
        name: /Compile \(2\)/,
      });
      fireEvent.click(compileButton);

      await waitFor(() => {
        expect(runCompileAndDownloadMock).toHaveBeenCalledTimes(1);
      });
      const [compileBody] = runCompileAndDownloadMock.mock.calls[0];
      expect(compileBody.resourceIds).toEqual(["res-a", "res-b"]);
      expect(compileBody.projectId).toBe(getProjectDirectoryId(PROJECT_PATH));
      expect(compileBody.projectName).toBe("Test Project");
    });

    // Regression (FR-3): `buildResourceTree` resolves a resource's `folderId`
    // against folder entries in the *same* array and silently re-parents to
    // root anything whose parent is absent. Passing only the resources slice
    // therefore flattens the tree, and the depth-first walk degrades into a
    // global `orderIndex` sort — which put same-folder siblings far apart in
    // the real app while every existing test still passed, because those
    // fixtures had no folders at all.
    //
    // Both folders here hold an orderIndex-0 and an orderIndex-1 scene, so
    // the two orderings are distinguishable:
    //   depth-first (correct): f1s1, f1s2, f2s1, f2s2
    //   global orderIndex sort (bug): f1s1, f2s1, f1s2, f2s2
    it("orders resources depth-first by folder, not by a flat orderIndex sort (FR-3)", async () => {
      mockMentionedIn(
        ["f2s2", "f1s2", "f2s1", "f1s1"].map((id) => ({
          resourceId: id,
          name: id,
          snippets: [],
          isLinked: false,
          isMentioned: true,
          ambiguousWith: [[]],
        })),
      );

      const folder = (id: string, orderIndex: number): Folder =>
        ({
          id,
          slug: id,
          name: id,
          type: "folder",
          createdAt: "",
          updatedAt: "",
          userMetadata: {},
          orderIndex,
        }) as unknown as Folder;

      const inFolder = (
        id: string,
        folderId: string,
        orderIndex: number,
      ): AnyResource => {
        const res = makeResource(id, id, orderIndex);
        Object.assign(res, { folderId });
        return res;
      };

      const store = setupStoreWithResources("entity-aria", [
        inFolder("f1s1", "folder-1", 0),
        inFolder("f1s2", "folder-1", 1),
        inFolder("f2s1", "folder-2", 0),
        inFolder("f2s2", "folder-2", 1),
      ]);
      store.dispatch(
        setFolders([folder("folder-1", 0), folder("folder-2", 1)]),
      );

      render(
        <Provider store={store}>
          <EntityMentionsSection />
        </Provider>,
      );

      const trigger = await screen.findByRole("button", {
        name: "Compile this entity's resources",
      });
      fireEvent.click(trigger);

      const compileButton = await screen.findByRole("button", {
        name: /Compile \(4\)/,
      });
      fireEvent.click(compileButton);

      await waitFor(() => {
        expect(runCompileAndDownloadMock).toHaveBeenCalledTimes(1);
      });
      const [compileBody] = runCompileAndDownloadMock.mock.calls[0];
      expect(compileBody.resourceIds).toEqual(["f1s1", "f1s2", "f2s1", "f2s2"]);
    });
  });

  it("shows a distinct loading state before mentions resolve", async () => {
    // Task 6 added a second, independent `fetch` (co-occurrence) alongside
    // the existing mentioned-in fetch, so resolvers are tracked per URL
    // rather than assuming a single in-flight `fetch` call.
    let resolveMentionedIn: (value: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("/mentioned-in")) {
        return new Promise<Response>((resolve) => {
          resolveMentionedIn = resolve;
        });
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    expect(await screen.findByRole("status")).toBeInTheDocument();

    resolveMentionedIn({
      ok: true,
      json: async () => ({ mentionedIn: [] }),
    } as Response);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});

// Task 5 (`specs/features/entity-cooccurrence.md`) — alias-table name
// resolution wiring `EntityMentionsSection.tsx` exposes for Task 6 to
// consume. These tests exercise the resolution helper/selector-usage in
// isolation, per the task's own instructions: there is no "Also appears
// with" list to assert on yet (that is Task 6), so these tests do not touch
// EntityMentionsSection's rendered output at all.
describe("EntityMentionsSection alias-table name resolution (Task 5)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ALIAS_PROJECT_ID = "proj-cooccurrence-alias";

  function AliasTableProbe(): React.JSX.Element {
    const aliasTable = useEntityAliasTable();
    return (
      <span data-testid="resolved-name">
        {resolveCooccurringEntityName(aliasTable, "entity-priya")}
      </span>
    );
  }

  it("resolves a co-occurring entity's display name from the Redux-cached alias table via useEntityAliasTable/useAppSelector(selectEntityAliasTable), with no new fetch or dispatch beyond the existing fetchEntityAliasTable lifecycle", async () => {
    const table: EntityAliasTable = {
      entities: {
        "entity-priya": {
          entityId: "entity-priya",
          entityKind: "character",
          name: "Priya",
          aliases: [],
          terms: ["Priya"],
        },
      },
      claimedBy: {},
    };
    mockedGetEntityAliasTable.mockResolvedValue(table);

    const store = makeStore();
    store.dispatch(
      setProject({
        id: ALIAS_PROJECT_ID,
        name: "Alias Project",
        rootPath: `/tmp/${ALIAS_PROJECT_ID}`,
      }),
    );
    store.dispatch(setSelectedProjectId(ALIAS_PROJECT_ID));

    // The existing, already-wired refetch lifecycle (project load) —
    // exercised directly here rather than via a full project-load flow,
    // since that lifecycle is not this task's concern. This is the only
    // dispatch this test makes beyond store setup.
    await store.dispatch(fetchEntityAliasTable(ALIAS_PROJECT_ID));
    expect(mockedGetEntityAliasTable).toHaveBeenCalledTimes(1);

    render(
      <Provider store={store}>
        <AliasTableProbe />
      </Provider>,
    );

    // Rendering the probe (which reads the cache via `useEntityAliasTable`)
    // triggers no additional call to the alias-table transport.
    expect(mockedGetEntityAliasTable).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("resolved-name")).toHaveTextContent("Priya");
  });

  it("falls back to the raw entity id, rather than throwing or rendering blank, for an id absent from the alias table", () => {
    const table: EntityAliasTable = { entities: {}, claimedBy: {} };

    expect(resolveCooccurringEntityName(table, "entity-stale-ref")).toBe(
      "entity-stale-ref",
    );

    render(
      <span data-testid="resolved-name">
        {resolveCooccurringEntityName(table, "entity-stale-ref")}
      </span>,
    );
    expect(screen.getByTestId("resolved-name")).toHaveTextContent(
      "entity-stale-ref",
    );
  });

  it("does not regress EntityMentionsSection's existing render while the resolution helper is available for reuse", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-1",
        name: "Chapter One",
        snippets: [],
        isLinked: true,
        isMentioned: false,
        ambiguousWith: [],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    expect(await screen.findByText("Chapter One")).toBeInTheDocument();
    // No "Also appears with" list exists yet (Task 6's scope) — confirming
    // this component's render is unchanged by Task 5's wiring.
    expect(
      screen.queryByLabelText("entity-cooccurrence-list"),
    ).not.toBeInTheDocument();
  });
});

// Task 6 (`specs/features/entity-cooccurrence.md`) — the "Also appears with"
// list for the selected entity.
describe("EntityMentionsSection co-occurrence list (Task 6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const COOCCURRENCE_ALIAS_TABLE: EntityAliasTable = {
    entities: {
      "entity-priya": {
        entityId: "entity-priya",
        entityKind: "character",
        name: "Priya",
        aliases: [],
        terms: ["Priya"],
      },
      "entity-bob": {
        entityId: "entity-bob",
        entityKind: "character",
        name: "bob",
        aliases: [],
        terms: ["bob"],
      },
      "entity-marcus": {
        entityId: "entity-marcus",
        entityKind: "character",
        name: "Marcus",
        aliases: [],
        terms: ["Marcus"],
      },
    },
    claimedBy: {},
  };

  async function setupStoreWithAliasTable(
    resourceId: string,
    aliasTable: EntityAliasTable = COOCCURRENCE_ALIAS_TABLE,
  ) {
    mockedGetEntityAliasTable.mockResolvedValue(aliasTable);
    const store = setupStore(resourceId);
    await store.dispatch(fetchEntityAliasTable("proj-test-1"));
    return store;
  }

  it("orders entries by count descending with a case-insensitive alphabetical tie-break (FR-6)", async () => {
    mockMentionedInAndCooccurrence([], {
      "entity-aria": [
        { entityId: "entity-priya", count: 3, resourceIds: ["r1", "r2", "r3"] },
        { entityId: "entity-marcus", count: 1, resourceIds: ["r1"] },
        { entityId: "entity-bob", count: 3, resourceIds: ["r1", "r2", "r3"] },
      ],
    });
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    const list = await screen.findByLabelText("entity-cooccurrence-list");
    const items = within(list).getAllByRole("listitem");
    // Tie between "Priya" (3) and "bob" (3) is broken case-insensitively:
    // "bob" sorts before "Priya" alphabetically ignoring case.
    expect(items.map((item: HTMLElement) => item.textContent)).toEqual([
      "bob (3), ",
      "Priya (3), ",
      "Marcus (1)",
    ]);
  });

  it("renders no heading, line, or empty-state text when the selected entity has no co-occurrence entry (FR-7)", async () => {
    mockMentionedInAndCooccurrence(
      [
        {
          resourceId: "scene-1",
          name: "Chapter One",
          snippets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
      ],
      {
        // A different entity has co-occurrence data, but the selected
        // entity ("entity-aria") does not.
        "entity-other": [
          { entityId: "entity-priya", count: 2, resourceIds: ["r1", "r2"] },
        ],
      },
    );
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    expect(await screen.findByText("Chapter One")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("entity-cooccurrence-list"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Also appears with/)).not.toBeInTheDocument();
  });

  it("restricts the list to the selected entity's own co-occurrence entry, never the merged rows resource set (FR-2)", async () => {
    // `rows` (via getEntityMentionedIn) names resources, e.g. "scene-1",
    // while the co-occurrence map is keyed by *entity* ids. Even with rows
    // present, the co-occurrence list must come only from the map's entry
    // for the selected entity id, not from anything in `rows`.
    mockMentionedInAndCooccurrence(
      [
        {
          resourceId: "scene-1",
          name: "Chapter One",
          snippets: ["Aria and Priya spoke."],
          isLinked: false,
          isMentioned: true,
          ambiguousWith: [[]],
        },
      ],
      {
        "entity-aria": [
          { entityId: "entity-priya", count: 1, resourceIds: ["scene-1"] },
        ],
      },
    );
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    const list = await screen.findByLabelText("entity-cooccurrence-list");
    expect(list).toHaveTextContent("Priya (1)");
    // The mentions list's own resource-named row is untouched and distinct.
    expect(screen.getByText("Chapter One")).toBeInTheDocument();
  });

  it("exposes the list under an aria-label distinct from, and independently queryable from, entity-mentions-list (FR-9)", async () => {
    mockMentionedInAndCooccurrence(
      [
        {
          resourceId: "scene-1",
          name: "Chapter One",
          snippets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
      ],
      {
        "entity-aria": [
          { entityId: "entity-priya", count: 1, resourceIds: ["scene-1"] },
        ],
      },
    );
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    const mentionsList = await screen.findByLabelText("entity-mentions-list");
    const cooccurrenceList = await screen.findByLabelText(
      "entity-cooccurrence-list",
    );
    expect(mentionsList).toBeInTheDocument();
    expect(cooccurrenceList).toBeInTheDocument();
    expect(cooccurrenceList).not.toBe(mentionsList);
  });

  it("does not render any entry with the Linked/Mentioned badge markup (FR-8)", async () => {
    mockMentionedInAndCooccurrence([], {
      "entity-aria": [
        { entityId: "entity-priya", count: 2, resourceIds: ["r1", "r2"] },
      ],
    });
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsSection />
      </Provider>,
    );

    const list = await screen.findByLabelText("entity-cooccurrence-list");
    expect(
      screen.queryByLabelText("Priya-linked-badge"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Priya-mentioned-badge"),
    ).not.toBeInTheDocument();
    within(list)
      .getAllByRole("listitem")
      .forEach((item: HTMLElement) => {
        expect(item.className).not.toMatch(/border/);
        expect(item.getAttribute("aria-label")).toBeNull();
      });
  });
});
