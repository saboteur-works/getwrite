/**
 * @module entityGraphHopDistance
 *
 * Pure, framework-free BFS over the entity graph's undirected adjacency
 * (Feature 68, Task 16, FR-17/OQ-2): given a focal entity, computes every
 * other node's shortest-path hop distance to it, counting every edge kind
 * currently reaching this module identically and with no special-casing by
 * `kind` beyond resolving its two endpoints — an authored edge's direction is
 * not consulted, mirroring `EntityGraphCanvas.tsx`'s own `edgeEndpoints`
 * helper, which this module intentionally re-derives rather than importing
 * (kept independently testable with no React/DOM dependency).
 *
 * `edges` is expected to already be filtered to the graph's currently active
 * connection-type set (`EntityRelationshipGraphView.tsx`'s own `graphData`
 * memo does this) — this module performs no filtering of its own and simply
 * walks whatever adjacency the given edge list implies (FR-17: "whichever
 * connection types are currently active").
 */
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "./EntityRelationshipGraphView";

/**
 * Returns the two entity ids an edge connects, regardless of kind or
 * direction — identical in effect to `EntityGraphCanvas.tsx`'s own
 * `edgeEndpoints`, duplicated here (not imported) so this module has no
 * dependency on the canvas component and can be unit-tested in isolation.
 * This `switch` must stay exhaustive, for the same reason the canvas's own
 * copy must: a non-exhaustive version would silently resolve a new edge kind
 * to `undefined` endpoints.
 */
export function hopDistanceEdgeEndpoints(
  edge: EntityGraphEdge,
): [string, string] {
  switch (edge.kind) {
    case "cooccurrence":
      return [edge.entityIdA, edge.entityIdB];
    case "authored":
      return [edge.sourceEntityId, edge.targetEntityId];
    case "backlinks":
      return edge.entityIds;
    case "proximityMentions":
    case "sharedMetadata":
      return [edge.entityIdA, edge.entityIdB];
  }
}

/**
 * Computes every node's shortest-path hop distance from `focalEntityId` via a
 * standard breadth-first search over the undirected adjacency implied by
 * `edges` (FR-17).
 *
 * Returns a `Map<entityId, hopDistance>`. The focal entity itself always maps
 * to `0`. A node with **no** path back to the focal entity — including every
 * node when `focalEntityId` is `null`, or when `focalEntityId` does not
 * appear in `nodes` at all (a dangling/unknown id) — is simply **absent**
 * from the returned map, rather than present with an `Infinity` value; a
 * caller checking "is this node within the configured hop radius" should
 * therefore treat a missing entry the same way it would treat `Infinity`
 * (e.g. `(distances.get(id) ?? Infinity) <= radius`), and this module
 * documents that convention here so every caller applies it consistently.
 *
 * `nodes` is consulted only to validate that `focalEntityId` names a real,
 * declared entity before searching — an id not present among `nodes` returns
 * an empty map (everything unreachable) rather than silently seeding a BFS
 * from a node that was never declared.
 */
export function computeHopDistances(
  nodes: EntityGraphNode[],
  edges: EntityGraphEdge[],
  focalEntityId: string | null,
): Map<string, number> {
  const distances = new Map<string, number>();
  if (focalEntityId === null) return distances;
  if (!nodes.some((node) => node.entityId === focalEntityId)) return distances;

  const adjacency = new Map<string, Set<string>>();
  const addDirectedAdjacency = (from: string, to: string): void => {
    const neighbors = adjacency.get(from) ?? new Set<string>();
    neighbors.add(to);
    adjacency.set(from, neighbors);
  };
  for (const edge of edges) {
    const [entityIdA, entityIdB] = hopDistanceEdgeEndpoints(edge);
    addDirectedAdjacency(entityIdA, entityIdB);
    addDirectedAdjacency(entityIdB, entityIdA);
  }

  distances.set(focalEntityId, 0);
  const queue: string[] = [focalEntityId];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    const currentDistance = distances.get(current) ?? 0;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, currentDistance + 1);
      queue.push(neighbor);
    }
  }

  return distances;
}
