// Last Updated: 2026-10-18

/**
 * Builds the options main passes to `utilityProcess.fork` for the DOCX import
 * worker. Pure, and imports nothing from `electron` or `frontend/`, so it is
 * testable under `electron/tests/` (Feature 88, FR-1).
 */

/** The subset of `utilityProcess.fork` options this module produces. */
export interface DocxWorkerForkOptions {
  env: Record<string, string | undefined>;
  cwd: string;
}

/** Inputs the fork options are derived from. */
export interface DocxWorkerForkInputs {
  /** Directory holding the project-type specs. */
  templatesDir: string;
  /** Directory of writer-saved project types (`<userData>/project-types`). */
  savedProjectTypesDir: string;
  /** Working directory the worker should start in. */
  workingDir: string;
  /** Environment the worker inherits (passing `env` replaces it, so it is carried over). */
  baseEnv: Record<string, string | undefined>;
}

/**
 * Returns the fork options for the DOCX worker: the base environment plus
 * `GETWRITE_PROJECT_TYPES_DIR` and `GETWRITE_SAVED_PROJECT_TYPES_DIR`, and the given working directory unchanged.
 */
export function buildDocxWorkerForkOptions(
  inputs: DocxWorkerForkInputs,
): DocxWorkerForkOptions {
  return {
    env: {
      ...inputs.baseEnv,
      GETWRITE_PROJECT_TYPES_DIR: inputs.templatesDir,
      GETWRITE_SAVED_PROJECT_TYPES_DIR: inputs.savedProjectTypesDir,
    },
    cwd: inputs.workingDir,
  };
}
