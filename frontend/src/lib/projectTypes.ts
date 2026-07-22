/**
 * @module projectTypes
 *
 * Loads, validates, caches, and queries project-type template specifications.
 *
 * Project-type templates are JSON files stored under
 * `getwrite-config/templates/project-types` (with a fallback path for runtime
 * contexts where the workspace root is offset).
 *
 * These templates are **app-bundled configuration**, identical for every
 * tenant, not per-tenant data — so they are read from the real filesystem via
 * `node:fs`, never through the request-scoped storage adapter. Routing them
 * through the adapter would send template reads to a tenant's object store
 * (which has no templates) under the object-store backend (ADR-019).
 */
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { validateProjectType, ProjectTypeSpec } from "./models/schemas";

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
  // An explicit override wins (used by tests to point at a temp dir, and
  // available to deployments that relocate the bundled templates).
  const override = process.env.GETWRITE_PROJECT_TYPES_DIR;
  if (override) return override;
  // Try the default first, then the alt.
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
    const entries = (await readdir(dir, { withFileTypes: true })) as
      | string[]
      | import("node:fs").Dirent[];
    const filenames = (entries as (string | import("node:fs").Dirent)[]).map(
      (entry) => (typeof entry === "string" ? entry : entry.name),
    );
    const results: ProjectTypeEntry[] = [];
    for (const filename of filenames) {
      if (!filename.endsWith(".json")) continue;
      const filePath = path.join(dir, filename);
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        const validationResult = validateProjectType(parsed);
        if (
          validationResult.success &&
          "value" in validationResult &&
          validationResult.value
        ) {
          results.push({
            spec: validationResult.value,
            filePath,
            fileName: filename,
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
  return list.find((entry) => entry.spec.id === id);
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
