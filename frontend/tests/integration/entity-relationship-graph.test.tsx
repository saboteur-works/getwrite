/**
 * Integration test (entity-relationship-graph Task 10): graph fidelity
 * against a real fixture project, exercising Task 3's data assembly
 * (`EntityRelationshipGraphView.tsx`), Task 5's canvas edge-kind rendering
 * (`EntityGraphCanvas.tsx`), and Task 8's accessible list
 * (`EntityGraphAccessibleList.tsx`) together against ONE shared fixture, in
 * ONE test run — mirroring `entity-cooccurrence.test.tsx`'s convention: a
 * real fixture project is built on the in-memory storage adapter via real
 * persistence calls (`writeResourceToFile`, `writeSidecar`,
 * `enqueueIndex`/`flushIndexer` for prose resources that must be detected,
 * `createEntityRelationship` for authored edges) rather than hand-built
 * fixture objects, and `EntityRelationshipGraphView` is rendered against that
 * same fixture with its two client-transport call sites
 * (`lib/api/entity-cooccurrence.ts`'s `getEntityCooccurrence`,
 * `lib/api/entity-relationships.ts`'s `listEntityRelationships`) mocked to
 * delegate to the real model-layer functions for this fixture's project
 * root, plus the alias-table client transport delegating to the real
 * `buildEntityAliasTable`.
 *
 * `EntityRelationshipGraphView` now renders the real `EntityGraphCanvas` and
 * the real `EntityGraphAccessibleList` directly, side by side, against the
 * one assembled `graphData` (Task 7 wired them in). So this test asserts
 * directly against `EntityRelationshipGraphView`'s own rendered output —
 * both the canvas's `<line>`/`<g>` elements and the accessible list's node
 * and edge disclosures — rather than reading a JSON dump back out and
 * re-rendering the two components standalone with hand-extracted props.
 * `EntityRelationshipGraphView.tsx` does not export its pure
 * `buildNodes`/`buildCooccurrenceEdges`/`buildAuthoredEdges` assembly
 * functions (only the `EntityGraphNode`/`EntityGraphEdge` types), so the
 * data-assembly-fidelity checks below (Group 1) are expressed the same way
 * as the accessible-list and canvas checks: against the one shared render's
 * DOM.
 *
 * The fixture covers every property Task 10 requires in one run:
 *
 * 1. `Isolated` — a declared entity with no co-occurrence and no authored
 *    edge at all (FR-3): it must still appear as a node.
 * 2. `CoA`/`CoB` — share exactly one resource by detected mention, with no
 *    authored relationship between them -> a co-occurrence-only edge,
 *    shared-resource count 1 (also the "count 1" fixture for FR-12).
 * 3. `AuthA`/`AuthB` — an authored "ally of" relationship, never mentioned
 *    together in any resource -> an authored-only edge.
 * 4. `BothA`/`BothB` — share FIVE resources by detected mention (the "count
 *    5" fixture for FR-12) AND have an authored "rival of" relationship ->
 *    the FR-5 non-conflation case: one co-occurrence edge and one authored
 *    edge for the identical pair, never merged into one.
 *
 * No timing, benchmark, or performance assertion appears anywhere in this
 * file, consistent with the spec's OQ-3 non-claim.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
import { getEntityCooccurrence } from "../../src/lib/models/mentions-core";
import {
  createEntityRelationship,
  loadEntityRelationships,
} from "../../src/lib/models/entity-relationships";

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
import { getEntityCooccurrence as getEntityCooccurrenceClient } from "../../src/lib/api/entity-cooccurrence";
import { listEntityRelationships as listEntityRelationshipsClient } from "../../src/lib/api/entity-relationships";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityCooccurrenceClient = vi.mocked(
  getEntityCooccurrenceClient,
);
const mockedListEntityRelationshipsClient = vi.mocked(
  listEntityRelationshipsClient,
);

const PROJECT_ROOT = "/projects/entity-relationship-graph-fixture";
const PROJECT_ID = "entity-relationship-graph-fixture";

interface EntitySpec {
  key: string;
  name: string;
}

const ENTITY_SPECS: readonly EntitySpec[] = [
  { key: "isolated", name: "Isolated" },
  { key: "coA", name: "CoA" },
  { key: "coB", name: "CoB" },
  { key: "authA", name: "AuthA" },
  { key: "authB", name: "AuthB" },
  { key: "bothA", name: "BothA" },
  { key: "bothB", name: "BothB" },
] as const;

/**
 * Builds the fixture project described in this file's header comment: seven
 * declared entities, prose resources establishing the CoA/CoB (count 1) and
 * BothA/BothB (count 5) co-occurrence pairs, and authored relationship edges
 * for AuthA->AuthB and BothA->BothB, all via real persistence/model calls.
 */
async function buildFixture(): Promise<{ entityIds: Record<string, string> }> {
  // A minimal project.json is required by loadProjectConfig (read inside
  // createEntityRelationship to validate relationshipType against the
  // project's configured vocabulary).
  await mkdir(PROJECT_ROOT, { recursive: true });
  await writeFile(
    `${PROJECT_ROOT}/project.json`,
    JSON.stringify(
      { config: { relationshipTypes: ["ally of", "rival of"] } },
      null,
      2,
    ),
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

  // CoA/CoB: exactly one shared resource by detected mention -> count 1.
  const resourceCo = createTextResource({
    name: "Scene Co",
    plainText: "CoA walked beside CoB along the shore.",
  });
  await writeResourceToFile(PROJECT_ROOT, resourceCo);
  await enqueueIndex(PROJECT_ROOT, resourceCo.id);
  await flushIndexer(2000);

  // BothA/BothB: FIVE shared resources by detected mention -> count 5.
  for (let i = 0; i < 5; i += 1) {
    const resource = createTextResource({
      name: `Scene Both ${i}`,
      plainText: `BothA argued with BothB in scene number ${i}.`,
    });
    await writeResourceToFile(PROJECT_ROOT, resource);
    await enqueueIndex(PROJECT_ROOT, resource.id);
    await flushIndexer(2000);
  }

  // AuthA/AuthB: authored-only edge, never mentioned together in any
  // resource.
  await createEntityRelationship(
    PROJECT_ROOT,
    entityIds["authA"],
    entityIds["authB"],
    "ally of",
  );

  // BothA/BothB: an authored edge too, on top of their co-occurrence -> the
  // FR-5 non-conflation case.
  await createEntityRelationship(
    PROJECT_ROOT,
    entityIds["bothA"],
    entityIds["bothB"],
    "rival of",
  );

  return { entityIds };
}

describe("entity relationship graph — fixture integration (FR-3, FR-4, FR-5, FR-6, FR-7, FR-11, FR-12)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("assembles data, discloses it accessibly, and renders it distinctly on the canvas — all from the same fixture", async () => {
    const { entityIds } = await buildFixture();

    // --- Ground truth, computed directly against the fixture. --------------
    const cooccurrenceGroundTruth = await getEntityCooccurrence(PROJECT_ROOT);
    const relationshipsGroundTruth =
      await loadEntityRelationships(PROJECT_ROOT);
    expect(cooccurrenceGroundTruth[entityIds["coA"]]).toEqual([
      { entityId: entityIds["coB"], count: 1, resourceIds: expect.any(Array) },
    ]);
    expect(cooccurrenceGroundTruth[entityIds["bothA"]]).toEqual([
      {
        entityId: entityIds["bothB"],
        count: 5,
        resourceIds: expect.any(Array),
      },
    ]);
    expect(cooccurrenceGroundTruth[entityIds["isolated"]]).toBeUndefined();
    expect(cooccurrenceGroundTruth[entityIds["authA"]]).toBeUndefined();
    expect(relationshipsGroundTruth).toHaveLength(2);

    // --- Wire the view's client transports to the real model layer, for
    // this fixture's project root, exactly as entity-cooccurrence.test.tsx
    // does for its own sibling integration test. --------------------------
    const aliasTable = await buildEntityAliasTable(PROJECT_ROOT);
    mockedGetEntityAliasTable.mockResolvedValue(aliasTable);
    mockedGetEntityCooccurrenceClient.mockImplementation(async () =>
      getEntityCooccurrence(PROJECT_ROOT),
    );
    mockedListEntityRelationshipsClient.mockImplementation(async () =>
      loadEntityRelationships(PROJECT_ROOT),
    );

    const store = makeStore();
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: "Entity Relationship Graph Fixture",
        rootPath: `/tmp/${PROJECT_ID}`,
        folders: [],
        resources: [],
        features: { entities: true },
      } as never),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    await store.dispatch(fetchEntityAliasTable(PROJECT_ID));

    // `EntityRelationshipGraphView` renders the real `EntityGraphCanvas` and
    // the real `EntityGraphAccessibleList` directly (Task 7), both against
    // the identical assembled `graphData` — so a single render exercises
    // all three pieces (Task 3's assembly, Task 5's canvas, Task 8's
    // accessible list) against the one shared fixture.
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
      expect(mockedListEntityRelationshipsClient).toHaveBeenCalledWith(
        PROJECT_ID,
      ),
    );

    // Wait until both async fetches have actually landed in rendered state,
    // not just been called (React state updates settle asynchronously).
    await waitFor(() => {
      const edges = screen.getAllByTestId("entity-graph-edge");
      expect(edges.length).toBeGreaterThanOrEqual(4);
    });

    // ========================================================================
    // 1. Task 3's assembled data is consistent with the fixture's ground
    // truth — checked against the canvas's rendered node/edge elements and
    // the accessible list's rendered edge disclosures, since the view no
    // longer exposes a JSON dump of the raw assembled arrays.
    // ========================================================================
    const nodeElements = screen.getAllByTestId("entity-graph-node");
    expect(nodeElements).toHaveLength(ENTITY_SPECS.length);

    const isolatedNodeElement = nodeElements.find(
      (el: HTMLElement) =>
        el.getAttribute("data-entity-id") === entityIds["isolated"],
    );
    expect(isolatedNodeElement).toBeDefined();

    const edgeItems = within(
      screen.getByTestId("entity-graph-edge-list"),
    ).getAllByTestId("entity-graph-edge-item");

    // The Isolated entity has zero edges of either kind — names in this
    // fixture are unique, so matching the accessible list's disclosed text
    // by name is equivalent to matching by entityId.
    const isolatedEdgeEntries = edgeItems.filter((item: HTMLElement) =>
      item.textContent?.includes("Isolated"),
    );
    expect(isolatedEdgeEntries).toHaveLength(0);

    // The both-edge-kinds pair produces exactly one cooccurrence + one
    // authored record — never merged into a single entry.
    const bothEntries = edgeItems.filter(
      (item: HTMLElement) =>
        item.textContent?.includes("BothA") &&
        item.textContent?.includes("BothB"),
    );
    expect(bothEntries).toHaveLength(2);
    const bothCooccurrenceEntry = bothEntries.find((item: HTMLElement) =>
      /\d+ resources?/.test(item.textContent ?? ""),
    );
    const bothAuthoredEntry = bothEntries.find((item: HTMLElement) =>
      (item.textContent ?? "").includes("rival of"),
    );
    expect(bothCooccurrenceEntry).toBeDefined();
    expect(bothCooccurrenceEntry?.textContent).toMatch(/5/);
    expect(bothAuthoredEntry).toBeDefined();
    expect(bothAuthoredEntry).not.toBe(bothCooccurrenceEntry);

    // The co-occurrence-only pair produces exactly one record, with the
    // count-1 shared-resource total.
    const coEntries = edgeItems.filter(
      (item: HTMLElement) =>
        item.textContent?.includes("CoA") && item.textContent?.includes("CoB"),
    );
    expect(coEntries).toHaveLength(1);
    expect(coEntries[0].textContent).toMatch(/1 resource\b/);

    // The authored-only pair produces exactly one record.
    const authEntries = edgeItems.filter(
      (item: HTMLElement) =>
        item.textContent?.includes("AuthA") &&
        item.textContent?.includes("AuthB"),
    );
    expect(authEntries).toHaveLength(1);
    expect(authEntries[0].textContent).toMatch(/ally of/);
    expect(authEntries[0].textContent).toMatch(/→/);

    // ========================================================================
    // 2. The accessible list's disclosed text is consistent with the same
    // fixture data.
    // ========================================================================
    // Co-occurrence-only pair: both names and the count (re-derived above
    // via `coEntries`, re-asserted here directly against the same element
    // for the disclosure-text intent).
    expect(coEntries[0].textContent).toMatch(/CoA/);
    expect(coEntries[0].textContent).toMatch(/CoB/);
    expect(coEntries[0].textContent).toMatch(/1/);

    // Authored-only pair: both names, direction, and type.
    expect(authEntries[0].textContent).toMatch(/AuthA/);
    expect(authEntries[0].textContent).toMatch(/AuthB/);
    expect(authEntries[0].textContent).toMatch(/ally of/);
    expect(authEntries[0].textContent).toMatch(/→/);

    // Both-edge-kinds pair: TWO separate accessible-list entries, not one
    // merged entry (re-asserted directly for the disclosure-text intent).
    expect(bothAuthoredEntry?.textContent).toMatch(/→/);

    // But the Isolated entity does appear in the node list.
    const nodeList = screen.getByTestId("entity-graph-node-list");
    expect(within(nodeList).getByText("Isolated")).toBeTruthy();

    // ========================================================================
    // 3. The canvas's distinguishing attributes are consistent with the same
    // fixture data (no pixel-level or timing assertions).
    // ========================================================================
    const canvasEdgeElements = screen.getAllByTestId("entity-graph-edge");

    // The canvas renders one <line> per assembled edge (verified generally
    // by EntityGraphCanvas.test.tsx); here, the fixture's known totals let
    // us identify the both-edge-kinds pair's two lines by kind: exactly one
    // cooccurrence line (CoA/CoB, count 1) plus one authored line
    // (AuthA/AuthB) are contributed by the co-occurrence-only and
    // authored-only pairs respectively, so a second line in each group is
    // necessarily the BothA/BothB pair's own line for that kind — confirming
    // it renders as two separate <line> elements rather than one merged line.
    const cooccurrenceLines = canvasEdgeElements.filter(
      (el: HTMLElement) => el.getAttribute("data-edge-kind") === "cooccurrence",
    );
    const authoredLines = canvasEdgeElements.filter(
      (el: HTMLElement) => el.getAttribute("data-edge-kind") === "authored",
    );
    // Fixture has exactly 2 cooccurrence edges (CoA/CoB count-1, BothA/BothB
    // count-5) and 2 authored edges (AuthA/AuthB, BothA/BothB) — so the
    // both-edge-kinds pair contributes one line to each group, confirming it
    // renders as two separate <line> elements rather than one merged line.
    expect(cooccurrenceLines).toHaveLength(2);
    expect(authoredLines).toHaveLength(2);
    for (const line of cooccurrenceLines) {
      expect(line.getAttribute("stroke-dasharray")).not.toBeNull();
      expect(line.getAttribute("marker-end")).toBeNull();
    }
    for (const line of authoredLines) {
      expect(line.getAttribute("marker-end")).toMatch(/^url\(#.+\)$/);
    }

    // The count-5 co-occurrence edge (BothA/BothB) renders with a strictly
    // greater stroke-width than the count-1 co-occurrence edge (CoA/CoB).
    const strokeWidths = cooccurrenceLines
      .map((el: HTMLElement) => Number(el.getAttribute("stroke-width")))
      .sort((a: number, b: number) => a - b);
    expect(strokeWidths).toHaveLength(2);
    expect(strokeWidths[1]).toBeGreaterThan(strokeWidths[0]);
  });
});
