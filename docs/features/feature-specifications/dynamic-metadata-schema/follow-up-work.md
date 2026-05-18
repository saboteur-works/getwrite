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

## Task 6 must update `metadataSchema` in Redux state after API calls

**Discovered during:** Task 3 (Redux — store `metadataSchema` in `projectsSlice`)

Task 6 (schema CRUD thunks) will call `POST /api/project/metadata-schema` and receive the updated schema in the response. The thunk must write that schema back into `store.projects.projects[id].metadataSchema` so the sidebar and schema manager stay in sync without a re-fetch.

**Recommended fix:** When implementing Task 6, add a reducer action (or reuse `setProject`) that accepts the project ID and a new `MetadataSchema` and replaces only the `metadataSchema` field on the stored project. The async thunk should dispatch this action on a successful API response.

**Affects:** Task 6 (Redux async thunks for schema CRUD).
