# GetWrite Roadmap

This document is a living stub collecting known future work items and product direction. It is updated as features are planned or completed.

---

## v1.x — Current Focus

Features actively in development or nearing completion:

- [x] **Compile / Export** — Manuscript compilation to PDF, DOCX, and plain text; export preview modal (`CompilePreviewModal`, `ExportPreviewModal`)
- [ ] **Full-text search** — Cross-resource search with filtering by folder, status, and tags (currently backed by the inverted index; UI search bar exists)
- [ ] **Timeline view completion** — Timeline visualization of resources by `timeframe` userMetadata
- [x] **Diff view polish** — Side-by-side revision diff view; currently renders but needs UX refinement
- [ ] **Tags UI** — Full tag management flow (create, rename, delete, assign); underlying `tags.ts` model is complete

### Stage 3 — Immediate Remediation & Tech-debt Work

- Priority P0: `fix/revision-canonical-guards` — add unit + integration tests for canonical revision invariants; small guard fixes to prevent multi-canonical states. See the tech-debt inventory for details: [docs/tech-debt.md](docs/tech-debt.md).

- Priority P0: `feat/indexer-wait-drain` — add a promise-based `waitForDrain()` API, durable writes, and a reindex/repair CLI. See indexing audit in [docs/feature-audit-v1.md](docs/feature-audit-v1.md).

- Priority P1: `chore/toolbar-consolidation` — centralize toolbar command descriptors and migrate menu wiring to a config-driven renderer. See Editor Toolbar section below and tech-debt entry.

- Priority P1: `chore/lodash-import-cleanup` — repo-wide lodash path-import audit and ESLint enforcement.

These Stage 3 items are intended to be small, testable PRs that reduce high-risk maintenance burden and enable safer refactors in Tracks A–E.

---

## Planned (Unscheduled)

Features with a clear intent but no active implementation timeline:

- [ ] **Multi-user support** — Multiple concurrent users on the same project (future version; currently single-user only)
- [ ] **Trash recovery UI** — Visual trash bin for recovering soft-deleted resources; `softDeleteResource` already moves files to `.trash/`, but there is no recovery UI
- [ ] **Mobile / tablet responsive layout** — Progressive sidebar reduction and mobile-first writing surface; partial implementation exists

### Start & Project Management

- [x] Implement Start page and `CreateProjectModal` with create/open/manage actions.
- [x] Add project manage actions: copy, rename, delete, and package (confirmation modals).
- [ ] Add Storybook stories and integration tests for Start flows.

### Resource Tree & Navigation

- [x] Implement `ResourceTree` with selection, expand/collapse, and drag-and-drop reorder.
- [x] Add right-click context menu: Create/Copy/Duplicate/Delete/Export and wire persistence calls.
- [ ] Add Storybook entries and tests for selection sync, reorder persistence, and context actions.

### Work Area Views — Edit / Organizer / Data

- [x] Implement `EditView` with TipTap, debounced autosave, and revision promotion behavior.
- [ ] Implement `OrganizerView` card rendering, body toggle, and filters (Status/Character/Location/Word Count).
- [ ] Implement `DataView` with Overall Stats and foldable Resources lists (click-to-open behavior).
- [ ] Add tests and Storybook stories; ensure Edit View autosave/revision lifecycle preserved.

### Data Models & Sidecar Storage

- [x] Publish and enforce `schemas.ts` (zod) for Project, Folder, Resource, Revision, and Metadata.
- [x] Implement sidecar read/write helpers and example `resource-<id>.meta.json` files.
- [ ] Add unit tests for model validation and project-type creation/validation.

### Templates & Template CLI (detailed)

- [ ] Implement template CLI commands: `save-from-resource`, `parametrize`, `create --vars` (with `--dry-run`), `list`, `inspect`, `export`, `import`, and `validate`.
- [ ] Add example templates and unit tests for round-trip and validation.
- [ ] Document CLI usage in `specs/002-define-data-models/quickstart.md`.

### UI Skeleton, Storybook & Testing

- [ ] Complete Storybook coverage for AppShell, Start, Tree, WorkArea views, Sidebar.
- [ ] Add Vitest component/unit tests for core flows and Storybook-driven visual checks.
- [ ] Add accessibility checks (keyboard navigation, ARIA, WCAG targets) to the QA checklist.

### Drift Analysis & Refactor Execution Blueprint

- [ ] Publish `specs/004-frontend-drift-coherence/drift-inventory.md`, `style-contract.md`, `execution-blueprint.md`, and `verification-gates.md` to roadmap as planning outputs.
- [ ] Add roadmap tasks to execute Tracks A–E per the execution blueprint and link verification gates for each hotspot.
- [ ] Prioritize `resource-templates` and `revisionsSlice` as anchor tasks (Track A) in roadmap schedule.

### Refactor App Trouble Spots

- [ ] Stabilize model utilities (`resource-templates`, `schemas.ts`) and eliminate `as any` casts.
- [ ] Refactor `revisionsSlice` and `projectsSlice` with canonical guards and selector parity tests.
- [ ] Decompose `EditView`, `ResourceTree`, `AppShell`, and `ProjectTypesManagerPage` per execution blueprint and add verification gates.

### Editor Toolbar (Config-Driven)

- [ ] Define a typed `CommandDescriptor` and migrate `MenuBar` to generate UI from config.
- [ ] Consolidate color/highlight submenu wiring and shared input adapters.
- [ ] Add parity tests to prove behavior unchanged after migration.

### Token-first Styling

- [ ] Audit components for raw styling values and replace with design tokens where possible.
- [ ] Add token-first enforcement guidance to the style contract and PR checklist.
- [ ] Run visual QA and designer sign-off on token-migrated components.

### Lodash Usage Policy

- [ ] Audit repository for non-conformant lodash imports and replace with path imports or native methods.
- [ ] Add linter rule or PR checklist enforcing lodash allowlist and path-imports.
- [ ] Document the policy and remediation steps in CONTRIBUTING or style guide.

### Knowledge Tome & URL Research

- [ ] Document the knowledge-tome workflow and add templates in `/experiments-nopush`.
- [ ] Add a short roadmap item to make URL-research ingestion part of the research workflow (create-tome-on-research).
- [ ] Ensure future planning references top-level tome pages (link to `tome-002` where applicable).

---

## Technical Debt / Infrastructure

Known improvements to internal systems:

- [ ] **Indexer: promise-based drain signal** — Replace `flushIndexer()` polling with a deterministic `waitForDrain()` API. See [docs/features/indexing.md](features/indexing.md) for details.
- [ ] **Indexer: durable meta writes** — Add optional `fsync`/`fdatasync` after writing index and backlink files to prevent data loss on sudden shutdown.
- [ ] **Indexer: graceful shutdown** — Explicit queue shutdown/flush method integrated with application lifecycle.
- [ ] **Indexer: reindex / repair CLI** — `getwrite reindex <projectRoot>` command to rebuild the inverted index and backlinks from scratch.
- [ ] **Indexer: search engine migration** — Evaluate SQLite FTS or Tantivy as a backend for larger projects where the JSON index becomes a bottleneck.

### Next 90 days — Priorities

- P0: `fix/revision-canonical-guards` — owner: TBD — Goal: close invariant test gaps and land the canonical guard patch.
- P0: `feat/indexer-wait-drain` — owner: TBD — Goal: deterministic drain API and durable writes merged; add reindex CLI.
- P1: `chore/toolbar-consolidation` — owner: TBD — Goal: migrate one major toolbar group and prove parity via tests.
- P1: `chore/lodash-import-cleanup` — owner: TBD — Goal: codemod common lodash cases and add lint rule.

Linkages:

- Feature audit: [docs/feature-audit-v1.md](docs/feature-audit-v1.md)
- Tech debt: [docs/tech-debt.md](docs/tech-debt.md)

---

## Completed

- [x] Revision system (write, prune, canonical selection, preserve flag)
- [x] Backlinks system (wiki-link parsing, `BacklinkIndex`, watcher)
- [x] Project types (blank, novel, serial, article templates)
- [x] Soft-delete (`.trash/` layout via `trash.ts`)
- [x] CLI (project create, templates, prune)
- [x] Redux state management (projects, resources, revisions slices)
- [x] Metadata sidebar (notes, status, characters, locations, items, POV, orderIndex)
