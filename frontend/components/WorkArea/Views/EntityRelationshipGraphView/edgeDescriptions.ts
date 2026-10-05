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

/**
 * Composes a backlink edge's disclosure text (FR-6, Task 5): both entity
 * names only, worded as undirected, mirroring {@link describeCooccurrenceEdge}'s
 * "X and Y ..." phrasing — `getEntityBacklinkEdges` (`backlinks.ts`)
 * collapses a bidirectional backlink into one unordered pair with no weight
 * or direction of its own, so there is nothing further to disclose beyond
 * the fact of the link.
 */
export function describeBacklinkEdge(
  nameById: Map<string, string>,
  entityIdA: string,
  entityIdB: string,
): string {
  const nameA = resolveEntityName(nameById, entityIdA);
  const nameB = resolveEntityName(nameById, entityIdB);
  return `${nameA} and ${nameB} are linked by a backlink`;
}

/**
 * Composes a proximity-mention edge's disclosure text (FR-6, Task 5): both
 * entity names and the averaged character-offset distance between their
 * mentions in a shared resource, phrased in natural terms rather than as a
 * bare integer (`getProximityMentionEdges`, `mentions-core.ts`: `weight` is
 * a **raw average distance in characters** where a *smaller* number means a
 * *closer*, stronger connection).
 */
export function describeProximityMentionEdge(
  nameById: Map<string, string>,
  entityIdA: string,
  entityIdB: string,
  weight: number,
): string {
  const nameA = resolveEntityName(nameById, entityIdA);
  const nameB = resolveEntityName(nameById, entityIdB);
  const roundedWeight = Math.round(weight);
  const characterWord = roundedWeight === 1 ? "character" : "characters";
  return `${nameA} and ${nameB} are mentioned close together in a shared resource, an average of ${roundedWeight} ${characterWord} apart`;
}

/**
 * Composes a shared-metadata edge's disclosure text (FR-6, Task 5): both
 * entity names plus what they share.
 *
 * Assumed input shape: unlike `getEntitySharedMetadataEdges`
 * (`entity-shared-metadata.ts`), whose `SharedMetadataEdge` carries raw tag
 * ids (`sharedTagIds`) and raw metadata field keys (`sharedFieldKeys`),
 * this function takes `sharedTagLabels`/`sharedFieldLabels` already
 * resolved to human-readable strings (tag names / field labels) — mirroring
 * how `describeAuthoredEdge` is given `relationshipType` as a plain,
 * already-label-ready string rather than an id. The caller that assembles
 * live graph data (Task 7, not in this task's scope) is responsible for
 * that id-to-label resolution before calling this function.
 *
 * At least one of `sharedTagLabels`/`sharedFieldLabels` is expected to be
 * non-empty (mirroring `SharedMetadataEdge`'s own invariant); an edge with
 * both empty still renders without throwing, just with nothing to list.
 */
export function describeSharedMetadataEdge(
  nameById: Map<string, string>,
  entityIdA: string,
  entityIdB: string,
  sharedTagLabels: string[],
  sharedFieldLabels: string[],
): string {
  const nameA = resolveEntityName(nameById, entityIdA);
  const nameB = resolveEntityName(nameById, entityIdB);

  const parts: string[] = [];
  if (sharedTagLabels.length > 0) {
    const tagWord = sharedTagLabels.length === 1 ? "tag" : "tags";
    parts.push(`${tagWord} ${sharedTagLabels.join(", ")}`);
  }
  if (sharedFieldLabels.length > 0) {
    const fieldWord = sharedFieldLabels.length === 1 ? "field" : "fields";
    parts.push(`${fieldWord} ${sharedFieldLabels.join(", ")}`);
  }

  const sharedSummary = parts.length > 0 ? parts.join(" and ") : "metadata";
  return `${nameA} and ${nameB} share ${sharedSummary}`;
}
