# GetWrite Roadmap

This document is a living stub collecting known future work items and product direction. It is updated as features are planned or completed.

---

## v1.x — Current Focus

Features actively in development or nearing completion:

- [ ] **Compile / Export** — Manuscript compilation to PDF, DOCX, and plain text; export preview modal (`CompilePreviewModal`, `ExportPreviewModal`)
- [ ] **Full-text search** — Cross-resource search with filtering by folder, status, and tags (currently backed by the inverted index; UI search bar exists)
- [ ] **Timeline view completion** — Timeline visualization of resources by `timeframe` userMetadata
- [ ] **Diff view polish** — Side-by-side revision diff view; currently renders but needs UX refinement
- [ ] **Tags UI** — Full tag management flow (create, rename, delete, assign); underlying `tags.ts` model is complete

---

## Planned (Unscheduled)

Features with a clear intent but no active implementation timeline:

- [ ] **Multi-user support** — Multiple concurrent users on the same project (future version; currently single-user only)
- [ ] **Trash recovery UI** — Visual trash bin for recovering soft-deleted resources; `softDeleteResource` already moves files to `.trash/`, but there is no recovery UI
- [ ] **Mobile / tablet responsive layout** — Progressive sidebar reduction and mobile-first writing surface; partial implementation exists

---

## Technical Debt / Infrastructure

Known improvements to internal systems:

- [ ] **Indexer: promise-based drain signal** — Replace `flushIndexer()` polling with a deterministic `waitForDrain()` API. See [docs/features/indexing.md](features/indexing.md) for details.
- [ ] **Indexer: durable meta writes** — Add optional `fsync`/`fdatasync` after writing index and backlink files to prevent data loss on sudden shutdown.
- [ ] **Indexer: graceful shutdown** — Explicit queue shutdown/flush method integrated with application lifecycle.
- [ ] **Indexer: reindex / repair CLI** — `getwrite reindex <projectRoot>` command to rebuild the inverted index and backlinks from scratch.
- [ ] **Indexer: search engine migration** — Evaluate SQLite FTS or Tantivy as a backend for larger projects where the JSON index becomes a bottleneck.

---

## Completed

- [x] Revision system (write, prune, canonical selection, preserve flag)
- [x] Backlinks system (wiki-link parsing, `BacklinkIndex`, watcher)
- [x] Project types (blank, novel, serial, article templates)
- [x] Soft-delete (`.trash/` layout via `trash.ts`)
- [x] CLI (project create, templates, prune)
- [x] Redux state management (projects, resources, revisions slices)
- [x] Metadata sidebar (notes, status, characters, locations, items, POV, orderIndex)
