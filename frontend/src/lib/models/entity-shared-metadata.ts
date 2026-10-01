/**
 * @module entity-shared-metadata
 *
 * Derives an edge between two declared entities that share at least one tag
 * or one identical value of the same custom metadata field
 * (`specs/features/entity-graph-connections-persistence-focal-point.md`
 * FR-5; no minimum-overlap threshold for v1, OQ-6).
 *
 * This is a dedicated, standalone module precisely so neither `tags.ts` nor
 * `metadata-schema.ts` needs to know about the other's domain, or about
 * entities at all: both of those modules are generic, project-wide metadata
 * CRUD layers with no concept of "entity". This module is the one place
 * that reads from both and layers the entity concept on top, mirroring how
 * `mentions-core.ts`'s `getEntityCooccurrence` derives entity-pair edges
 * from the (also entity-agnostic) mention index without that index needing
 * to know about entities either.
 *
 * Declared entities are discovered the same way `entity-alias-table.ts`
 * does: every resource whose sidecar has a non-empty string `entityKind`.
 *
 * Two signals are read:
 * - **Tags** (`tags.ts`): for each tag, every pair of declared entities
 *   assigned that same tag shares it.
 * - **Custom metadata fields** (`metadata-schema.ts` for the field key list,
 *   sidecar `userMetadata` for the per-resource values): for each field key
 *   declared in the project's metadata schema, every pair of declared
 *   entities whose `userMetadata[fieldKey]` holds the identical, non-empty
 *   value shares that field.
 *
 * A pair sharing more than one tag and/or field still produces exactly one
 * edge for that pair (FR-5's "an edge", singular) — `sharedTagIds` and
 * `sharedFieldKeys` on that one edge list everything shared, rather than one
 * edge per shared signal. Pairs are unordered and non-reflexive, mirroring
 * `getEntityCooccurrence`: an entity is never paired with itself, and a pair
 * appears once regardless of which entity is "first".
 *
 * No new persisted field is introduced by this module — it is a pure,
 * on-demand derivation over the two existing persisted sources.
 */
import { listResourceIds } from "./backlinks";
import { readSidecar } from "./sidecar";
import { getSchema } from "./metadata-schema";
import { listTags, listResourcesByTag } from "./tags";
import type { MetadataValue } from "./types";

/**
 * One derived edge between two declared entities that share at least one tag
 * or one identical custom metadata field value (FR-5).
 *
 * `entityIdA`/`entityIdB` are an unordered pair (no canonical ordering is
 * guaranteed beyond "stable within a single call"). `sharedTagIds` lists
 * every tag id both entities are assigned; `sharedFieldKeys` lists every
 * metadata schema field key where both entities hold the identical value.
 * At least one of the two is always non-empty.
 */
export type SharedMetadataEdge = {
  entityIdA: string;
  entityIdB: string;
  sharedTagIds: string[];
  sharedFieldKeys: string[];
};

/**
 * Returns the ids of every resource declared as an entity (a non-empty
 * string `entityKind` in its sidecar), mirroring
 * `entity-alias-table.ts`'s `buildEntityAliasTable` discovery logic. A
 * sidecar that fails to read is skipped, not treated as fatal, consistent
 * with that module's precedent.
 */
async function getDeclaredEntityIds(projectRoot: string): Promise<string[]> {
  const ids = await listResourceIds(projectRoot);
  const entityIds: string[] = [];
  for (const id of ids) {
    let sidecar: Record<string, MetadataValue> | null;
    try {
      sidecar = await readSidecar(projectRoot, id);
    } catch {
      continue;
    }
    if (!sidecar) continue;
    const entityKind = sidecar["entityKind"];
    if (typeof entityKind === "string" && entityKind.length > 0) {
      entityIds.push(id);
    }
  }
  return entityIds;
}

/**
 * Reads every declared entity's sidecar once, keyed by entity id, for reuse
 * across the custom-field pass below (avoids re-reading each sidecar once
 * per schema field).
 */
async function readEntitySidecars(
  projectRoot: string,
  entityIds: string[],
): Promise<Map<string, Record<string, MetadataValue>>> {
  const sidecars = new Map<string, Record<string, MetadataValue>>();
  for (const id of entityIds) {
    try {
      const sidecar = await readSidecar(projectRoot, id);
      if (sidecar) sidecars.set(id, sidecar);
    } catch {
      // Skip unreadable sidecars, consistent with getDeclaredEntityIds.
    }
  }
  return sidecars;
}

/**
 * Returns a sidecar's `userMetadata` map, or an empty object when absent or
 * not an object. Custom metadata field values live under `userMetadata` on
 * disk (see `field-values.ts`'s `flattenUserMetadata` for the equivalent
 * precedent elsewhere in the model layer).
 */
function userMetadataOf(
  sidecar: Record<string, MetadataValue>,
): Record<string, MetadataValue> {
  const userMeta = sidecar["userMetadata"];
  if (userMeta && typeof userMeta === "object" && !Array.isArray(userMeta)) {
    return userMeta as Record<string, MetadataValue>;
  }
  return {};
}

/**
 * Returns a stable string key for comparing two metadata values for
 * equality, or `null` when the value should not count as "set" at all
 * (missing, `null`, an empty/whitespace-only string, or an empty array).
 * Two entities both lacking a value for the same field must not be treated
 * as sharing it.
 */
function valueKey(value: MetadataValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return JSON.stringify(value);
}

/** Accumulator for one unordered entity pair's shared signals. */
type PairShare = { sharedTagIds: Set<string>; sharedFieldKeys: Set<string> };

/** Canonical, order-independent key for an unordered entity pair. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function getOrCreatePair(
  pairs: Map<string, PairShare>,
  a: string,
  b: string,
): PairShare {
  const key = pairKey(a, b);
  let share = pairs.get(key);
  if (!share) {
    share = { sharedTagIds: new Set(), sharedFieldKeys: new Set() };
    pairs.set(key, share);
  }
  return share;
}

/**
 * Records every pair of declared entities sharing a tag assignment into
 * `pairs`. Reads `tags.ts`'s existing per-tag resource listing
 * (`listResourcesByTag`) rather than any new tag-assignment read, narrowed
 * to declared entities only.
 */
async function addTagShares(
  projectRoot: string,
  entityIdSet: Set<string>,
  pairs: Map<string, PairShare>,
): Promise<void> {
  const tags = await listTags(projectRoot);
  for (const tag of tags) {
    const resourceIds = await listResourcesByTag(projectRoot, tag.id);
    const entityResourceIds = resourceIds.filter((id) => entityIdSet.has(id));
    for (let i = 0; i < entityResourceIds.length; i++) {
      for (let j = i + 1; j < entityResourceIds.length; j++) {
        const a = entityResourceIds[i];
        const b = entityResourceIds[j];
        if (a === undefined || b === undefined) continue;
        getOrCreatePair(pairs, a, b).sharedTagIds.add(tag.id);
      }
    }
  }
}

/**
 * Records every pair of declared entities sharing an identical value for the
 * same custom metadata field into `pairs`. The field key list comes from
 * `metadata-schema.ts`'s `getSchema` (every field currently declared in the
 * project's schema, built-in or user-added); the values come from each
 * entity's own sidecar `userMetadata`, already read via `sidecars`.
 */
async function addFieldValueShares(
  projectRoot: string,
  entityIds: string[],
  sidecars: Map<string, Record<string, MetadataValue>>,
  pairs: Map<string, PairShare>,
): Promise<void> {
  const schema = await getSchema(projectRoot);
  const fieldKeys = schema.groups.flatMap((group) =>
    group.fields.map((field) => field.key),
  );

  for (const fieldKey of fieldKeys) {
    // Group entity ids by their value key for this field.
    const byValue = new Map<string, string[]>();
    for (const entityId of entityIds) {
      const sidecar = sidecars.get(entityId);
      if (!sidecar) continue;
      const value = userMetadataOf(sidecar)[fieldKey];
      const key = valueKey(value);
      if (key === null) continue;
      const bucket = byValue.get(key) ?? [];
      bucket.push(entityId);
      byValue.set(key, bucket);
    }

    for (const sameValueEntityIds of byValue.values()) {
      if (sameValueEntityIds.length < 2) continue;
      for (let i = 0; i < sameValueEntityIds.length; i++) {
        for (let j = i + 1; j < sameValueEntityIds.length; j++) {
          const a = sameValueEntityIds[i];
          const b = sameValueEntityIds[j];
          if (a === undefined || b === undefined) continue;
          getOrCreatePair(pairs, a, b).sharedFieldKeys.add(fieldKey);
        }
      }
    }
  }
}

/**
 * Returns one edge per pair of declared entities that share at least one tag
 * or one identical value of the same custom metadata field (FR-5). No
 * minimum-overlap threshold — a single shared tag or field value is
 * sufficient (OQ-6).
 *
 * Returns an empty array when the project has fewer than two declared
 * entities, or when no pair shares anything.
 */
export async function getEntitySharedMetadataEdges(
  projectRoot: string,
): Promise<SharedMetadataEdge[]> {
  const entityIds = await getDeclaredEntityIds(projectRoot);
  if (entityIds.length < 2) return [];

  const entityIdSet = new Set(entityIds);
  const sidecars = await readEntitySidecars(projectRoot, entityIds);
  const pairs = new Map<string, PairShare>();

  await addTagShares(projectRoot, entityIdSet, pairs);
  await addFieldValueShares(projectRoot, entityIds, sidecars, pairs);

  const edges: SharedMetadataEdge[] = [];
  for (const [key, share] of pairs) {
    const separatorIndex = key.indexOf("\u0000");
    const entityIdA = key.slice(0, separatorIndex);
    const entityIdB = key.slice(separatorIndex + 1);
    edges.push({
      entityIdA,
      entityIdB,
      sharedTagIds: Array.from(share.sharedTagIds),
      sharedFieldKeys: Array.from(share.sharedFieldKeys),
    });
  }
  return edges;
}

const entitySharedMetadata = { getEntitySharedMetadataEdges };
export default entitySharedMetadata;
