/**
 * Entity graph connection-type vocabulary (Feature 68, FR-1/FR-2). Used as a
 * project's effective connection-type list at read time when a project has
 * no persisted `config.entityGraphConnectionTypes` — this is a runtime
 * fallback, not seed data written into any project file. Import from here
 * rather than re-declaring the list or the valid-key set at any read site,
 * mirroring `default-relationship-types.ts`'s shape for the relationship-type
 * vocabulary.
 */

/**
 * The five connection-type keys the entity graph knows how to draw. An
 * unrecognized key in a persisted list is dropped rather than erroring the
 * whole view (FR-2) — see `filterToKnownConnectionTypes`.
 */
export const KNOWN_ENTITY_GRAPH_CONNECTION_TYPES = [
  "authored",
  "cooccurrence",
  "backlinks",
  "proximityMentions",
  "sharedMetadata",
] as const;

export type EntityGraphConnectionType =
  (typeof KNOWN_ENTITY_GRAPH_CONNECTION_TYPES)[number];

/**
 * A project's effective connection-type list when no explicit
 * `config.entityGraphConnectionTypes` is persisted (FR-1) — matches Feature
 * 39's shipped behavior (authored edges + co-occurrence, nothing else).
 */
export const DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES: string[] = [
  "authored",
  "cooccurrence",
];

const KNOWN_CONNECTION_TYPE_SET: ReadonlySet<string> = new Set(
  KNOWN_ENTITY_GRAPH_CONNECTION_TYPES,
);

/**
 * Drops any key in `connectionTypes` that isn't one of the five known
 * connection-type keys, rather than throwing (FR-2) — a persisted list
 * written by a future version with a type this version doesn't know about
 * degrades to the subset this version can still draw.
 */
export function filterToKnownConnectionTypes(
  connectionTypes: readonly string[],
): EntityGraphConnectionType[] {
  return connectionTypes.filter(
    (connectionType): connectionType is EntityGraphConnectionType =>
      KNOWN_CONNECTION_TYPE_SET.has(connectionType),
  );
}
