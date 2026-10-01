/**
 * Unit tests for `computeHopDistances` (Feature 68, Task 16, FR-17/OQ-2):
 * standard full-graph BFS over whichever edges are passed in, with no
 * special-casing for nodes beyond the configured radius — radius filtering
 * itself is the caller's job (`EntityGraphCanvas.tsx`), not this module's.
 */
import { describe, expect, it } from "vitest";
import {
  computeHopDistances,
  hopDistanceEdgeEndpoints,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/entityGraphHopDistance";
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView";

const NODES: EntityGraphNode[] = [
  { entityId: "e-1", name: "Anna", entityKind: "character" },
  { entityId: "e-2", name: "Ben", entityKind: "character" },
  { entityId: "e-3", name: "Castle Greywatch", entityKind: "place" },
  { entityId: "e-4", name: "Dana", entityKind: "character" },
  { entityId: "e-5", name: "Isolated Ivy", entityKind: "character" },
];

// A chain e-1 - e-2 - e-3 - e-4, plus e-5 with no edges at all.
const EDGES: EntityGraphEdge[] = [
  {
    kind: "cooccurrence",
    entityIdA: "e-1",
    entityIdB: "e-2",
    sharedResourceCount: 1,
  },
  {
    kind: "authored",
    id: "rel-1",
    sourceEntityId: "e-2",
    targetEntityId: "e-3",
    relationshipType: "lives in",
  },
  { kind: "backlinks", entityIds: ["e-3", "e-4"] },
];

describe("computeHopDistances", () => {
  it("returns 0 for the focal entity itself", () => {
    const distances = computeHopDistances(NODES, EDGES, "e-1");
    expect(distances.get("e-1")).toBe(0);
  });

  it("computes correct shortest-path hop distances along a chain", () => {
    const distances = computeHopDistances(NODES, EDGES, "e-1");
    expect(distances.get("e-2")).toBe(1);
    expect(distances.get("e-3")).toBe(2);
    expect(distances.get("e-4")).toBe(3);
  });

  it("treats a node with no path back to the focal entity as unreachable (absent from the map)", () => {
    const distances = computeHopDistances(NODES, EDGES, "e-1");
    expect(distances.has("e-5")).toBe(false);
    expect(distances.get("e-5")).toBeUndefined();
  });

  it("finds the shorter of two paths when a cycle exists", () => {
    const cyclicEdges: EntityGraphEdge[] = [
      ...EDGES,
      // A direct shortcut from e-1 to e-4, shorter than the 3-hop chain path.
      {
        kind: "sharedMetadata",
        entityIdA: "e-1",
        entityIdB: "e-4",
        sharedTagIds: ["t-1"],
        sharedFieldKeys: [],
      },
    ];
    const distances = computeHopDistances(NODES, cyclicEdges, "e-1");
    expect(distances.get("e-4")).toBe(1);
  });

  it("returns an empty map when focalEntityId is null", () => {
    const distances = computeHopDistances(NODES, EDGES, null);
    expect(distances.size).toBe(0);
  });

  it("returns an empty map when focalEntityId names an entity not present in nodes", () => {
    const distances = computeHopDistances(NODES, EDGES, "e-unknown");
    expect(distances.size).toBe(0);
  });

  it("treats the focal entity as reachable at distance 0 even with zero edges anywhere", () => {
    const distances = computeHopDistances(NODES, [], "e-5");
    expect(distances.get("e-5")).toBe(0);
    expect(distances.has("e-1")).toBe(false);
  });

  it("walks an authored edge's direction-agnostic adjacency (undirected for BFS purposes)", () => {
    // e-3 -> e-2 is the reverse of the authored edge's own source->target
    // direction; BFS must still reach e-2 from e-3's side.
    const distances = computeHopDistances(NODES, EDGES, "e-3");
    expect(distances.get("e-2")).toBe(1);
    expect(distances.get("e-1")).toBe(2);
  });
});

describe("hopDistanceEdgeEndpoints", () => {
  it("resolves every edge kind's two endpoints", () => {
    expect(
      hopDistanceEdgeEndpoints({
        kind: "cooccurrence",
        entityIdA: "a",
        entityIdB: "b",
        sharedResourceCount: 1,
      }),
    ).toEqual(["a", "b"]);
    expect(
      hopDistanceEdgeEndpoints({
        kind: "authored",
        id: "rel",
        sourceEntityId: "a",
        targetEntityId: "b",
        relationshipType: "knows",
      }),
    ).toEqual(["a", "b"]);
    expect(
      hopDistanceEdgeEndpoints({ kind: "backlinks", entityIds: ["a", "b"] }),
    ).toEqual(["a", "b"]);
    expect(
      hopDistanceEdgeEndpoints({
        kind: "proximityMentions",
        entityIdA: "a",
        entityIdB: "b",
        resourceId: "r-1",
        weight: 10,
      }),
    ).toEqual(["a", "b"]);
    expect(
      hopDistanceEdgeEndpoints({
        kind: "sharedMetadata",
        entityIdA: "a",
        entityIdB: "b",
        sharedTagIds: [],
        sharedFieldKeys: ["f"],
      }),
    ).toEqual(["a", "b"]);
  });
});
