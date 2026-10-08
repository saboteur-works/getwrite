# Tasks: Resource subtype (Feature 72)

Source spec: `specs/features/resource-subtype.md` (FR-1..FR-32, final, owner-approved at Gate 3, 2026-10-08; no open questions). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.md` US-25, US-26, FR-57..FR-61; `specs/product/getwrite.features.md` Feature 72.

**Repo rules every task inherits (the implementor sees only its own task plus the spec):**
- TDD: write the tests first, observe them fail, then make them pass. Add to an existing test file before creating a new one (`docs/standards/testing.md`). Tests live in `frontend/tests/`.
- No `any`; explicit types (`docs/standards/typescript-implementation.md`).
- Never invent component props: open the component source and its `*.stories.tsx` first. Use the `getwrite-component`, `getwrite-redux-slice` and `getwrite-api-route` skill conventions for new components, thunks and route changes.
- Red is reserved (never for actions or alerts); `mid` is never used for text.
- Failures must not render as absence (`docs/standards/failure-visibility.md`).
- Run commands from `frontend/` (`pnpm typecheck`, `pnpm lint`, `pnpm test:ci`). Run a single test file with `pnpm exec vitest run <path>`.
- Do NOT commit and do NOT push; the orchestrator commits.
- Do NOT edit `frontend/tests/projectSettingsDialog.test.tsx` or `frontend/tests/projectSettingsDialogWritingGoalsTab.test.tsx` (FR-30). If either fails, the implementation added a tab by mistake.
- Do not write documentation (CLAUDE.md, `docs/features/`); a separate documentation stage follows. The in-app help (Task 13) is the only documentation-like deliverable.
- Identifiers are final: `subtypes` (project config and project-type spec), `resourceSubtype` (sidecar), `appliesTo` (field definition), shared helper `normalizeSubtypeLabel` in `frontend/src/lib/models/field-subtype-scope.ts`.

### Task 1: Pure subtype-scope module (normalization and visibility predicate)
**What:** Create the pure module exporting `normalizeSubtypeLabel` (trim, then lowercase) and the field-visibility predicate, with unit tests.
**Files:** `frontend/src/lib/models/field-subtype-scope.ts` (NEW), `frontend/tests/unit/field-subtype-scope.test.ts` (NEW), reads `frontend/src/lib/models/default-metadata-schema.ts` (`DEFAULT_METADATA_SCHEMA`) and `frontend/src/lib/models/types.ts` (`MetadataField`).
**Done when:** `pnpm exec vitest run tests/unit/field-subtype-scope.test.ts` passes with cases: `normalizeSubtypeLabel("  Scene ")` equals `"scene"`; unrestricted field (no `appliesTo`, or `[]`) is visible for any subtype and for none; restricted field with no subtype is not visible; restricted field is visible only when the resource subtype equals an entry under the normalization key (case and surrounding-whitespace insensitive); matching does not take the project list as input; a restriction on a built-in key (key in `DEFAULT_METADATA_SCHEMA`) is ignored (field visible); the FR-18 worked example (list "Scene" replaced by "scene", resource stores "Scene", field restricted to "Scene") still matches. The module does not import from `schemas.ts` (verify with grep). `pnpm typecheck` is clean.
**Depends on:** none
**Estimate:** 2
**Notes:** Satisfies FR-2 (comparison key), FR-18. The predicate should take the field's `key` and `appliesTo` plus the resource's optional subtype as plain arguments so it has no dependency on `types.ts` beyond a type import (type-only import of `MetadataField` from `types.ts` is acceptable; `types.ts` does not import `schemas.ts` values). Also export a small helper for "is this label in this list under the comparison key" (used by FR-10, FR-16) and one for de-duplicating a label array under the key (FR-13).
**POS:** task_b06fed09
**Done:** [x]

### Task 2: FR-32 reproduction of the stale full-resource sidecar save (measurement only)
**What:** Write a test that measures, with the existing `entityKind` key, whether a Redux-only sidecar update followed by a custom-field edit sends a stale whole resource to `updateSidecar`, and record exactly what was observed.
**Files:** `frontend/tests/page-stale-sidecar-save.test.tsx` (NEW; model on `frontend/tests/component/page-default-revision-name.test.tsx` and `page-delete-failure.test.tsx` for mounting `frontend/app/(app)/page.tsx`), reads `frontend/app/(app)/page.tsx` (`updateResource`, ~:449-500), `frontend/components/Sidebar/EntitySection.tsx`, `frontend/components/Sidebar/MetadataSidebar.tsx`. The result is recorded in this task's Notes in `specs/features/resource-subtype/tasks.md` (edit only this Notes paragraph) and in the test file's header comment.
**Done when:** `pnpm exec vitest run tests/page-stale-sidecar-save.test.tsx` passes. The test mounts the page with a mocked `updateSidecar` (`lib/api/resources.ts`) and a project with one text resource and one custom text field, then: (1) sets `entityKind` through `EntitySection` (Redux-only local update plus its own `updateSidecar` call), (2) edits the custom field value through `MetadataSidebar` (the `page.tsx` `updateResource` path), (3) inspects the payload of the second `updateSidecar` call. Outcome is recorded as exactly one of: REPRODUCED (the second payload carries a stale or absent `entityKind`, i.e. differs from what step 1 set), NOT REPRODUCED (the second payload carries the `entityKind` set in step 1), or INCONCLUSIVE with the reason. The assertion in the committed test pins whichever outcome was observed, with a comment stating it is a measurement of current behaviour. Notes below are filled in with the observed payloads. `pnpm typecheck` and `pnpm lint` are clean for the file.
**Depends on:** none
**Estimate:** 3
**Notes:** Satisfies FR-32 (reproduction half). The hazard is a hypothesis from code reading, not an established defect; state what was observed and name no cause. Do not fix anything here (a general save-path fix is out of scope). If the page cannot be mounted in jsdom with the existing helpers, say so in the Notes and fall back to driving the `MetadataSidebar` `onUpdateResource` prop wiring as `page.tsx` builds it; report which was used. Task 11 reads this result.
**Measured result (Task 2, 2026-10-08): REPRODUCED**, by this task's payload-level definition. Mounted the full page (real `page.tsx`, `AppShell`, `MetadataSidebar`, `EntitySection`; mocked `StartPage`, `TipTapEditor`, `openProject`, `updateSidecar`), so the fallback was not used. Project had `features.entities` on, one text resource `res-1`, one custom text field `mood`. Step 1, typing "character" into the entity-kind input, gave `updateSidecar("res-1", "proj-dir-id", { id: "res-1", name: "Chapter One", type: "text", folderId: null, orderIndex: 0, userMetadata: {}, entityKind: "character" }, undefined)`. Step 2, typing "calm" into `mood`, gave `updateSidecar("res-1", "proj-dir-id", { id: "res-1", name: "Chapter One", type: "text", folderId: null, orderIndex: 0, userMetadata: { mood: "calm" } })`, with no `entityKind` key. The Redux resource after both calls held `entityKind: "character"` and `userMetadata: { mood: "calm" }`. Not measured: what the server stores after the second call, because `updateSidecar` was mocked; no cause is asserted. Test: `frontend/tests/page-stale-sidecar-save.test.tsx`, which pins these payloads.
**POS:** task_d498ae1f
**Done:** [x]

### Task 3: Model-layer schema and type plumbing, project-type seeding
**What:** Add `subtypes`, `resourceSubtype` and `appliesTo` to the Zod schemas, types, `normalizeProjectConfig` and project-type seeding, with the FR-2 rejection rules in Zod.
**Files:** `frontend/src/lib/models/schemas.ts` (`ProjectConfigSchema`, `ResourceBaseSchema` (not `EntitySidecarFieldsSchema`), `MetadataFieldSchema`, `ProjectTypeSchema`; export a reusable `SubtypeListSchema`), `frontend/src/lib/models/types.ts` (`ProjectConfig`, hand-written `ResourceBase`, `MetadataField`), `frontend/src/lib/models/project.ts` (`normalizeProjectConfig`), `frontend/src/lib/models/project-creator.ts` (`ProjectTypeSpec`, `createProjectFromType`), tests: `frontend/tests/unit/project-type-validation.test.ts`, `frontend/tests/unit/project-creator.test.ts`, `frontend/tests/unit/project.test.ts`, `frontend/tests/unit/metadata-schema.test.ts` (all existing; extend), plus an existing schemas test file found by grep (`grep -l "ResourceBaseSchema\|AnyResourceSchema" frontend/tests -r`).
**Done when:** tests written first, then green: `SubtypeListSchema` trims entries, preserves order and case, and throws `ZodError` for a blank or whitespace-only entry and for two entries equal under `normalizeSubtypeLabel`; `ProjectConfigSchema` accepts and omits `subtypes`; `normalizeProjectConfig` passes absent `subtypes` through as `undefined` (key not present on the result) and passes a list through; `ResourceBaseSchema` and `AnyResourceSchema` keep `resourceSubtype` for text, image and audio resources and `EntitySidecarFieldsSchema` does not declare it; `MetadataFieldSchema` keeps `appliesTo` as an optional string array; `ProjectTypeSchema` (strict) accepts an optional `subtypes` validated by the same rules and rejects duplicates; `createProjectFromType` copies `subtypes` into the new project's config, and a spec without the key yields a `project.json` config without the key; FR-6 test: `addField` and `renameFieldKey` in `metadata-schema.ts` (and the dispatch-core equivalents) reject the key `resourceSubtype`. `pnpm typecheck` clean; no built-in project-type JSON and not `getwrite-config/templates/project-types/project-type.schema.json` is modified (`git diff --stat` shows neither).
**Depends on:** 1
**Estimate:** 3
**Notes:** Satisfies FR-1 (model layer), FR-2 (Zod rejection), FR-5, FR-6, FR-13 (schema/type half), FR-26. Task 5 and Task 4 handle the other layers that drop unknown keys (store, client response schemas). The rejection MUST be a `ZodError` (the route maps only `ZodError` to 400). `resourceSubtype` is a trimmed non-empty string on the sidecar schema. This task owns `schemas.ts` and `types.ts` for the whole feature; no later task edits them.
**POS:** task_dfa60f79
**Done:** [x]

### Task 4: Client response schemas and the survive-round-trip regression test
**What:** Add `subtypes`, `appliesTo` and `resourceSubtype` to the client response schemas and prove all three survive a representative `GET /api/projects` parse.
**Files:** `frontend/src/lib/api/schemas.ts` (`ApiProjectConfigSchema`, `ApiMetadataFieldSchema`, and the resource element path via `ProjectApiEntrySchema`/`AnyResourceSchema`), `frontend/tests/unit/transport-validation.test.ts` or the existing test that already parses `ProjectApiEntrySchema` (find with `grep -rl "ProjectApiEntrySchema" frontend/tests`; extend it rather than adding a file).
**Done when:** a test parses a representative `GET /api/projects` response containing `config.subtypes`, a custom field with `appliesTo`, and a resource with `resourceSubtype` through the client response schemas and asserts all three values are present in the parsed output (verified failing before the schema edits); a project without any of the three parses with none of the keys added. `pnpm typecheck` clean.
**Depends on:** 3
**Estimate:** 2
**Notes:** Satisfies FR-1 (client response schema), FR-5, FR-13, FR-31. Prior art: `ApiProjectConfigSchema` omitted `mentionHighlightDurationSeconds` and stripped it on load (see its comment). This task owns `lib/api/schemas.ts` for the feature.
**POS:** task_94db523f
**Done:** [x]

### Task 5: Persist and mirror the subtype list through the feature-config path
**What:** Carry `subtypes` through `updateFeatureConfig`, the route, both transports and the Redux store with a new thunk, record field and selector.
**Files:** `frontend/src/lib/models/project-features.ts` (`FeatureConfigUpdate`, `FeatureConfigResult`, `updateFeatureConfig`), `frontend/app/api/project/features/route.ts` (request destructure, "at least one of" guard and message), `frontend/src/store/feature-config-transport-service.ts` (two-copy types), `frontend/src/store/transport/native-feature-config-backend.ts`, `frontend/src/store/projectsSlice.ts` (`StoredProject`, `buildStoredProject`, new `updateProjectSubtypes` via `makeFeatureConfigThunk`, the shared `fulfilled` handler, new `selectActiveProjectSubtypes`), tests: `frontend/tests/unit/project-features.test.ts`, `project-features-route.test.ts`, `feature-config-transport-service.test.ts`, `native-feature-config-backend.test.ts`, `projects-slice-features.test.ts` (all existing; extend).
**Done when:** tests first, then green: `updateFeatureConfig` with a valid list replaces the stored array in order with trimmed entries; a blank or duplicate entry (case-insensitive) makes the route return 400 and leaves `project.json` unchanged; a locked or keyless project maps to 401/409 and does not degrade to an empty list; the route's guard accepts a body carrying only `subtypes`; the native backend forwards `subtypes` and returns the same result as HTTP for the same fixture; `updateProjectSubtypes` fulfilled mirrors the returned list into `projects[id].subtypes`, rejected leaves the stored list untouched; `selectActiveProjectSubtypes` returns `[]` for an absent list but the load path (`buildStoredProject`) preserves `config.subtypes` as `undefined` when absent; no `subtypes` key is written to `project.json` of a project that never sets it. `pnpm typecheck` clean.
**Depends on:** 3
**Estimate:** 5
**Notes:** Satisfies FR-1 (store layer), FR-2 (server boundary), FR-3, FR-4 (store/server half; the UI half is Task 9). Reuse `SubtypeListSchema` from Task 3. Model the code on the `relationshipTypes` equivalents in each file (`updateProjectRelationshipTypes`, `selectActiveProjectRelationshipTypes`). The selector must distinguish "list failed to load" from "no subtypes" only to the extent the project record exists; do not default silently on a missing project record in a way that hides a load failure. This task owns `projectsSlice.ts` until Task 7 (chained).
**POS:** task_4c50e6ca
**Done:** [x]

### Task 6: Sidecar subtype set, clear and independence tests
**What:** Make `resourceSubtype` a clearable sidecar key with value validation and prove set/clear/independence on HTTP and native paths.
**Files:** `frontend/src/lib/models/resource-crud-core.ts` (`SIDECAR_CLEARABLE_KEYS`, `updateSidecarCore` value check), `frontend/src/store/transport/native-resource-backend.ts` (read only to confirm `clearKeys` is forwarded; edit only if not), tests: `frontend/tests/unit/resource-sidecar-route.test.ts`, `frontend/tests/unit/resource-crud-core-locked-sidecar.test.ts`, `frontend/tests/unit/native-resource-backend.test.ts` (existing; extend), `frontend/tests/unit/resource-crud-core-entity-graph-position.test.ts` (read for the entityKind-clear fixture pattern).
**Done when:** tests first, then green: `updateSidecarCore` with `resourceSubtype: "Scene"` persists the trimmed string; `clearKeys: ["resourceSubtype"]` deletes the key from the persisted sidecar (no `undefined`-valued key), on the HTTP route and through `native-resource-backend`; a non-string or blank `resourceSubtype` is rejected with a 400-mapped error and the sidecar is unchanged; `clearKeys` naming any key outside the allowlist still throws `InvalidClearKeysCoreError`; FR-8 independence: setting, changing and clearing the subtype leaves `folderId`, `entityKind`, `aliases` and `dismissedNoiseTerms` byte-identical, and clearing `entityKind` and `aliases` (the Remove Entity path via `clearKeys`) leaves `resourceSubtype` unchanged, and setting a subtype does not add `entityKind`. `pnpm typecheck` clean.
**Depends on:** 3
**Estimate:** 3
**Notes:** Satisfies FR-7, FR-8. The allowlist currently reads `entityKind`, `aliases`, `wordCountGoal`.
**POS:** task_5ee42e9a
**Done:** [x]

### Task 7: Field-restriction schema action, end to end below the UI
**What:** Add a "set or clear a field's subtype restriction" metadata-schema action through model, dispatch core, route, both transports and a store thunk.
**Files:** `frontend/src/lib/models/metadata-schema.ts` (new function under `withLockedSchema`), `frontend/src/lib/models/metadata-schema-dispatch-core.ts` (request type + case), `frontend/app/api/project/metadata-schema/route.ts` (request union), `frontend/src/store/metadata-schema-transport-service.ts` (HTTP and native resolution), `frontend/src/store/transport/native-metadata-schema-backend.ts`, `frontend/src/store/projectsSlice.ts` (new thunk mirrored into the store like the other schema thunks), tests: `frontend/tests/unit/metadata-schema.test.ts`, `metadata-schema-api.test.ts`, `metadata-schema-transport-service.test.ts`, `native-metadata-schema-backend.test.ts`, `metadata-schema-thunks.test.ts`, `metadata-schema-migration.test.ts` (existing; extend).
**Done when:** tests first, then green: the action stores `appliesTo` for a custom field in the chosen order, de-duplicated under `normalizeSubtypeLabel`, and stores an empty selection as the key's absence (not `[]`); it rejects a field whose key is in `DEFAULT_METADATA_SCHEMA` (including `status`, `synopsis`, `notes`, `pov`, `storyDate`, `storyDuration`, `storyEndDate`), a `locked` field, and an unknown group or field (same behaviour as `updateRefProperties`); HTTP route and native backend give identical results for the same fixture; the thunk fulfilled mirrors the schema into the store and rejected leaves the stored schema unchanged and exposes the failure to the caller (not swallowed); FR-17: a field with `appliesTo` keeps it through rename label, rename key, reorder, change type with and without migration, and options updates (one test per operation). `pnpm typecheck` clean.
**Depends on:** 3, 5
**Estimate:** 5
**Notes:** Satisfies FR-15 (below the UI), FR-14 (server-side built-in rejection), FR-17. Depends on 5 only because both edit `projectsSlice.ts`; the two must not run concurrently. The native-web-stub aliasing in `frontend/next.config.mjs` is unchanged because no new native backend module is added; only the existing `native-metadata-schema-backend.ts` changes.
**POS:** task_afca9086
**Done:** [x]

### Task 8: Unchanged-surface, importer-negative and round-trip tests
**What:** Add test-only coverage that queries, importers, trash/restore, reindex, compile and export are unaffected by subtype data.
**Files:** `frontend/tests/unit/query-evaluator.test.ts` and `frontend/tests/unit/field-values.test.ts` (existing; extend), `frontend/tests/integration/docx-import.test.ts`, `scrivener-import.test.ts`, `plaintext-import.test.ts` (existing; extend), `frontend/tests/integration/trash-restore.test.ts` (existing; extend), `cli/tests/reindex.test.ts` (existing; extend, run from `cli/` with its own test script), `frontend/tests/unit/entity-shared-metadata` equivalent if one exists (find by grep; otherwise skip), a compile/export test found by grep (`grep -l "compile" frontend/tests/unit/*`).
**Done when:** tests pass: a query on a field carrying `appliesTo` returns identical results with and without the restriction and with resources whose subtype would hide the field; `flattenUserMetadata` output is unchanged by `resourceSubtype` presence except that the top-level sidecar key is not a metadata field; each of the three importers produces sidecars none of which contain `resourceSubtype` (one test per pipeline); a resource with `resourceSubtype` trashed then restored (resource-level round trip, and folder cascade restore) keeps it; reindex leaves `resourceSubtype` in the sidecar untouched; compile and export output for a project with subtypes equals the output for the same project without them. Every added test is observed to pass against unmodified production code (no production file changes in this task); `pnpm typecheck` clean.
**Depends on:** 3, 6
**Estimate:** 3
**Notes:** Satisfies FR-20 (unchanged surfaces, non-sidebar half), FR-27, FR-28. If a test unexpectedly fails, report it as a finding in the Notes; do not change production code to make it pass without flagging it.
**POS:** task_381dd524
**Done:** [x]

### Task 9: SubtypesSettings list editor in the Metadata tab
**What:** Build the `SubtypesSettings` list editor and render it directly above `<SchemaManager>` in the existing Metadata tab.
**Files:** `frontend/components/preferences/SubtypesSettings.tsx` (NEW; model on `frontend/components/preferences/RelationshipTypesSettings.tsx`), `frontend/components/Layout/ProjectSettingsDialog.tsx` (Metadata `TabsContent`, ~:241), `frontend/stories/Preferences/SubtypesSettings.stories.tsx` (NEW; model on `RelationshipTypesSettings.stories.tsx`), `frontend/stories/Layout/ProjectSettingsDialog.stories.tsx` (update Metadata story), `frontend/tests/component/SubtypesSettings.test.tsx` (NEW; model on `tests/component/RelationshipTypesSettings.test.tsx`), `frontend/tests/a11y/subtypesSettings.a11y.test.tsx` (NEW; use `runAxe` from `tests/a11y/helpers/axe.ts`).
**Done when:** tests first, then green: add by button and by Enter dispatches `updateProjectSubtypes` with the whole new list; remove and move up/down each work and each control's accessible name includes the subtype; a blank or duplicate (case-insensitive) entry shows an error and dispatches nothing; the label input has `maxLength={64}`; the input is not cleared before the write resolves and a failed write (rejected thunk) keeps the typed text, leaves the visible list unchanged and shows an error toast; the editor reads the list through `selectActiveProjectSubtypes`, not `AppShell` props, and a newly added subtype appears without reload; it renders when the `entities` feature flag is off; it is rendered in the Metadata panel above `SchemaManager` and the panel stays force-mounted. Stories exist with `args` for empty and populated; the a11y test passes `runAxe` for both. `pnpm exec vitest run tests/projectSettingsDialog.test.tsx tests/projectSettingsDialogWritingGoalsTab.test.tsx tests/projectSettingsDialogDailyGoal.test.tsx` passes WITHOUT any edits to those files (tab count still 10). No red styling and no `mid` text. `pnpm typecheck` and `pnpm lint` clean.
**Depends on:** 1, 5
**Estimate:** 3
**Notes:** Satisfies FR-4 (UI half), FR-23 (removal allowed with no block or prompt), FR-24, FR-25, FR-29 (SubtypesSettings), FR-30 (no tab added). Open the real `ProjectSettingsDialog.tsx`, `RelationshipTypesSettings.tsx` and `ProjectSettingsDialog.stories.tsx` first; read `projectSettingsDialogDailyGoal.test.tsx` and the dialog story to check whether either pins Metadata-tab contents (spec FR-30 says these were not read) and report what is found. Do NOT copy `RelationshipTypesSettings.handleAdd`'s clear-input-before-resolve behaviour. Error toasts: use `toastService.error` (`frontend/src/lib/toast-service.ts`).
**POS:** task_a090a636
**Done:** [ ]

### Task 10: Schema-manager restriction checkbox group
**What:** Add the per-custom-field "Applies to subtypes" checkbox group to `SchemaManager.tsx`, wired to the Task 7 thunk, with failure feedback.
**Files:** `frontend/components/SchemaManager/SchemaManager.tsx`, `frontend/stories/SchemaManager/SchemaManager.stories.tsx`, `frontend/tests/schemaManager.test.tsx` (existing; extend), `frontend/tests/a11y/schemaManagerRestriction.a11y.test.tsx` (NEW; `runAxe`). Precedent to read first: `frontend/components/Layout/EntityGraphSettingsPanel.tsx`.
**Done when:** tests first, then green: a custom field row shows a `fieldset` with a `legend` and one checkbox per listed subtype (list from `selectActiveProjectSubtypes`, in list order); toggling dispatches the Task 7 thunk with the full selection in chosen order; each stored label not in the current list (under `normalizeSubtypeLabel`) renders as an extra checked row marked "(not in the current list)" and can be unchecked, including when the project list is empty; with an empty list and no stored restriction the block shows the hint "No subtypes yet. Add them in the Subtypes section above, in this Metadata tab."; a field whose key is in `DEFAULT_METADATA_SCHEMA` shows no control (or a disabled one with an explanation); the schema manager still lists every field irrespective of any restriction; a rejected thunk shows an error toast or inline message and the displayed restriction reverts to the stored one. Stories exist with `args` (custom field, built-in field, stale label); the a11y test passes `runAxe` for the three states. The three `projectSettingsDialog*` tests still pass unedited. `pnpm typecheck` and `pnpm lint` clean.
**Depends on:** 1, 5, 7
**Estimate:** 5
**Notes:** Satisfies FR-14, FR-15 (UI/failure half), FR-16, FR-20 (schema manager lists all fields), FR-29 (restriction control). The existing schema thunks are dispatched with `void dispatch(...)` and show nothing on failure; do NOT copy that. Await the dispatch result and handle rejection.
**POS:** task_6aeaa185
**Done:** [ ]

### Task 11: Sidebar subtype control with scoped write
**What:** Add the sidebar subtype `<select>` section, with revert-on-failure, stale-value display, empty-list state, and a write that sends only the subtype key.
**Files:** `frontend/components/Sidebar/SubtypeSection.tsx` (NEW), `frontend/components/Sidebar/MetadataSidebar.tsx` (render the section above the schema groups and below image/audio/prose-diagnostics sections), `frontend/src/lib/status-rollup.ts` (export `unknownStatusLabel`), `frontend/app/(app)/page.tsx` (ONLY if Task 2 reproduced the hazard or the new section's write leaves `page.tsx`'s local resource copy stale; report which), `frontend/stories/Sidebar/MetadataSidebar.stories.tsx` or `frontend/stories/Sidebar/SubtypeSection.stories.tsx` (NEW), `frontend/tests/metadataSidebar.test.tsx` (existing; extend), `frontend/tests/component/SubtypeSection.test.tsx` (NEW), `frontend/tests/a11y/subtypeSection.a11y.test.tsx` (NEW; `runAxe`), `frontend/tests/page-stale-sidecar-save.test.tsx` (extend from Task 2).
**Done when:** tests first, then green: the control shows for text, image and audio resources; options are "No subtype" first, then the project list in order; a resource with no subtype shows "No subtype"; a stored subtype not in the list (under the comparison key) shows `<value> (not in the current list)` and is clearable, and merely displaying it does not write; with an empty list and no stored subtype the select is disabled and the hint "No subtypes yet. Add them in Project Settings, Metadata tab." is present; with an empty list but a stored subtype it is enabled; choosing a value calls `updateSidecar` with only the `resourceSubtype` key (assert the payload has no other resource fields), choosing "No subtype" calls it with only `clearKeys: ["resourceSubtype"]`; a rejected write reverts the control to the stored value and shows an error toast; the control keyboard-operable and found by role and accessible name; list changes (Task 9 editor) are reflected with no reload. FR-32 regression tests, added to the Task 2 file: set subtype A, change to B, edit a custom field, and the final `updateSidecar` payload and stored subtype is B; set a subtype, clear it, edit a custom field, and the stored subtype is still absent. Stories (no subtype, set, stale subtype, empty list) with `args`; a11y test passes `runAxe` for the four states. `pnpm typecheck`, `pnpm lint` clean.
**Depends on:** 1, 2, 3, 5, 6
**Estimate:** 5
**Notes:** Satisfies FR-9, FR-10, FR-11, FR-12, FR-25, FR-29 (sidebar control), FR-32 (regression half). FR-32 requires that after a successful subtype write BOTH the Redux resource and whatever local copy the custom-field save path builds its payload from reflect the new value; Task 2's measured result decides whether `page.tsx` needs an edit. If the regression test fails because of the hazard, fix it for the subtype key only (for example by updating the local copy the page builds its payload from); do not generalize to `entityKind`, `aliases` or `wordCountGoal`. Use `CollapsibleSection variant="sidebar"` and `LabeledField` plus a native select (open both sources first). Do NOT copy `EntitySection.persist`'s swallow-and-keep-optimistic behaviour, and do not use `StatusSelector` as a model for the unset state. Strings "Subtype"/"No subtype" are working copy. Owns `MetadataSidebar.tsx` and `MetadataSidebar.stories.tsx` until Task 12.
**POS:** task_5cb5ddde
**Done:** [ ]

### Task 12: Sidebar field filtering by subtype
**What:** Apply the Task 1 predicate in `MetadataSidebar.tsx` when choosing which fields to render, alongside the existing checks.
**Files:** `frontend/components/Sidebar/MetadataSidebar.tsx`, `frontend/stories/Sidebar/MetadataSidebar.stories.tsx` (add a restricted-field story), `frontend/tests/metadataSidebar.test.tsx` (existing; extend).
**Done when:** tests first, then green: a field with `appliesTo: ["Scene"]` is rendered for a resource with subtype "Scene" (and "scene" and " Scene "), not rendered for another subtype or for no subtype; unrestricted fields render everywhere; the group-level `folderId` check, the feature-flag `isFieldVisible` check and the subtype predicate must all pass (one test per check failing); a group whose fields are all out of scope is omitted including its title; FR-21: values for hidden fields remain in `userMetadata` after changing or clearing the subtype and are shown unchanged when set back (assert the `updateSidecar` payloads contain no `userMetadata` and the displayed value returns); FR-22: with no restrictions and no subtypes, the rendered DOM (snapshot or role/label tree) is identical to a render of the pre-change fixture and mounting issues no sidecar or `project.json` write; FR-23: a resource carrying a subtype removed from the project list still sees its restricted fields; re-adding the label changes nothing else. `pnpm exec vitest run tests/metadataSidebar.test.tsx` passes; `pnpm typecheck`, `pnpm lint` clean.
**Depends on:** 1, 3, 11
**Estimate:** 3
**Notes:** Satisfies FR-19, FR-20 (only `MetadataSidebar.tsx` applies the predicate; grep to confirm no other file imports `field-subtype-scope.ts` except the schema manager's normalization use), FR-21, FR-22, FR-23. Depends on 11 only because both edit `MetadataSidebar.tsx`. The sidebar "Add field" silent no-op for a subtype-hidden field name (OQ-9) is left as is; do not change it.
**POS:** task_835dedad
**Done:** [ ]

### Task 13: In-app help content
**What:** Update the in-app help to describe the subtype list and field restriction.
**Files:** `frontend/components/help/help-content.ts` ("Project Settings tabs" tip card's Metadata entry; "Metadata Fields manager" section of the Metadata help tab), `frontend/tests/a11y/helpPage.a11y.test.tsx` (run only), `frontend/tests/component/helpPage.test.tsx` (extend if it asserts help text; otherwise run only).
**Done when:** the Metadata entry in the "Project Settings tabs" card mentions the subtype list alongside fields, groups and built-in toggles; the "Metadata Fields manager" section explains defining subtypes in the Metadata tab, setting one on a resource in its sidebar, and restricting a custom field to subtypes (and that values for hidden fields are kept); the help-page tests (`pnpm exec vitest run tests/component/helpPage.test.tsx tests/a11y/helpPage.a11y.test.tsx`) pass; `projectSettingsDialog.test.tsx` and `projectSettingsDialogWritingGoalsTab.test.tsx` are run and pass unedited (the tab count is still 10 and the help text mentions no new tab).
**Depends on:** none
**Estimate:** 2
**Notes:** Satisfies FR-30 (help half). Write from the spec; copy for the UI strings is working copy ("Subtype", "No subtype"). No other documentation is written in this feature's implementation stage.
**POS:** task_fb4281cc
**Done:** [x]

### Task 14: Final verification gate
**What:** Run the full verification suite against a freshly measured baseline and confirm nothing out of scope or stray was added.
**Files:** none (results recorded in this task's Notes)
**Done when:** from `frontend/`: `pnpm typecheck` clean; `pnpm lint` shows 0 errors and no more warnings than the baseline measured at the start of this task (measure on `main` HEAD in a separate git worktree, not by stashing; record the counts); `pnpm test:ci` passes with only added tests and no newly skipped tests; from the repo root `pnpm knip` shows no new unused files or exports beyond the freshly measured baseline (known false positives are aliased `*.web-stub.ts` files only; none added by this feature); from `cli/` the reindex test passes; if any file under `frontend/src/store/transport/native-*-backend.ts` changed, `pnpm build` in `frontend/` succeeds with no `node:*` leak into the web build and the existing `native-*-backend-web-exclusion` tests pass; `git diff --stat` shows `frontend/tests/projectSettingsDialog.test.tsx`, `projectSettingsDialogWritingGoalsTab.test.tsx`, `getwrite-config/templates/project-types/project-type.schema.json` and all built-in project-type JSON unchanged; a grep confirms no new route, transport module or native backend pair was created for this feature and `field-subtype-scope.ts` is imported only where this task list says. Task 2's measured result is copied into this task's Notes verbatim.
**Depends on:** 4, 7, 8, 9, 10, 12, 13
**Estimate:** 2
**Notes:** Re-measure baselines fresh rather than trusting numbers from another feature. Storybook story tests (`pnpm test-storybook`) must be run outside the sandbox; if not runnable in the implementor's environment, say so rather than reporting them as passing.
**POS:** task_45fc1938
**Done:** [ ]

## Summary
- Total tasks: 14
- Total estimated effort: 46 points (1: 2, 2: 3, 3: 3, 4: 2, 5: 5, 6: 3, 7: 5, 8: 3, 9: 3, 10: 5, 11: 5, 12: 3, 13: 2, 14: 2)
- Critical path: 1 -> 3 -> 5 -> 7 -> 10 -> 14 (2 + 3 + 5 + 5 + 5 + 2 = 22 points); the alternative 1 -> 3 -> 5 -> 11 -> 12 -> 14 is 20 points.
- Risks: Task 5 and Task 7 are the widest (many layers; both own `projectsSlice.ts`, so they are chained). Task 2 is a measurement whose outcome decides whether Task 11 must also edit `frontend/app/(app)/page.tsx`; Task 11 is the highest-uncertainty task. Task 3 owns `schemas.ts`/`types.ts` and Task 4 owns `lib/api/schemas.ts`; no other task may edit those files. Tasks 11 and 12 both edit `MetadataSidebar.tsx` and its story and are chained. Task 9's spec leaves `projectSettingsDialogDailyGoal.test.tsx` and the dialog story unread, so a surprise pin on Metadata-tab contents is possible.

## Wave plan
- Wave 1 (parallel): Task 1, Task 2, Task 13. File sets: field-subtype-scope module and its test; a new page test file; `help-content.ts` and help tests. Disjoint.
- Wave 2: Task 3 (needs 1).
- Wave 3 (parallel): Task 4, Task 5, Task 6. File sets: `lib/api/schemas.ts` plus its test; `project-features.ts`, features route, feature-config transport, native feature-config backend, `projectsSlice.ts`; `resource-crud-core.ts`, `native-resource-backend.ts`. Disjoint.
- Wave 4 (parallel): Task 7, Task 8, Task 9, Task 11. File sets: metadata-schema model/dispatch/route/transport/native backend and `projectsSlice.ts`; test-only files (importer, trash, reindex, query); `SubtypesSettings`, `ProjectSettingsDialog.tsx` and its story; `SubtypeSection`, `MetadataSidebar.tsx`, `status-rollup.ts`, possibly `page.tsx`, sidebar stories. Disjoint (the `metadata-schema.test.ts` edits belong to Task 3 and Task 7 in different waves; `tests/metadataSidebar.test.tsx` is only in Task 11 in this wave).
- Wave 5 (parallel): Task 10, Task 12. File sets: `SchemaManager.tsx` plus its story and tests; `MetadataSidebar.tsx` plus its story and test. Disjoint.
- Wave 6: Task 14.

## FR coverage
| FR | Task(s) |
|----|---------|
| FR-1 | 3, 4, 5 |
| FR-2 | 1, 3, 5 |
| FR-3 | 5, 9, 10, 11 |
| FR-4 | 5, 9 |
| FR-5 | 3, 4 |
| FR-6 | 3 |
| FR-7 | 6 |
| FR-8 | 6 |
| FR-9 | 11 |
| FR-10 | 11 |
| FR-11 | 11 |
| FR-12 | 11 |
| FR-13 | 1, 3, 4, 7 |
| FR-14 | 7, 10 |
| FR-15 | 7, 10 |
| FR-16 | 10 |
| FR-17 | 7 |
| FR-18 | 1 |
| FR-19 | 12 |
| FR-20 | 8, 10, 12 |
| FR-21 | 12 |
| FR-22 | 12 |
| FR-23 | 9, 12 |
| FR-24 | 9 |
| FR-25 | 9, 11 |
| FR-26 | 3 |
| FR-27 | 8 |
| FR-28 | 8 |
| FR-29 | 9, 10, 11 |
| FR-30 | 9, 13, 14 |
| FR-31 | 4 |
| FR-32 | 2, 11 |

## Open Questions

None. Observations an implementor should know (not blocking, no guess required): the spec's FR-30 states two test files "were not read" for Metadata-tab pins, so Task 9 reads them. Two paths in the spec's Notes are mis-cased: the real files are `frontend/components/preferences/RelationshipTypesSettings.tsx` (lowercase directory) and `frontend/stories/Preferences/RelationshipTypesSettings.stories.tsx`.
