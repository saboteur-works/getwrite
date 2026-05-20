# Metadata Query — Spec

> Design decisions in `decisions/`; start with `09-current-state.md`.

## Overview

GetWrite resources already carry rich metadata — POV, story dates,
statuses, tags, custom fields — but cannot be filtered on it. This
feature adds a chip-based filter UI over the existing `metadataSchema`,
file-backed saved queries, and the `SchemaManager` migration previews
needed to keep results trustworthy as the schema evolves.

## Goals

- Writers compose multi-condition filters via a two-level chip UI with
  explicit AND/OR per level.
- Every `MetadataFieldType` is queryable with type-appropriate
  operators, including `is empty` / `has any value`.
- Intrinsic resource attributes (type, folder, word count, timestamps,
  statuses, tags, backlinks) are queryable through the same UI.
- Queries persist per-project, can be named, and are reusable as smart
  folders or references inside other queries.
- `SchemaManager` gains migration previews to prevent silent schema
  breakage.

## Non-goals

- Aggregation, group-by, kanban, timeline, or chart views.
- Cross-project queries.
- Observed-field auto-detection from undeclared sidecar keys.
- Joins across `resource-ref` chains.
- Arithmetic or computed-field predicates beyond the intrinsic set.

## User stories

- As a novelist, I want to find every scene tagged `flashback` with
  POV=Mara and wordCount under 500.
- As a screenwriter, I want to filter scenes by `storyDate` between
  two in-story dates regardless of document order.
- As any writer, I want to find resources missing a required field.
- As a returning user, I want to save a filter as a smart folder that
  stays current as I edit.

## Functional requirements

1. The system **must** evaluate an AST with typed leaf predicates,
   boolean combinators (`and`, `or`, `not`), and splice nodes (`ref`,
   `param`).
2. The chip UI **must** support two levels of boolean nesting (groups
   containing chips), each with an AND/OR combinator, and degrade to
   text/AST mode when queries exceed two levels.
3. Operator menus and value pickers **must** be derived from the
   field's `MetadataFieldType`; no invalid operator/value pair **may**
   be selectable.
4. Saved queries **must** persist at `meta/queries/<uuid>.query.json`
   and be referenceable from other queries' AST.
5. The chip UI's "Add a new field…" affordance **must** open the
   prefilled `SchemaManager` form; exact and fuzzy name matches
   **must** route to the existing field.
6. The system **must** preview every type change, options update, and
   destructive field removal, listing affected sidecars and per-value
   resolutions before commit.
7. Saved-query evaluation **must** cache against a project-level
   metadata-revision counter incremented on each sidecar write.
8. The backlinks extractor **must** include `resource-ref` and
   `multi-resource-ref` values so `linksTo` / `linkedFrom` capture
   metadata refs, not only prose `[[wiki-links]]`.

## Open questions

- Whether to introduce observed fields as a future layer (default no).
- How aggregation / group-by predicates compose with the AST.
- Cycle detection rules for `ref` nodes.
- A per-resource word-count-goal schema field.

## Out of scope (deferred)

- Aggregation, group-by, kanban, timeline views over query results.
- Cross-project queries and user-global saved queries.
- Observed-field detection and promotion.
- Query-driven bulk operations on result sets.
- Previous-resource-memory sidebar UX.
