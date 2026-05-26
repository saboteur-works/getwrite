# GetWrite Roadmap

Forward-looking product direction, organized by horizon (**Now → Next → Later → Exploring**) and grouped by capability theme within each horizon. Each entry notes its current build state and links to relevant docs.

Horizons reflect priority and readiness, not committed dates. This document covers **features** only — engineering/tech-debt work lives in [tech-debt.md](tech-debt.md), and a snapshot of shipped capability is in [feature-audit-v1.md](feature-audit-v1.md).

---

## Now — In Progress

### Authoring & Editor

- **Organizer view filters** — Filtering of Organizer cards by character, location, and word count. _Status: base card view and status/folder filtering shipped; remaining filters pending._ → [user/features.md](user/features.md)

---

## Next — Committed

- **Image and Audio Resources** - Enable users to add Image and Audio resources.

### Versioning & History

- **Trash recovery UI** — A visual trash bin to browse, restore, and permanently purge soft-deleted resources. _Status: model complete (`restoreResource`/`purgeResource` in `trash.ts`), UI not started._ → [revisions.md](features/revisions.md)

---

## Later — Planned

### Templates & Scaffolding

- **Template CLI expansion** — Additional template commands: `save-from-resource`, `parametrize`, `create --vars` (with `--dry-run`), `inspect`, `export`, `import`, and `validate`. _Status: partial — `save`, `create`, `duplicate`, and `list` shipped._ → [cli.md](features/cli.md)

### Search & Discovery

- **Scalable search backend** — Evaluate a durable backend (SQLite FTS, Tantivy) to replace the JSON inverted index for large projects where it becomes a bottleneck. _Status: under evaluation._ → [indexing.md](features/indexing.md)

---

## Exploring — Ideas

### Platform

- **Mobile / tablet responsive layout** — Progressive sidebar reduction and a mobile-first writing surface. _Status: partial implementation exists._

### Collaboration

- **Multi-user editing** — Multiple concurrent users on the same project. _Status: concept; currently single-user only._

---

## Recently Shipped

A curated snapshot of recent highlights — not an exhaustive changelog.

- **Full-text search** — Cross-resource search with folder/status/tag filtering, backed by the inverted index. → [indexing.md](features/indexing.md)
- **Tags** — Project-scoped tag management plus per-resource assignment from the Metadata sidebar. → [tags.md](features/tags.md)
- **Metadata queries & smart folders** — Saved queries rendered as folder-like rows in the resource tree. → [user/metadata-queries.md](user/metadata-queries.md)
- **Compile & export** — Manuscript compilation to PDF, DOCX, and plain text with preview. → [user/compiling.md](user/compiling.md)
- **Timeline view** — Resources positioned chronologically by `timeframe` metadata.
- **Diff view** — Side-by-side revision comparison.
- **Config-driven editor toolbar** — Toolbar generated from typed command descriptors.
- **Revision system & soft-delete** — Versioned snapshots, pruning, canonical invariant, preserve flag, and `.trash/` soft-delete. → [revisions.md](features/revisions.md)
- **Backlinks** — Wiki-link parsing and a maintained reverse-reference index. → [indexing.md](features/indexing.md)
- **Indexer hardening** — Promise-based drain (`waitForDrain`), graceful shutdown, opt-in durable writes, and a `reindex` CLI command. → [indexing.md](features/indexing.md), [cli.md](features/cli.md)

---

## Related Docs

- **Tech debt & infrastructure** — [tech-debt.md](tech-debt.md)
- **Feature audit (capability snapshot)** — [feature-audit-v1.md](feature-audit-v1.md)
