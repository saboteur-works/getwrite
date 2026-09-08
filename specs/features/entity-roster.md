# Feature: Project-level entity roster

## Overview

A writer who has declared dozens of entities (FR-35) today can only see them
one resource's sidebar at a time — there is no project-wide view of every
declared entity as a set. This feature adds a sixth top-level work-area view,
the entity roster, that lists every declared entity in the project alongside
data already computed elsewhere: its mention count from the mention index, and
any ambiguous-alias or common-word warnings the alias table and warning
heuristics already compute but which entity highlighting (FR-36) confines to
the inline editor decoration. The roster's headline use case is letting a
writer spot an entity that was declared and never mentioned anywhere — a
finding otherwise invisible without opening every resource in turn. The roster
is read-only and introduces no new entity-declaration mechanism, no new
persisted data, and no new feature flag.

## Goals

- A writer can see every declared entity in the project as a single list,
  without opening each entity's resource individually.
- A writer can immediately identify an entity with zero mentions anywhere in
  the project.
- A writer can see, per entity, whether any of its aliases are flagged as
  ambiguous (claimed by another entity) or noise-prone (short/common-word),
  without opening the editor and toggling entity highlighting.
- Activating an entity's row takes the writer directly to that entity's alias
  editor, reusing the existing declaration and write path unchanged.
- The roster works identically, and fully offline, on web, desktop, and native
  Android.

## Non-goals

- This feature does not add any way to declare, edit, or delete an entity or
  its aliases from within the roster — all declaration editing continues to
  happen only in `EntitySection`, reached by navigating to the entity's
  resource.
- This feature does not add a new per-project feature flag; it rides the
  existing `entities` flag (FR-35).
- This feature does not compute or persist any new data — mention counts and
  warnings are read from `mention-index.ts`/`mentions-core.ts` and
  `entity-alias-table.ts`/`entity-alias-warnings.ts` exactly as already built
  for other surfaces.
- This feature does not add filtering, sorting controls, search, or grouping
  by `entityKind` beyond the single default ordering specified below — those
  are candidate future refinements, not part of this slice.
- This feature does not change how entity highlighting (FR-36) or
  entity-scoped compile (FR-37) present ambiguity/warning information at
  their own surfaces; the roster is an additional summary view, not a
  replacement for either.

## User stories

- US-1: As a novelist with dozens of declared characters and places, I want to
  see every declared entity as one list, so that I can review my project's
  entities as a set instead of one resource's sidebar at a time.
- US-2: As a novelist, I want to spot an entity I declared but never actually
  used anywhere in the manuscript, so that I can either write it in or remove
  the stale declaration.
- US-3: As a novelist, I want to see which of my entities have an ambiguous or
  noise-prone alias, so that I can fix it without switching into the editor
  and toggling entity highlighting to find the same information passage by
  passage.
- US-4: As a novelist, I want to click an entity in the roster and land
  straight on its alias editor, so that reviewing the roster and fixing a
  declaration is a two-step action, not a hunt through the resource tree.

## Functional requirements

FR-1: The work area MUST provide a sixth top-level view, the entity roster, selectable from `ViewSwitcher.tsx` alongside Edit, Organizer, Data, Diff, and Timeline, requiring `ViewName` (`frontend/src/lib/models/types.ts`) and `VIEW_OPTIONS` to gain a sixth entry and `AppShell.tsx`'s `switch (view)` dispatch to gain a corresponding case rendering a new `EntityRosterView` component under `frontend/components/WorkArea/Views/`, following the structural precedent of `OrganizerView`/`TimelineView` (a project-wide, cross-resource view with no resource-tree selection dependency). [US-1]

FR-2: The roster tab MUST be disabled, with a hover/`title` explanation consistent with the existing `disabledViews`/`disabledReasons` mechanism `ViewSwitcher.tsx` already exposes (the same pattern `timeline` uses), whenever the project's `entities` feature flag is off. The roster MUST introduce no feature flag of its own. [US-1]

FR-3: The roster MUST list every entity in the project's `EntityAliasTable` (`entity-alias-table.ts`'s `buildEntityAliasTable`, read via the existing `entityAliasTableSlice` cache — no new fetch is introduced for this data), rendering, per entity: its name, its declared aliases, and a per-row label showing its `entityKind` so a reader can scan kinds visually. This label MUST NOT group, section, sort, or filter entities by kind — grouping/sectioning by kind remains deferred (see Out of scope). [US-1]

FR-4: The roster's default order MUST be alphabetical by entity name (case-insensitive), with no user-facing sort or filter control in this feature. [US-1]

FR-5: The roster MUST show, per entity, both how many times it is mentioned and how many resources those mentions are spread across, because either number alone misleads: an entity named 593 times across 32 scenes and one named twice in those same 32 scenes are indistinguishable on a resource count, while two entities with equal totals — one concentrated in a single chapter, one threaded through the book — are indistinguishable on a mention total. "Mention" here MUST carry the sense the glossary gives it: a prose occurrence of the entity's name or an alias, recorded with a character offset. The roster MUST visually and textually distinguish an entity with zero mentions from one with at least one — not merely by displaying "0", which is easy to skim past in a dense list — so that a zero-mention entity is identifiable at a glance (US-2). Both counts MUST be derived from the existing mention index and MUST NOT be separately computed or persisted. [US-2]

FR-6: The roster MUST obtain a mention count for every declared entity in the project through a single, bounded client-to-server round trip that does not scale one-to-one with the entity count — the existing client-facing read (`getEntityMentionedIn` via `lib/api/mentions.ts`) is per-entity, and issuing one call per entity for a project with hundreds of declared entities is the N+1 pattern this requirement rules out. This MUST be met by a new `getProjectMentionCounts(projectRoot): Promise<Record<string, EntityMentionCounts>>` function in `frontend/src/lib/models/mentions-core.ts` that loads the mention index once and reuses the already-exported `invertMentionIndex` (`frontend/src/lib/models/mention-index.ts:67-79`) — no second index-reading code path. Each entity's `mentions` MUST be the sum of its records' `count` fields (which `mention-index.ts` guarantees equals `offsets.length`), and its `resources` MUST be the number of *distinct* `resourceId`s among those records. Neither may be taken as `byEntity[entityId].length`: that counts index records, which is the resource total only so long as the index holds exactly one record per (resource, entity) pair — a property `MentionIndex`'s type does not enforce — and is never the mention total. An earlier revision of this requirement specified exactly that expression, and the roster consequently displayed a resource count under the label "mentions". It MUST be exposed with the same project-scoped, one-call three-piece transport shape the codebase already uses for the entity alias table: a project-scoped HTTP route modelled on `frontend/app/api/project/[project-id]/entity-alias-table/route.ts`, a paired native backend modelled on `frontend/src/store/transport/native-entity-alias-table-backend.ts` (plus its `.web-stub.ts` and a `turbopack.resolveAlias` entry in `next.config.mjs`, per ADR-021), and a client transport module modelled on `frontend/src/lib/api/entity-alias-table.ts`, built on the shared `createTransport` collapse. Extending the existing `mentioned-in` route with a batch `entityIds` parameter is explicitly rejected: that route keys on a single entity id in its URL segment, and `getEntityMentionedIn` does per-resource content loads, name resolution, ambiguity, and snippet work a bare count does not need. [US-1][US-2]

FR-7: The roster MUST show, per entity, whether any of its terms (name or aliases) appear in `entity-alias-table.ts`'s `claimedBy` map (ambiguous — claimed by another entity as well) and whether any of its aliases trigger `entity-alias-warnings.ts`'s `getAliasWarning` (short or common-word), using data already available from the existing `entityAliasTableSlice` cache with no new fetch. [US-3]

FR-8: Where an entity has one or both of the FR-7 conditions, the roster MUST disclose, in text (not color alone), which condition(s) apply — ambiguous claim, noise-prone alias, or both. This text MUST be folded into the entity row's accessible name (see FR-12), not exposed only via hover/`title` on a non-focusable element, so a keyboard or screen-reader user receives it on focus without hovering — reinforcing, not replacing, the "text, not color alone" requirement. The roster's warning indicator MUST NOT use the reserved position/canonical-state color token (`#D44040` / `red`), consistent with entity highlighting's FR-7 and this codebase's styling convention. [US-3]

FR-9: The roster MUST distinguish, for FR-7/FR-8 purposes, between the two conditions using the same shared "needs attention" treatment convention entity highlighting establishes (one visual state covering both conditions, disclosed via the row's accessible name per FR-8) rather than inventing a third, roster-specific visual language for the same underlying data. [US-3]

FR-10: Activating an entity's row (by pointer click or by keyboard when the row has focus and Enter/Space is pressed) MUST navigate to that entity's resource (`setSelectedResourceId`, `resourcesSlice.ts`) and open the existing `EntitySection` alias editor, reusing the existing `updateSidecar` write path unchanged. The roster itself MUST NOT expose any control that edits an entity's name, `entityKind`, or aliases. [US-4]

FR-11: When the project's `entities` feature flag is on but no resource in the project has `entityKind` set, the roster MUST render a non-error empty state explaining that no entities have been declared yet, rather than an empty table with only column headers. [US-1]

FR-12: Each entity row MUST be reachable by its accessible role and name, and MUST be operable by keyboard alone, per the project's WCAG 2.1 AA target. The row MUST reuse the existing pattern in `frontend/components/WorkArea/ResourceListItem.tsx:45-56` — an `<li>` wrapping a full-width native `<button type="button">` covering the row's click area — already consumed by `StubResourcesSection.tsx` and `DataView.tsx`; a native `<button>` gets accessible role, accessible name, and Enter/Space activation without custom ARIA, per `docs/standards/accessibility.md` §2's preference for a native element over a `<div>` with handlers. The roster MUST NOT invent a `role="row"` grid pattern instead. Where FR-8's warning text applies, it MUST be folded into this same button's accessible name (e.g. via visually-hidden text or an `aria-label`/`aria-describedby` composed with the entity's name); there MUST NOT be a nested interactive control inside the row's button, since that is invalid HTML and would break the one-focusable-unit-per-row requirement. [US-1][US-3][US-4]

FR-13: The roster MUST function identically, and fully offline, on native Android and on web/desktop, reusing the existing native-parity transport for the alias table (`native-entity-alias-table-backend.ts`) and the FR-6 mention-counts native backend without introducing any native-specific gap. [US-1]

FR-14: The roster MUST NOT introduce any new persisted data, new entity-declaration mechanism, or model-backed/NER inference — consistent with the product spec's FR-38 constraints, it reuses FR-35's sidecar `entityKind`/`aliases` and the already-computed alias table and mention index unchanged. [US-1]

## Open questions

None. The four open questions raised while drafting this spec (the FR-6 bulk
mention-count mechanism, virtualization/paging at scale, grouping/filtering
by `entityKind`, and the FR-12 row/warning-disclosure pattern) were resolved
by product-owner decision and by evidence from the existing codebase, and
folded into FR-3, FR-6, FR-8, FR-9, FR-12, and FR-13 above; the deferred
virtualization/paging and grouping/filtering questions are also recorded in
"Out of scope (deferred)" below.

## Out of scope (deferred)

- Inline editing of an entity's name, `entityKind`, or aliases from within the
  roster (FR-10) — all editing continues to happen in `EntitySection`.
- Sorting, filtering, search, or grouping controls beyond the single default
  alphabetical order (FR-4) — a future refinement if usage shows the need.
- Grouping or sectioning entities by `entityKind`. This is not a free win:
  `entityKind` is an open, user-definable string, not an enum
  (`frontend/src/lib/models/schemas.ts:320-336`, where the comment records
  this as a closed design decision from the entity-layer gate), so a project
  with ad hoc or inconsistently-capitalized kinds could produce many
  one-entity groups that scan worse than a flat list.
- Any new feature flag; the roster rides the existing `entities` flag (FR-2).
- Any new persisted index or data — mention counts and warnings are computed
  the roster reads already exist (FR-6, FR-7, FR-14).
- Virtualization or pagination. This was originally a decision made in the
  absence of measurement rather than a performance claim; the deferred
  benchmark has since been run (2026-09-07, POS `task_733deea7`), and the
  numbers are recorded in
  `specs/features/entity-roster/virtualization-benchmark-notes.md`. Measured
  at 100/500/1,000 entities: scroll cost is flat and independent of list
  length (8.3 ms median frame interval at every size, no frame over 20 ms in
  180), and the only cost that grows is the one-time mount, linear at
  ~0.43 ms per entity in a development build (433 ms at 1,000). The decision
  stands on measurement now, not on its absence. The harness is
  `frontend/tests/entityRosterRenderBenchmark.test.tsx` (React/jsdom half)
  plus the browser procedure the notes describe.
- A relationship graph, co-occurrence view, or any cross-entity analysis
  beyond the flat per-entity list this feature specifies.
