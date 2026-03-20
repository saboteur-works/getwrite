# Verification Gates

This artifact captures per-hotspot verification gates for spec 004, including future automated test targets, manual checks, invariant checks, and artifact checks.

---

## Manual Check Baseline (applies to all gates)

- **Accessibility**: keyboard navigation and tab order, focus visibility on interactive elements, semantic labels and ARIA roles on changed controls, screen-reader announcement for state changes.
- **Responsiveness**: desktop and narrow-viewport behavior remains usable without clipping, overflow, or layout regression.
- **Core flow behavior**: unchanged user-facing outcomes for the seam's primary paths; no new loading states, no removed interactions.

## Invariant Check Baseline (applies to all gates)

- Workspace folder protection remains unchanged; no new project can be created with missing or invalid workspace folders.
- Revision/canonical guarantees remain unchanged; only one revision per resource is canonical at a time.
- Resource identity and association behavior remain unchanged; moved or renamed resources retain their stable `id`.
- Compile behavior remains export-only and ordering-safe; no side effects introduced by compile triggers.
- Token-first styling remains intact; no raw Tailwind utility classes introduced on host elements of changed components.

---

## Verification Gates

### VG-001 — resource-templates (model utilities)

**Hotspot**: DF-006 · resource-factory, resource-persistence, project-view-adapter, template-service

| Dimension                  | Detail                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automated Test Targets** | `pnpm test:ci frontend/src/lib/models` — factory unit tests, schema validation round-trips, adapter type assertion tests; each extracted module should have its own test file                                                                |
| **Manual Checks**          | Verify no regression in the resource create flow in the UI; verify project creation produces a correct workspace seed with expected folders; responsiveness of create dialogs unchanged                                                      |
| **Invariant Checks**       | resource-identity: existing resource `id` values unchanged after factory extraction; schema parse gates all factory returns; zero `as any` casts remain in extracted files                                                                   |
| **Artifact Checks**        | `resource-factory.ts`, `resource-persistence.ts`, `project-view-adapter.ts`, `template-service.ts` all exist and match the seam splits in `seams/resource-templates.md`; every factory contains `Schema.parse()` immediately before `return` |
| **Exit Criteria**          | All factory unit tests pass; zero `as any` in extracted model files confirmed by TypeScript strict check; schema parse guards present and green; no regression in create flows                                                               |

---

### VG-002 — revisionsSlice

**Hotspot**: DF-007 (revisionsSlice) · revision-transport-service, revision-normalization, revision-canonical-guards, slim slice

| Dimension                  | Detail                                                                                                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automated Test Targets** | `pnpm test:ci frontend/src/store/revisionsSlice` — canonical guard unit tests asserting single-canonical invariant; selector shape regression tests; transport mock tests confirming endpoint path and payload unchanged                                                                      |
| **Manual Checks**          | Verify autosave and save-on-blur behavior in EditView; verify retry toast appears and dismisses correctly; verify revision list in history panel reflects saves; autosave status indicator shows correct state                                                                                |
| **Invariant Checks**       | revisions+canonical: `revision-canonical-guards.ts` exposes a function callable by unit tests to assert only one canonical exists per resource; revision linearity asserted by ordered version-number test; all selector return shapes unchanged                                              |
| **Artifact Checks**        | `revision-transport-service.ts`, `revision-normalization.ts`, `revision-canonical-guards.ts` exist and match `seams/revisionsSlice.md` splits; slim slice imports all three; all selectors and `createAsyncThunk` definitions co-located; zero hand-written `RootState`/`AppDispatch` aliases |
| **Exit Criteria**          | Canonical guard unit test passes with a known-dual-canonical state fixture; existing selectors return identical types confirmed by TypeScript; transport mock tests pass; no reducer mixing implicit/explicit mutation style                                                                  |

---

### VG-003 — projectsSlice

**Hotspot**: DF-007 (projectsSlice) · project-actions-controller, derived selectors, slim slice

| Dimension                  | Detail                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automated Test Targets** | `pnpm test:ci frontend/src/store/projectsSlice` — mutation controller tests for delete and rename; selector shape regression tests                                                                                                                         |
| **Manual Checks**          | Verify project rename end-to-end in UI; verify project delete removes from list and does not leave stale entries; verify project list ordering persists across page reload                                                                                 |
| **Invariant Checks**       | resource-identity: rename does not corrupt revision references; delete removes project state atomically                                                                                                                                                    |
| **Artifact Checks**        | `project-actions-controller.ts` exists with `@module` JSDoc per `seams/projectsSlice.md`; typed `ProjectsState` interface at top of slice; all selectors and thunks co-located; `ManageProjectMenu` uses `useAppSelector`/`useAppDispatch` from `hooks.ts` |
| **Exit Criteria**          | Rename and delete tests pass with API call assertions; selectors return identical shapes; `ManageProjectMenu` has no direct `react-redux` imports                                                                                                          |

---

### VG-004 — EditView

**Hotspot**: DF-002 · useRevisionContent, useCanonicalAutosave, slim EditView

| Dimension                  | Detail                                                                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automated Test Targets** | `pnpm test:ci frontend/components/WorkArea` — `useRevisionContent` hook tests for fetch and hydration; `useCanonicalAutosave` tests for save-on-blur and retry logic; `pnpm e2e --grep EditView` for autosave lifecycle and navigation-away flush                                  |
| **Manual Checks**          | Verify autosave status indicator shows correct state (saving / saved / error); verify save-on-blur flushes when navigating away; verify retry toast appears after failure and resolves on recovery; keyboard accessibility in editing mode                                         |
| **Invariant Checks**       | revisions+canonical: E2E confirms no duplicate canonical revisions after concurrent tab save; flush-on-blur asserted by integration test; retry count does not exceed current maximum                                                                                              |
| **Artifact Checks**        | `useRevisionContent.ts` and `useCanonicalAutosave.ts` files exist per `seams/EditView.md` splits; slim `EditView` contains no raw `fetch` calls in component body; `EditViewProps` exported; all loading toasts use `toastService.loading()` with captured ID and explicit dismiss |
| **Exit Criteria**          | Revision persistence integration tests pass; save-on-blur lifecycle confirmed by E2E; no `fetch` in `EditView` confirmed by TypeScript; autosave hook documented with `@param`, `@returns`, and `@throws`                                                                          |

---

### VG-005 — ResourceTree

**Hotspot**: DF-003 · buildResourceTree adapter, useResourceReorder hook, slim ResourceTree

| Dimension                  | Detail                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automated Test Targets** | `pnpm test:ci frontend/components/ResourceTree` — `buildResourceTree` pure function tests; `useResourceReorder` hook tests asserting payload shape; identity-preservation test comparing resource IDs before and after a synthetic drag |
| **Manual Checks**          | Drag-drop reparent and reorder in UI; keyboard navigation (arrow keys to move focus, Enter to select); drag to a deeply nested folder; responsiveness: tree panel usable at narrow viewport width                                       |
| **Invariant Checks**       | resource-identity: resource `id` unchanged in every drag test case; `persistReorder` payload structure matches pre-refactor payload by comparison test                                                                                  |
| **Artifact Checks**        | `buildResourceTree.ts` and `useResourceReorder.ts` exist per `seams/ResourceTree.md` splits; slim `ResourceTree` body contains no inline normalization logic; adapter wrapped in `createSelector`; lodash full import removed           |
| **Exit Criteria**          | Reorder and identity tests pass; pure function tests confirm tree shape; lodash conformance confirmed by lint/import audit; adapter wrapped in memoized selector                                                                        |

---

### VG-006 — ProjectTypesManagerPage

**Hotspot**: DF-008 · ProjectTypeListPane, ProjectTypeEditorForm, ProjectTypeDraftService, slim shell

| Dimension                  | Detail                                                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automated Test Targets** | `pnpm test:ci frontend/components/project-types` — `ProjectTypeDraftService` unit tests; Workspace guardrail boundary test asserting invalid draft is rejected at commit; auto-persist prevention test                                                                 |
| **Manual Checks**          | Template editing with save and cancel flows; keyboard accessibility for list navigation; explicit manual test: begin editing, navigate away without saving — confirm no write to disk; responsiveness at narrow viewport                                               |
| **Invariant Checks**       | workspace: guardrail unit test confirms `ProjectTypeDraftService.commit()` rejects a draft with missing workspace folder fields; Workspace seed test confirms new project after manager save has correct folder structure                                              |
| **Artifact Checks**        | `ProjectTypeListPane`, `ProjectTypeEditorForm`, `ProjectTypeDraftService` exist per `seams/ProjectTypesManagerPage.md`; slim shell has explicit Workspace-folder validation check before commit; `template-service.ts` imported instead of raw `resource-templates.ts` |
| **Exit Criteria**          | Workspace guardrail test passes; save boundary tested explicitly with invalid draft fixture; `ProjectTypeDraftService.commit()` calls `Schema.parse()` before any disk write                                                                                           |

---

### VG-007 — AppShell

**Hotspot**: DF-001 · ShellLayoutController, ShellSettingsMenu, ShellModalCoordinator, ShellProjectTypeLoader, slim AppShell

| Dimension                  | Detail                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Automated Test Targets** | `pnpm test:ci frontend/components/Layout` — orchestrator unit tests; `pnpm e2e --grep AppShell` for modal trigger flows, editor-save coordination, and project-type propagation                                                      |
| **Manual Checks**          | Layout resize (drag handle to expand/collapse sidebar); settings panel open/close; command palette trigger on expected keyboard shortcut; all four modal flows open with correct props; responsiveness at narrow viewport            |
| **Invariant Checks**       | revisions+canonical (indirect): E2E confirms editor-save coordination signal reaches `EditView`; workspace (indirect): project-type data received by child components matches API response shape                                     |
| **Artifact Checks**        | `ShellLayoutController`, `ShellSettingsMenu`, `ShellModalCoordinator`, `ShellProjectTypeLoader` exist per `seams/AppShell.md`; slim `AppShell` has no inlined modal component JSX bodies; all new units use token-backed class names |
| **Exit Criteria**          | Modal flows confirmed by E2E; editor-save state propagation pass; component exports unchanged for all route consumers; token-first styling confirmed by import audit                                                                 |

---

### VG-008 — MenuBar

**Hotspot**: DF-010 · toolbar-command-schema, useToolbarCommand, slim MenuBar, slim EditorMenuColorSubmenu, slim EditorMenuInput

| Dimension                  | Detail                                                                                                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automated Test Targets** | `pnpm test:ci frontend/components/Editor/MenuBar` — command schema type correctness tests; `useToolbarCommand` hook tests for active/disabled state transitions per command                                                                    |
| **Manual Checks**          | All toolbar commands trigger correct TipTap behavior; active-state indicator correct per selection; color submenu produces correct CSS output; keyboard-accessible toolbar (Tab to first button, arrows between, Enter to activate)            |
| **Invariant Checks**       | none (no invariant-sensitive paths); all command handlers remain TipTap `editor.chain()` calls                                                                                                                                                 |
| **Artifact Checks**        | `toolbar-command-schema.ts` and `useToolbarCommand.ts` exist per `seams/MenuBar.md`; slim `MenuBar` has no inline `EditorMenuIcon` callback definitions; `MenuBarProps` interface exported; no raw Tailwind utilities on toolbar host elements |
| **Exit Criteria**          | All command schema type tests pass; no regression in color/highlight submenu; `toolbar-command-schema.ts` is the single source of command definitions confirmed by import audit                                                                |

---

### VG-009 — HelpPage

**Hotspot**: DF-009 · help-content data module, HelpSectionCard, slim HelpPage

| Dimension                  | Detail                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Automated Test Targets** | `pnpm test:ci frontend/components/help` — content render snapshot test confirming data extraction did not change visible output; tab navigation test                                                                                             |
| **Manual Checks**          | All help tabs render with correct content; modal open/close behavior; Escape key dismissal; keyboard navigation between tabs; content accuracy review against source copy                                                                        |
| **Invariant Checks**       | none (Low risk; no invariant-sensitive paths)                                                                                                                                                                                                    |
| **Artifact Checks**        | `help-content.ts` data module and `HelpSectionCard` component exist per `seams/HelpPage.md`; slim `HelpPage` has no inline static copy blocks; full ARIA dialog contract present if rendered as modal; `HelpSectionCardProps` interface exported |
| **Exit Criteria**          | Content renders identically confirmed by snapshot test; modal behavior unchanged; ARIA contract verified by test                                                                                                                                 |

---

## Gate Sequencing

| Step | Gates                                                                      | Entry Gate                                      |
| ---- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| 1    | VG-001 (resource-templates)                                                | None — execute first                            |
| 2    | VG-002 (revisionsSlice), VG-003 (projectsSlice)                            | VG-001 passed                                   |
| 3    | VG-004 (EditView), VG-005 (ResourceTree), VG-006 (ProjectTypesManagerPage) | VG-002 for VG-004; VG-001 for VG-005 and VG-006 |
| 4    | VG-007 (AppShell)                                                          | VG-004 and VG-006 both passed                   |
| Any  | VG-008 (MenuBar), VG-009 (HelpPage)                                        | No dependency; exercise whenever convenient     |

---

## T023 Artifact-Consistency Check Record (2026-03-20)

Automated consistency check performed across all `specs/004-frontend-drift-coherence/*.md` and `specs/004-frontend-drift-coherence/seams/*.md` artifacts.

### Heading Presence

| Artifact                           | Required Sections                                                                                                                                    | Result |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `drift-inventory.md`               | Drift Taxonomy, Risk Rubric, Invariant-Impact Legend, Findings Register, Domain Coverage                                                             | PASS   |
| `style-contract.md`                | Exemplar Capture Format, Rule Categories, Exemplar Observations, Keep-Rules, Anti-Patterns, Tie-Breaker Guidance                                     | PASS   |
| `execution-blueprint.md`           | Sequencing Rationale, Prioritized Hotspot Order, Dependency Graph, Parallel Execution Tracks, Deferred Hotspot Notes, Non-Goals, Behavior Guardrails | PASS   |
| `verification-gates.md`            | Manual Check Baseline, Invariant Check Baseline, Verification Gates, Gate Sequencing                                                                 | PASS   |
| `seams/AppShell.md`                | Overview, Seam Splits, Dependency Order, Blast Radius, Public-Behavior Guardrails, Non-Goals, Style-Alignment Mappings                               | PASS   |
| `seams/EditView.md`                | All required sections                                                                                                                                | PASS   |
| `seams/HelpPage.md`                | All required sections                                                                                                                                | PASS   |
| `seams/MenuBar.md`                 | All required sections                                                                                                                                | PASS   |
| `seams/projectsSlice.md`           | All required sections                                                                                                                                | PASS   |
| `seams/ProjectTypesManagerPage.md` | All required sections                                                                                                                                | PASS   |
| `seams/resource-templates.md`      | All required sections                                                                                                                                | PASS   |
| `seams/ResourceTree.md`            | All required sections                                                                                                                                | PASS   |
| `seams/revisionsSlice.md`          | All required sections                                                                                                                                | PASS   |

### Placeholder Removal

| Check                                                            | Result                               |
| ---------------------------------------------------------------- | ------------------------------------ |
| No `placeholder` or `hotspot-name` text in any artifact          | PASS — 0 matches across all 13 files |
| Duplicate template headers removed from all seam files           | PASS — 9 seam files cleaned          |
| Duplicate template section removed from `execution-blueprint.md` | PASS                                 |

### Cross-Link Consistency

| Check                                                                              | Result                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| DF- finding IDs present and consistent in seam files and blueprint                 | PASS — DF-001 through DF-010 correctly referenced |
| SR-/AP-/TB- style rule IDs present in all seam `Style-Alignment Mappings` sections | PASS — all 9 seam files contain SR- rule mappings |
| VG-001 through VG-009 defined and sequenced in `verification-gates.md`             | PASS                                              |
| Deferred findings DF-004 and DF-005 explicitly noted in `execution-blueprint.md`   | PASS                                              |

**Overall T023 Result**: PASS — artifacts are internally consistent and ready for task execution.

---

## Security and Privacy Confirmation (T024)

This section verifies that the analysis process for spec 004 is local-only and does not require exposing project content outside the repository context. This addresses the **Security & Privacy** non-functional requirement in `spec.md`.

| Verification Item                                                                                                    | Expected       | Status | Notes                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| All analysis artifacts are stored under `specs/004-frontend-drift-coherence/` within the repository                  | Local-only     | PASS   | No artifact is published to an external store or service                                                                 |
| No analysis step requires uploading source code to an external API or service                                        | None permitted | PASS   | All evidence was gathered by reading files within the local `frontend/`, `docs/`, and `experiments-nopush/` directories  |
| No credentials, tokens, environment secrets, or user-generated project content appear in any artifact                | None permitted | PASS   | Artifacts contain only structural code pattern observations and planning guidance; no project file contents are captured |
| The planning workflow defined in `quickstart.md` can be completed entirely offline                                   | Required       | PASS   | No network access is required; the workflow reads local files and writes local artifacts                                 |
| Future implementation verification (`pnpm test:ci`, Playwright checks) runs within the local development environment | Local-only     | PASS   | Test commands run against locally running app instances; no external telemetry or reporting service is required          |
| Analysis artifacts do not reference or depend on external URLs, third-party APIs, or remote resources                | None permitted | PASS   | All cross-references point to files within this repository                                                               |

**Overall Security/Privacy Result**: PASS — the analysis process is fully local-only. No project content is exposed outside the repository context at any stage of this workflow.
