# ProjectTypesManagerPage Seam

**Finding**: DF-008 · Rank 4 · Risk: High · Invariant Impact: workspace
**Target**: `frontend/components/project-types/ProjectTypesManagerPage.tsx` (838 lines)
**Drift Types**: size, responsibility, standards

## Overview

`ProjectTypesManagerPage` is the only surface in the app that allows users to author project-type defaults, including Workspace-folder structure templates. Drift here is High risk because changes applied via this surface propagate into future project creation — corrupt or incomplete templates produce invalid workspace seeds. The component currently handles theme resolution, list navigation, folder/resource editing forms, modal/page branching, and draft-state management in one 838-line body, making it difficult to verify that the Workspace invariant guardrail is always enforced at save boundaries.

## Seam Splits

| Seam Boundary            | Responsibility                                                                                     | Proposed New Unit                   | Dependency Direction                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| Project type list pane   | List navigation, search/filter, selection of the active type                                       | `ProjectTypeListPane`               | Consumes project-type array from `template-service.ts`; no edit state                |
| Project type editor form | Editing fields for a single project type (name, theme, folder structure, resources)                | `ProjectTypeEditorForm`             | Consumes draft from `ProjectTypeDraftService`; triggers draft mutations              |
| Draft service            | In-memory draft management; pending changes before they are committed to disk                      | `ProjectTypeDraftService`           | Pure service; no Redux; receives draft update events; exposes `commit` and `discard` |
| Slim shell               | Composes list pane + editor form + draft service; enforces Workspace guardrails at commit boundary | `ProjectTypesManagerPage` (trimmed) | Imports all three units; validates draft before calling `template-service.commit()`  |

## Dependency Order

1. **`template-service.ts` must be extracted from `resource-templates.ts` first** (see resource-templates seam). The manager imports template scanning; the `template-service` API must be stable before the manager is decomposed.
2. **`ProjectTypeDraftService` can be defined before rendering units.** It is a pure service with no React dependency; define its type interface first.
3. **`ProjectTypeListPane` requires the draft service interface** to know how to signal the active selection.
4. **`ProjectTypeEditorForm` requires both** the draft service API and the stable template-service type shapes.
5. **Slim shell is last.** Introduces Workspace guardrail checks at the commit boundary once all subunits are defined.

## Blast Radius

| Affected Area                                                           | Coupling Type                                                            | Migration Risk                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `frontend/components/Layout/AppShell.tsx`                               | Loads project types via `/api/project-types`, propagates to manager page | Medium — project-type list data shape must remain identical             |
| `frontend/src/lib/models/resource-templates.ts` → `template-service.ts` | Manager depends on template scanning export                              | High — must coordinate with resource-templates seam extraction          |
| Workspace project creation flow (creates projects from templates)       | Uses project-type entries authored in this surface                       | High — invalid templates must be blocked at the manager's save boundary |
| Any route or modal that navigates to the manager page                   | Component prop surface may shift during decomposition                    | Low — keep the same public props on slim shell                          |

## Public-Behavior Guardrails

| Guardrail                                                                                                                          | Invariant Link | Failure Signal                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| Workspace folder structure cannot be corrupted by invalid template edits; the slim shell must validate the draft before any commit | workspace      | A project created from the manager produces a workspace seed with missing or invalid folders   |
| Template changes must only take effect after explicit user save confirmation; no auto-persist on draft state change                | workspace      | Unsaved changes propagate to disk silently; user's uncommitted edits corrupt the template file |
| Explicit Workspace-folder guardrails must fire at every update boundary, not only at final save                                    | workspace      | Partial template updates (folder rename mid-session) bypass the guardrail                      |
| List navigation and type selection must not trigger a template write                                                               | workspace      | Navigating the list inadvertently overwrites the previously selected type                      |

## Non-Goals

- Do not change Workspace folder creation semantics for new projects.
- Do not alter the template file format, directory path, or scanning algorithm.
- Do not redesign theme resolution — move it but do not change its logic.
- Do not add new template features (versioning, sharing) in this seam.
- Do not change the route or URL structure for the manager page.

## Style-Alignment Mappings

| Rule   | Applies To                                                                | Action Required                                                                                              |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| SR-001 | `ProjectTypeDraftService.commit()`                                        | Validate the draft against its schema before committing to disk; `Schema.parse(draft)` must gate the commit  |
| SR-007 | `ProjectTypeDraftService`                                                 | Add `@module` JSDoc block listing: draft management, pending-changes lifecycle, commit/discard contract      |
| SR-010 | `ProjectTypeListPane`, `ProjectTypeEditorForm`, `ProjectTypeDraftService` | Keep each unit single-purpose; do not add commit logic to the form or navigation logic to the draft service  |
| SR-020 | `ProjectTypeDraftService` options params                                  | Absorb defaults with `??` inside the service; call sites need not specify all config fields                  |
| SR-025 | `ProjectTypeListPane` and `ProjectTypeEditorForm`                         | Export their props interfaces so parent can import type independently of the component                       |
| SR-030 | All new UI components in this seam                                        | Use token-backed class names only; remove any raw Tailwind utilities on host elements                        |
| SR-031 | `ProjectTypeEditorForm` editor zone                                       | Use semantic BEM-style class names (`project-type-editor-*`); centralize styles in a scoped stylesheet       |
| AP-001 | `ProjectTypeDraftService.commit()`                                        | Never write an unvalidated template to disk; schema parse is the gate                                        |
| AP-019 | All new sub-components                                                    | Remove `text-sm`, `font-medium`, `mt-*`, `px-*` utilities on container elements; use token utilities instead |
| TB-001 | Any simplification that would remove the Workspace guardrail check        | Product invariant: Workspace protection is non-negotiable; reject the simplification                         |
