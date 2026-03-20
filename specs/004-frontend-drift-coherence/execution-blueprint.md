# Execution Blueprint

This artifact captures the prioritized refactor order, dependency graph, parallel execution tracks, non-goals, and per-hotspot behavior guardrails for spec 004.

---

## Sequencing Rationale

The execution order resolves two competing inputs:

1. **Drift risk rank** (from `drift-inventory.md`): lower rank number means higher-severity drift finding.
2. **Technical dependency order**: certain hotspots cannot be refactored safely until their upstream dependencies are stable.

The rule: **technical dependency takes precedence over drift rank when they conflict.** Model utilities (`DF-006`) rank 5 by drift severity but are a prerequisite for every slice and component refactor — they execute first. Rank-1 `revisionsSlice` (`DF-007`) executes second because it gates both `EditView` and `ResourceTree`.

---

## Prioritized Hotspot Order

| Priority | Hotspot                              | Drift Finding | Drift Rank | Depends On                                                             | Parallel Track            | Sequencing Rationale                                                                                                                                                      |
| -------- | ------------------------------------ | ------------- | ---------- | ---------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | resource-templates (model utilities) | DF-006        | 5          | `schemas.ts` stable                                                    | — (anchor for all tracks) | All slices and components import model factories; `as any` casts and mixed responsibilities make downstream extractions unsafe until the model boundary is typed          |
| 2        | revisionsSlice                       | DF-007        | 1          | resource-templates (step 1)                                            | Track A                   | Highest-severity drift; canonical revision invariant must be made explicit before EditView can be safely extracted                                                        |
| 2        | projectsSlice                        | DF-007        | 1          | resource-templates (step 1)                                            | Track B                   | Parallel with revisionsSlice; shares DF-007 finding; project mutation and normalization can be extracted independently                                                    |
| 3        | EditView                             | DF-002        | 2          | revisionsSlice (step 2, Track A)                                       | Track A                   | `useRevisionContent` and `useCanonicalAutosave` dispatch to revisionsSlice thunks; thunk API must be frozen first                                                         |
| 3        | ResourceTree                         | DF-003        | 3          | resource-templates (step 1) + resourcesSlice stable                    | Track B                   | Tree adapter depends on typed model helpers and stable slice selectors; identity invariant cannot be verified until model layer is clean                                  |
| 3        | ProjectTypesManagerPage              | DF-008        | 4          | resource-templates → template-service (step 1)                         | Track C                   | Manager imports template scanning; template-service must be extracted before the manager is decomposed                                                                    |
| 4        | AppShell                             | DF-001        | 6          | EditView (step 3, Track A) + ProjectTypesManagerPage (step 3, Track C) | Track A                   | AppShell coordinates editor-save state with EditView and propagates project-type data from the manager; both seams must be stable before AppShell modal/layout extraction |
| 5        | MenuBar                              | DF-010        | 8          | none                                                                   | Track D (any time)        | Fully independent; no slice or model dependencies; can be scheduled opportunistically                                                                                     |
| 5        | HelpPage                             | DF-009        | 10         | none                                                                   | Track E (any time)        | Fully independent; Low risk; recommended for a standalone sprint or pairing session                                                                                       |

---

## Dependency Graph

```
[schemas.ts] ──────────────────────────────────────────────────────────────┐
	│                                                                     │
	▼                                                                     │
[resource-templates (DF-006)]                                               │
	│                  │                  │                               │
	▼                  ▼                  ▼                               │
[revisionsSlice]  [projectsSlice]  [template-service]                       │
(Track A)          (Track B)       (→ ProjectTypesManagerPage, Track C)     │
	│                │                   │                               │
	▼                ▼                   ▼                               │
[EditView]       [ResourceTree]   [ProjectTypesManagerPage]                │
(Track A)         (Track B)        (Track C)                               │
	│                                    │                               │
	└──────────────────┬─────────────────┘                               │
				 ▼                                                 │
			   [AppShell]                                            │
			   (Track A, final)                                      │
												   │
[MenuBar] ─────────────────── (Track D, independent) ──────────────────────┘
[HelpPage] ────────────────── (Track E, independent) ──────────────────────┘
```

---

## Parallel Execution Tracks

| Track   | Hotspots in Order                                               | Entry Gate          | Notes                                                                                  |
| ------- | --------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| Track A | resource-templates → revisionsSlice → EditView → AppShell       | `schemas.ts` stable | Critical path; longest dependency chain; contains two `revisions+canonical` guardrails |
| Track B | resource-templates → projectsSlice → ResourceTree               | `schemas.ts` stable | Can start in parallel with Track A after resource-templates completes                  |
| Track C | resource-templates → template-service → ProjectTypesManagerPage | `schemas.ts` stable | Can start in parallel; merges into Track A dependency when AppShell is reached         |
| Track D | MenuBar (any time)                                              | none                | Fully independent; schedule opportunistically                                          |
| Track E | HelpPage (any time)                                             | none                | Fully independent; lowest risk; good onboarding task                                   |

---

## Deferred Hotspot Notes

Two Medium-risk findings from `drift-inventory.md` are not included in the prioritized hotspot order. Both lack invariant impact and are independent of the critical execution path. They are explicitly deferred, not omitted.

| Finding | Domain           | Risk   | Drift Types                                         | Deferral Rationale                                                                                                                                                                                                                                                   |
| ------- | ---------------- | ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DF-004  | modal flows      | Medium | responsibility, duplication, architectural-boundary | Modal trigger and lifecycle concerns are partially addressed in the AppShell seam (DF-001). The remaining centralization work — collapsing duplicated close/confirm patterns — is isolated and low blast-radius. Address opportunistically after AppShell (Track A). |
| DF-005  | sidebar metadata | Medium | standards, responsibility, duplication              | `MetadataSidebar.tsx` selector duplication and `as any` casts are localized to one component with no invariant impact. Safe to address standalone or alongside Track D/E work.                                                                                       |

---

## Non-Goals

| Hotspot                 | Non-Goal                                                 | Reason Excluded                                                                                                      |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| resource-templates      | Altering Zod schema definitions in `schemas.ts`          | Schemas are the stable foundation; modifying them would cascade changes to every validator in the codebase           |
| resource-templates      | Changing public factory function signatures              | Slices and components already call these factories; signature changes require coordinated updates across all callers |
| revisionsSlice          | Merging with `resourcesSlice` or `projectsSlice`         | Slices serve distinct domains; merging increases blast radius without reducing drift                                 |
| revisionsSlice          | Redesigning the canonical revision API response contract | API contract is shared with server-side handlers; out of this feature's scope                                        |
| projectsSlice           | Adding new project operations (archive, duplicate)       | Feature scope is drift reduction, not feature addition                                                               |
| EditView                | Redesigning TipTap configuration or extension set        | Editor core is stable; only the revision I/O layer is in scope                                                       |
| EditView                | Changing the route structure that renders `EditView`     | Route changes introduce Next.js page-level concerns outside this feature                                             |
| ResourceTree            | Redesigning tree icons or expand/collapse animation      | Visual behavior is correct; only the data and command layers are in scope                                            |
| ResourceTree            | Altering folder or resource create/delete flows          | Create/delete is `resourcesSlice` scope and potentially `AppShell` concern; not tree concern                         |
| ProjectTypesManagerPage | Changing Workspace folder creation semantics             | Workspace invariants are preserved, not redesigned                                                                   |
| ProjectTypesManagerPage | Adding new template features (versioning, sharing)       | Feature additions are out of this refactor scope                                                                     |
| AppShell                | Changing internal behavior of modal components           | Modal internals are DF-004 scope; this seam only extracts orchestration                                              |
| AppShell                | Altering how appearance preferences are stored           | Settings storage is outside this seam's boundary                                                                     |
| MenuBar                 | Adding or removing toolbar commands                      | Command catalog changes are a feature decision; schema extraction must be additive-only                              |
| MenuBar                 | Changing keyboard shortcut behavior                      | Keyboard shortcuts are wired through TipTap extensions; out of scope                                                 |
| HelpPage                | Changing documentation content                           | Content accuracy is an editorial decision; extraction is structural only                                             |
| HelpPage                | Adding help search or dynamic content                    | Feature additions are out of this refactor scope                                                                     |

---

## Behavior Guardrails

| Hotspot                 | Guardrail                                                                                                                                   | Invariant Link                 | Failure Signal                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| resource-templates      | `Schema.parse()` must gate every factory return; no factory may return an unvalidated object                                                | resource-identity              | Invalid resource shape escapes the factory; downstream components receive malformed data    |
| resource-templates      | All `as any` casts in `project-view.ts` must be replaced; zero permitted in the extracted seam                                              | resource-identity              | Metadata-order bugs become invisible to TypeScript; runtime mismatches in the view adapter  |
| resource-templates      | Template scanning in `template-service.ts` must return entries with the same shape as current output                                        | workspace (indirect)           | Project creation produces malformed workspace seeds; new projects open with missing folders |
| revisionsSlice          | Only one revision per resource can be canonical at a time; `revision-canonical-guards.ts` must make this assertable in a unit test          | revisions+canonical            | Two revisions share `canonical: true` simultaneously; history is corrupted                  |
| revisionsSlice          | Revision linearity must hold; no version number may be skipped                                                                              | revisions+canonical            | Version gaps appear in revision history; audit trail is unreliable                          |
| revisionsSlice          | All existing selectors (`selectRevisions`, `selectCanonicalRevision`, `selectRevisionStatus`) must return identical shapes after extraction | revisions+canonical            | Components fail TypeScript checks or render stale data                                      |
| projectsSlice           | Project rename/delete must continue calling the same API endpoints with the same payload shape                                              | resource-identity (indirect)   | Rename call silently fails; delete leaves stale project in store                            |
| projectsSlice           | Project state normalization must produce an identical array shape for all existing selectors                                                | none                           | Missing project entries in list; component type errors                                      |
| EditView                | Only one revision can be canonical at a time; `useCanonicalAutosave` must not create a second canonical                                     | revisions+canonical            | Two revisions share `canonical: true` after a concurrent autosave                           |
| EditView                | Save-on-blur must flush in the same lifecycle tick as the current implementation                                                            | revisions+canonical            | Content changes typed immediately before navigation are lost                                |
| EditView                | Retry logic must not exceed the current maximum retry count                                                                                 | revisions+canonical            | Duplicate revision entries created by excess retries                                        |
| ResourceTree            | Every drag-drop reparent must preserve the resource's stable `id`                                                                           | resource-identity              | Sidebar loses the selected resource reference after drag; navigation breaks                 |
| ResourceTree            | `persistReorder` must write a payload with the same structure as the current dispatch                                                       | resource-identity              | Server-side order diverges; tree resets to previous order on reload                         |
| ResourceTree            | Selection state (`selectedResourceId`) must propagate identically to `resourcesSlice`                                                       | resource-identity              | Incorrect resource opens in the editor after tree selection                                 |
| ProjectTypesManagerPage | Workspace folder structure cannot be corrupted by invalid template edits; slim shell must validate draft before commit                      | workspace                      | New project has missing or invalid workspace folders                                        |
| ProjectTypesManagerPage | Template changes must only take effect after explicit user save; no auto-persist on draft change                                            | workspace                      | Uncommitted draft edit overwrites the template file on disk                                 |
| AppShell                | Editor-save coordination signal must reach `EditView` with the same timing and shape                                                        | revisions+canonical (indirect) | Autosave fails to trigger; editor reports unsaved state incorrectly                         |
| AppShell                | All four modal flows must open at the same user-interaction trigger points                                                                  | none                           | Modal fails to open or opens with missing props                                             |
| AppShell                | Project-type data propagated to children must retain the same shape as the current API response                                             | workspace (indirect)           | Child components receive undefined or mis-typed project-type entries                        |
| MenuBar                 | All current editor commands must remain available and functional                                                                            | none                           | Toolbar command is missing or clicking it does nothing                                      |
| MenuBar                 | Color and highlight submenu must produce identical CSS output from the same user selection                                                  | none                           | Text color changes to a different value than selected                                       |
| HelpPage                | Help content must render identically after data extraction                                                                                  | none                           | Users see different text, missing sections, or broken links                                 |
| HelpPage                | Modal open/close and keyboard dismissal must be preserved                                                                                   | none                           | Help modal cannot be closed with Escape                                                     |
