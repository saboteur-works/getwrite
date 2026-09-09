import { generateUUID } from "./uuid";
import type {
  Project as ProjectType,
  ProjectConfig,
  MetadataValue,
} from "./types";
import { ProjectSchema, Infer } from "./schemas";

/** Apply sensible defaults to a `ProjectConfig` object. */
export function normalizeProjectConfig(config?: ProjectConfig): ProjectConfig {
  return {
    maxRevisions: config?.maxRevisions ?? 50,
    wordCountGoal: config?.wordCountGoal,
    statuses: config?.statuses ?? [],
    // Left undefined (not defaulted to []) when absent, unlike `statuses`:
    // FR-18's DEFAULT_RELATIONSHIP_TYPES fallback is applied at read time by
    // `createEntityRelationship` and `selectActiveProjectRelationshipTypes`,
    // which must be able to distinguish "never persisted" (undefined, falls
    // back to the default vocabulary) from "explicitly emptied" ([], FR-15)
    // — the same undefined-preserving treatment `metadataSchema` already
    // gets in this function for the same reason.
    relationshipTypes: config?.relationshipTypes,
    autoPrune: config?.autoPrune ?? true,
    editorConfig: config?.editorConfig ?? {},
    defaultRevisionName: config?.defaultRevisionName,
    metadataRevision: config?.metadataRevision,
    features: config?.features,
    organizerCardBody: config?.organizerCardBody,
  };
}

/**
 * Create a new `Project` model object with generated identity and timestamps.
 * The result is validated against the runtime `ProjectSchema` before being returned.
 */
export function createProject(params: {
  name: string;
  slug?: string;
  projectType?: string;
  rootPath?: string;
  config?: ProjectConfig;
  metadata?: Record<string, MetadataValue>;
}): ProjectType {
  const now = new Date().toISOString();
  const project: ProjectType = {
    id: generateUUID(),
    name: params.name,
    slug: params.slug,
    createdAt: now,
    updatedAt: undefined,
    projectType: params.projectType,
    rootPath: params.rootPath,
    config: normalizeProjectConfig(params.config),
    metadata: params.metadata,
  };

  // Validate runtime shape; will throw on invalid fields which surfaces issues
  // during development and in unit tests.
  ProjectSchema.parse(project);
  return project;
}

/** Validate and return a typed Project; throws on invalid input. */
export function validateProject(input: unknown): Infer<typeof ProjectSchema> {
  return ProjectSchema.parse(input);
}

export default { createProject, validateProject, normalizeProjectConfig };
