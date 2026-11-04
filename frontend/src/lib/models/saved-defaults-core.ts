/**
 * @module saved-defaults-core
 *
 * Transport-agnostic setter cores for the two saved selection defaults
 * (`config.compileDefaults`, `config.exportDefaults`, Feature 101, FR-2,
 * FR-32). Modelled on `goal-filter-core.ts`: a read-modify-write of
 * `project.json` inside `withMetaLock` through `updateProjectJson`, touching
 * only its own key.
 *
 * - The id list is validated before any lock or write (`validateExcludedIds`),
 *   so a refusal carries the same text on every path. Over the cap is refused,
 *   never truncated. Duplicates are collapsed, keeping first-seen order.
 * - Clearing (`null`) deletes the key (never `null`, never `{}`).
 * - The project root comes from a validated `projectId`; no path argument.
 * - Locked-access errors are not caught and propagate unchanged.
 */
import { withMetaLock } from "./meta-locks";
import { updateProjectJson } from "./project-json-write";
import type { ProjectConfig } from "./types";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { UUID } from "./schemas";

export { InvalidProjectIdCoreError };

/** Most excluded ids one setter accepts (OQ-2). */
export const SAVED_DEFAULTS_MAX_IDS = 5000;

export const SAVED_DEFAULTS_MESSAGES = {
  notArray: "excludedResourceIds must be a list of resource ids or null.",
  notString: "Every excluded resource id must be a string.",
  notUuid: "Every excluded resource id must be a valid id.",
  tooMany: `A saved default can leave out at most ${SAVED_DEFAULTS_MAX_IDS} resources.`,
} as const;

/** The candidate id list was refused. Map to HTTP 400. */
export class InvalidSavedDefaultsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSavedDefaultsError";
  }
}

/** Pure: returns the deduplicated ids or throws `InvalidSavedDefaultsError`. */
function validateExcludedIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new InvalidSavedDefaultsError(SAVED_DEFAULTS_MESSAGES.notArray);
  }
  if (input.length > SAVED_DEFAULTS_MAX_IDS) {
    throw new InvalidSavedDefaultsError(SAVED_DEFAULTS_MESSAGES.tooMany);
  }
  const seen = new Set<string>();
  for (const id of input as unknown[]) {
    if (typeof id !== "string") {
      throw new InvalidSavedDefaultsError(SAVED_DEFAULTS_MESSAGES.notString);
    }
    if (!UUID.safeParse(id).success) {
      throw new InvalidSavedDefaultsError(SAVED_DEFAULTS_MESSAGES.notUuid);
    }
    seen.add(id);
  }
  return [...seen];
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

type SavedDefaultsKey = "compileDefaults" | "exportDefaults";

async function setSavedDefaults(
  key: SavedDefaultsKey,
  projectId: string,
  excludedResourceIds: unknown,
): Promise<{ excludedResourceIds: string[] | undefined }> {
  const projectRoot = requireProjectRoot(projectId);
  const stored =
    excludedResourceIds === null
      ? undefined
      : validateExcludedIds(excludedResourceIds);
  return withMetaLock(projectRoot, async () => {
    await updateProjectJson(
      projectRoot,
      (project) => {
        const config: Record<string, unknown> = { ...(project.config ?? {}) };
        if (stored === undefined) delete config[key];
        else config[key] = { excludedResourceIds: stored };
        project.config = config as unknown as ProjectConfig;
        return { result: undefined };
      },
      { durable: process.env.GETWRITE_DURABLE_META === "1" },
    );
    return { excludedResourceIds: stored };
  });
}

/**
 * Set (a list of resource ids) or clear (`null`) `config.compileDefaults`,
 * touching no other config key. Returns the stored ids (`undefined` after a
 * clear).
 *
 * @throws InvalidSavedDefaultsError, InvalidProjectIdCoreError; locked-access
 *   errors are rethrown unchanged.
 */
export function setCompileDefaultsCore(
  projectId: string,
  excludedResourceIds: unknown,
): Promise<{ excludedResourceIds: string[] | undefined }> {
  return setSavedDefaults("compileDefaults", projectId, excludedResourceIds);
}

/** As `setCompileDefaultsCore`, for `config.exportDefaults`. */
export function setExportDefaultsCore(
  projectId: string,
  excludedResourceIds: unknown,
): Promise<{ excludedResourceIds: string[] | undefined }> {
  return setSavedDefaults("exportDefaults", projectId, excludedResourceIds);
}
