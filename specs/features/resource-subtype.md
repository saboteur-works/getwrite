# Feature Spec: Resource subtype

> **Scope note:** this is larger than the 500-word guideline for a feature
> spec. It spans a project-config list, a sidecar key, a field-definition
> attribute, one new list editor in the existing Metadata settings tab, two
> new controls, and a pure visibility predicate, across the HTTP and native
> transports. It is one slice
> deliberately (feature-list entry, Feature 72): each piece alone leaves a
> control that changes nothing a writer can see. Source: Feature 72 in
> `specs/product/getwrite.features.md`; US-25, US-26, FR-57 to FR-61 and
> OQ-57 to OQ-66 in `specs/product/getwrite.md`. Provenance is marked
> throughout: **Owner decision** (ideation / Gate 1 / Gate 2 / Gate 3,
> 2026-10-08), **Verified** (read in code, file cited; code findings from
> triage were confirmed by the owner at Gate 3), **Inference** (mine, not
> established by an experiment). The identifiers `subtypes` (project config
> and project-type spec), `resourceSubtype` (sidecar) and `appliesTo`
> (field definition) are final (Owner decision, Gate 3, 2026-10-08). At Gate
> 3 the owner also reversed the Gate 1 decision on where the subtype list is
> edited: it is a new section of the existing Metadata tab, not a new tab.

## Overview

A writer can label each resource with one subtype they define themselves
(for example "Scene" or "Profile") and can restrict a custom metadata field
to particular subtypes, so a field that only makes sense for scenes stops
appearing in the sidebar of every other resource. Today the sidebar shows
every custom field on every resource; the only existing scoping is a
metadata group's optional `folderId`, which nothing in the product sets
(Verified: no UI, importer, project type or on-disk project creates one;
product spec OQ-64). This feature adds scoping by subtype instead of by
location, so moving a resource never changes its fields. The subtypes a
project knows are a per-project list edited in a new section of the existing
"Metadata" Project Settings tab (no new tab). Nothing existing changes: a field with no restriction shows
everywhere, a resource with no subtype sees only unrestricted fields, and
no project or resource is migrated. Values stored in fields that a subtype
hides are kept, not cleared.

## Goals

- A writer can define a project's list of subtypes (add, remove, reorder,
  duplicates rejected) in a new section of the Metadata Project Settings
  tab, and a project type can seed that list.
- A writer can set, change and clear one subtype on any text, image or audio
  resource from its metadata sidebar, choosing from that list.
- A writer can restrict a custom field to one or more subtypes in the schema
  manager, and the sidebar then shows that field only on resources whose
  subtype is in the restriction.
- Every existing project, field and resource behaves exactly as before, and
  nothing a subtype hides is deleted.
- A subtype added in the Metadata tab's subtype list is selectable in the
  sidebar and in the schema manager in the same session, without a reload.

## Non-goals

- Subtype is not location- or folder-based, not multi-valued, and has no
  catch-all or "general" subtype (Owner decisions, ideation; FR-57, FR-58).
- Subtype is not the entity declaration. `entityKind` is untouched and
  neither implies the other (Owner decision; FR-59).
- No rename operation. Renaming is remove plus add (Owner decision, OQ-60).
- Built-in (default-schema) fields cannot be restricted (Owner decision,
  OQ-63).
- Subtype is not selectable in the query builder or smart folders, and
  fields hidden by subtype stay queryable, unchanged (Owner decision,
  OQ-62).
- Organizer card body, Organizer filters and the Timeline are unchanged
  (Owner decision, OQ-66).
- The existing folder-scoped group mechanism (`MetadataGroupSchema.folderId`)
  is left exactly as it is and is not retired (Owner decision, OQ-64).
- Resource templates carrying subtype, and the duplicate/copy guarantee, are
  Feature 73 (FR-62), a separate later pass. See "Notes for adjacent work"
  for one observation about the copy path.
- No new Project Settings tab, no tab icon, and no change to the tab count,
  order or arrow-key behaviour (Owner decision, Gate 3, 2026-10-08, reversing
  Gate 1).
- No general fix to the shared sidebar save path for `entityKind`, `aliases`
  or `wordCountGoal`; FR-32 is scoped to the subtype write (Owner decision,
  Gate 3, 2026-10-08).
- The import pipelines (Scrivener, DOCX, plain text) never assign a
  subtype to a resource (Owner decision, OQ-65).
- No built-in project type gets a subtype list in this work (Owner
  decision, OQ-58).
- No block, confirmation, in-use count or cascade when removing a subtype
  that is still in use (Owner decision, OQ-60).
- No fix for lost updates when two list edits are issued before the first
  resolves; the existing relationship-types editor has the same exposure
  (Inference from `RelationshipTypesSettings.tsx`, which computes each write
  from the store's current list and updates the store only on fulfilment).

## User stories

- US-1: As a writer on deadline, I want to label a resource with one subtype of my own naming, chosen from a list I maintain, so that the project can tell what kind of thing each resource is without relying on where it sits in the tree. (Product US-25.)
- US-2: As a writer on deadline, I want to limit a custom metadata field to particular subtypes so that a field that only makes sense for scenes does not clutter other resources, while every field I have already defined keeps working as it does today. (Product US-26.)

## Functional requirements

FR-1: The project config MUST support an optional ordered list of subtype labels under the key `subtypes`. An absent list MUST be equivalent to an empty list, and the key MUST NOT be written to the `project.json` of any project that never sets it; `normalizeProjectConfig` MUST pass an absent value through as `undefined`, as it does for `relationshipTypes`, and MUST NOT default it to `[]`. The key MUST be added to every layer that would otherwise drop it: `ProjectConfigSchema` and the `ProjectConfig` type (`frontend/src/lib/models/schemas.ts`, `types.ts`), `normalizeProjectConfig` (`project.ts`, which builds an explicit object and omits unknown keys; it matters for project creation and seeding, `createProject`, and for server readers of `loadProjectConfig`; it is not on the client project-load path, because `loadProjectFromDisk` returns the raw `project.json`), `StoredProject` and `buildStoredProject` (`store/projectsSlice.ts`), and `ApiProjectConfigSchema` (`lib/api/schemas.ts`, whose omission of `mentionHighlightDurationSeconds` stripped that field on project load per its own comment). The key name is final (Owner decision, Gate 3, 2026-10-08); the `normalizeProjectConfig` relevance note is verified-in-code by triage, confirmed by the owner. [US-1] [US-2]

FR-2: A write of the subtype list MUST replace the whole array and MUST be rejected at the server boundary, leaving the stored list unchanged, when any entry is empty or whitespace-only after trimming, or when two entries are equal under the shared comparison key. The comparison key is the entry trimmed and then lowercased (Owner decision, Gate 3, 2026-10-08, resolving OQ-2), implemented once as an exported pure function (suggested `normalizeSubtypeLabel` in `frontend/src/lib/models/field-subtype-scope.ts`, which MUST NOT import from `schemas.ts`, to avoid a cycle) and used by every comparison in this feature: this duplicate check, FR-13's de-duplication, FR-18's matching, and the "is this value in the current list" tests in FR-10 and FR-16. The rejection MUST be implemented in the Zod schema for the list (for example `.trim()` plus a `.refine` on blank entries and on duplicates), not as a hand-thrown plain `Error`, because the route maps only `ZodError` to 400 and any other error to 500 (verified-in-code by triage, confirmed by the owner). Order MUST be preserved. Stored entries MUST be the trimmed text with the writer's original case. There is no server-side length limit (Owner decision, Gate 3); the 64-character input limit is UI-only (FR-24). This is stricter than relationship types, whose route only checks `z.array(z.string())` (`project-features.ts`) and whose duplicate check exists only in the client. [US-1] [US-2]

FR-3: The list MUST be persisted through the feature-config path that relationship types already use, so that the Metadata-tab list editor, the sidebar subtype control and the schema-manager restriction control all read the new list in the same session without a reload (Owner decision, Gate 3, 2026-10-08, resolving OQ-5; no new route, transport or native pair). The concrete edits, verified-in-code by triage and confirmed by the owner: the `subtypes` key on `FeatureConfigUpdate` and `FeatureConfigResult` (two copies, in `project-features.ts` and `feature-config-transport-service.ts`), `updateFeatureConfig` (`project-features.ts`), the route's request destructure, its "at least one of" guard and its error text (`app/api/project/features/route.ts`), `native-feature-config-backend.ts` where it forwards the update, a new `updateProjectSubtypes` thunk in `makeFeatureConfigThunk` form, the shared `fulfilled` handler in `projectsSlice.ts` that mirrors the returned list into the store, a new selector, and `StoredProject` and `buildStoredProject` (FR-1). All three consumers MUST read the list from the Redux project record via that selector, not from `AppShell`'s `project?.config` props, which are known not to refresh after some settings saves (`initialDailyWordGoal`, `initialWordCountGoal`; CLAUDE.md glossary). The native (Capacitor) transport MUST behave identically. [US-1] [US-2]

FR-4: When a list write fails, the visible list and the stored list MUST be unchanged and the writer MUST see an error toast. A locked or keyless encrypted project MUST fail closed (the existing 401/409 mapping of `isLockedAccessError` in `with-storage-context.ts`), never degrade to an empty list. A list that failed to load MUST NOT render as "no subtypes". The list editor MUST NOT clear its text input before the write resolves: `RelationshipTypesSettings.handleAdd` does, so a failed write there loses the typed text, and that behaviour is not to be copied (`docs/standards/failure-visibility.md`). [US-1] [US-2]

FR-5: A resource MUST be able to carry at most one subtype, stored as an optional top-level sidecar string under the key `resourceSubtype` (Owner decision, Gate 3, 2026-10-08), added to `ResourceBaseSchema` directly so that text, image and audio resources all have it. It MUST NOT be added to `EntitySidecarFieldsSchema` (which is spread into `ResourceBaseSchema`), so that it stays independent of the entity fields (FR-8). It MUST survive the project-load round trip: `loadProjectFromDisk` spreads the whole sidecar (`project-loader.ts`) and the client validates resources with `AnyResourceSchema` (`ProjectApiEntrySchema`), so a key missing from `ResourceBaseSchema` would be stripped on the client. The hand-written `ResourceBase` type in `types.ts` MUST also gain the field. [US-1]

FR-6: The sidecar key MUST NOT be able to collide with a custom field key. Verified: custom field keys must match `/^[a-z0-9-]+$/` at every creation and rename path (`addField` and `renameFieldKey` in `metadata-schema.ts`, `metadata-schema-dispatch-core.ts`, `AddFieldForm.tsx`, `SchemaManager.tsx`), and the built-in keys `storyDate`, `storyDuration`, `storyEndDate` are camelCase outside that grammar. The sidecar key `resourceSubtype` contains an uppercase letter and therefore cannot equal a validated custom key, which matters because both `query-evaluate-core.ts` and `field-values.ts` `flattenUserMetadata` spread `userMetadata` over top-level sidecar keys. A test MUST assert that adding or renaming a custom field to `resourceSubtype` is rejected. The `/^[a-z0-9-]+$/` rule does not hold in two cases that are stated here, not defended against: a `project.json` edited by hand (`MetadataFieldSchema.key` is only `min(1)`), and the `add-group` path, where a crafted API request can push a group carrying field keys that are never validated (the UI only ever sends empty groups). The `add-group` residual is verified-in-code by triage, confirmed by the owner. [US-1]

FR-7: A resource's subtype MUST be set through the existing `updateSidecar` path (`lib/api/resources.ts`, `updateSidecarCore`) and MUST be cleared through `clearKeys`: the key `resourceSubtype` MUST be added to `SIDECAR_CLEARABLE_KEYS` in `resource-crud-core.ts` (Verified: the allowlist is currently `entityKind`, `aliases`, `wordCountGoal`), because a key set to `undefined` is dropped by `JSON.stringify` before the HTTP body is sent. The clear MUST work on HTTP and on the native backend (`native-resource-backend.ts` forwards `clearKeys`). The server SHOULD reject a non-string or blank value for this key; `updateSidecarCore` validates no per-key values today, so this is a new check. [US-1]

FR-8: Setting, changing or clearing a subtype MUST NOT change the resource's `folderId`, `entityKind`, `aliases` or `dismissedNoiseTerms`, and moving a resource, declaring it an entity, un-declaring it, or running Remove Entity (which clears `entityKind` and `aliases`) MUST NOT change its subtype. Setting a subtype MUST NOT make a resource an entity. [US-1]

FR-9: The metadata sidebar MUST show a subtype control for every resource kind that has a metadata sidebar today (text, image, audio). The control MUST be a native `<select>` in house style (`LabeledField` plus a native select), rendered in its own `CollapsibleSection variant="sidebar"` placed above the schema field groups and below the image, audio and prose-diagnostics sections (Owner decision, Gate 3, 2026-10-08, resolving OQ-3). It MUST offer the project's list in list order plus an explicit first option "No subtype", and "No subtype" MUST be the state of a resource with no stored subtype. The copy strings ("Subtype", "No subtype") are working copy. `StatusSelector` is not a model for the unset state because it silently shows its first option when no value is stored. The control MUST be operable by keyboard and reachable by role and accessible name. [US-1]

FR-10: When a resource's stored subtype is not in the project list, the control MUST still display it, using the status roll-up wording `<value> (not in the current list)` (`status-rollup.ts` `unknownStatusLabel`, currently module-private, so it must be exported or the string shared). "In the current list" is decided under the shared comparison key (FR-2), so a stored "Scene" is not shown as stale when the list holds "scene". The writer MUST be able to clear it or choose a listed subtype. The stored value MUST NOT be altered by merely displaying it. [US-1]

FR-11: When the project list is empty and the resource has no subtype, the sidebar control MUST still be present, MUST be disabled, and MUST be accompanied by a hint paragraph reading "No subtypes yet. Add them in Project Settings, Metadata tab." (working copy; precedent `EntityRelationshipsSection.tsx`) (Owner decision, Gate 3, 2026-10-08, resolving OQ-3). When the list is empty but the resource carries a stored subtype, the control is enabled so the writer can clear it (FR-10). [US-1]

FR-12: A failed subtype write MUST revert the control to the stored value and show an error toast. It MUST NOT keep an optimistic value that was never saved. `EntitySection.tsx`'s `persist` swallows write failures and keeps the optimistic update; that behaviour is not to be copied here (`docs/standards/failure-visibility.md`). [US-1]

FR-13: A custom metadata field definition MUST support an optional restriction listing subtype labels under the key `appliesTo` (Owner decision, Gate 3, 2026-10-08) on `MetadataFieldSchema`, the `MetadataField` type, and `ApiMetadataFieldSchema` (which strips unknown keys on project load). A field with no restriction, or an empty restriction, MUST be unrestricted. An empty selection MUST be stored as the key's absence, not as `[]`. Entries are stored as the labels the writer chose, in the order chosen, with no duplicates under the shared comparison key (FR-2). [US-2]

FR-14: The schema manager MUST offer a restriction control on each custom field: a checkbox group (a `fieldset` with a `legend`, one checkbox per listed subtype, plus one checked row per stale label marked "(not in the current list)"), rendered as a conditional block in the custom field's row in `SchemaManager.tsx` (precedent: `EntityGraphSettingsPanel.tsx`) (Owner decision, Gate 3, 2026-10-08, resolving OQ-4). When the project list is empty, the block shows a hint reading "No subtypes yet. Add them in the Subtypes section above, in this Metadata tab." (working copy; the list editor is in the same tab, FR-24). The control MUST NOT be offered, or MUST be disabled with an explanation, on built-in fields. A built-in field MUST be identified by its key being in `DEFAULT_METADATA_SCHEMA` (`default-metadata-schema.ts`), not by `locked`: Verified, only `status` is still `locked`, because `migrateLockedBuiltins` strips `locked` from `synopsis`, `notes`, `pov`, `storyDate`, `storyDuration`, `storyEndDate`. The server-side action in FR-15 MUST reject a restriction on a built-in key. Consequence (Inference): a custom field a writer creates with a built-in key after deleting the built-in is treated as built-in. [US-2]

FR-15: Setting or clearing a field's restriction MUST be a new metadata-schema action carried through every layer an existing action uses: a model function under `withLockedSchema` (`metadata-schema.ts`), a `dispatchMetadataSchemaAction` case and request type (`metadata-schema-dispatch-core.ts`), the route's request union (`app/api/project/metadata-schema/route.ts`), the HTTP and native implementations in `metadata-schema-transport-service.ts` and `native-metadata-schema-backend.ts`, and a thunk mirrored into the store like the other schema thunks. It MUST reject a locked field and an unknown group or field, as `updateRefProperties` does. A failed restriction write MUST show an error toast or inline message and leave the displayed restriction unchanged: the existing schema thunks are dispatched with `void dispatch(...)` and show nothing on failure, and that is not to be copied (`docs/standards/failure-visibility.md`). [US-2]

FR-16: A restriction that names a label no longer in the project list MUST remain stored, MUST remain visible in the schema manager marked as not in the current list, and MUST be removable there, as a checked row marked "(not in the current list)" (FR-14). An empty project list MUST NOT prevent the writer from clearing an existing restriction. [US-2]

FR-17: Existing schema operations MUST preserve a field's restriction: rename label, rename key, reorder, change type (with and without migration), and options updates. Verified: `changeFieldType`, `renameFieldKeyInSchema` and `renameField` mutate the field object in place and the schema is read with `JSON.parse`, not a stripping Zod parse; this MUST be covered by tests. [US-2]

FR-18: Field visibility by subtype MUST be a pure function of the field definition and the resource's subtype, in its own unit-tested module (`frontend/src/lib/models/field-subtype-scope.ts`), alongside the exported normalization function of FR-2. Unrestricted returns true. Restricted with no subtype returns false. Restricted with a subtype returns true only when the subtype equals an entry of `appliesTo` under the shared comparison key (FR-2: trim, then lowercase). Matching MUST be by label and MUST NOT consult the project list. A restriction on a built-in key (possible only by hand-editing) MUST be ignored. Worked example: the list holds "Scene", a resource stores "Scene", and a field is restricted to "Scene"; the writer removes "Scene" and adds "scene". Everything still matches: the resource still sees the field, the sidebar select and the restriction checkbox both treat "Scene" as the listed "scene" and neither is shown as "not in the current list", and stored text keeps the casing the writer typed. [US-2]

FR-19: `MetadataSidebar.tsx` MUST apply the FR-18 predicate when choosing which fields of a group to render, in addition to, not instead of, the group-level `folderId` check and the feature-flag `isFieldVisible` check; all three MUST pass. The existing rule that a group with zero visible fields is omitted entirely (title included) MUST hold, so a group whose fields are all out of scope disappears. [US-2]

FR-20: The FR-18 predicate MUST NOT be applied to anything that reads stored values or definitions directly. Verified list of sites that stay unchanged: Organizer card body and filters (`cardBody.ts`, `organizerFilters.ts`, `OrganizerView.tsx`), `OrganizerCardBodySettings.tsx`, the Timeline, the query pipeline (`query-evaluate-core.ts`, `field-values.ts`, `FieldPicker.tsx` built from `AppShell`), saved queries, `entity-shared-metadata.ts` and `EntityGraphAccessibleList.tsx`, and the schema manager itself, which MUST list all fields regardless of any resource's subtype. A query on a field hidden by subtype MUST return the same results as before this feature. Verified: no component other than `MetadataSidebar.tsx` renders a per-resource editing control for custom fields. [US-2]

FR-21: Changing or clearing a resource's subtype MUST NOT modify its `userMetadata`. Values for fields that fall out of scope MUST remain in the sidecar, and MUST be shown again, unchanged, when the subtype is set back. [US-2]

FR-22: With no restrictions defined and no resource subtypes set, the sidebar MUST render exactly as it does before this feature, and loading a project MUST NOT write to `project.json` or any sidecar. No migration is added. [US-2]

FR-23: Removing a subtype from the project list MUST be allowed while resources or restrictions reference it, with no block, prompt or cascade. Resources and restrictions that carry the removed label MUST keep it and MUST still match each other (FR-18). Re-adding the same label MUST restore display with no other change. [US-1] [US-2]

FR-24: Project Settings MUST host the subtype list editor in the existing "Metadata" tab, as a new component (`SubtypesSettings`) rendered in the Metadata `TabsContent` panel directly above `<SchemaManager>` (Owner decision, Gate 3, 2026-10-08, reversing the Gate 1 decision for a new "Subtypes" tab; there is no new tab and no tab icon, OQ-6 is moot). Placement within the tab is the spec author's, not an owner decision, chosen because field restrictions pick from this list. Verified: the Metadata panel currently contains only `<SchemaManager onClose>`, whose own section renders a "Metadata Fields" header, then `ProjectFeatureToggles` (the built-in field toggles, which stay where they are), then the create-field form and the group and field list (`ProjectSettingsDialog.tsx`, `SchemaManager.tsx`). The editor MUST offer add (button and Enter), remove and move up/down, each with an accessible name that includes the subtype. A rejected duplicate or blank entry MUST show an error and MUST NOT change the list. The label input MUST have `maxLength={64}`, matching tag names (`TagsManagerModal.tsx`); this is UI-only, with no server-side length check (Owner decision, Gate 3, resolving the length half of OQ-2). The editor MUST NOT clear its input before the write resolves (FR-4). It MUST NOT be gated on the `entities` flag (unlike `RelationshipTypesSettings.tsx`) and MUST NOT live in the Entities tab. The Metadata panel stays force-mounted so the tab-switch behaviour is unchanged. [US-1] [US-2]

FR-25: Subtype MUST be always-on: no new project feature flag, and independent of the `entities` flag. [US-1] [US-2]

FR-26: A project type MAY seed a new project's subtype list. The `ProjectTypeSchema` (`.strict()`; `schemas.ts`) and the `ProjectTypeSpec` interface in `project-creator.ts` MUST accept an optional string array under the key `subtypes`, validated by the FR-2 rules, and `createProjectFromType` MUST copy it into the new project's config (and `normalizeProjectConfig` MUST not drop it). A spec without the key MUST produce a project without the key. No built-in project-type JSON is edited. `getwrite-config/templates/project-types/project-type.schema.json` MUST be left untouched (Owner decision, Gate 3, resolving OQ-7): nothing reads it, and it already lacks `statuses`, `relationshipTypes` and `wordCountGoal`, which is pre-existing drift this feature does not fix. This requirement covers `createProjectFromType` only: the DOCX and plain-text importers do not seed the subtype list (Owner decision, Gate 3, resolving OQ-8; see Out of scope). [US-1]

FR-27: The Scrivener, DOCX and plain-text import pipelines MUST NOT write a resource subtype; a test per pipeline MUST assert no created sidecar contains `resourceSubtype`. This requirement, not Feature 73, owns those tests. [US-1]

FR-28: A trashed-then-restored resource MUST keep its subtype (Inference: trash moves the sidecar intact, per `trash.ts` as documented in CLAUDE.md; to be confirmed by a round-trip test). Reindex MUST not clear or rewrite it. Compile and export MUST be unchanged (Verified: `compile-core.ts` and `export-core.ts` reference no `userMetadata` or sidecar metadata). [US-1]

FR-29: Every new component MUST ship with a Storybook story with `args`, and a `*.a11y.test.tsx` using `runAxe`: `SubtypesSettings` (empty, populated), the sidebar subtype control (no subtype, set, stale subtype, empty list), and the schema-manager restriction control (custom field, built-in field, stale label), per `docs/standards/storybook-implementation.md`, `testing.md` and `accessibility.md`. Nothing new MAY be coloured red, and `mid` MUST NOT be used for text. [US-1] [US-2]

FR-30: There is no new tab, so the Project Settings tab count stays at 10, and the tab order and arrow-key traversal are unchanged. `tests/projectSettingsDialog.test.tsx` (`toHaveLength(10)`) and `tests/projectSettingsDialogWritingGoalsTab.test.tsx` (the ordered tab-name list and arrow-key walk) MUST NOT be changed; a failure in either means the implementation added a tab by mistake, and the test is not to be "fixed". The in-app help MUST describe the subtype list: the "Project Settings tabs" tip card's Metadata entry in `components/help/help-content.ts` (currently "add, remove, and reorder metadata fields and groups, and turn the optional built-in fields on or off") and the "Metadata Fields manager" section of the Metadata help tab. Any test that pins the Metadata tab's contents MUST be checked; a read of `projectSettingsDialog.test.tsx` and `projectSettingsDialogWritingGoalsTab.test.tsx` found only tab-name references, and `projectSettingsDialogDailyGoal.test.tsx` and `frontend/stories/Layout/ProjectSettingsDialog.stories.tsx` were not read for this. [US-1] [US-2]

FR-31: A regression test MUST parse a representative `GET /api/projects` response containing the new config list, a field restriction and a resource subtype through the client response schemas and assert all three survive (the failure that Feature 71's config field hit). [US-1] [US-2]

FR-32: A subtype write MUST NOT be able to be undone by a later, unrelated sidebar edit. The subtype write MUST send only the `resourceSubtype` key to `updateSidecar` (or only `clearKeys: ["resourceSubtype"]` when clearing), never the whole resource. After a successful subtype write, both the Redux resource and whatever local copy the custom-field save path builds its payload from MUST reflect the new value. A regression test MUST prove: set subtype A, change to B, edit any custom field, and the stored subtype is B; and separately, set a subtype, clear it, edit any custom field, and the stored subtype is still absent. The hazard is a HYPOTHESIS from code reading, not a reproduced defect: triage read that a custom-field edit in the sidebar builds its payload from a local copy of the resource in `frontend/app/(app)/page.tsx` `updateResource` and sends the whole resource to `updateSidecar`, while sidebar sections such as `EntitySection` and `WordCountGoalSection` update only the Redux copy, so a later field edit could write a stale subtype back (Scene to Profile, then edit a field, and "Scene" returns; a cleared subtype could be resurrected). Implementation MUST first try to reproduce it, using an existing key such as `entityKind` (set it, edit a custom field, reload, check whether it reverted), and MUST record the result in the task list or feature documentation. If it does not reproduce, the regression test still stands. Fixing the shared save path generally (building the payload from Redux) for `entityKind`, `aliases` and `wordCountGoal` is out of scope here (see "Notes for adjacent work"). Owner decision, Gate 3, 2026-10-08 (scoped fix); the hazard itself is unverified. [US-1] [US-2]

## Open questions

None.

## Resolved questions (Gate 3, 2026-10-08)

All nine questions raised before Gate 3 were answered by the owner at Gate 3 on 2026-10-08. The decided behaviour is stated in the requirement text; this section keeps the history. Format follows the product spec's "OQ-n (resolved)" form.

- OQ-1 (resolved): What are the four identifiers? Resolution: `resourceSubtype` (sidecar key), `appliesTo` (field-definition key), `subtypes` (project-config key), `subtypes` (project-type spec key); the working-name hedging is dropped. Evidence: Owner decision, Gate 3, 2026-10-08, confirming recommendation (a). Impact: FR-1, FR-5, FR-6, FR-13, FR-26, FR-31.
- OQ-2 (resolved): What is the exact label rule? Resolution: one shared normalization, trim then lowercase, used for both duplicate rejection and matching (FR-2, FR-13, FR-18, and the "in the current list" tests); stored text keeps the writer's casing; a 64-character UI-only `maxLength` on the label input (FR-24), matching tag names, with no server-side length check and no 50-character cap. Evidence: Owner decision, Gate 3, 2026-10-08; `TagsManagerModal.tsx` uses 64. Impact: FR-2, FR-13, FR-18, FR-23, FR-24, FR-26.
- OQ-3 (resolved): What is the sidebar subtype control? Resolution: a native `<select>` (`LabeledField`) with a first "No subtype" option, in its own `CollapsibleSection variant="sidebar"` above the schema groups and below the image, audio and prose-diagnostics sections; disabled with a hint paragraph when the list is empty and the resource has no subtype. Copy is working copy. Evidence: Owner decision, Gate 3, 2026-10-08; precedent `EntityRelationshipsSection.tsx`. Impact: FR-9, FR-10, FR-11, FR-29.
- OQ-4 (resolved): What is the schema-manager restriction control? Resolution: a checkbox group (`fieldset` plus `legend`, one checkbox per listed subtype, plus a checked row per stale label marked "(not in the current list)") as a conditional block in each custom field's row; an empty list shows a hint pointing at the subtype list, which is in the same Metadata tab. Evidence: Owner decision, Gate 3, 2026-10-08; precedent `EntityGraphSettingsPanel.tsx`. Impact: FR-13, FR-14, FR-16, FR-29.
- OQ-5 (resolved): Reuse the relationship-types persistence path or add a new one? Resolution: reuse (`POST /api/project/features`, `updateFeatureConfig`, the feature-config transport and native backend, a `makeFeatureConfigThunk` thunk); no new route, transport or native pair. Evidence: Owner decision, Gate 3, 2026-10-08; the concrete edits were verified-in-code by triage, confirmed by the owner. Impact: FR-3, FR-4.
- OQ-6 (resolved, moot): Where does the Subtypes tab sit and what icon does it use? Resolution: moot. There is no new tab; the list editor lives in the existing Metadata tab (FR-24), reversing the Gate 1 decision for a dedicated "Subtypes" tab. Evidence: Owner decision, Gate 3, 2026-10-08. Impact: FR-24, FR-30 (tab count stays 10).
- OQ-7 (resolved): Should `project-type.schema.json` change? Resolution: no; it is left untouched and its existing drift is noted as pre-existing. Evidence: Owner decision, Gate 3, 2026-10-08; nothing reads the file. Impact: FR-26.
- OQ-8 (resolved): Should the DOCX and plain-text importers seed the subtype list? Resolution: no, out of scope (deferred): no built-in type ships a list, and those importers are documented as seeding `statuses` and `relationshipTypes` only. FR-26 covers `createProjectFromType` only. Evidence: Owner decision, Gate 3, 2026-10-08. Impact: FR-26, FR-27.
- OQ-9 (resolved): What does the sidebar "Add field" form do for a name matching a subtype-hidden field? Resolution: behaviour is left as it is (the form closes and nothing appears), the same silent no-op that already exists for flag-hidden and folder-scoped fields; the edge is recorded under adjacent work and the documentation. Evidence: Owner decision, Gate 3, 2026-10-08. Impact: FR-19.

## Out of scope (deferred)

- A rename operation for subtypes (renaming is remove plus add). Product spec, Out of Scope (Deferred).
- Restricting built-in (default-schema) fields by subtype.
- Making subtype selectable in the query builder and smart folders.
- Resource templates and duplicate/copy carrying subtype (Feature 73, FR-62).
- Which built-in project types should ship a subtype list (a deferred content decision).
- Bulk-assigning a subtype to many resources, and showing subtype on tree rows, Organizer cards or the Data view.
- An in-use count or confirmation when removing a subtype.
- Seeding the subtype list from a project type in the DOCX and plain-text importers (`import-docx-project.ts`, `import-plaintext-project.ts`). Deferred: no built-in project type ships a list, and those importers are documented as seeding `statuses` and `relationshipTypes` only (Owner decision, Gate 3, 2026-10-08, OQ-8). FR-26 covers `createProjectFromType` only.
- A general fix to the shared sidebar save path (see "Notes for adjacent work").
- Restricting a field at creation time from the sidebar "Add field" form (a new field there is unrestricted; restrict it afterward in the schema manager).

## Notes for adjacent work

- **Copy already carries subtype (Verified, Inference on consequence).** `copyResourceCore` (`resource-crud-core.ts`) clones the entire source sidecar (`{ ...sourceSidecar, id, name, createdAt }`) and `duplicateResource` (`resource-templates.ts`) does `{ ...meta, id }`. A new top-level sidecar key is therefore carried to a copy or duplicate with no code change, so once this ships a copied or duplicated resource already carries `resourceSubtype`, and Feature 73's copy/duplicate half needs only a test, not code (`copyResourceCore` backs both the HTTP copy route and `native-resource-backend`; `duplicateResource` is reached only by the CLI `templates duplicate`; verified-in-code by triage, confirmed by the owner). The template half is real work: `createResourceFromTemplate` builds from `tmpl.userMetadata` only, with no top-level keys, so the template scaffold (save and create) and the CLI `templates` commands must carry the key. This feature adds no code to either path, and the imports-never-set-it check is FR-27, not Feature 73.
- **Suspected pre-existing hazard, unverified.** The stale full-resource save described in FR-32 may already affect `entityKind`, `aliases` and `wordCountGoal`: the custom-field save path in `frontend/app/(app)/page.tsx` `updateResource` may send a whole, possibly stale, resource to `updateSidecar`. It has not been reproduced. Building that payload from Redux generally is out of scope here and is recorded for a separate pass.
- **Add-field edge (OQ-9).** Typing the name of a field that exists but is hidden on this resource by subtype closes the "Add field" form and shows nothing, the same silent no-op that already exists for flag-hidden and folder-scoped fields. Left as is by owner decision; to be recorded in the feature documentation.
- **Drift, pre-existing.** `getwrite-config/templates/project-types/project-type.schema.json` lacks `statuses`, `relationshipTypes` and `wordCountGoal`; left untouched (FR-26).
- **Docs the documentation stage will need to touch:** `CLAUDE.md` (Code Map entries for the new predicate module, sidecar key and config key; a "Resource subtype" glossary entry; the Project Settings tab list; the `clearKeys` allowlist sentence, which says only `entityKind`/`aliases` while the code also allows `wordCountGoal`); `docs/features/project-types.md` (the key list at line 36); `docs/features/project-configuration.md`; `docs/features/sidecars.md`; `docs/features/data/metadata.md`; a new `docs/features/resource-subtype.md` (including the OQ-9 add-field edge); in-app help (`help-content.ts`: the "Project Settings tabs" tip card's Metadata entry and the "Metadata Fields manager" section); the CLAUDE.md Project Settings tab description, which gains a subtype list in the Metadata tab (no new tab).
- **Existing tests and stories likely touched:** `tests/unit/project-type-validation.test.ts`, `tests/unit/project-creator.test.ts`, `tests/component/RelationshipTypesSettings.test.tsx` (as the model for the new editor's test), `tests/projectSettingsDialog.test.tsx` and `tests/projectSettingsDialogWritingGoalsTab.test.tsx` (re-run only; MUST NOT be edited, FR-30), `frontend/stories/Layout/ProjectSettingsDialog.stories.tsx` (Metadata tab now holds the list editor), `frontend/stories/Sidebar/MetadataSidebar.stories.tsx`, `frontend/stories/SchemaManager/SchemaManager.stories.tsx`, `frontend/stories/Preferences/RelationshipTypesSettings.stories.tsx` (as the model).
- **Observation, not a requirement:** `MetadataField.deprecated` is documented in `types.ts` as "hidden from the sidebar", but no filter on `deprecated` was found in `MetadataSidebar.tsx`, the only per-resource field-control site. Not relied on by this spec.
