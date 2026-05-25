/**
 * @module resource-revision
 *
 * Helpers for the initial canonical revision that is written whenever a new
 * text resource is created.
 */
import type { ProjectConfig } from "./types";

const DEFAULT_INITIAL_REVISION_NAME = "Initial Draft";

/**
 * Resolves the name to use for the initial canonical revision of a new text
 * resource.
 *
 * Falls back to `"Initial Draft"` when the project has no configured default or
 * when the configured value is blank.
 */
export function resolveInitialRevisionName(config: ProjectConfig): string {
  const name = config.defaultRevisionName;
  if (name && name.trim().length > 0) {
    return name.trim();
  }
  return DEFAULT_INITIAL_REVISION_NAME;
}
