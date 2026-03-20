# Plan: Drift Discovery and Coherence Refactor Baseline

Two-phase analysis focused on `/frontend` first: discover drift exhaustively, then derive the preferred implementation style from strong in-repo examples, then combine both into a hotspot-first refactor blueprint that preserves behavior.

## Scholar Summary

- `/experiments-nopush/tome-002-app-spec-v1-product-intent.md` — Why it applies: defines invariant behavior (Workspace, revisions/canonical, identity, compile semantics). Effect on plan: drift findings will be tagged by invariant risk, and refactor recommendations will preserve these contracts.
- `/experiments-nopush/tome-004-token-first-component-styling-preference.md` — Why it applies: establishes token-first styling preference. Effect on plan: style-conformance phase will treat ad-hoc visual values as drift and anchor recommendations to token/system usage.

## Steps

### Phase 1: Drift Discovery

1. **Phase 1A — Complexity baseline.** Build a ranked inventory of large files, functions, and components in `/frontend` using line count, concern count (state/effects/thunks/helpers), inline-component nesting, and coupling signals (cross-module dependencies, duplicated constants, mixed responsibilities).

2. **Phase 1B — Drift classification.** For each hotspot, classify drift type (size, responsibility, architectural-boundary, duplication, standards) and assign risk level (High/Medium/Low). High reserved for drift that can violate product invariants or create widespread regressions. Tag each finding with explicit invariant impact (Workspace / revisions+canonical / resource-identity / compile / token-system).

3. **Phase 1C — Domain completeness pass.** Confirm coverage across all major frontend domains before moving to Phase 2:
   - App shell and modal orchestration
   - Work area / editor (EditView, autosave, revision tracking)
   - Resource tree (transform, drag-drop, selection, Redux sync)
   - Project types manager (list/editor separation, form controls)
   - Model layer utilities (resource-templates, revision-manager, project, resource)
   - Redux slices (revisions, resources, projects)
   - Modal flows (Create, Export, Compile, Preferences, Help, Delete-confirm)
   - Sidebar metadata editors

   Each domain must have either a findings entry or an explicit "no material drift" notation before continuing.

4. **Phase 1D — Refactor seam definition.** For each hotspot, define minimally invasive split seams. Include dependency order and blast-radius notes so implementation can be staged safely. At minimum one seam per hotspot. End each seam definition with a "public behavior unchanged" statement confirming what must not change.

   Seam patterns to apply:
   - Container vs. presenter split for oversized components
   - Orchestration vs. pure helpers split for large modules
   - Slice vs. selectors vs. adapters split for Redux drift
   - Custom hook extraction for tightly coupled component state

### Phase 2: Style Conformance Map

5. **Phase 2A — Exemplar harvesting.** Identify high-quality modules and components in `/frontend/src` and `/frontend/components` that represent target style for typing, module cohesion, Redux organization, validation strategy, hook/component boundaries, and documentation discipline.

6. **Phase 2B — Style contract extraction.** Convert exemplars into actionable keep-rules and anti-pattern checks. Rules must be concrete enough to evaluate individual refactor decisions against. Group rules by domain: type safety, module responsibility, state management, error handling, React component shape, styling.

7. **Phase 2C — Drift-to-style mapping.** For each hotspot, map proposed seam changes to exemplar-backed style rules so decomposition produces code that matches your preferred style rather than introducing new or inconsistent patterns.

### Phase 3: Execution Blueprint

8. **Consolidated priority-ordered plan.** Produce one execution-ready blueprint with:
   - Dependency ordering (which hotspots must be split before others can proceed safely)
   - Parallelizable tracks (hotspots independent of each other)
   - Hotspot-first prioritization (biggest/riskiest first)
   - Non-goals list (what is explicitly out of scope for this refactor pass)
   - Guardrails: per hotspot, explicit "must not change behavior" contracts

### Phase 4: Verification Gates

9. **Per-hotspot and cross-cutting test/check requirements.** Define required verification for future implementation:
   - Unit or integration tests for each split module/hook
   - Invariant-focused assertions (canonical revision rules, Workspace protection, identity stability, compile non-mutation)
   - UI/manual checks for workflows impacted by decomposition (modal flows, resource tree ops, EditView save/navigation)
   - Standards gate: all refactored files must pass TypeScript strict, JSDoc completeness, and token-first style checks before merge

## Relevant Files

### Hotspots (primary targets)
- `frontend/components/AppShell.tsx` — primary orchestration hotspot; ~1500 lines; 13 useState calls; 5+ async modal flows; drag-resize; color mode; recent-resources persistence all colocated
- `frontend/src/lib/models/resource-templates.ts` — ~1100 lines; zip I/O, versioning, instantiation, bulk ops, CRUD mixed
- `frontend/components/project-types/ProjectTypesManagerPage.tsx` — ~900 lines; 3 nested inline component defs; form controls duplicated 4×; list and editor state interleaved
- `frontend/src/store/revisionsSlice.ts` — ~900 lines; 5 async thunks each repeating resolver pattern; 10+ selectors; payload adapters scattered
- `frontend/components/WorkArea/EditView.tsx` — ~500 lines; 8+ useState calls; revision loading, autosave, metrics, labeling all coupled
- `frontend/components/ResourceTree/ResourceTree.tsx` — ~500 lines; tree transform + drag-drop + Redux selection + context menu intertwined
- `frontend/components/help/HelpPage.tsx` — ~700 lines; 7 inline tab components + 5 shared UI helpers; zero file-level separation
- `frontend/components/Editor/MenuBar/MenuBar.tsx` + subcomponents — icon type map + color palettes duplicated across 2–3 files
- `frontend/src/store/projectsSlice.ts` — type conversions mixed with reducer logic; selectors and normalizers not separated

### Exemplars (style references)
- `frontend/src/lib/models/revision-manager.ts` — lock-based orchestration, constrained domain invariants, fire-and-forget side effects
- `frontend/src/lib/models/resource.ts` — factory pattern, schema validation, named type guards, metrics as pure helpers
- `frontend/src/store/resourcesSlice.ts` — Map-based immutable updates, granular actions, createSelector composition
- `frontend/src/store/store.ts` + `frontend/src/store/hooks.ts` — factory store, inferred types, typed custom hooks
- `frontend/src/lib/models/schemas.ts` — centralized Zod schemas, recursive types, single source of truth for runtime validation
- `frontend/src/lib/toast-service.ts` — semantic service wrapper, JSDoc with examples, constants for config
- `frontend/components/Sidebar/controls/MultiSelectList.tsx` — small controlled component, props typed with interface, accessibility attributes
- `frontend/src/lib/models/uuid.ts` — opaque type alias, graceful degradation, no external dependency
- `frontend/src/lib/projectTypes.ts` — fallback path resolution, lazy caching, grouped exported types
- `frontend/components/common/ConfirmDialog.tsx` — focus lifecycle management, keyboard nav, aria attributes, conditional null return

### Authority references
- `docs/app-spec.md`
- `docs/standards/typescript-implementation.md`
- `docs/standards/code-documentation.md`
- `docs/standards/template-integrity.md`
- `docs/standards/testing.md`
- `experiments-nopush/tome-002-app-spec-v1-product-intent.md`
- `experiments-nopush/tome-004-token-first-component-styling-preference.md`

## Verification

1. Every major frontend domain has findings or an explicit no-drift status before Phase 2 begins.
2. Every hotspot includes: drift type, risk level, invariant impact, and at least one practical split seam with a "public behavior unchanged" statement.
3. Every style rule is backed by at least one concrete exemplar file or symbol.
4. Final blueprint clearly marks dependency-blocking steps vs. parallelizable tracks.
5. Scope lock enforced: analysis is `/frontend` only for this pass; docs/specs/tomes used as authority references only.

## Decisions

- **Scope included:** `/frontend` analysis only; docs/specs/tomes as authority references.
- **Scope excluded:** Implementation edits and refactor execution; `/src`, `/packages`, `/scripts` deferred to a second wave.
- **Output structure:** Two-phase (drift discovery first, style map second), then merged into one execution-ready blueprint (Phase 3).
- **Prioritization:** Biggest/riskiest hotspots first.
- **Edit discipline:** Each refactor action must be minimally invasive and patch-style where template-derived files are in scope.

## Further Considerations

1. **Risk threshold calibration:** High is reserved for findings that can violate product invariants or cause widespread regressions. Do not inflate to Medium findings.
2. **Decomposition stop condition:** After each hotspot's seam plan is written, require an explicit "public behavior unchanged" statement before the refactor action is executed. This prevents hidden functional drift.
3. **Second-wave extension:** Once the frontend pass is complete and merged, run the same framework on `/src` and `/packages` for a second-wave coherence plan.
