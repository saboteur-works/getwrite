# Feature Breakdown: GetWrite

**Source:** `specs/product/getwrite.md` (`sab.product-spec/1`)
**Status key used throughout:** every feature title and Notes field states one
of **Shipped**, **Partial** (started, real work remains), or **Not started**.
GetWrite is at release 2.1.0; most of this list already exists in the
product. Only the **Not started** entries are real candidates for a future
`/saboteur-ship` feature-selection gate — the **Shipped** entries are
inventory, not backlog, and the **Partial** entries are the closest thing to
a small next slice.

This breakdown regenerates the prior version against a spec that went through
a second accuracy correction. Corrections carried into this document — do not
reintroduce the claims below:

- **Search across revisions is Not started, not Shipped.** Search reads only
  each resource's canonical revision today. FR-29 (Next milestone) now merges
  "search across all retained revisions" with "the diff view opened from such
  a result selects the most recent matching revision" into a single
  requirement; this breakdown reflects that merge as one feature rather than
  two.
- **Tags cannot be renamed at any layer.** There is no rename path in the
  model or the UI; renaming means delete-and-recreate, which drops existing
  assignments.
- **The Start page has no copy action**, and package does not produce a zip —
  it compiles selected resources to PDF, DOCX, Markdown, or plain text.
- **Reference previews were overstated.** What ships is a hover tooltip in
  the QueryBuilder value picker only — a referenced resource's name plus a
  short id, or "Deleted." It never loads the referenced resource's content.
  `models/previews.ts` has zero production consumers and backs no shipped
  claim.
- **Tree context menu** ships `rename` and `convert to smart folder` in
  addition to create/copy-duplicate/delete/export; `copy` and `duplicate` are
  one behavior under two labels, not two behaviors.
- **Resource templates are CLI-and-model-only.** No UI, no HTTP route. The
  richer `cli/src/templates.ts` (export/import/scaffold/validate) is not
  wired into the shipped binary and must not be described as shipped.
- **End-to-end encryption (FR-25) is newly added** to this breakdown — a
  substantial shipped subsystem the prior version omitted entirely.

There is no Workspace folder invariant and no named special folders (Front
Matter/Back Matter/Workspace) anywhere in this document; a reference field is
scoped to whichever folder its schema definition names, by folder id.

---

### Feature 1: Local-first, database-free project persistence — Shipped
**Value:** A writer's projects, resources, and metadata are always plain
files/directories they own, never rows in a database they can't inspect.
**Vertical slice:** Filesystem storage layout, `StorageAdapter`/`io.ts`
boundary, project directory conventions, all persisted-state schemas.
**Requirements covered:** FR-1
**User stories:** US-5
**Depends on:** none
**Branch suggestion:** feat/local-first-persistence
**Notes:** Shipped. Foundational — every other feature in this list writes
through this layer. Verified against `frontend/src/lib/models/io.ts` and the
`projects/` on-disk layout described in CLAUDE.md.

### Feature 2: Project scaffolding from a declarative project type — Shipped
**Value:** A novelist gets a working, structured folder layout the moment
they create a project, instead of starting from an empty tree.
**Vertical slice:** `project-creator.ts`, project-type JSON specs under
`getwrite-config/templates/project-types/`, Start page create-project flow.
**Requirements covered:** FR-2
**User stories:** US-1
**Depends on:** Feature 1
**Branch suggestion:** feat/project-type-scaffolding
**Notes:** Shipped.

### Feature 3: Path-independent resource identity — Shipped
**Value:** A plain-file writer can reorganize their project tree without
breaking any metadata association tied to a resource.
**Vertical slice:** UUID-keyed resource identity, sidecar metadata storage
keyed by ID rather than path, move/rename handling across the tree.
**Requirements covered:** FR-3
**User stories:** US-6
**Depends on:** Feature 1
**Branch suggestion:** feat/path-independent-identity
**Notes:** Shipped.

### Feature 4: Autosave into a single canonical revision — Shipped
**Value:** A writer on deadline never loses work and never has to think
about saving — edits land in one authoritative revision automatically, and
the current revision can never be deleted out from under them.
**Vertical slice:** Debounced autosave, canonical-revision invariant
enforcement (exactly one canonical revision at all times), delete guard
against removing the current canonical revision, revision-pruning
configuration.
**Requirements covered:** FR-4, FR-5, FR-6
**User stories:** US-9
**Depends on:** Feature 1
**Branch suggestion:** feat/canonical-autosave
**Notes:** Shipped.

### Feature 5: Revision diff view — Shipped
**Value:** A writer on deadline can see exactly what changed before
deciding whether to keep an edit.
**Vertical slice:** Word-based diff algorithm, Diff view UI, revision
selection for comparison.
**Requirements covered:** FR-7
**User stories:** US-10
**Depends on:** Feature 4
**Branch suggestion:** feat/revision-diff-view
**Notes:** Shipped.

### Feature 6: Folder-scoped references and reference integrity — Shipped
**Value:** A novelist can point a multi-reference field at any folder — by
folder id, never by name — and a deleted-but-referenced resource never
silently vanishes from where it's cited.
**Vertical slice:** Per-field `refFolder` scoping chosen in the schema
manager, offering every folder plus an "Any folder" option and an
include-descendants toggle; single-reference fields are unscoped. The
`isMetadataSource` folder flag is a superseded mechanism: the sidebar
generated a reference row per flagged folder until the schema-driven rewrite
(`cc04767`) replaced that with per-field `refFolder`. It is still authored in
the project-type editor and written onto the folder, but nothing consumes it. Reference-nullification on delete (`{id: null, name}`
retained, including within multi-reference arrays) rather than removal.
**Requirements covered:** FR-8
**User stories:** US-3
**Depends on:** Feature 2
**Branch suggestion:** feat/metadata-source-folders
**Notes:** Shipped. No folder name carries application semantics — this
replaces any earlier notion of named special folders (Characters/Locations/
Items/Front Matter/Back Matter/Workspace), none of which exist in the
codebase as protected or name-recognized folders today.

### Feature 7: Typed resource metadata — Shipped
**Value:** A novelist can attach structured, queryable facts to any resource
instead of relying on prose or ad hoc tags.
**Vertical slice:** The built-in metadata schema. Status is the only
unconditional field — a locked, project-scoped select whose options come from
the project type and are user-editable and reorderable. Synopsis, Notes,
Point of View (single resource reference accepting free text, preserved as a
name with a null id), and the Timeline group's Story Date, Duration and Story
End Date (unvalidated start/end ordering) are each behind a per-project
feature toggle and hidden while it is off, with stored values retained.
Entity reference fields such as characters or locations are not built-ins —
see Feature 18 (user-defined fields) and Feature 6 (folder scoping). Sidecar
persistence; Metadata sidebar UI.
**Requirements covered:** FR-9
**User stories:** US-3
**Depends on:** Feature 6
**Branch suggestion:** feat/typed-resource-metadata
**Notes:** Shipped.

### Feature 8: Saved queries as smart folders — Shipped
**Value:** A plain-file writer can save a metadata query once and reuse it
as a live, always-current folder in the tree.
**Vertical slice:** Query AST/evaluator, `saved-queries.ts`, QueryBuilder
UI, smart-folder rendering in the resource tree.
**Requirements covered:** FR-10
**User stories:** US-7
**Depends on:** Feature 7
**Branch suggestion:** feat/smart-folders
**Notes:** Shipped.

### Feature 9: Full-text search with metadata filters — Shipped
**Value:** A plain-file writer can find anything in a project too large to
hold in memory, by text and by Status/folder/Tags together.
**Vertical slice:** Inverted index, indexer queue, SearchBar UI, filter
panel (folder, Status, Tags).
**Requirements covered:** FR-11
**User stories:** US-7
**Depends on:** Feature 7
**Branch suggestion:** feat/full-text-search
**Notes:** Shipped. Indexes and searches only each resource's canonical
revision — retained revisions are not searchable until FR-29 (Feature 27)
ships. Full-text search's own filters are folder/Status/Tags only; it has no
predicate over the query builder's fields today (see Feature 32).

### Feature 10: Backlinks index — Shipped
**Value:** A plain-file writer can navigate a project by following actual
references between resources rather than remembering where things are.
**Vertical slice:** Wiki-link parsing, `backlinks.ts` maintained index,
backlink surfacing in the UI.
**Requirements covered:** FR-12
**User stories:** US-7
**Depends on:** Feature 1
**Branch suggestion:** feat/backlinks-index
**Notes:** Shipped.

### Feature 11: Five-view work area (Edit/Organizer/Data/Diff/Timeline) — Shipped
**Value:** A writer sees the resource or folder they've selected rendered
the way that's useful for the task at hand, not one fixed layout.
**Vertical slice:** Work area shell, per-view components, type-aware
rendering dispatch (text/image/audio/mixed).
**Requirements covered:** FR-13
**User stories:** US-9, US-10, US-7
**Depends on:** Feature 4, Feature 5, Feature 9
**Branch suggestion:** feat/work-area-views
**Notes:** Shipped as a base slice. Timeline is gated behind a per-project
`timelineView` feature flag and is disabled unless it is on; turning it on
force-enables the timeline date fields at the feature-config write seam, so
the view can never be on without its data. Organizer's only in-view control
is a show/hide-bodies toggle — though what a card body renders (nothing, a
text excerpt, or any metadata field) is a per-project setting that ships.
Card *filtering* by Status, word count, or reference fields is entirely
unbuilt and is broken out separately as Feature 24 (Not started), not folded
into this entry's Shipped status.

### Feature 12: Compile to a single manuscript — Shipped
**Value:** A novelist produces one ordered, deliverable manuscript file
from a chosen subtree without manual assembly.
**Vertical slice:** Depth-first compile walking a user-selected subtree in
plain resource-tree order, PDF/DOCX/Markdown/text output, non-mutating compile
pipeline, Compile preview modal.
**Requirements covered:** FR-14
**User stories:** US-2
**Depends on:** Feature 1
**Branch suggestion:** feat/compile-manuscript
**Notes:** Shipped. Compile has no notion of Workspace/Front Matter/Back
Matter ordering — it walks whatever subtree the user selects, in tree order,
and never emits metadata or mutates revisions/project state.

### Feature 13: Account-free Electron desktop app — Shipped
**Value:** A writer runs GetWrite entirely offline, with no server and no
account, against their own filesystem.
**Vertical slice:** Electron shell, standalone Next.js server spawn,
`GETWRITE_PROJECTS_DIR` resolution, packaged-build project directory.
**Requirements covered:** FR-15
**User stories:** US-5
**Depends on:** Feature 1
**Branch suggestion:** feat/electron-desktop-app
**Notes:** Shipped.

### Feature 14: Dark/light mode with per-project preference — Shipped
**Value:** A writer sets a color mode per project that persists rather than
resetting to a global default.
**Vertical slice:** CSS token themes, per-project `colorMode` preference
storage, theme switch UI.
**Requirements covered:** FR-16
**User stories:** US-5
**Depends on:** Feature 1
**Branch suggestion:** feat/color-mode-preference
**Notes:** Shipped.

### Feature 15: Add image and audio resources via the UI — Shipped
**Value:** A novelist adds an image or audio resource directly from the
app instead of placing files on disk out of band.
**Vertical slice:** Type selector and file input in the create-resource
flow, upload route, editor drag-and-drop, dedicated media viewer.
**Requirements covered:** FR-17
**User stories:** US-3
**Depends on:** Feature 7
**Branch suggestion:** feat/media-resource-creation
**Notes:** Shipped end-to-end — create-flow, upload route, editor drag-drop,
and media viewer all exist.

### Feature 16: Project-scoped tags — Shipped
**Value:** A plain-file writer organizes resources with lightweight,
project-scoped labels, independent of the metadata schema.
**Vertical slice:** Tag creation/assignment/removal/deletion model layer,
sidebar tag management UI, tag manager modal.
**Requirements covered:** FR-18
**User stories:** US-7
**Depends on:** Feature 1
**Branch suggestion:** feat/project-tags
**Notes:** Shipped. Tags cannot be renamed at any layer — model or UI.
Renaming a tag means deleting and recreating it, which drops its existing
resource assignments; this is a real gap, not a UI-only omission, and any
future rename capability would be new scope, not a fix to this feature.

### Feature 17: Resource templates via CLI — Shipped
**Value:** A writer on deadline creates new resources with consistent
structure without rebuilding it each time, via the CLI.
**Vertical slice:** `getwrite-cli templates save|create|duplicate|list`,
template scaffolds under `meta/templates/`.
**Requirements covered:** FR-19
**User stories:** US-13
**Depends on:** Feature 1
**Branch suggestion:** feat/resource-templates-cli
**Notes:** Shipped, CLI-and-model-only — no UI, no HTTP route. The richer
`cli/src/templates.ts` (export/import to `.zip`, scaffold, validate,
preview, version, changeset) exists in the source tree but is not wired
into the shipped `getwrite-cli` binary and is reachable only from tests; it
is not shipped and must not be claimed as such.

### Feature 18: User-definable metadata schema — Shipped
**Value:** A writer on deadline tracks attributes specific to their project
beyond the built-in metadata fields, and can safely evolve that schema as
the project grows.
**Vertical slice:** Custom field-definition model, per-project schema
storage, Schema Manager UI covering add/edit/delete field definitions,
label rename, key rename with a migration preview, type-change migration,
field reordering, and deprecate-vs-clear removal semantics with a
select-option-removal preview.
**Requirements covered:** FR-20
**User stories:** US-14
**Depends on:** Feature 7
**Branch suggestion:** feat/custom-metadata-schema
**Notes:** Shipped. Only `status` is locked — it cannot be renamed,
retyped, reordered, or removed, though its options are project-supplied and
user-editable. Every other built-in is unlocked at load time and is editable
exactly like a user-defined field.

### Feature 19: Resource-tree drag-and-drop and context menu — Shipped
**Value:** A plain-file writer reorders and manages resources/folders
directly in the tree, with order surviving to disk.
**Vertical slice:** Drag-and-drop reorder persisted to disk, context-menu
create/rename/copy-duplicate/delete/convert-to-smart-folder/export actions.
**Requirements covered:** FR-21
**User stories:** US-6
**Depends on:** Feature 3
**Branch suggestion:** feat/tree-dnd-context-menu
**Notes:** Shipped. `copy` and `duplicate` are one behavior offered under
two menu labels, not two distinct behaviors.

### Feature 20: TipTap rich-text editing — Shipped
**Value:** A writer on deadline authors in a full WYSIWYG surface with
tables, heading/body styling, and clean paste behavior.
**Vertical slice:** TipTap-based editor, config-driven toolbar, paste
normalization.
**Requirements covered:** FR-22
**User stories:** US-9
**Depends on:** Feature 4
**Branch suggestion:** feat/tiptap-editor
**Notes:** Shipped.

### Feature 21: Start-page project management — Shipped
**Value:** A writer on deadline creates, opens, renames, deletes, and
compiles a package from their whole project lifecycle without leaving the
app.
**Vertical slice:** Start page UI, project create/open/rename/delete
actions, package action that compiles selected resources.
**Requirements covered:** FR-23
**User stories:** US-15
**Depends on:** Feature 2
**Branch suggestion:** feat/start-page-project-management
**Notes:** Shipped. There is no copy action on the Start page. Package
compiles selected project resources to PDF, DOCX, Markdown, or text — it is
not a project-level zip export.

### Feature 22: Reference hover preview in the QueryBuilder value picker — Shipped
**Value:** A plain-file writer selecting a resource reference in a saved
query sees enough to confirm it's the right one, without navigating away.
**Vertical slice:** Hover tooltip rendering in the QueryBuilder value
picker, showing a referenced resource's stored name plus the first 8
characters of its id, or "Deleted" if the reference is broken.
**Requirements covered:** FR-24
**User stories:** US-7
**Depends on:** Feature 8
**Branch suggestion:** feat/reference-hover-preview
**Notes:** Shipped, but narrowly scoped — this is a hover tooltip in one
surface only (the QueryBuilder value picker). It never loads the referenced
resource's content and shows no excerpt or thumbnail. Resource-ref fields in
the Metadata Sidebar have no hover preview at all.
`frontend/src/lib/models/previews.ts` has zero production consumers and
backs no part of this feature or any other shipped capability.

### Feature 23: Per-project end-to-end encryption — Shipped
**Value:** A writer on desktop or native Android keeps their project
private at rest — if the device is lost or accessed by someone else, the
files are unreadable without unlocking the workspace.
**Vertical slice:** Workspace keyring with an unlock/lock session
lifecycle, sealed (AES-256-GCM, Argon2id-derived) file bodies via an
`encryptingAdapter.ts` `StorageAdapter` decorator, crash-safe and resumable
bidirectional conversion between plaintext and encrypted storage
(`convert-project.ts`), a plaintext export escape hatch, and opt-in
enable/resume orchestration.
**Requirements covered:** FR-25
**User stories:** US-16
**Depends on:** Feature 1
**Branch suggestion:** feat/e2e-encryption
**Notes:** Shipped, and substantial — this was omitted from the prior
feature list entirely. Scoped to desktop and native Android only; hosted
excludes it behind a fail-closed, server-side gate
(`crypto/encryption-availability.ts`) because the model layer does not yet
run client-side there.

### Feature 24: Organizer view — card filtering — Not started
**Value:** A plain-file writer filters the Organizer's card view by the
facets that matter to them, instead of only being able to hide/show bodies.
**Vertical slice:** Filter-state model in Organizer view, filter UI
controls, query wiring for Status, word count, and the project's
resource-reference fields.
**Requirements covered:** FR-26
**User stories:** US-7
**Depends on:** Feature 11
**Branch suggestion:** feat/organizer-filters
**Notes:** Not started. Organizer ships no card filtering of any kind
today; its only in-view control is a show/hide-bodies toggle. (Configuring
what a card body renders is a separate setting that already ships — see
Feature 11.) Real candidate for the next `/saboteur-ship` selection gate.

### Feature 25: Signed, warning-free desktop installers — Partial
**Value:** A plain-file writer installs the desktop build on macOS or
Windows without an OS security warning undermining trust in the app.
**Vertical slice:** Code-signing and notarization pipeline (macOS),
Windows code-signing, electron-builder packaging config changes.
**Requirements covered:** FR-27
**User stories:** US-8
**Depends on:** Feature 13
**Branch suggestion:** feat/signed-desktop-builds
**Notes:** Partial — build and packaging already ship; signing/notarization
is outstanding (tracked separately in the user's Electron Distribution TODO).

### Feature 26: Trash UI — browse, restore, purge — Not started
**Value:** A writer on deadline recovers an accidentally deleted resource
from within the app, with no filesystem detour.
**Vertical slice:** Trash UI surface (list, restore action, purge action),
wiring to the existing restore/purge model functions.
**Requirements covered:** FR-28
**User stories:** US-11
**Depends on:** Feature 1
**Branch suggestion:** feat/trash-ui
**Notes:** Not started as a shipped, user-facing feature. The underlying
soft-delete model (`trash.ts`, `.trash/` directory, restore/purge functions)
already exists and is not itself gated by this feature — only the UI is
missing.

### Feature 27: Search across all retained revisions — Not started
**Value:** A plain-file writer finds a match that exists in an older
revision, not only the current canonical text, and lands on the right
revision when they open its diff.
**Vertical slice:** Revision-aware indexing, search-result surfacing across
retained revisions of a resource, and diff-view wiring that consistently
selects the most recent matching revision when a diff is opened from such a
result.
**Requirements covered:** FR-29
**User stories:** US-7
**Depends on:** Feature 5, Feature 9
**Branch suggestion:** feat/search-across-revisions
**Notes:** Not started. Today search indexes and reads only each resource's
canonical revision; retained revisions remain browsable and diffable but are
not searchable. This requirement merges what a prior version of this
breakdown treated as two separate features (search-across-revisions, and
correct revision-selection on diff-open) into one, matching the parent
spec's FR-29.

### Feature 28: Hosted multi-device access to the same project — Partial
**Value:** A plain-file writer reaches the same project from more than one
device instead of being bound to a single machine.
**Vertical slice:** Hosted tenancy/auth wiring for end-user access, sync
transport for project data, desktop/hosted parity for the writing surface.
**Requirements covered:** FR-30
**User stories:** US-12
**Depends on:** none
**Branch suggestion:** feat/hosted-multi-device-access
**Notes:** Partial. Per-user tenant resolution, a production better-auth
identity source, full auth UI (login/verify-email/reset-password), a
pluggable object-store backend, route-level tenant enforcement tests, and a
live-infra smoke harness all ship. What's missing is the user-facing
multi-device product itself. Pursued on a fixed calendar horizon in
parallel with desktop work, per the parent spec's constraints — not gated
on desktop adoption metrics.

### Feature 29: Durable search backend for large projects — Not started
**Value:** A plain-file writer with a very large project keeps fast search
even after the JSON inverted index would otherwise bottleneck.
**Vertical slice:** Replacement search backend, migration path from the
existing inverted index, no user-facing behavior change beyond performance.
**Requirements covered:** FR-31
**User stories:** US-7
**Depends on:** Feature 9
**Branch suggestion:** feat/durable-search-backend
**Notes:** Not started. Contingent on demonstrated bottlenecking, per the
parent spec's phrasing ("once it demonstrably bottlenecks") — not scheduled
against a fixed date the way Feature 28 is.

### Feature 30: Multi-device conflict-resolution model — Not started
**Value:** A plain-file writer whose device was offline gets their edits
merged predictably when it reconnects, instead of silently losing or
duplicating work — without any notion of another person editing the
project.
**Vertical slice:** Conflict-detection logic for offline edits from
multiple devices of the same writer, a defined resolution policy (to be
designed), and the sync transport hook that applies it.
**Requirements covered:** FR-32
**User stories:** US-12
**Depends on:** Feature 28
**Branch suggestion:** feat/multi-device-conflict-resolution
**Notes:** Not started, and undesigned — a single-writer sync conflict
model only; multi-user/collaboration conflict handling is a permanent
non-goal per the parent spec's Non-goals. Broken out as its own feature so
it is not silently absorbed into Feature 28's scope.

### Feature 31: Scrivener/Word project importer — Not started
**Value:** A novelist migrating from Scrivener or Word imports their
existing project structure into GetWrite instead of manually re-creating it.
**Vertical slice:** `.scriv` and DOCX parsers, mapping from source project
structure to GetWrite's project-type/resource-tree model, an import flow in
the UI or CLI that runs the conversion.
**Requirements covered:** FR-33
**User stories:** US-4
**Depends on:** Feature 2
**Branch suggestion:** feat/scrivener-docx-importer
**Notes:** Not started. Planned, not near-term — no committed milestone
slot yet. No import path exists today from either format, which is a known
adoption risk called out in the parent spec's Constraints.

### Feature 32: Join full-text search with saved-query predicates — Not started
**Value:** A plain-file writer filters by full-text content and by
the query builder's fields in the same search, instead of using two
disconnected surfaces.
**Vertical slice:** Shared predicate model spanning full-text search and
the saved-query builder, UI wiring so either surface can apply the other's
predicates.
**Requirements covered:** FR-34
**User stories:** US-7
**Depends on:** Feature 9, Feature 8
**Branch suggestion:** feat/join-search-and-query-predicates
**Notes:** Not started. Both surfaces ship independently today (Feature 9's
full-text search; Feature 8's saved-query builder) but have never been
joined — full-text search has no predicate over the query builder's fields,
and the saved-query builder has no full-text-over-content predicate.

### Feature 33: Entity layer — automatic prose-mention detection — Shipped
**Value:** A novelist who declares a resource as a character, place, or
object gets every prose mention of it across the whole project — by name or
alias — attributed automatically, instead of losing the connection the
moment they forget to bracket a manual link.
**Vertical slice:** A sidecar `entityKind` + ordered `aliases` schema
addition; case-insensitive, word-boundary-safe alias matching (with
possessive/plural forms) dispatched through the existing `indexer-queue` on
save; a new mention index persisted under `meta/index/`, separate from
`backlinks.json`; a `mentions` intrinsic field so saved queries and smart
folders can filter by entity mention; and two UI surfaces — a resource view
listing the entities detected in it, and an entity view listing every
mentioning resource with a snippet per occurrence, visually distinguished
from explicit links.
**Requirements covered:** FR-35
**User stories:** US-3
**Depends on:** Feature 7, Feature 9, Feature 10
**Branch suggestion:** feat/entity-layer
**Notes:** Shipped. Merged to `main` on 2026-08-25 as 19 commits tagged
`[task_ddb55116]`, from `7eb0e0fa` (spec + task list) to `df2e5554`; the
`feat/entity-layer` branch was rebased and deleted, so there is no merge
commit. This entry closes a ladder gap: a complete rung-4 feature spec
(`specs/features/entity-layer.md`) already existed for this capability but
had no rung-3 parent entry until now; the parent product spec has since been
amended with FR-35 to cover it. Detection runs fully offline and reuses
existing machinery (`indexer-queue`, `backlinks.ts`'s resolver maps,
`extractSnippet`) rather than introducing a new pipeline; it does not change
how explicit backlinks are computed or persisted.
The two UI surfaces ship behind an off-by-default per-project `entities`
feature flag (commit `df2e5554`), joining the existing Timeline / Point of
View / Synopsis / Notes flag family. The flag gates the UI only — detection,
the mention index, and the indexer path run ungated.
A follow-on repair shipped separately: `extractSidecarRefIds` read only one
level of the sidecar, so `resource-ref` / `multi-resource-ref` fields under
`userMetadata` never produced a backlink. Specified in
`specs/features/entity-linking.md` and landed under `[task_08553ca3]`.

### Feature 34: Entity highlighting in the editor — Shipped
**Value:** A writer toggles a working mode that visually marks every declared
entity's name and aliases inline as they read a scene, so the entities in a
passage are apparent at a glance instead of requiring a trip to a sidebar
panel or a search. The highlight is a view-layer decoration only; it never
touches persisted content.
**Vertical slice:** A TipTap/ProseMirror decoration extension following the
existing `WikiLinkDecoration.ts` pattern (walk text nodes, emit
`Decoration.inline`, rebuild on `docChanged`), reusing the dependency-free
`entity-detection.ts` matcher client-side; a project-scoped endpoint exposing
the entity alias table to the client, with a native backend counterpart for
ADR-021 parity, a client cache, and invalidation on alias edits; and a
persisted toggle in per-project editor config.
**Requirements covered:** FR-36
**User stories:** US-3
**Depends on:** Feature 33
**Branch suggestion:** feat/entity-highlighting
**Notes:** Shipped. Landed on `main` on 2026-09-03 as 18 commits tagged
`[task_4b2ec55f]`, from `7ca594c1` (spec + FR-36) to `942a0ec8`; the branch
was rebased rather than merged, so there is no merge commit — the same
pattern as Feature 33. Tracked as POS `task_4b2ec55f`, was blocked by
`task_ddb55116`; findings in `note_3059fe58`. FR-36 covers this feature: the
parent product spec was amended to add a requirement for the toggleable
inline editor highlight, reusing the entity declarations FR-35 established
without introducing any new entity-declaration mechanism.
Two constraints established by reading the tree rather than assumed:
detection must run live over each text node, NOT off `meta/index/mentions.json`
— those offsets are into persisted plain text, while ProseMirror positions
count node boundaries, so they do not align, and the index is stale against
unsaved edits regardless. The entity-layer spec settled the opposite answer for its own surface: the
indexer reads only persisted, saved content, never unsaved editor state.
Reading live here is a deliberate difference for a different surface, not a
resolution of that question — a highlight of stale text would be wrong.
Unmeasured risk: `WikiLinkDecoration` runs one static regex per transaction,
whereas this runs N aliases against the document on every keystroke, and a
novel project may declare hundreds. Mitigations exist (single alternation
regex; rescan only the changed range) but the cost has not been benchmarked —
that measurement belongs in its task breakdown.
Scheduling argument: `entity-alias-warnings.ts` already flags short or
common-word aliases (such as "May" or "Will") non-blockingly at declaration
time, so the writer is not without warning; what the highlight adds is
showing the actual extent of such an alias's matches in running prose, which
a declaration-time warning cannot convey. Styling constraint: the brand
reserves red for
position/canonical indicators, so the highlight must use another token.

### Feature 35: Entity-scoped compile — Shipped
**Value:** A novelist tracking a character or thread across a large project
compiles every resource associated with that entity into one continuous
document — the same consistency-check read-through Feature 12's whole-project
and subtree compile already offer, but scoped to an entity's thread instead
of a manuscript position, so they can review that entity across the whole
project without following mention links one at a time.
**Vertical slice:** A new resource-selection path that starts from
`mentions-core.ts`'s `getEntityMentionedIn` merged set (detected prose
mentions plus explicit `linkedFrom` backlinks) instead of a subtree
selection, then orders that set by resource-tree position, depth-first with
siblings by `orderIndex` — the same rule `compileSelection.ts`'s
`getDescendantLeafIds` applies for FR-14, reimplemented here over an
unordered entity/mention set rather than inherited, since neither
`invertMentionIndex` (arbitrary `Object.values` order) nor
`getEntityMentionedIn`'s merge orders its output that way. The ordered
resource-id list then feeds the existing `compile-core.ts` renderers
(`compilePdfCore` / `compileDocxCore` / `compileTextCore` /
`compileMarkdownCore`) unchanged, since they already render sections in
exactly the order the `resourceIds` argument arrives in; plus an entry point
in the entity view to invoke it. Export-only: no revision, entity
declaration, or mention-index write.
**Requirements covered:** FR-37
**User stories:** US-2, US-3
**Depends on:** Feature 33, Feature 12
**Branch suggestion:** feat/entity-scoped-compile
**Notes:** Shipped. 11 commits tagged `[task_79e35996]`, from `549c2c50`
to `c6df104b`, merged as PR #183 on 2026-09-06.

Its route to `main` is worth recording, because the merge status alone was
misleading. #183 targeted `fix/android-compile-download`, and that base had
itself merged to `main` (PR #184, `92f7df40`) 90 seconds earlier — so #183's
commits landed on a branch nothing was downstream of, and none of this
feature reached `main` on 2026-09-06 despite both PRs reporting `MERGED`.
The gap was found on 2026-09-07 while checking FR numbering for Feature 36
and closed by PR #185 (`4fcd1fa7`), which re-merged the same commits onto
`main`. Verified after the fact with `git merge-base --is-ancestor` rather
than trusting the merge.

FR-37 covers this feature, added to the parent
product spec's Next Requirements. Four scope decisions are settled at the
product-spec gate and are not reopened here: the resource set is the merged
mentions-plus-backlinks set (not mentions alone), ordering is resource-tree
position depth-first by `orderIndex` (not chronological or mention-index
order), the feature is export-only, and it rides the existing `entities`
feature flag rather than introducing a new one — the compile entry point
lives inside the entity panel, which `MetadataSidebar.tsx:531-544` already
gates as a whole via `isEntitiesEnabled`, so the action is unreachable
without `entities` enabled and a dedicated flag would add nothing. (Feature
34's `entityHighlighting` nesting under `entities` is a UI-conditional
convention in `ProjectFeatureToggles.tsx:175-198`, not a schema-level
dependency the model layer enforces, and is not a rule this decision follows
— Feature 34 warranted its own flag because it is a persistent, always-on
rendering mode, where this feature is an on-demand, export-only action.) The
ordering bridge between the retrieval half (`mentions-core.ts`, existing) and
the render half (`compile-core.ts`, existing) is the genuinely new work.

### Feature 36: Project-level entity roster — Shipped
**Value:** A writer with dozens of declared entities today can only see them
one resource's sidebar at a time; a project-wide roster lets them see every
declared entity as a set, spot one that was declared and never mentioned
anywhere, and jump straight to its alias editor — the same at-a-glance
review Organizer and Data already give for resources, but for entities.
**Vertical slice:** A new, sixth top-level work-area view (alongside Edit,
Organizer, Data, Diff, Timeline), rendering the entity list the alias table
`entity-alias-table.ts`'s `buildEntityAliasTable` already builds (name,
`entityKind`, aliases), with per-entity mention counts and mentioned/never-
mentioned status derived from the existing mention index via
`mentions-core.ts`'s merged mentioned-in set, and per-entity ambiguous-alias
and common-word warnings surfaced from `claimedBy` and
`entity-alias-warnings.ts`'s `getAliasWarning` — all data already computed
and already reaching the client through the existing `entityAliasTableSlice`
cache. The roster is read-only: activating a row navigates to that entity's
resource and opens the existing `EntitySection` alias editor, reusing the
existing `updateSidecar` write path unchanged; there is no inline editing of
declarations from within the roster. Adding the sixth view touches the
closed, hardcoded five-entry `ViewName` type and `VIEW_OPTIONS` list in
`frontend/components/WorkArea/ViewSwitcher.tsx` (no per-view extension seam
exists today) plus whatever in `frontend/components/Layout/AppShell.tsx`
dispatches on `ViewName` to render the selected view.
**Requirements covered:** FR-38
**User stories:** US-3
**Depends on:** Feature 33
**Branch suggestion:** feat/entity-roster
**Notes:** Shipped. 18 commits tagged `[task_facfacac]`, from `3520b634`
(FR-38 + this entry) to `becfbeee`, merged as PR #186 (`e86adf34`) on
2026-09-07.

Two defects were found after the automated suite was green, both by
exercising the feature in the running app rather than by testing:

- The roster was unreachable with no resource selected. `AppShell` gated its
  view switch on a selected resource and then, inside that branch, returned
  early for `!selectedResource` before reaching `switch (view)`; only `data`
  escaped both, being handled in an earlier block. Fixed in the same PR by
  hoisting the roster's case alongside `data`. Every existing test selected a
  resource first, so 3237 passing tests could not see it. Timeline has the
  same defect and is filed separately as POS `task_a7d8581a` /
  `note_0e12b051`.
- The roster counted resources while labelling them "mentions" — an entity
  mentioned 593 times across 32 resources displayed "32 mentions". The cause
  was in the requirement, not the code: FR-6 of the feature spec prescribed
  `byEntity[entityId]?.length ?? 0` verbatim. Fixed by PR #187 (`cbacc237`),
  which shows both numbers, counts distinct `resourceId`s for the resource
  half, and corrects FR-5/FR-6 and FR-38. The fixtures had mentioned each
  entity once per resource, making the right and wrong answers numerically
  identical.

Deferred with tasks filed rather than dropped: the virtualization benchmark
(`task_733deea7`), which the spec records as a decision made in the absence
of measurement rather than a performance claim, and four of the eight manual
verification criteria (`task_ecb1e204`). Both were cleared on 2026-09-07.
The benchmark measured scroll cost as flat and independent of list length
(8.3 ms median frame interval at 100, 500 and 1,000 entities alike, no frame
over 20 ms) and mount cost as linear at ~0.43 ms per entity in a development
build; the numbers are in
`specs/features/entity-roster/virtualization-benchmark-notes.md` and the
no-virtualization decision now rests on measurement. Three of the four open
manual criteria — the flag-off disabled tab and its hover reason, the
"needs attention" treatment with its accessible-name disclosure and
non-red colour, and the FR-11 empty state — were confirmed against
purpose-built fixture projects. The fourth, device-level Android offline
behaviour, was confirmed the same day on a physical Pixel 7 Pro in airplane
mode: the roster and every mention count loaded from the app-private store
with no network reachable, matching disk ground truth exactly. All eight
manual criteria are confirmed.

FR-38 covers this feature, added to the parent
product spec's Next Requirements. Four scope decisions are settled at the
product-spec gate and are not reopened here: the roster is a new top-level
work-area view rather than a sidebar panel, modal, or dedicated route; it is
read-only, with no inline-editing path of its own; it rides the existing
`entities` feature flag rather than introducing one (the entity-scoped-compile
precedent, Feature 35, not the entity-highlighting precedent, Feature 34,
which took its own flag because it is a persistent, always-on rendering
mode rather than an on-demand view); and per-entity mention counts are
derived from the existing mention index, with no new persisted data.
`frontend/src/lib/models/schemas.ts:194-209` declares `entities` and
`entityHighlighting` as two independent optional booleans with no
schema-level dependency mechanism — feature-flag "rides on" relationships in
this codebase are enforced by convention (as in `ProjectFeatureToggles.tsx`),
not by the schema, which is part of why riding the existing flag is the
cheaper path here rather than a new one. Retrieval-side ADR-021 native
parity already exists for the two data sources this feature needs
(`store/transport/native-entity-alias-table-backend.ts` and
`native-mentions-backend.ts`, both already used by Feature 34 and Feature
35 respectively). The new sixth-view plumbing itself
(`ViewName`/`ViewSwitcher`/`AppShell` dispatch) needs no ADR-021-specific
handling: the switcher and dispatch contain no runtime branching on any
native signal, work-area views are not routes so the native static-export
build script needs no change to accommodate a sixth one, and — per the
retrieval-side point above — both data sources the roster depends on
already have shipped native backends.

### Feature 37: Derived co-occurrence relationship data — Shipped
**Value:** A novelist looking at one entity's own view sees which other
declared entities usually appear alongside it — "who does this character
share a scene with most" — without opening a graph canvas, authoring
anything, or waiting on Feature 38's typed-relationship schema.
**Vertical slice:** A pure derivation function over the existing mention
index — for every pair of entities that share at least one resource (per
`invertMentionIndex`, `frontend/src/lib/models/mention-index.ts:16-28`), the
resource(s) they co-occur in and a count — exposed as a project-scoped read
(HTTP route + ADR-021 native backend, following the
`native-entity-mention-counts-backend.ts` pattern) with no new persisted
data and no new write path; plus a minimal display of that derivation added
to `EntityMentionsSection.tsx` (the entity's own sidebar view), listing the
other entities that co-occur, derived purely from the mention index
(detected mentions only, not the merged mentions-plus-backlinks resource set
`getEntityMentionedIn` returns for display), each with a shared-resource
count (e.g. "Also appears with: Priya (3), Marcus (1)").
**Requirements covered:** None of its own — an enabling slice of the graph
requirement, which the graph-rendering feature covers in full below. See
this feature list's Open Questions for what the schema permits here and how
this differs from this document's earlier questions about the entity-layer
and entity-highlighting features.
**User stories:** US-17
**Depends on:** Feature 33
**Branch suggestion:** feat/entity-cooccurrence-edges
**Notes:** Shipped. A display surface was added at the Gate 2 review
because the first draft of this entry shipped no usable slice — its Value
field admitted the entry was "retrieval-layer groundwork," which is the
warning sign this document's own instructions call out: a seam that yields a
feature shipping nothing usable is evidence the seam is wrong. Rather than
fold this back into Feature 38 or Feature 39, the fix was to give it its own
minimal, genuinely usable surface, the same way Feature 38 earns its
independence with a minimal authoring control rather than a bare schema.
`EntityMentionsSection.tsx` (`frontend/components/Sidebar/`) was chosen over
`EntityRosterRow.tsx` (`frontend/components/WorkArea/Views/EntityRosterView/`)
because it is already the entity's own per-entity view, already fetches the
exact merged resource-id set (`rows` from `getEntityMentionedIn`) this
feature's co-occurrence display needs with no extra per-entity fetch;
adding it to every roster row instead would mean computing and rendering a
co-occurrence summary for every declared entity on every roster load, a
materially heavier read than one entity's own view needs and a UI density
problem the roster's existing compact row layout (name, kind, aliases,
mention count, attention flag) does not have room for. This is a small list,
not a canvas — it does not overlap with Feature 39's graph rendering, which
remains the only surface that draws entities as nodes and relationships as
edges; this feature only ever lists text. Mirrors the evidence in the parent
spec's OQ-2 resolution: `MentionRecord` already carries `entityId` +
`resourceId` + `offsets`, so "which entity pairs share a resource" is a
derivation over data already on disk, not new state.

### Feature 38: Authored typed entity relationships — Shipped
**Value:** A novelist records a relationship between two entities they
already know — "ally of," "parent of," and so on — as a durable, structured
fact instead of leaving it to be reconstructed from prose or a co-occurrence
count that can't distinguish "these two characters are related" from "these
two characters happened to share a scene."
**Vertical slice:** A new persisted schema for a directed, typed edge between
two entity ids (source entity, target entity, relationship type, freeform
label or fixed vocabulary — open, see this feature list's Open Questions),
stored alongside `meta/index/mentions.json` / `meta/backlinks.json` per the
parent spec's OQ-2 evidence; create/edit/delete operations with file
locking consistent with the rest of the metadata layer; and defined behavior
for an edge naming an entity that is later deleted (open, see this feature
list's Open Questions). Ships with a minimal authoring surface (e.g. an
add-relationship control reachable from the entity's own sidebar section)
sufficient to create, see, and remove an edge, so this feature is itself a
usable vertical slice independent of Feature 39's graph rendering.
**Requirements covered:** None of its own — an enabling slice of the graph
requirement, which the graph-rendering feature covers in full below; see
this feature list's Open Questions for what the schema permits here and how
this differs from this document's earlier questions about the entity-layer
and entity-highlighting features.
**User stories:** US-17
**Depends on:** Feature 33
**Branch suggestion:** feat/entity-authored-relationships
**Notes:** Shipped. Scoped apart from Feature 37 because the two edge
sources have unrelated costs and lifecycles: this feature carries a new
schema, a write path, an authoring UI, and an edge-deletion-on-entity-deletion
policy that Feature 37 needs none of. Scoped apart from Feature 39 (the graph
view) because an edge is data a writer can create and remove through a plain
list-style surface without any graph rendering existing yet — a novelist
naming "Ally of" between two characters is useful the moment it's saved and
displayed anywhere, not only once a node-and-edge canvas exists to draw it
on. The relationship-type vocabulary (open vs. fixed set) and the
entity-deletion edge lifecycle are both unresolved — see this feature list's
Open Questions and the parent spec's OQ-3.

### Feature 39: Project-level entity relationship graph view — Shipped
**Value:** A novelist sees how their declared entities connect to one
another — not just where each individually appears — surfacing a question
neither the flat entity roster (Feature 36) nor a single entity's own thread
(Feature 35) can answer.
**Vertical slice:** A new, seventh top-level work-area view (alongside Edit,
Organizer, Data, Diff, Timeline, and Feature 36's Entities roster), touching
the same closed `ViewName`/`VIEW_OPTIONS`/`AppShell` dispatch surface Feature
36 opened up; a node-and-edge graph rendering surface (nodes = declared
entities from the existing alias table, `entity-alias-table.ts`) with pan/
zoom/selection interaction; edges drawn from both Feature 37's derived
co-occurrence data and Feature 38's authored typed edges, visually
distinguished from one another wherever both appear on the same pair of
nodes (per FR-39's explicit requirement, mirroring the existing detected-
mention-vs-authored-link distinction `mentions-core.ts` already enforces for
display); and activating a node navigating to that entity's resource,
following the read-only, activate-to-navigate convention Feature 36
established for the roster. Read-only: no edge authoring happens on this
canvas — that is Feature 38's surface.
**Requirements covered:** FR-39
**User stories:** US-17
**Depends on:** Feature 37, Feature 38
**Branch suggestion:** feat/entity-relationship-graph
**Notes:** Shipped. Depends on both prior features because a graph with
only one edge source drawn would not satisfy FR-39's explicit requirement
that both edge kinds appear, distinguished. Rides the existing `entities`
feature flag rather than introducing one, per FR-39's own text and the
Feature 35/36 precedent (an on-demand/persistent-view feature reusing an
existing flag, as opposed to Feature 34's own flag for a persistent
always-on decoration mode — this is a view like Feature 36, not a decoration
mode like Feature 34). Per Feature 36's precedent, the new seventh-view
plumbing itself needs no ADR-021-specific handling — work-area views are not
routes, so native's static-export build script needs no change — but this
feature's own data sources (Feature 37's co-occurrence read and Feature 38's
authored-edge CRUD) each need their own native transport backend before
native parity is complete, unlike Feature 36, which could lean entirely on
backends two earlier features had already shipped. Graph layout algorithm,
library choice, and behavior at scale (a project with hundreds of entities
and edges) are unaddressed here and belong in this feature's own task
breakdown, in the same spirit as Feature 36's virtualization benchmark being
deferred to a task rather than decided by assertion.

### Feature 40: Entity graph edge tooltips — Shipped
**Value:** A novelist looking at Feature 39's graph can tell what a given
edge actually represents — a co-occurrence count or an authored relationship
type — without leaving the canvas for the accessible list, which today is
the only place that spells an edge out in words.
**Vertical slice:** A hover tooltip on each edge in `EntityGraphCanvas.tsx`
surfacing the same text the synchronized accessible list already renders for
that edge — `describeCooccurrenceEdge`'s "A and B share N resources" for a
co-occurrence edge, `describeAuthoredEdge`'s "A → B (type)" for an authored
edge (both currently defined only in `EntityGraphAccessibleList.tsx`) —
extracted into a shared module so the tooltip and the accessible list read
from one description function rather than two that could drift apart. Each
edge `<line>` already carries the `relationshipType` (authored) or
`sharedResourceCount` (co-occurrence) the tooltip needs off
`positioned.edge` with no new fetch, transport, core-lift, or persisted
data. Edges render at a fixed 1.5px stroke (authored) or a log-scaled width
(co-occurrence, `cooccurrenceStrokeWidth`) — too thin to reliably hover — so
this feature also adds a wider, transparent hit-target line per edge
regardless of which tooltip rendering approach is chosen (see this feature
list's Open Questions).
**Requirements covered:** None of its own — a refinement within the graph
requirement, which already requires the two edge kinds be visually
distinguished and that the graph introduce no new persisted data. This
feature narrows that existing distinguishing requirement to the
pointer-hover case, the same way the graph's other enabling slices each
cover none of their own requirement — see this feature list's Open
Questions.
**User stories:** US-17
**Depends on:** Feature 39
**Branch suggestion:** feat/entity-graph-edge-tooltips
**Notes:** Shipped. Read-only and presentational only: no edge
authoring (that stays on Feature 38's `EntityRelationshipsSection.tsx`
sidebar surface), no new feature flag (rides the existing `entities` flag
Feature 39 already rides), no new persisted data. Distinct from Feature 39's
own scope in degree, not kind — Feature 39 shipped the graph and its
synchronized accessible-list description text; this feature surfaces that
same description on hover on the canvas itself, which Feature 39's own
shipped spec did not include (its Out of scope section does not name
tooltips, so this is a new increment on top of a shipped feature, not a
resumption of something already deferred there).

### Feature 41: Entity graph node dragging — Not started
**Value:** A novelist looking at Feature 39's graph can pull a node into a
clearer spot — away from an overlapping neighbour, or toward the part of the
canvas they're focused on — instead of being stuck with whatever position
`computeGraphLayout` happened to compute on load.
**Vertical slice:** A pointer-drag gesture on a node in `EntityGraphCanvas.tsx`
that repositions only that node, reading and writing a live position map at
render time rather than `computeGraphLayout`'s fixed-300-tick output, which
keeps its existing pure-function, stopped-simulation contract unchanged; edge
endpoints for any edge touching the dragged node must resolve from that live
position map at render time instead of from `PositionedEdge`'s `x1/y1/x2/y2`,
which are only ever set once at layout time. The gesture must distinguish a
drag from the existing `onClick` handler, which both toggles node selection
and calls `onNodeActivated` to navigate away to that entity's resource — a
drag that ends on the node must not also fire that navigation. Drag coordinate
math (client-pixel to viewBox conversion, including the zero-sized-element
case jsdom produces) follows the same conversion the existing wheel/zoom
handler in the same file already derives.
**Requirements covered:** FR-40
**User stories:** US-17
**Depends on:** Feature 39
**Branch suggestion:** feat/entity-graph-node-dragging
**Notes:** Not started. Three product-rung decisions are settled and not
reopened here: reposition is static — only the dragged node moves, no live
force simulation runs during or after a drag, and `computeGraphLayout` keeps
its pure, deterministic, fixed-tick contract, accepting that edges stretch
rather than the layout relaxing; dragged positions are ephemeral and are
never persisted, consistent with FR-13's existing ephemeral-position
constraint; and there is no keyboard-operable equivalent at this ship, a
deliberate exclusion, not an oversight. View-layer only: no entity data,
co-occurrence value, or authored relationship is read or written by a drag.
No new feature flag — rides the existing `entities` flag Feature 39 already
rides. No new dependency — `d3-force` is already installed and this feature
needs nothing further from it, since the simulation itself is not what
drives the drag. Distinguishing a drag from the existing click-to-select/
click-to-navigate gesture is a real implementation cost this entry does not
minimize away — see this feature list's Open Questions for the pixel-movement
threshold that decision needs.

### Feature 42: Remove an entity declaration — Not started
**Value:** A novelist who declared a resource as an entity by mistake, or no
longer wants it tracked as one, can fully un-declare it in one action —
clearing `entityKind` and `aliases` together — instead of using the existing
field-clearing path, which deliberately leaves `aliases` dormant with no UI
left to remove them once `isEntity` goes false.
**Vertical slice:** A model-layer bulk delete in
`frontend/src/lib/models/entity-relationships.ts` removing every authored
edge where the entity being un-declared is source or target, under the same
single `withMetaLock` read-modify-write discipline `createEntityRelationship`/
`removeEntityRelationship` already use — nothing like it exists today, only
per-edge removal; a new sibling HTTP route alongside the existing
`frontend/app/api/project/[project-id]/entity-relationships/route.ts` (GET/
POST) and `.../entity-relationships/remove/route.ts` (POST) — e.g. `.../
entity-relationships/remove-by-entity/route.ts` — plus the
`lib/api/entity-relationships.ts` /
`store/transport/native-entity-relationships-backend.ts` `createTransport`
collapse exposing it, per ADR-021 parity; a sidecar write clearing
`entityKind` and `aliases` together through the existing `updateSidecar`
path, which already triggers `enqueueEntityRescan` and the alias table's
exclusion of non-entity resources — no new cleanup mechanism; and a Remove
Entity control in the entity's own sidebar view (`EntitySection.tsx` area)
that opens the existing `ConfirmDialog` component (`isOpen`, `title`,
`description?`, `details?: React.ReactNode`, `confirmLabel?`,
`cancelLabel?`, `onConfirm`, `onCancel`), placing the keep/delete-edges
choice in its `details` slot with no new props needed, defaulting to keep
and hidden entirely when the entity has zero authored edges, then refetches
the alias table on completion.
**Requirements covered:** FR-41
**User stories:** US-3
**Depends on:** Feature 33, Feature 38
**Branch suggestion:** feat/remove-entity
**Notes:** Not started. This is a scoped exception to the product's
otherwise-universal rule that deleting an entity leaves its authored edges,
backlinks, and mentions untouched (see FR-39 and the CLAUDE.md glossary's
"Entity relationship" entry) — FR-41 explicitly carves out an opt-in bulk
edge delete as one of the two choices this action offers, rather than
reaffirming the untouched-edges default everywhere. The existing
field-clearing path in `EntitySection.tsx` (`withEntityKind` setting
`entityKind: undefined`, leaving `aliases` dormant) is unchanged by this
feature and remains the lighter, intentionally partial alternative — the two
entry points are deliberately distinct, per the parent spec's resolved OQ-9,
not a fix to or replacement of the old one. No new feature flag — rides the
existing `entities` flag FR-35 already established. The action lives only in
the entity's own sidebar view; the roster (Feature 36) stays read-only and
gains no mutating action, per the parent spec's resolved OQ-10. No undo and
no trash-like holding area for deleted edges, per resolved OQ-8, consistent
with edges never being soft-deleted anywhere in the product.

---

## Coverage check

- Requirements covered:
  - FR-1: Feature 1
  - FR-2: Feature 2
  - FR-3: Feature 3
  - FR-4: Feature 4
  - FR-5: Feature 4
  - FR-6: Feature 4
  - FR-7: Feature 5
  - FR-8: Feature 6
  - FR-9: Feature 7
  - FR-10: Feature 8
  - FR-11: Feature 9
  - FR-12: Feature 10
  - FR-13: Feature 11
  - FR-14: Feature 12
  - FR-15: Feature 13
  - FR-16: Feature 14
  - FR-17: Feature 15
  - FR-18: Feature 16
  - FR-19: Feature 17
  - FR-20: Feature 18
  - FR-21: Feature 19
  - FR-22: Feature 20
  - FR-23: Feature 21
  - FR-24: Feature 22
  - FR-25: Feature 23
  - FR-26: Feature 24
  - FR-27: Feature 25
  - FR-28: Feature 26
  - FR-29: Feature 27
  - FR-30: Feature 28
  - FR-31: Feature 29
  - FR-32: Feature 30
  - FR-33: Feature 31
  - FR-34: Feature 32
  - FR-35: Feature 33
  - FR-36: Feature 34
  - FR-37: Feature 35
  - FR-38: Feature 36
  - FR-39: Feature 39 (Features 37 and 38 are enabling slices of the same
    requirement with no FR of their own — see this feature list's Open
    Questions)
  - FR-40: Feature 41
  - FR-41: Feature 42
- Unassigned requirements: none

## Summary

- Total features: 42
- Suggested build order: Features 1 through 23 are already shipped
  (foundational chain: 1 → 2 → 6 → 7 → {8, 9, 18} → {9 → 11, 10} → 11 → {4 →
  5 → 11, 20}; 3, 13, 14, 15, 16, 17, 19, 21, 22, 23 hang off earlier shipped
  features independently). The entity chain 33 → 34 → 35 → 36 has since
  shipped in full: the entity layer, editor highlighting, entity-scoped
  compile, and the project-level roster. FR-39 extends that chain as three
  new features off the already-shipped Feature 33: 37 (derived co-occurrence
  data) and 38 (authored typed relationships) can be built in either order or
  in parallel, since neither depends on the other; 39 (the graph view) needs
  both, since it must render and visually distinguish edges from both
  sources at once. 40 (edge tooltips) depends on 39, since it hovers over
  edges 39 draws, and adds nothing else. 41 (node dragging) also depends on
  39, since it repositions nodes 39 draws, and can be built in either order
  relative to 40 — the two are independent refinements on top of the same
  parent feature. Of the remaining pre-existing work: 24 (Organizer
  filters), 25 (signed installers), 26 (Trash UI), and 27 (search across
  revisions) are independently startable now. 28 (hosted multi-device
  access) must land before 30 (its conflict-resolution model, which depends
  on it). 29 (durable search backend) is contingent on demonstrated need
  rather than sequenced by dependency. 31 (Scrivener/Word importer) only
  depends on the already-shipped Feature 2. 32 (joining search and query
  predicates) depends on the already-shipped Features 8 and 9. 42 (removing
  an entity declaration) depends on the already-shipped Features 33 and 38 —
  33 for the entity declaration it reverses, 38 for the authored edges its
  keep/delete-edges choice acts on — and is independently startable now.
- Independently shippable: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41, 42 (30 is the only feature left with an unmet hard
  dependency — on 28)
- Not yet built: 24, 26, 27, 28, 29, 30, 31, 32, 41, 42.
  Everything else in this list has shipped.
- Risks: Feature 30 is undesigned — its Vertical slice describes a
  resolution policy still to be chosen, so its task breakdown will need a
  design decision before implementation tasks can be written. Feature 28 is
  the largest slice in this list (hosted tenancy + sync transport) and is
  likely to need its own further feature breakdown rather than a single
  task list, though substantial foundations already ship. Feature 31
  carries external-format-parsing risk (Scrivener's `.scriv` container
  format is undocumented by Scrivener itself) that may affect estimate
  confidence more than the other Not-started features. Feature 27 merges two
  previously separate concerns (revision-aware indexing and diff-open
  revision selection) per the parent spec's FR-29 correction; its task
  breakdown should confirm the merge doesn't hide two different sizes of
  work. The risks previously logged here for Features 34, 35 and 36 are
  retained as shipped-work lessons rather than forecasts. Feature 36's — that
  it was the first feature to touch the closed, hardcoded five-view
  `ViewName`/`VIEW_OPTIONS`/`AppShell` dispatch surface — was borne out: the
  roster shipped unreachable unless a resource was selected, because a second
  `!selectedResource` guard inside that dispatch was not accounted for. There
  is now a sixth-view precedent for the next one to follow. Feature 36 also
  demonstrated a failure mode worth carrying into future breakdowns: two
  defects reached `main` past a fully green suite, one because every existing
  test selected a resource first and one because the fixtures made the right
  and wrong answer numerically identical, and both were found by exercising
  the running app. Feature 34's unbenchmarked per-keystroke alias-scan cost
  was never measured and remains unmeasured. Feature 38 is undesigned in the
  same sense Feature 30 is: its Vertical slice names a relationship-type
  schema and an edge-deletion-on-entity-deletion policy that are not yet
  decided (parent spec OQ-3), so its task breakdown will need those design
  decisions made first. Feature 39 carries the same open-ended scale
  question Feature 36 resolved by measurement (virtualization) but for graph
  layout instead of a list — this breakdown does not assume any particular
  answer and expects that feature's task list to measure rather than assert
  it, following Feature 36's precedent.

## Open Questions

(OQ-1, on licensing/distribution posture, is tracked in the parent
product spec and does not affect this feature partition. Two previously
logged questions here have since been resolved by amendments to the parent
product spec: Feature 33 having no rung-2 functional requirement was
resolved when FR-35 was added, and Feature 34 having no requirement of its
own — it previously only extended FR-35's surface — was resolved when FR-36
was added; see each feature's Requirements covered field.)

FR-39 split (this document's own scoping call — Gate 2 review, 2026-09-07):

- **Resolved: schema mechanics for Features 37/38 carrying no requirement of
  their own.** `sab.features/1` permits a feature to cover no requirement.
  `sab.features.v1.schema:17` declares `Requirements covered` as
  `required | ids`, but the validator (`check-outputs.js`) checks only that
  the field is present and non-empty text (`check-outputs.js:589-591`); no
  rule requires that text to contain an `FR-N` token. The `partition` check
  (`check-outputs.js:855-874`) only rejects two features claiming the same
  requirement, and `crossCheck` (`check-outputs.js:880-919`) only requires
  that the union across all features covers every requirement in the parent
  spec. A zero-requirement feature satisfies both checks. This is a
  permission the schema grants, not a gap the validator fails to catch, and
  it is why Features 37 and 38 can each carry "None of its own" without the
  document failing validation. This section previously justified the same
  fact by citing a false precedent — that Feature 33 once carried no
  requirement of its own until the parent spec was amended to add FR-35.
  Verified against git: commit `7eb0e0fa` (2026-08-25) added FR-35 to
  `specs/product/getwrite.md` and Feature 33's row to this document with
  `Requirements covered: FR-35` in the same commit; Feature 33 never existed
  here with an empty or "None" requirements field. That claim has been
  removed. What this document's opening note to this section accurately
  records is a different shape: two prior open questions about Features 33
  and 34 initially lacking their own rung-2 requirement, both closed by
  adding the requirement in the same pass as the feature row — not a feature
  standing indefinitely with no requirement, which is what Features 37 and
  38 now do by design.
- **Resolved: three-way split stands, and every one of the three is now an
  independently shippable slice.** The split remains Feature 37 (derived
  co-occurrence data), Feature 38 (authored typed relationships), and
  Feature 39 (the graph rendering view) — not the two-way split the parent
  spec's OQ-3 raised as the obvious candidate, and not folded further. The
  rendering surface stays its own feature because a writer cannot use either
  data source without something to look at, and because the FR-39 mandate to
  visually distinguish the two edge kinds is a rendering concern that only
  makes sense once both data sources exist. At Gate 2 review, Feature 37 as
  first drafted failed this document's own bar for a seam — its Value field
  admitted it shipped nothing a writer could use unassisted, which this
  document's instructions treat as evidence the seam is wrong. The fix was
  not to fold Feature 37 back into 38 or 39, but to give it its own minimal
  display: a small "who does this entity usually appear alongside" list
  added to `EntityMentionsSection.tsx`, the entity's own sidebar view (see
  Feature 37's Notes for why that surface was chosen over a per-row roster
  addition). With that change, all three features now ship something a
  writer can use on their own — Feature 37's co-occurrence list, Feature
  38's minimal add/remove relationship control, and Feature 39's graph
  canvas — and Feature 39's graph rendering remains distinct from Feature
  37's list rather than duplicating it: one draws entities as nodes and
  relationships as edges, the other is plain text in a sidebar.
- Feature 38's relationship-type vocabulary is unresolved: open freeform
  text, a fixed enumerated set, or a per-project user-extensible list (the
  same shape decision Feature 18 already made for custom metadata fields,
  which could be a precedent) is not decided anywhere in this document or
  the parent spec.
- Feature 38's edge-deletion-on-entity-deletion lifecycle is unresolved —
  this is the parent spec's OQ-3 question, unanswered here and carried
  forward rather than resolved, per this skill's instruction not to resolve
  open questions. Candidate behaviors (cascade-delete the edge, orphan it
  with a dangling reference shown as "Deleted" the way Feature 22's broken
  reference preview already does, or block the entity deletion while edges
  reference it) are not evaluated here.
- Whether Feature 38 ships any authoring surface beyond a minimal add/
  remove control, or a fuller relationship-management UI, is left to that
  feature's own task breakdown; this document only commits to the minimum
  needed for the feature to be independently shippable.
- New question raised by giving Feature 37 a display: `EntityMentionsSection.tsx`
  currently fetches only the selected entity's own merged mention/link set
  (`getEntityMentionedIn`) — it does not currently look up which *other*
  entities are mentioned in those same resources. Whether the co-occurrence
  read this feature adds is a new endpoint of its own, or an extension of an
  existing one (e.g. widening `getProjectMentionCounts`'s read or adding a
  sibling function in `mentions-core.ts`), is left to that feature's task
  breakdown rather than decided here.
- Feature 40's tooltip rendering mechanism — an SVG `<title>`/native browser
  tooltip on the edge element, a custom positioned HTML overlay, or
  something else — is not decided here and is left to that feature's task
  breakdown.
- Feature 40 is scoped to pointer hover; whether the same tooltip should
  also appear on keyboard focus of an edge is unresolved, and is entangled
  with the fact that edges are not currently focusable elements at all
  (Feature 39 shipped without inserting them into taborder, in favour of the
  synchronized accessible list — see that feature's Out of scope section).
- Whether hovering a node (as opposed to an edge) should show anything is
  unresolved; this feature's Vertical slice covers only edges.
- Feature 41's pixel-movement threshold separating a click (toggle selection
  and navigate) from a drag (reposition only) is not decided here and is
  left to that feature's task breakdown.
- Whether a node Feature 41 has dragged should stay pinned at its dragged
  position if the component re-renders with changed node/edge data — for
  example, an entity is added or an edge changes while a drag override is
  held — is unresolved.
- Whether Feature 41's drag should be constrained to the canvas's visible
  bounds, or allowed to move a node off-canvas, is unresolved.
- **Resolved (product owner, Gate 2 review, 2026-09-10): Feature 42's HTTP
  route name and shape for the bulk edge delete is deferred to the feature
  spec `specs/features/remove-entity.md`.** The proposed shape there is
  `POST /api/project/[project-id]/entity-relationships/remove-by-entity`
  with body `{ entityId }`, always 200 with `{ removedCount }`, delegating
  to a new model function `removeEntityRelationshipsForEntity`, modelled on
  the sibling `remove/route.ts` (which treats nothing-to-remove as success).
- **Resolved (product owner, Gate 2 review, 2026-09-10): not split.** The
  bulk-delete-every-edge-for-an-entity operation stays inside Feature 42
  rather than becoming its own feature — its only caller is the Remove
  Entity confirmation choice, and on its own it ships nothing a writer can
  use, failing this document's own independently-shippable bar (the Feature
  37 precedent).
