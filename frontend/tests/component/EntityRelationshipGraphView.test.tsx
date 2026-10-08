/**
 * Component tests for `EntityRelationshipGraphView` (entity-relationship-graph
 * Task 3) — the graph's data-assembly logic: reading the cached
 * `EntityAliasTable` for the node set (FR-3), fetching co-occurrence
 * (`getEntityCooccurrence`) and authored relationships
 * (`listEntityRelationships`), normalizing both into a single typed edge
 * list without merging a co-occurrence edge and an authored edge for the
 * same pair (FR-4/FR-5), and the FR-14 empty state. No rendering beyond
 * plain placeholder text/JSON is exercised here — that is a later task.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Provider } from "react-redux";
import EntityRelationshipGraphView from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-cooccurrence", () => ({
  getEntityCooccurrence: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-relationships", () => ({
  listEntityRelationships: vi.fn(),
  createEntityRelationship: vi.fn(),
  removeEntityRelationship: vi.fn(),
}));
vi.mock("../../src/lib/api/resources", () => ({ updateSidecar: vi.fn() }));
// `EntityGraphAccessibleList` (Task 9) fetches the project's tag list itself
// to resolve a `sharedMetadata` edge's raw ids to display labels; this view
// doesn't exercise that edge kind, so a resolved-to-`[]` stub is enough to
// keep the real `fetch` call out of this test file's jsdom environment.
vi.mock("../../src/lib/api/tags", () => ({ listTags: vi.fn() }));
// Task 13: `EntityGraphCanvas` now reads/writes Task 12's position transport
// whenever it receives a `projectId` — which, as of this task's gap-fix, this
// view always passes down. Mocked here for the same reason as `tags` above:
// keeping this test file's jsdom environment free of a real `fetch` attempt.
vi.mock("../../src/lib/api/entity-graph-positions", () => ({
  getEntityGraphPositions: vi.fn(),
  saveEntityGraphPosition: vi.fn(),
}));
// Feature 69, Task 7/8: `EntityGraphCanvas` and the new kind-styles entry
// point both read the kind-style mapping; mocked here for the same reason as
// `entity-graph-positions` above, so no real `fetch` is attempted.
vi.mock("../../src/lib/api/entity-graph-kind-styles", () => ({
  getEntityGraphKindStyles: vi.fn(),
  saveEntityGraphKindStyle: vi.fn(),
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityCooccurrence } from "../../src/lib/api/entity-cooccurrence";
import {
  listEntityRelationships,
  createEntityRelationship,
  removeEntityRelationship,
} from "../../src/lib/api/entity-relationships";
import { updateSidecar } from "../../src/lib/api/resources";
import { listTags } from "../../src/lib/api/tags";
import { getEntityGraphPositions } from "../../src/lib/api/entity-graph-positions";
import { getEntityGraphKindStyles } from "../../src/lib/api/entity-graph-kind-styles";
import { flushPendingEffects } from "../helpers/flushEffects";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityCooccurrence = vi.mocked(getEntityCooccurrence);
const mockedListEntityRelationships = vi.mocked(listEntityRelationships);
const mockedCreateEntityRelationship = vi.mocked(createEntityRelationship);
const mockedRemoveEntityRelationship = vi.mocked(removeEntityRelationship);
const mockedUpdateSidecar = vi.mocked(updateSidecar);
const mockedListTags = vi.mocked(listTags);
const mockedGetEntityGraphPositions = vi.mocked(getEntityGraphPositions);
const mockedGetEntityGraphKindStyles = vi.mocked(getEntityGraphKindStyles);

const PROJECT_ID = "proj-entity-graph";

/**
 * Builds a store with the given alias table cached and the given project's
 * directory basename set (matching `selectActiveProjectDirectoryId`'s
 * `rootPath`-derived read), and given `entities` feature flag.
 */
async function setupStore(
  aliasTable: EntityAliasTable,
  entitiesEnabled = true,
) {
  mockedGetEntityAliasTable.mockResolvedValue(aliasTable);
  mockedListTags.mockResolvedValue([]);
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Entity Graph Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      folders: [],
      resources: [],
      features: { entities: entitiesEnabled },
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  await store.dispatch(fetchEntityAliasTable(PROJECT_ID));
  return store;
}

beforeEach(() => {
  // `vi.restoreAllMocks()` (the `afterEach` below) does not reset a plain
  // `vi.fn()` created inside a `vi.mock()` factory's call history — only
  // `vi.spyOn()` spies — so this is explicit to avoid cross-test leakage.
  mockedGetEntityGraphPositions.mockReset();
  mockedGetEntityGraphPositions.mockResolvedValue([]);
  mockedGetEntityGraphKindStyles.mockReset();
  mockedGetEntityGraphKindStyles.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EntityRelationshipGraphView", () => {
  it("renders every declared entity as a node, including one with no edges (FR-3)", async () => {
    const table: EntityAliasTable = {
      entities: {
        "e-anna": {
          entityId: "e-anna",
          entityKind: "character",
          name: "Anna",
          aliases: [],
          terms: ["Anna"],
        },
        "e-bob": {
          entityId: "e-bob",
          entityKind: "character",
          name: "Bob",
          aliases: [],
          terms: ["Bob"],
        },
        "e-carl": {
          entityId: "e-carl",
          entityKind: "character",
          name: "Carl",
          aliases: [],
          terms: ["Carl"],
        },
        "e-isolated": {
          entityId: "e-isolated",
          entityKind: "place",
          name: "Isolated Place",
          aliases: [],
          terms: ["Isolated Place"],
        },
      },
      claimedBy: {},
    };
    mockedGetEntityCooccurrence.mockResolvedValue({
      "e-anna": [{ entityId: "e-bob", count: 2, resourceIds: ["r1", "r2"] }],
      "e-bob": [{ entityId: "e-anna", count: 2, resourceIds: ["r1", "r2"] }],
    });
    mockedListEntityRelationships.mockResolvedValue([]);

    const store = await setupStore(table);

    render(
      <Provider store={store}>
        <EntityRelationshipGraphView />
      </Provider>,
    );

    await waitFor(() =>
      expect(mockedGetEntityCooccurrence).toHaveBeenCalledWith(PROJECT_ID),
    );
    await waitFor(() =>
      expect(mockedListEntityRelationships).toHaveBeenCalledWith(PROJECT_ID),
    );

    await screen.findByTestId("entity-graph-canvas");
    // EntityGraphCanvas fires its own persisted-node-position-read
    // effect on mount — flush it before asserting.
    await flushPendingEffects();
    const nodeElements = screen.getAllByTestId("entity-graph-node");
    expect(nodeElements).toHaveLength(4);
    expect(
      nodeElements
        .map((el: HTMLElement) => el.getAttribute("data-entity-id"))
        .sort(),
    ).toEqual(["e-anna", "e-bob", "e-carl", "e-isolated"]);

    // The accessible list (FR-11) renders the same node set, side by side
    // with the canvas.
    const listItems = screen.getAllByTestId("entity-graph-node-item");
    expect(listItems).toHaveLength(4);
  });

  it("keeps a co-occurrence edge and an authored edge for the same pair as two separate records (FR-4/FR-5)", async () => {
    const table: EntityAliasTable = {
      entities: {
        "e-anna": {
          entityId: "e-anna",
          entityKind: "character",
          name: "Anna",
          aliases: [],
          terms: ["Anna"],
        },
        "e-bob": {
          entityId: "e-bob",
          entityKind: "character",
          name: "Bob",
          aliases: [],
          terms: ["Bob"],
        },
      },
      claimedBy: {},
    };
    // Both directions present in the map, per getEntityCooccurrence's
    // documented mirroring — must collapse to exactly one edge.
    mockedGetEntityCooccurrence.mockResolvedValue({
      "e-anna": [
        { entityId: "e-bob", count: 3, resourceIds: ["r1", "r2", "r3"] },
      ],
      "e-bob": [
        { entityId: "e-anna", count: 3, resourceIds: ["r1", "r2", "r3"] },
      ],
    });
    mockedListEntityRelationships.mockResolvedValue([
      {
        id: "rel-1",
        sourceEntityId: "e-anna",
        targetEntityId: "e-bob",
        relationshipType: "ally",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const store = await setupStore(table);

    render(
      <Provider store={store}>
        <EntityRelationshipGraphView />
      </Provider>,
    );

    await waitFor(() =>
      expect(mockedListEntityRelationships).toHaveBeenCalled(),
    );

    await screen.findByTestId("entity-graph-canvas");
    // EntityGraphCanvas fires its own persisted-node-position-read
    // effect on mount — flush it before asserting.
    await flushPendingEffects();

    // Exactly one cooccurrence edge (deduped from the mirrored map) and one
    // authored edge for the same pair — never merged into one record.
    const edgeElements = screen.getAllByTestId("entity-graph-edge");
    expect(edgeElements).toHaveLength(2);
    const cooccurrenceEdges = edgeElements.filter(
      (el: HTMLElement) => el.getAttribute("data-edge-kind") === "cooccurrence",
    );
    const authoredEdges = edgeElements.filter(
      (el: HTMLElement) => el.getAttribute("data-edge-kind") === "authored",
    );
    expect(cooccurrenceEdges).toHaveLength(1);
    expect(authoredEdges).toHaveLength(1);

    // The accessible list (FR-11) discloses the same two edges as text.
    const listEdgeItems = screen.getAllByTestId("entity-graph-edge-item");
    expect(listEdgeItems).toHaveLength(2);
    expect(
      listEdgeItems.some((el: HTMLElement) =>
        /share 3 resources/i.test(el.textContent ?? ""),
      ),
    ).toBe(true);
    expect(
      listEdgeItems.some((el: HTMLElement) =>
        /\(ally\)/i.test(el.textContent ?? ""),
      ),
    ).toBe(true);
  });

  it("renders the FR-14 empty state when entities is on but no entity is declared", async () => {
    mockedGetEntityCooccurrence.mockResolvedValue({});
    mockedListEntityRelationships.mockResolvedValue([]);
    const store = await setupStore({ entities: {}, claimedBy: {} }, true);

    render(
      <Provider store={store}>
        <EntityRelationshipGraphView />
      </Provider>,
    );

    expect(
      await screen.findByTestId("entity-relationship-graph-empty-state"),
    ).toBeTruthy();
    expect(
      screen.getByText(/no entities have been declared yet/i),
    ).toBeTruthy();
    expect(screen.queryByTestId("entity-graph-canvas")).toBeNull();
    expect(screen.queryByTestId("entity-graph-accessible-list")).toBeNull();
  });

  describe("projectId pass-through to EntityGraphCanvas (Feature 68, Task 13 gap-fix)", () => {
    it("passes the active project's directory id down to EntityGraphCanvas, which uses it to read persisted node positions", async () => {
      const table: EntityAliasTable = {
        entities: {
          "e-anna": {
            entityId: "e-anna",
            entityKind: "character",
            name: "Anna",
            aliases: [],
            terms: ["Anna"],
          },
        },
        claimedBy: {},
      };
      mockedGetEntityCooccurrence.mockResolvedValue({});
      mockedListEntityRelationships.mockResolvedValue([]);
      const store = await setupStore(table);

      render(
        <Provider store={store}>
          <EntityRelationshipGraphView />
        </Provider>,
      );

      await screen.findByTestId("entity-graph-canvas");
      // EntityGraphCanvas fires its own persisted-node-position-read
      // effect on mount — flush it before asserting.
      await flushPendingEffects();

      // Before this task, `EntityGraphCanvas` never received a `projectId`
      // prop at all (Task 10's own dangling gap), so it never attempted this
      // read regardless of the project being active. This is the concrete,
      // observable evidence that the gap is closed.
      await waitFor(() =>
        expect(mockedGetEntityGraphPositions).toHaveBeenCalledWith(PROJECT_ID),
      );
    });
  });

  describe("node activation (Task 7, FR-9)", () => {
    const table: EntityAliasTable = {
      entities: {
        "e-anna": {
          entityId: "e-anna",
          entityKind: "character",
          name: "Anna",
          aliases: [],
          terms: ["Anna"],
        },
      },
      claimedBy: {},
    };

    async function renderWithActivation(
      onEntityActivated: (id: string) => void,
    ) {
      mockedGetEntityCooccurrence.mockResolvedValue({});
      mockedListEntityRelationships.mockResolvedValue([]);
      const store = await setupStore(table);

      render(
        <Provider store={store}>
          <EntityRelationshipGraphView onEntityActivated={onEntityActivated} />
        </Provider>,
      );

      const node = await screen.findByTestId("entity-graph-node");
      // EntityGraphCanvas fires its own persisted-node-position-read
      // effect on mount — flush it before returning.
      await flushPendingEffects();
      return node;
    }

    it("calls onEntityActivated with the entityId when a canvas node is clicked", async () => {
      const onEntityActivated = vi.fn();
      const node = await renderWithActivation(onEntityActivated);

      act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(onEntityActivated).toHaveBeenCalledWith("e-anna");
    });

    it("calls onEntityActivated with the entityId when the accessible list's node button is clicked", async () => {
      const onEntityActivated = vi.fn();
      await renderWithActivation(onEntityActivated);

      const listItem = await screen.findByTestId("entity-graph-node-item");
      const button = listItem.querySelector("button") as HTMLButtonElement;
      act(() => {
        button.click();
      });

      expect(onEntityActivated).toHaveBeenCalledWith("e-anna");
    });

    it("wires the identical onEntityActivated callback into both the canvas and the accessible list", async () => {
      const onEntityActivated = vi.fn();
      const node = await renderWithActivation(onEntityActivated);

      act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const listItem = await screen.findByTestId("entity-graph-node-item");
      const button = listItem.querySelector("button") as HTMLButtonElement;
      act(() => {
        button.click();
      });

      expect(onEntityActivated).toHaveBeenCalledTimes(2);
      expect(onEntityActivated).toHaveBeenNthCalledWith(1, "e-anna");
      expect(onEntityActivated).toHaveBeenNthCalledWith(2, "e-anna");
    });

    it("never calls updateSidecar, createEntityRelationship, or removeEntityRelationship on node interaction (FR-9)", async () => {
      const onEntityActivated = vi.fn();
      const node = await renderWithActivation(onEntityActivated);

      act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      const listItem = await screen.findByTestId("entity-graph-node-item");
      const button = listItem.querySelector("button") as HTMLButtonElement;
      act(() => {
        button.click();
      });

      expect(mockedUpdateSidecar).not.toHaveBeenCalled();
      expect(mockedCreateEntityRelationship).not.toHaveBeenCalled();
      expect(mockedRemoveEntityRelationship).not.toHaveBeenCalled();
    });
  });

  describe("kind-styles customization entry point (Feature 69, Task 7, FR-10)", () => {
    const table: EntityAliasTable = {
      entities: {
        "e-anna": {
          entityId: "e-anna",
          entityKind: "character",
          name: "Anna",
          aliases: [],
          terms: ["Anna"],
        },
      },
      claimedBy: {},
    };

    beforeEach(() => {
      mockedGetEntityCooccurrence.mockResolvedValue({});
      mockedListEntityRelationships.mockResolvedValue([]);
    });

    it("renders the entry-point button when the entities flag is enabled", async () => {
      const store = await setupStore(table, true);

      render(
        <Provider store={store}>
          <EntityRelationshipGraphView />
        </Provider>,
      );

      expect(
        await screen.findByTestId("entity-kind-styles-open-button"),
      ).toBeInTheDocument();
    });

    it("does not render the entry-point button when the entities flag is off", async () => {
      const store = await setupStore(table, false);

      render(
        <Provider store={store}>
          <EntityRelationshipGraphView />
        </Provider>,
      );

      await screen.findByTestId("entity-graph-canvas");
      // EntityGraphCanvas fires its own persisted-node-position-read
      // effect on mount — flush it before asserting.
      await flushPendingEffects();
      expect(
        screen.queryByTestId("entity-kind-styles-open-button"),
      ).not.toBeInTheDocument();
    });

    it("opens the kind-styles modal when the entry-point button is clicked", async () => {
      const store = await setupStore(table, true);

      render(
        <Provider store={store}>
          <EntityRelationshipGraphView />
        </Provider>,
      );

      const button = await screen.findByTestId(
        "entity-kind-styles-open-button",
      );
      act(() => {
        button.click();
      });

      expect(
        await screen.findByText("Entity kind colors and shapes"),
      ).toBeInTheDocument();
    });

    it("re-fetches kind styles after a save in the modal, so the canvas receives the refreshed list", async () => {
      mockedGetEntityGraphKindStyles.mockResolvedValueOnce([]);
      const store = await setupStore(table, true);

      render(
        <Provider store={store}>
          <EntityRelationshipGraphView />
        </Provider>,
      );

      await waitFor(() =>
        expect(mockedGetEntityGraphKindStyles).toHaveBeenCalledWith(PROJECT_ID),
      );
      const callsBeforeOpen = mockedGetEntityGraphKindStyles.mock.calls.length;

      // Queued before opening: the modal's own `loadStyles` effect (which
      // fires on open) consumes this, giving it an already-configured
      // "character" row whose color select can be changed to trigger an
      // immediate persist (FR-4's "configured row persists on change"
      // behavior — the new/unmapped section instead requires an explicit
      // "Save style" click, which this test isn't exercising).
      mockedGetEntityGraphKindStyles.mockResolvedValueOnce([
        { entityKind: "character", color: "entity-kind-0", shape: "circle" },
      ]);

      const openButton = await screen.findByTestId(
        "entity-kind-styles-open-button",
      );
      act(() => {
        openButton.click();
      });

      // The modal's own `loadStyles` effect fetches again on open.
      await waitFor(() =>
        expect(
          mockedGetEntityGraphKindStyles.mock.calls.length,
        ).toBeGreaterThan(callsBeforeOpen),
      );
      const callsAfterOpen = mockedGetEntityGraphKindStyles.mock.calls.length;

      const { saveEntityGraphKindStyle } =
        await import("../../src/lib/api/entity-graph-kind-styles");
      vi.mocked(saveEntityGraphKindStyle).mockResolvedValue({
        entityKind: "character",
        color: "entity-kind-0",
        shape: "circle",
      });

      const colorSelect = await screen.findByLabelText("character color");
      fireEvent.change(colorSelect, { target: { value: "entity-kind-3" } });

      await waitFor(() =>
        expect(
          mockedGetEntityGraphKindStyles.mock.calls.length,
        ).toBeGreaterThan(callsAfterOpen),
      );
    });
  });
});
