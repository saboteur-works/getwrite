import React from "react";
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "./EntityRelationshipGraphView";
import {
  describeAuthoredEdge,
  describeCooccurrenceEdge,
} from "./edgeDescriptions";

export interface EntityGraphAccessibleListProps {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  /**
   * Invoked when a node's button is activated — pointer click, or a native
   * `<button>`'s built-in Enter/Space keyboard activation (FR-9). Called
   * with that node's `entityId`.
   */
  onNodeActivated?: (entityId: string) => void;
}

/**
 * Sorts nodes alphabetically by name, case-insensitive (OQ-7), regardless
 * of input order. Ties (identical names, case-insensitively) fall back to
 * `entityId` so the sort is stable and deterministic.
 */
function sortNodesByName(nodes: EntityGraphNode[]): EntityGraphNode[] {
  return [...nodes].sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (nameCompare !== 0) return nameCompare;
    return a.entityId.localeCompare(b.entityId);
  });
}

/**
 * `EntityGraphAccessibleList` is the FR-11 synchronized accessible list: a
 * semantic node list (a `<ul>` of `<li>`-wrapped native
 * `<button type="button">` per entity, mirroring `EntityRosterRow.tsx:70-136`)
 * plus a semantic, non-interactive edge list disclosing each edge's kind,
 * direction/type, and — for a co-occurrence edge — its shared-resource
 * count (FR-12) as literal text.
 *
 * Rendered by `EntityRelationshipGraphView.tsx` alongside `EntityGraphCanvas`,
 * from the same node and edge data, so the two stay in step. It takes that
 * data as props and holds no fetching or selection state of its own, which is
 * also what lets its tests drive it directly from fixtures.
 *
 * The list is visually hidden (`sr-only`), not removed: it is FR-10's
 * designated accessibility mechanism — "MUST be satisfied by the synchronized
 * accessible list specified in FR-11" — so it has to stay in the
 * accessibility tree and keyboard tab order while the canvas beside it
 * carries the visual reading. `sr-only` clips it; `hidden` or `display: none`
 * would look like the same change and silently delete the graph's only
 * screen-reader surface.
 *
 * It shipped unstyled and therefore visible, which rendered every node name
 * and edge description as raw text under the canvas. FR-11's wording ("render,
 * alongside the canvas, a synchronized semantic list") does not say whether
 * the list should be seen; `sr-only` is the resolution of that ambiguity, and
 * follows the same convention `EntityRosterRow.tsx:133` uses.
 */
export default function EntityGraphAccessibleList({
  nodes,
  edges,
  onNodeActivated,
}: EntityGraphAccessibleListProps): JSX.Element {
  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.entityId, node.name);
    }
    return map;
  }, [nodes]);

  const sortedNodes = React.useMemo(() => sortNodesByName(nodes), [nodes]);

  return (
    <div className="sr-only" data-testid="entity-graph-accessible-list">
      <ul aria-label="Entity nodes" data-testid="entity-graph-node-list">
        {sortedNodes.map((node) => (
          <li key={node.entityId} data-testid="entity-graph-node-item">
            <button
              type="button"
              onClick={() => onNodeActivated?.(node.entityId)}
            >
              {node.name}
            </button>
          </li>
        ))}
      </ul>
      <ul aria-label="Entity edges" data-testid="entity-graph-edge-list">
        {edges.map((edge) => {
          if (edge.kind === "cooccurrence") {
            const key = `cooccurrence-${edge.entityIdA}-${edge.entityIdB}`;
            return (
              <li key={key} data-testid="entity-graph-edge-item">
                {describeCooccurrenceEdge(
                  nameById,
                  edge.entityIdA,
                  edge.entityIdB,
                  edge.sharedResourceCount,
                )}
              </li>
            );
          }
          return (
            <li
              key={`authored-${edge.id}`}
              data-testid="entity-graph-edge-item"
            >
              {describeAuthoredEdge(
                nameById,
                edge.sourceEntityId,
                edge.targetEntityId,
                edge.relationshipType,
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
