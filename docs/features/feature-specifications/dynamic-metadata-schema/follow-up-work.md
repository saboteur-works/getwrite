# Dynamic Metadata Schema — Follow-up Work

## ~~MetadataFieldSchema key regex rejects built-in camelCase keys~~ — RESOLVED

**Discovered during:** Task 2 (default built-in schema constant)
**Resolved during:** Task 5 (API route — `POST /api/project/metadata-schema`)

`MetadataFieldSchema.key` in `schemas.ts` previously enforced `/^[a-z0-9-]+$/`, which rejected built-in camelCase keys (`storyDate`, `storyDuration`, `storyEndDate`). The fix was applied as part of Task 5:

- `MetadataFieldSchema.key` changed from `z.string().regex(/^[a-z0-9-]+$/)` to `z.string().min(1)` — any non-empty string is now accepted at the Zod layer.
- Slug-pattern validation (`/^[a-z0-9-]+$/`) is now enforced only in the `add-field` handler of `POST /api/project/metadata-schema`, guarding user-created fields on write.
- Built-in camelCase keys round-trip cleanly through `ProjectConfigSchema.safeParse()`.
- Tests in `metadata-schema-types.test.ts` were updated to reflect the new design; a new `metadata-schema-api.test.ts` covers the route-level slug guard.

---

## ~~Task 6 must update `metadataSchema` in Redux state after API calls~~ — RESOLVED

**Discovered during:** Task 3 (Redux — store `metadataSchema` in `projectsSlice`)
**Resolved during:** Task 6 (Redux async thunks for schema CRUD)

All eight schema CRUD thunks return `{ projectId, schema }` on fulfillment, and the slice's `extraReducers` replaces `state.projects.projects[projectId].metadataSchema` with the API response. A dedicated `updateProjectMetadataSchema` sync reducer was also added for direct dispatch from components that already have an updated schema.

---

## ~~Timeline components must handle `ResourceRef` POV values~~ — RESOLVED

**Discovered during:** Task 7 (`ResourceRef` type + lazy POV migration on first edit)
**Resolved during:** Task 10 (schema-driven sidebar rewrite)

A `resolvePovDisplay` helper was added to `TimelineView.tsx` and applied at both read sites (color-map construction and item mapping). The helper accepts `unknown` and extracts `.name` when the value is an object, returning `string | undefined`. `Timeline.tsx` and `TimelineTooltip.tsx` required no changes because they receive already-resolved strings via the `TimelineItem.metadata.pov` field.

---

## ~~Delete route uses hard-delete, not `softDeleteResource`~~ — RESOLVED

**Discovered during:** Task 8 (soft-delete — null `resource-ref` values project-wide)
**Resolved:** Follow-up pass after Task 10

The local `deleteResource` helper (using `fs.rmSync`) was removed from both `[resource-id]/route.ts` and `[resource-id]/delete/route.ts`. Both routes now call `softDeleteResource` from `trash.ts`, which moves files to `.trash/` for recoverability. The `nullifyResourceRefs` call still precedes the move in both routes. Unused `fs` and `path` imports were also removed from the dedicated delete route.

---

## ~~`MetadataValue` TypeScript type does not include `ResourceRef[]`~~ — RESOLVED

**Discovered during:** Task 10 (schema-driven sidebar rewrite)
**Resolved:** Follow-up pass after Task 10

`ResourceRef` and `ResourceRef[]` were added explicitly to the `MetadataValue` union in `types.ts`, matching the Zod schema. The `as MetadataValue` cast in `MetadataSidebar.tsx`'s resource-ref `onChange` handler was removed. All consumers of `MetadataValue` (`resourcesSlice`, sidecar read/write paths) were unaffected — the widened union is a strict superset.

---

## Schema manager: field KEY rename not implemented — deferred

**Discovered during:** Task 12 (schema manager UI component)

The `metadata-schema.ts` model comments reference a "rename-key flow (with orphan warning)" for the schema manager, and Task 12's spec notes that "field key slugs are validated on rename." However, no `rename-key` action exists in the API route (Task 5) or thunks (Task 6), so the schema manager only implements label rename (`renameMetadataField` → `rename-field` action).

Renaming a field's key would require:
1. A new `rename-key` action in `POST /api/project/metadata-schema` that: renames the key in the schema AND migrates all sidecar values from the old key to the new key project-wide.
2. A new `renameMetadataFieldKey` thunk in `projectsSlice`.
3. Slug validation (`/^[a-z0-9-]+$/`) on the new key.
4. A confirmation dialog in the schema manager warning that existing sidecar values stored under the old key will be migrated (or orphaned if migration fails).

Currently, the schema manager shows field keys as read-only metadata and does not allow key changes.
