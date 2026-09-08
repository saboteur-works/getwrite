/**
 * @module entity-relationships
 *
 * Persistence for authored, typed relationship edges between two declared
 * entities (FR-1). This is a distinct top-level structure — `meta/relationships.json`
 * — separate from `meta/backlinks.json` (an authored, undirected, untyped
 * link between two *resources*) and `meta/index/mentions.json` (a detected,
 * never-authored prose occurrence). An edge here is the third category the
 * codebase's existing vocabulary does not already cover: something the writer
 * explicitly asserted, not something the system observed or derived.
 *
 * Follows `mention-index.ts`'s load/persist-whole-file shape rather than
 * `saved-queries.ts`'s one-file-per-record shape, since the spec calls for a
 * single identifiable structure, not a directory of records.
 *
 * Every mutating function's entire read-modify-write sequence — including the
 * FR-17 idempotency check — runs inside a single `withMetaLock` call, so two
 * concurrently-started creates of the identical (source, target, type) triple
 * cannot both pass the idempotency check before either write lands.
 */
import path from "node:path";
import { z } from "zod";
import { atomicWriteFile, mkdir, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { loadProjectConfig } from "./project-config";
import { generateUUID } from "./uuid";
import { UUID } from "./schemas";

const META_DIR = "meta";
const RELATIONSHIPS_FILE = "relationships.json";

/** A single authored, directed, typed edge between two declared entities. */
export const EntityRelationshipEdgeSchema = z.object({
  id: UUID,
  sourceEntityId: z.string().min(1),
  targetEntityId: z.string().min(1),
  relationshipType: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type EntityRelationshipEdge = z.infer<
  typeof EntityRelationshipEdgeSchema
>;

const EntityRelationshipsFileSchema = z.array(EntityRelationshipEdgeSchema);

/**
 * Typed, identifiable error thrown by {@link createEntityRelationship} when
 * `sourceEntityId === targetEntityId` (FR-4). Callers — notably the HTTP
 * route — distinguish this validation-style throw from an unexpected error
 * via `instanceof`, mirroring the codebase's existing convention for
 * model-layer validation throws (e.g. `MissingProjectFieldsError`,
 * `InvalidProjectIdCoreError`).
 */
export class SameEntityRelationshipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SameEntityRelationshipError";
  }
}

/**
 * Typed, identifiable error thrown by {@link createEntityRelationship} when
 * `relationshipType` is not among the project's current
 * `config.relationshipTypes` (FR-15). See {@link SameEntityRelationshipError}
 * for why this is a distinct class rather than a generic `Error`.
 */
export class InvalidRelationshipTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRelationshipTypeError";
  }
}

function relationshipsFilePath(projectRoot: string): string {
  return path.join(projectRoot, META_DIR, RELATIONSHIPS_FILE);
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
 * Loads every persisted relationship edge for a project.
 *
 * Returns `[]` when `meta/relationships.json` does not exist yet (ENOENT).
 * A file that exists but fails to parse as JSON or fails
 * {@link EntityRelationshipEdgeSchema} validation is a distinct failure — a
 * hand-corrupted file, not an absent one — and this function rethrows rather
 * than silently returning `[]` or an unvalidated shape (boundary-validation
 * floor, `docs/standards/security.md`).
 *
 * @param projectRoot - Absolute path to the project's root directory.
 * @throws {Error} If the file exists but is not valid JSON.
 * @throws {import("zod").ZodError} If the file exists but does not match
 *   `EntityRelationshipEdgeSchema`.
 */
export async function loadEntityRelationships(
  projectRoot: string,
): Promise<EntityRelationshipEdge[]> {
  const p = relationshipsFilePath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(p, "utf8");
  } catch (err) {
    if (isEnoent(err)) return [];
    throw err;
  }
  const parsed = JSON.parse(raw) as unknown;
  return EntityRelationshipsFileSchema.parse(parsed);
}

async function persistEntityRelationships(
  projectRoot: string,
  edges: EntityRelationshipEdge[],
): Promise<void> {
  // Validate at write time too (boundary-validation floor) — a caller bug
  // must fail loudly here rather than persist a malformed record.
  const validated = EntityRelationshipsFileSchema.parse(edges);
  await mkdir(path.join(projectRoot, META_DIR), { recursive: true });
  const p = relationshipsFilePath(projectRoot);
  await atomicWriteFile(p, JSON.stringify(validated, null, 2), {
    writeOptions: "utf8",
    durable: process.env.GETWRITE_DURABLE_META === "1",
  });
}

/**
 * Creates a directed, typed edge from `sourceEntityId` to `targetEntityId`.
 *
 * Idempotent on the `(sourceEntityId, targetEntityId, relationshipType)`
 * triple (FR-17): calling this twice with the identical triple is a no-op
 * that returns the existing edge rather than appending a duplicate, mirroring
 * `assignTagToResource`'s `includes`-before-push pattern (`tags.ts:182-196`).
 *
 * The entire read-modify-write sequence — including the idempotency check —
 * runs inside a single `withMetaLock` call, so two concurrently-started
 * creates of the identical triple cannot both pass the check before either
 * write lands.
 *
 * @throws {Error} If `sourceEntityId === targetEntityId` (FR-4).
 * @throws {Error} If `relationshipType` is not among the project's current
 *   `config.relationshipTypes` (FR-15).
 */
export async function createEntityRelationship(
  projectRoot: string,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
): Promise<EntityRelationshipEdge> {
  if (sourceEntityId === targetEntityId) {
    throw new SameEntityRelationshipError(
      "createEntityRelationship: sourceEntityId and targetEntityId must be distinct",
    );
  }

  const config = await loadProjectConfig(projectRoot);
  const allowedTypes = config.relationshipTypes ?? [];
  if (!allowedTypes.includes(relationshipType)) {
    throw new InvalidRelationshipTypeError(
      `createEntityRelationship: relationshipType "${relationshipType}" is not in the project's relationshipTypes list`,
    );
  }

  return withMetaLock(projectRoot, async () => {
    const edges = await loadEntityRelationships(projectRoot);

    const existing = edges.find(
      (edge) =>
        edge.sourceEntityId === sourceEntityId &&
        edge.targetEntityId === targetEntityId &&
        edge.relationshipType === relationshipType,
    );
    if (existing) {
      return existing;
    }

    const edge: EntityRelationshipEdge = {
      id: generateUUID(),
      sourceEntityId,
      targetEntityId,
      relationshipType,
      createdAt: new Date().toISOString(),
    };
    await persistEntityRelationships(projectRoot, [...edges, edge]);
    return edge;
  });
}

/**
 * Removes exactly the edge with the given `edgeId` (FR-12).
 *
 * @returns `true` if an edge was removed, `false` if no edge with that id
 *   existed (no-op — nothing is written in that case).
 */
export async function removeEntityRelationship(
  projectRoot: string,
  edgeId: string,
): Promise<boolean> {
  return withMetaLock(projectRoot, async () => {
    const edges = await loadEntityRelationships(projectRoot);
    const next = edges.filter((edge) => edge.id !== edgeId);
    if (next.length === edges.length) {
      return false;
    }
    await persistEntityRelationships(projectRoot, next);
    return true;
  });
}

const entityRelationships = {
  loadEntityRelationships,
  createEntityRelationship,
  removeEntityRelationship,
};
export default entityRelationships;
