/**
 * @module project-features
 *
 * Persistence helper for the per-project feature configuration stored in
 * `project.json` — the `config.features` opt-in flags (Timeline, POV, Synopsis,
 * Notes, Entities), `config.organizerCardBody` (what Organizer cards render
 * as their body), and `config.relationshipTypes` (the project's
 * entity-relationship-type vocabulary, FR-19), and `config.subtypes` (the
 * project's resource-subtype list, Feature 72).
 *
 * This helper acquires the per-project lock (outer) so toggle writes cannot race the
 * schema/migration writes in `metadata-schema.ts`, and does its read, mutate and
 * write under the `project.json` file lock via `updateProjectJson` (innermost,
 * Feature 92 FR-8), so it also cannot race the other `project.json` writers. It
 * deliberately does NOT bump `config.metadataRevision`: toggles change no field
 * keys or sidecar values, so invalidating the query cache would be wasteful —
 * that bump is reserved for the one-time load migration.
 */
import { z } from "zod";
import { acquireLock } from "./locks";
import { updateProjectJson } from "./project-json-write";
import {
  ProjectFeatureFlagsSchema,
  OrganizerCardBodyConfigSchema,
  SubtypeListSchema,
} from "./schemas";
import type { ProjectFeatureFlags, OrganizerCardBodyConfig } from "./types";

const RelationshipTypesSchema = z.array(z.string());

/** Partial update for the project feature configuration. */
export interface FeatureConfigUpdate {
  /** Replacement feature-toggle map. Omit to leave the existing flags untouched. */
  features?: ProjectFeatureFlags;
  /** Replacement Organizer card-body config. Omit to leave the existing config untouched. */
  organizerCardBody?: OrganizerCardBodyConfig;
  /** Replacement relationship-type vocabulary. Omit to leave the existing list untouched. */
  relationshipTypes?: string[];
  /**
   * Replacement resource-subtype list (Feature 72). Omit to leave the existing
   * list untouched. Blank or case-insensitively duplicate entries are rejected
   * with a `ZodError`.
   */
  subtypes?: string[];
}

/** The persisted feature configuration after an update. */
export interface FeatureConfigResult {
  features: ProjectFeatureFlags;
  organizerCardBody?: OrganizerCardBodyConfig;
  relationshipTypes?: string[];
  subtypes?: string[];
}

/**
 * Validates and persists a partial feature-configuration update to
 * `project.json`. Each provided block (`features` / `organizerCardBody` /
 * `relationshipTypes` / `subtypes`) replaces the existing block wholesale; an omitted
 * block is left unchanged.
 *
 * The read-modify-write runs under the project lock, then the file lock, and updates `updatedAt`. It
 * never bumps `metadataRevision`.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @param update - Blocks to replace. At least one should be provided.
 * @returns The feature configuration as persisted.
 * @throws {import("zod").ZodError} If a provided block is malformed.
 * @throws {Error} If `project.json` cannot be read or written.
 */
export async function updateFeatureConfig(
  projectRoot: string,
  update: FeatureConfigUpdate,
): Promise<FeatureConfigResult> {
  // Validate up front so malformed input never reaches disk.
  const nextFeatures =
    update.features !== undefined
      ? ProjectFeatureFlagsSchema.parse(update.features)
      : undefined;
  // Invariant: the Timeline view reads the timeline date fields, so the view
  // cannot be on without them. Enforce it here, at the single write seam, so
  // every caller (not just the UI toggles) is prevented from persisting the
  // stranded "view on, no data fields" state.
  if (nextFeatures?.timelineView === true) {
    nextFeatures.timeline = true;
  }
  const nextCardBody =
    update.organizerCardBody !== undefined
      ? OrganizerCardBodyConfigSchema.parse(update.organizerCardBody)
      : undefined;
  const nextRelationshipTypes =
    update.relationshipTypes !== undefined
      ? RelationshipTypesSchema.parse(update.relationshipTypes)
      : undefined;
  const nextSubtypes =
    update.subtypes !== undefined
      ? SubtypeListSchema.parse(update.subtypes)
      : undefined;

  const release = await acquireLock(projectRoot);
  try {
    return await updateProjectJson(projectRoot, (project) => {
      const config = project.config ?? { editorConfig: {} };

      if (nextFeatures !== undefined) {
        config.features = nextFeatures;
      }
      if (nextCardBody !== undefined) {
        config.organizerCardBody = nextCardBody;
      }
      if (nextRelationshipTypes !== undefined) {
        config.relationshipTypes = nextRelationshipTypes;
      }
      if (nextSubtypes !== undefined) {
        config.subtypes = nextSubtypes;
      }

      project.config = config;
      project.updatedAt = new Date().toISOString();
      // NOTE: intentionally no metadataRevision bump — see module docstring.
      return {
        result: {
          features: config.features ?? {},
          organizerCardBody: config.organizerCardBody,
          relationshipTypes: config.relationshipTypes,
          subtypes: config.subtypes,
        },
      };
    });
  } finally {
    release();
  }
}

export default { updateFeatureConfig };
