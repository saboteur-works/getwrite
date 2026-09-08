/**
 * @module mentions-core
 *
 * Transport-agnostic reads over the mention index (see `mention-index.ts`,
 * Task 4). Two directions are exposed, matching FR-9 and FR-10 of
 * `specs/features/entity-layer.md`:
 *
 * - {@link getResourceMentions} — "which entities does this resource
 *   mention" (FR-9), read via the index's native `resourceId` key.
 * - {@link getEntityMentionedIn} — "which resources mention this entity,
 *   with a snippet per occurrence" (FR-10), read via
 *   {@link invertMentionIndex}.
 *
 * Both are pure reads: neither writes to the mention index nor triggers
 * (re)detection. Detection itself is the indexer-queue's responsibility
 * (FR-7/FR-8), not this module's.
 *
 * **Task 15 addition — merging in explicit links (FR-12) and ambiguity
 * (FR-14).** `getEntityMentionedIn` is the one place an entity's detected
 * mentions and its explicit `linkedFrom` backlinks need to appear together
 * as a single list (FR-12: "wherever this list and the entity's explicit
 * backlinks appear together..."), so rather than add a second route/
 * transport/native-backend pair (a full ADR-021 plumbing set) purely to
 * fetch `linkedFrom` for one resource, this function now reads the already-
 * persisted `backlinks.json` (`loadBacklinks`, degrades to `{}` when
 * missing, same as the mention index) and merges explicit linkers into the
 * same result set, keyed by `resourceId` so a resource that is both linked
 * and mentioned appears exactly once with both flags set. This keeps the
 * existing route/transport/native-backend untouched — no new plumbing layer
 * — while satisfying FR-12's merge requirement at the one call site that
 * needs it.
 *
 * Ambiguity (FR-14) is likewise derived here rather than exposed via a new
 * client-facing read of `entity-alias-table.ts`'s `claimedBy` map:
 * `indexer-queue.ts` already records a mention against *every* claiming
 * entity when an alias is ambiguous, and it does so by re-running
 * `findMentionOffsets` per entity — so an ambiguous occurrence surfaces as
 * two (or more) `MentionRecord`s for the *same* `resourceId` and the *same*
 * character offset, one per claiming `entityId`. `resolveAmbiguousWith`
 * below detects this directly from the already-loaded `MentionIndex` by
 * checking, for each of our entity's occurrence offsets, whether any other
 * entity's record for that resource also claims that exact offset. No new
 * index, field, or route is needed for this — the ambiguity is already
 * latent in the persisted mention data once two entities share a term.
 */
import { loadResourceContent } from "../tiptap-utils";
import {
  loadMentionIndex,
  invertMentionIndex,
  type MentionIndex,
  type MentionRecord,
} from "./mention-index";
import { loadBacklinks } from "./backlinks";
import { readSidecar } from "./sidecar";

/** A single entity mentioned in a resource (FR-9). */
export type ResourceMention = { entityId: string; name: string };

/**
 * A single resource associated with an entity, either by an explicit link
 * (`isLinked`, FR-12) or a detected prose mention (`isMentioned`, FR-10), or
 * both. A resource that is both linked and mentioned appears once with both
 * flags set — never as two rows.
 *
 * `snippets` and `ambiguousWith` are only populated for mentioned
 * occurrences (empty arrays for a linked-only row, since a plain explicit
 * link carries no occurrence offsets to snippet). `ambiguousWith` is
 * parallel to `snippets`: `ambiguousWith[i]` names every other entity whose
 * own mention record also claims `snippets[i]`'s occurrence (FR-14) — empty
 * when that occurrence is unambiguous.
 */
export type EntityMentionedIn = {
  resourceId: string;
  name: string;
  snippets: string[];
  isLinked: boolean;
  isMentioned: boolean;
  ambiguousWith: string[][];
};

const SNIPPET_MAX_LEN = 160;

/**
 * Resolves a resource or entity's display name from its sidecar's `name`
 * field, falling back to the id itself when the sidecar is missing or has
 * no `name` (e.g. deleted between indexing and read).
 */
async function resolveName(projectRoot: string, id: string): Promise<string> {
  const sidecar = await readSidecar(projectRoot, id);
  const name = sidecar?.["name"];
  return typeof name === "string" && name.length > 0 ? name : id;
}

/**
 * Extracts a fixed-width snippet of `text` centered on a known character
 * offset.
 *
 * This is a small offset-based sibling of `search-snippet.ts`'s
 * `extractSnippet`, not a reuse of it. `extractSnippet` takes a query
 * *string* and re-searches `text` for its first occurrence — appropriate
 * when the caller only has a term, not a position. Here the mention index
 * already carries the exact character offset of each occurrence (FR-6), so
 * re-searching would be redundant work that can additionally center the
 * wrong occurrence whenever an alias appears more than once in a resource
 * (the leftmost match `extractSnippet` finds is not necessarily the one at
 * this offset). Centering directly on the stored offset is the correct
 * disambiguation and the entire reason FR-6 stores offsets in the first
 * place, so this small helper mirrors `extractSnippet`'s windowing math
 * instead of calling through it.
 */
function snippetAtOffset(
  text: string,
  offset: number,
  maxLen: number = SNIPPET_MAX_LEN,
): string {
  if (!text) return "";
  let start = Math.max(0, offset - Math.floor(maxLen / 2));
  const end = Math.min(text.length, start + maxLen);
  if (end - start < maxLen) {
    start = Math.max(0, end - maxLen);
  }
  return text.slice(start, end);
}

/**
 * Returns every entity detected as mentioned within `resourceId` (FR-9),
 * resolving each entity's display name from its sidecar.
 *
 * Returns an empty array when the resource has no mention records, or when
 * the mention index has never been built for this project.
 */
export async function getResourceMentions(
  projectRoot: string,
  resourceId: string,
): Promise<ResourceMention[]> {
  const index = await loadMentionIndex(projectRoot);
  const records = index[resourceId] ?? [];

  const seen = new Set<string>();
  const mentions: ResourceMention[] = [];
  for (const record of records) {
    if (seen.has(record.entityId)) continue;
    seen.add(record.entityId);
    const name = await resolveName(projectRoot, record.entityId);
    mentions.push({ entityId: record.entityId, name });
  }
  return mentions;
}

/**
 * For each of `offsets` (one entity's occurrence offsets within
 * `resourceId`), finds every *other* entity whose own mention record for
 * the same resource also claims that exact offset (FR-14) and resolves
 * their display names.
 *
 * Returns a parallel array to `offsets`: `result[i]` is the (possibly
 * empty) list of other entity names claiming `offsets[i]`.
 */
async function resolveAmbiguousWith(
  projectRoot: string,
  index: MentionIndex,
  resourceId: string,
  entityId: string,
  offsets: number[],
): Promise<string[][]> {
  const otherRecords = (index[resourceId] ?? []).filter(
    (record) => record.entityId !== entityId,
  );
  if (otherRecords.length === 0) return offsets.map(() => []);

  const nameCache = new Map<string, string>();
  const resolveCached = async (id: string): Promise<string> => {
    const cached = nameCache.get(id);
    if (cached !== undefined) return cached;
    const name = await resolveName(projectRoot, id);
    nameCache.set(id, name);
    return name;
  };

  const result: string[][] = [];
  for (const offset of offsets) {
    const claimants = otherRecords.filter((record) =>
      record.offsets.includes(offset),
    );
    const names: string[] = [];
    for (const claimant of claimants) {
      names.push(await resolveCached(claimant.entityId));
    }
    result.push(names);
  }
  return result;
}

/**
 * Builds the mentioned-occurrence half of one `EntityMentionedIn` row from a
 * single `MentionRecord`, or `null` when the resource's content can no
 * longer be loaded (e.g. deleted after indexing but before the mention
 * index was rebuilt) — such a record is skipped rather than surfaced with
 * empty snippets.
 */
async function buildMentionedRow(
  projectRoot: string,
  index: MentionIndex,
  record: MentionRecord,
): Promise<EntityMentionedIn | null> {
  let plainText: string | undefined;
  try {
    const loaded = await loadResourceContent(projectRoot, record.resourceId);
    plainText = loaded.plainText;
  } catch {
    return null;
  }
  if (plainText === undefined) return null;

  const name = await resolveName(projectRoot, record.resourceId);
  const snippets = record.offsets.map((offset) =>
    snippetAtOffset(plainText, offset),
  );
  const ambiguousWith = await resolveAmbiguousWith(
    projectRoot,
    index,
    record.resourceId,
    record.entityId,
    record.offsets,
  );

  return {
    resourceId: record.resourceId,
    name,
    snippets,
    isLinked: false,
    isMentioned: true,
    ambiguousWith,
  };
}

/**
 * How often an entity is mentioned, and how widely those mentions are spread.
 *
 * These are two different facts and the roster shows both, because either one
 * alone misleads. `mentions` counts prose occurrences — the sense the
 * glossary gives the term: "a prose occurrence of an entity's name or one of
 * its aliases ... recorded with its character offset". `resources` counts the
 * documents those occurrences are distributed across.
 *
 * A protagonist named 593 times across 32 scenes and a walk-on named twice in
 * those same 32 scenes are indistinguishable on `resources` alone; two
 * entities with equal totals, one concentrated in a single chapter and one
 * threaded through the whole book, are indistinguishable on `mentions` alone.
 */
export type EntityMentionCounts = {
  /** Prose occurrences across the project — the sum of each record's `count`. */
  mentions: number;
  /** Distinct resources containing at least one of those occurrences. */
  resources: number;
};

/**
 * Returns the mention and resource counts for every entity that has at least
 * one mention recorded anywhere in the project's mention index (FR-6 of
 * `specs/features/entity-roster.md`).
 *
 * Loads the mention index once and inverts it via {@link invertMentionIndex}
 * — no per-entity re-read of the index and no `getEntityMentionedIn` call in
 * a loop, which would both re-read the (already-loaded) index and perform
 * unnecessary per-resource content loads for a purely numeric count.
 *
 * `mentions` sums each record's `count`, which `mention-index.ts` guarantees
 * equals `offsets.length`. An earlier version of this function returned
 * `records.length` for a field the roster labelled "mentions", so an entity
 * mentioned 593 times across 32 resources was reported as 32 — the doc
 * comment claimed a total while the code counted documents.
 *
 * An entity with zero mentions is omitted from the returned map entirely —
 * defaulting an absent entity to zero is the roster layer's job, not this
 * function's. Returns `{}` when the project has no mention index yet.
 */
export async function getProjectMentionCounts(
  projectRoot: string,
): Promise<Record<string, EntityMentionCounts>> {
  const index = await loadMentionIndex(projectRoot);
  const byEntity = invertMentionIndex(index);

  const counts: Record<string, EntityMentionCounts> = {};
  for (const [entityId, records] of Object.entries(byEntity)) {
    counts[entityId] = {
      mentions: records.reduce((total, record) => total + record.count, 0),
      // Distinct `resourceId`s, not `records.length`. The index normally holds
      // one record per (resource, entity) pair, which makes the two identical
      // — but nothing in `MentionIndex`'s type enforces that, and counting
      // records would silently report a document twice if it ever held two.
      resources: new Set(records.map((record) => record.resourceId)).size,
    };
  }
  return counts;
}

/**
 * Returns every resource associated with `entityId`, merging two sources
 * (FR-10, FR-12):
 *
 * - Detected prose mentions, one snippet per occurrence, resolved via the
 *   persisted mention index (FR-10).
 * - Explicit links, read from the persisted backlink index — any resource
 *   whose backlinks target `entityId` (the same relationship the
 *   `linkedFrom` query intrinsic exposes for query evaluation).
 *
 * A resource present in both sources is returned once, with both
 * `isLinked` and `isMentioned` set — never as two rows. A resource that is
 * mentioned but whose content can no longer be loaded (e.g. deleted after
 * indexing but before the mention index was rebuilt) is skipped for the
 * mention side; if it is also explicitly linked it still appears as a
 * link-only row (a stale backlink entry with a resolvable sidecar name).
 *
 * Returns an empty array when the entity has neither mentions nor explicit
 * links.
 */
export async function getEntityMentionedIn(
  projectRoot: string,
  entityId: string,
): Promise<EntityMentionedIn[]> {
  const index = await loadMentionIndex(projectRoot);
  const byEntity = invertMentionIndex(index);
  const records = byEntity[entityId] ?? [];

  let backlinks: Record<string, string[]> = {};
  try {
    backlinks = await loadBacklinks(projectRoot);
  } catch {
    backlinks = {};
  }
  const linkedResourceIds = new Set(
    Object.entries(backlinks)
      .filter(([, targets]) => targets.includes(entityId))
      .map(([sourceId]) => sourceId),
  );

  const results = new Map<string, EntityMentionedIn>();

  for (const record of records) {
    const row = await buildMentionedRow(projectRoot, index, record);
    if (row === null) continue;
    row.isLinked = linkedResourceIds.has(row.resourceId);
    results.set(row.resourceId, row);
    linkedResourceIds.delete(row.resourceId);
  }

  // Whatever remains in linkedResourceIds is linked but not (successfully)
  // mentioned above — an explicit-link-only row.
  for (const resourceId of linkedResourceIds) {
    const name = await resolveName(projectRoot, resourceId);
    results.set(resourceId, {
      resourceId,
      name,
      snippets: [],
      isLinked: true,
      isMentioned: false,
      ambiguousWith: [],
    });
  }

  return Array.from(results.values());
}

/**
 * One other entity a given entity co-occurs with (shares at least one
 * resource with, by detected mention), and how much
 * (`specs/features/entity-cooccurrence.md` FR-1).
 */
export type EntityCooccurrenceEntry = {
  entityId: string;
  count: number;
  resourceIds: string[];
};

/**
 * Returns, for every declared entity that shares at least one resource with
 * another declared entity's detected mention, the set of entities it
 * co-occurs with (`specs/features/entity-cooccurrence.md` FR-1).
 *
 * This is a sibling of {@link getProjectMentionCounts}, not an extension of
 * it or of {@link getEntityMentionedIn}: `getProjectMentionCounts` returns
 * per-entity totals, not pairs, and `getEntityMentionedIn` is scoped to one
 * entity and does per-resource content loads, name resolution, and snippet
 * work a bare pairwise count does not need.
 *
 * Loads the mention index once via {@link loadMentionIndex} and groups its
 * `MentionRecord`s by their own `resourceId` key — the index is already
 * keyed by `resourceId` (see `mention-index.ts`), so no second read or
 * inversion is needed. Within each resource, every two distinct entities
 * mentioned there are paired; `count` is the number of resources a pair
 * shares and `resourceIds` lists them. Pairs are unordered and non-reflexive
 * (FR-3): an entity is never paired with itself, and if A co-occurs with B,
 * B's entry array includes A with the identical count and resource set.
 *
 * This function reads only `MentionRecord`s from the mention index. It never
 * loads or merges `backlinks.json` and never calls
 * {@link getEntityMentionedIn} — an explicit link with no corresponding
 * detected mention MUST NOT be counted toward co-occurrence (FR-2).
 * Co-occurrence is same-resource only; `MentionRecord.offsets` is not
 * consulted (OQ-1, resolved).
 *
 * An entity that shares no resource with any other declared entity's mention
 * is omitted from the returned map entirely — no zero-entry key (FR-4).
 * Returns `{}` when the project has no mention index yet.
 */
export async function getEntityCooccurrence(
  projectRoot: string,
): Promise<Record<string, EntityCooccurrenceEntry[]>> {
  const index = await loadMentionIndex(projectRoot);

  // pairs[a][b] -> Set of resourceIds shared by a and b (a < b in insertion
  // order, so each unordered pair is tracked exactly once before being
  // mirrored into the final per-entity result below).
  const pairs = new Map<string, Map<string, Set<string>>>();

  const addPair = (a: string, b: string, resourceId: string): void => {
    let bucket = pairs.get(a);
    if (!bucket) {
      bucket = new Map<string, Set<string>>();
      pairs.set(a, bucket);
    }
    let resourceIds = bucket.get(b);
    if (!resourceIds) {
      resourceIds = new Set<string>();
      bucket.set(b, resourceIds);
    }
    resourceIds.add(resourceId);
  };

  for (const [resourceId, records] of Object.entries(index)) {
    const entityIds = Array.from(
      new Set(records.map((record) => record.entityId)),
    );
    for (let i = 0; i < entityIds.length; i++) {
      for (let j = i + 1; j < entityIds.length; j++) {
        const a = entityIds[i];
        const b = entityIds[j];
        if (a === undefined || b === undefined) continue;
        addPair(a, b, resourceId);
      }
    }
  }

  const result: Record<string, EntityCooccurrenceEntry[]> = {};
  const appendEntry = (
    entityId: string,
    otherId: string,
    resourceIds: string[],
  ): void => {
    const entries = result[entityId] ?? [];
    entries.push({ entityId: otherId, count: resourceIds.length, resourceIds });
    result[entityId] = entries;
  };

  for (const [a, bucket] of pairs) {
    for (const [b, resourceIdSet] of bucket) {
      const resourceIds = Array.from(resourceIdSet);
      appendEntry(a, b, resourceIds);
      appendEntry(b, a, resourceIds);
    }
  }

  return result;
}

const mentionsCore = {
  getResourceMentions,
  getEntityMentionedIn,
  getProjectMentionCounts,
  getEntityCooccurrence,
};
export default mentionsCore;
