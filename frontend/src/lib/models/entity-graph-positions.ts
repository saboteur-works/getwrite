/**
 * @module entity-graph-positions
 *
 * Persistence for drag-authored entity graph node positions (FR-9, FR-10,
 * OQ-7/OQ-8), stored at `meta/entity-graph-positions.json` — a new sibling to
 * `meta/relationships.json`. Mirrors `entity-relationships.ts`'s
 * whole-file-load/persist shape: a single JSON array, loaded and rewritten in
 * full on every mutation, guarded end-to-end by `withMetaLock` so a
 * read-modify-write sequence (including the upsert check) cannot interleave
 * with a concurrent one.
 *
 * A position record is keyed by `entityId` and independently persists the
 * project's active connection-type list at the moment it was saved
 * (`connectionTypesSnapshot`), so a later load can tell whether the graph
 * shape the position was authored against has since changed (FR-11) — see
 * {@link isPositionInvalidated}. This module only persists that data and
 * exposes the invalidation check as a pure function; actually exempting a
 * valid record from `computeGraphLayout`'s recompute, and discarding an
 * invalidated one, is wired into the canvas elsewhere, not here.
 */
import path from "node:path";
import { z } from "zod";
import { atomicWriteFile, mkdir, readFile } from "./io";
import { withMetaLock } from "./meta-locks";

const META_DIR = "meta";
const POSITIONS_FILE = "entity-graph-positions.json";

/**
 * A single drag-authored node position for one declared entity (FR-9).
 * `connectionTypesSnapshot` is the project's active connection-type list at
 * the moment this position was saved, used only for the FR-11 invalidation
 * comparison — it is not itself re-validated against the current known
 * connection-type vocabulary.
 */
export const EntityGraphPositionRecordSchema = z.object({
  entityId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  connectionTypesSnapshot: z.array(z.string()),
  savedAt: z.string().datetime(),
});

export type EntityGraphPositionRecord = z.infer<
  typeof EntityGraphPositionRecordSchema
>;

const EntityGraphPositionsFileSchema = z.array(EntityGraphPositionRecordSchema);

function positionsFilePath(projectRoot: string): string {
  return path.join(projectRoot, META_DIR, POSITIONS_FILE);
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}

/**
 * Loads every persisted entity graph node position for a project.
 *
 * Returns `[]` when `meta/entity-graph-positions.json` does not exist yet
 * (ENOENT) — mirrors `loadEntityRelationships`'s ENOENT tolerance. A file
 * that exists but fails to parse as JSON or fails
 * {@link EntityGraphPositionRecordSchema} validation is a distinct failure —
 * a hand-corrupted file, not an absent one — and this function rethrows
 * rather than silently returning `[]` or an unvalidated shape
 * (boundary-validation floor, `docs/standards/security.md`).
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @throws {Error} If the file exists but is not valid JSON.
 * @throws {import("zod").ZodError} If the file exists but does not match
 *   `EntityGraphPositionRecordSchema`.
 */
export async function loadEntityGraphPositions(
  projectRoot: string,
): Promise<EntityGraphPositionRecord[]> {
  const p = positionsFilePath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(p, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
  const parsed = JSON.parse(raw) as unknown;
  return EntityGraphPositionsFileSchema.parse(parsed);
}

async function persistEntityGraphPositions(
  projectRoot: string,
  records: EntityGraphPositionRecord[],
): Promise<void> {
  // Validate at write time too (boundary-validation floor) — a caller bug
  // must fail loudly here rather than persist a malformed record.
  const validated = EntityGraphPositionsFileSchema.parse(records);
  await mkdir(path.join(projectRoot, META_DIR), { recursive: true });
  const p = positionsFilePath(projectRoot);
  await atomicWriteFile(p, JSON.stringify(validated, null, 2), {
    writeOptions: "utf8",
    durable: process.env.GETWRITE_DURABLE_META === "1",
  });
}

/**
 * Upserts a single entity's drag-authored position (FR-9): replaces any
 * existing record for `entityId`, or appends a new one if none exists yet.
 *
 * The entire read-modify-write sequence runs inside a single `withMetaLock`
 * call, mirroring `createEntityRelationship`'s upsert-like pattern, so two
 * concurrently-started saves for the same entity cannot interleave.
 */
export async function saveEntityGraphPosition(
  projectRoot: string,
  entityId: string,
  x: number,
  y: number,
  connectionTypesSnapshot: string[],
): Promise<EntityGraphPositionRecord> {
  return withMetaLock(projectRoot, async () => {
    const records = await loadEntityGraphPositions(projectRoot);
    const record: EntityGraphPositionRecord = {
      entityId,
      x,
      y,
      connectionTypesSnapshot,
      savedAt: new Date().toISOString(),
    };
    const next = [
      ...records.filter((existing) => existing.entityId !== entityId),
      record,
    ];
    await persistEntityGraphPositions(projectRoot, next);
    return record;
  });
}

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

const entityGraphPositions = {
  loadEntityGraphPositions,
  saveEntityGraphPosition,
  isPositionInvalidated,
};
export default entityGraphPositions;
