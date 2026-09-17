import path from "node:path";
import { atomicWriteFile, mkdir, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { isLockedAccessError } from "./locked-access";

const INDEX_DIR = "meta/index";
const INDEX_FILE = "mentions.json";

/**
 * A single entity's detected mentions within one resource.
 *
 * `offsets` carries the verbatim character offset of each occurrence in the
 * resource's persisted plain text, so a caller can render a snippet by
 * slicing text directly rather than re-tokenizing (FR-6). `count` MUST equal
 * `offsets.length`.
 */
export type MentionRecord = {
  entityId: string;
  resourceId: string;
  count: number;
  offsets: number[];
};

/**
 * The mention index, keyed by `resourceId` so a resource's own mentions are
 * a direct lookup (FR-9). One resource can mention multiple entities, so
 * each value is an array of records.
 */
export type MentionIndex = Record<string, MentionRecord[]>;

async function ensureIndexDir(projectRoot: string): Promise<void> {
  await mkdir(path.join(projectRoot, INDEX_DIR), { recursive: true });
}

/**
 * Load persisted mention index if present; returns an empty index if missing
 * or unreadable. A locked-access failure (the project is encrypted and either
 * the workspace is locked or the keyring holds no key for it) is rethrown
 * rather than degraded to the empty-index fallback — silently returning "no
 * mentions" for a project that is actually inaccessible would misreport a
 * locked project as one with none.
 */
export async function loadMentionIndex(
  projectRoot: string,
): Promise<MentionIndex> {
  const p = path.join(projectRoot, INDEX_DIR, INDEX_FILE);
  try {
    const raw = await readFile(p, "utf8");
    return JSON.parse(raw) as MentionIndex;
  } catch (err) {
    if (isLockedAccessError(err)) {
      throw err;
    }
    return {};
  }
}

/** Persist the mention index under `meta/index/mentions.json`. */
export async function persistMentionIndex(
  projectRoot: string,
  index: MentionIndex,
): Promise<void> {
  await ensureIndexDir(projectRoot);
  const p = path.join(projectRoot, INDEX_DIR, INDEX_FILE);
  await withMetaLock(projectRoot, async () => {
    await atomicWriteFile(p, JSON.stringify(index, null, 2), {
      writeOptions: "utf8",
      durable: process.env.GETWRITE_DURABLE_META === "1",
    });
  });
}

/**
 * Invert a resource-keyed `MentionIndex` into an entity-keyed map, so all
 * mentions of a given entity across every resource can be looked up directly
 * (supports FR-10/FR-11).
 */
export function invertMentionIndex(
  index: MentionIndex,
): Record<string, MentionRecord[]> {
  const byEntity: Record<string, MentionRecord[]> = {};
  for (const records of Object.values(index)) {
    for (const record of records) {
      const bucket = byEntity[record.entityId] ?? [];
      bucket.push(record);
      byEntity[record.entityId] = bucket;
    }
  }
  return byEntity;
}

/**
 * Remove a resource from the persisted mention index: deletes its own key
 * only. Under this index's shape (`Record<resourceId, MentionRecord[]>`), a
 * resource can only be the mentioning side, never the mentioned side, so no
 * cross-entry scan is needed — mirrors `inverted-index.ts`'s
 * `removeResourceFromIndex` (load, modify, persist, inside one
 * `withMetaLock` call via `persistMentionIndex`'s own lock).
 */
export async function removeResourceFromMentionIndex(
  projectRoot: string,
  resourceId: string,
): Promise<void> {
  const index = await loadMentionIndex(projectRoot);
  if (!(resourceId in index)) return;
  delete index[resourceId];
  await persistMentionIndex(projectRoot, index);
}

const mentionIndex = {
  loadMentionIndex,
  persistMentionIndex,
  invertMentionIndex,
  removeResourceFromMentionIndex,
};
export default mentionIndex;
