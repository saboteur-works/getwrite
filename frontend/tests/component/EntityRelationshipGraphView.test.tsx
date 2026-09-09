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
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityCooccurrence } from "../../src/lib/api/entity-cooccurrence";
import { listEntityRelationships } from "../../src/lib/api/entity-relationships";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityCooccurrence = vi.mocked(getEntityCooccurrence);
const mockedListEntityRelationships = vi.mocked(listEntityRelationships);

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

    const dataEl = await screen.findByTestId("entity-relationship-graph-data");
    const data = JSON.parse(dataEl.textContent ?? "{}") as {
      nodeCount: number;
      nodes: { entityId: string }[];
    };

    expect(data.nodeCount).toBe(4);
    expect(data.nodes.map((n) => n.entityId).sort()).toEqual([
      "e-anna",
      "e-bob",
      "e-carl",
      "e-isolated",
    ]);
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

    const dataEl = await screen.findByTestId("entity-relationship-graph-data");
    const data = JSON.parse(dataEl.textContent ?? "{}") as {
      edgeCount: number;
      edges: Array<Record<string, unknown>>;
    };

    // Exactly one cooccurrence edge (deduped from the mirrored map) and one
    // authored edge for the same pair — never merged into one record.
    expect(data.edgeCount).toBe(2);

    const cooccurrenceEdges = data.edges.filter(
      (e) => e.kind === "cooccurrence",
    );
    const authoredEdges = data.edges.filter((e) => e.kind === "authored");
    expect(cooccurrenceEdges).toHaveLength(1);
    expect(authoredEdges).toHaveLength(1);

    // The co-occurrence edge retains its shared-resource count, and neither
    // kind infers data the reads did not return.
    expect(cooccurrenceEdges[0].sharedResourceCount).toBe(3);
    expect(cooccurrenceEdges[0]).not.toHaveProperty("relationshipType");

    // The authored edge retains its direction and type verbatim.
    expect(authoredEdges[0]).toMatchObject({
      id: "rel-1",
      sourceEntityId: "e-anna",
      targetEntityId: "e-bob",
      relationshipType: "ally",
    });
    expect(authoredEdges[0]).not.toHaveProperty("sharedResourceCount");
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
    expect(screen.queryByTestId("entity-relationship-graph-data")).toBeNull();
  });
});
