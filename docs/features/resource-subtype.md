# Resource subtype (developer)

Feature 72. Spec: [specs/features/resource-subtype.md](../../specs/features/resource-subtype.md). Task list with measured results: [specs/features/resource-subtype/tasks.md](../../specs/features/resource-subtype/tasks.md).

Purpose

A writer defines a per-project list of subtype labels (for example "Scene", "Chapter", "Interview"), gives each resource at most one of them, and can restrict a custom metadata field so it appears only on resources of chosen subtypes. The feature is always on: it has no feature flag and is not gated on the `entities` flag.

A subtype is none of the following, and shares no code path with any of them:

- Resource `type` (`text` / `image` / `audio`). `resourceSubtype` is a separate sidecar key, and it can be set on all three resource types.
- `entityKind`. Both are free-form strings on the sidecar, but `entityKind` declares an entity and `resourceSubtype` does not; setting one does not touch the other.
- Project type (the JSON spec under `getwrite-config/templates/project-types/`). A project type may seed the project's subtype list at creation, and that is the only relationship.

## Data model

Three new optional keys, all absent until used:

- `config.subtypes` in `project.json` (`ProjectConfigSchema`, `ProjectConfig`): ordered array of labels. Validated by `SubtypeListSchema` (`schemas.ts`): each entry is trimmed (the writer's case is kept), order is preserved, and a blank entry or two entries equal under `normalizeSubtypeLabel` fail validation with a `ZodError`. `normalizeProjectConfig` (`project.ts`) leaves the key off the result when absent rather than writing `undefined` or `[]`.
- `resourceSubtype` on the sidecar (`ResourceBaseSchema`, so text, image, and audio): a trimmed, non-empty string, at most one per resource.
- `appliesTo` on a custom metadata field definition (`MetadataFieldSchema`): optional array of labels. Absent or empty means unrestricted. An empty selection is stored as the key's absence, not `[]` (`updateFieldAppliesTo`, `metadata-schema.ts`).

The client response schemas in `frontend/src/lib/api/schemas.ts` declare `config.subtypes` and the field `appliesTo` as well, because those Zod objects strip undeclared keys.

### Matching: normalized label, not list membership

`frontend/src/lib/models/field-subtype-scope.ts` is a pure leaf module (it must not import `schemas.ts`, which imports it). It exports:

- `normalizeSubtypeLabel(label)`: trim, then lowercase. The one comparison key used everywhere.
- `isLabelInList(label, list)` and `dedupeSubtypeLabels(labels)` (keeps the first occurrence's text and order).
- `isFieldVisibleForSubtype(fieldKey, appliesTo, resourceSubtype)`: the field-visibility predicate. A built-in field key (membership in `DEFAULT_METADATA_SCHEMA`), or a field with absent/empty `appliesTo`, is always visible. A restricted field is visible only when the resource has a subtype equal to an `appliesTo` entry under the comparison key; a resource with no subtype does not see a restricted field. The predicate never consults the project's subtype list.

Worked example: the project list is `["Scene"]`, a custom field "Mood" has `appliesTo: ["scene"]`, and a resource has `resourceSubtype: "SCENE"` (stored trimmed, case kept). Mood is shown for that resource, because `normalizeSubtypeLabel("SCENE")` and `normalizeSubtypeLabel("scene")` are both `"scene"`. The sidebar select shows "Scene" (the list's spelling) for it. If the project list is later emptied, Mood is still shown for that resource, because visibility compares the resource's subtype to the field's `appliesTo`, not to the list.

## Where it persists

No new route, transport module, or native backend pair was added. Everything rides existing paths.

- The subtype list: `POST /api/project/features` (`app/api/project/features/route.ts`) calls `updateFeatureConfig` (`project-features.ts`), which parses `subtypes` with `SubtypeListSchema` under the project lock and replaces the list wholesale. A blank or duplicate entry throws `ZodError`, which the route returns as 400. Client side: `feature-config-transport-service.ts`, the thunk `updateProjectSubtypes` and the selector `selectActiveProjectSubtypes` in `store/projectsSlice.ts`. The selector returns a shared empty array when no list is set; a failed write never reaches the store.
- A resource's subtype: the existing `updateSidecar` path (`lib/api/resources.ts` into `updateSidecarCore`, `resource-crud-core.ts`). `resourceSubtype` is in `SIDECAR_CLEARABLE_KEYS`, so clearing sends `clearKeys: ["resourceSubtype"]`. A present key whose value is not a string, or is blank after trimming, throws `InvalidResourceSubtypeCoreError`, mapped to HTTP 400 in `app/api/resource/[resource-id]/sidecar/route.ts`; a stored value is trimmed.
- A field's restriction: a new metadata-schema action `update-field-applies-to`, through `updateFieldAppliesTo` (`metadata-schema.ts`), `metadata-schema-dispatch-core.ts`, `app/api/project/metadata-schema/route.ts`, `metadata-schema-transport-service.ts` (`postUpdateFieldAppliesTo`), and `native-metadata-schema-backend.ts`; thunk `updateMetadataFieldAppliesTo`. The model function throws for a built-in key (identified by membership in `DEFAULT_METADATA_SCHEMA`, not by `locked`), and also for a `locked` field, a missing group, or a missing field. The route maps a message containing "built-in", "locked", "not found", or "must be an array of strings" to 400; the dispatch core rejects an `appliesTo` that is not an array of strings.
- Project-type seeding: `ProjectTypeSchema` accepts `subtypes` (validated by `SubtypeListSchema`) and `createProjectFromType` (`project-creator.ts`) copies it into the new project's config only when the spec defines it. No built-in project type ships a list.

## User-facing behaviour

- Subtype list editor: `frontend/components/preferences/SubtypesSettings.tsx`, rendered in the existing Metadata tab of `ProjectSettingsDialog.tsx`, directly above `<SchemaManager>`. There is no new tab. Add, remove, and reorder (move up / move down buttons) each send the complete new array. The input has `maxLength` 64 (UI-only limit). A blank or case-insensitive duplicate draft is rejected in the form before any request. The draft text is cleared only after the write resolves, so a failed write keeps what was typed and shows an error toast. Removal is never blocked or confirmed.
- Resource control: `frontend/components/Sidebar/SubtypeSection.tsx`, rendered by `MetadataSidebar.tsx` inside a `CollapsibleSection` titled "Subtype", after the image/audio/prose-diagnostics sections and above the schema groups. A native `<select>` with "No subtype" first, then the project list in order. Redux is updated only after the sidecar write resolves; a rejected write leaves the stored value and shows the toast "Couldn't save the subtype". The write payload contains only the subtype key (a clear is an empty payload plus `clearKeys`), so it cannot write other fields from a stale copy.
- Field restriction: `SchemaManager.tsx` renders an "Applies to subtypes" `fieldset` of checkboxes under each custom (non-built-in) field: the project's subtypes in list order, plus one checked row, marked "(not in the current list)", for each stored label the list no longer holds. Each toggle awaits the write; on failure a toast shows and the display reverts to the stored restriction. Built-in fields get no control.
- Hiding: `MetadataSidebar.tsx` filters each group's fields through `isFieldVisibleForSubtype` in addition to the existing `isFieldVisible` check. It is the only non-test consumer of the predicate; the schema manager and the other two components import only the normalization helpers. Hiding is display-only: values stay in `userMetadata` and reappear unchanged when the subtype matches again.
- In-app help: `frontend/components/help/help-content.ts` has a "Subtypes and field restriction" section in the Metadata help tab, and the Metadata entry in the Project Settings tab list mentions the subtype list.

## Edge cases

- Stale label on a resource: if the stored `resourceSubtype` matches no list entry under the comparison key, the select shows it as `<value> (not in the current list)` (via `unknownStatusLabel`, exported from `status-rollup.ts` for this) and it can be cleared. Displaying it writes nothing.
- Empty list: with no subtypes defined and none stored, the select is disabled and a hint reads "No subtypes yet. Add them in Project Settings, Metadata tab." With no list but a stored value, the select is enabled and shows the stale label.
- Removing a subtype from the list: resources and `appliesTo` entries that use it keep it; nothing is rewritten. Re-adding the label (any case) makes it current again.
- No rename: there is no rename operation. Changing a label means removing it and adding a new one, which leaves existing references as stale labels.
- Case-insensitive matching: see the worked example above. The first-entered spelling is what the list stores and displays; `dedupeSubtypeLabels` keeps the first occurrence.
- Folder-scoped groups: a group with a `folderId` is still filtered by the existing folder check in `MetadataSidebar.tsx`, before and independently of the subtype predicate. The feature does not touch that logic.
- Hidden fields stay queryable and stay visible on Organizer cards. This follows from the predicate being applied only in `MetadataSidebar.tsx`: the query evaluator takes no metadata schema, and no Organizer code references subtypes. A unit test (`query-evaluator.test.ts`, "FR-20") shows that an `eq`/`gte` query returns the same results with and without `resourceSubtype` on the resources. Not exercised by any test I found: Organizer card rendering of a subtype-hidden field.
- Subtype in the query builder: `resourceSubtype` is not offered. No query-builder or intrinsic code references the key (`grep` of `frontend/src`, `frontend/components`, `frontend/app` finds it only in the files named in this document). The evaluator test above does show that an AST naming `resourceSubtype` as a raw field key matches stored values, so a hand-written query would work at the evaluator level.
- "Add field" silent no-op: in the sidebar's "Add field" form, typing the name of a field that exists but is hidden on this resource by subtype closes the form and shows nothing, the same silent no-op that the spec records for flag-hidden and folder-scoped fields. It was left as is by owner decision (spec OQ-9). This document records it from the spec and task list; I did not re-measure it in the running app.
- Trash: a resource's `resourceSubtype` survives soft delete and restore, including a restore relocated to the project root (`trash-restore.test.ts`, `trash-folder-restore.test.ts`).
- Built-in fields: cannot be restricted, in the UI (no control) or the model (`updateFieldAppliesTo` throws).

## The `page.tsx` overlay and the stale-copy measurement

`frontend/app/(app)/page.tsx` `updateResource` builds a whole-resource payload from page-local resource copies. The sidebar's subtype control writes through `updateSidecar` and Redux, not through those copies, so a later custom-field save could carry an older `resourceSubtype`. `updateResource` therefore wraps the updater in `applyUpdate`, which overlays the selected resource's current Redux `resourceSubtype` (or deletes the key when Redux has none) onto the result for that resource. It reconciles only the subtype key.

Measured at the request-payload level (`frontend/tests/page-stale-sidecar-save.test.tsx`, Task 2 in the task list, with `updateSidecar` mocked): after setting `entityKind` through `EntitySection` and then editing a custom field, the second `updateSidecar` payload did not contain `entityKind`, while the Redux resource held both changes. The same shape of payload is possible for `aliases` and `wordCountGoal`; only `entityKind` was measured. This was deliberately not fixed. A cause is not established (it is a hypothesis from code reading that the page-local copies are stale), and what the server stores after the second call was not measured, because `updateSidecar` was mocked.

## Out of scope

- Renaming a subtype (see above).
- Restricting built-in fields.
- Offering subtype in the query builder.
- Importers: the DOCX, plain-text, and Scrivener importers do not seed `config.subtypes` and never set a resource's subtype (each importer's integration test was extended to assert that no written resource sidecar contains `resourceSubtype`; the tests do not assert anything about `config.subtypes`).
- Resource templates and subtype-based defaults: Feature 73.
- `getwrite-config/templates/project-types/project-type.schema.json` is deliberately untouched; it already lacked `statuses`, `relationshipTypes`, and `wordCountGoal` (pre-existing drift), and does not list `subtypes`. The runtime validator is the Zod `ProjectTypeSchema`.

## Known limitations / not verified

- Storybook story tests (`pnpm test-storybook`) for the new and changed stories were not run: they need a Storybook server and a Playwright browser, which do not run inside the sandbox. The new stories are `Preferences/SubtypesSettings`, `Sidebar/SubtypeSection`, and additions to the `SchemaManager`, `MetadataSidebar`, and `ProjectSettingsDialog` stories.
- The server-side effect of the stale-payload measurement above was not measured.
- UI copy strings (the hint, toasts, "No subtype", "Applies to subtypes", help text) are working copy, not yet user-confirmed.
- The "Add field" no-op and Organizer card behaviour are described from the spec and code reading, not from a running-app check.
