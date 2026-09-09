# Feature: Authored typed entity relationships

## Overview

A novelist working with a project's declared entities can already see prose
mentions detected automatically (Feature 33) and, since Feature 37 shipped,
which other entities a given entity tends to co-occur with by shared-resource
proximity. Neither of these lets a writer assert a specific, structured fact
about how two entities relate to one another — "ally of," "parent of,"
"rival of" — as durable data independent of what the prose happens to say or
how often two names happen to appear in the same resource. This feature adds
that: a new persisted structure recording directed, typed edges between two
entity ids, created and removed through a minimal authoring surface reachable
from an entity's own sidebar section, and read through the same
project-scoped, transport-agnostic pattern the rest of the entity layer
already uses. It is an enabling slice of the parent product spec's FR-39 (the
entity relationship graph) and covers no requirement of its own; the graph
rendering that will draw these edges alongside Feature 37's derived
co-occurrence edges is a separate feature. An authored edge occupies a third
category the codebase's existing vocabulary does not already cover: it is
neither a Mention (detected in prose, never authored), nor a Backlink (an
authored link between two *resources*, undirected in kind and untyped), nor
a co-occurrence (a derived observation about shared prose proximity, never
asserted by the writer). It must be persisted, and must be identifiable, as
its own kind of fact — not folded into any of the three.

## Goals

- A novelist can assert a directed, typed relationship between two declared
  entities (e.g. "Priya — ally of -> Marcus") as durable, authored data, in
  every project — including one that has never persisted a
  relationship-type list, via a built-in default vocabulary — and can extend
  that vocabulary with their own project-specific types through a settings
  editor.
- A novelist can see every relationship an entity participates in, from that
  entity's own sidebar view, and remove one they no longer want recorded.
- An authored edge is persisted in a structure distinct from the mention
  index, the backlinks index, and the co-occurrence derivation, and is
  identifiable — by which file it lives in, not only a per-record flag — as
  something the writer asserted rather than something the system observed.
- All reads and writes to the new structure go through the same file-locking
  discipline the rest of the metadata layer already uses, so a concurrent
  operation cannot corrupt or drop an edge.
- The feature functions identically, and fully offline, on native Android and
  on web/desktop, via the ADR-021 transport-collapse pattern the entity
  layer's other reads already follow.

## Non-goals

- No graph canvas or node-and-edge rendering of any kind — that is the
  separate graph-rendering feature (product spec FR-39), which draws both
  this feature's authored edges and Feature 37's derived co-occurrence edges
  together.
- No detection, suggestion, or inference of a relationship from prose,
  detected mentions, or co-occurrence data — every edge is a writer's
  explicit assertion, consistent with the parent spec's FR-39 prohibition on
  model-backed inference anywhere in the entity layer.
- No new per-project feature flag; this feature rides the existing
  `entities` flag unchanged.
- No management UI beyond a straightforward add/remove/reorder list editor
  for the relationship-type list itself (FR-19) — no per-type icon or color
  customization, no import/export of a type list between projects, and no
  bulk relationship-type rename-with-migration of existing edges.
- No cleanup path for an edge naming a permanently deleted entity beyond
  FR-16's read-time placeholder — a project can accumulate edges naming
  entities that no longer exist, and this feature adds no sweep to remove
  them (a future `reindex`-time sweep is a candidate, not a commitment).
- No relationship-management UI beyond a minimal create/see/remove control —
  editing an existing edge's type or endpoints in place and bulk operations
  are left to a later iteration.

## User stories

- US-1: As a novelist, I want to record a typed relationship between two
  entities I already know exist so that a structural fact I know is captured
  as durable data instead of left to be reconstructed from prose or a
  co-occurrence count that can't distinguish "these two characters are
  related" from "these two characters happened to share a scene."
- US-2: As a novelist, I want to see every relationship a given entity
  participates in, from that entity's own sidebar view, so that I can review
  what I've recorded without hunting through prose or a separate surface.
- US-3: As a novelist, I want to remove a relationship I recorded in error so
  that stale or wrong structured data doesn't linger in my project.

## Functional requirements

FR-1: The product MUST introduce a new persisted structure — distinct from `meta/backlinks.json` and `meta/index/mentions.json` — recording directed, typed edges between two entity ids, so that an authored edge is identifiable as such by which file it lives in, not only by a per-record flag. Each persisted edge MUST record at minimum a stable edge id, a source entity id, a target entity id, a relationship-type value, and a creation timestamp. [US-1]

FR-2: A user MUST be able to create an edge from a source entity (the entity whose sidebar section the control is invoked from) to a target entity chosen from the project's other declared entities, with a relationship-type value drawn from the project's relationship-type list (FR-13), through a control reachable from the entity's own sidebar section, mirroring `EntitySection.tsx`'s existing alias-add control (`handleAddAlias`). [US-1]

FR-3: Edges MUST be directed: source and target are distinct roles, and the persisted record MUST preserve which entity is which, so that a future rendering surface can label or arrow the edge correctly. [US-1]

FR-4: The product MUST NOT permit an edge whose source and target are the same entity. [US-1]

FR-5: A user MUST be able to view every relationship a given entity participates in — as a source or as a target — from that entity's own sidebar view, with enough information shown (the other entity's name and the relationship type) to distinguish one edge from another. [US-2]

FR-6: A user MUST be able to remove a relationship they created, from the same view where it is displayed, without leaving any trace of it in the persisted structure. [US-3]

FR-7: Every write to the new structure MUST be serialized through the same per-project file-locking mechanism already governing `meta/backlinks.json` and `meta/index/mentions.json` writes (or an equivalent mutex consistent with `docs/standards/storage-context.md`), so a concurrent operation on the same project cannot corrupt the file or silently drop an edge. [US-1]

FR-8: Reads and writes MUST be exposed through the codebase's existing ADR-021 transport-collapse pattern — a project-scoped HTTP route, a paired in-process native backend, and a client transport module, modeled on the already-shipped `entity-cooccurrence` read-side pattern and `EntitySection.tsx`'s `updateSidecar` write-side pattern — so the feature functions identically, and fully offline, on native Android and on web/desktop. [US-1][US-2][US-3]

FR-9: The product MUST NOT infer, suggest, or auto-populate a relationship edge from prose, detected mentions, or co-occurrence data under any circumstance; every edge MUST originate from an explicit user action taken through the FR-2 control. [US-1]

FR-10: The product MUST NOT introduce a new per-project feature flag for this capability. The authoring surface and its data MUST be reachable only when the existing `entities` flag is on, consistent with the precedent set by every entity sub-feature since Feature 34 not adding a flag of its own except where a persistent, always-on rendering mode specifically warranted one. [US-1][US-2][US-3]

FR-11: A read of the new structure that encounters an edge naming an entity id no longer present among the project's currently declared entities MUST NOT throw or crash the reading surface, and MUST NOT prevent the rest of the entity's sidebar section from rendering. Such an edge MUST be displayed with a placeholder in place of the unresolvable entity's name, rather than being hidden, filtered out of the list, or removed — the same "degrade gracefully, do not silently drop" floor `mentions-core.ts`'s `resolveName` already applies when a sidecar cannot be loaded (`mentions-core.ts:88-92`, falling back to the raw id with an explicit "deleted between indexing and read" comment). This settles what OQ-2 previously left open at read time; the edge's own retention (whether it is ever cleaned up) is settled by FR-16. [US-2]

FR-12: Each persisted edge's stable id (FR-1) MUST be sufficient to remove exactly that edge (FR-6) without ambiguity, even when another edge exists between the same two entities or of the same relationship type. [US-3]

FR-13: The set of valid relationship-type values MUST be a per-project, user-extensible list, persisted in the project's own config, structurally modeled on the existing `statuses` list — a plain `z.array(z.string()).optional()` already declared at three levels in `frontend/src/lib/models/schemas.ts` (per-project config at line 238, a per-resource assigned value at line 351, and a per-project-type default seed list at line 512) — rather than a bare freeform string like `entityKind` (`schemas.ts:333-336`, which would leave no canonical set of type names for a future renderer to reason about) and rather than Feature 18's full field-definition machinery (`metadata-schema.ts`, `default-metadata-schema.ts`, `components/SchemaManager/`), which is built for arbitrary typed custom fields and is disproportionate to a single list of relationship-type names. This gives a project a stable vocabulary, so one type name means one thing throughout the project, and gives a future renderer (the graph-rendering feature) a canonical set of names to reason about rather than an open-ended set of ad hoc strings. [US-1]

FR-14: A project type MAY seed a project's initial relationship-type list with default values, mirroring how a project type may already seed the `statuses` list (`schemas.ts:512`). As of this amendment, no built-in project type under `getwrite-config/templates/project-types/` seeds `relationshipTypes` — this requirement's seeding path remains supported by the schema but is currently unused; FR-18's runtime default is what actually populates the list in every existing and newly created project today. This requirement does not require any project-type JSON to be changed. [US-1]

FR-15: An edge's relationship-type value (FR-1) MUST be one of the values in the project's *effective* relationship-type list at the time the edge is created — the persisted `config.relationshipTypes` list (FR-13) when one exists, or the FR-18 default list when none is persisted — and the creation control (FR-2) MUST NOT accept an arbitrary freeform value. The model-layer validation that enforces this and the read-side selector that populates the creation control's dropdown MUST agree on what counts as the effective list: a type the selector offers a user MUST NOT be a type the write path then rejects, and vice versa. Management of the list itself (adding, removing, and reordering relationship-type values) is specified separately in FR-19. [US-1]

FR-16: Deleting (soft-deleting) an entity MUST NOT remove, modify, or otherwise clean up any edge naming that entity as source or target. This matches the codebase's existing, verified behavior for the two other top-level indexes an entity delete already leaves untouched: `deleteResourceCore` (`resource-crud-core.ts:282-313`) calls `nullifyResourceRefs` then `softDeleteResource` and nothing else — no indexer task is enqueued, and neither `meta/backlinks.json` nor `meta/index/mentions.json` is touched. Backlinks and mention-index maintenance run only from `indexer-queue.ts`'s `runTask` (`indexer-queue.ts:180-231`), which fires on resource *save*, not delete, and from the `reindex` CLI's from-scratch rebuild. A relationships file left equally untouched on delete is therefore consistent with, not an exception to, how this codebase already handles delete today. One consequence of this choice is a benefit found by inspection rather than intended as a design goal: because an edge is never removed when its entity is soft-deleted, restoring that entity via `restoreResource` restores its relationships for free, without any per-feature restore logic of its own — unlike backlinks and mentions, which stay stale after a restore until the next save-triggered indexer run or a full `reindex`. A second consequence, stated plainly rather than left implicit: this choice has no cleanup path, so a project can accumulate edges naming entities that no longer exist and are never coming back (purged, not merely trashed). Should that prove to be a real problem, the `reindex` CLI is the obvious place to add a sweep, since it already performs a from-scratch rebuild of the other two top-level indexes; no such sweep is committed to by this requirement. [US-1][US-2]

FR-17: Creating an edge (FR-2) for a (source, target, relationship-type) triple that already exists as a persisted edge MUST be a no-op rather than create a second, duplicate record — the write path MUST check for an existing match before appending, following `assignTagToResource`'s existing idempotent-assignment pattern (`tags.ts:182-196`, which checks `includes` before pushing), since an edge is structurally closer to a tag assignment (a bounded set membership fact) than to the freeform alias string `EntitySection.tsx`'s `handleAddAlias` appends unconditionally. FR-12's stable-id requirement is unaffected: ids remain the mechanism for removing a specific edge: idempotency is a write-time rule, not a change to how edges are stored or identified. [US-1]

FR-18: The product MUST supply a built-in default relationship-type vocabulary — ally of, rival of, parent of, child of, sibling of, mentor of, member of — used as a project's effective relationship-type list whenever that project has no persisted `config.relationshipTypes`, mirroring the established `DEFAULT_METADATA_SCHEMA` runtime-fallback pattern: injected only "when a project has no persisted `config.metadataSchema`" (`default-metadata-schema.ts`'s own doc comment; the analogous fallback assignment is `metadata-schema.ts:69`, `project.config.metadataSchema = structuredClone(DEFAULT_METADATA_SCHEMA)`). This is a runtime fallback computed at read time, not seed data written into any project file: it makes edge creation usable in every existing project immediately, with no migration and no per-project write required. Each default type MUST read naturally in the directed "A — <type> — B" order the sidebar renders (FR-3), since edges are directed. [US-1]

FR-19: A user MUST be able to view, add, remove, and reorder their own project's relationship-type list from a project-settings editor in `frontend/components/preferences/`, alongside the existing `ProjectFeatureToggles.tsx` and `OrganizerCardBodySettings.tsx` project-config editors, which are this feature's sibling precedents for a settings-surface editor of a `project.json` config block. Persisting a change MUST reuse the existing `POST /api/project/features` route and its `updateFeatureConfig` model function (`frontend/src/lib/models/project-features.ts`) — which already accept and wholesale-replace two distinct config blocks, `config.features` and `config.organizerCardBody`, per that route's own doc comment ("replaces the provided block(s)") — extended with a third optional `relationshipTypes?: string[]` block, rather than adding a new route or model function. Because `feature-config-transport-service` is already one of the seven `createTransport`-collapsed services (ADR-021 Phase 1), this editor's ADR-021 native parity is inherited automatically: no new native backend and no new `next.config.mjs` alias entry are required. [US-1]

## Open questions

- OQ-1 (resolved): a per-project extensible list of relationship types.
  Modeled on `statuses`, the closest structural analogue already in this
  codebase — a plain `z.array(z.string()).optional()` declared at three
  levels in `frontend/src/lib/models/schemas.ts` (per-project config at line
  238, a per-resource assigned value at line 351, and a per-project-type
  default seed list at line 512). This is deliberately *not* Feature 18's
  metadata-schema field-definition machinery (`metadata-schema.ts`,
  `default-metadata-schema.ts`, `components/SchemaManager/`), which is built
  for arbitrary typed custom fields and is disproportionate to a single list
  of type names, and *not* a bare freeform string like `entityKind`
  (`schemas.ts:333-336`), which would leave no canonical set of type names
  at all. Two reasons drove the choice: a project gets a stable vocabulary,
  so one type name means one thing throughout the project, rather than
  "ally" and "Ally" and "allies of" all coexisting as unrelated strings; and
  a canonical set of names exists for a future renderer (the graph-rendering
  feature) to reason about, rather than an open-ended set it would have to
  treat as opaque text. — Impact: FR-1, FR-2, FR-13, FR-14, FR-15.
- OQ-2 (resolved): edges are left stale on delete; reads degrade gracefully.
  This matches what the codebase already does for its other two top-level
  indexes, verified rather than assumed: `nullifyResourceRefs`
  (`trash.ts:76-136`) scans only `meta/resource-*.meta.json` sidecars and
  patches `ResourceRef` values nested in each sidecar's `userMetadata` via
  `patchRef` (`trash.ts:35-60`) — it never touches `meta/backlinks.json` or
  `meta/index/mentions.json`. `deleteResourceCore`
  (`resource-crud-core.ts:282-313`) calls `nullifyResourceRefs` then
  `softDeleteResource` and nothing else: no indexer task is enqueued, no
  backlinks recompute, no mention-index write. Backlinks and mention-index
  maintenance run only from `indexer-queue.ts`'s `runTask`
  (`indexer-queue.ts:180-231`), which fires on resource *save*, not delete,
  and from the `reindex` CLI's from-scratch rebuild. Both existing top-level
  indexes are therefore already left stale on delete, and reads already
  tolerate it: `mentions-core.ts`'s `resolveName` (`mentions-core.ts:88-92`)
  falls back to the raw id when a sidecar cannot be loaded, with an explicit
  "deleted between indexing and read" comment. This feature's relationships
  file follows the same shape (FR-16), and FR-11 now specifies the read-time
  consequence directly: a dangling edge renders with a placeholder rather
  than being hidden. A genuine, unplanned benefit of this choice: because an
  edge is never removed when its entity is soft-deleted, restoring that
  entity via `restoreResource` restores its relationships for free, with no
  restore logic of this feature's own — unlike backlinks and mentions, which
  stay stale after a restore until the next save-triggered indexer run or a
  full `reindex`. What this choice does *not* do, stated plainly: there is
  no cleanup path, so a project can accumulate edges naming entities that
  were permanently purged, not merely trashed. If that becomes a real
  problem, a sweep during `reindex` is the obvious candidate, since
  `reindex` already performs a from-scratch rebuild of the other two
  top-level indexes — no such sweep is committed to here. — Impact: FR-1,
  FR-11, FR-16.
- OQ-3 (resolved): minimal create / list / remove, no edit-in-place. Mirrors
  `EntitySection.tsx`'s alias UI, the sibling surface a relationships editor
  sits beside — it supports add (`handleAddAlias`, `EntitySection.tsx:100-105`)
  and remove (`handleRemoveAlias`, `EntitySection.tsx:107-109`) but no
  edit-in-place of an existing alias's text. This feature ships the same
  shape: no edit-in-place of an edge's type or endpoints, no reordering
  (edges are not inherently ordered), and no filtered target picker.
  Correcting a mistyped relationship therefore means removing the edge and
  re-creating it — an accepted limitation, not an oversight. — Impact: FR-2,
  FR-5, FR-6.
- OQ-4 (resolved): idempotent on the (source, target, type) triple. Adding
  an edge that already exists with the same source, target, and
  relationship type is a no-op rather than a second record (FR-17). Follows
  `assignTagToResource` (`tags.ts:182-196`), documented and implemented as
  idempotent via an `includes` check before pushing — an edge is
  structurally closer to a tag assignment (a bounded set-membership fact)
  than to the freeform alias string `handleAddAlias` appends with no
  duplicate check. FR-12's stable-id requirement is not weakened by this:
  ids remain the removal mechanism; idempotency is a write-time rule, not a
  change to the storage model. — Impact: FR-2, FR-12, FR-17.
- OQ-5 (resolved): no automatic inverse edges. Every direction is its own
  authored edge. This follows from FR-9's own text rather than being a
  separate preference: FR-9 requires every edge to originate from "an
  explicit user action taken through the FR-2 control," and an
  automatically created reverse edge is one the writer never took that
  action for — one they also could not remove independently without
  violating FR-6/FR-12's guarantee of removing exactly one edge without
  ambiguity, since a reverse edge would have to be deleted in lockstep with
  its counterpart or else become an orphaned exception to that guarantee.
  This is recorded as a consistency consequence of FR-9, not a new rule.
  Whether a *renderer* chooses to display certain relationship types as
  visually symmetric without persisting a second edge is the
  graph-rendering feature's decision and stays explicitly out of scope here.
  — Impact: FR-3, FR-9.

## Out of scope (deferred)

- A node-and-edge graph or canvas rendering of authored edges — the separate
  graph-rendering feature (product spec FR-39), which draws both this
  feature's edges and Feature 37's derived co-occurrence edges together,
  visually distinguished.
- Per-type icon or color customization, import/export of a relationship-type
  list between projects, and bulk relationship-type rename-with-migration of
  existing edges — the list editor itself (FR-19) is in scope.
- Any sweep or cleanup of edges naming a permanently deleted entity; FR-16
  leaves them in place indefinitely, degrading gracefully at read time
  rather than being removed (OQ-2).
- Editing an existing edge's type or endpoints in place; the minimal surface
  this feature ships only creates and removes edges (OQ-3).
- Any automatic reverse or implied edge — every direction is authored
  separately, with no display-layer symmetry decided here (OQ-5).
- Bulk relationship authoring or import of many edges at once.
