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
 * - `ProjectApiEntrySchema` — `ProjectApiEntry` (`./projects.ts`); the
 *   locked-entry variant a `GET /api/projects` list response can also
 *   contain is modeled separately by `LockedProjectListEntrySchema` and
 *   unioned into `ProjectListEntrySchema` (`ProjectListApiEntry`,
 *   `./projects.ts`) — `open`/`create` never return that shape, so their
 *   response validation keeps using the plain, fully-strict
 *   `ProjectApiEntrySchema`.
 * - `EntityRelationshipEdgeSchema` — `EntityRelationshipEdge`
 *   (`../models/entity-relationships.ts`, re-exported from
 *   `./entity-relationships.ts`)
 * - `EntityAliasTableSchema` — `EntityAliasTable`
 *   (`../models/entity-alias-table.ts`)
 * - `ResourceResponseSchema` — the FR-1 `{ resource: AnyResource }` response
 *   wrapper shape.
 */
import { z } from "zod";
import { AnyResourceSchema, TipTapDocumentSchema } from "../models/schemas";

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

export const ApiTagSchema = z.object({
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
 *
 * `isLocked`/`isEncrypted` are optional here for the unlocked-encrypted list
 * entry (`listEncryptedProject`, `project-crud-core.ts`), which sets
 * `isEncrypted: true`/`isLocked: false` but otherwise carries a full
 * `{ id, name, createdAt }` project object that satisfies `ProjectSchema` (its
 * only other required field, `createdAt`, is also present). The *locked*
 * variant — no `name` at all — does not satisfy this schema; it is modeled
 * separately by {@link LockedProjectListEntrySchema}.
 */
export const ProjectApiEntrySchema = z.object({
  project: ProjectSchema,
  folders: z.array(FolderSchema),
  resources: z.array(z.union([AnyResourceSchema, FolderSchema])),
  isLocked: z.literal(false).optional(),
  isEncrypted: z.boolean().optional(),
});

/**
 * The reduced list entry `listProjectsCore` (`project-crud-core.ts`) returns
 * for an encrypted project whose workspace is locked (FR20): the project
 * carries only its `id` and the time it was encrypted (`createdAt`, mirroring
 * the marker's `encryptedAt`) — no `name`, and `resources`/`folders` are
 * always empty since nothing inside a locked project is readable. Only
 * `listProjectsCore`'s `GET /api/projects` response can contain this shape;
 * `open`/`create` never return it, so their response schema stays the plain,
 * fully-strict `ProjectApiEntrySchema` above.
 */
export const LockedProjectListEntrySchema = z.object({
  project: z.object({ id: z.string(), createdAt: z.string() }),
  folders: z.array(FolderSchema),
  resources: z.array(z.union([AnyResourceSchema, FolderSchema])),
  isLocked: z.literal(true),
  isEncrypted: z.literal(true),
});

/**
 * The full response shape of a `GET /api/projects` list entry: a normal,
 * fully-populated project entry, or the reduced locked entry above. `open`
 * and `create` responses validate against `ProjectApiEntrySchema` directly,
 * since neither route can return a locked entry.
 */
export const ProjectListEntrySchema = z.union([
  LockedProjectListEntrySchema,
  ProjectApiEntrySchema,
]);

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

// ---------------------------------------------------------------------------
// ResourceContentResponseSchema — matches `ResourceContentResponse`
// (`./resources.ts`): `{ resourceContent?: { tipTapContent?: TipTapDocument
// | null; plaintextContent?: string | null }; revisions?: Array<{ id:
// string; isCanonical: boolean }> }`. Reuses the persistence-boundary
// `TipTapDocumentSchema` for the nested TipTap document, since a resource's
// TipTap content is expected to be identical to the persisted shape.
// ---------------------------------------------------------------------------

export const ResourceContentResponseSchema = z.object({
  resourceContent: z
    .object({
      tipTapContent: TipTapDocumentSchema.nullable().optional(),
      plaintextContent: z.string().nullable().optional(),
    })
    .optional(),
  revisions: z
    .array(z.object({ id: z.string(), isCanonical: z.boolean() }))
    .optional(),
});

// ---------------------------------------------------------------------------
// ResourceRevisionContentResponseSchema — matches the `{ content?: unknown
// }` payload read at `./resources.ts:300` for a single revision's content.
// `content` is deliberately `unknown` here, mirroring the source site: its
// shape varies by resource type and is not narrowed further at this
// boundary.
// ---------------------------------------------------------------------------

export const ResourceRevisionContentResponseSchema = z.object({
  content: z.unknown().optional(),
});

// ---------------------------------------------------------------------------
// EntityRelationshipRemovedResponseSchema /
// EntityRelationshipRemovedCountResponseSchema — match the two response
// shapes read in `./entity-relationships.ts`: `{ removed?: boolean }` for a
// single-edge removal and `{ removedCount?: number }` for a bulk removal.
// ---------------------------------------------------------------------------

export const EntityRelationshipRemovedResponseSchema = z.object({
  removed: z.boolean().optional(),
});

export const EntityRelationshipRemovedCountResponseSchema = z.object({
  removedCount: z.number().optional(),
});

// ---------------------------------------------------------------------------
// TagAssignmentsResponseSchema — matches the `{ tagIds?: string[] }`
// response read in `./tags.ts`.
// ---------------------------------------------------------------------------

export const TagAssignmentsResponseSchema = z.object({
  tagIds: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// ResourceMentionsResponseSchema / EntityMentionedInResponseSchema /
// EntityCooccurrenceResponseSchema / EntityMentionCountsResponseSchema —
// match the read shapes over `../models/mentions-core.ts`'s exported types:
//
// - `ResourceMention` — `{ entityId: string; name: string }` (FR-9).
// - `EntityMentionedIn` — `{ resourceId: string; name: string; snippets:
//   string[]; isLinked: boolean; isMentioned: boolean; ambiguousWith:
//   string[][] }` (FR-10/FR-12/FR-14). None of these fields are optional in
//   the source type.
// - `EntityCooccurrenceEntry` — `{ entityId: string; count: number;
//   resourceIds: string[] }`, keyed per-entity in a `Record<string,
//   EntityCooccurrenceEntry[]>`.
// - `EntityMentionCounts` — `{ mentions: number; resources: number }`,
//   keyed per-entity in a `Record<string, EntityMentionCounts>`.
// ---------------------------------------------------------------------------

export const ResourceMentionsResponseSchema = z.object({
  mentions: z
    .array(z.object({ entityId: z.string(), name: z.string() }))
    .optional(),
});

const EntityMentionedInSchema = z.object({
  resourceId: z.string(),
  name: z.string(),
  snippets: z.array(z.string()),
  isLinked: z.boolean(),
  isMentioned: z.boolean(),
  ambiguousWith: z.array(z.array(z.string())),
});

export const EntityMentionedInResponseSchema = z.object({
  mentionedIn: z.array(EntityMentionedInSchema).optional(),
});

const EntityCooccurrenceEntrySchema = z.object({
  entityId: z.string(),
  count: z.number(),
  resourceIds: z.array(z.string()),
});

export const EntityCooccurrenceResponseSchema = z.record(
  z.string(),
  z.array(EntityCooccurrenceEntrySchema),
);

const EntityMentionCountsSchema = z.object({
  mentions: z.number(),
  resources: z.number(),
});

export const EntityMentionCountsResponseSchema = z.record(
  z.string(),
  EntityMentionCountsSchema,
);

// ---------------------------------------------------------------------------
// ResourceExcerptsResponseSchema — matches the `{ excerpts?: Record<string,
// string> }` response read in `./resource-excerpts.ts`.
// ---------------------------------------------------------------------------

export const ResourceExcerptsResponseSchema = z.object({
  excerpts: z.record(z.string(), z.string()).optional(),
});
