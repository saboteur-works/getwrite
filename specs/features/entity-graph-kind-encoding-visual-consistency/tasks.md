# Tasks: Entity graph kind encoding and visual-consistency pass

Source spec: `specs/features/entity-graph-kind-encoding-visual-consistency.md`
(Feature 69, schema `sab.feature-spec/1`, all 15 FRs and all 7 Open Questions
resolved as of 2026-10-04).

Granularity: story points (1/2/3/5/8).

Structural note: this task list covers two independently-ordered halves the
spec itself groups together — kind encoding (FR-1–10, Tasks 1–11) and the
visual-consistency pass (FR-11–15, Tasks 12–20). The spec's own intro states
the two may be built/reviewed in either order; this list sequences
kind-encoding first because the visual-consistency pass's node/tooltip
restyle tasks read more naturally against an already-styled node (shape +
kind color already in place), but the two halves share no code dependency
and could be reordered without changing any task's content.

Per FR-14/OQ-7, the visual-consistency pass (Tasks 12–20) is NOT closed by a
single end-of-work review. Each restyled element (nodes, edges, settings
panel/reset-view chrome, tooltip overlay) gets its own restyle task
immediately followed by its own owner sign-off checkpoint task, run in
sequence — the next element's restyle task does not start until the prior
element's sign-off checkpoint is marked done. Task 20 is the separate, final
holistic sign-off once all four are done and visible together.

---

### Task 1: `--entity-kind-*` token set and six-shape SVG primitives
**What:** Adds the new, parallel `--entity-kind-*` color token set (light/dark pairs per slot, mirroring the `--timeline-pov-0..7` structural pattern in `frontend/styles/getwrite-utilities.css`) and a shared, framework-free module defining the fixed six-shape set (circle, square, diamond, triangle, hexagon, star) as reusable SVG path/geometry definitions.
**Files:** `frontend/styles/getwrite-utilities.css` (new `--entity-kind-*` block, light + dark); new `frontend/components/WorkArea/Views/EntityRelationshipGraphView/entityKindShapes.ts` (or similar) exporting the six shape renderers/geometry and a typed `ENTITY_KIND_SHAPES` constant.
**Done when:** The new token set exists with distinct light-mode (higher-contrast) and dark-mode (softer) values for a slot count the implementor judges sufficient (the spec does not fix a slot count, only that both modes exist and mirror the Timeline palette's structure); the six-shape module exports one renderable definition per shape, each visually distinct at the node's existing render size, with no project-configurable extension point (OQ-1 forecloses that).
**Depends on:** none
**Estimate:** 3
**Done:** [ ]
**Notes:** Concrete token hex values and the exact shape geometry are implementation-level choices the spec deliberately left open (OQ-1/OQ-2 fix the *shape set* and *that a new namespace exists*, not literal values). Per the task-breakdown guidance, propose concrete values here but treat them as provisional until exercised in Task 20's holistic sign-off — a color/shape choice that reads wrong once real data is on screen is a legitimate reason to revisit this task's output later, not a sign this task did something wrong. Declaring the `--entity-kind-*` hex values as CSS custom-property declarations in `getwrite-utilities.css` is exactly the exemption Rule 1 of `frontend/scripts/check-no-hardcoded-hex.mjs` covers (a `--some-var: #hex` declaration itself), so this task needs no `GW-HEX-EXEMPT` marker — only Task 8's later JS-side consumption of these tokens must avoid a raw hex literal.

### Task 2: Kind-style persistence model module
**What:** Adds `entity-graph-kind-styles.ts`, a new sibling model module persisting the per-project `entityKind` → color-slot/shape mapping at `meta/entity-graph-kind-styles.json`, mirroring `entity-graph-positions.ts`'s whole-file-array load/persist shape exactly (Zod-validated array keyed by `entityKind`, `withMetaLock`-guarded read-modify-write, ENOENT tolerance on load, rethrow on malformed/corrupt file). The persisted color field is a token-slot reference only — a stable identifier such as `"entity-kind-0"` or an integer slot index into Task 1's `--entity-kind-*` set — never a raw hex color string, so a kind's color always resolves through the live `--entity-kind-N` CSS custom property (including picking up any future palette retuning) rather than freezing a snapshot hex value at save time.
**Files:** new `frontend/src/lib/models/entity-graph-kind-styles.ts`.
**Done when:** `loadEntityGraphKindStyles` returns `[]` on ENOENT and rethrows on a malformed file; an upsert function sets/replaces one kind's style record in a single `withMetaLock` call; the record schema requires `entityKind`, a color **token-slot reference** (not a hex string — the schema must reject a `#rrggbb`-shaped value), and a shape value drawn from Task 1's six-shape set; a corrupt or hand-edited file fails loudly rather than silently degrading, matching `entity-graph-positions.ts`'s documented boundary-validation floor.
**Depends on:** Task 1 (shape set as the schema's enum)
**Estimate:** 3
**Done:** [ ]
**Notes:** Per OQ-5, this explicitly does NOT touch `ProjectConfigSchema` or `entity-graph-settings-core.ts`'s scalar-field pattern — it is its own sibling file.

### Task 3: HTTP API route for kind-style mapping
**What:** Adds the GET (list)/PUT (upsert) API route backing the kind-style mapping, mirroring `app/api/project/entity-graph-positions/route.ts`'s structure and error handling.
**Files:** new `frontend/app/api/project/entity-graph-kind-styles/route.ts`.
**Done when:** `GET ?projectId=` returns every persisted kind-style record for the project; `PUT` upserts one kind's color-slot reference/shape (per Task 2, the color field is always a token-slot reference such as `"entity-kind-0"`, never a raw hex string) and returns the saved record; both validate `projectId` via the standard `validateProjectId`/`respondInvalidProjectId` guard and resolve the project root the same way the positions route does (no client-supplied `projectRoot`).
**Depends on:** Task 2
**Estimate:** 2
**Done:** [ ]

### Task 4: Kind-style transport triad (`createTransport` + native backend + web-stub + response validation)
**What:** Adds the full ADR-021 transport triad for the kind-style mapping — `lib/api/entity-graph-kind-styles.ts` (HTTP transport, `createTransport`-resolved, validating its HTTP response body per the FR-9/Feature 48-51 precedent), `store/transport/native-entity-graph-kind-styles-backend.ts` (in-process native backend over Task 2's model functions), and its `.web-stub.ts` counterpart — mirroring `entity-graph-positions.ts`/`lib/api/entity-graph-positions.ts`/`native-entity-graph-positions-backend.ts` exactly, including the reject-on-any-failure contract (a failed read must never read as "no styles configured yet").
**Files:** new `frontend/src/lib/api/entity-graph-kind-styles.ts`; new response schemas in `frontend/src/lib/api/schemas.ts` (e.g. `EntityGraphKindStyleRecordResponseSchema`, `EntityGraphKindStylesListResponseSchema`); new `frontend/src/store/transport/native-entity-graph-kind-styles-backend.ts` + `.web-stub.ts`; `frontend/next.config.mjs`'s `turbopack.resolveAlias` entry for the new backend specifier.
**Done when:** `getEntityGraphKindStyles`/`saveEntityGraphKindStyle` resolve correctly on both the HTTP path (validated response, rejects on malformed body) and a native-path unit test using the in-process backend; the web-stub throws if ever reached, matching the positions precedent; the new alias entry is present in `next.config.mjs` alongside the existing native-backend aliases; the new response schemas validate the color field as a token-slot reference (per Task 2 — a string/integer slot identifier such as `"entity-kind-0"`), never a raw hex string, so no hex color literal crosses the transport boundary at any point in this triad.
**Depends on:** Task 2, Task 3
**Estimate:** 5
**Done:** [ ]

### Task 5: Deterministic fallback shape hash utility
**What:** Adds a pure, dependency-free function computing an unmapped `entityKind`'s deterministic fallback shape via a standard string hash (djb2 or FNV-1a) over the raw `entityKind` string, modulo six, paired with a fixed neutral default color — stable across reloads, devices, and discovery order (FR-5, OQ-3).
**Files:** new `frontend/src/lib/models/entity-kind-fallback-style.ts` (or colocated with Task 1's shape module); unit tests in `frontend/tests/`.
**Done when:** The function returns the identical shape for the identical `entityKind` string across repeated calls and simulated "different device" (fresh module state) runs; a unit test asserts this for a representative sample of kind strings, including two kinds whose hashes collide onto the same shape (an accepted outcome per FR-5's own "zero writer action" framing, not a bug) and confirms the neutral default color is applied, not a Task 1 kind-token color.
**Depends on:** Task 1
**Estimate:** 2
**Done:** [ ]

### Task 6: Customization modal — row list, new/unmapped section, color/shape editing
**What:** Adds the dedicated kind-to-color/shape customization modal, structurally modeled on `TagsManagerModal.tsx`: a main row list driven by every `entityKind` ever persisted in the kind-style mapping (not merely kinds currently in use), each row with a Task-1-token color swatch and a Task-1-shape picker constrained to the fixed six-shape set; plus a separate, live "new/unmapped" section surfacing any declared entity's `entityKind` in use but with no persisted mapping yet (OQ-4). Saving a row persists immediately via Task 4's transport.
**Files:** new `frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityKindStylesModal.tsx` (or similar); Storybook story per `docs/standards/storybook-implementation.md`.
**Done when:** Opening the modal with a project that has declared entities of kinds both configured and unconfigured shows both sections correctly populated; editing a configured kind's color or shape persists via Task 4 and the modal's own state reflects the save without a reload; saving a kind from the "new/unmapped" section moves it into the main row list without a reload (OQ-4); the color swatch and shape picker only ever offer Task 1's token set / six-shape set, never an arbitrary value.
**Depends on:** Task 4, Task 1
**Estimate:** 5
**Done:** [ ]
**Notes:** Non-goal explicitly excludes redesigning `TagsManagerModal.tsx` itself — this task only models structure on it (its layout/list/row-action conventions), not its code.

### Task 7: Customization modal — static legend and graph-view entry point
**What:** Adds the modal's static legend disclosing every kind's current color+shape mapping as the authoritative full reference (covering both the ever-configured list and the live new/unmapped section, including kinds still on Task 5's default treatment), and wires a button/entry point into the graph view that opens the modal, gated behind the existing `entities` feature flag with no new flag introduced (FR-10).
**Files:** Task 6's modal file (legend section); `frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityRelationshipGraphView.tsx` (entry-point button, flag gate).
**Done when:** The legend lists every kind currently represented in the project (configured or not) with its live color+shape; the entry-point control is present and opens the modal only when `selectIsFeatureEnabled(..., "entities")` is true, mirroring how other `entities`-gated controls in this view are already conditioned; the control does not render at all when the flag is off.
**Depends on:** Task 6
**Estimate:** 2
**Done:** [ ]

### Task 8: Canvas — per-kind node color and shape rendering
**What:** Changes each node's SVG rendering in `EntityGraphCanvas.tsx` from a uniform circle to a shape drawn from Task 1's six-shape set, colored from Task 4's persisted kind-style mapping when one exists for that node's `entityKind`, or Task 5's deterministic hash-assigned fallback shape + neutral color otherwise — both color and shape always applied together, never either alone (FR-1). Node color MUST be applied via an inline `style={{ fill: "var(--entity-kind-N)" }}` (resolving the persisted token-slot reference to its CSS custom property name at render time), mirroring the exact pattern this same file already uses for `--color-gw-secondary`/`--color-gw-primary` elsewhere (e.g. its existing edge/node `style={{ fill: ... }}` / `style={{ stroke: ... }}` usages) — never a JS lookup object/array mapping slot index to a literal hex string, which would itself fail `frontend/scripts/check-no-hardcoded-hex.mjs` (the CI `hex-color-check` job) despite the goal being to eliminate hardcoded hex.
**Files:** `frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx`.
**Done when:** Two nodes of different `entityKind` with no configured mapping render with visibly different shapes (verified against Task 5's hash); a node whose kind has a saved mapping renders exactly that color+shape; changing a mapping in Task 6's modal updates the canvas's rendering without a reload (FR-4); existing node interactions (selection ring, drag, activation, focal-point dimming) are unchanged by this task — only the node's own fill/outline shape changes, not its hit-testing or transform logic; node color is applied exclusively via inline `style={{ fill: "var(--entity-kind-N)" }}`, with no JS object/array mapping a slot to a hex string anywhere in the diff; `pnpm run check:no-hex` (the CI `hex-color-check` job, `frontend/scripts/check-no-hardcoded-hex.mjs`) passes against this task's changes with no new `GW-HEX-EXEMPT` marker introduced.
**Depends on:** Task 4, Task 5, Task 1
**Estimate:** 5
**Done:** [ ]

### Task 9: Canvas — node hover/tap tooltip discloses kind mapping
**What:** Extends the canvas's existing edge-hover tooltip mechanism (`entityGraphTooltipOverlay.css`, the edge-hover pattern in `EntityGraphCanvas.tsx`) to nodes: hovering (mouse) or tapping (touch) a node shows a tooltip disclosing that node's `entityKind` and its current color/shape mapping (FR-7).
**Files:** `frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx`; reuses `entityGraphTooltipOverlay.css` (styling changes to this file belong to Task 18, not here).
**Done when:** Hovering a node on desktop and tapping a node on touch both show a tooltip naming the entity's kind and describing its mapping (e.g. "character — teal diamond"); the tooltip dismisses on the same hover-leave/second-tap rules the existing edge tooltip already uses; no existing edge-tooltip behavior regresses.
**Depends on:** Task 8
**Estimate:** 3
**Done:** [ ]

### Task 10: Accessible list — disclose entity kind as text
**What:** Extends `EntityGraphAccessibleList.tsx` so each node's list entry discloses that entity's `entityKind` as plain text, extending the precedent `edgeDescriptions.ts` already sets for edge-kind disclosure (FR-8).
**Files:** `frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphAccessibleList.tsx`.
**Done when:** Every node's accessible-list entry includes its `entityKind` as readable text (an entity with no declared kind — should that be possible in this view — is handled with an explicit "no kind" label rather than an empty or missing string); existing focal-point/hop-radius disclosure text is unchanged by this addition.
**Depends on:** none (node data already carries `entityKind`)
**Estimate:** 2
**Done:** [ ]

### Task 11: End-to-end verification — kind encoding
**What:** A verification pass confirming the kind-encoding half of the feature (FR-1–10) works coherently across all three disclosure channels and both runtime paths: legend, canvas tooltip, and accessible list agree on the same mapping for a given kind; the `entities`-flag gate holds; the native transport backend is exercised, not just the HTTP path.
**Files:** none required beyond the already-listed components; may add integration/unit tests under `frontend/tests/` if gaps are found.
**Done when:** A manual or automated check confirms a single kind's color/shape mapping, once changed in the modal, reads identically in the legend, the canvas tooltip, and the accessible-list text with no reload; the native backend's `getEntityGraphKindStyles`/`saveEntityGraphKindStyle` are confirmed to exercise the same model functions as the HTTP route; the `entities` flag off hides every kind-encoding entry point added in Tasks 6–10.
**Depends on:** Task 4, Task 6, Task 7, Task 8, Task 9, Task 10
**Estimate:** 3
**Done:** [ ]

### Task 12: Visual-consistency pass — restyle node chrome
**What:** Restyles the node rendering's non-kind-token visual elements (selection ring, hover hint affordance, label typography) in `EntityGraphCanvas.tsx` to use `--color-gw-*` brand tokens and IBM Plex Sans/Mono typography in place of any non-token value, without changing the node's own kind-driven fill/shape (Task 8) or any information it presents (FR-11, FR-12).
**Files:** `frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx`.
**Done when:** Every non-token color/typography value in the node-rendering code path (selection ring, hover hint, label text) is replaced with a `--color-gw-*` token or IBM Plex font reference; `--color-gw-red` is not newly introduced for decoration; no interaction, control, or information changes.
**Depends on:** Task 8
**Estimate:** 3
**Done:** [ ]

### Task 13: Owner sign-off checkpoint — nodes
**What:** Presents the restyled node chrome (Task 12) to the product owner, alongside Task 8's kind-encoding rendering, for incremental qualitative sign-off per FR-14/OQ-7, before edge restyling (Task 14) begins.
**Files:** none (review checkpoint; record the outcome in this tasks file or a linked note).
**Done when:** The product owner has reviewed a built, running implementation of the restyled nodes and explicitly signed off — or requested changes, in which case Task 12 is reopened and this checkpoint repeats before Task 14 starts. Sign-off is not self-certified by an implementor against a checklist.
**Depends on:** Task 12
**Estimate:** 1
**Done:** [ ]
**Notes:** This is a real gate, not a formality — Task 14 must not start until this is checked off with an actual owner sign-off, not an assumed one.

### Task 14: Visual-consistency pass — restyle edge chrome
**What:** Restyles edge rendering (stroke colors, arrowhead marker, any edge-adjacent label typography) in `EntityGraphCanvas.tsx` to brand tokens and IBM Plex typography, preserving every existing per-kind dash/width/opacity encoding and information (FR-11, FR-12, FR-13's reserved-red constraint).
**Files:** `frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx`.
**Done when:** Every non-token color value in the edge-rendering code path is replaced with a `--color-gw-*` token; the five edge kinds' existing dash-pattern/width/opacity distinctions (Feature 68) are visually unchanged; `--color-gw-red` is not used for any edge.
**Depends on:** Task 13
**Estimate:** 2
**Done:** [ ]

### Task 15: Owner sign-off checkpoint — edges
**What:** Presents the restyled edge chrome (Task 14) to the product owner for incremental qualitative sign-off before settings-panel/reset-view restyling (Task 16) begins.
**Files:** none (review checkpoint).
**Done when:** The product owner has reviewed a built, running implementation of the restyled edges (alongside the already-signed-off nodes) and explicitly signed off, or requested changes that reopen Task 14.
**Depends on:** Task 14
**Estimate:** 1
**Done:** [ ]

### Task 16: Visual-consistency pass — restyle settings panel and reset-view chrome
**What:** Restyles `EntityGraphSettingsPanel.tsx` and its neighboring reset-view button to brand tokens and IBM Plex typography in place of any non-token value, without adding, removing, or renaming any control or changing what information it presents (FR-11, FR-12).
**Files:** `frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphSettingsPanel.tsx`; its reset-view button's host (likely `EntityGraphCanvas.tsx` or `EntityRelationshipGraphView.tsx`, wherever that button lives today).
**Done when:** Every non-token color/typography value in the settings panel and reset-view button is replaced with a `--color-gw-*` token/IBM Plex reference; the panel's existing controls (connection-type toggles, hop-radius field) are functionally and informationally unchanged; both dark and light mode render correctly (FR-13).
**Depends on:** Task 15
**Estimate:** 3
**Done:** [ ]

### Task 17: Owner sign-off checkpoint — settings panel and reset-view
**What:** Presents the restyled settings panel/reset-view chrome (Task 16) to the product owner for incremental qualitative sign-off before tooltip-overlay restyling (Task 18) begins.
**Files:** none (review checkpoint).
**Done when:** The product owner has reviewed a built, running implementation of the restyled settings panel/reset-view (alongside the already-signed-off nodes and edges) and explicitly signed off, or requested changes that reopen Task 16.
**Depends on:** Task 16
**Estimate:** 1
**Done:** [ ]

### Task 18: Visual-consistency pass — restyle tooltip overlay, remove drop shadow
**What:** Restyles `entityGraphTooltipOverlay.css` to brand tokens/typography and removes its `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)` entirely, per the resolved OQ-6/D10 constraint, replacing it with a token-based, non-shadow elevation treatment that supports both dark and light mode (FR-11, FR-13). The identical shadow in `QueryBuilder/value-picker.css` is explicitly out of scope and must not be touched by this task.
**Files:** `frontend/components/WorkArea/Views/EntityRelationshipGraphView/entityGraphTooltipOverlay.css`.
**Done when:** The `box-shadow` declaration is gone from this file; elevation is instead conveyed via a `--color-gw-*` surface-color token (e.g. a distinct chrome/surface tier), verified in both dark and light mode; `frontend/components/QueryBuilder/value-picker.css`'s matching shadow is unchanged; the tooltip still discloses the exact same text (edge descriptions from Task 9 and the pre-existing edge tooltip) with no information change.
**Depends on:** Task 17
**Estimate:** 2
**Done:** [ ]

### Task 19: Owner sign-off checkpoint — tooltip overlay
**What:** Presents the restyled tooltip overlay (Task 18) to the product owner for incremental qualitative sign-off — the fourth and last per-element checkpoint — before the final holistic sign-off (Task 20).
**Files:** none (review checkpoint).
**Done when:** The product owner has reviewed a built, running implementation of the restyled tooltip overlay (alongside the already-signed-off nodes, edges, and settings panel) and explicitly signed off, or requested changes that reopen Task 18.
**Depends on:** Task 18
**Estimate:** 1
**Done:** [ ]

### Task 20: Final holistic owner sign-off
**What:** A single final review, once all four restyled elements (nodes, edges, settings panel/reset-view, tooltip overlay) are complete and visible together in one running build, confirming the whole graph surface reads as part of the same product as the rest of GetWrite (FR-14/OQ-7's second, holistic sign-off requirement, distinct from and in addition to the four per-element checkpoints above).
**Files:** none (review checkpoint).
**Done when:** The product owner has reviewed the complete, assembled restyled graph (all four elements together, both dark and light mode, with kind-encoding from Tasks 1–11 also visible) and given explicit qualitative sign-off that the feature as a whole — not just its individual pieces — is complete; this sign-off is recorded as the feature's actual completion condition for FR-14, not a predefined checklist.
**Depends on:** Task 12, Task 13, Task 14, Task 15, Task 16, Task 17, Task 18, Task 19
**Estimate:** 1
**Done:** [ ]
**Notes:** This task cannot be satisfied by an implementor's own judgment, however confident — FR-14's explicit text rules out self-certification against a checklist in place of this review.

## Summary
- Total tasks: 20
- Total estimated effort: 50 story points (Tasks 1-11: 3+3+2+5+2+5+2+5+3+2+3 = 35; Tasks 12-20: 3+1+2+1+3+1+2+1+1 = 15; 35+15 = 50)
- Critical path: Task 1 → Task 2 → Task 3 → Task 4 → Task 6 → Task 8 → Task 9 → Task 11 (kind encoding), independently joined by Task 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 (visual-consistency pass); Task 20 is the single terminal node, depending on the entire visual-consistency chain.
- Risks: Tasks 13/15/17/19/20 (owner sign-off checkpoints) are schedule risk, not implementation risk — each can stall the chain behind it for an unbounded time waiting on the owner, and a "changes requested" outcome reopens the preceding restyle task, extending the chain further. Task 1's token/shape choices are a judgment call (see its Notes) that may need revisiting after Task 20 surfaces a problem the earlier tasks couldn't anticipate in isolation. Task 4 (the full transport triad) is the largest single non-review task and the one most likely to reveal an unanticipated mismatch against the `entity-graph-positions.ts` precedent it mirrors.

## Open Questions

None — all of this feature spec's open questions (OQ-1 through OQ-7) were resolved before this task list was written. This task list introduces no new open questions of its own; items flagged in individual tasks' Notes fields (e.g. Task 1's provisional token/shape values, Task 20's "may need revisiting") are implementation judgment calls flagged for the owner's awareness, not unresolved requirements questions.
