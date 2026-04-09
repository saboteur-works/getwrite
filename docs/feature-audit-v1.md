**Feature Audit — Stage 2 (expanded v1)**

This document expands the Stage 2 audit to cover the feature surface described in `docs/app-spec.md`. For each app-spec item we list status (Implemented / Partial / Missing) and representative implementation paths (components, store, libs, tests).

Core UX

- **Start Page & Project Management**: Implemented — files: [frontend/components/Start/StartPage.tsx](frontend/components/Start/StartPage.tsx), [frontend/components/Start/ManageProjectMenu.tsx](frontend/components/Start/ManageProjectMenu.tsx), [frontend/components/Start/CreateProjectModal.tsx](frontend/components/Start/CreateProjectModal.tsx). Tests: [frontend/tests/start.test.tsx](frontend/tests/start.test.tsx), create-project modal tests present.

- **Project Creation / Project Types / Templates**: Implemented (partial validation) — entrypoint: [frontend/src/lib/models/project-creator.ts](frontend/src/lib/models/project-creator.ts); UI: CreateProjectModal. Status: scaffolding & template loading implemented; additional validation paths and more unit tests recommended.

Resource Tree (left sidebar)

- **Resource Tree rendering & selection**: Implemented — [frontend/components/Tree/ResourceTree.tsx](frontend/components/Tree/ResourceTree.tsx) (stories: `stories/Tree/ResourceTree.stories.tsx`). Selecting opens resource in the Work Area.

- **Context menu (resource & folder actions)**: Implemented — [frontend/components/Tree/ResourceContextMenu.tsx](frontend/components/Tree/ResourceContextMenu.tsx) with tests and stories. Actions: copy, duplicate, delete, export wired to UI and API routes.

- **Reorder (drag & drop) and persistence**: Implemented — [frontend/components/ResourceTree/useResourceReorder.ts](frontend/components/ResourceTree/useResourceReorder.ts), API: `/api/projects/*/reorder`. Tests: resourcetree reorder specs present.

Work Area (center): views and behaviors

- **Edit View (text, image, audio, folder types)**: Implemented — [frontend/components/WorkArea/EditView.tsx](frontend/components/WorkArea/EditView.tsx) integrates `TipTapEditor` for text, image renderer, audio player, and folder-handling logic.
    - Autosave: Partial — `useCanonicalAutosave` ([frontend/components/WorkArea/useCanonicalAutosave.ts](frontend/components/WorkArea/useCanonicalAutosave.ts)) exists and debounces saves (uses `lodash/debounce`). Needs coverage for crash/recovery and canonical-update races.
    - Undo/Redo: Implemented in-editor (session-only); persistence across sessions not supported per spec (matches app-spec).

- **Organizer View**: Implemented — [frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx], [frontend/components/WorkArea/Views/OrganizerView/OrganizerCard.tsx]. Features: card rendering, body toggle, filtering by status/character/location/word count. Tests & stories available.

- **Data View (project stats + characters/locations/items lists)**: Implemented — [frontend/components/WorkArea/DataView.tsx]. Data adapters: `src/lib/models/*` and `project-view-adapter.ts` provide canonical view shapes. Some aggregation edge-cases require test coverage.

- **Diff View**: Implemented — [frontend/components/WorkArea/DiffView.tsx]. Supports read-only left/right panes and revision selection. Word-based diffs available in UI; ensure dif algorithm tests cover expected behavior.

- **Timeline View**: Implemented — [frontend/components/WorkArea/TimelineView.tsx]. Sorting rules implemented; edge-case ordering and large-data performance require review.

Right Sidebar (metadata)

- **Metadata Sidebar & Controls**: Implemented — [frontend/components/Sidebar/MetadataSidebar.tsx] and control components under [frontend/components/Sidebar/controls/*]. Supports Notes, Status, Characters, Locations, Items, POV, Timeframe, and displays file-specific data (word counts, audio length, image resolution).

Revisions and invariants

- **Revision model & invariants**: Partial — core guards and normalization are implemented in [frontend/src/store/revision-canonical-guards.ts](frontend/src/store/revision-canonical-guards.ts) and [frontend/src/store/revision-normalization.ts](frontend/src/store/revision-normalization.ts). The Redux slice is [frontend/src/store/revisionsSlice.ts](frontend/src/store/revisionsSlice.ts). Unit tests exist, but additional integration tests for concurrent canonical updates, deletes, and recovery are high priority.

- **Revision UI flows**: Implemented — Revision selection, canonical toggle, create/delete flows wired to transport service ([frontend/src/store/revision-transport-service.ts]). Edge-case UX (editing old revision then saving) requires clearer e2e test coverage.

Special Resource folders & metadata associations

- **Special Resource folders (Characters / Locations / Items / Front Matter / Back Matter)**: Partial — UI supports these folders (templates and project scaffolds reference them). Implementation of association cleanup on delete and robust rename flows mostly present in project-adapter code; recommend targeted tests for association removal and identity-based linking.

Search & Indexing

- **Search UI**: Implemented — [frontend/components/SearchBar/SearchBar.tsx] with filters UI.

- **Indexing & inverted index**: Partial — core index implementation at [frontend/src/lib/models/inverted-index.ts] and queueing at [frontend/src/lib/models/indexer-queue.ts]. Missing a stable drain/completion API (`waitForDrain()` recommended) for deterministic tests and tooling.

- **Search across revisions & result behavior**: Partial — UI supports cross-revision searches; behavior to open diff view on revision-match exists but needs more integration tests to ensure the latest matching revision is selected consistently.

Compile / Export

- **Compile (aggregate text files into a single document)**: Partial/Implemented — compile preview modal exists ([frontend/components/common/CompilePreviewModal.tsx]) and compile orchestration is present in the export/compile service. Confirmed: images supported in compile; audio explicitly excluded. Additional test coverage for ordering rules (special folders/front/back-matter) recommended.

Persistence & Local-first invariants

- **Local-first storage model & file-sidecar persistence**: Implemented — resource persistence and sidecar model in `src/lib/*` and API routes under `app/api/*` operate directly on the filesystem. Invariants (workspace folder, identity immutability, compile non-mutation) are enforced by adapters; add e2e flows to prove invariants under failure/recovery.

Developer experience & test coverage

- **Storybook & component stories**: Implemented — many components have stories in `frontend/stories` and `frontend/storybook-static` (EditView, DataView, OrganizerView, ResourceTree, CreateProjectModal, MenuBar).

- **Unit & integration tests**: Broad coverage exists (tests folder) including revisions unit tests and UI tests. Gaps identified: canonical-revision concurrency, indexer drain semantics, compile ordering edge-cases, toolbar duplication regressions.

Cross-cutting tech-debt (representative)

- Toolbar duplication + submenu wiring — components: [frontend/components/Editor/MenuBar/*]. Risk: UX duplication and hard-to-track handlers.
- Indexer durability / drain API — implement `waitForDrain()` in [frontend/src/lib/models/indexer-queue.ts] for deterministic test hooks.
- Lodash import drift — `lodash/debounce` used in autosave and AppShell; unify or replace with small helper where appropriate.
- Revision canonical edge-cases — add integration tests simulating concurrent canonical updates and transport failures.

Next actions (immediate)

- This task: expand and validate every row above against the codebase and augment with missing file/test links (in-progress).
- Short-term PRs to prepare (recommended):
    1. `fix/revision-canonical-guards-tests` — add integration tests and small guard fixes.
    2. `feat/indexer-wait-drain` — expose `waitForDrain()` and update tests to use it.
    3. `chore/toolbar-consolidation` — audit MenuBar + submenu wiring; reduce duplication.

Last updated: 2026-04-08
