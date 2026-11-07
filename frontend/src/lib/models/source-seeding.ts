/**
 * @module source-seeding
 *
 * Adds a just-created Source to the saved compile exclusions, and undoes the
 * creation when that cannot be done (Feature 102, FR-27; pre-PR fix C).
 *
 * Without the rollback, a failed `project.json` write left the Source in the
 * project, the request reporting an error, and compile including the Source.
 * Now a failure removes the Source again and is reported as a creation
 * failure; if the removal also fails, the error says the Source exists and is
 * not excluded. A refusal that is not a failure (the 5000-id cap, an unusable
 * stored value) is still a notice and keeps the Source (FR-27).
 */
import { isLockedAccessError } from "./locked-access";
import { seedSourceCompileExclusion } from "./saved-defaults-core";
import { purgeResource, softDeleteResource } from "./trash";

/** The Source could not be excluded from compile and was removed again. */
class SourceCreationFailedError extends Error {
  constructor(options?: ErrorOptions) {
    super(
      "The Source could not be created: it could not be left out of compile by default. Nothing was added. Try again.",
      options,
    );
    this.name = "SourceCreationFailedError";
  }
}

/** The Source could not be excluded from compile and could not be removed. */
class SourceNotExcludedError extends Error {
  constructor(options?: ErrorOptions) {
    super(
      "The Source was created, but it is not left out of compile by default, and it could not be removed again. Check the project and its Trash for it, and leave it out in the Compile dialog.",
      options,
    );
    this.name = "SourceNotExcludedError";
  }
}

/** Removes a Source that has just been created, through Trash and a purge. */
async function removeCreatedSource(
  projectRoot: string,
  resourceId: string,
): Promise<void> {
  await softDeleteResource(projectRoot, resourceId);
  await purgeResource(projectRoot, resourceId);
}

/**
 * Seeds `resourceId` into `config.compileDefaults.excludedResourceIds`.
 * Returns the notice for a refusal that keeps the Source.
 *
 * @throws SourceCreationFailedError when seeding failed and the Source was
 *   removed again; the original failure is its `cause`. A locked-access error
 *   is rethrown unchanged once the Source is removed.
 * @throws SourceNotExcludedError when seeding failed and the removal failed
 *   too; the seeding failure is its `cause`.
 */
export async function seedCreatedSource(
  projectRoot: string,
  resourceId: string,
): Promise<{ notice?: string }> {
  try {
    return await seedSourceCompileExclusion(projectRoot, resourceId);
  } catch (seedError) {
    try {
      await removeCreatedSource(projectRoot, resourceId);
    } catch {
      throw new SourceNotExcludedError({ cause: seedError });
    }
    if (isLockedAccessError(seedError)) throw seedError;
    throw new SourceCreationFailedError({ cause: seedError });
  }
}
