/**
 * @module api/schemas
 *
 * Zod schemas for validating API *response* shapes at the transport boundary
 * — deliberately separate from `../models/schemas.ts`, which validates data
 * crossing the filesystem-persistence boundary. The two boundaries are
 * allowed to drift (a response is a projection of persisted data, not
 * necessarily identical to it), so this module defines its own schemas
 * rather than re-exporting the persistence ones, with the single exception
 * of `AnyResourceSchema` (imported below) for the FR-1 resource-response
 * wrapper, since a resource crossing the API boundary is expected to be
 * byte-for-byte the same shape as the persisted resource.
 *
 * Each schema here matches an existing TypeScript type already declared in
 * its owning `lib/api/*.ts` (or underlying `lib/models/*.ts`) module:
 *
 * - `ProjectApiEntrySchema` — `ProjectApiEntry` (`./projects.ts`)
 * - `EntityRelationshipEdgeSchema` — `EntityRelationshipEdge`
 *   (`../models/entity-relationships.ts`, re-exported from
 *   `./entity-relationships.ts`)
 * - `EntityAliasTableSchema` — `EntityAliasTable`
 *   (`../models/entity-alias-table.ts`)
 * - `ResourceResponseSchema` — the FR-1 `{ resource: AnyResource }` response
 *   wrapper shape.
 */
import { z } from "zod";
import { AnyResourceSchema } from "../models/schemas";

// ---------------------------------------------------------------------------
// Shared metadata-value schema
//
// Mirrors `../models/schemas.ts`'s `MetadataValue` shape (recursive
// scalar/array/resource-ref/record union) but is declared independently here
// rather than imported, per this module's transport/persistence separation.
// ---------------------------------------------------------------------------

const ApiResourceRefValueSchema = z.object({
  id: z.string().nullable(),
  name: z.string(),
});

const ApiMetadataValueSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.string()),
    z.array(z.number()),
    z.array(z.boolean()),
    z.array(ApiResourceRefValueSchema),
    ApiResourceRefValueSchema,
    z.record(z.string(), ApiMetadataValueSchema),
  ]),
);

// ---------------------------------------------------------------------------
// ProjectApiEntrySchema — matches `ProjectApiEntry` in `./projects.ts`:
// `{ project: Project; folders: Folder[]; resources: AnyResource[] }`
// (`Project`/`Folder`/`AnyResource` from `../models/types.ts`).
// ---------------------------------------------------------------------------

const ApiEditorHeadingSchema = z.object({
  fontSize: z.string().optional(),
  fontFamily: z.string().optional(),
  fontWeight: z.string().optional(),
  letterSpacing: z.string().optional(),
  color: z.string().optional(),
});

const ApiEditorBodySchema = z.object({
  fontFamily: z.string().optional(),
  fontSize: z.string().optional(),
  lineHeight: z.string().optional(),
  paragraphSpacing: z.string().optional(),
});

const ApiEditorConfigSchema = z.object({
  headings: z
    .object({
      h1: ApiEditorHeadingSchema.optional(),
      h2: ApiEditorHeadingSchema.optional(),
      h3: ApiEditorHeadingSchema.optional(),
      h4: ApiEditorHeadingSchema.optional(),
      h5: ApiEditorHeadingSchema.optional(),
      h6: ApiEditorHeadingSchema.optional(),
    })
    .optional(),
  body: ApiEditorBodySchema.optional(),
});

const ApiMetadataFieldTypeSchema = z.enum([
  "text",
  "number",
  "date",
  "boolean",
  "select",
  "multiselect",
  "resource-ref",
  "multi-resource-ref",
]);

const ApiMetadataFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  type: ApiMetadataFieldTypeSchema,
  locked: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  multiple: z.boolean().optional(),
  refFolder: z.string().optional(),
  includeSubfolders: z.boolean().optional(),
  maxSelections: z.number().int().positive().optional(),
});

const ApiMetadataGroupSchema = z.object({
  id: z.string(),
  label: z.string(),
  folderId: z.string().optional(),
  fields: z.array(ApiMetadataFieldSchema),
});

const ApiMetadataSchemaSchema = z.object({
  groups: z.array(ApiMetadataGroupSchema),
});

const ApiProjectFeatureFlagsSchema = z.object({
  timeline: z.boolean().optional(),
  timelineView: z.boolean().optional(),
  pov: z.boolean().optional(),
  synopsis: z.boolean().optional(),
  notes: z.boolean().optional(),
  entities: z.boolean().optional(),
  entityHighlighting: z.boolean().optional(),
});

const ApiOrganizerCardBodySourceSchema = z.enum(["notes", "field"]);

const ApiOrganizerCardBodyConfigSchema = z.object({
  source: ApiOrganizerCardBodySourceSchema,
  fieldKey: z.string().min(1).optional(),
  excerptLength: z.number().int().positive().optional(),
});

const ApiTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
});

const ApiProjectConfigSchema = z.object({
  maxRevisions: z.number().optional(),
  wordCountGoal: z.number().optional(),
  statuses: z.array(z.string()).optional(),
  relationshipTypes: z.array(z.string()).optional(),
  autoPrune: z.boolean().optional(),
  tags: z.array(ApiTagSchema).optional(),
  tagAssignments: z.record(z.string(), z.array(z.string())).optional(),
  editorConfig: ApiEditorConfigSchema,
  defaultRevisionName: z.string().optional(),
  metadataSchema: ApiMetadataSchemaSchema.optional(),
  metadataRevision: z.number().optional(),
  features: ApiProjectFeatureFlagsSchema.optional(),
  organizerCardBody: ApiOrganizerCardBodyConfigSchema.optional(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  slug: z.string().optional(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  projectType: z.string().optional(),
  rootPath: z.string().optional(),
  config: ApiProjectConfigSchema.optional(),
  metadata: z.record(z.string(), ApiMetadataValueSchema).optional(),
});

const ApiMetadataSourceSchema = z.object({
  isMetadataSource: z.boolean(),
  metadataInputType: z.enum(["text", "multiselect", "autocomplete"]).optional(),
});

export const FolderSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  type: z.literal("folder"),
  folderId: z.string().nullable().optional(),
  sizeBytes: z.number().optional(),
  notes: z.string().optional(),
  orderIndex: z.number(),
  statuses: z.array(z.string()).optional(),
  entityKind: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  userMetadata: z.record(z.string(), ApiMetadataValueSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  parentId: z.string().nullable().optional(),
  special: z.boolean().optional(),
  metadataSource: ApiMetadataSourceSchema.optional(),
});

/**
 * Matches `ProjectApiEntry` (`./projects.ts`). `resources` accepts either a
 * concrete resource (per `AnyResourceSchema`) or a `Folder`, mirroring
 * `AnyResource`'s union in `../models/types.ts`, which includes `Folder`
 * alongside the text/image/audio resource types.
 */
export const ProjectApiEntrySchema = z.object({
  project: ProjectSchema,
  folders: z.array(FolderSchema),
  resources: z.array(z.union([AnyResourceSchema, FolderSchema])),
});

// ---------------------------------------------------------------------------
// EntityRelationshipEdgeSchema — matches `EntityRelationshipEdge`
// (`../models/entity-relationships.ts`, re-exported from
// `./entity-relationships.ts`).
// ---------------------------------------------------------------------------

export const EntityRelationshipEdgeSchema = z.object({
  id: z.string(),
  sourceEntityId: z.string().min(1),
  targetEntityId: z.string().min(1),
  relationshipType: z.string().min(1),
  createdAt: z.string(),
});

// ---------------------------------------------------------------------------
// EntityAliasTableSchema — matches `EntityAliasTable`
// (`../models/entity-alias-table.ts`).
// ---------------------------------------------------------------------------

const EntityAliasEntrySchema = z.object({
  entityId: z.string(),
  entityKind: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  terms: z.array(z.string()),
});

export const EntityAliasTableSchema = z.object({
  entities: z.record(z.string(), EntityAliasEntrySchema),
  claimedBy: z.record(z.string(), z.array(z.string())),
});

// ---------------------------------------------------------------------------
// ResourceResponseSchema (FR-1) — `{ resource: AnyResource }` response
// wrapper, using the persistence-boundary `AnyResourceSchema` directly since
// a resource response is expected to be identical to the persisted shape.
// ---------------------------------------------------------------------------

export const ResourceResponseSchema = z.object({ resource: AnyResourceSchema });
