/**
 * @module entity-graph-position-invalidation
 *
 * Pure, dependency-free home for {@link isPositionInvalidated} (Feature 68,
 * FR-11), split out of `entity-graph-positions.ts` (Task 13) specifically so
 * a client component — `EntityGraphCanvas.tsx` — can import this one check
 * without pulling in `entity-graph-positions.ts`'s own transitive
 * `node:path`/`io.ts`/`meta-locks.ts` imports, which are server-only and must
 * never enter the client bundle (the exact failure mode `next.config.mjs`'s
 * `turbopack.resolveAlias` comment block documents for
 * `native-search-backend.ts` and friends: Turbopack traces a module's full
 * import graph before any runtime reachability check can prove a branch
 * dead). `entity-graph-positions.ts` re-exports this function unchanged, so
 * no existing import site (its own doc comment, its model-layer callers, or
 * `tests/unit/entity-graph-positions.test.ts`) needs to change.
 */
import type { EntityGraphPositionRecord } from "./entity-graph-positions";

/**
 * Pure, synchronous FR-11 invalidation check: a persisted position record is
 * invalidated specifically when the project's current active connection-type
 * list has changed — added or removed a type — since the record was saved,
 * compared as a SET against the record's own `connectionTypesSnapshot`.
 *
 * Order-insensitive: a mere reordering of the identical active types is not
 * a change. Not invalidated for any other reason (e.g. a position simply
 * being old, or the entity itself no longer existing — this function knows
 * nothing about entity existence).
 */
export function isPositionInvalidated(
  record: EntityGraphPositionRecord,
  activeTypes: string[],
): boolean {
  const snapshotSet = new Set(record.connectionTypesSnapshot);
  const activeSet = new Set(activeTypes);
  if (snapshotSet.size !== activeSet.size) return true;
  for (const type of snapshotSet) {
    if (!activeSet.has(type)) return true;
  }
  return false;
}
