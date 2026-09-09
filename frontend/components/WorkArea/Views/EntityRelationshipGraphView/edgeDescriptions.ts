/**
 * Shared, framework-free text descriptions for an entity graph edge.
 *
 * `EntityGraphAccessibleList.tsx` (the semantic accessible list) and the
 * edge-tooltip surface both need the identical description text for a given
 * edge, so it lives here once rather than being defined twice and risking
 * drift between the two surfaces (FR-2).
 */

export const UNKNOWN_ENTITY_LABEL = "Unknown entity";

/**
 * Resolves an entity id to its display name via the node-id lookup, falling
 * back to the "Unknown entity" label (mirroring
 * `EntityRelationshipsSection.tsx`'s existing convention) rather than
 * throwing or rendering a raw, meaningless id for a dangling edge reference.
 */
export function resolveEntityName(
  nameById: Map<string, string>,
  entityId: string,
): string {
  return nameById.get(entityId) ?? UNKNOWN_ENTITY_LABEL;
}

/**
 * Composes a co-occurrence edge's disclosure text (FR-11/FR-12): both
 * entity names and the literal shared-resource count, since thickness
 * alone (the canvas encoding) is not perceivable through a screen reader.
 */
export function describeCooccurrenceEdge(
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
 * Composes an authored edge's disclosure text (FR-11): both entity names,
 * a direction indicator, and the relationship type.
 */
export function describeAuthoredEdge(
  nameById: Map<string, string>,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
): string {
  const sourceName = resolveEntityName(nameById, sourceEntityId);
  const targetName = resolveEntityName(nameById, targetEntityId);
  return `${sourceName} → ${targetName} (${relationshipType})`;
}
