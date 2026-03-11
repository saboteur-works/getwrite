/**
 * @module projectTypes
 *
 * Loads, validates, caches, and queries project-type template specifications.
 *
 * Project-type templates are JSON files stored under
 * `getwrite-config/templates/project-types` (with a fallback path for runtime
 * contexts where the workspace root is offset).
 */
import path from "node:path";
import { readdir, readFile } from "./models/io";
import {
    validateProjectType,
    validateProjectTypeFile,
    ProjectTypeSpec,
} from "./models/schemas";

/**
 * Metadata plus parsed content for one project-type template file.
 */
export type ProjectTypeEntry = {
    /** Validated project-type specification from template JSON. */
    spec: ProjectTypeSpec;
    /** Path to the source template JSON file. */
    filePath: string;
    /** File name (basename) of the template JSON file. */
    fileName: string;
};

/**
 * Primary template directory location for app/runtime contexts where the
 * current working directory is the workspace root.
 */
const DEFAULT_TEMPLATES_DIR = path.join(
    "getwrite-config",
    "templates",
    "project-types",
);

/**
 * Fallback template directory location for contexts (for example tests) where
 * relative path resolution is offset by one directory.
 */
const ALT_TEMPLATES_DIR = path.join(
    "..",
    "getwrite-config",
    "templates",
    "project-types",
);

/**
 * Resolves the first accessible project-type templates directory.
 *
 * Resolution order:
 * 1. `DEFAULT_TEMPLATES_DIR`
 * 2. `ALT_TEMPLATES_DIR`
 *
 * If neither directory is readable, returns `DEFAULT_TEMPLATES_DIR` so callers
 * can handle missing-directory behavior in one place.
 *
 * @returns Relative path to the selected templates directory.
 */
async function resolveTemplatesDir(): Promise<string> {
    // Try the default first, then the alt. Use the same `readdir` helper
    // to preserve any virtual/fs semantics used in tests.
    try {
        await readdir(DEFAULT_TEMPLATES_DIR, { withFileTypes: true });
        return DEFAULT_TEMPLATES_DIR;
    } catch (_) {
        try {
            await readdir(ALT_TEMPLATES_DIR, { withFileTypes: true });
            return ALT_TEMPLATES_DIR;
        } catch (_) {
            // neither exists — return default so caller will get empty list
            return DEFAULT_TEMPLATES_DIR;
        }
    }
}

let _cache: ProjectTypeEntry[] | null = null;

/**
 * Lists available project-type templates from disk.
 *
 * Behavior:
 * - Uses an in-memory cache unless `forceRefresh` is true.
 * - Reads template directory entries and keeps only `.json` files.
 * - Parses each file and validates content with `validateProjectType`.
 * - Skips invalid/unreadable JSON files.
 * - Returns `[]` if the directory is missing or unreadable.
 *
 * @param forceRefresh - When true, bypasses in-memory cache and rescans disk.
 * @returns Validated template entries.
 *
 * @example
 * const templates = await listProjectTypes();
 * const freshTemplates = await listProjectTypes(true);
 */
export async function listProjectTypes(
    forceRefresh = false,
): Promise<ProjectTypeEntry[]> {
    if (_cache && !forceRefresh) return _cache;

    try {
        const dir = await resolveTemplatesDir();
        const entries = (await readdir(dir, {
            withFileTypes: true,
        })) as string[] | import("node:fs").Dirent[];
        const filenames = (entries as any[]).map((e) =>
            typeof e === "string" ? e : (e as import("node:fs").Dirent).name,
        );
        const results: ProjectTypeEntry[] = [];
        for (const e of filenames) {
            if (!e.endsWith(".json")) continue;
            const fp = path.join(dir, e);
            try {
                const raw = await readFile(fp, "utf8");
                const parsed = JSON.parse(raw);
                const res = validateProjectType(parsed);
                if (res.success && "value" in res && res.value) {
                    results.push({
                        spec: res.value,
                        filePath: fp,
                        fileName: e,
                    });
                }
            } catch (err) {
                // skip invalid JSON/files
                continue;
            }
        }
        // cache
        _cache = results;
        return results;
    } catch (err) {
        // Directory missing or unreadable — return empty list
        _cache = [];
        return [];
    }
}

/**
 * Finds a single project-type template by its `spec.id`.
 *
 * @param id - Project-type identifier to find.
 * @param forceRefresh - When true, rescans templates before lookup.
 * @returns Matching template entry, or `undefined` when not found.
 *
 * @example
 * const novel = await getProjectType("novel");
 */
export async function getProjectType(
    id: string,
    forceRefresh = false,
): Promise<ProjectTypeEntry | undefined> {
    const list = await listProjectTypes(forceRefresh);
    return list.find((l) => l.spec.id === id);
}

/**
 * Clears the in-memory project-type template cache.
 *
 * Use this when templates may have changed on disk and callers need to force
 * subsequent reads to hit filesystem state.
 */
export function clearProjectTypeCache() {
    _cache = null;
}

/**
 * Convenience default export for grouped project-type helper access.
 */
export default { listProjectTypes, getProjectType, clearProjectTypeCache };
