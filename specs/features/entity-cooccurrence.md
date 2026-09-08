# Feature: Derived co-occurrence relationship data

## Overview

A novelist viewing one entity's own sidebar view can already see every
resource that entity is mentioned or linked in (FR-10/FR-12 of
`specs/features/entity-layer.md`), but nothing today surfaces which *other*
declared entities tend to appear in those same resources — "who does this
character usually share a scene with." This feature adds that as a pure
derivation over the mention index already built for entity detection: for a
pair of declared entities that both have at least one detected mention in
the same resource, the number of resources they share. No new data is
persisted and no new write path is introduced — the mention index
(`meta/index/mentions.json`) already records every `(entityId, resourceId)`
occurrence this derivation needs. This feature is an enabling slice of the
parent product spec's FR-39 (project-level entity relationship graph) and
covers no requirement of its own; FR-39 is covered in full by the separate
graph-rendering feature. The derivation is exposed as a project-scoped read
and given one minimal, genuinely usable display — an "Also appears with"
text list on the entity's own sidebar view — so this feature ships something
a writer can use on its own, independent of the graph canvas or of Feature
38's authored typed relationships.

## Goals

- A writer viewing a declared entity's sidebar can see which other declared
  entities most often share a resource with it, without opening a graph.
- The co-occurrence data is derived entirely from the existing mention
  index, with no new persisted structure and no new write path.
- The read works identically, and fully offline, on web, desktop, and
  native Android, via the existing ADR-021 transport-collapse pattern.
- A co-occurrence entry reads as an observation about shared prose
  proximity — never as an asserted relationship, and never visually
  confused with an authored link.
- The read's output shape is reusable, without a second derivation, as one
  of the graph-rendering feature's two edge sources.

## Non-goals

- No node-and-edge graph or canvas rendering of any kind — that is the
  separate graph-rendering feature (product spec FR-39).
- No authored, typed, directed relationship data, schema, or editing
  surface — that is the separate authored-relationships feature.
- No new per-project feature flag; this feature rides the existing
  `entities` flag unchanged.
- No new persisted index, sidecar field, or write path.
- No proximity- or scene-level weighting of co-occurrence using
  `MentionRecord`'s character offsets — sharing a resource is the entire
  unit of co-occurrence in this feature (see Open questions).
- No navigation or other interactivity from a co-occurrence entry; the
  display added by this feature is plain text.

## User stories

- US-1: As a novelist, I want to see which other declared entities usually
  appear alongside a given entity, so that I can notice prose-level
  relationships between my characters without opening a graph or authoring
  anything.

## Functional requirements

FR-1: `frontend/src/lib/models/mentions-core.ts` MUST gain a new project-scoped, transport-agnostic read — a sibling of the existing `getProjectMentionCounts`, not an extension of it or of `getEntityMentionedIn` — that returns, for every declared entity that co-occurs with at least one other declared entity, the set of other entities it co-occurs with, each with a count and the resource ids the count is drawn from. This resolves the question left open in `specs/product/getwrite.features.md`'s Open Questions (whether this read is a new function or an extension of an existing one): `getProjectMentionCounts` returns per-entity totals, not pairs, and `getEntityMentionedIn` is scoped to one entity and does per-resource content loads, name resolution, and snippet work a bare pairwise count does not need, so neither shape fits. The new function MUST load the mention index once and derive pairs via `invertMentionIndex` (`frontend/src/lib/models/mention-index.ts:67-79`) grouped by `resourceId`, with no second index-reading code path. [US-1]

FR-2: A co-occurrence between two entities MUST be counted only from detected `MentionRecord`s in the mention index — sharing a resource where both are mentioned. A resource where one entity is only explicitly linked (`isLinked` with no corresponding `isMentioned` in `getEntityMentionedIn`'s sense) MUST NOT be counted, consistent with the glossary's Mention/Backlinks distinction: a Mention is detected and never authored, a Backlink is authored and never detected, and the two are stored separately and merged only for display, never conflated. This feature performs no merge with `backlinks.json` at all. This is narrower than `specs/product/getwrite.features.md`'s Feature 37 entry, whose Vertical slice described the display as computed "across the same merged resource set this component already fetches via `getEntityMentionedIn`" — that merged set unions mention-index rows with `backlinks.json` and is doc-commented in `mentions-core.ts:298-317` as the one place mentions and links are merged *for display*. Counting a link-only resource toward co-occurrence would assert prose proximity between two entities from an authored link alone — a new fact derived by conflating Mention and Backlink, which the glossary rules out. The feature-list entry has been corrected to match this requirement. [US-1]

FR-3: Co-occurrence pairs MUST be unordered and between two distinct entities; an entity MUST NOT be recorded as co-occurring with itself. [US-1]

FR-4: An entity with no detected mention sharing a resource with any other declared entity's mention MUST be absent from the returned structure entirely (no zero-count entry) — mirroring `getProjectMentionCounts`'s existing convention of omitting a zero-mention entity rather than defaulting it in the read layer. This is distinct from, and MUST NOT be conflated with, an entity having zero mentions altogether (`EntityMentionCounts`): an entity can be heavily mentioned yet co-occur with no other declared entity, if every resource that mentions it mentions no other entity. [US-1]

FR-5: The read MUST be exposed with the same project-scoped, one-call transport shape the codebase already uses for `getProjectMentionCounts`: a project-scoped HTTP route under `frontend/app/api/project/[project-id]/`, a paired native backend modelled on `frontend/src/store/transport/native-entity-mention-counts-backend.ts` (plus its `.web-stub.ts` and a `turbopack.resolveAlias` entry in `next.config.mjs`, per ADR-021), and a client transport module modelled on `frontend/src/lib/api/entity-mention-counts.ts`, built on the shared `createTransport` collapse. This introduces no new persisted data and no new write path. [US-1]

FR-6: `EntityMentionsSection.tsx` MUST render an "Also appears with" text list for the selected entity, naming each other entity it co-occurs with (resolved via the existing alias-table name lookup) and the shared-resource count (e.g. "Also appears with: Priya (3), Marcus (1)"), computed from the read added in FR-1 restricted to the selected entity's own id — not from `rows`' merged `isLinked`/`isMentioned` resource-id set, per FR-2. The list MUST be ordered by count descending, with ties broken alphabetically (case-insensitive) by name, matching the roster's existing tie-break convention. [US-1]

FR-7: When the selected entity has no co-occurring entity (FR-4), the "Also appears with" list MUST NOT render at all — no line, heading, or static empty-state message — consistent with `EntityMentionsSection.tsx`'s existing documented convention of no static "nothing here" state. [US-1]

FR-8: The "Also appears with" list and its entries MUST be presented as an observation about shared prose proximity, not as an assertion of relationship, and MUST NOT reuse or visually resemble the "Linked"/"Mentioned" badge vocabulary `EntityMentionsSection.tsx` already uses for authored links and detected mentions, so a reader cannot mistake a co-occurrence entry for an authored relationship (which does not yet exist in the product; see the separate authored-relationships feature). [US-1]

FR-9: The list MUST be exposed as an accessible list (e.g. `<ul>` with an `aria-label` distinct from the existing `entity-mentions-list`, following that same attribute's naming convention) so it is reachable by screen reader and keyboard navigation on par with the rest of the section, per `docs/standards/accessibility.md`. Because the list is non-interactive plain text (FR-6, and no navigation per Non-goals), no additional focus-management or activation behavior is required beyond correct list semantics. [US-1]

FR-10: The feature MUST function identically, and fully offline, on native Android and on web/desktop, via the FR-5 native backend, introducing no native-specific gap. It MUST introduce no new per-project feature flag, riding the existing `entities` flag unchanged. [US-1]

## Open questions

OQ-1 (resolved): `MentionRecord` carries a character offset for every occurrence, but FR-2 counts co-occurrence purely by shared `resourceId`, ignoring proximity between two entities' offsets within that resource — should a future refinement weight or filter co-occurrence by offset proximity instead? No. Co-occurrence is same-resource only; offsets are not used to weight or filter it. This is an accepted limitation, stated plainly: in a long manuscript, two entities that never share a scene but each appear once somewhere in the same resource are reported as co-occurring. The two alternatives were rejected on their own terms rather than for convenience. An offset-distance threshold would need an arbitrary character distance with no basis in paragraph or scene structure — plain-text offsets carry no knowledge of where a scene break falls. True scene- or paragraph-level proximity would require loading and parsing each shared resource's content, the same per-resource content load `buildMentionedRow` pays for snippets (`mentions-core.ts:201-235`) — exactly the cost FR-1's project-wide, index-only derivation was scoped to avoid. — Impact: FR-2.

OQ-2 (resolved): Is any cap or truncation needed on the "Also appears with" list (FR-6)? No — the list is uncapped. No comparable convention exists in this codebase for truncating a list of named entities: the caps that do exist are different UIs solving different problems — `ResourceCommandPalette.tsx:50,58`'s limit bounds a fuzzy-search dropdown's candidate set, `execute-search.ts`'s `PROXIMITY_CANDIDATE_LIMIT` is an internal search-ranking cutoff, and `resource-persistence.ts`'s truncation is a content-preview length limit — none of them bound a rendered list of entity names. `EntityMentionsSection.tsx`'s own existing resource list and its sibling `EntitiesMentionedSection.tsx` both already render unbounded lists today. Any cap number introduced here would be invented, not derived from precedent. FR-6's single comma-separated line is also far less dense than a per-row layout would be, which lowers the cost of an unusually long list. This can be revisited if a real project is found to produce an unreadable list. — Impact: FR-6.

OQ-3 (resolved as a process decision, not a performance verdict): Are the performance characteristics of the FR-1 derivation at scale acceptable? Deferred to POS task `task_f6153d5a`, in the same spirit `specs/features/entity-roster.md` recorded its virtualization deferral — a decision made in the absence of measurement, not a performance claim. Nothing about this derivation's speed, cost, or acceptability at scale is asserted here. Triage also corrected the cost model this open question was originally framed against: `MentionIndex` is keyed by `resourceId` (`mention-index.ts:24-28`), so pairs form *per resource* as `C(k,2)` where `k` is the number of entities co-mentioned in that one resource — the worst case is therefore high entity density within a single resource, not a large project-wide entity roster, which is a materially different and less likely pathology than the quadratic-in-entity-count framing this question originally carried. The measurement that would settle it, per `specs/features/entity-roster/virtualization-benchmark-notes.md`'s method: time the FR-1 derivation's construction varying both total entity count and per-resource entity density (the dimension that actually drives its cost), as a Node-side timing harness only — no DOM or Playwright pass is needed, since this derivation has no rendering component, which makes the harness cheaper than the roster's. — Impact: FR-1, FR-5, and the graph-rendering feature's dependency on the same read.

OQ-4 (resolved): Is the FR-1 read's exact return shape reusable by the graph-rendering feature's co-occurrence edges without a second derivation? Yes, with the confidence stated honestly: FR-3 already guarantees unordered, non-reflexive pairs, which is exactly what an undirected graph edge needs, and reshaping into an edge list is a single O(edges) pass to enumerate each pair once, since the per-entity map necessarily records both directions of a pair. This is a well-grounded expectation, not a verified fit — the graph-rendering feature is undesigned, and no graph-library edge-shape requirement exists yet to check this against. — Impact: FR-1, and the graph-rendering feature's dependency on it.

## Out of scope (deferred)

- A node-and-edge graph or canvas rendering of co-occurrence data — the
  separate graph-rendering feature (product spec FR-39).
- Authored, typed, directed relationship data, its schema, and its
  authoring surface — the separate authored-relationships feature.
- Making a co-occurrence entry clickable to navigate to the named entity's
  own resource, mirroring the activate-to-navigate convention the entity
  roster and this same component's own list already use. This feature
  ships a plain-text list only.
- Proximity- or scene-level weighting of co-occurrence using mention
  offsets (see OQ-1).
- Any cap, pagination, or "and N more" truncation of the "Also appears
  with" list (see OQ-2).
- Any new per-project feature flag; this feature rides the existing
  `entities` flag.
- Surfacing co-occurrence data anywhere other than `EntityMentionsSection.tsx`
  (e.g. the entity roster's per-row display), which was rejected at the
  product-spec-level feature partition as a materially heavier read and a
  UI density problem the roster's compact row layout does not have room
  for.
