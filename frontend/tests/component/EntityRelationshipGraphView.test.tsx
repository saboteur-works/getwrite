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
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityCooccurrence } from "../../src/lib/api/entity-cooccurrence";
import {
  listEntityRelationships,
  createEntityRelationship,
  removeEntityRelationship,
} from "../../src/lib/api/entity-relationships";
import { updateSidecar } from "../../src/lib/api/resources";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityCooccurrence = vi.mocked(getEntityCooccurrence);
const mockedListEntityRelationships = vi.mocked(listEntityRelationships);
const mockedCreateEntityRelationship = vi.mocked(createEntityRelationship);
const mockedRemoveEntityRelationship = vi.mocked(removeEntityRelationship);
const mockedUpdateSidecar = vi.mocked(updateSidecar);

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

      return screen.findByTestId("entity-graph-node");
    }

    it("calls onEntityActivated with the entityId when a canvas node is clicked", async () => {
      const onEntityActivated = vi.fn();
      const node = await renderWithActivation(onEntityActivated);

      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(onEntityActivated).toHaveBeenCalledWith("e-anna");
    });

    it("calls onEntityActivated with the entityId when the accessible list's node button is clicked", async () => {
      const onEntityActivated = vi.fn();
      await renderWithActivation(onEntityActivated);

      const listItem = await screen.findByTestId("entity-graph-node-item");
      const button = listItem.querySelector("button") as HTMLButtonElement;
      button.click();

      expect(onEntityActivated).toHaveBeenCalledWith("e-anna");
    });

    it("wires the identical onEntityActivated callback into both the canvas and the accessible list", async () => {
      const onEntityActivated = vi.fn();
      const node = await renderWithActivation(onEntityActivated);

      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const listItem = await screen.findByTestId("entity-graph-node-item");
      const button = listItem.querySelector("button") as HTMLButtonElement;
      button.click();

      expect(onEntityActivated).toHaveBeenCalledTimes(2);
      expect(onEntityActivated).toHaveBeenNthCalledWith(1, "e-anna");
      expect(onEntityActivated).toHaveBeenNthCalledWith(2, "e-anna");
    });

    it("never calls updateSidecar, createEntityRelationship, or removeEntityRelationship on node interaction (FR-9)", async () => {
      const onEntityActivated = vi.fn();
      const node = await renderWithActivation(onEntityActivated);

      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const listItem = await screen.findByTestId("entity-graph-node-item");
      const button = listItem.querySelector("button") as HTMLButtonElement;
      button.click();

      expect(mockedUpdateSidecar).not.toHaveBeenCalled();
      expect(mockedCreateEntityRelationship).not.toHaveBeenCalled();
      expect(mockedRemoveEntityRelationship).not.toHaveBeenCalled();
    });
  });
});
