/**
 * @module query-cache
 *
 * In-memory query result cache keyed by project root, saved-query id, and
 * `metadataRevision`. A cache entry is valid only when the stored revision
 * matches the current revision in `project.json`; any sidecar write that
 * bumps the revision makes all entries for that project stale.
 *
 * Public surface:
 *   getCached   — synchronous point-lookup (null on miss or stale)
 *   setCached   — synchronous store
 *   invalidate  — evict one query or all queries for a project
 *   readRevision — read metadataRevision from project.json (0 on missing)
 *   evaluateCached — cache-aware async wrapper around an evaluator fn
 *   clearAllCaches — wipe the entire store (for test isolation)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_FILENAME } from "./project-config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CacheEntry {
    lastRevision: number;
    resultIds: string[];
}

// projectRoot → queryId → entry
const store = new Map<string, Map<string, CacheEntry>>();

// ─── Low-level helpers ────────────────────────────────────────────────────────

/**
 * Return cached result ids when the stored revision matches `revision`.
 * Returns `null` on a cache miss or when the entry is stale.
 */
export function getCached(
    projectRoot: string,
    queryId: string,
    revision: number,
): string[] | null {
    const entry = store.get(projectRoot)?.get(queryId);
    if (!entry || entry.lastRevision !== revision) return null;
    return entry.resultIds;
}

/** Store a result against the given project root, query id, and revision. */
export function setCached(
    projectRoot: string,
    queryId: string,
    revision: number,
    resultIds: string[],
): void {
    let projectMap = store.get(projectRoot);
    if (!projectMap) {
        projectMap = new Map();
        store.set(projectRoot, projectMap);
    }
    projectMap.set(queryId, { lastRevision: revision, resultIds });
}

/**
 * Evict cache entries.
 * - When `queryId` is provided: remove that specific query only.
 * - When `queryId` is omitted: remove all queries for the project.
 */
export function invalidate(projectRoot: string, queryId?: string): void {
    if (queryId !== undefined) {
        store.get(projectRoot)?.delete(queryId);
    } else {
        store.delete(projectRoot);
    }
}

/** Reset the entire cache. Intended for test isolation only. */
export function clearAllCaches(): void {
    store.clear();
}

// ─── Filesystem helpers ───────────────────────────────────────────────────────

/**
 * Read `metadataRevision` from `project.json`. Returns 0 when the file is
 * absent, the field is missing, or the file cannot be parsed.
 */
export async function readRevision(projectRoot: string): Promise<number> {
    try {
        const raw = await fs.readFile(
            path.join(projectRoot, PROJECT_FILENAME),
            "utf8",
        );
        const parsed = JSON.parse(raw) as {
            config?: { metadataRevision?: number };
        };
        return parsed?.config?.metadataRevision ?? 0;
    } catch {
        return 0;
    }
}

// ─── Public cache-aware evaluator ────────────────────────────────────────────

/**
 * Cache-aware wrapper around an arbitrary async evaluator function.
 *
 * Flow:
 *  1. Read current `metadataRevision` from `project.json`.
 *  2. Return the cached result if the revision matches.
 *  3. Otherwise call `evaluator()`, cache the result, and return it.
 *
 * If `evaluator()` throws, the result is NOT cached so the next call
 * retries.
 */
export async function evaluateCached(
    projectRoot: string,
    queryId: string,
    evaluator: () => Promise<string[]>,
): Promise<string[]> {
    const revision = await readRevision(projectRoot);
    const cached = getCached(projectRoot, queryId, revision);
    if (cached !== null) return cached;

    const resultIds = await evaluator();
    setCached(projectRoot, queryId, revision, resultIds);
    return resultIds;
}

const queryCache = {
    getCached,
    setCached,
    invalidate,
    readRevision,
    evaluateCached,
    clearAllCaches,
};
export default queryCache;
