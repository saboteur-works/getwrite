/**
 * @module feature-config-transport-service
 *
 * HTTP transport for the per-project feature configuration (the `config.features`
 * opt-in flags and `config.organizerCardBody`). Posts partial updates to
 * `/api/project/features` and returns the persisted configuration.
 */
import type {
  ProjectFeatureFlags,
  OrganizerCardBodyConfig,
} from "../lib/models/types";

/** Partial update for the project feature configuration. */
export interface FeatureConfigUpdate {
  features?: ProjectFeatureFlags;
  organizerCardBody?: OrganizerCardBodyConfig;
}

/** The persisted feature configuration returned by the route. */
export interface FeatureConfigResult {
  features: ProjectFeatureFlags;
  organizerCardBody?: OrganizerCardBodyConfig | null;
}

function getApiErrorMessage(errorBody: unknown, fallback: string): string {
  if (
    errorBody &&
    typeof errorBody === "object" &&
    "error" in errorBody &&
    typeof (errorBody as { error?: unknown }).error === "string"
  ) {
    return (errorBody as { error: string }).error;
  }
  return fallback;
}

/**
 * Posts a partial feature-configuration update for a project.
 *
 * @param projectPath - Absolute project root path.
 * @param update - Blocks to replace (`features` and/or `organizerCardBody`).
 * @returns The persisted feature configuration.
 * @throws {Error} When the route responds with a non-OK status.
 */
export async function postFeatureConfig(
  projectPath: string,
  update: FeatureConfigUpdate,
): Promise<FeatureConfigResult> {
  const response = await fetch("/api/project/features", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, ...update }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      getApiErrorMessage(errorBody, "Failed to update feature configuration."),
    );
  }

  return (await response.json()) as FeatureConfigResult;
}
