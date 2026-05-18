# Dynamic Metadata Schema — Implementation Tasks

### Task 1: Zod schema types for metadata schema

**What:** Define `MetadataFieldSchema`, `MetadataSchemaSchema`, and the `ResourceRef` value shape in `schemas.ts`, and extend `ProjectConfigSchema` with an optional `metadataSchema` field.
**Files:** `frontend/src/lib/models/schemas.ts`, `frontend/src/lib/models/types.ts`
**Done when:** `pnpm typecheck` passes; `MetadataFieldSchema`, `MetadataSchemaSchema`, and `ResourceRef` are exported; `ProjectConfigSchema` accepts `metadataSchema` without error.
**Depends on:** none
**Estimate:** 3
**Notes:** Field types enum: `text | number | date | boolean | select | multiselect | resource-ref`. Each field shape needs `key` (slug), `label`, `type`, `locked?: boolean`, `options?: string[]` (for select/multiselect), `multiple?: boolean` (for resource-ref), `folderId?: string` for folder-scoped groups. ResourceRef value: `{ id: string | null, name: string }`. `MetadataValue` in `schemas.ts` must be widened or a separate union added to accommodate the `{ id, name }` shape.
**Done:** [x]

---

### Task 2: Default built-in schema constant

**What:** Create `src/lib/models/default-metadata-schema.ts` exporting the seven locked built-in field definitions from ADR-015, typed against Task 1's schema types.
**Files:** `frontend/src/lib/models/default-metadata-schema.ts` (new)
**Done when:** File exports a typed `DEFAULT_METADATA_SCHEMA` constant containing exactly the seven fields (`synopsis`, `notes`, `status`, `pov`, `storyDate`, `storyDuration`, `storyEndDate`), all with `locked: true`, and `pnpm typecheck` passes.
**Depends on:** Task 1
**Estimate:** 2
**Notes:** This is a pure data constant — no filesystem I/O. Treat it as the authoritative source of the built-ins so the sidebar and the manager both import from one place.
**Done:** [x]

---

### Task 3: Redux — store `metadataSchema` in `projectsSlice`

**What:** Add a `metadataSchema` field to `StoredProject`, inject the default schema into Redux state when a project with no stored schema is loaded, and expose a selector for the active schema.
**Files:** `frontend/src/store/projectsSlice.ts`
**Done when:** After loading a project whose `project.json` has no `config.metadataSchema`, `store.getState().projects.projects[id].metadataSchema` equals the default schema; no write to disk occurs; `pnpm typecheck` passes.
**Depends on:** Tasks 1, 2
**Estimate:** 3
**Notes:** Injection must happen inside the existing project-load thunk or reducer, not in a new side-effect. The schema written to Redux on first load is ephemeral (in-memory only) until the user makes a schema change. If a project already has `config.metadataSchema` on disk, load that verbatim.
**Done:** [x]

---

### Task 4: Model layer — schema CRUD functions

**What:** Create `src/lib/models/metadata-schema.ts` with pure async functions that read, patch, and write `config.metadataSchema` inside `project.json` — covering add/remove/reorder groups, add/remove/reorder fields, rename fields, and update select options.
**Files:** `frontend/src/lib/models/metadata-schema.ts` (new)
**Done when:** Unit tests for each CRUD function (add field, remove field, reorder field, rename field, update options, add group, remove group, reorder group) pass; locked fields cannot be removed (function throws or returns error); `pnpm test:ci` passes.
**Depends on:** Task 1
**Estimate:** 3
**Notes:** Follow the pattern in `tags.ts` — read the JSON file, mutate the config block, write back. Use `locks.ts` for concurrent-write safety, consistent with existing API routes. Field `key` slugs must be validated as URL-safe (`/^[a-z0-9-]+$/`) on create.
**Done:** [x]

---

### Task 5: API route — `POST /api/project/metadata-schema`

**What:** Create a new API route that accepts action-discriminated requests (`add-field`, `remove-field`, `reorder-fields`, `rename-field`, `update-field-options`, `add-group`, `remove-group`, `reorder-groups`) and delegates to the Task 4 model functions.
**Files:** `frontend/app/api/project/metadata-schema/route.ts` (new)
**Done when:** Each action returns 200 with the updated schema on success, 400 for invalid input (locked field delete, bad slug), and 500 on filesystem error; `pnpm typecheck` passes.
**Depends on:** Tasks 1, 4
**Estimate:** 2
**Notes:** Follow the `tags/route.ts` action-dispatch pattern exactly. Return the full updated schema in every success response so the Redux thunk can replace state without a re-fetch.
**Done:** [x]

---

### Task 6: Redux — async thunks for schema CRUD

**What:** Add async thunks to `projectsSlice` (or a co-located transport service) that call the Task 5 route and update the `metadataSchema` in Redux state on success.
**Files:** `frontend/src/store/projectsSlice.ts` (or new `metadataSchemaSlice.ts` if scope warrants)
**Done when:** Dispatching any schema thunk (e.g., `addMetadataField`) calls the API, and on success updates `store.getState().projects.projects[id].metadataSchema` to the returned schema; failures surface an error but leave state unchanged; `pnpm typecheck` passes.
**Depends on:** Tasks 3, 5
**Estimate:** 3
**Notes:** Follow the transport-service/guards split used in `revisionsSlice`. Do not optimistically update state — wait for the API response (per the no-optimistic-sync architecture).
**Done:** [x]

---

### Task 7: `ResourceRef` type + lazy POV migration on first edit

**What:** Ensure `ResourceRef = { id: string | null, name: string }` is a named type in `types.ts`; implement the lazy POV migration: on the first edit of a `pov` field after schema migration, attempt UUID name-resolution against the configured characters folder; if no match, store `{ id: null, name: <originalString> }`.
**Files:** `frontend/src/lib/models/types.ts`, `frontend/components/Sidebar/controls/POVAutocomplete.tsx`
**Done when:** Submitting a POV value that exists in the characters folder stores `{ id: <uuid>, name: <string> }`; a value with no match stores `{ id: null, name: <value> }`; no change if the stored value is already a `ResourceRef` object; `pnpm typecheck` passes.
**Depends on:** Task 1
**Estimate:** 3
**Notes:** "First edit after migration" means: detect that the existing stored `pov` value is a plain string (legacy) rather than a ResourceRef object, then resolve on the next write. The resolution lookup is against `state.resources.resources` filtered by the POV folder, matching on `name`.
**Done:** [x]

---

### Task 8: Soft-delete — null `resource-ref` values project-wide

**What:** Extend the resource delete route to scan all sidecar files in the project after a soft-delete and replace any `resource-ref` field value containing the deleted resource's UUID with `{ id: null, name: <preserved name> }`.
**Files:** `frontend/app/api/resource/[resource-id]/delete/route.ts`, `frontend/src/lib/models/trash.ts` (or new helper)
**Done when:** After deleting resource B, all sidecar files in the same project that had a `resource-ref` value referencing B's UUID have `id: null` with B's name preserved; the sidecar files are valid JSON; `pnpm test:ci` passes including a new unit test for the nullification helper.
**Depends on:** Task 7
**Estimate:** 3
**Notes:** The delete route must know which schema fields are of type `resource-ref` to know which sidecar keys to patch. Pass the project root in the request body (already present for the existing delete route). Iterate `meta/*.meta.json` files. Use file locking. This must happen before the physical file move in `softDeleteResource`.
**Done:** [x]

---

### Task 9: New sidebar field controls (`NumberInput`, `BooleanToggle`, `SelectInput`, `ResourceRefInput`)

**What:** Create the four new control components needed for field types not yet covered by existing sidebar controls.
**Files:** `frontend/components/Sidebar/controls/NumberInput.tsx`, `BooleanToggle.tsx`, `SelectInput.tsx`, `ResourceRefInput.tsx` (new files)
**Done when:** Each component renders correctly in isolation, calls its `onChange` with the correct typed value, has a Storybook story, and `pnpm test:ci` passes for any new unit tests.
**Depends on:** Tasks 1, 7
**Estimate:** 5
**Notes:** `ResourceRefInput` renders a searchable autocomplete that looks up resources by name and stores a `ResourceRef`. It must support both single (`multiple: false`) and array (`multiple: true`) values. `SelectInput` is a dropdown; `BooleanToggle` is a checkbox or toggle. Reuse `useSyncedControlledValue` where appropriate.
**Done:** [x]

---

### Task 10: Rewrite `MetadataSidebar` as a schema-driven renderer

**What:** Replace all hardcoded field definitions and controls in `MetadataSidebar.tsx` with a loop over the active project schema, rendering the appropriate control component per field type.
**Files:** `frontend/components/Sidebar/MetadataSidebar.tsx`
**Done when:** The sidebar renders all seven built-in fields using schema data (no hardcoded field names remain in the component); adding a new field to the schema in Redux causes it to appear in the sidebar without a code change; existing sidecar values (synopsis, notes, status, pov, storyDate, storyDuration, storyEndDate) persist correctly through the render rewrite; `pnpm test:ci` and `pnpm typecheck` pass.
**Depends on:** Tasks 3, 9
**Estimate:** 5
**Notes:** Remove the existing `MetadataSidebarProps` callbacks (`onChangeSynopsis`, `onChangePOV`, etc.) and replace with a single generic `onChangeField(key: string, value: MetadataValue): void`. Group rendering by schema group. Folder-scoped groups: only render a group if the current resource's `folderId` matches the group's `folderId`.
**Done:** [x]

---

### Task 11: "Add field" shortcut in sidebar footer

**What:** Add a footer button to `MetadataSidebar` that dispatches a schema thunk to create a new unlocked text field and immediately focuses its input in the sidebar.
**Files:** `frontend/components/Sidebar/MetadataSidebar.tsx`
**Done when:** Clicking "Add field" creates a new field in the active schema (via Redux thunk), the new field appears in the sidebar, and its input element receives focus; `pnpm typecheck` passes.
**Depends on:** Tasks 6, 10
**Estimate:** 2
**Notes:** The new field needs a generated slug (`field-<timestamp>` or similar) and a placeholder label. The sidebar should scroll to and focus the new control after schema state updates.
**Done:** [x]

---

### Task 12: Schema manager UI component

**What:** Build a modal schema manager that lists all schema groups and fields, supports add/remove/reorder (via move-up/move-down buttons), rename fields inline, and edit select options — wired to the Task 6 thunks.
**Files:** `frontend/components/SchemaManager/SchemaManager.tsx` (new directory), accompanying Storybook story
**Done when:** All CRUD actions in the schema manager UI dispatch the correct Redux thunks and the sidebar reflects changes without a page reload; locked fields show no delete button; field key slugs are validated on rename; Storybook story renders in isolation; `pnpm typecheck` passes.
**Depends on:** Tasks 6, 9
**Estimate:** 5
**Notes:** Use the getwrite-component skill for this task. Follow the visual and interaction patterns of the tags manager or preferences panels. No drag-and-drop required — move-up/down buttons are sufficient. Surface a confirmation dialog on field key rename warning that existing values will become orphaned.
**Done:** [x]

---

### Task 13: Wire schema manager into settings menu

**What:** Add a "Metadata" menu item to `ShellSettingsMenu`, propagate `onOpenMetadataManager` through `ShellLayoutController` and `ShellModalCoordinator`, and mount the `SchemaManager` modal when triggered.
**Files:** `frontend/components/Layout/ShellSettingsMenu.tsx`, `ShellLayoutController.tsx`, `ShellModalCoordinator.tsx`
**Done when:** Clicking "Metadata" in the settings menu (only visible when a project is open) opens the schema manager modal; closing it returns focus to the triggering button; `pnpm typecheck` passes.
**Depends on:** Task 12
**Estimate:** 2
**Notes:** Follow the exact wiring pattern used for "Manage Tags" (`onOpenTagsManager`) — it is the closest structural analogue.
**Done:** [ ]

---

## Summary

- **Total tasks:** 13
- **Total estimated effort:** 41 story points
- **Critical path (sidebar render):** Tasks 1 → 7 → 9 → 10 → 11 (18 pts; note Task 11 also requires Task 6, which independently needs 1 → 4 → 5 → 6)
- **Critical path (schema management):** Tasks 1 → 4 → 5 → 6 → 12 → 13 (18 pts)
- Both critical paths are equal length and share only Task 1. They can proceed in parallel after Task 1 is complete.

### Risks

- **Task 10** (schema-driven sidebar rewrite) — highest regression risk; touches every existing field's save/load path. The existing E2E tests in `metadata-sidebar.e2e.spec.ts` will catch regressions but must be updated for the new prop signature.
- **Task 8** (soft-delete nullification) — scanning all sidecar files is unbounded work; a project with hundreds of resources could make the delete route noticeably slow. Measure before shipping.
- **Task 12** (schema manager) — largest UI surface; inline rename and reorder states are easy to get wrong. Budget time for iteration.
- **Task 1** (widening `MetadataValue`) — the `{ id, name }` ResourceRef shape does not fit the current `MetadataValue` union cleanly; widening it affects all Zod consumers project-wide. Audit call sites before merging.
