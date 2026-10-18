// Last Updated: 2026-10-18

/**
 * Builds the options main passes to `utilityProcess.fork` for the DOCX import
 * worker. Pure, and imports nothing from `electron` or `frontend/`, so it is
 * testable under `electron/tests/` (Feature 88, FR-1).
 */

/** The subset of `utilityProcess.fork` options this module produces. */
export interface DocxWorkerForkOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
}

/** Inputs the fork options are derived from. */
export interface DocxWorkerForkInputs {
  /** Directory holding the project-type specs. */
  templatesDir: string;
  /** Working directory the worker should start in. */
  workingDir: string;
}

/**
 * Returns the fork options for the DOCX worker. Today this is the empty object
 * main has always passed (no `env`, no `cwd`), so the worker inherits both.
 */
export function buildDocxWorkerForkOptions(
  _inputs: DocxWorkerForkInputs,
): DocxWorkerForkOptions {
  return {};
}
