# Dynamic Metadata Schema — Follow-up Work

## MetadataFieldSchema key regex rejects built-in camelCase keys

**Discovered during:** Task 2 (default built-in schema constant)

`MetadataFieldSchema` in `schemas.ts` enforces `/^[a-z0-9-]+$/` on the `key` field. This pattern rejects the camelCase built-in keys (`storyDate`, `storyDuration`, `storyEndDate`), which must remain camelCase to match existing sidecar file keys (backward compatibility).

This is latent until the first time a project's `metadataSchema` is persisted to `project.json` (e.g., after a user adds a custom field). On the next project load, `ProjectConfigSchema.safeParse()` will reject the stored schema, breaking schema reads for that project.

**Recommended fix:** Move the slug-pattern validation out of `MetadataFieldSchema` and into the Task 5 API route handler (`POST /api/project/metadata-schema`), where it can be applied only to user-created fields on write — not to the built-in fields that arrive via the default schema. The Zod schema itself should accept any non-empty string key so that persisted data (including legacy camelCase keys) round-trips cleanly.

**Affects:** Tasks 5 (API route) and any code that calls `MetadataSchemaSchema.safeParse()` or `ProjectConfigSchema.safeParse()` on a schema containing built-in fields.

---

## Task 6 must update `metadataSchema` in Redux state after API calls

**Discovered during:** Task 3 (Redux — store `metadataSchema` in `projectsSlice`)

Task 6 (schema CRUD thunks) will call `POST /api/project/metadata-schema` and receive the updated schema in the response. The thunk must write that schema back into `store.projects.projects[id].metadataSchema` so the sidebar and schema manager stay in sync without a re-fetch.

**Recommended fix:** When implementing Task 6, add a reducer action (or reuse `setProject`) that accepts the project ID and a new `MetadataSchema` and replaces only the `metadataSchema` field on the stored project. The async thunk should dispatch this action on a successful API response.

**Affects:** Task 6 (Redux async thunks for schema CRUD).
