# GetWrite Feature Catalog

A catalog of GetWrite's feature surface — intended, implemented, and shelved. The first section groups every feature by area, classifying each by **scope** and summarizing it. The two sections that follow give the implementation status: what is partially built, and what is fully shipped.

**Scope key:**

- **Core** — table stakes; any app of this kind is expected to have it.
- **Basic** — a simple feature that doesn't add major functionality on its own.
- **Power** — adds significant, differentiating functionality.
- **Stretch** — especially ambitious; large in scope or effort.

---

## Feature Catalog

### Projects & Workspace

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Project creation & management | Core | Start page to create, open, copy, rename, delete, and package projects. | — |
| Local-first persistence | Core | Projects, resources, and metadata persist as files on disk; there is no database. | Enforced by the model layer and API routes. |
| Project types | Basic | Scaffold a new project from a JSON spec defining folder layout and starter resources. | Validation paths could be broadened. |
| Resource templates | Basic | Reusable scaffolds for creating new resources, managed via the CLI. | Core commands only; CLI expansion planned. |
| Desktop app (Electron) | Power | Desktop shell that bundles and runs the standalone Next.js server. | — |

### Resource Tree & Navigation

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Resource tree & selection | Core | Hierarchical folder/resource tree; selecting a node opens it in the work area. | — |
| Context menu actions | Basic | Right-click create, copy, duplicate, delete, and export on tree nodes. | shadcn/Radix context menu. |
| Drag-and-drop reorder | Basic | Reorder resources and folders, with order persisted to disk. | — |
| Smart folders | Power | Saved metadata queries surfaced as folder-like rows in the tree. | — |

### Editor & Authoring

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Rich text editor | Core | TipTap-based WYSIWYG writing surface with a formatting toolbar. | — |
| Autosave | Core | Edits debounce-save to the resource's canonical revision. | Works; crash-recovery and canonical-update races need hardening. |
| Config-driven toolbar | Basic | Toolbar UI generated from typed command descriptors. | — |
| Heading & body styling | Basic | Per-project editor typography (heading scale, fonts, body line height). | — |
| Tables | Basic | Insert and edit tables within the editor. | TipTap TableKit. |
| Paste normalization | Basic | Pasted content normalized to the configured body styling. | — |

### Work Area Views

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Edit view | Core | Primary view for reading and editing a single resource. | — |
| Data view | Basic | Project-wide stats plus foldable character/location/item lists. | Some aggregation edge-cases lack tests. |
| Organizer view | Power | Card-based overview of resources with filtering. | Partial — base view and status/folder filtering shipped; character/location/word-count filters pending. |
| Diff view | Power | Side-by-side comparison of two revisions. | Word-based diffs. |
| Timeline view | Power | Chronological layout of resources by `timeframe` metadata. | Large-data performance unverified. |

### Metadata & Tagging

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Metadata sidebar | Core | Edit notes, status, characters, locations, items, POV, and timeframe per resource. | — |
| Custom metadata schema | Power | Per-project user-defined metadata fields beyond the built-ins. | — |
| Metadata queries | Power | Build and save queries over metadata fields (drive smart folders). | — |
| Tags | Basic | Project-scoped tags, created and assigned to resources. | UI covers create/delete/assign; rename available in the model only. |

### Search & Discovery

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Full-text search | Power | Cross-resource search with folder, status, and tag filters. | — |
| Inverted index | Power | Incremental per-project text index that backs search. | Drain/shutdown/reindex hardening. |
| Backlinks | Power | Wiki-link parsing and a maintained reverse-reference index. | — |
| Search across revisions | Power | Match within historical revisions and open the result in the diff view. | Partial — needs consistent latest-match selection and tests. |
| Scalable search backend | Stretch | Durable engine (SQLite FTS, Tantivy) for large projects where the JSON index strains. | Planned; under evaluation. |

### Revisions & History

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Revision system | Power | Versioned snapshots per resource with a single-canonical invariant and `preserve` flag. | — |
| Revision pruning | Basic | Cap retained revisions per resource via CLI and auto-prune. | — |
| Revision UI flows | Power | Select, compare, promote, and delete revisions from the UI. | Old-revision-then-save UX needs e2e coverage. |
| Soft-delete (trash) | Basic | Deleted resources move to `.trash/` rather than being removed. | Model layer only. |
| Trash recovery UI | Basic | Visual bin to browse, restore, and permanently purge deleted resources. | Partial — `restoreResource`/`purgeResource` exist; no UI. |

### Compile & Export

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Compile | Power | Aggregate text resources into a single manuscript, with preview. | Images included, audio excluded; ordering edge-cases need tests. |
| Export | Power | Export compiled output to PDF, DOCX, and plain text. | — |

### Resources & Media

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Text resources | Core | The primary authored unit, stored as plain text plus a TipTap document. | — |
| Image & audio resources | Basic | Add image and audio resources and render/play them in the edit view. | Partial — renderers scaffolded; creation/add flow planned. |
| Special resource folders | Power | Characters/Locations/Items/Front/Back Matter folders with metadata associations. | Partial — association cleanup on delete and rename flows need hardening. |

### Platform & Collaboration

| Feature | Scope | Description | Notes |
| --- | --- | --- | --- |
| Dark / light mode | Basic | Theme switching with a per-project color-mode preference. | — |
| Mobile / tablet layout | Stretch | Mobile-first writing surface with progressive sidebar reduction. | Partial implementation exists. |
| Multi-user collaboration | Stretch | Multiple concurrent users editing a shared project. | Planned; currently single-user only. |

---

## Partial Implementations

Features that are started but not complete. Each note describes what works and what remains.

- **Autosave** — Debounced canonical-revision saves work (`useCanonicalAutosave`). Crash/recovery behavior and concurrent canonical-update races still need coverage and hardening.
- **Organizer view** — Card rendering, body toggle, and status/folder filtering are shipped. Filtering by character, location, and word count is the remaining work.
- **Search across revisions** — The UI supports matching within revisions and opening the diff view, but selection of the latest matching revision is not consistently guaranteed; needs integration tests.
- **Trash recovery UI** — The model layer is complete (`restoreResource`, `purgeResource` in `trash.ts`); there is no UI to browse or restore trashed resources yet.
- **Image & audio resources** — Edit-view rendering (image renderer, audio player) and metadata fields exist, but the flow to add image/audio resources is not yet enabled.
- **Special resource folders** — Characters/Locations/Items/Front/Back Matter folders are referenced by templates and scaffolds; association cleanup on delete and robust rename flows need targeted tests.
- **Mobile / tablet layout** — A partial responsive implementation exists; the mobile-first writing surface and adaptive sidebars are incomplete.
- **Resource template tooling** — Core CLI commands (`save`, `create`, `duplicate`, `list`) ship today; the expanded command set (`save-from-resource`, `parametrize`, `create --vars`, `inspect`, `export`, `import`, `validate`) is planned.

---

## Implemented Features

Features that are fully shipped. Representative implementation paths are listed for the larger systems.

- **Start page & project management** — `frontend/components/Start/` (StartPage, ManageProjectMenu, CreateProjectModal).
- **Local-first persistence** — `frontend/src/lib/models/` and `frontend/app/api/`; all reads/writes go to the filesystem.
- **Project types & scaffolding** — `frontend/src/lib/models/project-creator.ts`; specs in `getwrite-config/templates/project-types/`.
- **Resource tree, context menu, reorder** — `frontend/components/ResourceTree/`; reorder persisted via the projects API.
- **Smart folders & metadata queries** — `querySlice`, `saved-queries.ts`, and the QueryBuilder UI.
- **Rich text editor** — `frontend/components/Editor/` (TipTap), with config-driven toolbar, configurable headings/body styling, tables, and paste normalization.
- **Data view, Diff view, Timeline view** — `frontend/components/WorkArea/` and `frontend/components/WorkArea/Views/`.
- **Metadata sidebar & custom schema** — `frontend/components/Sidebar/MetadataSidebar.tsx`; schema in `metadata-schema.ts` / `default-metadata-schema.ts`.
- **Tags** — `frontend/src/lib/models/tags.ts`; UI in `Sidebar/TagsSection.tsx` and `common/TagsManagerModal.tsx`.
- **Full-text search, inverted index, backlinks** — `inverted-index.ts`, `indexer-queue.ts`, `backlinks.ts`; SearchBar UI with filter panel. Index hardening: `waitForDrain`, graceful shutdown, durable writes, `reindex` CLI.
- **Revision system** — write/prune/canonical/preserve in `revision.ts`, `revision-manager.ts`, `pruneExecutor.ts`; client guards in `revision-canonical-guards.ts`; route-level single-canonical enforcement on POST/DELETE.
- **Soft-delete (trash)** — `trash.ts` moves content and sidecar into `.trash/{resources,meta}/`.
- **Compile & export** — `frontend/components/common/CompilePreviewModal.tsx`, `ExportPreviewModal.tsx`; PDF/DOCX/text output (images included, audio excluded).
- **Desktop app** — `electron/` shell spawning the standalone Next.js server.
- **Dark / light mode** — CSS token themes with a per-project `colorMode` preference.

---

_Last updated: 2026-05-25._
