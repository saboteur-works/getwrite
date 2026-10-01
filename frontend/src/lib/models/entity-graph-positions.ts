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
import { isPositionInvalidated } from "./entity-graph-position-invalidation";

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
 * Re-exported unchanged from `entity-graph-position-invalidation.ts` (Task
 * 13), which holds the actual (pure, dependency-free) implementation so a
 * client component can import it without pulling in this module's own
 * `node:path`/`io.ts`/`meta-locks.ts` imports. See that module's doc comment
 * for the full rationale.
 */
export { isPositionInvalidated };

/**
 * Removes any persisted position record naming `entityId`, as a no-op when
 * none exists (Task 14, FR-12). Called unconditionally whenever an entity is
 * removed/un-declared — unlike `removeEntityRelationshipsForEntity`, which
 * is an opt-in checkbox on that same flow, dropping a now-meaningless graph
 * position carries no data-loss risk worth confirming, so no dialog step or
 * checkbox gates this call.
 *
 * The entire read-modify-write sequence runs inside a single `withMetaLock`
 * call, mirroring {@link saveEntityGraphPosition}'s own pattern, so a
 * concurrent save/removal for the same entity cannot interleave.
 */
export async function removeEntityGraphPositionForEntity(
  projectRoot: string,
  entityId: string,
): Promise<void> {
  return withMetaLock(projectRoot, async () => {
    const records = await loadEntityGraphPositions(projectRoot);
    const next = records.filter((existing) => existing.entityId !== entityId);
    if (next.length === records.length) return;
    await persistEntityGraphPositions(projectRoot, next);
  });
}

const entityGraphPositions = {
  loadEntityGraphPositions,
  saveEntityGraphPosition,
  isPositionInvalidated,
  removeEntityGraphPositionForEntity,
};
export default entityGraphPositions;
