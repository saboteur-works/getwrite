**Feature Audit — Stage 2 (v1)**

Snapshot mapping of app-spec features → implementation status (Implemented / Partial / Missing) with representative file links.

- **Create Project**: Implemented — files: [frontend/components/Start/CreateProjectModal.tsx](frontend/components/Start/CreateProjectModal.tsx), [frontend/src/lib/models/project-creator.ts](frontend/src/lib/models/project-creator.ts). Tests: [frontend/tests/create-project-modal.spec.tsx](frontend/tests/create-project-modal.spec.tsx).

- **Resource Tree (reorder, context menu)**: Implemented — files: [frontend/components/ResourceTree/ResourceTree.tsx](frontend/components/ResourceTree/ResourceTree.tsx), [frontend/components/ResourceTree/useResourceReorder.ts](frontend/components/ResourceTree/useResourceReorder.ts). Tests: [frontend/tests/resourcetree.test.tsx](frontend/tests/resourcetree.test.tsx), [frontend/tests/resourcetree.order.test.tsx](frontend/tests/resourcetree.order.test.tsx).

- **Editor Toolbar & TipTap integration**: Implemented — files: [frontend/components/Editor/MenuBar/MenuBar.tsx](frontend/components/Editor/MenuBar/MenuBar.tsx), [frontend/components/Editor/MenuBar/toolbar-command-schema.ts](frontend/components/Editor/MenuBar/toolbar-command-schema.ts), [frontend/components/Editor/MenuBar/useToolbarCommand.ts](frontend/components/Editor/MenuBar/useToolbarCommand.ts), [frontend/components/TipTapEditor.tsx](frontend/components/TipTapEditor.tsx). Tests: [frontend/tests/editormenubar.test.tsx](frontend/tests/editormenubar.test.tsx).
    - Note: toolbar duplication and fragmented submenu wiring were flagged in the discovery pass (tech-debt entry).

- **WorkArea views (Edit / Diff / Data / Timeline / Organizer)**: Implemented — files: [frontend/components/WorkArea/EditView.tsx](frontend/components/WorkArea/EditView.tsx), [frontend/components/WorkArea/DiffView.tsx](frontend/components/WorkArea/DiffView.tsx), [frontend/components/WorkArea/DataView.tsx](frontend/components/WorkArea/DataView.tsx), [frontend/components/WorkArea/TimelineView.tsx](frontend/components/WorkArea/TimelineView.tsx), [frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx](frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx). Tests: editview, dataview, diffview, timelineview, organizerview unit tests present.

- **Revisions & Canonical invariant**: Partial — files: [frontend/src/store/revision-canonical-guards.ts](frontend/src/store/revision-canonical-guards.ts), [frontend/src/store/revision-normalization.ts](frontend/src/store/revision-normalization.ts), [frontend/src/store/revisionsSlice.ts](frontend/src/store/revisionsSlice.ts), [frontend/src/store/revision-transport-service.ts](frontend/src/store/revision-transport-service.ts). Unit tests exist (src/tests/unit/\*) but additional integration/edge-case tests recommended (high priority).

- **Autosave / Canonical save**: Partial — file: [frontend/components/WorkArea/useCanonicalAutosave.ts](frontend/components/WorkArea/useCanonicalAutosave.ts). Works but uses `lodash/debounce`; coverage and crash-recovery semantics need verification.

- **Indexer / Backlinks / Search index**: Partial — files: [frontend/src/lib/models/inverted-index.ts](frontend/src/lib/models/inverted-index.ts), [frontend/src/lib/models/indexer-queue.ts](frontend/src/lib/models/indexer-queue.ts), [frontend/src/lib/models/backlinks.ts](frontend/src/lib/models/backlinks.ts). Docs reference these; missing a robust completion/drain API for indexer (tests rely on flush behavior). Flagged for durability fixes.

- **Search UI & Compile preview**: Implemented — [frontend/components/SearchBar/SearchBar.tsx](frontend/components/SearchBar/SearchBar.tsx), [frontend/components/common/CompilePreviewModal.tsx](frontend/components/common/CompilePreviewModal.tsx). Storybook & unit tests present.

- **Metadata sidebar & controls**: Implemented — [frontend/components/Sidebar/MetadataSidebar.tsx](frontend/components/Sidebar/MetadataSidebar.tsx) with unit tests and stories.

- **Project Preferences / Project Types**: Partial — project-type scaffolding exists (`createProjectFromType` in [frontend/src/lib/models/project-creator.ts](frontend/src/lib/models/project-creator.ts) and project-type UI), but test/coverage gaps remain for some validation paths.

**Known Risk / Tech Debt Shortlist (representative)**

- Toolbar duplication + submenu wiring — see toolbar files above; add focused refactor PR.
- Indexer durability / drain API — implement `waitForDrain()` or similar in [frontend/src/lib/models/indexer-queue.ts](frontend/src/lib/models/indexer-queue.ts).
- Lodash import drift — multiple `lodash/*` imports (debounce used in autosave and AppShell); consider standardizing or replacing with small helpers.
- Revision canonical edge-cases — expand integration tests around concurrent canonical updates.

**Next actions (recommended)**

- Finish the remaining per-app-spec feature rows (expand this file) and annotate owners.
- Create specific remediation PRs for: (1) revision-canonical guards tests + fixes, (2) indexer wait/drain API, (3) toolbar consolidation. Link PRs back into `docs/tech-debt.md`.
- Draft PR_DRAFT.md for Stage 3 once remediation files are scoped.

Last updated: 2026-04-08
