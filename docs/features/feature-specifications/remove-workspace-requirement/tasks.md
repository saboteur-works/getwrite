# Implementation Tasks: Remove Workspace Requirement

Derived from [`spec.md`](./spec.md). Granularity: story points (1/2/3/5/8).

---

### Task 1: Drop the Workspace `.refine` from the Zod project-type schema ✅

**What:** Remove the validation rule in `ProjectTypeSchema` that requires a folder named `Workspace`, while leaving the optional `special` field in place.
**Files:** `frontend/src/lib/models/schemas.ts` (the `.refine` at ~L457 and its doc comment at ~L442; keep `special: z.boolean().optional()` at L237/402/421)
**Done when:** `validateProjectType` accepts a spec whose folders contain no `Workspace` entry, and still accepts a spec that includes `special: true` on a folder.
**Depends on:** none
**Estimate:** 1
**Notes:** FR1, FR3, FR4. Only the `.refine` is removed — the `special` field stays accepted-but-ignored.
**Done:** [x] — completed 2026-06-11. Removed `.refine`; updated tests in `project-type-validation.test.ts`, `project-type.test.ts`, and the loader's invalid-spec fixture in `project-types.test.ts` (swapped the now-valid "missing Workspace" case for an invalid-`id` case). 27 tests pass; lint clean. Note: the exported validator is `validateProjectType`, not `validateProjectTypeSpec`.

### Task 2: Drop the Workspace `contains`/`const` constraint from the JSON schema ✅

**What:** Remove the `folders.contains` constraint requiring a folder named `Workspace` from the published JSON schema, keeping the `special` property definition.
**Files:** `getwrite-config/templates/project-types/project-type.schema.json` (the `contains` block at ~L65–72; keep the `special` property at ~L32)
**Done when:** A project-type JSON with no `Workspace` folder validates against `project-type.schema.json`, and `special` remains a documented optional property.
**Depends on:** none
**Estimate:** 1
**Notes:** FR2, FR4. Update the now-stale description text mentioning the Workspace requirement.
**Done:** [x] — completed 2026-06-11. Removed the `folders.contains` block; `special` property kept but its description now marks it deprecated/ignored. JSON re-parses; `folders` now exposes only `type`/`description`/`items`. No runtime code consumes this file (it is an IDE/authoring aid; Zod is the runtime validator), so no live ajv check was run — ajv is not a project dependency.

### Task 3: Remove the Workspace guardrail from the project-type draft service ✅

**What:** Delete the `hasWorkspace` validation gate in `validateDraft` and stop seeding `special: true` / a mandatory `Workspace` folder in the default draft.
**Files:** `frontend/components/project-types/ProjectTypeDraftService.ts` (guardrail at ~L108–130; default-draft seed at ~L60)
**Done when:** `validateDraft` returns valid for a draft with no `Workspace` folder, and the default new draft contains no folder flagged `special: true`.
**Depends on:** none
**Estimate:** 2
**Notes:** FR5, FR7. The default draft may keep a starter folder, but without the `special` flag and without being required.
**Done:** [x] — completed 2026-06-11. Removed the `hasWorkspace` gate (now schema-only); dropped `special` from `createEmptyProjectType`, `handleAddFolder`, and `handleAddDefaultFolder`; refreshed module/function doc comments. Added `tests/unit/project-type-draft-service.test.ts` (6 cases, TDD red→green). Kept the `folder: "Workspace"` placeholder in add-handlers (a harmless default string, not the guardrail) to keep scope tight. 33 project-type tests pass; lint + typecheck clean.

### Task 4: Remove the Workspace guardrail warning UI from the Project Types manager

**What:** Remove the workspace-guardrail warning banner and associated state from the manager page so no `Workspace`-required message can render.
**Files:** `frontend/components/project-types/ProjectTypesManagerPage.tsx` (`workspaceGuardErrors` state/effect/render at ~L59, L114–134, L167–173)
**Done when:** The Project Types manager renders no "Workspace guardrail" warning under any draft state, and there are no remaining references to `workspaceGuard*` in the file.
**Depends on:** 3
**Estimate:** 2
**Notes:** FR7.

### Task 5: Remove the `Special` toggle from the Project Type editor form

**What:** Remove the `Special` checkbox controls (and their `patchFolder`/`patchDefaultFolder` wiring) from folder and default-folder rows.
**Files:** `frontend/components/project-types/ProjectTypeEditorForm.tsx` (Special toggles at ~L245–251 and ~L347–353; update the Workspace-mention helper text at ~L225)
**Done when:** The editor form renders no `Special` checkbox for folders or default folders, and authoring a project type no longer offers a way to set `special`.
**Depends on:** none
**Estimate:** 2
**Notes:** FR7. Leave existing `special` values on loaded drafts untouched (accepted-but-ignored); just remove the authoring control.

### Task 6: Strip `special: true` from built-in project-type templates

**What:** Remove every `special: true` flag from the shipped templates while keeping all current folder names (including `Workspace` where present).
**Files:** `getwrite-config/templates/project-types/{blank_project_type,novel_project_type,serial_project_type,article_project_type,poetry_and_lyrics_type,game_documentation}.json`
**Done when:** `grep -r '"special"' getwrite-config/templates/project-types/*.json` returns no matches in template files, every template still validates, and folder names are unchanged.
**Depends on:** 1, 2
**Estimate:** 1
**Notes:** FR6. Per the template-integrity standard, make minimal patch-style edits — remove only the `special` keys.

### Task 7: Update and add tests for Workspace-free validation and legacy load

**What:** Update tests that asserted the Workspace requirement, and add coverage for (a) a Workspace-less spec validating and scaffolding, and (b) loading a legacy project containing a `Workspace`/`special` folder without error.
**Files:** `frontend/tests/unit/project-type-validation.test.ts`, `frontend/tests/unit/project-type.test.ts`, `frontend/tests/unit/project-types.test.ts`, `frontend/tests/unit/project-loader.test.ts`, project-types component tests (`ProjectTypeDraftService`/manager/editor), plus fixtures as needed
**Done when:** `pnpm --filter getwrite-frontend exec vitest run` passes, including a test proving a Workspace-less project type scaffolds (FR3) and a test proving a legacy `special`/`Workspace` project loads (FR8).
**Depends on:** 1, 2, 3, 4, 5, 6
**Estimate:** 3
**Notes:** FR3, FR8. Remove or rewrite any assertion expecting a "Workspace required" error. The resource-tree order test references a `Workspace`-named fixture folder, not the `special` flag, so it should keep passing once templates retain names.

---

## Summary

- Total tasks: 7
- Total estimated effort: 12 story points
- Critical path: Tasks 1 → 6 → 7 (schema removal → template cleanup → test coverage). The guardrail chain 3 → 4 and the form change (5) run in parallel and converge at Task 7.
- Risks:
  - **Task 7** carries the most uncertainty — the full extent of tests asserting Workspace behavior is only discoverable while running them; estimate may grow if fixtures are widely shared.
  - **Task 3 → 4** coupling: the manager consumes `validateDraft` output, so the guardrail must be removed at the source (Task 3) before the UI cleanup (Task 4) is verifiable.
  - `project-creator.ts` / `resource-factory.ts` propagate `special` without branching on it, so they satisfy FR5 as-is and need no change; flagged here so it isn't mistaken for an omission.
