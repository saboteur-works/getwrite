/**
 * @module revision
 *
 * Filesystem-backed revision lifecycle utilities.
 *
 * Revision data is stored at:
 * - `revisions/<resourceId>/v-<version>/content.bin`
 * - `revisions/<resourceId>/v-<version>/metadata.json`
 *
 * This module provides deterministic listing, candidate selection for pruning,
 * atomic revision writes, and canonical revision management.
 */
import path from "node:path";
import type { Dirent } from "node:fs";
import { generateUUID } from "./uuid";
import type { UUID, Revision } from "./types";
import { mkdir, writeFile, readFile, readdir, stat, rm, rename } from "./io";

/** Optional attributes for revision creation. */
export interface WriteRevisionOptions {
    /** Optional actor identifier recorded in the revision metadata. */
    author?: string;
    /** When true, marks the written revision as canonical. */
    isCanonical?: boolean;
    /** Optional arbitrary metadata to persist alongside the revision (e.g. user-provided name). */
    metadata?: Record<string, unknown>;
}

/** Optional behavior controls for prune operations. */
export interface PruneRevisionsOptions {
    /**
     * When false, aborts pruning if the deletion target cannot be met due to
     * canonical or preserved revisions.
     */
    autoPrune?: boolean;
}

/**
 * Determine which revisions should be pruned when enforcing a maximum retained
 * revisions count for a resource.
 *
 * Selection rules:
 * - Excludes canonical revisions.
 * - Excludes revisions where `metadata.preserve` is truthy.
 * - Sorts remaining candidates by ascending `versionNumber`.
 * - Returns the oldest `total - maxRevisions` entries.
 *
 * @param revisions - All known revisions for a single resource.
 * @param maxRevisions - Maximum revisions to retain.
 * @returns Revisions that should be deleted, ordered oldest first.
 * @throws {RangeError} If `maxRevisions` is negative.
 *
 * @example
 * const candidates = selectPruneCandidates(revisions, 25);
 */
export function selectPruneCandidates(
    revisions: Revision[],
    maxRevisions: number,
): Revision[] {
    if (maxRevisions < 0)
        throw new RangeError("maxRevisions must be non-negative");

    const total = revisions.length;
    if (total <= maxRevisions) return [];

    // Exclude canonical and preserved revisions from pruning candidates.
    const nonCanonical = revisions.filter(
        (r) => !r.isCanonical && !(r as any).metadata?.preserve,
    );
    if (nonCanonical.length === 0) return [];

    const sorted = [...nonCanonical].sort(
        (a, b) => a.versionNumber - b.versionNumber,
    );

    const toRemoveCount = Math.max(0, total - maxRevisions);
    return sorted.slice(0, toRemoveCount);
}

/**
 * Returns the base directory containing all revisions for a resource.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @returns Absolute path to `revisions/<resourceId>`.
 *
 * @example
 * const base = revisionsBaseDir("/projects/demo", "resource-uuid");
 */
export function revisionsBaseDir(
    projectRoot: string,
    resourceId: UUID,
): string {
    return path.join(projectRoot, "revisions", resourceId);
}

/**
 * Returns the directory for a specific revision version.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @param versionNumber - Revision version number.
 * @returns Absolute path to `revisions/<resourceId>/v-<versionNumber>`.
 *
 * @example
 * const dir = revisionDir("/projects/demo", "resource-uuid", 3);
 */
export function revisionDir(
    projectRoot: string,
    resourceId: UUID,
    versionNumber: number,
): string {
    return path.join(
        revisionsBaseDir(projectRoot, resourceId),
        `v-${versionNumber}`,
    );
}

/**
 * Writes revision content and metadata for a given resource/version.
 *
 * The write uses a temporary directory and atomic rename to avoid exposing
 * partially written revision data.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @param versionNumber - Revision version to write.
 * @param content - Content payload stored in `content.bin`.
 * @param options - Optional author and canonical flags.
 * @returns Created revision metadata.
 * @throws {Error} If a revision directory for this version already exists.
 * @throws {Error} If any filesystem operation fails.
 *
 * @example
 * const revision = await writeRevision(
 *   "/projects/demo",
 *   "resource-uuid",
 *   4,
 *   "Hello",
 *   { author: "alice" },
 * );
 */
export async function writeRevision(
    projectRoot: string,
    resourceId: UUID,
    versionNumber: number,
    content: string | Buffer,
    options?: WriteRevisionOptions,
): Promise<Revision> {
    const finalDir = revisionDir(projectRoot, resourceId, versionNumber);
    const base = revisionsBaseDir(projectRoot, resourceId);

    // Ensure final dir does not already exist to avoid clobbering.
    try {
        const st = await stat(finalDir).catch(() => null);
        if (st)
            throw new Error(`revision directory already exists: ${finalDir}`);
    } catch (err) {
        throw err;
    }

    // Create a temp directory next to the revisions base and write files there,
    // then atomically rename the temp dir to the final v-<version> directory.
    const tmpDir = path.join(base, `.tmp-${generateUUID()}`);
    try {
        await mkdir(tmpDir, { recursive: true });

        const filename = "content.bin";
        const finalFilePath = path.join(finalDir, filename);
        const tmpFilePath = path.join(tmpDir, filename);
        await writeFile(tmpFilePath, content);

        const now = new Date().toISOString();
        const rev: Revision = {
            id: generateUUID(),
            resourceId,
            versionNumber,
            createdAt: now,
            savedAt: now,
            author: options?.author,
            filePath: finalFilePath,
            isCanonical: !!options?.isCanonical,
            metadata: options?.metadata,
        };

        const metaPath = path.join(tmpDir, "metadata.json");
        await writeFile(metaPath, JSON.stringify(rev, null, 2), "utf8");

        // Atomic move into place. If finalDir exists, this will throw.
        await rename(tmpDir, finalDir);

        return rev;
    } catch (err) {
        // Best-effort cleanup of tmpDir on error.
        try {
            await rm(tmpDir, { recursive: true, force: true });
        } catch (_) {
            // ignore cleanup errors
        }
        throw err;
    }
}

/**
 * Lists all revisions for a resource by scanning `v-*` revision folders and
 * reading each `metadata.json` file.
 *
 * Behavior:
 * - Returns revisions sorted by ascending `versionNumber`.
 * - Skips malformed/unreadable metadata files.
 * - Returns `[]` when the revisions directory does not exist.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @returns Sorted revision metadata entries.
 * @throws {Error} If the revisions directory cannot be listed for reasons
 *   other than non-existence.
 *
 * @example
 * const revisions = await listRevisions("/projects/demo", "resource-uuid");
 */
export async function listRevisions(
    projectRoot: string,
    resourceId: UUID,
): Promise<Revision[]> {
    const base = revisionsBaseDir(projectRoot, resourceId);
    try {
        const entries = await readdir(base, { withFileTypes: true });
        const revDirs = entries
            .filter(
                (entry): entry is Dirent =>
                    typeof entry !== "string" && entry.isDirectory(),
            )
            .filter((entry) => entry.name.startsWith("v-"))
            .map((dirEntry) => dirEntry.name);
        const results: Revision[] = [];
        for (const d of revDirs) {
            const metaPath = path.join(base, d, "metadata.json");
            try {
                const raw = await readFile(metaPath, "utf8");
                const parsed = JSON.parse(raw) as Revision;
                results.push(parsed);
            } catch (err: unknown) {
                continue;
            }
        }
        return results.sort((a, b) => a.versionNumber - b.versionNumber);
    } catch (err: unknown) {
        if (
            err &&
            typeof err === "object" &&
            "code" in err &&
            (err as unknown as { code?: string }).code === "ENOENT"
        )
            return [];
        throw err;
    }
}

/**
 * Prune revisions to enforce maxRevisions retained revisions. Deletes
 * filesystem directories for selected candidates and returns deleted metadata.
 *
 * If `options.autoPrune` is explicitly `false` and the required number of
 * revisions cannot be removed (because protected revisions consume capacity),
 * this function aborts and returns `[]` without deleting anything.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @param maxRevisions - Maximum revisions to retain.
 * @param options - Optional prune behavior flags.
 * @returns Metadata for deleted revisions.
 * @throws {RangeError} If `maxRevisions` is negative.
 * @throws {Error} If listing revisions or deleting directories fails.
 *
 * @example
 * const deleted = await pruneRevisions("/projects/demo", "resource-uuid", 50, {
 *   autoPrune: true,
 * });
 */
export async function pruneRevisions(
    projectRoot: string,
    resourceId: UUID,
    maxRevisions: number,
    options?: PruneRevisionsOptions,
): Promise<Revision[]> {
    const revisions = await listRevisions(projectRoot, resourceId);
    const candidates = selectPruneCandidates(revisions, maxRevisions);
    const deleted: Revision[] = [];

    const requiredToRemove = Math.max(0, revisions.length - maxRevisions);
    if (candidates.length < requiredToRemove && options?.autoPrune === false) {
        // In headless/non-autoPrune mode, abort and perform no deletions.
        return [];
    }

    for (const c of candidates) {
        const dir = revisionDir(projectRoot, resourceId, c.versionNumber);
        await rm(dir, { recursive: true, force: true });
        deleted.push(c);
    }
    return deleted;
}

/**
 * Marks one revision as canonical and unmarks every other revision for the
 * same resource.
 *
 * All revision metadata files are rewritten to guarantee a single canonical
 * source of truth.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @param versionNumber - Revision version to mark canonical.
 * @returns Updated target revision if found; otherwise `null`.
 * @throws {Error} If revision metadata cannot be read or written.
 *
 * @example
 * const canonical = await setCanonicalRevision("/projects/demo", "resource-uuid", 8);
 */
export async function setCanonicalRevision(
    projectRoot: string,
    resourceId: UUID,
    versionNumber: number,
): Promise<Revision | null> {
    const revs = await listRevisions(projectRoot, resourceId);
    const target = revs.find((r) => r.versionNumber === versionNumber);
    if (!target) return null;

    const base = revisionsBaseDir(projectRoot, resourceId);

    // Update every metadata.json to reflect canonical flag (set true for target, false otherwise)
    for (const r of revs) {
        const dir = path.join(base, `v-${r.versionNumber}`);
        const metaPath = path.join(dir, "metadata.json");
        const updated: Revision = {
            ...r,
            isCanonical: r.versionNumber === versionNumber,
            savedAt: new Date().toISOString(),
        };
        await writeFile(metaPath, JSON.stringify(updated, null, 2), "utf8");
    }

    return { ...target, isCanonical: true };
}

/**
 * Returns the current canonical revision for a resource, if one exists.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param resourceId - Resource UUID.
 * @returns Canonical revision metadata, or `null` when none is marked.
 * @throws {Error} If revision metadata cannot be listed.
 *
 * @example
 * const canonical = await getCanonicalRevision("/projects/demo", "resource-uuid");
 */
export async function getCanonicalRevision(
    projectRoot: string,
    resourceId: UUID,
): Promise<Revision | null> {
    const revs = await listRevisions(projectRoot, resourceId);
    return revs.find((r) => r.isCanonical) ?? null;
}

/**
 * Bundled revision API surface for consumers that prefer object-style imports.
 */
export default {
    selectPruneCandidates,
    revisionsBaseDir,
    revisionDir,
    writeRevision,
    listRevisions,
    pruneRevisions,
    setCanonicalRevision,
    getCanonicalRevision,
};
