# Feature 69: Entity graph kind encoding and visual-consistency pass

Note: this spec groups two requirements (FR-52, FR-53) the owner explicitly
decided to defer together from Feature 68's planning round
(`specs/product/getwrite.features.md`, Feature 69), not this document
corpus's default one-FR-one-feature split. The two pieces share the same
`EntityGraphCanvas.tsx`/`EntityGraphAccessibleList.tsx`/
`EntityGraphSettingsPanel.tsx` surface but are otherwise independent and may
be built/reviewed in either order.

## Overview

The entity relationship graph (Feature 39) renders every node identically
regardless of its declared entity's `entityKind` (FR-35), so a writer can
only tell a character from a place or faction node by reading its label.
Separately, the graph's own chrome — nodes, edges, canvas background, the
settings panel, reset-view button, and tooltip overlay (all shipped or
extended by Feature 68) — was built functionally, deferring brand-token and
typography alignment with the rest of the product, and in the owner's own
words "looks and feels clunky." This feature adds a writer-customizable
per-kind color+shape encoding to the graph's nodes, and separately brings the
graph's existing chrome into alignment with this product's established
visual system, without changing what the graph does or shows.

## Goals

- A writer can tell one `entityKind` apart from another on the graph by
  color and shape together, not label-reading alone, for every kind in use.
- A writer can customize which color and shape each kind renders as, through
  a dedicated modal, with zero action required for a kind to already render
  distinctly from every other kind.
- The kind-to-color/shape mapping is legible through three independent
  channels at once: a legend, a canvas tooltip, and accessible-list text.
- The graph's existing chrome (not its interactions, not its information)
  reads as part of the same product as the rest of GetWrite, confirmed by
  the owner's own qualitative sign-off against a built implementation.

## Non-goals

- Any change to the graph's connection-type model, position persistence, or
  focal-point selection (Feature 68) — this feature only adds kind-driven
  node styling and restyles existing chrome on top of that surface.
- Any new interaction, control, or information surface on the graph beyond
  the kind-encoding pieces listed here — FR-53 restyles what already
  renders and adds no new chrome.
- A fixed, non-customizable color/shape palette — `entityKind` is an open,
  per-project, writer-defined vocabulary (FR-35), so no single palette can
  cover every project; customization is required, not optional polish.
- A new per-project feature flag — both pieces ride the existing `entities`
  flag, per FR-52/FR-53's explicit text.
- Redesigning the tag-management modal (`TagsManagerModal.tsx`) itself —
  this feature only models its new modal's structure on it.

## User stories

- US-1: As a novelist, I want to see character, place, and faction nodes rendered visibly different from each other on the graph, so that I can read my cast's structure at a glance rather than hovering or clicking each node.
- US-2: As a novelist, I want to choose which color and shape each of my
  own entity kinds renders as, so that the encoding matches how I already
  think about my story's cast.
- US-3: As a novelist, I want to see a newly introduced kind already look distinct from every other kind before I've customized anything, so that the graph never becomes ambiguous just because I added a new kind.
- US-4: As a novelist, I want to look up what a node's color and shape mean
  without leaving the canvas, so that I don't have to keep the customization
  modal open just to read the graph.
- US-5: As a screen-reader user, I want to have an entity's kind disclosed as text in the accessible list, so that the color/shape encoding is not the only way to know a node's kind.
- US-6: As a product owner, I want to review the graph's restyled chrome against a built implementation before it's considered finished, so that "done" reflects my own judgment of the result rather than a predefined checklist nobody confirmed actually looks right.

## Functional requirements

### Kind encoding (FR-52)

FR-1: Every node on the entity relationship graph MUST be visually distinguished by its declared entity's `entityKind` using both a color and a shape together — never color alone, and never shape alone. Resolved 2026-10-04 (OQ-1): the shape dimension MUST draw from a fixed, non-project-configurable set of six shapes — circle, square, diamond, triangle, hexagon, and star; a project-configurable shape list was considered and explicitly rejected for this feature, logged as a possible future addition rather than built now. [US-1]
FR-2: The product MUST persist a per-project, writer-customizable mapping from each `entityKind` in use to a color and a shape. Resolved 2026-10-04 (OQ-2): the color dimension MUST use a new, parallel `--entity-kind-*` color token set rather than reusing `--timeline-pov-0..7`, mirroring the entity-highlight tokens' own-namespace precedent, with separate light-mode (higher-contrast) and dark-mode (softer) values per slot mirroring the Timeline palette's structural pattern. Resolved 2026-10-04 (OQ-5): the mapping MUST be persisted at a new sibling file, `meta/entity-graph-kind-styles.json`, mirroring `entity-graph-positions.ts`'s whole-file-array pattern (not `entity-graph-settings-core.ts`'s `ProjectConfigSchema`-scalar-field pattern) — a Zod-validated array keyed by `entityKind`, read-modify-write guarded by `withMetaLock`. [US-2]
FR-3: A writer MUST be able to open a dedicated kind-to-color/shape customization modal from the graph view, structurally modeled on `TagsManagerModal.tsx` — listing each kind with a color swatch and a shape picker. Resolved 2026-10-04 (OQ-1): the shape picker MUST offer exactly the fixed six-shape set — circle, square, diamond, triangle, hexagon, star. Resolved 2026-10-04 (OQ-2): the color swatch MUST draw from the new, parallel `--entity-kind-*` token set. Resolved 2026-10-04 (OQ-4): the modal's row list MUST be driven by kinds that have ever been configured (persisted in the kind-style mapping), not simply kinds currently in use, and MUST include a separate "new/unmapped" section surfacing, live, any declared entity's `entityKind` that is in use but has no persisted mapping yet, making the OQ-1/OQ-3 fallback-default treatment explicit and actionable. [US-2]
FR-4: Changing a kind's color or shape in the customization modal MUST persist immediately and MUST be reflected on the canvas, in the legend, and in the accessible list without requiring a reload, mirroring `EntityGraphSettingsPanel.tsx`'s immediate-persist-and-reflect pattern established in Feature 68. Resolved 2026-10-04 (OQ-4): customizing a kind from the "new/unmapped" section MUST move it into the ever-configured row list on save, since the modal's listing is driven by kinds ever configured rather than kinds currently in use. Resolved 2026-10-04 (OQ-5): a change MUST write through to `meta/entity-graph-kind-styles.json` via the `createTransport`-backed read/write pair named in FR-9. [US-2]
FR-5: A declared entity whose `entityKind` has no assigned mapping yet MUST render with a deterministic, hash-assigned shape — stable across reloads and sessions for the same kind — paired with a neutral default color, so every unmapped kind is immediately distinct from every other unmapped kind with zero writer action. Resolved 2026-10-04 (OQ-1): the hash assignment MUST draw from the fixed six-shape set (circle, square, diamond, triangle, hexagon, star). Resolved 2026-10-04 (OQ-3): the hash MUST be a standard string hash (djb2 or FNV-1a) computed over the raw `entityKind` string, modulo six, so the fallback shape depends only on the kind string itself and is stable across reloads, devices, and discovery order. [US-3]
FR-6: The customization modal MUST include a static legend disclosing every kind's current color+shape mapping as the authoritative full reference, including kinds still on the FR-5 default treatment. Resolved 2026-10-04 (OQ-1): the legend's shape column MUST render using the fixed six-shape set. Resolved 2026-10-04 (OQ-2): the legend's color column MUST render using the new `--entity-kind-*` token set. Resolved 2026-10-04 (OQ-4): the legend MUST cover both the ever-configured row list and the live "new/unmapped" section, so every kind in use is represented even before it has been explicitly customized. [US-4]
FR-7: Hovering (mouse) or tapping (touch) a node on the canvas MUST show a tooltip disclosing that node's `entityKind` and its color/shape mapping, mirroring the existing edge-tooltip mechanism (`entityGraphTooltipOverlay.css`, `EntityGraphCanvas.tsx`'s edge-hover pattern). [US-4]
FR-8: Each node's entry in the synchronized accessible list (`EntityGraphAccessibleList.tsx`) MUST disclose that entity's `entityKind` as text, extending the precedent `edgeDescriptions.ts` already sets for edge-kind disclosure. [US-5]
FR-9: The kind-to-color/shape mapping's read and write MUST be resolved through `createTransport` (ADR-021), each with its own native backend and web-stub, and MUST validate its HTTP response body, per the FR-8/FR-50 transport-boundary precedent this product already applies to every new per-project transport (Feature 68's own FR-8/FR-14 citing the same constraint). Resolved 2026-10-04 (OQ-5): the triad MUST mirror `entity-graph-positions.ts`/`lib/api/entity-graph-positions.ts`/`store/transport/native-entity-graph-positions-backend.ts` exactly — a new `entity-graph-kind-styles.ts` model module, a sibling `lib/api/entity-graph-kind-styles.ts` transport, and a `store/transport/native-entity-graph-kind-styles-backend.ts` (+ `.web-stub.ts`) pair. [US-2]
FR-10: This feature's kind-encoding pieces MUST ride the existing per-project `entities` feature flag and MUST NOT introduce a flag of their own. [US-1][US-2][US-3][US-4][US-5]

### Visual-consistency pass (FR-53)

FR-11: The graph's existing node style, edge style, canvas background, settings panel and reset-view button (`EntityGraphSettingsPanel.tsx` and its neighboring controls), and tooltip overlay (`entityGraphTooltipOverlay.css`) MUST be restyled to use this product's `--color-gw-*` brand token system and IBM Plex Sans/Mono/Serif typography in place of any non-token value found in those files, without changing which information any of them presents. Resolved 2026-10-04 (OQ-2): this `--color-gw-*` requirement governs the graph's chrome (background, panel, buttons, tooltip surface) only — a node's own fill color is driven by the separate, parallel `--entity-kind-*` token set introduced for FR-2, not `--color-gw-*` or `--timeline-pov-0..7`. Resolved 2026-10-04 (OQ-6): `entityGraphTooltipOverlay.css`'s raw-`rgba()` `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)` MUST be removed entirely and replaced with a token-based, non-shadow elevation treatment, consistent with this product's documented D10 decision ("no drop shadows — elevation via surface color only"); the identical shadow in `QueryBuilder/value-picker.css`'s sibling popover is explicitly OUT OF SCOPE for this feature and will remain inconsistent until a separate pass addresses it. [US-6]
FR-12: This restyling pass MUST NOT introduce any new interaction, control, or chrome element, and MUST NOT remove or change the meaning of any information currently shown on the graph, its settings panel, or its tooltips. [US-6]
FR-13: This restyling pass MUST preserve the reserved-red constraint (red is reserved for position/canonical-state indicators, never decoration) and MUST support both dark and light mode, consistent with every other already-token-compliant surface in the product. Resolved 2026-10-04 (OQ-6): the FR-11 drop-shadow removal on `entityGraphTooltipOverlay.css` MUST itself support both dark and light mode via the same token-based elevation treatment, not a mode-specific shadow value. [US-6]
FR-14: The entity relationship graph's rendered chrome MUST NOT be considered complete for this requirement until the product owner has reviewed a built implementation and given qualitative sign-off; this feature's task breakdown MUST include an explicit owner review/sign-off step near the end of the work, and completion MUST NOT be self-certified by an implementor against a predefined checklist in place of that review. Resolved 2026-10-04 (OQ-7): sign-off MUST happen incrementally per restyled element (nodes, edges, the settings panel/reset-view chrome, and the tooltip overlay) as each is completed during implementation, PLUS one final holistic sign-off once all four are done and visible together — not a single end-of-work review only; this feature's task breakdown MUST include multiple owner-review checkpoints accordingly. [US-6]
FR-15: This feature's visual-consistency pieces MUST ride the existing per-project `entities` feature flag and MUST NOT introduce a flag of their own. [US-6]

## Open questions

- OQ-1 (resolved): Which concrete SVG shapes make up the shape set FR-1/FR-5 draw from (circle plus some combination of square, diamond, triangle, hexagon, etc.), and is that set a fixed constant or a project-configurable count — enough entries that FR-5's hash assignment rarely needs to repeat a shape across unrelated kinds in the same project?
**Resolution:** A fixed, non-project-configurable set of six shapes — circle, square, diamond, triangle, hexagon, and star. A project-configurable shape list was explicitly considered and rejected for this feature; it is logged here as a possible future addition, not built in this feature.
**Evidence:** Owner decision at Gate 3 triage, 2026-10-04.
**Impact:** FR-1, FR-3, FR-5, FR-6.

- OQ-2 (resolved): Does the FR-1/FR-2 color dimension reuse the existing `--timeline-pov-0` through `--timeline-pov-7` 8-slot categorical palette (`frontend/styles/getwrite-utilities.css`, already tuned separately for light/dark mode), get its own parallel `--entity-kind-*` token set, or extend the Timeline set with additional slots shared by both features?
**Resolution:** A new, parallel `--entity-kind-*` color token set, not a reuse of `--timeline-pov-0..7` and not a shared extension of it — following this codebase's established convention of giving each feature its own semantically-named token namespace rather than cross-feature reuse, with the entity-highlight tokens' own separate pair (not reused from diff-added/removed despite visual similarity) as the cited precedent. The token set mirrors the Timeline palette's structural pattern of separate light-mode (higher-contrast) and dark-mode (softer) values per slot.
**Evidence:** Owner decision at Gate 3 triage, 2026-10-04.
**Impact:** FR-2, FR-3, FR-6, FR-11.

- OQ-3 (resolved): What hash function and input (e.g. a stable hash of the `entityKind` string itself, modulo the shape-set size from OQ-1) does FR-5's deterministic shape assignment use, and is it specified precisely enough that a project reopened later — or opened on a different device — always re-derives the identical fallback shape for the same kind rather than a re-randomized one?
**Resolution:** A standard string hash (djb2 or FNV-1a) computed over the raw `entityKind` string, modulo six (the OQ-1 shape-set size), for deterministic unmapped-kind shape assignment. This is stable across reloads and devices because it depends only on the kind string itself, not on discovery order or any other runtime state.
**Evidence:** Owner decision at Gate 3 triage, 2026-10-04.
**Impact:** FR-5.

- OQ-4 (resolved): What is the customization modal's exact field layout and copy (FR-3/FR-6), and how does it list a kind that is configured but currently has zero declared entities, versus a kind with declared entities but no configuration row yet — is the row list driven by kinds currently in use, kinds ever configured, or the union of both?
**Resolution:** The modal's main row list is driven by kinds that have ever been configured (persisted in the kind-style mapping), not simply kinds currently in use. A separate, live "new/unmapped" section in the same modal surfaces any declared entity's `entityKind` that is in use but has no persisted mapping yet, making the OQ-1/OQ-3 fallback-default kinds explicit and actionable for the writer to customize rather than silently relying on the default with no visible prompt to change it.
**Evidence:** Owner decision at Gate 3 triage, 2026-10-04.
**Impact:** FR-3, FR-4, FR-6.

- OQ-5 (resolved): What persisted shape and module does the FR-2 per-kind mapping use — a new sibling file under `meta/` mirroring `meta/entity-graph-positions.json`'s or `relationships.json`'s whole-file load/persist shape, a new field on `ProjectConfigSchema`, or something else — and what is the specific `createTransport` module/native-backend/web-stub triad (FR-9) that reads and writes it?
**Resolution:** Mirror `entity-graph-positions.ts`'s pattern, not `entity-graph-settings-core.ts`'s `ProjectConfigSchema`-scalar-field pattern: a new sibling file, `meta/entity-graph-kind-styles.json`, holding a Zod-validated whole-file array keyed by `entityKind`, read-modify-write guarded by `withMetaLock`. The transport triad mirrors `entity-graph-positions.ts`/`lib/api/entity-graph-positions.ts`/`store/transport/native-entity-graph-positions-backend.ts` exactly, including HTTP response schema validation per the transport-boundary constraint this product applies to every new transport.
**Evidence:** Owner decision at Gate 3 triage, 2026-10-04.
**Impact:** FR-2, FR-4, FR-9.

- OQ-6 (resolved): `entityGraphTooltipOverlay.css` currently sets `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)`, a drop shadow using a raw `rgba()` value rather than a `--color-gw-*` token — this appears to conflict with this codebase's own D10 design decision ("no drop shadows — elevation via surface color only," `docs/superpowers/plans/2026-03-23-styling-migration.md`), which every other restyled surface in the product already follows. Does FR-11's restyling pass remove this box-shadow entirely (matching D10), or is the tooltip overlay treated as an intentional, documented exception?
**Resolution:** Remove the box-shadow entirely as part of FR-11's restyle, replacing it with a token-based, non-shadow elevation treatment consistent with D10. This is a genuine pre-existing violation copied forward from `QueryBuilder/value-picker.css`'s identical pattern (a directory the earlier styling-migration pass never touched), not a documented exception — the only documented exemption is focus-ring box-shadows, which this isn't. The identical shadow in `value-picker.css`'s sibling popover is explicitly OUT OF SCOPE for this feature (FR-11 only covers the entity relationship graph's own chrome) and will remain inconsistent until/unless a separate pass addresses it — flagged for the record, not silently expanded into this feature's scope.
**Evidence:** Owner decision at Gate 3 triage, 2026-10-04.
**Impact:** FR-11, FR-13.

- OQ-7 (resolved): FR-14's review step calls for qualitative owner sign-off against a built implementation — does that review happen once, over the whole restyled surface at the end of FR-53's task list, or incrementally per restyled element (nodes, then edges, then panel, then tooltip) as each is completed?
**Resolution:** Both — incremental sign-off per restyled element (nodes, edges, the settings panel/reset-view chrome, and the tooltip overlay) as each is completed during implementation, plus a final holistic sign-off once all four are done and visible together, not a single end-of-work review only. FR-14's own text, and this feature's eventual task breakdown, must include multiple owner-review checkpoints accordingly, not one gate at the very end.
**Evidence:** Owner decision at Gate 3 triage, 2026-10-04.
**Impact:** FR-14.

## Out of scope (deferred)

- Any change to Feature 68's connection-type list, position persistence, or
  focal-point selection — this feature only adds kind-driven node styling
  and restyles existing chrome on top of that already-shipped surface.
- A general visual-system overhaul beyond the graph's own already-existing
  rendered elements — FR-53 is scoped narrowly to token/typography/mode
  alignment of what already renders.
- Filtering, search, or grouping by `entityKind` on the graph (e.g. hiding
  all nodes of a given kind) — remains a deferred future refinement per
  Feature 39's own Out of scope, unaffected by this feature's styling-only
  encoding.
- A predefined, objective pass/fail checklist for FR-53's "done" bar —
  explicitly rejected in favor of FR-14's qualitative owner sign-off, per
  the product spec's resolved OQ-56.
