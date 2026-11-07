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
import { InvalidProjectIdCoreError } from "./project-id-core-error";
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

/**
 * The visible messages when a Source cannot be added to the saved compile
 * exclusions (Feature 102, FR-27). The Source itself is still created.
 */
export const SOURCE_NOT_EXCLUDED_MESSAGES = {
  atCap: `The Source was created, but it is not left out of compile by default: the saved compile default is full (${SAVED_DEFAULTS_MAX_IDS} resources). Clear or shorten the saved default, or leave the Source out in the Compile dialog.`,
  unreadable:
    "The Source was created, but it is not left out of compile by default: the saved compile default could not be read, so it was left unchanged. Leave the Source out in the Compile dialog.",
} as const;

/**
 * Add a new Source's id to `config.compileDefaults.excludedResourceIds`
 * (Feature 102, FR-27), keeping the `{ excludedResourceIds }` shape. Never
 * touches `exportDefaults`. Returns a notice, not an error, when the list is
 * at the cap or its stored shape is unusable (the stored value is left
 * unchanged); a read or write failure is thrown, and locked-access errors
 * propagate unchanged. `projectRoot` is a resolved root, never client input.
 */
export async function seedSourceCompileExclusion(
  projectRoot: string,
  resourceId: string,
): Promise<{ notice?: string }> {
  return withMetaLock(projectRoot, async () =>
    updateProjectJson<{ notice?: string }>(
      projectRoot,
      (project) => {
        const config: Record<string, unknown> = { ...(project.config ?? {}) };
        const stored = config.compileDefaults;
        let current: string[] = [];
        if (stored !== undefined) {
          const ids = (stored as { excludedResourceIds?: unknown } | null)
            ?.excludedResourceIds;
          if (
            typeof stored !== "object" ||
            stored === null ||
            !Array.isArray(ids) ||
            !ids.every((id) => typeof id === "string")
          ) {
            return {
              result: { notice: SOURCE_NOT_EXCLUDED_MESSAGES.unreadable },
              shouldWrite: false,
            };
          }
          current = ids as string[];
        }
        if (current.includes(resourceId)) {
          return { result: {}, shouldWrite: false };
        }
        if (current.length >= SAVED_DEFAULTS_MAX_IDS) {
          return {
            result: { notice: SOURCE_NOT_EXCLUDED_MESSAGES.atCap },
            shouldWrite: false,
          };
        }
        config.compileDefaults = {
          excludedResourceIds: [...current, resourceId],
        };
        project.config = config as unknown as ProjectConfig;
        return { result: {} };
      },
      { durable: process.env.GETWRITE_DURABLE_META === "1" },
    ),
  );
}
