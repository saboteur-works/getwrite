/**
 * Integration test (Feature 68, Task 18 — end-to-end verification pass).
 *
 * Exercises all three Feature 68 sub-features together, in one continuous
 * scenario, against the full `EntityRelationshipGraphView` (its real
 * `EntityGraphCanvas` and real `EntityGraphAccessibleList` children, not
 * mocked out), mirroring `entity-relationship-graph.test.tsx`'s precedent of
 * building a realistic fixture on the in-memory storage adapter via real
 * persistence calls and delegating the view's client-transport call sites to
 * the real model-layer functions for that fixture's project root:
 *
 * 1. Connection types (FR-1/FR-2/FR-7): toggling a type on in the settings
 *    panel changes which edges `graphData` draws, live, with no remount.
 * 2. Position persistence (FR-9/FR-10/FR-11/FR-13): a dragged position
 *    survives a simulated reload (remount with the same persisted data) and
 *    resets to a freshly computed layout only when the active connection-type
 *    set has changed since it was saved.
 * 3. Focal-point selection (FR-15/FR-16/FR-18/FR-19/FR-20/FR-22): shift-click
 *    sets a focal point and dims everything outside the hop radius on the
 *    canvas; a second shift-click reassigns it without a separate clear step;
 *    the accessible list's header "Clear focal point" button clears it and
 *    restores full-opacity rendering — all while the accessible list remains
 *    a fully independent, never-dimmed activation surface (FR-20/OQ-10).
 *
 * The entity-graph-settings and entity-graph-positions transports are faked
 * with simple in-memory state (rather than routed through their own real
 * `project.json`/`entity-graph-positions.json` model-layer persistence,
 * which Tasks 6, 11, 12 already cover with dedicated unit/parity tests) —
 * this keeps the fake's behavior under this test's direct control for the
 * toggle-off/invalidate-on-change step, while every entity/edge-producing
 * read (alias table, co-occurrence, authored relationships, backlinks,
 * proximity mentions, shared metadata, tags) is still the real model layer
 * against a real fixture project, exactly as the Task 10 precedent does.
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
import EntityRelationshipGraphView from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { mkdir, setStorageAdapter, writeFile } from "../../src/lib/models/io";
import { createTextResource } from "../../src/lib/models/resource";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { enqueueIndex, flushIndexer } from "../../src/lib/models/indexer-queue";
import { buildEntityAliasTable } from "../../src/lib/models/entity-alias-table";
import {
  getEntityCooccurrence,
  getProximityMentionEdges,
} from "../../src/lib/models/mentions-core";
import {
  createEntityRelationship,
  loadEntityRelationships,
} from "../../src/lib/models/entity-relationships";
import {
  getEntityBacklinkEdges,
  persistBacklinks,
} from "../../src/lib/models/backlinks";
import { getEntitySharedMetadataEdges } from "../../src/lib/models/entity-shared-metadata";
import {
  createTag,
  assignTagToResource,
  listTags as listTagsModel,
} from "../../src/lib/models/tags";
import { DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES } from "../../src/lib/models/entity-graph-connection-types";
import type { EntityGraphPositionRecord } from "../../src/lib/api/entity-graph-positions";
import type { EntityGraphSettings } from "../../src/lib/api/entity-graph-settings";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-cooccurrence", () => ({
  getEntityCooccurrence: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-relationships", () => ({
  listEntityRelationships: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-backlink-edges", () => ({
  getEntityBacklinkEdges: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-proximity-mention-edges", () => ({
  getProximityMentionEdges: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-shared-metadata-edges", () => ({
  getEntitySharedMetadataEdges: vi.fn(),
}));
vi.mock("../../src/lib/api/tags", () => ({ listTags: vi.fn() }));
vi.mock("../../src/lib/api/entity-graph-settings", () => ({
  getEntityGraphSettings: vi.fn(),
  setEntityGraphSettings: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-graph-positions", () => ({
  getEntityGraphPositions: vi.fn(),
  saveEntityGraphPosition: vi.fn(),
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityCooccurrence as getEntityCooccurrenceClient } from "../../src/lib/api/entity-cooccurrence";
import { listEntityRelationships as listEntityRelationshipsClient } from "../../src/lib/api/entity-relationships";
import { getEntityBacklinkEdges as getEntityBacklinkEdgesClient } from "../../src/lib/api/entity-backlink-edges";
import { getProximityMentionEdges as getProximityMentionEdgesClient } from "../../src/lib/api/entity-proximity-mention-edges";
import { getEntitySharedMetadataEdges as getEntitySharedMetadataEdgesClient } from "../../src/lib/api/entity-shared-metadata-edges";
import { listTags as listTagsClient } from "../../src/lib/api/tags";
import {
  getEntityGraphSettings as getEntityGraphSettingsClient,
  setEntityGraphSettings as setEntityGraphSettingsClient,
} from "../../src/lib/api/entity-graph-settings";
import {
  getEntityGraphPositions as getEntityGraphPositionsClient,
  saveEntityGraphPosition as saveEntityGraphPositionClient,
} from "../../src/lib/api/entity-graph-positions";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityCooccurrenceClient = vi.mocked(
  getEntityCooccurrenceClient,
);
const mockedListEntityRelationshipsClient = vi.mocked(
  listEntityRelationshipsClient,
);
const mockedGetEntityBacklinkEdgesClient = vi.mocked(
  getEntityBacklinkEdgesClient,
);
const mockedGetProximityMentionEdgesClient = vi.mocked(
  getProximityMentionEdgesClient,
);
const mockedGetEntitySharedMetadataEdgesClient = vi.mocked(
  getEntitySharedMetadataEdgesClient,
);
const mockedListTagsClient = vi.mocked(listTagsClient);
const mockedGetEntityGraphSettingsClient = vi.mocked(
  getEntityGraphSettingsClient,
);
const mockedSetEntityGraphSettingsClient = vi.mocked(
  setEntityGraphSettingsClient,
);
const mockedGetEntityGraphPositionsClient = vi.mocked(
  getEntityGraphPositionsClient,
);
const mockedSaveEntityGraphPositionClient = vi.mocked(
  saveEntityGraphPositionClient,
);

const PROJECT_ROOT = "/projects/entity-graph-feature68-e2e-fixture";
const PROJECT_ID = "entity-graph-feature68-e2e-fixture";

interface EntitySpec {
  key: string;
  name: string;
}

// A, B: cooccurrence (and, for free, proximity-mentions — both derive from
// the same mention index) via one resource mentioning both.
// C, D: authored-only.
// E, F: backlinks-only, via a directly-persisted backlink index record.
// G, H: sharedMetadata-only, via one shared tag.
// Iso: zero edges of any kind — always a node, never an edge participant.
const ENTITY_SPECS: readonly EntitySpec[] = [
  { key: "a", name: "A" },
  { key: "b", name: "B" },
  { key: "c", name: "C" },
  { key: "d", name: "D" },
  { key: "e", name: "E" },
  { key: "f", name: "F" },
  { key: "g", name: "G" },
  { key: "h", name: "H" },
  { key: "iso", name: "Iso" },
] as const;

async function buildFixture(): Promise<{ entityIds: Record<string, string> }> {
  await mkdir(PROJECT_ROOT, { recursive: true });
  await writeFile(
    `${PROJECT_ROOT}/project.json`,
    JSON.stringify({ config: { relationshipTypes: ["ally of"] } }, null, 2),
  );

  const entityIds: Record<string, string> = {};
  for (const spec of ENTITY_SPECS) {
    const resource = createTextResource({ name: spec.name, plainText: "" });
    await writeResourceToFile(PROJECT_ROOT, resource);
    await writeSidecar(PROJECT_ROOT, resource.id, {
      name: spec.name,
      entityKind: "character",
      aliases: [],
    });
    entityIds[spec.key] = resource.id;
  }

  // A/B: mentioned together in one resource -> cooccurrence AND, derived
  // from the identical mention index, a proximityMentions edge too.
  const resourceAB = createTextResource({
    name: "Scene AB",
    plainText: "A walked beside B along the shore.",
  });
  await writeResourceToFile(PROJECT_ROOT, resourceAB);
  await enqueueIndex(PROJECT_ROOT, resourceAB.id);
  await flushIndexer(2000);

  // C/D: authored-only.
  await createEntityRelationship(
    PROJECT_ROOT,
    entityIds["c"],
    entityIds["d"],
    "ally of",
  );

  // E/F: backlinks-only — persisted directly, no prose scan needed.
  await persistBacklinks(PROJECT_ROOT, { [entityIds["e"]]: [entityIds["f"]] });

  // G/H: sharedMetadata-only, via one shared tag.
  const tag = await createTag(PROJECT_ROOT, "Protagonist");
  await assignTagToResource(PROJECT_ROOT, entityIds["g"], tag.id);
  await assignTagToResource(PROJECT_ROOT, entityIds["h"], tag.id);

  return { entityIds };
}

/** In-memory fake settings state, controllable by this test (see header). */
function createSettingsFake(): { state: EntityGraphSettings } {
  const state: EntityGraphSettings = {
    entityGraphConnectionTypes: [...DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES],
    entityGraphFocalHopRadius: 1,
  };
  mockedGetEntityGraphSettingsClient.mockImplementation(async () => ({
    ...state,
  }));
  mockedSetEntityGraphSettingsClient.mockImplementation(
    async (_projectId, connectionTypes, hopRadius) => {
      state.entityGraphConnectionTypes = connectionTypes;
      state.entityGraphFocalHopRadius = hopRadius;
      return { ...state };
    },
  );
  return { state };
}

/** In-memory fake position store, controllable by this test (see header). */
function createPositionsFake(): { records: EntityGraphPositionRecord[] } {
  const store: { records: EntityGraphPositionRecord[] } = { records: [] };
  mockedGetEntityGraphPositionsClient.mockImplementation(async () => [
    ...store.records,
  ]);
  mockedSaveEntityGraphPositionClient.mockImplementation(
    async (_projectId, entityId, x, y, connectionTypesSnapshot) => {
      const record: EntityGraphPositionRecord = {
        entityId,
        x,
        y,
        connectionTypesSnapshot,
        savedAt: "2026-01-01T00:00:00.000Z",
      };
      store.records = [
        ...store.records.filter((r) => r.entityId !== entityId),
        record,
      ];
      return record;
    },
  );
  return store;
}

function openSettingsPanel(): void {
  fireEvent.click(screen.getByRole("button", { name: "Graph settings" }));
}

function dragPastThreshold(
  target: HTMLElement,
  startX: number,
  startY: number,
  dx: number,
  dy: number,
): void {
  fireEvent.pointerDown(target, { clientX: startX, clientY: startY });
  fireEvent.pointerMove(window, { clientX: startX + dx, clientY: startY + dy });
  fireEvent.pointerUp(window);
}

/**
 * Resolves a canvas node `<g>` element by its known `entityId` (looked up
 * from the fixture's own `entityIds` map, built at fixture-creation time —
 * the fixture's names are unique single letters, but resolving by the
 * `data-entity-id` attribute directly, rather than by matching rendered
 * label text, avoids any ambiguity).
 */
function nodeByEntityId(entityId: string): HTMLElement {
  const node = screen
    .getAllByTestId("entity-graph-node")
    .find((el: HTMLElement) => el.getAttribute("data-entity-id") === entityId);
  expect(node).toBeDefined();
  return node!;
}

/**
 * Resolves an accessible-list node `<li>` element by its known `entityId`,
 * via that node's own "Set {name} as focal point" button text — the
 * accessible list does not expose `data-entity-id` directly on the `<li>`,
 * but each node's name is unique in this fixture.
 */
function accessibleListItemForName(name: string): HTMLElement {
  const item = screen
    .getAllByTestId("entity-graph-node-item")
    .find((li: HTMLElement) => li.textContent?.startsWith(name));
  expect(item).toBeDefined();
  return item!;
}

describe("Feature 68 end-to-end: connection types + position persistence + focal point (Task 18)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("exercises all three sub-features together against one fixture", async () => {
    const { entityIds } = await buildFixture();

    // Ground truth, computed directly against the fixture.
    const cooccurrenceGroundTruth = await getEntityCooccurrence(PROJECT_ROOT);
    const relationshipsGroundTruth =
      await loadEntityRelationships(PROJECT_ROOT);
    const backlinkGroundTruth = await getEntityBacklinkEdges(PROJECT_ROOT);
    const proximityGroundTruth = await getProximityMentionEdges(PROJECT_ROOT);
    const sharedMetadataGroundTruth =
      await getEntitySharedMetadataEdges(PROJECT_ROOT);
    expect(cooccurrenceGroundTruth[entityIds["a"]]).toBeDefined();
    expect(relationshipsGroundTruth).toHaveLength(1);
    expect(backlinkGroundTruth).toHaveLength(1);
    expect(proximityGroundTruth[entityIds["a"]]).toBeDefined();
    expect(sharedMetadataGroundTruth).toHaveLength(1);

    // Wire the view's client transports to the real model layer for every
    // entity/edge-producing read, and to controllable fakes for settings and
    // positions (see this file's header comment for why).
    const aliasTable = await buildEntityAliasTable(PROJECT_ROOT);
    mockedGetEntityAliasTable.mockResolvedValue(aliasTable);
    mockedGetEntityCooccurrenceClient.mockImplementation(async () =>
      getEntityCooccurrence(PROJECT_ROOT),
    );
    mockedListEntityRelationshipsClient.mockImplementation(async () =>
      loadEntityRelationships(PROJECT_ROOT),
    );
    mockedGetEntityBacklinkEdgesClient.mockImplementation(async () =>
      getEntityBacklinkEdges(PROJECT_ROOT),
    );
    mockedGetProximityMentionEdgesClient.mockImplementation(async () =>
      getProximityMentionEdges(PROJECT_ROOT),
    );
    mockedGetEntitySharedMetadataEdgesClient.mockImplementation(async () =>
      getEntitySharedMetadataEdges(PROJECT_ROOT),
    );
    mockedListTagsClient.mockImplementation(async () =>
      listTagsModel(PROJECT_ROOT),
    );
    const settingsFake = createSettingsFake();
    const positionsFake = createPositionsFake();

    const store = makeStore();
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: "Feature 68 E2E Fixture",
        rootPath: `/tmp/${PROJECT_ID}`,
        folders: [],
        resources: [],
        features: { entities: true },
      } as never),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    await store.dispatch(fetchEntityAliasTable(PROJECT_ID));

    render(
      <Provider store={store}>
        <EntityRelationshipGraphView />
      </Provider>,
    );

    await waitFor(() =>
      expect(mockedGetEntityCooccurrenceClient).toHaveBeenCalledWith(
        PROJECT_ID,
      ),
    );
    await waitFor(() =>
      expect(mockedGetEntityGraphPositionsClient).toHaveBeenCalledWith(
        PROJECT_ID,
      ),
    );
    await waitFor(() => {
      expect(screen.getAllByTestId("entity-graph-node")).toHaveLength(
        ENTITY_SPECS.length,
      );
    });

    // ========================================================================
    // 1. Connection types — default list draws only authored + cooccurrence.
    // ========================================================================
    await waitFor(() => {
      const kinds = new Set(
        screen
          .getAllByTestId("entity-graph-edge")
          .map((el: HTMLElement) => el.getAttribute("data-edge-kind")),
      );
      expect(kinds.has("cooccurrence")).toBe(true);
      expect(kinds.has("backlinks")).toBe(false);
      expect(kinds.has("proximityMentions")).toBe(false);
      expect(kinds.has("sharedMetadata")).toBe(false);
    });

    // Toggle on the three new types via the settings panel (live, no
    // remount) — this is the Task 18 follow-up fix under test: without it,
    // `EntityRelationshipGraphView`'s own `connectionTypes` state never
    // learns that the settings panel (rendered inside `EntityGraphCanvas`)
    // saved a new list.
    openSettingsPanel();
    await screen.findByLabelText("Backlinks");
    fireEvent.click(screen.getByLabelText("Backlinks"));
    await waitFor(() =>
      expect(mockedSetEntityGraphSettingsClient).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(screen.getByLabelText("Proximity mentions"));
    await waitFor(() =>
      expect(mockedSetEntityGraphSettingsClient).toHaveBeenCalledTimes(2),
    );
    fireEvent.click(screen.getByLabelText("Shared tags/metadata"));
    await waitFor(() =>
      expect(mockedSetEntityGraphSettingsClient).toHaveBeenCalledTimes(3),
    );
    // Close the panel so it doesn't obscure later queries.
    openSettingsPanel();

    await waitFor(() => {
      const kinds = new Set(
        screen
          .getAllByTestId("entity-graph-edge")
          .map((el: HTMLElement) => el.getAttribute("data-edge-kind")),
      );
      expect(kinds.has("cooccurrence")).toBe(true);
      expect(kinds.has("authored")).toBe(true);
      expect(kinds.has("backlinks")).toBe(true);
      expect(kinds.has("proximityMentions")).toBe(true);
      expect(kinds.has("sharedMetadata")).toBe(true);
    });
    // No new, unrelated fetch was triggered by the toggle — only the
    // settings write and this view's own re-render from the callback.
    expect(mockedGetEntityCooccurrenceClient).toHaveBeenCalledTimes(1);

    // ========================================================================
    // 2. Position persistence — drag, reproduce across a simulated reload,
    // then invalidate by changing the active connection-type set.
    // ========================================================================
    const nodeA = nodeByEntityId(entityIds["a"]);
    dragPastThreshold(nodeA, 100, 100, 37, 21);
    await waitFor(() =>
      expect(mockedSaveEntityGraphPositionClient).toHaveBeenCalledTimes(1),
    );
    const [, , savedX, savedY, savedSnapshot] =
      mockedSaveEntityGraphPositionClient.mock.calls[0];
    expect(new Set(savedSnapshot)).toEqual(
      new Set(settingsFake.state.entityGraphConnectionTypes),
    );
    // The fake position store itself now holds exactly the one upserted
    // record — confirms the mocked transport (not just the canvas's own
    // call) reflects the drag, mirroring the real transport's upsert
    // contract (Task 12's "exactly one position record" requirement).
    expect(positionsFake.records).toHaveLength(1);
    expect(positionsFake.records[0]?.entityId).toBe(entityIds["a"]);

    // Simulated reload: remount with the same fake-persisted state.
    mockedGetEntityGraphPositionsClient.mockClear();
    cleanup();
    render(
      <Provider store={store}>
        <EntityRelationshipGraphView />
      </Provider>,
    );
    await waitFor(() =>
      expect(mockedGetEntityGraphPositionsClient).toHaveBeenCalledWith(
        PROJECT_ID,
      ),
    );
    await waitFor(() => {
      const reloadedA = nodeByEntityId(entityIds["a"]);
      const transform = reloadedA.getAttribute("transform") ?? "";
      const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeCloseTo(savedX as number);
      expect(Number(match![2])).toBeCloseTo(savedY as number);
    });

    // Now change the active connection-type set (turn cooccurrence back
    // off) and remount again: the previously-valid position for A must be
    // invalidated (FR-11), since its `connectionTypesSnapshot` no longer
    // matches the new active set.
    settingsFake.state.entityGraphConnectionTypes =
      settingsFake.state.entityGraphConnectionTypes.filter(
        (t) => t !== "cooccurrence",
      );
    mockedGetEntityGraphPositionsClient.mockClear();
    cleanup();
    render(
      <Provider store={store}>
        <EntityRelationshipGraphView />
      </Provider>,
    );
    await waitFor(() =>
      expect(mockedGetEntityGraphPositionsClient).toHaveBeenCalledWith(
        PROJECT_ID,
      ),
    );
    await waitFor(() => {
      const reinvalidatedA = nodeByEntityId(entityIds["a"]);
      const transform = reinvalidatedA.getAttribute("transform") ?? "";
      const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
      expect(match).not.toBeNull();
      // The dragged position must no longer be reproduced.
      expect(
        Math.abs(Number(match![1]) - (savedX as number)) > 0.5 ||
          Math.abs(Number(match![2]) - (savedY as number)) > 0.5,
      ).toBe(true);
    });
    // Restore cooccurrence for the remainder of the scenario.
    settingsFake.state.entityGraphConnectionTypes = [
      ...DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES,
      "backlinks",
      "proximityMentions",
      "sharedMetadata",
    ];
    mockedGetEntityGraphPositionsClient.mockClear();
    cleanup();
    render(
      <Provider store={store}>
        <EntityRelationshipGraphView />
      </Provider>,
    );
    await waitFor(() =>
      expect(mockedGetEntityGraphPositionsClient).toHaveBeenCalledWith(
        PROJECT_ID,
      ),
    );
    await waitFor(() => {
      expect(screen.getAllByTestId("entity-graph-node")).toHaveLength(
        ENTITY_SPECS.length,
      );
    });

    // ========================================================================
    // 3. Focal-point selection — set, reassign, and clear.
    // ========================================================================
    const freshA = nodeByEntityId(entityIds["a"]);
    fireEvent.click(freshA, { shiftKey: true });
    expect(freshA.getAttribute("data-focal-point")).toBe("true");

    // A's only neighbour within hop radius 1 is B (cooccurrence +
    // proximityMentions); C/D/E/F/G/H/Iso are unreachable from A and so
    // outside the radius -> dimmed on the canvas.
    const nodeB = nodeByEntityId(entityIds["b"]);
    const nodeC = nodeByEntityId(entityIds["c"]);
    expect(nodeB.getAttribute("data-focal-dimmed")).toBe("false");
    expect(nodeC.getAttribute("data-focal-dimmed")).toBe("true");

    // The accessible list discloses the identical hop status as literal
    // text, regardless of the canvas's own dimmed/hidden visual state
    // (FR-20/OQ-10) — it never reads the canvas's rendering.
    const focalStatusNodeC = accessibleListItemForName("C");
    expect(focalStatusNodeC.textContent).toMatch(/outside focal radius/);
    const focalStatusNodeB = accessibleListItemForName("B");
    expect(focalStatusNodeB.textContent).toMatch(/within focal radius/);

    // A hop-dimmed node remains fully reachable/activatable through the
    // accessible list regardless of its canvas visual state (FR-20/OQ-10).
    const onEntityActivated = vi.fn();
    cleanup();
    render(
      <Provider store={store}>
        <EntityRelationshipGraphView onEntityActivated={onEntityActivated} />
      </Provider>,
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("entity-graph-node")).toHaveLength(
        ENTITY_SPECS.length,
      ),
    );
    fireEvent.click(nodeByEntityId(entityIds["a"]), { shiftKey: true });
    const hopHiddenItemC = accessibleListItemForName("C");
    fireEvent.click(
      hopHiddenItemC.querySelector(
        '[data-testid="entity-graph-node-activate-button"]',
      )!,
    );
    expect(onEntityActivated).toHaveBeenCalledWith(entityIds["c"]);

    // Reassign the focal point to C, without a clear step first (FR-18).
    const nodeAAfterRemount = nodeByEntityId(entityIds["a"]);
    const nodeCAfterRemount = nodeByEntityId(entityIds["c"]);
    fireEvent.click(nodeCAfterRemount, { shiftKey: true });
    expect(nodeCAfterRemount.getAttribute("data-focal-point")).toBe("true");
    expect(nodeAAfterRemount.getAttribute("data-focal-point")).toBe("false");
    // D is within radius of C (authored edge); A/B are now outside.
    const nodeD = nodeByEntityId(entityIds["d"]);
    expect(nodeD.getAttribute("data-focal-dimmed")).toBe("false");
    expect(nodeAAfterRemount.getAttribute("data-focal-dimmed")).toBe("true");

    expect(
      screen.getByTestId("entity-graph-focal-point-status").textContent,
    ).toBe("Current focal point: C.");

    // Clear via the accessible list's header control (FR-19/FR-22).
    fireEvent.click(
      screen.getByTestId("entity-graph-clear-focal-point-button"),
    );
    expect(
      screen.getByTestId("entity-graph-focal-point-status").textContent,
    ).toBe("No focal point set.");
    await waitFor(() => {
      expect(nodeD.getAttribute("data-focal-dimmed")).toBe("false");
      expect(nodeAAfterRemount.getAttribute("data-focal-dimmed")).toBe("false");
      expect(nodeCAfterRemount.getAttribute("data-focal-dimmed")).toBe("false");
    });
  });
});
