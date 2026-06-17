import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { QueryASTSchema } from "./query-ast";
import { withMetaLock } from "./meta-locks";

// ─── View schema (minimal — extended as query views gain shape) ───────────────

export const SavedQueryViewSchema = z.looseObject({
  kind: z.string().optional(),
});

export type SavedQueryView = z.infer<typeof SavedQueryViewSchema>;

// ─── Saved-query schema ───────────────────────────────────────────────────────

export const SavedQuerySchema = z.object({
  id: z.string().uuid(),
  name: z.string().nonempty(),
  definition: QueryASTSchema,
  view: SavedQueryViewSchema.optional(),
});

export type SavedQuery = z.infer<typeof SavedQuerySchema>;

// ─── Path helpers ─────────────────────────────────────────────────────────────

const QUERY_FILE_EXT = ".query.json";

function queriesDir(projectRoot: string): string {
  return path.join(projectRoot, "meta", "queries");
}

function queryFilePath(projectRoot: string, id: string): string {
  return path.join(queriesDir(projectRoot), `${id}${QUERY_FILE_EXT}`);
}

async function ensureQueriesDir(projectRoot: string): Promise<void> {
  await fs.mkdir(queriesDir(projectRoot), { recursive: true });
}

function isEnoent(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

// ─── CRUD operations ──────────────────────────────────────────────────────────

/**
 * List all saved queries in `<projectRoot>/meta/queries/`.
 * Returns an empty array if the directory does not exist.
 * Throws on filesystem or parse errors for individual files.
 */
export async function listQueries(projectRoot: string): Promise<SavedQuery[]> {
  const dir = queriesDir(projectRoot);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err: unknown) {
    if (isEnoent(err)) return [];
    throw err;
  }

  const queries: SavedQuery[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(QUERY_FILE_EXT)) continue;
    const id = entry.slice(0, -QUERY_FILE_EXT.length);
    const q = await readQuery(projectRoot, id);
    if (q !== null) queries.push(q);
  }
  return queries;
}

/**
 * Read a single saved query by id. Returns `null` if the file does not exist.
 * Throws on malformed JSON or schema validation failures.
 */
export async function readQuery(
  projectRoot: string,
  id: string,
): Promise<SavedQuery | null> {
  const filePath = queryFilePath(projectRoot, id);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return SavedQuerySchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

/**
 * Write (create or overwrite) a saved query. The operation is atomic under
 * `withMetaLock` so concurrent writes for the same project are serialized.
 * Validates the query against `SavedQuerySchema` before acquiring the lock.
 */
export async function writeQuery(
  projectRoot: string,
  query: SavedQuery,
): Promise<void> {
  SavedQuerySchema.parse(query);
  await withMetaLock(projectRoot, async () => {
    await ensureQueriesDir(projectRoot);
    await fs.writeFile(
      queryFilePath(projectRoot, query.id),
      JSON.stringify(query, null, 2),
      "utf8",
    );
  });
}

/**
 * Delete a saved query by id. Returns `true` if the file was removed,
 * `false` if it did not exist. Deletion is serialized under `withMetaLock`.
 */
export async function deleteQuery(
  projectRoot: string,
  id: string,
): Promise<boolean> {
  return withMetaLock(projectRoot, async () => {
    try {
      await fs.unlink(queryFilePath(projectRoot, id));
      return true;
    } catch (err: unknown) {
      if (isEnoent(err)) return false;
      throw err;
    }
  });
}

const savedQueries = { listQueries, readQuery, writeQuery, deleteQuery };
export default savedQueries;
