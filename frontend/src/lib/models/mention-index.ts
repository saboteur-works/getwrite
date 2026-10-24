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

/** Writes `meta/index/mentions.json`. Callers hold `withMetaLock`. */
async function saveMentionIndex(
  projectRoot: string,
  index: MentionIndex,
): Promise<void> {
  await ensureIndexDir(projectRoot);
  const p = path.join(projectRoot, INDEX_DIR, INDEX_FILE);
  await atomicWriteFile(p, JSON.stringify(index, null, 2), {
    writeOptions: "utf8",
    durable: process.env.GETWRITE_DURABLE_META === "1",
  });
}

/**
 * Persist the mention index under `meta/index/mentions.json`. Locks the write
 * only: a caller that loaded the index earlier can still overwrite a change
 * saved since. Use {@link updateMentionIndex} to load, change and save as one
 * step.
 */
export async function persistMentionIndex(
  projectRoot: string,
  index: MentionIndex,
): Promise<void> {
  await ensureIndexDir(projectRoot);
  await withMetaLock(projectRoot, () => saveMentionIndex(projectRoot, index));
}

/**
 * Loads, changes and saves the mention index inside one `withMetaLock` call,
 * so two writers on one project cannot each load the old index and have the
 * later save drop the other's change (the shape of `inverted-index.ts`
 * `updateIndex`). `change` mutates the freshly loaded index in place and must
 * not take `withMetaLock` itself. If `change` or the load throws, nothing is
 * written, the lock is released and the error reaches the caller unchanged.
 */
export async function updateMentionIndex(
  projectRoot: string,
  change: (index: MentionIndex) => void,
): Promise<void> {
  await withMetaLock(projectRoot, async () => {
    const index = await loadMentionIndex(projectRoot);
    change(index);
    await saveMentionIndex(projectRoot, index);
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
 * cross-entry scan is needed. Loads, changes and saves inside one
 * `withMetaLock` call (the `updateMentionIndex` shape); a resource with no entry writes
 * nothing.
 */
export async function removeResourceFromMentionIndex(
  projectRoot: string,
  resourceId: string,
): Promise<void> {
  await withMetaLock(projectRoot, async () => {
    const index = await loadMentionIndex(projectRoot);
    if (!(resourceId in index)) return;
    delete index[resourceId];
    await saveMentionIndex(projectRoot, index);
  });
}

const mentionIndex = {
  loadMentionIndex,
  persistMentionIndex,
  updateMentionIndex,
  invertMentionIndex,
  removeResourceFromMentionIndex,
};
export default mentionIndex;
