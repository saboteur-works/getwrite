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

## Timeline components must handle `ResourceRef` POV values

**Discovered during:** Task 7 (`ResourceRef` type + lazy POV migration on first edit)

`TimelineView.tsx` (lines 44, 87) and `Timeline.tsx` (lines 135, 170, 177, 281) read `userMetadata.pov` with a `as string | undefined` cast and use it directly as a string key for color mapping, filter comparison, and tooltip display. After Task 7, a saved POV value is a `ResourceRef` object `{ id, name }`. Projects that have had their POV field edited since the migration will display `[object Object]` in the timeline color map and filter dropdowns.

**Recommended fix:** Before Task 10 ships, update `TimelineView.tsx` and `Timeline.tsx` to extract the `.name` field when the value is an object:

```ts
function resolvePovDisplay(pov: string | { name: string } | undefined): string | undefined {
    if (!pov) return undefined;
    if (typeof pov === "string") return pov;
    return pov.name;
}
```

Apply this helper wherever `userMetadata.pov` is read in the timeline stack.

**Affects:** `TimelineView.tsx`, `Timeline.tsx`, `TimelineTooltip.tsx`.
