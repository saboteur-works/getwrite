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
import { isHostedAuthActive } from "./auth/auth-config";

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
  /** Where the entry came from: the bundled directory or the saved store. */
  source: "built-in" | "saved";
};

/** Why a saved file could not be used. Never carries file content or parser text. */
export type UnusableSavedReason = "unparseable" | "invalid" | "unreadable";

/** A saved file that was skipped, by name and short reason only. */
export type UnusableSavedFile = {
  fileName: string;
  reason: UnusableSavedReason;
};

/** State of the saved-types directory as seen by the last resolution. */
export type SavedDirectoryStatus = "ok" | "not-configured" | "unreadable";

/** Merged result of one resolution: built-in then saved entries, plus saved-side diagnostics. */
export type ProjectTypeResolution = {
  entries: ProjectTypeEntry[];
  unusable: UnusableSavedFile[];
  savedStatus: SavedDirectoryStatus;
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
 * Resolves the built-in project-type directory. This is the one function that
 * decides it, so the server, the worker and the CLI cannot disagree.
 *
 * Resolution order:
 * 1. `GETWRITE_PROJECT_TYPES_DIR`, if set and non-empty
 * 2. `GETWRITE_TEMPLATES_DIR`, if set and non-empty
 * 3. `DEFAULT_TEMPLATES_DIR`
 * 4. `ALT_TEMPLATES_DIR`
 *
 * If neither directory is readable, returns `DEFAULT_TEMPLATES_DIR` so callers
 * can handle missing-directory behavior in one place.
 *
 * @returns Relative path to the selected templates directory.
 */
export async function resolveBuiltInProjectTypesDir(): Promise<string> {
  // An explicit override wins (used by tests to point at a temp dir, and
  // available to deployments that relocate the bundled templates). The
  // desktop main process sets GETWRITE_TEMPLATES_DIR for the server.
  const override = process.env.GETWRITE_PROJECT_TYPES_DIR;
  if (override) return override;
  const templatesEnv = process.env.GETWRITE_TEMPLATES_DIR;
  if (templatesEnv) return templatesEnv;
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

/**
 * Built-in entries only. Saved entries are never held here (FR-13): the saved
 * directory is read on every resolution, so a write is visible on the next call.
 */
let _cache: ProjectTypeEntry[] | null = null;

/** True only for "this path does not exist"; a permissions or I/O error is not a missing directory. */
function isMissingEntryError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Reads the built-in directory. Invalid or unreadable built-in files are
 * skipped silently; a missing/unreadable directory yields `[]`.
 */
async function readBuiltInEntries(): Promise<ProjectTypeEntry[]> {
  try {
    const dir = await resolveBuiltInProjectTypesDir();
    const dirents = await readdir(dir, { withFileTypes: true });
    const results: ProjectTypeEntry[] = [];
    for (const dirent of dirents) {
      const filename = dirent.name;
      if (!filename.endsWith(".json")) continue;
      const filePath = path.join(dir, filename);
      try {
        const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
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
            source: "built-in",
          });
        }
      } catch (_) {
        // skip invalid JSON/files
        continue;
      }
    }
    return results;
  } catch (_) {
    // Directory missing or unreadable — built-in list is empty
    return [];
  }
}

/** Result of reading the saved directory once. */
type SavedRead = Omit<ProjectTypeResolution, "entries"> & {
  entries: ProjectTypeEntry[];
};

/**
 * Reads the saved-types directory named by `GETWRITE_SAVED_PROJECT_TYPES_DIR`.
 * Fails closed: an unset/empty variable or active hosted auth reads nothing
 * (no cwd, repository, built-in or projects-directory fallback). Never cached.
 */
async function readSavedEntries(): Promise<SavedRead> {
  const dir = process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
  if (!dir || dir.trim() === "" || isHostedAuthActive()) {
    return { entries: [], unusable: [], savedStatus: "not-configured" };
  }
  let names: { name: string }[];
  try {
    names = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    // ENOENT is the one benign case: nothing has been saved yet.
    return {
      entries: [],
      unusable: [],
      savedStatus: isMissingEntryError(err) ? "ok" : "unreadable",
    };
  }
  const entries: ProjectTypeEntry[] = [];
  const unusable: UnusableSavedFile[] = [];
  const files = names
    .map((d) => d.name)
    .filter((n) => n.endsWith(".json"))
    .sort();
  for (const fileName of files) {
    const filePath = path.join(dir, fileName);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch {
      unusable.push({ fileName, reason: "unreadable" });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      unusable.push({ fileName, reason: "unparseable" });
      continue;
    }
    const result = validateProjectType(parsed);
    if (result.success && "value" in result && result.value) {
      entries.push({ spec: result.value, filePath, fileName, source: "saved" });
    } else {
      unusable.push({ fileName, reason: "invalid" });
    }
  }
  return { entries, unusable, savedStatus: "ok" };
}

/**
 * Resolves every project type: built-in entries (cached in memory unless
 * `forceRefresh`) followed by saved entries (read from disk on every call).
 * A built-in id wins over a saved entry with the same id in `getProjectType`.
 *
 * @param forceRefresh - When true, rescans the built-in directory too.
 * @returns Entries, unusable saved files and the saved-directory status.
 */
export async function resolveProjectTypes(
  forceRefresh = false,
): Promise<ProjectTypeResolution> {
  if (!_cache || forceRefresh) _cache = await readBuiltInEntries();
  const saved = await readSavedEntries();
  return {
    entries: [..._cache, ...saved.entries],
    unusable: saved.unusable,
    savedStatus: saved.savedStatus,
  };
}

/**
 * Lists available project-type entries (built-in first, then saved).
 *
 * @param forceRefresh - When true, also rescans the built-in directory.
 * @returns Validated entries; see `resolveProjectTypes` for diagnostics.
 */
export async function listProjectTypes(
  forceRefresh = false,
): Promise<ProjectTypeEntry[]> {
  return (await resolveProjectTypes(forceRefresh)).entries;
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
 * Clears the in-memory built-in project-type cache (saved entries are never cached).
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
export default {
  resolveProjectTypes,
  listProjectTypes,
  getProjectType,
  clearProjectTypeCache,
};
