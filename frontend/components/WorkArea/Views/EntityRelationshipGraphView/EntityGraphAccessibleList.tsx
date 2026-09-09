import React from "react";
import type {
  EntityGraphEdge,
  EntityGraphNode,
} from "./EntityRelationshipGraphView";

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

const UNKNOWN_ENTITY_LABEL = "Unknown entity";

/**
 * Resolves an entity id to its display name via the node-id lookup, falling
 * back to the "Unknown entity" label (mirroring
 * `EntityRelationshipsSection.tsx`'s existing convention) rather than
 * throwing or rendering a raw, meaningless id for a dangling edge reference.
 */
function resolveEntityName(
  nameById: Map<string, string>,
  entityId: string,
): string {
  return nameById.get(entityId) ?? UNKNOWN_ENTITY_LABEL;
}

/**
 * Composes a co-occurrence edge's accessible disclosure text (FR-11/FR-12):
 * both entity names and the literal shared-resource count, since thickness
 * alone (the canvas encoding) is not perceivable through a screen reader.
 */
function describeCooccurrenceEdge(
  nameById: Map<string, string>,
  entityIdA: string,
  entityIdB: string,
  sharedResourceCount: number,
): string {
  const nameA = resolveEntityName(nameById, entityIdA);
  const nameB = resolveEntityName(nameById, entityIdB);
  const resourceWord = sharedResourceCount === 1 ? "resource" : "resources";
  return `${nameA} and ${nameB} share ${sharedResourceCount} ${resourceWord}`;
}

/**
 * Composes an authored edge's accessible disclosure text (FR-11): both
 * entity names, a direction indicator, and the relationship type.
 */
function describeAuthoredEdge(
  nameById: Map<string, string>,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
): string {
  const sourceName = resolveEntityName(nameById, sourceEntityId);
  const targetName = resolveEntityName(nameById, targetEntityId);
  return `${sourceName} → ${targetName} (${relationshipType})`;
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
    <div data-testid="entity-graph-accessible-list">
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
