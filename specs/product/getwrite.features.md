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
Card _filtering_ by Status, word count, or reference fields is broken out
separately as Feature 24 (Shipped), not folded into this entry's Shipped
status.

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
**Notes:** Shipped. As shipped, tags could not be renamed at any layer;
renaming meant deleting and recreating, which dropped assignments. Editing a
tag's name and colour in the tag manager (FR-18 as amended) was added later
as release polish outside a pipeline run, merged to `main` as PR #282 (not
released).

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
Note, 2026-10-08: template creation was measured on this date to write
resources the project loaders reject (a flat content file and a four-key
sidecar, after which `loadProjectFromDisk` and `getLocalResources` both throw
for the whole project); Feature 73 fixes it and adds `save-from-resource` to
the shipped commands, and has shipped and merged to `main`
(PR #261, 2026-10-08). Correction, 2026-10-08: the statement
above that the richer template CLI is not wired into the shipped binary no
longer holds for one command: `templates save-from-resource` is now a registered
command in the shipped `getwrite-cli` (merged to `main`); the other helper
subcommands remain unbundled and reachable only from tests. This entry's status
and references are unchanged.

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

### Feature 24: Organizer view — card filtering — Shipped

**Value:** A plain-file writer filters the Organizer's card view by the
facets that matter to them, instead of only being able to hide/show bodies.
**Vertical slice:** Filter-state model in Organizer view, filter UI
controls, query wiring for Status, word count, and the project's
resource-reference fields.
**Requirements covered:** FR-26
**User stories:** US-7
**Depends on:** Feature 11
**Branch suggestion:** feat/organizer-filters
**Notes:** Shipped. `specs/features/organizer-card-filtering.md` and its
`tasks.md` are the authoritative record of the shipped scope, merged to
`main` in PR #249 (merge commit `f1254f76`). Organizer's card view now
supports filtering by Status, word count, and the project's resource-
reference fields, AND-combined when more than one is set; each filter has
its own clear control plus a clear-all; a filter that narrows the visible
set to zero cards shows a distinct empty-state message rather than the
plain "no resources" one; filter values reset on folder navigation (the
filter _is_ scoped per view, not per folder, but its values don't persist
across a navigation); and the whole thing is client-side state over
already-loaded data, adding no new transport, route, or native backend.
Post-review, the same branch went through a UI iteration beyond the
original vertical slice: the filter area became collapsible — a top-level
"Filters" toggle plus a nested "Advanced filters" disclosure scoping the
resource-reference controls — with both toggles' collapse state persisting
across folder navigation (distinct from the filter _values_, which do
reset on navigation, per above); and the layout itself went through
several rounds of owner-driven refinement (vertical stack → horizontal
wrap → moving Advanced filters below the Status/word-count row), recorded
as sequential tasks in `tasks.md`. One known gap shipped as-is by owner
decision: the "No status" filter option is unreachable in any project with
at least one configured status, because the filter predicate mirrors
`OrganizerCard`'s own existing display-resolution fallback exactly rather
than introducing a different rule for filtering. Tracked separately as POS
`task_8152c7e7`, pending a future design pass on how statuses are
configured/resolved — not addressed by this feature.

### Feature 25: Signed, warning-free desktop installers — Partial

**Value:** A plain-file writer installs the desktop build on macOS or
Windows without an OS security warning undermining trust in the app.
**Vertical slice:** Code-signing and notarization pipeline (macOS),
Windows code-signing, electron-builder packaging config changes.
**Requirements covered:** FR-27
**User stories:** US-8
**Depends on:** Feature 13
**Branch suggestion:** feat/signed-desktop-builds
**Notes:** Partial — build and packaging already ship. macOS signing and
notarization are configured on `feat/signed-desktop-builds`
(`forceCodeSigning` in `electron/electron-builder.yml`; Developer ID
certificate and App Store Connect API key passed to the macOS job of
`.github/workflows/build-electron.yml`, which checks `stapler validate` before
upload). An `afterPack` hook (`electron/scripts/after-pack.cjs`) removes a
dangling symlink in the standalone server that otherwise fails signing. A
local signed build passed on 2026-10-30: both architectures notarized, and
`codesign --verify`, `stapler validate` and `spctl` (source=Notarized
Developer ID) all passed. Not yet verified by a signed CI build. Windows
signing is outstanding.

### Feature 26: Trash UI — browse, restore, purge — Shipped

**Value:** A writer on deadline recovers an accidentally deleted resource
from within the app, with no filesystem detour, and can trust that
permanently emptying Trash actually removes everything it should.
**Vertical slice:** A per-project Trash view listing soft-deleted items;
bulk restore, bulk permanent delete, and "Empty trash," each requiring
explicit confirmation; folder delete cascading into Trash as a single
restorable/purgeable unit; non-blocking restore (falls back to the project
root and applies a name-collision suffix, with a notice to the writer when
that happens); a confirmed full purge sweep that removes a resource's
files, sidecar, revisions, and its entries in the inverted index,
backlinks, the mention index, and any authored relationship edges naming
it; and a record of references nullified by deletion that re-links on
restore, reporting any still-dangling reference. Ships on hosted web and
Electron desktop; native Android transport parity is deferred (tracked as
Feature 49).
**Requirements covered:** FR-28
**User stories:** US-11
**Depends on:** Feature 1
**Branch suggestion:** feat/trash-ui
**Notes:** Shipped. Merged to `main` on 2026-09-14 as merge commit
`2f180cd5` ("Merge pull request #200 from saboteur-works/feat/trash-ui").
Its feature spec, `specs/features/trash-ui.md`, is the authoritative record
of the shipped scope. Scope fixed by owner decisions (2026-09-14, resolving
OQ-24 through OQ-30): project-scoped Trash view, no workspace-wide
aggregation (OQ-24); multi-select restore/delete and "Empty trash," no
auto-purge (OQ-25); folder-delete cascade into Trash (OQ-26); non-blocking
restore with relocation/rename notice (OQ-27); confirmed purge removing
files, sidecar, revisions, inverted index, backlinks, mention index, and
authored relationship edges (OQ-28); hosted web and Electron desktop at
first ship, Android deferred (OQ-29); restore re-links nullified
references and reports any still outstanding (OQ-30). Not formally listed
as a dependency (this feature list's ordering ties "Depends on" to build
order, and Feature 26 sits before Feature 38), but the purge sweep relies
on already-shipped Feature 38's `removeEntityRelationshipsForEntity`
(`entity-relationships.ts`) to remove relationship edges naming a purged
entity. A set of follow-up refinements identified after the merge is
tracked in `specs/features/trash-ui/follow-up-work.md` and addressed by
`specs/features/trash-ui-followups.md`.

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

### Feature 31: Scrivener CLI importer — Shipped

**Value:** A novelist migrating from Scrivener imports their Scrivener 3,
Mac-authored project's binder — Draft, user-created top-level folders beside
Draft, and text documents within Research — document text, and per-document
metadata into a fresh GetWrite project with one CLI command, instead of
manually re-creating it.
**Vertical slice:** A `.scriv` reader parsing the project's `.scrivx` XML
binder hierarchy — Draft, any user-created top-level folders beside Draft
(e.g. Templates, Archive, Scraps), and text documents (and their folders)
within Research, skipping and reporting `Other`-typed top-level items — plus
each document's RTF body under `Files/Data/<UUID>/`, synopsis, notes,
status, keywords, and custom metadata fields; a mapping layer from that
binder structure onto a new GetWrite project's resource tree (reusing
`project-creator.ts`'s scaffolding machinery, with Research rendered as a
top-level GetWrite folder) and metadata layer (status field, keywords onto
tags, custom fields onto GetWrite's user-defined schema, per FR-42); a new
`getwrite-cli` subcommand performing the one-shot conversion end to end; and
skip-and-report handling that logs any unconvertible content — including
Research media (images, PDFs, web archives) and `Other`-typed items — and
continues importing the rest of the project, producing a post-import report
the writer can read.
**Requirements covered:** FR-42
**User stories:** US-4
**Depends on:** Feature 2
**Branch suggestion:** feat/scrivener-cli-importer
**Notes:** Shipped. Merged to `main` on 2026-09-12 as merge commit
`f12745de` ("Merge branch 'feat/scrivener-cli-importer'" — a local merge, no
PR number). Its feature spec, `specs/features/scrivener-cli-importer.md`, is
the authoritative record of the shipped scope. Two follow-up fixes merged
the same day: an editor plain-text revision-flattening fix (`ef387a18`,
2026-09-12) and a sidecar write/read race fix making sidecar writes atomic
so unlocked readers never see a partial file (PR #197, `600094f5`,
2026-09-12). This feature replaces the former combined "Scrivener/Word
project importer" entry that previously held this ID — split 2026-09-11
(owner decision) once Scrivener import became committed, current work (FR-42)
distinct from Word/DOCX import (now Feature 45). FR-33 moved from Later
Requirements into In Progress Requirements on 2026-09-13, when Feature 45
itself moved to Not Started — see the Feature 45 entry below for current
status. Scoped to Scrivener 3, Mac-authored projects only (resolved
OQ-16 in the parent spec); Scrivener 2 projects and Windows-authored projects
are an explicit, documented gap, not rejected outright — see the parent
spec's Out of Scope (Deferred). Widened 2026-09-11 at this feature's own
feature-spec gate (owner decision, recorded in the parent spec's FR-42):
text documents (and their folders) within Scrivener's Research folder are
imported under a top-level GetWrite "Research" folder, and user-created
top-level binder folders beside Draft (e.g. Templates, Archive, Scraps) are
imported as top-level GetWrite folders alongside Draft content; Scrivener
`Other`-typed items are skipped and reported like any other unconvertible
content. Only non-text Research content (media: images, PDFs, web archives)
remains deferred, along with carrying Scrivener snapshots across as
GetWrite revisions and importing the project's Trash — none of these three
are broken out as separate features here because the parent spec has no
requirement covering them — see its Out of Scope (Deferred) section
instead. One-shot only: each run creates a fresh GetWrite
project, with no notion of re-importing into or merging with an existing one
(resolved OQ-12); repeatable/merge import is Feature 44, a separate, deferred
feature. This was the first deliverable in the CLI-first sequencing decided
at the product-spec gate (resolved OQ-14); a writer-facing UI import flow,
Feature 43, now depends on this feature having shipped rather than on it
shipping in the future. Considered and rejected: splitting this feature
further into a binder-plus-text slice and a separate metadata-mapping
slice — resolved 2026-09-11 in this feature's own feature spec (that spec's
OQ-3): one combined implementation pass, no split. FR-42 bundles
synopsis/notes/status/keywords/custom-metadata carry-over into the same
one-shot command and the same skip-and-report behavior as binder structure
and document text; a binder-plus-text-only first slice would have shipped a
materially lesser import (silently dropping status, keywords, and custom
fields a writer would reasonably expect) rather than a genuinely independent
vertical slice, so the requirement's own bundling was the shippable unit
implemented here.

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
deferred to a task rather than decided by assertion. FR-39 was further
amended 2026-10-01 (see the product spec's OQ-50, resolved) — this entry's
shipped description reflects the original co-equal two-source edge model
(derived co-occurrence and authored typed edges as peers, per OQ-2's
original resolution), which that amendment supersedes in favor of a
five-type customizable connection list. See Feature 68.

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
resumption of something already deferred there). FR-39's amendment
2026-10-01 (see the product spec's OQ-50, resolved) widens the graph from
two edge types to five; this entry's shipped tooltip coverage
(`describeCooccurrenceEdge`/`describeAuthoredEdge` only) does not yet
describe the three new connection types and will need extending if/when
Feature 68 ships them. See Feature 68.

### Feature 41: Entity graph node dragging — Shipped

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
**Notes:** Shipped. Merged as PR #194
(`6f699f4c`), including `676da04b` (fix: make node dragging work on touch).
Three product-rung decisions are settled and not
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
threshold that decision needs. FR-40 was further amended 2026-10-01 (see
the product spec's OQ-51, resolved) — this entry's claim that "dragged
positions are ephemeral and are never persisted, consistent with FR-13's
existing ephemeral-position constraint" is no longer accurate; FR-40 as
amended requires a persisted position, pinned by default and invalidated
only when the active connection-type list changes. See Feature 68.

### Feature 42: Remove an entity declaration — Shipped

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
**Notes:** Shipped. Merged as PR #196 (`7559a5e3`), 2026-09-11. Its feature
spec, `specs/features/remove-entity.md`, is the authoritative record of the
shipped scope — including a sidecar-clearing defect found and fixed along
the way: clearing `entityKind`/`aliases` by sending an `undefined`-valued
key never survived `JSON.stringify` to the server, so the field was measured
to persist on disk despite a 200 response; the fix introduced an explicit
`clearKeys` parameter threaded through the sidecar write on both HTTP and
native transports. This is a scoped exception to the product's
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

### Feature 43: Scrivener UI import flow — Shipped

**Value:** A novelist using the Electron desktop app who doesn't want to
touch the CLI can import their Scrivener project directly from the app, with
the same one-shot scope Feature 31's CLI command already provides.
**Vertical slice:** A native OS directory picker running in the Electron
main process (precedent: `electron/src/main.ts`'s
`getwrite:choose-workspace-dir` IPC handler using
`dialog.showOpenDialog({ properties: ["openDirectory"] })`, exposed via
`electron/src/preload.ts`) that lets a writer pick a `.scriv` project; the
picked path is handed to the already-shipped `importScrivenerProject`
conversion through a trusted main-process path, reusing Feature 31's binder/
text/metadata conversion logic unchanged rather than reimplementing it — the
renderer MUST NOT send a filesystem path to a Next API route
(`docs/standards/security.md` §2, "Never Trust a Client-Supplied Path"); the
exact handoff design between the main-process picker and the conversion call
is a feature-spec decision, not settled here; plus progress/completion UI and
a UI rendering of the same skip-and-report output the CLI produces as a file.
**Requirements covered:** FR-43
**User stories:** US-4
**Depends on:** Feature 31
**Branch suggestion:** feat/scrivener-ui-import
**Notes:** Shipped. Merged to `main` on 2026-09-13 as merge commit
`e2768ed4` ("Merge pull request #198 from
saboteur-works/feat/scrivener-ui-import"). Its feature spec,
`specs/features/scrivener-ui-import.md`, is the authoritative record of the
shipped scope. The Electron main process (`electron/src/main.ts`) registers
IPC channels `getwrite:scrivener-choose-source` (a native picker returning
an opaque selection handle plus display name via
`electron/src/scrivener-import/selection-handles.ts` — the source path never
crosses into the renderer) and `getwrite:scrivener-start-import` (one import
in flight at a time, `electron/src/scrivener-import/import-guard.ts`). The
import itself runs in a separate forked utility process,
`electron/worker/scrivener-import-worker.ts`, which drives Feature 31's
existing `importScrivenerProject` conversion unchanged. The UI is
`frontend/components/Start/ImportScrivenerDialog.tsx`, opened from an
"Import" button on `StartPage.tsx` that renders only when a desktop bridge
is present — i.e. only in the Electron shell, never on hosted web or native
Android. In the parent product spec, FR-43 moved from Next Requirements
into In Progress Requirements on 2026-09-12 (owner decision, resolved
OQ-17) now that its platform-scope gate is resolved (resolved OQ-18), and
has since shipped from there. Hosted web and native Android UI import
remain deferred, not permanently excluded (see the parent spec's Out of
Scope (Deferred)); no separate feature entry exists here for either, since
the owner's instruction at this feature's Gate 0 was that a platform-scope
split should come back to them only if scope forced one, and the
Electron-only decision did not force one — see Feature 46 and Feature 47,
whose dependency on this feature is now satisfied. Scope matches Feature 31
exactly — same one-shot behavior, same imported content (the project's
binder — Draft, user-created top-level folders, and text documents in
Research, widened 2026-09-11 at Feature 31's feature-spec gate — document
text, synopsis/notes, status, keywords, custom metadata), same
skip-and-report handling, same Scrivener 3/Mac-only support — this feature
is a UI wrapper around Feature 31's conversion, not a re-scoping of it.

### Feature 44: Repeatable Scrivener import — Not started

**Value:** A novelist who already imported a Scrivener project can re-run
the import later to bring across changes made in Scrivener since, instead of
being limited to a single one-time conversion that leaves the GetWrite
project to diverge on its own from then on.
**Vertical slice:** A notion of a prior import's identity — linking a
GetWrite project back to the `.scriv` source it was imported from, so a
later run can recognize it as a re-import rather than a fresh one; a diff/
merge strategy for reconciling re-imported binder structure, document text,
and metadata against the existing GetWrite project's current state (design
not yet decided — see this feature list's Open Questions); and a CLI (and
possibly UI) surface to trigger a re-import against an already-imported
project.
**Requirements covered:** FR-44
**User stories:** US-4
**Depends on:** Feature 31
**Branch suggestion:** feat/scrivener-repeatable-import
**Notes:** Not started, and undesigned in the same sense Feature 30 and
Feature 38 are — the parent spec states this as a MAY-level Later
requirement and explicitly notes that repeatable import "needs a notion of a
prior import's identity and a diff/merge strategy that neither of [FR-42 nor
FR-43] defines." Split 2026-09-11 (owner decision) from FR-42/FR-43, which
are one-shot only. Deferred, not scheduled against a fixed date.

### Feature 45: Word/DOCX project importer — Shipped

**Value:** A novelist migrating from Word imports their existing DOCX
project structure into GetWrite instead of manually re-creating it, from
either a single `.docx` file or a folder of them, without touching the
command line.
**Vertical slice:** A DOCX parser (both source kinds auto-detected: a
single `.docx`, split into multiple GetWrite resources at Heading 1 by
default with the split level configurable, or a folder of `.docx` files
imported one resource per file with subdirectories mirrored as GetWrite
folders), a DOCX-specific skip-and-report mechanism for unconvertible
content, and a CLI command plus an Electron desktop UI shipped together —
the UI following Feature 43's native-main-process-picker pattern — as a
one-shot conversion into a fresh project of a writer-chosen project type.
**Requirements covered:** FR-33
**User stories:** US-18
**Depends on:** Feature 2, Feature 31, and Feature 43
**Branch suggestion:** feat/docx-importer
**Notes:** Shipped. Merged to `main` on 2026-09-13 as merge commit
`15d77139` ("Merge pull request #199 from
saboteur-works/feat/docx-importer"). Its feature spec,
`specs/features/docx-importer.md`, is the authoritative record of the
shipped scope. Owner decision (2026-09-13): FR-33 moved from Later
Requirements into In Progress Requirements in the parent spec and was
carried forward through the pipeline as this feature, which has since
shipped from there. Its scope is settled by the parent spec's resolved
OQ-19 through OQ-23 (source-kind auto-detection and split rule; content
fidelity bar; CLI+UI delivery on Electron only; DOCX-specific
skip-and-report; one-shot import with a writer-chosen project type). This
feature carries the ID previously held together with Scrivener import
under the old combined Feature 31 entry; split 2026-09-11 (owner decision)
once Scrivener import became committed, current work (then FR-42, now
Features 31/43/44) distinct from Word/DOCX import. Feature 31 (the
Scrivener CLI importer) and Feature 43 (its desktop UI wrapper) shipped
first; per resolved OQ-21, this feature's UI follows Feature 43's
native-picker pattern and its CLI follows Feature 31's
command-registration precedent — DOCX parsing itself was new work with no
equivalent Scrivener conversion logic to reuse.

### Feature 46: Scrivener UI import on hosted web — Not started

**Value:** A novelist using GetWrite's hosted web product imports their
Scrivener project directly from the browser, with the same one-shot scope
Feature 31's CLI command and Feature 43's desktop UI already provide.
**Vertical slice:** A multi-file/directory or zip-upload mechanism for a
`.scriv` bundle — none exists today; `app/api/resource/upload` accepts a
single file only — plus server-side decompression and path-traversal limits
consistent with `docs/standards/security.md`, hosted object-store/tenant
storage staging for the uploaded bundle (ADR-019/ADR-020 considerations), and
a UI wrapper around the already-shipped `importScrivenerProject` conversion
(Feature 31), analogous to Feature 43's desktop wrapper.
**Requirements covered:** None of its own — this is deferred platform scope
carved out of the Scrivener UI import requirement (see parent spec Out of
Scope (Deferred) and this document's Open Questions); no dedicated
requirement exists for it in the product spec yet.
**User stories:** US-4
**Depends on:** Feature 43, and Feature 31
**Branch suggestion:** feat/scrivener-web-import
**Notes:** Placeholder entry — not started, undesigned, and not scheduled.
Added at the owner's Gate 2 decision (2026-09-12) resolving this document's
own open question about whether the deferred hosted-web/native-Android
Scrivener UI import scope should eventually become its own feature entry
(resolved OQ-18 in the parent spec). Blocked on the absence of any
multi-file/directory upload or zip mechanism in the hosted product —
`app/api/resource/upload` is single-file only — which would need a new
upload/staging mechanism with decompression and path-traversal limits, plus
hosted object-store/tenant storage (ADR-019/ADR-020) considerations, before
any of this could be built. A dedicated requirement would need to be added to
the product spec before this feature is specced — the parent spec currently
documents this scope only as an Out of Scope (Deferred) bullet, not a
requirement, and this entry does not invent one. The mechanism is entirely
unproven: no upload/staging design, no decompression/path-traversal design,
and no hosted object-store staging design exist yet.

### Feature 47: Scrivener UI import on native Android — Not started

**Value:** A novelist using GetWrite's native Android app imports their
Scrivener project directly from the device, with the same one-shot scope
Feature 31's CLI command and Feature 43's desktop UI already provide.
**Vertical slice:** A directory-picking mechanism for a multi-file `.scriv`
bundle via Capacitor — no such precedent exists in the native shell today —
routed through the ADR-021 in-process `native-*-backend.ts` pattern to reach
the already-shipped `importScrivenerProject` conversion (Feature 31), plus
whatever on-device staging the picked bundle needs before conversion can run
against it.
**Requirements covered:** None of its own — this is deferred platform scope
carved out of the Scrivener UI import requirement (see parent spec Out of
Scope (Deferred) and this document's Open Questions); no dedicated
requirement exists for it in the product spec yet.
**User stories:** US-4
**Depends on:** Feature 43, and Feature 31
**Branch suggestion:** feat/scrivener-android-import
**Notes:** Placeholder entry — not started, undesigned, and not scheduled.
Added at the owner's Gate 2 decision (2026-09-12) resolving this document's
own open question about whether the deferred hosted-web/native-Android
Scrivener UI import scope should eventually become its own feature entry
(resolved OQ-18 in the parent spec). Blocked on the absence of any
directory-picking precedent for a multi-file `.scriv` bundle via Capacitor,
and on routing that picker's output through the ADR-021 in-process
`native-*-backend.ts` pattern the rest of the native data layer already
uses. A dedicated requirement would need to be added to the product spec
before this feature is specced — the parent spec currently documents this
scope only as an Out of Scope (Deferred) bullet, not a requirement, and this
entry does not invent one. The mechanism is entirely unproven: no
directory-picker design and no on-device staging design exist yet.

### Feature 48: Transport response-body validation — Shipped

**Value:** A writer whose UI receives a malformed response body from a
GetWrite server — e.g. after a project restore, the failure that motivated
this feature — sees the app degrade or report an error the way the module
already handles a bad input, instead of an unvalidated `undefined` reaching
the Redux store and crashing a downstream view.
**Vertical slice:** Runtime validation of the response body at the call
sites in scope for this feature (owner decision, Gate 2, 2026-09-16): Tier 1
plus the four named Tier 2 shapes, about 9 sites across 5 modules —
`resources.ts` x3, `project-types.ts` x1, `projects.ts` x3
(`ProjectApiEntry` — the shape behind the motivating FU-10 crash),
`entity-relationships.ts` x1 (`EntityRelationshipEdge`),
`entity-alias-table.ts` x1 (`EntityAliasTable`); `trash.ts` needs no change,
already guarded. Validation uses the module's existing Zod schemas
(`frontend/src/lib/models/schemas.ts`) where one exists, and a newly
authored schema for each of the four named Tier 2 shapes, the same way the
filesystem persistence boundary already validates, following the in-repo
precedent `trash.ts` and `entity-relationships.ts`'s `listOrThrow` already
set with `typeof`/`Array.isArray` guards. Each site keeps its existing
reject-or-degrade contract on a validation failure, but a failure is now
always surfaced via a new shared helper — e.g. `reportTransportValidationFailure()`,
importable by `lib/api/` modules — that logs now and gives a single seam to
later wire a toast or hosted telemetry to; this helper is new
infrastructure and part of this feature's scope. The remaining deferred
remainder — re-measured 2026-09-17 at 21 unvalidated success-path sites
across 12 modules (`resources.ts` x3, `entity-relationships.ts` x3,
`editor-config.ts` x2, `tags.ts` x2, `mentions.ts` x2, `compile.ts` x2,
`export.ts` x2, `encryption.ts` x1, `preferences.ts` x1,
`entity-cooccurrence.ts` x1, `entity-mention-counts.ts` x1,
`resource-excerpts.ts` x1; see the parent spec's OQ-33 and this document's
Features 50-53) — is explicitly deferred to tracked follow-up, not silently
omitted. Scoped to the current HTTP
transport only (parent spec OQ-31) — this includes the hosted path, since
hosted is itself HTTP: a future sync transport is explicitly deferred, and
ADR-021's in-process native transport crosses no serialization boundary and
is unaffected.
**Requirements covered:** None of its own — this derives from the parent
spec's Constraints section (the transport-boundary validation invariant),
not from a functional requirement; see this feature list's Open Questions
and the parent spec's Open Questions for the owner decisions that scope it.
**User stories:** None
**Depends on:** None
**Branch suggestion:** feat/transport-response-validation
**Notes:** Shipped. Merged to `main` on 2026-09-16 as merge commit
`5aea44c3` ("Merge pull request #207 from
saboteur-works/feat/transport-response-validation"), landing
`frontend/src/lib/api/schemas.ts` and `frontend/src/lib/api/transport-validation.ts`
plus validation at the 9 sites across 5 modules named in the Vertical slice
above. Motivated by a measured gap (of 39
`response.json()` calls across 17 modules in `frontend/src/lib/api/`, 26
return a parsed body via a bare `as` cast with no runtime check; 5 already
use the safe narrow-then-throw idiom, `trash.ts` and
`entity-relationships.ts`, which is the in-repo precedent this feature
follows) and a real failure it caused: `openProject`
(`frontend/src/lib/api/projects.ts:82`) returned a malformed body as
`ProjectApiEntry` via a bare cast, writing `undefined` into the Redux store
and crashing `TrashView` after a successful restore (see
`specs/features/trash-ui/follow-up-work.md` FU-10). The owner's Gate 2
decision (2026-09-16) scopes this feature to Tier 1 plus the four named
Tier 2 shapes and settles the surfacing mechanism as a new shared helper
rather than bare `console.*` per module (developer-only, invisible to
users and hosted operators) or routing through the existing `AppToaster`
(transports cannot currently reach it without a circular dependency on
UI/store code, and it leaves no developer record); both open questions this
feature list previously raised are resolved by that decision.

**Correction (2026-09-17):** The Gate 2 premise above — that "transports
cannot currently reach [`AppToaster`] without a circular dependency on
UI/store code" — was measured false. `frontend/src/lib/toast-service.ts` is a
plain module whose only import is `react-hot-toast` (line 14); it pulls in no
React context and no Redux store code. `frontend/src/lib/compile/run-compile-and-download.ts:23`
— a non-component `src/lib/` module, sibling in kind to `lib/api/` — already
imports `toastService` and calls it, which is existing, shipped practice, not
a proposal. That module's test, `frontend/tests/unit/runCompileAndDownload.test.ts`,
runs in the node vitest project (confirmed via `vitest --reporter=verbose`,
which prefixes each case `|node|`) and all 9 cases pass, so the
node-environment import concern does not arise either; `react-hot-toast`
itself imports cleanly in bare node. The decision to use a shared log helper
is unaffected and stands on its own merits — the helper is the right seam
regardless. What was wrong is this one stated reason for ruling out the
toaster: a user-visible surface was reachable from a transport module all
along. Feature 50 (Task 9) now adds one by having `reportTransportValidationFailure`
also raise a toast, with no contract change at any call site. Why the false
premise was believed at the time is not established; one untested hypothesis
is that the toaster was assumed to mean the `AppToaster` React component
itself rather than the plain `toastService` module it renders — reviewing
what was actually inspected during the 2026-09-16 decision would settle
this.

### Feature 49: Native Trash transport — Shipped

**Value:** A writer using GetWrite's native Android app can browse, restore,
and purge deleted items the same way a writer on hosted web or Electron
desktop already can, instead of hitting a Trash tab that silently does
nothing on their platform.
**Vertical slice:** Two independently-mergeable steps, landing in order.
First, a `trash-core.ts` extraction lifting the transport-agnostic
orchestration already sitting in the two shipped HTTP routes (list, and the
~57 already-transport-agnostic lines of each of restore and purge) out of
route-glue code and into shared core functions, with no behavior change to
the shipped web/desktop paths — this step lands and merges on its own so a
regression in either shipped route stays bisectable from the native work
that follows. Second, a real `native-trash-backend.ts` implementation
replacing the current stub (whose `list`/`restore`/`purge` each
unconditionally reject with "not supported on this platform"), built on top
of the extracted core and wired through the already-existing
`native-trash-backend.web-stub.ts` seam and `next.config.mjs`
`resolveAlias` entries — no new seam plumbing needed, only a real
implementation behind the existing one. The native backend mirrors
`lib/api/trash.ts`'s all-reject contract: `list`, `restore`, and `purge`
each propagate anything outside a per-item catch — a missing project root,
a Capacitor filesystem-bridge error, and a purge sweep failure raised
mid-sweep are named as the minimum failure taxonomy the feature spec must
enumerate against that contract — while a per-item failure inside a batch
restore or purge still yields a per-item `{ ok: false, error }` result
rather than failing the whole call. Test bar matches the sibling native
backends already shipped for the entity layer: a
`native-trash-backend-native-web-parity.test.ts` demonstrating the native
and HTTP paths agree over the same fixtures, and a
`native-trash-backend-web-exclusion.test.ts` demonstrating no native-only
import leaks into the web/desktop bundle.
**Requirements covered:** None of its own — this is deferred native platform
parity for the already-covered Trash browse/restore/purge requirement (see
that feature's Notes and this document's Open Questions); no dedicated
requirement exists for this scope in the product spec.
**User stories:** US-11
**Depends on:** Feature 26
**Branch suggestion:** feat/native-trash-transport
**Notes:** Shipped, in two merged steps. First,
`frontend/src/lib/models/trash-core.ts` (the extraction), merged to `main`
on 2026-09-17 as merge commit `2c7395a0` ("Merge pull request #208 from
saboteur-works/feat/native-trash-transport"). Second, the real
`frontend/src/store/transport/native-trash-backend.ts` implementation
replacing the prior rejecting stub, merged to `main` on 2026-09-17 as merge
commit `35353595` ("Merge pull request #209 from
saboteur-works/feat/native-trash-backend"). Took up the native Android gap
Feature 26 shipped with deferred (parent spec's resolved OQ-29: "deferred,
not rejected"). The all-reject contract and the native failure taxonomy
(missing project root, Capacitor filesystem-bridge error, mid-sweep purge
failure) enumerated in the feature spec before implementation are the owner
decisions already settled — see this document's Open Questions for what
those decisions were and are not. This native Trash transport is real, in-process code, verified by
`native-trash-backend-native-web-parity.test.ts` and
`native-trash-backend-web-exclusion.test.ts`, and has now also been
exercised on a physical device: verified 2026-09-22 on a Pixel 7 Pro
(`cheetah`, serial 29121FDH300EP7), Android 17, running a debug build of
`main` at commit `8bf48d3d`, installed via `frontend`'s `pnpm build:native`
→ `cap sync` → `./gradlew installDebug`. Each step was driven through the
app's UI by a human, and the outcome confirmed by reading app-private
storage directly (`adb shell run-as works.saboteur.getwrite`), not from the
UI's own report. All six paths passed: soft-deleting a resource (content
directory, sidecar, revisions, and the nullified-reference record all
genuinely moved into `.trash/`, not copied); restoring it (full round-trip,
`.trash/` left completely empty with no orphaned ref record); purging it
(target gone from `resources/`, `meta/`, and `revisions/`, `.trash/` swept,
the surviving resource and other project state untouched); a folder
soft-delete cascade (manifest written at `.trash/meta/folder-<id>.json` with
the folder's own descriptor plus its descendant's `id`/`kind`/`parentId`/
`orderIndex`, both moved); folder restore (tree genuinely rebuilt, descriptor
restored with `parentId`/`orderIndex`/original `createdAt` intact, and the
descendant's sidecar `folderId` pointing back at the restored folder); and
empty trash as a batch operation (all items purged, no partial state, live
tree intact — exercising `createNativeRunner`'s per-id `run()` re-entry,
which is why the native backend loops over `purgeOneCore` rather than
calling `purgeBatchCore`). This mattered because every prior test exercised
the in-memory fake `CapacitorFilesystemLike`; the cross-directory rename
soft-delete depends on had never run against the real
`@capacitor/filesystem` bridge before this run. Device verification also
surfaced a defect the test suite did not: deleting a just-restored folder is
a silent no-op until the app reloads. This is a client-state defect, not a
defect in the native Trash transport this feature delivered — the model
layer behaved correctly at every step, including during the failed delete
attempt — tracked as `task_33a403cb` with full detail in the POS note
"Deleting a just-restored folder silently does nothing on native (stale
client state)".

### Feature 50: Transport response-body validation — degrade-to-fallback sites — Shipped

**Value:** A writer using a card excerpt, a tag list, an entity mention
list, an entity co-occurrence/roster count, or a resource's fetched content
that silently degrades to an empty or null fallback on a malformed response
gets that degrade path validated and reported through Feature 48's shared
helper, instead of a bad response body being cast unchecked and only
accidentally behaving like the fallback already in place.
**Vertical slice:** Runtime validation, using the Feature 48 mechanism
(`reportTransportValidationFailure()`, `frontend/src/lib/api/schemas.ts`)
verbatim — no new plumbing — at the 12 sites across 7 modules that share one
contract shape: `!response.ok`, or a caught exception, is handled by
returning a fallback value rather than throwing, and every one of these
sites already sits inside that degrade path today. `frontend/src/lib/api/resources.ts`'s
`fetchContent` (degrades to `null` on `!response.ok`, casts the parsed body
unchecked on success) and `fetchRevisionContent` (same degrade-to-`null`
shape); `frontend/src/lib/api/entity-relationships.ts`'s `create` (degrades
to `null`), `remove` (degrades to `false`), and `removeByEntity` (degrades
to `0`) — all three already inside a `try { … } catch { return <fallback>; }`
block; `frontend/src/lib/api/tags.ts`'s `list` and `listAssignments` (2
sites, degrade to `[]`); `frontend/src/lib/api/mentions.ts`'s
`getResourceMentions` and `getEntityMentionedIn` (2 sites, already inside a
degrade-gracefully `try`/`catch`); `frontend/src/lib/api/entity-cooccurrence.ts`'s
one site; `frontend/src/lib/api/entity-mention-counts.ts`'s one site; and
`frontend/src/lib/api/resource-excerpts.ts`'s one site (the last three
already inside a degrade-gracefully `try`/`catch`, following the same
pattern `mentions.ts`'s module doc comment cites as precedent). Each site
keeps its own existing degrade contract exactly, per the Feature 48
precedent; a new schema is authored per shape where none of the four Tier 2
shapes already covers it (`ResourceContentResponse`, the revision-content
string wrapper, `{ removed?: boolean }`, `{ removedCount?: number }`, the
tag/assignment list shapes, the mention/co-occurrence/mention-count record
shapes, the excerpt shape — `EntityRelationshipEdge` already has a schema
from Feature 48's own `list`/`listOrThrow` validation and is reused as-is
for `create`'s return shape).
**Requirements covered:** None of its own — this derives from the parent
spec's Constraints section transport-boundary validation invariant, the
same basis the shipped transport response-body validation feature covers
no requirement on, not a functional requirement.
**User stories:** None
**Depends on:** Feature 48
**Branch suggestion:** feat/transport-validation-degrade-sites
**Notes:** Shipped. Merged to `main` on 2026-09-17 as merge commit
`2b3d63bd` ("Merge pull request #210 from
saboteur-works/feat/transport-validation-degrade-sites"), landing nine new
schemas plus an exported `ApiTagSchema` in `frontend/src/lib/api/schemas.ts`
and validation at the 12 sites across 7 modules named in the Vertical slice
above, each keeping its own pre-existing degrade-to-fallback contract
unchanged; `reportTransportValidationFailure` was also extended to raise a
generic, deduplicated user-visible toast via `toastService.error`, on top of
its existing console reporting. **This is the group the product owner chose to
carry forward this run (Gate 2, 2026-09-17).** Grouped by transport
mechanism (degrade-on-failure), not by content severity or by which module
Feature 48 previously touched — the owner rejected the severity framing
this document's earlier draft used, since it forced `encryption.ts` and
`patchRevisionContent` into awkward placements neither fit cleanly (see the
resolved Open Questions entries below). `resources.ts` and
`entity-relationships.ts` were named in Feature 48's own Vertical slice as
partially validated; their three bare sites apiece are folded in here by
mechanism rather than kept as a separate "finish the partial module" entry.
Verified against the tree (2026-09-17) at these line numbers:
`resources.ts:291` (`fetchContent`), `resources.ts:300`
(`fetchRevisionContent`), `entity-relationships.ts:180` (`create`),
`entity-relationships.ts:198` (`remove`), `entity-relationships.ts:216`
(`removeByEntity`), `tags.ts:60` and `tags.ts:71`, `mentions.ts:71` and
`mentions.ts:84`, `entity-cooccurrence.ts:72`, `entity-mention-counts.ts:65`,
and `resource-excerpts.ts:59` — 12 sites across 7 modules in total.
`patchRevisionContent`, `resources.ts`'s one reject-contract site, moves
with Feature 51 instead, since it does not share this group's
degrade-on-failure mechanism.

### Feature 51: Transport response-body validation — status-only reject, unchecked success cast — Shipped

**Value:** A writer compiling or exporting a manuscript, or saving a
revision's content, and receiving a malformed 200 response body gets that
failure surfaced through Feature 48's shared helper before it reaches the
Redux store or a downloaded file, instead of a silent bad cast into content
the writer might not notice is wrong until they open the exported file or
see a stale timestamp.
**Vertical slice:** Runtime validation, using the Feature 48 mechanism
verbatim, at the 5 sites across 3 modules that share one mechanism: they
reject (throw) on `!response.ok` using the status code alone, with no error
body read, and then cast the success body unchecked with no further guard.
`frontend/src/lib/api/resources.ts`'s `patchRevisionContent` (`:313`;
throws `Failed to persist revision (${response.status})` on `!response.ok`,
then casts `{ updatedAt?: string }` unchecked on success);
`frontend/src/lib/api/compile.ts`'s `text` and `markdown` (2 sites; `pdf`
and `docx` return raw `ArrayBuffer`s via `response.arrayBuffer()`, not
JSON, and are out of scope for this JSON-body mechanism); and
`frontend/src/lib/api/export.ts`'s `text` and `markdown` (2 sites, same
`ArrayBuffer`-methods-excluded caveat). A new schema is authored per shape
(`{ updatedAt?: string }` plus the compile/export result shapes); each
site's existing reject-and-cast contract is preserved, subject to the
`patchRevisionContent` contract question flagged below.
**Requirements covered:** None of its own — the same Constraints-section
basis the shipped transport response-body validation feature covers no
requirement on, not a functional requirement.
**User stories:** None
**Depends on:** Feature 48
**Branch suggestion:** feat/transport-validation-status-only-reject
**Notes:** Shipped. Merged to `main` on 2026-09-22 as merge commit
`cac7d861` ("Merge pull request #213 from
saboteur-works/feat/transport-validation-status-only-reject"). Verified
against the tree (2026-09-17): `compile.ts` and `export.ts`'s
JSON-returning methods throw via a shared
`postCompileRequest`/`postExportRequest` helper on `!response.ok` (status
code only, no body parse for the error message) and then cast the success
body unchecked; `resources.ts:313`'s `patchRevisionContent` follows the
identical status-only-reject, unchecked-success-cast mechanism, which is
why it is grouped here rather than with Feature 50's degrade sites or
Feature 52's separate-error-body reject site. **Flagged decision for this
feature's own gate — resolved by the shipped implementation:**
`patchRevisionContent` previously cast its success body as
`{ updatedAt?: string }` and substituted `new Date().toISOString()` when
the field was absent, which would have made schema validation a no-op at
this specific site under a literal reading of Feature 48's "each site
keeps its existing contract" rule — a malformed 200 body would have
silently produced a client-clock timestamp instead of being rejected. The
shipped implementation changed this site's contract instead of validating
around it unchanged: `patchRevisionContent` no longer fabricates a
timestamp via `data.updatedAt ?? new Date().toISOString()`. It now
validates the response, reports a validation failure through
`reportTransportValidationFailure`, and resolves `{ updatedAt: undefined }`
rather than throwing when the body is malformed, since the underlying save
has already succeeded server-side by the time the body is parsed. Its
single caller, `frontend/components/WorkArea/useCanonicalAutosave.ts`'s
`saveCanonicalRevisionNow`, already guards on the field's presence
(`result?.updatedAt`) before dispatching it into the Redux store as the
resource's `updatedAt`, so an `undefined` result is skipped rather than
substituted with a client-clock value — the resource tree and Timeline
simply keep their prior timestamp until the next successful save, with the
content itself safely saved regardless.

### Feature 52: Transport response-body validation — separate error-body parse (encryption.ts) — Shipped

**Value:** A writer reading the workspace's encryption lock state and
receiving a malformed response body — on either the error or the success
path — gets that failure surfaced through Feature 48's shared helper,
instead of a silent bad cast into security-relevant state.
**Vertical slice:** Runtime validation, using the Feature 48 mechanism
verbatim, at the 1 site in 1 module that is the only one in this remainder
to parse two separate response bodies for the two outcomes rather than one
shared parse: `frontend/src/lib/api/encryption.ts`'s `request()` helper
(`:49`, backing every encryption status read) checks `!response.ok` and
throws from a separately-parsed error body (`response.json().catch(() => ({}))`
cast to `{ error?: string }`), then, on the success path, parses and casts
the success body afresh in a second, unrelated `response.json()` call cast
to `EncryptionStatus`. A schema is authored for each of the two body
shapes; the existing reject-and-cast contract is preserved.
**Requirements covered:** None of its own — the same Constraints-section
basis the shipped transport response-body validation feature covers no
requirement on, not a functional requirement.
**User stories:** None
**Depends on:** Feature 48
**Branch suggestion:** feat/transport-validation-separate-error-body
**Notes:** Shipped. Implemented together with Feature 53 in one combined
pass via `specs/features/transport-validation-remaining-sites.md` and its
`tasks.md`, merged to `main` on 2026-09-29 as merge commit `6f7ac3f5`
("Merge pull request #248 from
saboteur-works/feat/transport-validation-remaining-sites"). Landed a new
`EncryptionStatusSchema` (authored from scratch — no existing runtime schema
for `EncryptionStatus` existed to reuse) plus an error-body schema in
`frontend/src/lib/api/schemas.ts`, validating both of `encryption.ts`'s
`request()` helper's two independently-parsed bodies — the error-path parse
and the success-path parse — each reporting through
`reportTransportValidationFailure` on a validation failure while preserving
the helper's existing throw-with-fallback-message (error path) and
reject-on-malformed-body (success path) contracts unchanged;
`exportPlaintextCopyRequest`'s own `as`-cast return type stayed out of
scope, per the spec's FR-2. Verified against the tree at spec-write time
(2026-09-17): `encryption.ts:49` was the only site in this 21-site
remainder with two independent `response.json()` calls, one per outcome,
rather than one parse consulted for both — distinct from Feature 51's
status-only-reject sites (no error body read at all) and from Feature 53's
dual-purpose-body sites (one parse serving both outcomes). Given its own
entry on mechanism grounds, per the owner's Gate 2 decision to regroup by
transport mechanism rather than by severity — this document's earlier draft
had instead placed `encryption.ts` with `compile.ts`/`export.ts` on a
substantial-content/security-relevant severity judgment, which the owner's
decision replaces.

### Feature 53: Transport response-body validation — one body serving both error and success (editor-config.ts, preferences.ts) — Shipped

**Value:** A writer whose editor-heading/body settings save, or whose
default-revision-name preference save, gets a response the UI cannot parse
sees the same explicit failure surfacing Feature 48 already gives every
other validated write, instead of these three call sites' unusual shape —
the same parsed body doubling as both the error message source and the
success return value — being skipped over because no existing tier
assigned it a home.
**Vertical slice:** Runtime validation, using the Feature 48 mechanism
verbatim, at the 3 sites across 2 modules that share one shape not seen
elsewhere in this remainder: the response body is parsed once
(`.catch(() => null)`), then consulted twice — for `body?.error` if
`!response.ok`, and cast as the success payload otherwise.
`frontend/src/lib/api/editor-config.ts`'s `saveHeadings` (`:59`) and
`saveBody` (`:74`) (both parse to `EditorConfigResponse | null` and throw
`body?.error ?? "<fallback message>"` on failure); and
`frontend/src/lib/api/preferences.ts`'s `saveRevisionSettings` (`:63`,
parses to `{ defaultRevisionName?: string; error?: string } | null`, same
throw-with-body-message-on-failure shape). A schema for each response shape
must validate leniently enough that a legitimate error body (which lacks
the success fields) does not itself get flagged as a validation failure —
this is the specific design question that made these three sites a poor
fit for Feature 48's existing tiers, and the feature spec for this entry
must settle it explicitly rather than reusing a success-only schema
verbatim.
**Requirements covered:** None of its own — the same Constraints-section
basis the shipped transport response-body validation feature covers no
requirement on, not a functional requirement.
**User stories:** None
**Depends on:** Feature 48
**Branch suggestion:** feat/transport-validation-dual-purpose-bodies
**Notes:** Shipped. Implemented together with Feature 52 in one combined
pass via `specs/features/transport-validation-remaining-sites.md` and its
`tasks.md`, merged to `main` on 2026-09-29 as merge commit `6f7ac3f5`
("Merge pull request #248 from
saboteur-works/feat/transport-validation-remaining-sites"). The feature
spec's own design question (below) was resolved as one fully-optional
lenient schema per shape, not a discriminated union: `editor-config.ts`'s
`saveHeadings`/`saveBody` share one new schema
(`z.object({ editorConfig: ApiEditorConfigSchema.optional(), error:
z.string().optional() })`, reusing the existing `ApiEditorConfigSchema`),
and `preferences.ts`'s `saveRevisionSettings` gets its own analogous
schema (`z.object({ defaultRevisionName: z.string().optional(), error:
z.string().optional() })`) — both added to
`frontend/src/lib/api/schemas.ts` and validated at each site, reporting
through `reportTransportValidationFailure` on failure while preserving
each site's existing throw-`body?.error`-or-fallback contract unchanged.
A follow-up commit on the same branch
(`ecf02445`, "fix(encryption): preserve unvalidated fields on request()'s
success path") corrected a regression the lenient schema introduced at
Feature 52's `encryption.ts` site, and `a9ea0bd9` reconciled this
document's coverage claims for both features against the shipped result.
`editor-config.ts` is the module OQ-33 flags as
"never assigned to any tier"; verified against the tree (2026-09-17) that
its two sites do share the dual-purpose error/success body pattern the
parent spec describes. That same verification found `preferences.ts`'s one
remaining site (`saveRevisionSettings`) uses the identical pattern — a fact
not called out in OQ-33 itself — so this entry groups the two modules
together by shape rather than treating `editor-config.ts` as sole owner of
that problem. `preferences.ts`'s other method, `savePreferences`, is
fire-and-forget (no response body read at all) and contributes none of
this module's one counted site. **Open design question this feature's
spec settled at implementation time:** all three bodies here were already
typed all-optional today (`EditorConfigResponse | null` and the
preferences inline type both make every field optional), so a
fully-optional lenient schema validates very little beyond confirming the
body parsed as an object — it mostly adds the reporting seam rather than
catching a malformed field. A discriminated union would have validated
more, but first
requires deciding what distinguishes an error body from a success body at
each site — a candidate discriminant is presence of `error` vs. presence of
`editorConfig` (or the module's analogous success field) /
`defaultRevisionName`. This document does not resolve it, per this
document's own instructions not to resolve open questions raised by a
breakdown.

### Feature 54: Fail-closed locked-access gate — Shipped

**Value:** A writer whose workspace keyring is locked or absent never has a
sealed project's real content silently swapped for ciphertext — an app crash
they can retry after unlocking, or plaintext written into their encrypted
project destroying the ciphertext it replaced — because every read and write
that would otherwise reach a sealed project's files while locked now fails
with a typed, catchable signal instead.
**Vertical slice:** A single change point covering both directions at once,
since one function serves both: `adapterFor`
(`frontend/src/lib/models/crypto/workspace-adapter.ts:84`) currently returns
the plain, non-decrypting `inner` adapter unconditionally whenever
`!keyring || keyring.isLocked()`, and every mutating wrapper
(`mutatingAdapter`, `io.ts:227-229`) and every read wrapper (`currentAdapter`,
same file) resolves through this one function for any path that names an
actual project. Making that branch throw `ProjectLockedError` /
`MissingProjectKeyError` (`frontend/src/lib/models/crypto/adapter-selection.ts:50-74`
— already defined and already used correctly one module over in
`adapter-selection.ts:107`, per this document's parent spec's resolved
OQ-36) for a path that resolves to a real project id, while preserving the
`!projectId` branch immediately after it
(`workspace-adapter.ts:86-87`) returning `inner` unconditionally so
workspace-level files (the keyring, the sealed name index) stay reachable
locked, closes the gap at its root for every HTTP route
`with-storage-context.ts` wraps. The API route layer catches the new error
and returns a clean 4xx in place of today's opaque JSON-parse 500 (OQ-36's
resolution, part (b)).

Measured 2026-09-17 (a static call-graph trace, not yet exercised) that the
gate alone does not collapse the read side the way this feature previously
assumed. Only four of the routed adapter's methods — `readFile`,
`readFileBuffer`, `writeFile`, `appendFile`
(`workspace-adapter.ts:141-156`) — resolve through `adapterFor` at all;
`readdir`, `stat`, `mkdir`, `rm`, `rename`, `copyFile`, and `cp` call `inner`
directly (`workspace-adapter.ts:160-172`), per an in-code comment there
stating path and directory semantics never differ between projects. A
`readdir`-first traversal therefore proceeds normally locked and only trips
the gate on a per-file read — and every one of the fifteen read sites this
feature traced catches with an **untyped** `catch`, so each one swallows the
new `ProjectLockedError` exactly as it swallows today's `SyntaxError` from
parsing ciphertext (verified example: `inverted-index.ts:72-74`,
`} catch { return {}; }`). Breakdown of the fifteen traced sites:

- **4 sites surface the error** (their catch either doesn't cover the read,
  or rethrows non-ENOENT already): `resource-persistence.ts:240` (word
  counts), the query path (throws earlier at `readSidecar`,
  `query-evaluate-core.ts:161`, rethrowing non-ENOENT per `sidecar.ts:71-79`),
  `project-loader.ts:76`, and the sidecar **write**
  (`resource-crud-core.ts:409-430` → `sidecar.ts:167` →
  `io.ts`'s `atomicWriteFile`).
- **10 sites throw but are swallowed**, becoming silent missing data instead
  of silent wrong data: `loadResourceContent`
  (`frontend/src/lib/tiptap-utils.ts:55-61`), `loadIndex`
  (`inverted-index.ts:72-74`), `loadBacklinks` (`backlinks.ts:262-264`),
  `loadMentionIndex` (`mention-index.ts:42-44`), `loadPreview`
  (`previews.ts:55-57`), `loadRedirects` (`backlinks.ts:109-111`), `search`
  (via `loadIndex`), `listTrashedItems` (`trash.ts:1487-1490`,
  `:1521-1524`), `collectFolderDescriptors` (`trash.ts:410-412`), and
  `findProjectRootByInternalId` / `findProjectRoot`
  (`project-crud-core.ts:539-545`, `execute-search.ts:81-84`). Also the
  swallowed read halves of `resource-crud-core.ts:409` and
  `sidecar.ts:156-160`, and `rescanEntityAcrossProject`, whose write is
  blocked but only logged (`indexer-queue.ts:371-373`).
- **The write half of the original claim holds:** all three confirmed
  destructive plaintext writes are genuinely blocked and surfaced —
  `io.ts:212-216` documents that the mutating wrappers are `async` so a
  refused write surfaces as a rejection rather than escaping a caller's
  `.catch()`.

Ciphertext-as-prose is visibly broken; an empty trash view, zero search
results, and "project not found" all look like ordinary, legitimate states.
Shipping the gate without also fixing the ten swallowed catch sites converts
the failure class from loud-and-wrong to silent-and-missing — worse for a
locked-but-otherwise-healthy read, not better. This feature's vertical slice
is therefore the gate **plus** typed re-raises at all ten swallowed catch
sites (each must distinguish `ProjectLockedError`/`MissingProjectKeyError`
from an ordinary ENOENT/parse failure and rethrow it rather than degrading
to `{}`/`null`/`[]`), not the gate alone as a first cut with the catch sites
deferred — the gate alone is necessary but insufficient, since alone it only
converts which failure class a locked read produces rather than fixing it.
This feature's own task list must enumerate the full read-site list from the
parent spec's locked-access constraint and add a regression test per site,
since the prior OQ-36 resolution's own confidence limit notes that only
`loadProjectCore` was measured broken by direct exercise and the rest
(resource, revision, compile, export, search) were traced, not run. This
feature must also guard the over-blocking risk the parent spec names: a
project with no marker and no in-flight conversion must take the identity
`!projectId`-independent early return in `adapter-selection.ts` (`return
baseAdapter` before any keyring check) and never be affected by this
change, so an unencrypted project never sees a spurious lock error.

Two inferences from this measurement remain unexercised and must be settled
before or during implementation, not assumed:

- Whether `AsyncLocalStorage` propagates the request's routed adapter into
  the `setImmediate` callback at `sidecar.ts:178`, which is where
  `enqueueEntityRescan` captures its adapter (`indexer-queue.ts:364`). If it
  does not, that site falls outside the gate entirely and its plaintext
  write continues unchecked. Settle by tracing (or, better, exercising) an
  `AsyncLocalStorage`-bound context across a `setImmediate` boundary in this
  codebase's Node version and confirming whether `getStorageContext()` still
  resolves to the request's adapter inside the callback.
- Whether any API route's own top-level catch would re-swallow a propagated
  `ProjectLockedError` into an opaque 500 — unverified because the
  route-level 4xx mapping this feature adds is not yet implemented. Settle
  by implementing the mapping and exercising a locked-project request
  through each route family.

Implementation constraint to carry into the task list, not a design decision
made here: the routed `writeFile` (`workspace-adapter.ts:143`) is a
non-async arrow, so implementing the gate as a rejected promise rather than
a synchronous throw avoids a sync throw escaping a future caller's
`.catch()`.
**Requirements covered:** None of its own — this closes a gap in the parent
spec's Constraints section locked-access invariant ("must fail closed... in
both directions"), not a functional requirement with its own FR number.
**User stories:** None
**Depends on:** Feature 23
**Branch suggestion:** feat/locked-access-fail-closed-gate
**Notes:** Shipped. Merged to `main` on 2026-09-22 as merge commit
`8bf48d3d` ("Merge pull request #211 from
saboteur-works/feat/locked-access-fail-closed"). `frontend/src/lib/models/locked-access.ts`
(`isLockedAccessError`) landed as the shared predicate; `adapterFor` in
`crypto/workspace-adapter.ts` is now marker-first and fails closed;
`with-storage-context.ts` maps a locked-access failure to a 401/409; and the
ten swallowing catch sites this entry's measurement named now rethrow, across
22 routes. Verification on the same branch found and fixed a
device-independent scan-local regression in project lookups before merge
(commit `2d1c5bdf`, "make the locked-access check scan-local in project
lookups"); the device-verification pass run against the build at this
entry's own merge commit (`8bf48d3d`, per Feature 49's Notes) also surfaced
the Trash restore bug fixed separately by commit `0566ae35` ("fix(trash):
refresh the resource tree after a restore", `task_33a403cb`) — see that
commit and task for detail rather than duplicating it here. This is the
single largest lever in this breakdown:
because reads and writes share the same `adapterFor` resolution, there is no
architecturally meaningful way to split "fix locked reads" from "fix locked
writes" into two separate features — one change point serves both. Sized
against the alternative in Feature 55 (an interim, narrower patch): this
feature changes behavior for every route through `with-storage-context.ts`
simultaneously, which is more surface to review and stage than Feature 55's
handful of named sites, but stops the destructive-write class and the
ciphertext-read class in one merge rather than requiring a second entry to
close the read side. **Reduces live data-loss risk: yes** — directly, for
every one of the three confirmed destructive-write sites reachable via the
encrypting-adapter path, plus the two near-misses.

All fifteen read/write sites traced above are unreached on two whole
transports, so neither is fixed by this feature: native binds
`capacitorFsAdapter` via `setDefaultStorageContext`
(`frontend/src/lib/models/native-bootstrap.ts:74-77`), and the CLI resolves
to the module `fs/promises` adapter through `runForTenant`'s default
(`io.ts:334-336`) — neither path ever reaches `workspace-adapter.ts`'s
`adapterFor`. See the feature covering native locked-write exposure and the
feature covering CLI lock enforcement, later in this document.

### Feature 55: Interim guard on the confirmed destructive-write sites — Superseded, closed (no code change)

**Value:** A writer editing a sidecar field, saving after an entity is
renamed, or having their project reindexed does not have that write silently
replace their sealed project's ciphertext with plaintext while the broader
gate in Feature 54 is still being designed, reviewed, or staged — this
ships a narrow, fast stop on the confirmed live bleed without waiting on a
change that touches every route at once.
**Vertical slice:** A local lock check added at each of the three confirmed
destructive-write call sites individually, rather than one shared
resolution-layer change: `updateSidecarCore`
(`frontend/src/lib/models/resource-crud-core.ts:409-430`, whose
`readSidecar(...).catch(() => null)` at line 409 swallows the ciphertext
parse failure and merges the update onto `{}`, discarding every existing
sidecar field); `writeSidecar` (`frontend/src/lib/models/sidecar.ts`, which
commits the write before the parse failure that should have stopped it is
even raised); and `rescanEntityAcrossProject`
(`frontend/src/lib/models/indexer-queue.ts:310-341`, which persists `{}`
over the mention index when reading the sealed index throws). Each site
gets an explicit, project-scoped lock check ahead of its write — reusing
`adapter-selection.ts`'s existing `ProjectLockedError`/
`MissingProjectKeyError` convention rather than inventing a fourth — so the
call throws before touching disk instead of writing over ciphertext. The
two near-miss sites this document's survey names (`runTask`,
`indexer-queue.ts:175-237`, and `createRevision`, `revision-core.ts:219-249`)
are held back only by incidental ordering today; this feature's task list
must decide whether to guard them too as defence in depth, given they are
one refactor away from becoming live.
**Requirements covered:** None of its own — the same Constraints-section
locked-access invariant the sibling fail-closed gate entry above covers,
addressed here as a narrower interim measure rather than the root cause.
**User stories:** None
**Depends on:** Feature 23
**Branch suggestion:** feat/locked-write-interim-guard
**Notes:** Superseded, closed. This entry and Feature 54 were sized as
alternatives for the same choice, not a sequenced pair (see below); the owner
picked Feature 54, which shipped 2026-09-22 as merge commit `8bf48d3d` and
covers this entry's destructive-write sites as part of its single
resolution-layer fix. This entry is therefore superseded by its sibling, not
completed — no code from this entry was built, unlike Feature 57, which
closed as a completed measurement. Retained for the record rather than
deleted, per this document's convention for a feature that will no longer be
built. Shipping this first buys the
destructive-write stop sooner and with less surface to review, at the cost
of three (or five, if the near-misses are included) separately-maintained
checks that Feature 54's single resolution-layer fix would make redundant
once it lands — a real duplication-then-supersession cost the owner should
weigh against the smaller, faster win. This entry does nothing for the
silent-ciphertext-as-data read sites; only Feature 54 addresses those.
**Reduces live data-loss risk: no longer applicable** — superseded before
any of it was built; see Feature 54 for the risk this gap now closes
against.

### Feature 56: Lock enforcement for CLI writes against an encrypted project — Shipped

**Value:** A writer who runs `getwrite-cli reindex` (or any other CLI write
command) against a project they have encrypted does not get a plaintext
inverted index written over the sealed one, the way `doctor` already
protects its own read path today.
**Vertical slice:** Neither Feature 54 nor Feature 55 reaches this gap: the
CLI binds no encrypting adapter at all — encryption appears in `cli/src`
only in `doctor.ts`'s own independent `isProjectEncrypted` check
(`cli/src/commands/doctor.ts:52-68`), confirmed by re-reading
`cli/src/commands/reindex.ts` (150 lines) end to end and finding no
encryption or keyring reference anywhere in it. This feature adds the same
`isProjectEncrypted` pre-check `doctor` already uses to `reindex` and any
other CLI command found to write into a project directory, refusing before
any write with an explanatory exit rather than writing plaintext over
ciphertext — mirroring `doctor`'s existing pattern rather than routing
through `adapterFor`/`mutatingAdapter`, since the CLI process has no keyring
session to unlock against in the first place (a CLI command cannot decrypt
even if it wanted to, so "refuse encrypted projects outright" is the only
correct behavior here, not "gate on lock state").
**Requirements covered:** None of its own — the same Constraints-section
locked-access invariant, addressed here for the CLI transport specifically
per the parent spec's open question on locked-write scope.
**User stories:** None
**Depends on:** Feature 23
**Branch suggestion:** feat/cli-encrypted-project-write-guard
**Notes:** Shipped. Merged to `main` on 2026-09-22 as merge commit
`32c0a08a` ("Merge pull request #212 from
saboteur-works/fix/cli-encrypted-project-guard"). `cli/src/lib/encryption-guard.ts`
(`guardAgainstEncryptedProject`) landed as the shared check; `doctor`,
`reindex`, `prune`, and `templates`' `save`/`create`/`duplicate` commands all
call it and exit with code 3 against an encrypted project. `templates list`
was deliberately left unguarded — it is a read path that already degrades,
so the command is guarded non-uniformly by choice, not by omission.
Independent of Feature 54 and Feature 55: neither
touches the CLI, since both act inside the encrypting-adapter layer the CLI
never binds. **Reduces live data-loss risk: yes** — directly, for the CLI
write paths this feature covered.

### Feature 57: Native locked-write exposure — measurement — Measured, closed (no code change)

**Value:** Before any fix is designed for a native (Capacitor/Android)
locked-write gap, this establishes whether one exists at all — the parent
spec's OQ-37 leaves this open, and no code fix should be sized against an
unmeasured exposure.
**Vertical slice:** A measurement-only pass, producing no behavior change:
(1) determine whether encryption can actually be _enabled_ on native today,
given `native-bootstrap.ts:77` binds the raw `capacitorFsAdapter` with no
encryption-wrapping decorator anywhere in its startup path, and no native
transport backend was found to import anything under `crypto/`, while
`encryption-availability.ts:8`'s own comment documents encryption as a
"desktop and native-Android feature (FR23)" and `isEncryptionAvailable()`
returns `true` on native regardless — these two facts are in tension and
neither settles the question on its own, since the keyring is documented
elsewhere as server-side; (2) if native has no live path to an encrypted
project at all today, this is a documentation/`isEncryptionAvailable()`
correctness question, not a locked-write data-loss risk, and should be
reported back as such; (3) if a live path is found, trace whether native's
write path resolves through the same `adapterFor`/`mutatingAdapter`
machinery Feature 54 fixes, or through an entirely separate route with its
own exposure requiring its own fix. Output is a written finding (where in
this document or the parent spec it should be recorded is left to whoever
picks this up), not a merged code change.
**Requirements covered:** None of its own — this is a measurement task
scoped by the parent spec's open question on locked-write scope, not a
functional requirement.
**User stories:** None
**Depends on:** Feature 23
**Branch suggestion:** n/a — measurement only, no feature branch expected
**Notes:** Measured 2026-09-22 (static call-graph trace on `main`, HEAD
`8bf48d3d`), and closed — see the parent spec's now-resolved OQ-37 native
half (`getwrite.md`) for the full six-point trace and evidence. Verdict:
encryption is unreachable on native today (no enable path, no native
transport backend, no unlock path, no ingest route), so the locked-write
gap is theoretical there, not exercised. Also established: native is not
wholly unprotected regardless, by an unrelated mechanism (the project
marker is read before `project.json` in shared core), and that native's
current safety is best read as an accident of two independent gaps — a
missing runtime gate on `ProjectEncryptionPanel` and a missing
`.rejected` case in `cryptoSlice.ts` — rather than a designed protection;
Task 21 (wiring `lib/api/encryption.ts` through `createTransport`) would
make the gap live unless it also wraps native's default storage context in
the same change. One item was explicitly left unestablished: whether
native's indexer/backlinks-watcher walk into a marker-bearing project
directory without their own marker check — flagged as worth settling
before Task 21, not before this feature closes. **Reduces live data-loss
risk: not directly** — no code changes here — but the measurement itself
is the outcome; no follow-on fix is currently indicated since the gap this
feature was scoped to check for was not found live. **Status is unusual
for this document:** this entry closes as neither "Shipped" (nothing was
built or merged) nor "Not started" (the work is done) — it is retired as a
completed measurement, its finding now carried by OQ-37's resolution
rather than by any pending implementation task.

### Feature 58: Protect revision — Shipped

**Value:** A writer on deadline can mark a revision they never want lost as
protected, and can undo that, so automatic pruning never deletes it — instead
of the documented but unreachable "preserve" behaviour that no UI sets today.
**Vertical slice:** A model function that merges metadata for one existing
revision (setting and clearing the protected flag); an HTTP route path and a
native transport method for it, collapsed through `createTransport` per
ADR-021 parity (the existing `PATCH /api/resource/revision/[resource-id]`
accepts only `{projectId, revisionId, content?}` and ignores `metadata`); the
revisions slice, plus a protect/unprotect toggle and a protected indicator in
`RevisionControl.tsx` (which has no such control today); a change to pruning
behaviour in `selectPruneCandidates`
(`frontend/src/lib/models/revision.ts:56-80`), which currently counts every
revision toward the per-resource max-revisions cap, so that protected
revisions are excluded from that count while the canonical revision still
counts toward it; tests; and corrections to `docs/user/revisions.md` and
`docs/features/revisions.md`, which today describe a control no UI provides.
**Requirements covered:** FR-45
**User stories:** US-9
**Depends on:** Feature 4
**Branch suggestion:** feat/protect-revision
**Notes:** Not started. Decided in the parent spec (FR-45), not reopened
here: the automatic pre-deletion snapshot is not protected by default
(OQ-38); protected revisions are excluded from the per-resource
max-revisions count (OQ-39); the canonical revision still counts toward the
cap (OQ-40). Documented downside: total revision storage per resource is
unbounded, since protected revisions never count against the cap and are
never pruned. Its feature spec is `specs/features/protect-revision.md`.

### Feature 59: Daily writing log and daily goal — Shipped

**Value:** A writer on deadline can see, per project per day, how many words they added, deleted and netted, and compare today's figures against a daily goal they set, so progress is measured in writing done rather than total length.
**Vertical slice:** A new append-only daily-log store validated in `schemas.ts` (fields include a `source` marking import entries), persisted through the storage adapter and failing closed when locked; a save-path hook at the debounced canonical save that computes additions, deletions and net by before/after comparison, with its own read of the previous content (`snapshotBeforeDestructiveWrite` cannot distinguish unreadable from non-destructive) and a visible failure signal, per `docs/standards/failure-visibility.md`, when the previous content is unreadable; one additions entry per docx or Scrivener import on the import day under the new project's id; a daily-goal setting and a today-versus-goal display, not indicated in red; a transport for reading the log and setting the goal, resolved through `createTransport` with a native backend, a web-stub and HTTP response-body validation (the FR-50 constraint for this feature's transport); tests.
**Requirements covered:** FR-48, FR-50
**User stories:** US-21
**Depends on:** Feature 4, Feature 31, Feature 45
**Branch suggestion:** feat/daily-writing-log
**Notes:** Ships first of the FR-46 to FR-49 slices (OQ-42, resolved). History before the log ships cannot be backfilled. The log stays local (Observability constraint) and is handled per the encrypted-project constraint. Decided in the parent spec, not reopened: OQ-43, OQ-46, OQ-47, OQ-48, OQ-49. Plain-text file import stays deferred and is not part of this feature. FR-50 is owned by this feature (Gate 2, 2026-09-26): it adds the first transport of Features 59-62. The daily goal is a new optional `dailyWordGoal` in project config; flag the `schemas.ts` change in tasks so it does not collide with Feature 61. Imports show as a separate line and only non-import words are compared to the goal. Scope addition at Gate 3 (2026-09-26): the footer display must be expandable, beyond this feature's original list. Amended at Gate 6 by the user (2026-09-26), superseding that part: the footer keeps its "Today's writing" button and collapsed figure but no longer expands inline; the button opens a closeable writing-details overlay, intended as the later home for Feature 60 and 62 diagnostics (not built here). OQ-15 to OQ-19 were resolved at Gate 6 by the user ("Take your recs"), 2026-09-26: a blocking, read-only modal on `UI/Dialog` titled "Today's writing", goal set only in Project Settings, collapsed figure kept inline in the footer. Details are in `specs/features/daily-writing-log.md`.

### Feature 60: Project status roll-up — Shipped

**Value:** A writer on deadline can see, for a project, how many resources and how many words sit at each status, so they can tell how much of the project is at each stage of completion.
**Vertical slice:** A read-only derivation from existing data (word count and status, which status representation is counted is left to the feature spec; see FR-46's 2026-09-26 correction) persisting nothing new; derived client-side from already-loaded Redux state, with no transport, route, native backend, web-stub or response schema added (OQ-8); a roll-up view or section showing resource count and words per status together, likely in the Data view; tests.
**Requirements covered:** FR-46
**User stories:** US-19
**Depends on:** Feature 7, Feature 11
**Branch suggestion:** feat/status-rollup
**Notes:** Follows the FR-48 pass (OQ-42). Decided in the parent spec: both resource count and words per status (OQ-41). Sidecar `wordCount` is skipped for legacy plain-text revisions, so those resources may under-report; the feature spec should decide how that is shown. Corrected 2026-09-26 (re-measured by the lead on main at 35c9af9c; earlier text measured at 24ade246, before Feature 59): there are two status representations (`userMetadata.status`, a single string; `resource.statuses`, an array with no UI writer found, unconfirmed) and the feature spec must decide which is counted. Also for the feature spec: resources with no status, and status values absent from `config.statuses`. Independent of Feature 59. FR-50 (owned by Feature 59) applies only if a transport is later added: the feature spec resolved at Gate 3 (2026-09-26, OQ-8) that the roll-up is derived client-side from already-loaded state, so this feature adds no transport.

### Feature 61: In-app word-count goals (project and resource) — Shipped

**Value:** A writer on deadline can set, change and clear a project word-count goal and an optional per-resource goal from inside the app, instead of editing `project.json` by hand, and track progress against them.
**Vertical slice:** A new optional per-resource goal field on the sidecar validated in `schemas.ts`; write paths for the existing project `wordCountGoal` (`ProjectConfig`) and the new resource goal; a transport for both resolved through `createTransport` with a native backend, a web-stub and HTTP response-body validation (FR-50 constraint for this feature's transport); a goals control and progress display where the existing `WordCountProgressBar` and Data view already render project progress, not indicated in red; tests.
**Requirements covered:** FR-47
**User stories:** US-20
**Depends on:** Feature 7, Feature 11
**Branch suggestion:** feat/word-count-goals
**Notes:** Follows the FR-48 pass (OQ-42). The project `wordCountGoal` already exists and is read today; only the write path and control are new. This is a total-length goal, distinct from Feature 59's daily goal. Must follow FR-50 (owned by Feature 59) for its own transport.

### Feature 62: Prose diagnostics — Shipped

**Value:** A writer on deadline can see cheap prose observations for each resource (dialogue ratio, average sentence length, top repeated words) and request located detail such as repeated phrases with positions, with no AI or network dependency.
**Vertical slice:** Scalar metrics computed by the existing indexer and persisted in a diagnostics index validated in `schemas.ts`, carrying a `heuristicVersion` and rebuilt lazily on mismatch, persisted through the storage adapter and failing closed when locked via `isLockedAccessError` per the mention-index precedent; on-demand located detail computed and not persisted; a transport resolved through `createTransport` with a native backend, a web-stub and HTTP response-body validation (FR-50 constraint for this feature's transport); a presentation of flags as observations, not errors, and not in red; tests.
**Requirements covered:** FR-49
**User stories:** US-22
**Depends on:** Feature 9
**Branch suggestion:** feat/prose-diagnostics
**Notes:** Follows the FR-48 pass (OQ-42). The benchmark this requirement needs is now Feature 63, not this feature's own first task — this feature depends on Feature 63's closed finding before its design (specifically the "computed by the existing indexer" claim in its own Vertical Slice, above) can be committed; not recorded in the structured "Depends on" field above because the dependency graph requires a dependency's id to precede the dependent's, and Feature 63 is numbered and sequenced after this feature. Decided in the parent spec: OQ-44, OQ-45, OQ-46. Must follow FR-50 (owned by Feature 59) for its own transport.

### Feature 63: Prose diagnostics — cost benchmark (measurement) — Measured, closed (no code change)

**Value:** Settle, before Feature 62's design is committed, the compute cost of each of the three scalar metrics its parent requirement names (dialogue ratio, average sentence length, top repeated words) at 1k, 10k and 100k words of realistic prose, so the "computed by the existing indexer at save time" design in Feature 62's own Vertical Slice is not sized against an unmeasured cost.
**Vertical slice:** A measurement-only pass, producing no behavior change and no merged feature branch — a benchmark script/test measuring each metric's wall-clock cost at the three sizes, on realistic prose (not synthetic repeated text, which would not represent adverb/dialogue/sentence-boundary detection cost realistically); output is a written finding (numbers plus a recommendation: safe to compute synchronously in the indexer at save time, or needs to move async/background) recorded back onto Feature 62's own requirement, not a product code change.
**Requirements covered:** None of its own — this is a measurement task scoped by the parent spec's own requirement that this measurement occur, not a functional requirement itself.
**User stories:** None
**Depends on:** Feature 9
**Branch suggestion:** n/a — measurement only, no feature branch expected
**Notes:** Measured (integrated benchmark run on this branch, `pnpm
--filter getwrite-frontend exec vitest run proseDiagnosticsBenchmark`,
median of 7 runs, elapsed ms), and closed. These are throwaway-stand-in-
implementation costs (see `proseDiagnosticsBenchmark.test.ts`'s own
docblock), not Feature 62's eventual real implementation's cost — the
numbers below are not a guarantee about Feature 62's real algorithms.
Per-metric individual cost: dialogueRatio — 1k words = 0.004 ms, 10k words
= 0.034 ms, 100k words = 0.232 ms; averageSentenceLength — 1k words =
0.044 ms, 10k words = 0.445 ms, 100k words = 3.741 ms; topRepeatedWords —
1k words = 0.110 ms, 10k words = 0.929 ms, 100k words = 8.025 ms.
Combined cost (all three run back-to-back, measured directly, not
summed): 1k words = 0.128 ms, 10k words = 1.256 ms, 100k words = 12.892
ms. Across 1k→10k→100k (each a 10x word-count increase), every metric's
cost also scaled roughly 10x — no super-linear ("worse than linear")
growth was observed at 100k for any metric, including dialogue-ratio and
sentence-split. Recommendation, stated conditionally per OQ-4's
resolution: if Feature 62 keeps the three metrics computed together in
one indexer task, the combined-cost number at each size is what matters
for the sync-vs-async call; if a later design splits them, each metric's
own individual cost becomes the relevant number instead. No pass/fail
millisecond threshold is asserted here (FR-6) — that judgment is left to
Feature 62's design owner. **Reduces indexer-timing-cost risk: yes, at
the sizes measured** — no code changes here, but the measurement itself
is the outcome: it clears the concern that the "computed by the existing
indexer at save time" design in Feature 62's Vertical Slice would be
sized against an unmeasured cost, since even the worst-measured combined
cost (12.892 ms at 100k words) is small relative to typical background-
queue work. This does not extend to Feature 62's eventual real
algorithms, only to these throwaway stand-ins. **Status is unusual for
this document:** this entry closes as neither "Shipped" (nothing was
built or merged) nor "Not started" (the work is done) — it is retired as
a completed measurement, its finding now carried by FR-49's own text.
Feature 62 may now proceed to full design using this finding.

### Feature 64: Plain-text file import — Shipped

**Value:** A writer with plain-text (`.txt`) source material can bring it into GetWrite the same way they already can with Word documents and Scrivener projects, instead of hand-copying content in through the editor.
**Vertical slice:** A new plain-text import path, since none exists today — `frontend/app/api/resource/upload/route.ts` and `frontend/src/lib/models/media-validation.ts` currently accept only image and audio, nothing text-shaped; conversion of plain-text source content into GetWrite's resource/TipTap representation; imported content logged to the daily writing log (Feature 59) as one additions entry tagged with a `source` field on the import day, mirroring exactly how the existing DOCX and Scrivener importers already log one additions entry per import under the new project's id; tests.
**Requirements covered:** None of its own — already claimed elsewhere, by the daily writing log feature this feature's import entries would log into (see Notes).
**User stories:** None of its own — same reason (see Notes).
**Depends on:** Feature 59, Feature 31, Feature 45
**Branch suggestion:** feat/plain-text-import
**Notes:** Named in the parent product spec's "Out of Scope (Deferred)" section and in the resolution of that spec's open question on this topic (its FR-48 and US-21 name this feature): plain-text file import does not exist today, and it is a later addition to the import file types — those requirement/story numbers no longer imply an existing plain-text path, they name this feature's eventual scope, and stay recorded as owned by Feature 59 above (the daily writing log) in this document's own "Requirements covered"/"User stories" fields rather than claimed again here, to satisfy this document's one-owner-per-requirement rule. Unresolved, left for the feature spec's own Open Questions (not decided here): whether this feature imports into a brand-new project only, mirroring the DOCX and Scrivener importers' precedent architecture, or can also add content into an already-existing project's resource tree — raised by POS note `note_c73e8b26`.

### Feature 65: Organizer view — card type icons and click-to-open — Shipped

**Value:** A plain-file writer recognizes a card's resource kind (Text,
Audio, Image, or Folder) at a glance instead of reading its "<type> file"
text line, and opens a resource faster by clicking its name rather than
locating the separate "Open" button — staying in Organizer view after the
click rather than being switched to Edit view.
**Vertical slice:** A type-icon element on `OrganizerCard` selecting one of
four icons (Text/Audio/Image/Folder) from the rendered resource's `type`
field; a click handler on the card's title/name that dispatches the
existing resource-selection action without changing the active work-area
view, alongside the card's existing "Open" button (unchanged).
**Requirements covered:** None of its own.
**User stories:** None.
**Depends on:** Feature 11
**Branch suggestion:** feat/organizer-card-icons-and-open
**Notes:** Shipped. `specs/features/organizer-card-icons-and-open.md` and
its `tasks.md` are the authoritative record of the shipped scope, merged
to `main` in PR #250 (merge commit `309658a6`). `OrganizerCard` now shows
a per-type icon (Text/Audio/Image/Folder) reusing the existing sidebar
resource-tree icon set, and a card's title is clickable via a new
`onSelect` prop — distinct from the existing "Open" button's `onOpen`,
which keeps its original switch-to-Edit behavior unchanged — so clicking
the title selects the resource while staying in Organizer view. A
selected card now also shows a visual highlight, reusing the app's
existing selected-row convention. No existing functional requirement in
`specs/product/getwrite.md` covers Organizer card iconography or a
name-click-to-select interaction — the six-view requirement and Feature
24's card-filtering requirement are the nearest neighbors, but neither
names this, so this feature owns none of its own (per "Requirements
covered"/"User stories" above). The implementation went through three
rounds of live-verification corrections after the initial pass — not
process failures, but genuine bugs only live testing caught: (a) the
title click initially inherited a pre-existing `AppShell.tsx` global
effect that auto-switched away from Organizer view on text-resource
selection, fixed with a one-shot Redux suppression flag scoped only to
the title-click path; (b) fixing that exposed a second issue where
Organizer's card grid went blank after a non-folder selection, since it
derived "which folder to show" from the same global selection field,
fixed by giving `OrganizerView` its own local `browsingFolderId` state;
(c) the selected-card highlight was wired correctly but never rendered
due to a CSS cascade-layer conflict — the reused `@layer components`
class was structurally outranked by the `Card` component's own Tailwind
`@layer utilities` classes — fixed via inline style instead of the class.
This is explicitly the first increment of an open-ended "enhance the
Organizer view" effort per the owner's own framing — further Organizer
enhancements are expected as later, separate features, not folded into
this one's scope.

### Feature 66: Organizer view — drag-and-drop card reordering — Shipped

**Value:** A plain-file writer reorders cards in the Organizer view's card
grid directly by dragging, instead of having no way to change card order
short of leaving the view.
**Vertical slice:** Drag-and-drop card reordering in `OrganizerView`'s card
grid, built on the `@dnd-kit` library, including keyboard-operable
reordering (not mouse/touch-only) so the interaction meets this repo's
WCAG 2.1 AA target; persistence of the resulting order.
**Requirements covered:** None of its own.
**User stories:** None.
**Depends on:** Feature 65
**Branch suggestion:** feat/organizer-card-drag-reorder
**Notes:** Shipped, merged to main via PR #251 (merge commit `3d687696`).
This is the second increment of the same open-ended "enhance the Organizer
view" effort Feature 65 began — Feature 65's own Notes flagged further
Organizer enhancements as later, separate features, and this is one of them.
`@dnd-kit` was chosen this session over `react-beautiful-dnd`/
`@hello-pangea/dnd`, `react-dnd`, Pragmatic drag-and-drop, and
`react-sortablejs` after a short library survey: it is designed for React
19, is headless (no DOM manipulation outside React), and has built-in
keyboard accessibility — relevant since this repo targets WCAG 2.1 AA and
already has precedent for keyboard+touch parity in the entity relationship
graph's node-dragging feature (see this document's Feature 39 entry family
and `docs/standards/accessibility.md`). No existing functional requirement
in `specs/product/getwrite.md` covers Organizer card reordering, so this
feature owns none of its own (per "Requirements covered"/"User stories"
above), matching Feature 65's precedent.

What shipped: pointer- and keyboard-operable drag-and-drop reordering of
Organizer cards via a dedicated grip-icon drag handle, distinct from the
card's existing title-select and Open controls. Reordering reuses the
existing shared `orderIndex` reorder transport — the same mechanism the
sidebar resource tree already uses for its own drag-and-drop reordering —
so the feature adds no new transport code of its own. Reordering is
disabled whenever any Organizer filter is active, with a visible reason
shown to the writer. A completed keyboard-driven reorder is announced to
assistive technology via `@dnd-kit`'s announcements callback, satisfying
WCAG 2.1 AA Success Criterion 4.1.3 (Status Messages).

Two rounds of post-implementation smoothness fixes followed, both genuine
UX-quality corrections surfaced by live testing rather than process
failures: (a) the `DndContext` had no `collisionDetection` configured
(defaulting to `rectIntersection`) and no `DragOverlay`, so the grid
visibly reflowed under the dragged card during a drag — fixed by adding
`closestCenter` collision detection, a `DragOverlay`, and an 8px
pointer-activation threshold; (b) a deeper bug found while verifying fix
(a) live — `useSortable`'s `setNodeRef` had been wired to the 18x18px grip
handle rather than to the whole card, so `@dnd-kit` measured and
transformed that tiny handle box for every rect-based calculation
(collision detection, drag transform, `DragOverlay` sizing) instead of the
real card — fixed by moving the ref to the card itself and keeping only
`listeners`/`attributes` on the handle, matching `@dnd-kit`'s own
documented drag-handle pattern.

### Feature 67: Editor context menu — Shipped

**Value:** A writer right-clicking inside the editor's document text gets
an app-aware menu offering clipboard and formatting actions, instead of
falling through to the browser's native menu, which offers neither and is
visually inconsistent with the rest of the app.
**Vertical slice:** A new `EditorContextMenu` component, built on the
shared shadcn/Radix `ContextMenu` primitive (`ResourceContextMenu`'s and
`EditContextMenu`'s own primitive), wired into `TipTapEditor.tsx` around
the rendered `.ProseMirror` content area; Cut/Copy/Paste and
Bold/Italic/Underline/Strikethrough/Inline Code/Select All items, each
routed through the same commands the toolbar already uses
(`toolbar-command-schema.ts`); gating so the menu only opens for a plain
`TextSelection` (a `NodeSelection` — image, table cell, math node — falls
back to the browser's native menu) and never opens in Markdown source
mode; Storybook story and accessibility/unit test coverage.
**Requirements covered:** None of its own.
**User stories:** None.
**Depends on:** none
**Branch suggestion:** feature/editor-context-menu
**Notes:** Shipped on branch `feature/editor-context-menu`, merged to `main`
via PR #252 on 2026-10-01. `specs/features/editor-context-menu.md` and
its `tasks.md` are the authoritative record of the shipped scope. This is
a new, independent component scoped to the TipTap rich-text surface only —
explicitly not a reuse or extension of `ResourceContextMenu` (the resource
tree's context menu, Feature 19) or `EditContextMenu` (the generic plain
`<input>`/`<textarea>` menu) — distinguished from both since neither
previously reached the rich-text editing surface itself. Desktop-pointer-
only for this iteration: no Android/touch long-press equivalent ships
here, a deliberate scope decision recorded in the spec's Non-goals rather
than an oversight. No existing functional requirement in
`specs/product/getwrite.md` covers an editor-surface context menu, so this
feature owns none of its own (per "Requirements covered"/"User stories"
above), matching Feature 65/66's precedent for UI-polish features with no
FR of their own.

### Feature 68: Relationship-driven entity graph — customizable connections, position persistence, and focal-point selection — Merged, not released

**Value:** A novelist customizes which kinds of connection appear on the
entity relationship graph (Feature 39) — turning on backlinks between
declared entities' resources, proximity-weighted mentions, or shared-tag/
metadata edges alongside the authored-relationship and co-occurrence edges
already shown by default — keeps a node where they dragged it (Feature 41)
across reloads instead of losing the arrangement every time the view
remounts, and can select one entity as a focal point to read its own
neighborhood instead of scanning the whole graph at once.
**Vertical slice:** Data layer: a new per-project customizable
connection-type list, shaped after `ProjectConfigSchema`'s existing
`relationshipTypes: string[]` precedent (an array of active connection-type
keys, not a boolean-per-type flag set) governing which of five peer edge
types draw — authored relationships and derived co-occurrence (today's two
sources, both ON by default) plus three new derivations, each needing its
own transport parity: backlinks between two declared entities' resources
(over `backlinks.ts`), proximity-weighted mentions (over `mention-index.ts`'s
stored per-mention character offsets), and shared-tag/shared-metadata-field
edges (over the existing tag/metadata layer) — all three OFF by default.
Data layer: persisted per-entity node positions, keyed by `entityId`
independent of which edges happen to be visible at a given moment, pinned
by default (exempt from layout recompute) but invalidated — silently reset
to a freshly computed position — specifically when the project's active
connection-type list has changed since the position was last saved; a
position for an entity later deleted or un-declared (Feature 42) is dropped
silently, with no new confirmation step added to Feature 42's removal
dialog. Interface: a settings surface for the connection-type list;
`EntityGraphCanvas.tsx` reading/writing persisted positions instead of
discarding drag state on reload or view switch; a focal-point selection
interaction (select a node as focal point, easily reassignable to a
different node) that centers/pans the camera on the selected node and
visually emphasizes its neighborhood within a configurable number of
relationship-hops, dimming or hiding nodes outside that radius — the
richer ego-graph reading rather than a camera-only action — with every
active edge type remaining visually distinguishable from the others
wherever more than one appears, continuing FR-39's existing
detected-vs-authored distinction discipline. Default hop count, its
adjustability, and full UI/interaction detail for all three pieces belong
to this feature's own feature spec, not this breakdown-level entry.
**Requirements covered:** FR-51
**User stories:** US-17
**Depends on:** Feature 39, Feature 41
**Branch suggestion:** feat/entity-graph-connections-persistence-focal-point
**Notes:** Not started. This is a grouped feature by explicit owner
decision, not this document's default one-FR-one-feature bundling: the
owner decided, in the planning conversation preceding the 2026-10-01
product-spec amendment, to build FR-39's edge-sourcing amendment, FR-40's
position-persistence amendment, and new FR-51 (focal-point selection)
together as one slice rather than as separate features, explicitly because
switching the connection model was expected to affect position persistence
(see FR-40's own amended text) and because resolving the edge-sourcing
question (OQ-50) in the same pass removed the sequencing blocker that had
been holding FR-51 back (see OQ-52's resolution). This also addresses the
parent spec's still-open OQ-3 ("should FR-39 split into more than one
shippable feature") for this slice of work specifically: OQ-3 itself
remains open and is not resolved here, but the owner's explicit grouping
decision is the scoping call actually applied to this amendment, so FR-39's
amended parts are not further split for this feature, and that is a
deliberate scoping decision, not OQ-3 being silently ignored. Key resolved
decisions this entry's Vertical slice reflects, each settled at Gate 1
triage 2026-10-01 and detailed in the product spec: OQ-50 (resolved) —
co-occurrence is folded into the same customizable five-type list as the
three new candidate connection types, rather than kept as a hardcoded
always-on exception outside it; OQ-51 (resolved) — the hybrid pin-by-default/
invalidate-on-connection-list-change model for persisted positions, not a
simple last-known-hint a recompute can always override; OQ-52 (resolved) —
the richer ego-graph hop-filter reading for focal-point selection, not a
narrow camera-only action. Two implementation-level questions are
explicitly deferred to this feature's own feature spec rather than resolved
at this breakdown rung, per OQ-52's own text: the default hop count and
whether/how a writer can adjust it, and whether a hop-filter-hidden node's
persisted-but-not-drawn position/edges still count toward another visible
node's hop distance. Supersedes, for the amended portions only, Feature
39's originally-shipped co-equal two-source edge model (see Feature 39's
own Notes) and Feature 41's originally-shipped ephemeral-only position
claim (see Feature 41's own Notes) — neither Feature 39 nor Feature 41 is
rewritten here, since both entries remain the accurate historical record of
what actually shipped at the time. Requirements covered lists only FR-51
(new), which this feature owns exclusively; FR-39 and FR-40 remain owned by
Feature 39 and Feature 41 respectively per the partition rule, even though
this feature extends both — see those features' own Notes for the pointer
back to this entry.

---

### Feature 69: Entity graph kind encoding and visual-consistency pass — Not started

**Value:** A novelist glancing at the entity relationship graph (Feature 39)
can tell a character node from a place or faction node at a glance, by color
and shape together rather than by reading labels one at a time, and
customizes that per-kind mapping to match how they think about their own
story's cast; separately, the graph's chrome — nodes, edges, canvas,
settings panel, reset-view control, and tooltip overlay — stops looking
visually bolted-on and reads as part of the same product as everything
around it.
**Vertical slice:** Data layer: a new per-project, writer-customizable
mapping from each `entityKind` in use to a color and a shape, persisted
alongside the other per-project graph configuration Feature 68 introduced.
Interface: a new dedicated kind-to-color/shape customization modal,
structurally modeled on the existing tag-management modal
(`TagsManagerModal.tsx`) — listing each kind currently in use with a color
swatch and a shape picker — opened from the graph view; `EntityGraphCanvas.tsx`
rendering each node's color and shape from that mapping, with color never
standing alone as the only encoding of kind; a deterministic, hash-assigned
shape paired with a neutral default color for any kind with no assigned
mapping yet, so every unmapped kind stays immediately distinct from every
other without requiring writer action first, mirroring this product's
existing tag-color convention; legibility carried by two complementary
mechanisms — a static legend inside the new customization modal as the full
reference, and a canvas node tooltip mirroring the existing edge-tooltip
overlay (`entityGraphTooltipOverlay.css`) for an in-context, at-a-glance
lookup — plus the entity's kind disclosed as text in the synchronized
accessible list (`EntityGraphAccessibleList.tsx`), extending the precedent
`edgeDescriptions.ts` already sets for edge-kind disclosure. Separately, and
scoped narrowly: a visual-consistency pass over the graph's own already-
existing rendered chrome — node style, edge style, canvas background, the
settings panel and reset-view button (`EntityGraphSettingsPanel.tsx` and its
neighbouring controls), and the tooltip overlay — bringing each into
alignment with this product's `--color-gw-*` brand token system, IBM Plex
Sans/Mono/Serif typography, the reserved-red constraint, and dark/light mode
support; this pass changes no interaction model, adds no new chrome, and
presents no new information — it restyles what already renders. Both pieces
ride the existing per-project `entities` feature flag and introduce no flag
of their own.
**Requirements covered:** FR-52, FR-53
**User stories:** US-17
**Depends on:** Feature 68
**Branch suggestion:** feat/entity-graph-kind-encoding-visual-consistency
**Notes:** Not started. This is a grouped feature by explicit owner
decision, not this document's default one-FR-one-feature bundling: FR-52
(kind-driven node color/shape encoding) and FR-53 (the chrome
visual-consistency pass) were decided in the same 2026-10-01 planning
conversation that produced Feature 68's FR-39/FR-40/FR-51 grouping, but were
deliberately deferred out of that round rather than built with it — this
entry is where that deferred pair lands. It depends on Feature 68 because
both requirements build on the same `EntityGraphCanvas.tsx`/
`EntityRelationshipGraphView.tsx`/`EntityGraphSettingsPanel.tsx` surface
Feature 68 ships, and FR-53 explicitly names Feature 68's own settings-panel
and reset-view chrome as part of its scope. Key resolved decisions this
entry's Vertical slice reflects, each settled at Gate 1 triage 2026-10-01
and detailed in the product spec: OQ-53 (resolved) — the per-kind mapping is
customized through a new dedicated modal modeled on the tag-management
modal, not an inline graph-view control; OQ-54 (resolved) — the
unmapped-kind default is a deterministic hash-assigned shape paired with a
neutral color, not the reverse; OQ-55 (resolved) — legibility is carried by
both a legend and a node tooltip together, not either alone, plus the
accessible-list kind disclosure; OQ-56 (resolved) — FR-53's "done" bar is
qualitative owner sign-off against a built implementation, not a predefined
checklist, which means this feature's eventual task list must include an
explicit review/sign-off step near the end of the work rather than treating
completion as self-certifiable against fixed criteria.

---

### Feature 70: Entity mention noise flagging — Shipped

**Value:** A novelist naming a character or alias that happens to also be
an ordinary English word (e.g. "Case," "Hope," "Tiny") gets a heads-up that
detected prose mentions of it may include false positives — now on the
entity's `name` as well as its `aliases`, checked against a much larger
bundled word list rather than the ~20-word hardcoded list that preceded it
— and can tune that check per-project, maintain one noise-word list across
every project they write in, and dismiss an observation once acknowledged,
all without any mention ever being hidden or filtered.
**Vertical slice:** Data layer: a bundled, static, top-N (~2,000-3,000
word) English frequency list committed as repo data
(`bundled-noise-words.ts`), replacing the former ~20-word hardcoded common-
word list in `entity-alias-warnings.ts`; a per-project custom noise-word
list and per-project global-word exclusion list on project config
(mirroring `config.statuses`'s shape); a cross-project "global" custom
noise-word list persisted independently in all three runtimes — a
tenant-root-level `.global-noise-words.json` via `io.ts` on web/hosted, an
extension to `userData/workspace.json` plus a new
`getwrite:global-noise-words-get`/`-set` IPC channel pair on Electron
desktop (following the existing `getwrite:workspace-dir` precedent
exactly), and a device-level, project-independent, unencrypted JSON file
on native Android — collapsed behind one client transport
(`lib/api/global-noise-words.ts`, `createTransport`) with no sync or merge
logic between the three stores. Logic: a single noise-check function
(`entity-alias-warnings.ts`, formerly alias-only) applied identically to an
entity's `name` and `aliases`, evaluating bundled ∪ project-custom ∪
global, minus project-excluded global words, and suppressing a dismissed
term. Sidecar: a new `dismissedNoiseTerms` field, written through the
existing `updateSidecar` path, scoped per-entity-per-term. Interface: a new
standalone "App Settings" surface (reachable with no login/account) for
the global list; a new Project Settings "Noise Words" tab for the
per-project custom list and global-word exclusions; revised,
non-imperative observation copy and an inline per-term dismiss control
wired into both `EntitySection.tsx` (the alias/name editor) and
`EntityRosterView.tsx` (the project-level roster), with no red/alert
styling on either.
**Requirements covered:** FR-54, FR-55, FR-56
**User stories:** US-3, US-24
**Depends on:** Feature 33
**Branch suggestion:** feature/entity-mention-noise-flagging
**Notes:** Shipped on branch `feature/entity-mention-noise-flagging` (not
yet merged to `main` as of this entry; most recent commit `f5391215`).
`specs/features/entity-mention-noise-flagging.md` and its `tasks.md` (15
tasks, all done) are the authoritative record of the shipped scope. Per
that spec's own scope note, this feature required genuinely new
cross-project/device-level preferences infrastructure in all three
runtimes — none of web/hosted, Electron, or native Android had an existing
cross-project or device-level preferences seam before this feature — and
all three shipped together rather than staged, per the spec's FR-5/FR-15
hard requirement that functional parity across runtimes (not data or sync
parity) is non-negotiable. The spec explicitly flags itself as "at the
upper bound of what should stay one spec." Two settled, non-default scope
calls carried over from the feature spec's own Gate 3 resolutions: bulk
dismissal from the roster was considered and explicitly declined (dismissal
stays inline-only, per-row); and the exact approved copy strings for the
softened observation text went through a dedicated copy-review task (Task 4) rather than being invented ad hoc inside the UI tasks that consume them.
Extends, rather than duplicates, Feature 34's existing
`entity-alias-warnings.ts` short/common-word advisory mechanism and
Feature 36's roster "needs attention" surfacing — both already non-
color-only per FR-11's styling constraint, which this feature's own
observation UI follows rather than introduces fresh.

---

### Feature 71: Entity mention navigation — Shipped

**Value:** A novelist reviewing an entity's own "mentioned in" list no
longer has to re-scan a resource by eye to find the exact sentence a
snippet came from — clicking the snippet itself jumps the editor straight
to that occurrence, switching resources first if needed, and briefly
marks the spot so it's unmistakable at a glance.
**Vertical slice:** Threads each mention snippet's source character offset
from the mention index through to the client (`mentions-core.ts`'s
`EntityMentionedIn` rows gain a parallel `offsets: number[]`, carried end
to end through the HTTP response schema and native transport); a new
pure resolver (`offset-resolver.ts`) that walks the live TipTap document's
text nodes to convert that plain-text offset into a ProseMirror position,
plus a staleness check re-matching the resolved position's surrounding
text against the entity's own name/aliases before committing to a jump; a
new one-shot transient highlight decoration
(`MentionJumpHighlightExtension.ts`), deliberately separate from the
persistent entity-highlighting decoration; a small cross-subtree registry
(`activeEditorRegistry.ts`) letting the sidebar reach the live editor
instance to drive the selection/scroll/highlight; and a new per-project,
writer-adjustable highlight-fade duration (`config.mentionHighlightDurationSeconds`,
1-10 seconds inclusive, default 2 when unset) plumbed end to end the same
way `wordCountGoal`/`dailyWordGoal` are, surfaced in a new "Entities"
Project Settings tab holding exactly that one field. A stale offset (the
underlying text changed since the mention index was last built) no-ops
the click with a toast rather than jumping to the wrong place. A
link-only row with no detected mentions keeps its existing resource-open-only
click behavior unchanged.
**Requirements covered:** None of its own — scoped and approved through its
own standalone feature spec (`specs/features/entity-mention-navigation.md`)
rather than an amendment to this product spec's FR ladder; see this entry's
Notes.
**User stories:** None of this document's own — the source spec defines its
own US-1/US-2 (reviewing a mention in the current resource; reviewing one in
a different resource), not drawn from this document's US ladder.
**Depends on:** Feature 33
**Branch suggestion:** feature/entity-mention-navigation
**Notes:** Shipped on branch `feature/entity-mention-navigation`, merged to
`main` via PR #257 on 2026-10-06. `specs/features/entity-mention-navigation.md`
and its `tasks.md` (17 tasks, all done) are the authoritative record of the
shipped scope. That standalone spec defines its own FR-1 through FR-10,
numbered independently of this document's FR ladder. Five bug-fix commits landed on top of the original
implementation, found by manual testing against real project data rather
than the automated suite: the highlight extension was never registered in
`TipTapEditor.tsx`'s extensions array, and ProseMirror's own
`.scrollIntoView()` command didn't actually move the real viewport, needing
a supplementary native DOM `scrollIntoView` call; the configured duration
never took effect, through three successive causes (a stale Redux cache,
then a wrong cache key, then an incomplete response-validation schema
silently stripping the field); a stale `setTimeout` from an earlier click
could clear a later click's highlight early when clicks overlapped; and the
"works once, then never again" failure traced to `TipTapEditor.tsx`'s
content-sync effect firing two full document replacements back-to-back on
every resource load (a broken object-vs-string equality check), reproducible
only with a large entity's many mentions since that widens the timing gap
between the two loads enough for the second replacement to wipe out the
first's highlight. `EntityHighlightDecorationExtension.ts` (Feature 34) is
explicitly not reused or extended for the new one-shot highlight — the two
serve different purposes (persistent, continuously-recomputed vs. one-shot,
timer-cleared) and the source spec requires them to stay separate.

---

### Feature 72: Resource subtype — Shipped

**Value:** A writer on deadline labels each resource with a subtype they
define themselves (for example "Scene" or "Profile") and limits a custom
metadata field to particular subtypes, so a field that only makes sense for
scenes stops cluttering the sidebar of every other resource.
**Vertical slice:** Data: an optional `subtypes` string array on the project
config (`ProjectConfigSchema` and the project-type spec shape, mirroring
`statuses`/`relationshipTypes` in `schemas.ts` and `project-creator.ts`,
which gains seeding of it from a project type), a new optional subtype key
on the shared base of the text/image/audio sidecar schemas, and a new
optional subtype-restriction array on a custom field definition
(`MetadataFieldSchema`); the identifiers are final (`subtypes`,
`resourceSubtype`, `appliesTo`; Owner decision, Gate 3, 2026-10-08), the
sidecar key chosen so it cannot collide with a custom field key. Logic: a pure
visibility predicate (a restricted field shows only when the resource's
subtype is in its list; an unset subtype matches no restricted field; the
existing group `folderId` check is unchanged and must also pass), matching
by label so removal from the list leaves references intact; the sidecar
subtype is set and cleared through the existing `updateSidecar` path
(`resource-crud-core.ts`), where clearing needs its key added to the
`clearKeys` allowlist, and the project list is persisted through the
existing feature-config path that relationship types use
(`POST /api/project/features`, `updateFeatureConfig`, the feature-config
transport and its native backend), with no new route, transport or native
backend pair. Interface: a new subtype list editor, modelled on
`RelationshipTypesSettings.tsx` (add, remove, reorder, duplicates rejected;
this component is new), added as a new section of the existing "Metadata"
tab in `ProjectSettingsDialog.tsx` (no new tab; Owner decision, Gate 3,
2026-10-08, reversing the Gate 1 decision for a dedicated "Subtypes" tab),
a subtype control in `MetadataSidebar.tsx` for all three resource kinds, a
subtype restriction checkbox group on custom fields in `SchemaManager.tsx`,
and the sidebar filtering fields through the predicate.
**Requirements covered:** FR-57, FR-58, FR-59, FR-60, FR-61
**User stories:** US-25, US-26
**Depends on:** Feature 2, Feature 3, Feature 7, Feature 18, Feature 33
**Branch suggestion:** feat/resource-subtype
**Notes:** One slice, not several, because the owner's value exists only
when the list editor, the resource control, the per-field restriction
and the sidebar honouring it all exist together; any subset leaves a control
that changes nothing a writer can see. Project-type seeding of the list is
part of FR-61 and ships here by owner decision (OQ-58); no built-in project
type ships a list, so seeding is exercised only by tests and by a type that
declares one. Dependencies: Feature 2 for the project-type seeding path,
Feature 3 for the move-does-not-change-subtype guarantee, Feature 7 for the
sidecar and metadata sidebar, Feature 18 for the schema manager and field
definitions (and for the Metadata tab that hosts the list editor), Feature 33 for the entity independence guarantee in FR-59.
Explicitly out of scope and unchanged: subtype in the query builder or smart
folders, restricting built-in fields, a rename operation, any catch-all
subtype, Organizer card body and filters, and the Timeline. Fields hidden by
subtype remain queryable and a hidden stored value can still show in the
Organizer or in queries; that is an accepted consequence (OQ-59). The
folder-scoped group mechanism is left alone and no migration is required.
Risk: the sidebar visibility predicate must not be applied anywhere that
reads stored values directly.

Shipped on branch `feat/resource-subtype`, accepted by the owner 2026-10-08,
and merged to `main` via PR #260 on 2026-10-08 (merge commit `4a5a0809`).
`specs/features/resource-subtype.md` and its `tasks.md` (fourteen tasks, all
done) are the authoritative record of the shipped scope. On the integrated
branch `pnpm typecheck` was clean and the frontend suite reported 5459
passed, 1 skipped, 0 failed. Exercised in the running app against a
disposable project, with on-disk state checked: subtype list add,
duplicate-rejection, remove and re-add; sidebar set, change and clear; field
restriction; kept-but-hidden values; stale-label display; normalized
matching; reload. A later custom-field edit did not revert or resurrect the
subtype on disk. Not verified live: Storybook story tests were not run
(sandbox); reordering, image/audio resources, project-type seeding,
failed-write behaviour, keyboard-only operation and the native build were
covered by tests only. Deviations from the spec: built-in fields show no
restriction control (the spec allowed none or disabled); blank and duplicate
list entries show an inline alert, and only a failed save shows a toast; the
subtype selector returns an empty list both for "no subtypes" and for "no
project record". Stale whole-resource save: measured at the request-payload
level for `entityKind` (the second payload omitted the key), and fixed for
the subtype key only. The same behaviour for `entityKind`, `aliases` and
`wordCountGoal` is unchanged, and what the server stores in that case was
not measured.

---

### Feature 73: Loadable template resources, save from a resource, editable copies, and subtype carried through — Shipped

**Value:** A writer who creates a resource from a template gets a normal
resource the project can open (it does not today), and a writer who creates a
resource from a "Scene" template, or copies or duplicates a Scene, gets a
Scene without re-labelling it, so the fields they scoped to scenes appear
immediately. A writer can also save a template from a resource they have
already written, through the shipped CLI, instead of hand-editing JSON. And a
writer who copies or duplicates a text resource to rework it can edit the
copy and keep the edits: today they cannot (measured 2026-10-08, edits typed
into a duplicate were lost on reload with no error), because a copy has no
revision for the editor to save into.
**Vertical slice:** Data and logic: template creation in
`resource-templates.ts` is changed to write a resource through the app's own
create path (`createResourceOfType`, `writeResourceToFile`, and the initial
canonical revision `createResourceCore` writes), carrying the template's
`userMetadata` and subtype; the template shape gains an optional top-level
`resourceSubtype`; `saveResourceTemplateFromResource` is corrected to capture
the source's real `userMetadata`, its subtype and its text body and nothing
else from the sidecar; and the CLI registers a new shipped
`templates save-from-resource` command on the existing `templates` group. The
write-plus-initial-revision tail of the app's create is extracted into one
function that the app's create, template creation, copy (`copyResourceCore`)
and duplicate (`duplicateResource`) all call, so a copied or duplicated text
resource gets a single initial canonical revision (the source's other
revisions are not copied; image and audio copies get none). The subtype on
copy and duplicate needs only regression tests (they spread the whole source
sidecar by reading, so no code change is expected for it), plus a regression
test that a blank create has none. Template creation supports text templates
only, stores the body as plain text, and the shipped `templates create` gains
no `--folder` option.
The check that the Scrivener, DOCX and plain-text import pipelines do not set
a subtype belongs to Feature 72 (its FR-27), not to this feature. Interface:
no new UI; the effect is visible in the sidebar of the created or copied
resource and, for templates, through the CLI commands.
**Requirements covered:** FR-62, FR-63, FR-64
**User stories:** US-25, US-13, US-6, US-9
**Depends on:** Feature 72, Feature 17
**Branch suggestion:** feat/subtype-templates-duplicate
**Notes:** Split from Feature 72 because the core loop works without it: a
writer can label resources by hand. Feature 72 merged to `main` on
2026-10-08, so this feature is unblocked. Scope grew at Gate 3 on 2026-10-08
from the original entry, which was "templates carry the subtype key", with
copy and duplicate needing only a test. A measurement that day changed it: the
pipeline lead ran the real model functions against a temp project; after
`createResourceFromTemplate` the call returned without error and wrote a flat
`resources/<name>-<id>.txt`, a sidecar of exactly id, name, type and createdAt,
and no `revisions/<id>/`, and afterwards `loadProjectFromDisk` threw `ENOENT`
on `resources/<id>/content.txt` and `getLocalResources` threw a `ZodError`
(`slug` missing), each for the project as a whole. Not measured: the running
app, image and audio templates, and `templates duplicate`. Gate 3 owner
decisions: (A) fix template creation as part of this feature, through the
app's own create path; (B) add `templates save-from-resource` to the shipped
CLI and correct what it captures (the source's real `userMetadata`, its
`resourceSubtype` as a top-level template key, nothing else). Defaults
accepted at Gate 3, not explicit decisions: `templates list` output
unchanged; an invalid stored subtype is rejected with an error naming it; no
fallback read of a label from an older template's `userMetadata`; templates do
not carry `entityKind`, `aliases`, `wordCountGoal` or `dismissedNoiseTerms`;
project-type `defaultResources` out of scope. Consequences the owner may not
have anticipated: templates now carry a resource's `userMetadata` onto every
resource created from them; existing tests that assert the old flat layout or
the four-key sidecar change deliberately; resources already created by the old
path remain unloadable unless a separate repair is decided. The other
unshipped helper subcommands stay unregistered, and the template feature stays
CLI and model only, with no template UI. The feature spec is
`specs/features/subtype-templates-duplicates.md`, which has no open questions:
the last one (copies and duplicates made before the fix) was decided at Gate 3
on 2026-10-08, option (a), see below.
The first draft of this note said that whether the app opens a duplicate or
a copy equivalently to an app-created resource was unmeasured; it has since
been measured (next paragraph).
Second Gate 3 measurement, 2026-10-08 (pipeline lead, two ways). At model
level (a temp project, the real functions): a copy and a duplicate of a text
resource each kept `resourceSubtype` and `entityKind` and the content
directory, had no `revisions/<newId>/`, and both loaders still succeeded; the
duplicate also kept the source's `name` and `createdAt`. In the running app
(`next dev`, a disposable projects directory, Playwright, files on disk): a
baseline edit reached disk within 5 seconds; after Duplicate, an edit typed
into the copy was in neither content file after 8 and about 25 seconds, the
copy had no revision directory, and after a reload and reopening the copy the
edit was gone, with no toast, error or unsaved-changes prompt. Not measured:
the menu's "Copy" action, image and audio copies, a manual "save revision" on
the copy, and CLI `templates duplicate` output opened in the app. The cause
is not established by experiment (a reading that the editor autosaves only
into a canonical revision, which a copy lacks, is consistent and untested).
Owner decision C, Gate 3, 2026-10-08: fix it inside this feature (FR-64).
Defaults the owner confirmed ("defaults OK") for the feature spec's eight
questions: text templates only (image, audio and unknown types rejected); a
template's folder honoured when it exists and rejected when it does not; no
`--folder` option; variable substitution applies to metadata strings; body
captured as plain text only; resources made by the old template path out of
scope with a documented workaround; duplicate fidelity closed by decision C;
templates made by the old unbundled helper left as they are. Not decided: a
fresh name or `createdAt` for a duplicate (an adjacent finding). Owner
decision, Gate 3, 2026-10-08, on copies and duplicates made before the fix
(formerly the feature spec's one open question): not repaired by this feature
and documented, with a repair command deferred to a follow-up feature; the
workaround is to duplicate the resource again after the fix and work in the
new copy. A read-only count over the repo's own `projects/` store the same day
found 11 of 160 text resources with no revision directory, all in one project,
none with "copy" in its name, 9 of the 11 with a word count of zero or absent;
how they came to lack a revision was not established, and only the repo's
store was checked. The owner then approved the feature spec.

Shipped on branch `feat/subtype-templates-duplicate`, accepted by the owner
2026-10-08, and merged to `main` via PR #261 on 2026-10-08 (merge commit
`f1e3ffbe`).
`specs/features/subtype-templates-duplicates.md` and its `tasks.md` (eleven
tasks, all done) are the authoritative record of the shipped scope. Tests:
frontend `pnpm typecheck` clean and the suite at 5557 passed, 1 skipped,
0 failed on the integrated branch (the pipeline lead's own run; baseline 5459
passed and 1 skipped). As reported by the implementation run: lint 0 errors
and 395 warnings (399 on `main`); CLI suite 130 passed with
`tests/qa/server.test.ts` excluded, and that file passing when run alone.
Exercised in the running app on the fixed code (a disposable project, on-disk
state checked; the CLI commands run outside the sandbox from the branch
build): an edit typed into a UI duplicate, a CLI duplicate
(`templates duplicate`), a template-created resource (`templates create`) and
a round-trip resource (`templates save-from-resource` then `create`) was in
each case saved and survived a page reload; each had an initial revision and
showed the subtype in the sidebar; the project containing a template-created
resource loaded. Before the fix, edits to a duplicate were lost and a
template-created resource made the project fail to load (both measured
2026-10-08 on `main`). Measured with the built CLI: a CLI-created and a
CLI-duplicated resource were in the search index without a reindex and absent
from the mention index until `reindex`; the cause was not investigated. Not
exercised live (tests only): the menu's "Copy" action (Duplicate was used),
image and audio copies, a template with a folder, an invalid stored subtype,
an encrypted project. Deviations and accepted items: `pnpm knip` lists two
pre-existing exported types (`ReorderFolderEntry`, `ReorderResourceEntry`) as
unused on this branch only, the cause not established, accepted by the owner
without a fix; the measurement task could not run inside the sandbox (the
built CLI exited with a file-watch error there) and was run outside it; one
CLI test file (`tests/qa/server.test.ts`) was intermittent on unchanged code,
cause not established. Not repaired, by owner decision: resources created by
the old template path, and text resources that already lack a revision (11 of
160 in the repo's own store, cause not established); a repair command is a
follow-up.
Addition, 2026-10-08, after merge: the repair command is now Feature 74, and
the cause of the 11 has since been investigated (see Feature 74's Notes).

### Feature 74: Repair for text resources with no revision — Shipped

**Value:** A writer whose project holds text resources that have content but
no revision (the editor cannot autosave into them, so edits are lost on
reload) can repair them with one command, and can preview what it would do
first. Without it the only remedy is to copy the resource's text into a new
resource by hand.
**Vertical slice:** Data and logic: `repairMissingInitialRevisions(projectRoot,
{ dryRun })` in `frontend/src/lib/models/revision-repair.ts`; for each text
resource with no `revisions/<id>/v-*` directory and readable content it
writes `v-1`, canonical, holding the resource's own document, through the
shared `writeInitialCanonicalRevision` that Feature 73 extracted. It never
writes over an existing revision directory (even one with unreadable
metadata), skips and reports a text resource with no content files, ignores
image and audio resources, is idempotent, and writes only under
`revisions/`. Interface: the CLI command `getwrite-cli repair-revisions
[projectRoot] [--dry-run]` (exit 0 clean or repaired, 1 if something could
not be repaired, 2 error, 3 encrypted project). Tests: model and CLI. No UI.
**Requirements covered:** FR-65
**User stories:** US-6, US-9
**Depends on:** Feature 73
**Branch suggestion:** fix/repair-revisionless-text-resources
**Notes:** Shipped on branch `fix/repair-revisionless-text-resources`, and merged to
`main` via PR #262 on 2026-10-08 (merge commit `82ab0f05`). Done as a small direct change
outside the pipeline, by owner decision (2026-10-08), after an investigation;
it follows Feature 73, which fixed copy and duplicate going forward and
deferred repair of resources that already lacked a revision.
Investigation (pipeline lead, 2026-10-08): the repo's `projects/` store held
11 revision-less text resources, all in one project, all created on that
project's first day, 2026-05-13. That day's text resources split 12 with a
revision and 11 without; every text resource created from 2026-05-14 onward
(53) has one. The 12 show a first revision named by hand ("V1", "Rev 1")
seconds to minutes after the resource; from the cutover on the first
revision is "Initial Draft", created at the same instant as the resource. The
cutover lines up with commit `93fcab45` (2026-05-13 18:47 local); the
pre-May code was not re-run, but the data cutover and the commit's stated
purpose agree. So the 11 are resources created before the app wrote a
revision at creation, not copies; 9 are empty and 2 have content. A
read-only scan of the owner's `~/Documents/GetWrite` workspace found the same
11 in that project's copy there and none in its other three projects (132
text resources scanned). By reading call sites (not by running each), every
current path that creates a text resource writes a first revision: app
create, template create, copy, duplicate, project creation from a project
type, and the Scrivener, DOCX and plain-text importers. Not checked: whether
anything can delete a resource's last revision. The two known sources, resources created before that
commit and copies made before Feature 73, are both closed.
Verified: 9 model tests and 5 CLI tests (through the registered command);
frontend suite 5566 passed, 1 skipped; CLI suite 135 passed with
`tests/qa/server.test.ts` excluded; a dry run of the model function against
the repo's affected project reported exactly the 11 and skipped none. Run by
the owner the same day against the affected project in their own workspace:
the command reported eleven repaired; each then had one canonical revision
equal to its document, with content files and sidecar untouched, and a rescan
of that workspace found no text resource without a revision. An edit then
typed into one repaired resource in the running app was written to its
content files and canonical revision within seconds. Not exercised: a project
with a text resource that has no content files, outside tests. Deliberately not
done: healing on open in the app or editor, and detection in `doctor`; the
owner chose the CLI repair because both sources are closed, so the population
cannot grow. Consequence: a writer who does not run the command is not
helped, and the installed desktop app gains nothing from this feature.

### Feature 75: Share projects on the home network, gated by device pairing — Merged, not released

**Value:** A writer who works on the GetWrite desktop app can turn on one setting, pair their own tablet or second computer with a short code shown in the desktop window, and open their projects in that device's browser over the home network, with no account and no hosted service. Nobody on the network who has not been paired can read or change anything.
**Vertical slice:** Data: a per-install sharing setting (absent means off, so a fresh install is off) and a store of paired devices (a credential per device, kept so it can be checked later; the store of record is not chosen here, see Open Questions), plus the short-lived one-time pairing code with its wrong-attempt counter. Logic: (1) the network bind: the desktop main process starts its bundled server with the sharing setting deciding the listen address (`electron/src/main.ts` sets `HOSTNAME: "127.0.0.1"` in the environment it passes to the server; read, not run), which is fixed when the server starts, so changing the setting has to restart the server (read from the requirement and that line, not run); (2) the access gate: every request from something other than the desktop window is classified as confirmed, unconfirmed, revoked or unknown before any route or page runs, and anything but confirmed is refused; (3) pairing: issue a code (lifetime about 2 to 5 minutes, about 3 to 5 wrong attempts; exact values fixed in the feature spec, OQ-72), accept it once, mint the device's own long-lived credential, name the device automatically from its browser or device; (4) the desktop window's exemption (OQ-70; the mechanism is open, see Open Questions). Interface: in the desktop app, a sharing on/off control, a visible "sharing is on" state with the address other devices use, the current pairing code and a way to make a new one, and the plain-words statements that (a) other devices reach the writer's projects only while the desktop app is open, awake and on the same network (OQ-71) and (b) the connection is unencrypted HTTP meant for networks the writer trusts (FR-68). In the browser on the other device, a pairing screen that takes the code. Seams, each opened and read, not run: `electron/src/main.ts` (server start and its environment), `electron/src/preload.ts` (the `getwriteDesktop` bridge, `contextBridge` plus `ipcRenderer.invoke` channels, is where a desktop-only control and the code display would be exposed), `frontend/src/lib/desktop-bridge.ts` (the renderer-side bridge type), `electron/src/projects-dir.ts` (`workspace.json` read-modify-write helpers, `WorkspaceConfigFile`, one optional field per concern), `frontend/app/api/_tenant/with-storage-context.ts` (the single wrapper API route handlers go through; its own doc comment says the session check and the Origin/Referer check are skipped when hosted auth is inactive), `frontend/app/api/_tenant/identity-source.ts` (the pluggable identity seam), `frontend/app/(app)/layout.tsx` with `frontend/src/lib/auth/session-guard.ts` (the page gate, which redirects to `/login` only when hosted auth is active). The gate has to cover more than those seams: a directory listing shows `frontend/app/login`, `preferences`, `project-types`, `reset-password` and `verify-email` as siblings of the `(app)` group, so the `(app)` layout does not by itself cover them, and `frontend/app/api/version-check/route.ts` is the one `route.ts` file out of 63 under `frontend/app/api` whose text does not contain `withStorageContext` (a text search, not a read of every route); the repo has no `middleware.ts` (checked). Whether `/_next` static assets and any other path the server answers need the gate too is not established.
**Requirements covered:** FR-66, FR-67, FR-68. This feature is the owner of all three because the schema gives each requirement to exactly one feature (see this document's Open Questions and the precedent of the entity-graph enabling slices). What it delivers itself, by requirement in order: the on/off setting, off by default and off after a fresh install, not reachable while off, the on-state and address display, the availability statement, no accounts, no hosted authentication, Postgres or SMTP; then confirmation by one-time pairing code, a per-device credential, refusal of unconfirmed, revoked or unknown on every API route and page, expired or used codes refused, the code lifetime and attempt limits, automatic device naming, the window exemption; then the plain-words unencrypted-HTTP statement and the desktop fully functional with sharing off. The parts of these requirements carried by the later home-network features (the last-save-wins promise and its test, the paired-device list with rename and revoke, the capability limits and the project-deletion setting) are listed in those features and are not claimed twice.
**User stories:** US-27
**Depends on:** none
**Branch suggestion:** feat/home-network-sharing
**Notes:** Why the toggle and the gate are one feature and not two. The hard ordering constraint is that no shippable state may have the desktop server reachable from another device without the pairing gate enforced on every API route and page. Read from code, not run: with hosted authentication inactive, `with-storage-context.ts` skips its session and Origin checks, and `electron/src/main.ts` pins `HOSTNAME` to `127.0.0.1`, so the loopback bind is the only thing standing between another device and the writer's files today. A toggle without the gate is therefore exactly the forbidden state. The gate without the toggle was considered as a separate first feature, and it would be safe, but it has no outcome a writer can observe: the server stays unreachable from other devices, so there is nothing to pair with, and a writer could only exercise it from a browser on the same machine. That would be an enabling layer, not a vertical slice. They ship together, and inside the feature the build order is the gate and its tests first, the bind change last. Acceptance has to include a check that, with sharing on and no credential, a request to every route and every page is refused, run against a listing of the routes and pages rather than a sample. Between this feature and Features 76 and 77 a paired device is a full client with no list in the desktop app to revoke it and no limits on sharing, pairing, lock state or project deletion; that is a real interim exposure. (Update, 2026-10-10: Feature 76 has since merged, so a paired device can now be revoked from the desktop app; the missing limits remain until Feature 77. Update, 2026-10-10: Feature 77 has since merged and its limits are in `main`, unreleased.) Release hold (owner decision, Gate 2, 2026-10-09): build order is not release order. Feature 75 may merge to `main`, but no release containing Feature 75 goes out until Features 76, 77 and 80 are merged; the owner merges the release PR by hand, so the hold is enforced at that step. Owner decision, 2026-10-09 ("Port change proposal is fine, 80 before release"): Feature 80 (the port change) need not precede Feature 75's build, because 75 is specified against a single port source and does not depend on its value, but it MUST be merged before any release containing Feature 75, because a paired device saves the desktop's address (host and port). This is the largest feature in this amendment, and its task list will need to sequence the gate ahead of the bind; if it proves too large, the seam to cut along is the pairing flow from the bind, but only if the bind then ships no earlier than the gate (the same reasoning as above). Decided at Gate 2 (2026-10-09): the writer's sharing choice persists across restarts, and the desktop window shows clearly at launch that sharing is on. Not decided here, carried to the Feature 75 feature spec by owner decision: which interface(s) the server listens on, what the address display shows on a machine with several addresses, the window-exemption mechanism, what the gate must cover, and where credentials are stored and in what form. The port value is not this feature's concern: it is specified against a single port constant, and the value is Feature 80's. The first version's client is a browser; Android as a client is deferred (OQ-74, a stated priority and not a schedule). Hosted multi-device sync (FR-30, Feature 28) is not replaced (OQ-67). Nothing here was run. Status, 2026-10-09 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. Implemented on branch `feat/home-network-sharing`, merged as PR #263, merge commit `1160bf6e`; the branch tip merged was `0fe43651`. Feature spec `specs/features/home-network-sharing.md` (FR-1 to FR-35), task list `specs/features/home-network-sharing/tasks.md` (31 tasks, all ticked), measurements `specs/features/home-network-sharing/experiments.md` (sections A to J). The release hold above stands by owner decision: no release containing this feature goes out until Features 76, 77 and 80 are merged. Feature 76 has since merged (2026-10-10), so the hold now waits on Features 77 and 80. (Update, 2026-10-10: Feature 77 has since merged, so the hold now waits on Feature 80 only; remaining home-network features 78, 79 and 80, all Not started.) (Update, 2026-10-11: Feature 80 has since merged, PR #267, so every condition of the release hold on home-network sharing (Features 76, 77 and 80 merged) is met. Nothing has been released: the owner merges the release PR by hand and no release has been cut. Remaining home-network features: 78 and 79, Not started.) Until Feature 77 a paired device can lock, unlock and delete projects; it can now be revoked from the desktop app (Feature 76), where this record first said it could be removed only by deleting `device-credentials.json` by hand. Verified, per the experiments record and the spec: frontend suite 5955 passed, 1 skipped, and desktop suite 250 passed on `0103e07a` (experiments H); `pnpm test:sharing-smoke` against a built server, 90 entries, 28 checks, 0 failures; an independent security review found no way for an unconfirmed client to read or change project data or pass as the window, and its fixes are FR-31 to FR-35 (accepted findings H1, M1, L2 to L5 are listed in the spec's Security review section); the owner's manual run on an unpacked desktop build with an Android phone (Chrome 153) showed pairing by IP address, the wrong-code message, the burned-code refusal after five wrong attempts, an edit made on the phone appearing on the desktop, pairing surviving a full browser restart and an app restart, and sharing off blocking the phone (experiments J; reported by the owner, no output pasted). Not verified: no forged request from a second device was sent against the finished gate (the same requests were sent from the host to its LAN address, experiments H, which is not a second-device result); the items experiments J lists as not exercised (code expiry after 5 minutes, forged `X-Forwarded-For` from the phone, corrupt credential store, hosted-auth variables set, upgrade survival, lock, unlock and delete from a paired device, window image and font requests, a request log of the window under the non-loopback bind); `.local` names did not resolve on the test phone, and the gate derives its accepted `.local` name from `os.hostname()` (`Jedais-MacBook-Pro.local` on the owner's Mac) which differed from the Mac's Bonjour name (`scutil --get LocalHostName` printed `MacBook-Pro`), so whether a device that resolves the Bonjour name would be refused was not observed (no fix task added, owner's "proceed"); the CLI suite was not run during the pipeline. After the PR opened, its QA-server test failed in CI under Node 20. Measured: `frontend/next.config.mjs` imported a `.ts` file and failed to load under Node 20.20.2 with `ERR_UNKNOWN_FILE_EXTENSION` (it loaded under 22.23.2 and 24.15.0); fixed in `0fe43651` by repeating the constant in the config with two guard tests. That the config failure was what made the CI test fail is inferred, not observed: the dev server was not run under Node 20, and the result of the CI re-run was not seen before the merge. Deviations: Tasks 14 to 21 did not always write tests before code. A defect in the `/_next/static` exemption (file names containing `..` were refused, so the pairing page did not hydrate) passed the unit tests, the smoke script and the security review, and was found only by loading the page in a browser at the exercise stage (experiments I), then fixed in Task 30. Remaining home-network features, each needing its own pipeline pass: 77, 78, 79 and 80, all Not started (76 merged 2026-10-10); Feature 77 was rewritten on 2026-10-10 at Gate 1 and Gate 2 to carry the limits work, including the two prerequisite measurements and the paired-browser experience. The owner wants the Android app as a client followed up soon after (a stated priority, not a date; OQ-74). Release hold lifted 2026-10-19 (owner decision; Features 75, 76 and 77 relabelled from "Merged, release held" to "Merged, not released"). Its recorded conditions (Features 76, 77 and 80 merged) were met on 2026-10-11. Checked before lifting it, 2026-10-19, on the standalone server at main ef1f2160: 37 forged requests against the sharing-on gate (forged window header, forged classification header, forged or duplicated device cookies, foreign or forwarded Host, cross-origin writes from a paired device, limits, path tricks) were all refused as designed; with sharing off the desktop server accepted cross-site writes and foreign Hosts (POS note_d7d147d5), fixed in PR #277 (merge c5fc6dd8) and re-measured on the standalone server, the dev desktop app and an unpacked arm64 packaged build. Not run: a signed or .dmg build, x64, a Finder launch, and the `.local` name check recorded above.

### Feature 76: See, rename and revoke paired devices — Merged, not released

**Value:** A writer can see which of their devices are paired, give each a name they recognise, and cut one off (for example a lost tablet), after which that device is refused until it pairs again.
**Vertical slice:** Data: the paired-device records Feature 75 creates gain a writer-editable name that overrides the automatic one, and a revoked state that the gate honours (or deletion of the record, a choice for the feature spec; either way a revoked credential is refused on the next request). Logic: list, rename, revoke operations reachable only from the desktop app; the gate from Feature 75 refuses a revoked credential on every route and page, so a revoked browser that is still open is refused on its next request and not only at its next pairing. Interface: a paired-devices list in the desktop app showing each device's name (and what else is useful to tell devices apart, left to the feature spec), with rename and revoke actions, delivered through the desktop bridge (`electron/src/preload.ts`, `frontend/src/lib/desktop-bridge.ts`, both opened and read). The revoked browser sees the pairing screen from Feature 75 again.
**Requirements covered:** None of its own: it delivers the paired-device list, rename and revoke part of the device-confirmation requirement, which the sharing-and-pairing feature owns (this document's Open Questions record the schema mechanic and the precedent).
**User stories:** US-27
**Depends on:** Feature 75
**Branch suggestion:** feat/paired-device-management
**Notes:** Needs Feature 75's device records and gate, so it cannot ship first. It is separable from Feature 75 because a writer can pair and use a device without it, but a writer who shares without it has no way to cut a device off from the desktop app; see the interim-exposure note in Feature 75. Release hold (owner decision, Gate 2, 2026-10-09): build order is not release order; Feature 75 may merge to `main`, but no release containing it goes out until this feature and Features 77 and 80 are merged (this feature has since merged; see the status record below). Where revocation is enforced is the part that matters: it has to be checked on every request, not only at pairing time, or a revoked device keeps working until it re-pairs. That is a requirement of FR-67 as written; whether the gate re-reads the store on each request or caches is a design choice for the feature spec and has not been looked at. Nothing here was run (as drafted). Status, 2026-10-10 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. Implemented on branch `feat/paired-device-management`, merged as PR #264, merge commit `44ae6ca3`; the branch tip merged was `2566b566`; merged 2026-10-10. This feature has no release of its own to hold: the hold is Feature 75's, on home-network sharing as a whole, and with 76 merged it now waits on Features 77 and 80 only. (Update, 2026-10-10: Feature 77 has since merged, so the hold now waits on Feature 80 only; remaining home-network features 78, 79 and 80, all Not started.) (Update, 2026-10-11: Feature 80 has since merged, PR #267, so every condition of the release hold on home-network sharing (Features 76, 77 and 80 merged) is met. Nothing has been released: the owner merges the release PR by hand and no release has been cut. Remaining home-network features: 78 and 79, Not started.) A paired device can still lock, unlock and delete projects until Feature 77. Feature spec `specs/features/paired-device-management.md`, task list `specs/features/paired-device-management/tasks.md` (15 tasks, all ticked), measurements `specs/features/paired-device-management/experiments.md`. Owner decisions: Gate 3 (2026-10-09), revoke deletes the device record, the desktop main process writes the credential store under the server's lock protocol, no revoke-all, no repair of a corrupt store from the UI. The Gate 4 answer that the corrupt-store message shows only when sharing is on or pending was SUPERSEDED on 2026-10-10 (OQ-17, Task 15): an unreadable store is flagged in every sharing state. Also 2026-10-10: the wording stays as built for now and the copy is reviewed in one pass once the related sharing features are in; the pending-restart wording question (feature spec OQ-18) is deferred to that pass and remains open. Verified, per the records: suites against main (frontend 6035 passed, 1 skipped at `2509dd19`; 6046 passed, 1 skipped reported by the implementing agent after Task 15, not re-run by the lead; desktop 322; CLI 144 in the main checkout; lint and knip unchanged from baseline); a real revoke against a built server was refused on the first request on all 88 gated routes and pages, with a second device unaffected; in two real browsers the revoked one reached the pairing screen 3.2 s after the revoke, text typed after the revoke was not saved (hence the revoke dialog's warning sentence, "Unsaved edits on that device will be lost."), and the cookie was replaced on re-pair; the real Electron window, driven by script in development mode and in an unpacked build with seeded devices and sharing off, showed the list, blank-rename refusal, rename, the revoke dialog and focus, revoke, the 5 s poll and the unreadable-store message; and, reported by the owner from their own unpacked build and Android phone, no output pasted, pairing, the phone appearing in the list, revoking the connected phone, and pairing again. Not verified: a rename surviving an app restart in the real app; revoke with sharing off against a really paired phone; the unreadable-store message with sharing on or pending in the real app (component tests only); Node 20 locally (none on the machine; the lead did not see the PR's CI result before the merge); the owner's sign-off of the working-copy strings. Known limits: revoke takes effect on the device's next request (an idle revoked browser made no request for 45 s and kept showing its page); no last-used column, no revoke-all; devices from the same browser share an automatic name. Deviations and incidents: the revoke dialog stays open until the revoke finishes (the task text said it closes on confirm); during the exercise the lead's script stopped the owner's running desktop app (it killed every listener on port 3000; the script was then changed to refuse to run when the port is in use); one exercise run was invalid because it loaded pages from the owner's running app instead of the new code. Found outside this feature, recorded and not fixed: in development mode the app's `next dev` server listened on all interfaces with sharing off and answered a request to the host's own LAN address with project data (sent from the host, not a second device; whether it predates Feature 75 was not checked).

### Feature 77: Limit what a paired device can do — Merged, not released

**Value:** A writer who shares their projects chooses, in the desktop app, which of five things a paired device may do (delete a project, unlock, lock, change encryption, permanently delete from the Trash), every one of them restricted until the writer switches it off; a paired device cannot be tricked into sending the workspace passphrase over the network while unlocking is restricted; and a writer on a paired device sees a limited control disabled with the reason, and is told when an action is refused, instead of nothing happening or a project appearing to be deleted.
**Vertical slice:** Start: two measurements, then a stop, before anything depends on them (the shape Feature 75 used, and the shape of Features 57 and 63): (i) against the standalone build and against `next dev`, a POST with a JSON body to a gated route, observing what `x-getwrite-classification` the handler receives for a desktop-window, a paired, an unpaired and a sharing-off caller, including a request carrying a forged copy of the header (Feature 75's experiments section E measured this for a GET only; the gate is `frontend/src/lib/sharing/gate.ts` and the header constant is in `frontend/src/lib/sharing/classify-request.ts`); (ii) `enable` and `export` sent to `frontend/app/api/encryption/route.ts` with a traversal `projectId`, against a throwaway workspace, observing whether it is rejected before a path is built (triage found no validation by reading, `frontend/app/api/encryption/route.ts` ~195-204 and `frontend/src/lib/models/crypto/enable-encryption.ts` ~118; not run). The results go in an experiments file under `specs/features/` and are reported to the owner before the dependent work starts. Data: a limits store, one set of five on/off settings for all paired devices, in a file of its own beside the other sharing files (never inside `device-credentials.json`, whose schema would make an older build read a newer file as corrupt; read, not run), where absent, unparseable or unreadable means all five on; where the file lives and how the server finds it is carried to the feature spec. Logic: (1) the main-side writer follows the shape Feature 76 gave `device-credentials.json` (`electron/src/sharing/device-store-writer.ts`, read-modify-write under the lock protocol, with `electron/src/sharing/device-ipc.ts` as the model for handlers whose first statement is the sender check, registered in `electron/src/main.ts` beside the `getwrite:sharing-list-devices` handlers and exposed through `electron/src/preload.ts` and `frontend/src/lib/desktop-bridge.ts`); (2) one shared check in `frontend/src/lib/sharing/` beside `classify-request.ts` that reads the classification the gate forwards in `CLASSIFICATION_HEADER` and re-reads the limits file on every request (no cache, so a change applies on the next request with no restart), and fails closed: anything other than the sharing-off or desktop-window classification, and a missing or unparseable classification, is a paired device subject to the limits; (3) that check called at the route, before any work, in `frontend/app/api/project/delete/route.ts` (Limit project deletion), in `frontend/app/api/encryption/route.ts` per action (`unlock` and `resume` under Limit unlocking; `lock` under Limit locking; `enable` on a project with the existing workspace key and `export` under Limit encryption changes; `enable` with a non-null passphrase, which creates the workspace keyring, always refused with no setting), and in the Trash purge route `frontend/app/api/project/[project-id]/trash/purge/route.ts` (Limit permanent deletion, for both a list of ids and `all: true`); the soft-delete routes (`frontend/app/api/resource/[resource-id]/delete/route.ts`, `frontend/app/api/folder/[folder-id]/delete/route.ts`) are untouched; (4) a refusal is a plain-message response that is not the gate's "not paired" response, so a refused device is not sent to the pairing screen; (5) one new read route that tells a caller whether it is a paired device and which of the five limits are on, gated like every route and added to the route enumeration tests (the walks over every `route.ts` that Features 75 and 76 keep); (6) conditional, built only if measurement (ii) shows a traversal value is accepted: the encryption route validates `projectId` for `enable` and `export` with the same fail-closed UUID guard the project-scoped routes use (`validateProjectId` and `respondInvalidProjectId` in `frontend/src/lib/models/project-path.ts`) before `enable-encryption.ts` joins it into a path, with a test that a traversal value is refused; if the value is rejected, the task is closed with a recorded "not needed". Interface: in the desktop app only, five switches in App Settings (`frontend/components/AppSettings/AppSettingsDialog.tsx`, in the sharing section `frontend/components/Sharing/SharingSettings.tsx`), each naming the limit with on meaning restricted (working labels: Limit project deletion, Limit unlocking, Limit locking, Limit encryption changes, Limit permanent deletion), the unlock switch carrying a plain warning beside it that switching the limit off means the passphrase is typed on the paired device and sent over the unencrypted connection, where others on the network could record it, and a recorded passphrase also unlocks the files at rest (a stolen disk or backup); `INTERIM_EXPOSURE_NOTE` in `frontend/components/Sharing/sharing-copy.ts` is replaced by text that reflects the actual state of the limits. The desktop window shows the limits in App Settings only. In the paired browser: (a) the safety requirement: while unlocking is limited, no passphrase prompt is offered, meaning the unlock dialog that `frontend/components/Start/StartPage.tsx` opens automatically for a locked workspace (`frontend/components/common/UnlockModal.tsx`) and the passphrase entry in `frontend/components/preferences/EncryptionSettings.tsx` and `frontend/components/common/EncryptionSetupModal.tsx`; the prompt is shown only after the read route has positively said the caller is exempt or the limit is off, so a failed or pending read shows no prompt; (b) controls for the limited actions shown disabled with the reason, not hidden (project deletion in `frontend/components/Start/ManageProjectMenu.tsx`, lock and the unlock entry, the project encryption panel in `frontend/components/preferences/ProjectEncryptionPanel.tsx`, and the Trash purge and empty-Trash controls in `frontend/components/WorkArea/Views/TrashView.tsx`); (c) the three behaviours read in the current client that must not survive, each stated as read, not run: a refused lock does nothing visible, a refused resume does nothing visible (`frontend/src/store/cryptoSlice.ts` has no rejected case for either), and project deletion removes the project from the list and shows "Project deleted" before a generic failure (`frontend/components/Start/ManageProjectMenu.tsx` ~65-81); the fix makes each refusal visible and puts the project list back to what the server holds. Never switchable, always refused: creating the workspace passphrase (no recovery path, ADR-022). Unchanged: the desktop window's abilities; a paired device deleting a resource or folder to the Trash; changing sharing, pairing codes and the device list, which stay desktop-only bridge calls with no network route.
**Requirements covered:** None of its own: it delivers the five desktop-side capability limits, their defaults, scope, enforcement, the unlock warning, and the paired-browser experience of them (disabled controls with the reason, visible refusals), which are the capability-limits part of the device-confirmation requirement and the lock-and-unlock part of the transport-and-encryption requirement, both owned by the sharing-and-pairing feature.
**User stories:** US-27
**Depends on:** Feature 75, Feature 76
**Branch suggestion:** feat/paired-device-limits
**Notes:** Rewritten 2026-10-10 twice. Gate 1 (Owner decision, Gate 1, 2026-10-10 (the pipeline lead's recommendation, accepted by the owner: 'Take your recs')): the earlier text (one opt-in setting for project deletion, and lock, unlock, sharing and pairing fixed as refused) is superseded in part by five limits, each a switch, all on by default. Gate 2 (Owner decision, Gate 2, 2026-10-10 (the pipeline lead's recommendation, accepted by the owner: 'Your recs')): the breakdown shown to the owner had four features (77, 81, 82, 83) and five numbered decisions, and the owner accepted them; this entry is the result, and Features 81, 82 and 83 were removed from the list (they were added earlier the same day and never committed). The five decisions: (1) the two measurements (formerly Feature 81) are folded into this feature as its first tasks, followed by a stop: results are reported to the owner before dependent work starts, the same shape Feature 75 used. (2) The paired-device experience (formerly Feature 83: limited controls shown disabled with the reason, and the three failure-visibility fixes) is folded in; nothing misleading ships separately. (3) The `projectId` validation fix for the encryption route (formerly Feature 82), if the measurement shows the flaw is real, is inside the release hold; the mechanism that gives effect to that with the least process is the pipeline lead's choice and is labelled as such: it is a conditional task inside this feature's task list, built only if measurement (ii) shows a traversal value is accepted and closed with a recorded "not needed" otherwise, so there is no separate feature. It remains a defect independent of sharing (OQ-85 in the product spec), and the feature spec and task list should say so. (4) The paired browser learns whether it is a paired device and which limits are on through one new read route, gated like every route and added to the route enumeration tests. (5) The desktop window shows the limits in App Settings only. Why one feature: server enforcement, the limits store with its desktop switches, the read route, the passphrase-prompt suppression and the visible-refusal behaviours are kept together because none is safe or honest to ship without the others. Enforcement without the store has nothing to read; the store without enforcement is a switch that does nothing; enforcement without the read route and the prompt suppression leaves a limited phone still offered the passphrase prompt on a locked workspace (the Start page opens it automatically; measured for a plain browser in `specs/features/home-network-sharing/experiments.md` section D), and a server refusal alone does not keep the passphrase off the unencrypted network, because the passphrase has been typed and sent by the time the server refuses; and enforcement without the disabled controls and visible refusals ships a default install (every limit on) in which a lock refusal is silent and a refused project deletion shows "Project deleted". Release hold: the hold on home-network sharing is on Features 77 and 80 being merged, as the owner set it. Because the paired-device experience and the conditional `projectId` task are inside this feature, they are inside the hold with no further condition added. No condition is added by the defaults: shipping with every limit on by default satisfies the hold as stated. Consequence of all five defaults being on: after upgrading, an already-paired device can no longer delete projects, lock, unlock, change encryption or purge until the writer switches that limit off at the desktop; Features 75 and 76 are merged and unreleased, so only the owner's own builds are affected. Hard ordering inside the feature: the two measurements come first and are followed by a stop; the limits hold only if measurement (i) shows the classification reaches a POST route handler in both the standalone build and `next dev`, with a forged client copy replaced; if it does not, the design here (enforcement at the route) changes and the owner is told before dependent work (OQ-85 in the product spec). A third observation is context only and is not in this feature's scope: on 2026-10-09 a `next dev` server under the desktop app was seen listening on `*:3000` with sharing off and answering a request to the host's LAN address with project data (`specs/features/paired-device-management/experiments.md`, "Exercise in the desktop app"); it is tracked separately and no fix is pulled in here. The test with two paired clients across an unlock and a lock, which Feature 75's Notes left to a later task list, belongs in this feature's task list. Because the unlock switch off sends the passphrase over plain HTTP, the warning copy is part of the feature, not polish; the other copy is for the single copy pass the owner deferred. Open points carried to the feature spec: where the limits file lives and how the server finds it. Nothing here was run. Status, 2026-10-10 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. PR #266, merge commit `fc730749`, branch `feat/paired-device-limits`, branch tip merged `8e157dd7`, merged 2026-10-10. With this merged, the release hold on home-network sharing waits on Feature 80 (port change) only; remaining home-network features 78, 79 and 80, all Not started. (Update, 2026-10-11: Feature 80 has since merged, PR #267, so every condition of the release hold on home-network sharing (Features 76, 77 and 80 merged) is met. Nothing has been released: the owner merges the release PR by hand and no release has been cut. Remaining home-network features: 78 and 79, Not started.) Feature spec `specs/features/paired-device-limits.md`, task list `specs/features/paired-device-limits/tasks.md` (31 tasks, all ticked), measurements `specs/features/paired-device-limits/experiments.md`. Built: five limits (delete a project, unlock, lock, change encryption, permanently delete from the Trash), each a desktop switch on by default, global, effective on the next request; creating the workspace passphrase from a paired device is always refused; enforcement is at the route, answering 403 with a limit key; a missing or unparseable classification header is refused for every limited action. Owner decisions, 2026-10-10: the limits and their defaults; the encryption `projectId` fix shipped separately ahead of this feature as PR #265; a missing or unparseable classification header is refused unconditionally, whatever the limits file says (the feature spec's FR-10 wording was aligned); the old Feature 75 test allow-list of files importing the sharing library was updated to the four limited route files plus the limits read route; step 7 of the manual check (creating the passphrase from the phone) was accepted on scripted coverage; the copy is reviewed later in one pass. Verified, per the records: a built-server script against both the standalone build and `next dev` (195 checks, 0 failed, in each of the final standalone and `next dev` runs; every limited action covered); Playwright Chromium real-browser checks (107 checks, 0 failed); two paired clients across an unlock and a lock (31 checks, 0 failed); the real Electron app driven by script in development mode and in an unpacked build (167 checks each, 167 passed); and, reported by the owner, not observed by the pipeline, a manual check on the owner's Mac with an Android phone as the paired browser (steps 1 to 6, 8 and 9 "seem to work", no per-step detail; the unlock-off confirmation dialog appeared and was accepted as is). Suites: frontend 6434 passed, 1 skipped, reported by the implementing agent at the last change and not re-run by the lead; desktop 384; CLI 144; sharing smoke 91 enumerated entries, 28 checks, 0 failures; e2e 214 passed, 1 skipped, run locally by the lead after the Storybook fix. Defects found and fixed in the run: the pairing page reloaded itself for an unpaired device (found at the owner's manual check; 792 main-frame navigations in 8 s before the fix, 2 after, measured by the lead in Playwright; what the 2 are was not separated); a blank Start page when the limits read failed; revision-refusal wording that was inaccurate; dialog text with no colour class, black on the dark chrome background (measured: unclassed text under `<body>` is rgb(0, 0, 0) in both themes; which element the owner saw was not established); and Storybook had no limits provider, after which the e2e check on the PR failed. The failing e2e names were not seen, so the Storybook cause is inferred, and the lead did not see the CI result of the re-run before the merge (the owner reported afterwards, 2026-10-10, that CI passed). Not verified: Node 20 locally (none on the machine); creating the passphrase from the real phone (the owner's workspace already had one); the blank-Start-page, revision-wording and dialog-colour fixes re-measured in a browser; the rendered dark-mode dialogs; the sharing switch with restart in the scripted desktop runs. Known limits: an open page does not update on its own when the desktop locks or unlocks (7 s measured without an update); after a lock the paired browser's editor showed "Autosave failed", and the failing request was the save (PATCH of the revision, 404 `Revision ... not found`), cause not established, tracked separately. Deviations and incidents: the e2e suite was not part of the pipeline's final suites; no scripted check loaded the pairing page unpaired (their devices were paired by a helper or by a POST from Node), which is why none showed the reload; the passphrase gate sits in the Start page component, not in the page file. Found outside this feature, filed as notes and not fixed: soft-deleting a folder that contains folders returned HTTP 404 in the built-server script on both builds (not run on `main`, cause not established; the script's folder check therefore uses a leaf folder); `ConfirmDialog` details have no default text colour, so details text of other callers with no colour class would get the same black (callers not audited).

### Feature 78: Two-client save behaviour — measurement — Merged, not released

**Value:** Before the product says anything to a writer about what happens when two of their own devices save the same resource, this establishes what the save path actually does, by running two clients against one resource. The statement the requirement wants (Feature 79) can only be true if this measurement shows it.
**Vertical slice:** A measurement-only pass, producing no behavior change: a test that runs two clients against one resource through the save path and observes which save the resource ends up holding, on disk and when reopened. A keyword search of the revision save path found no conflict check, and nobody has run two clients, so what the code does today is unmeasured; this requirement does not assert the current code already behaves as last-save-wins. The deliverable is the measurement and a recorded result (where it is recorded is left to whoever picks this up), with no product statement. Seams: the revision save path. (Updated 2026-10-11: the original text said these seams were named in the project's own notes and not opened. They were read for the feature spec `specs/features/two-client-save-measurement.md`, read, not run: the autosave hook `frontend/components/WorkArea/useCanonicalAutosave.ts` (2500 ms debounce, then `patchRevisionContent` in `frontend/src/lib/api/resources.ts`); `PATCH /api/resource/revision/<id>` in `frontend/app/api/resource/revision/[resource-id]/route.ts`; `updateRevisionInPlace` in `frontend/src/lib/models/revision-core.ts`; and the sidecar path `updateSidecarCore` in `resource-crud-core.ts`. By that reading the save sends the editor's whole document with no base revision, `updatedAt` precondition or ETag, and no lock covers the save as a whole; see the spec's section "Save path, as read". Nothing was run.)
**Requirements covered:** None of its own: it delivers the two-client test that the home-network sharing requirement makes a prerequisite of the last-save-wins promise, a part of that requirement owned by the sharing-and-pairing feature.
**User stories:** None
**Depends on:** none
**Branch suggestion:** n/a — measurement only, no feature branch expected
**Notes:** Split from the earlier single "measured and stated" feature at Gate 2, 2026-10-09 (owner decision; see Open Questions): the measurement is this feature and the in-product statement is Feature 79. FR-66 makes the passing test a prerequisite: "MUST pass before the promise is treated as met". If the test shows something other than last-save-wins (for example a lost update that is not a clean last write, or a failed save), the promise cannot be stated as written; what follows is governed by the carried default in Open Questions (ship sharing without the statement and record the gap) until the owner decides after the measurement. FR-32's conflict model for hosted sync is separate and unaffected (OQ-68). The Android app as a second client is out of scope (OQ-74), which is distinct from the owner's note below. Owner's note, recorded verbatim (Gate 2, 2026-10-09): "the second device will have to be a mobile device". Pipeline lead's observation, not an owner decision: a mobile device can only reach the server if it is reachable on the network, which the desktop app's loopback bind (`electron/src/main.ts:150`, read not run) prevents today. So how the measurement is run with a mobile second client before Feature 75 exists (for example a development server deliberately bound to the network against a throwaway projects directory, or waiting for Feature 75) is an open point for Feature 78's own spec, and is not settled here. "Depends on: none" describes the measurement's logic; that open point may change it. Nothing here was run. Update, 2026-10-11 (a) the remark above that a mobile device cannot reach the server because of the loopback bind predates Feature 75 and is stale: home-network sharing is merged on `main` (Features 75, 76, 77 and 80; the desktop server is on port 7340, merged and not released), so a paired phone can reach the desktop server and "Depends on: none" stands; (b) Owner decision, Gate 0, 2026-10-11: this feature is a measurement only, with two required parts, scripted runs with two real browser clients (Playwright Chromium) for exact, repeatable sequences and timings, and the owner's Android phone in Chrome as the real second device, an owner step an implementor cannot do; no product behaviour change and no in-product statement (Feature 79); (c) the seams were read for the feature spec (see the vertical slice above), replacing "neither was opened". Feature spec: `specs/features/two-client-save-measurement.md`. Status stays Not started. Update, 2026-10-11 (scripted result, recorded in `specs/features/two-client-save-measurement/experiments.md`, sections "Result against the definition", "Findings", "Not run"; measured, 634 kept repetitions, Node 24.15.0, built standalone server, two headless Chromium clients; **every scripted request was host to itself, not a second-device result**): against the owner's definition (last = last processed by the server; all four stores hold exactly the last-processed client's whole document, never a mix; both clients show it after a reload) S1 (in turn) passed 3 of 3, S3 (stale client, six variants) passed 18 of 18, S4 (idle then resume) passed 3 of 3 at 60 s and in one run at 10 minutes (stability not assessable from one run), S5 (control, different resources) passed 9 of 9, and S2 (near-simultaneous, 30 variants x 20 repetitions) gave 519 PASS, 44 FAIL and 37 UNSTABLE of 600: all 400 repetitions with a release gap of 15 ms or more passed, and the 200 repetitions at gap 0 and gap 5 ms did not (36 `content.bin` mixes, 8 stores that disagreed, 37 with the order not determined by an `updatedAt` tie). By the spec's FR-32 rule the prerequisite FAILS because S2 did not pass in a stable way; a conditional reading (passed when the saves were 15 ms or more apart or sequential) is a conditional pass and the statement stays FAIL; a FAIL triggers the owner's decision and does not make it. The findings (a) to (g) are recorded with counts and no verdict: a stale editor's keystroke save left none of the other device's text in any store (S1, S3, S4); no save was sent without typing (0 of 1283 content saves; no real visibility change was produced); the overwritten device was told nothing on the surfaces named (the device that overwrote was shown a backup notice when a backup was made); overwritten text survived only in an "Auto-backup before large deletion" revision when the replaced document was long and the replacing one short (12 of 12 in S3's long variants, 108 in S2) and otherwise left no recoverable copy (S1, S3 (i) and (iii), S4, 448 of 556 single-document S2 repetitions); an overwritten editor kept showing text the server no longer held until a reload; the writing log counted the first-processed client's words as deleted for the later save except at gap 0, where both entries showed 0 deleted; no failed save in 1283 saves. Not run: S6, S7, S8, S10 (held until after the stop, run only at the owner's request), S9 (cut), the 60-minute idle, real mobile tab suspension or an OS-level visibility change, other browsers and phones, encrypted projects. **Phone step (2026-10-12, reported by the owner; ONE run, one phone, a Pixel 7 Pro with Chrome 154, one network; the pipeline did not watch the screens):** each device's save replaced the other's text with no message reported, an open page did not change until reloaded (including after about five minutes with the phone's browser in the background), and the stores read afterwards (throwaway project only) all held the last save's whole document, `BASE alpha bravo charlie P2 D3`, with one revision and no backup; the writing-log counts are consistent with a phone save having been processed and then replaced about 60 s later by the desktop's. Three log entries within 18 s in one step are not accounted for. **Owner decision at the stop (2026-10-12): "Keep as recorded for now."** The carried default stands: sharing ships without the "last save wins" statement and the gap is recorded; Feature 79's sentence is not written; no save-path change or changed promise is started. The owner's stated goal is better sync later. The held scenarios (S6, S7, S8, S10), the cut S9 and a pinning test were left to the pipeline lead, who did not run or write them; they are inputs for the later sync work. Record: `specs/features/two-client-save-measurement/experiments.md`. Status, 2026-10-14 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. PR #268, merge commit `93f93e51`, branch `feat/two-client-save-measurement`, branch tip merged `45a3d83d`, merged 2026-10-14. CI on the PR: passed, as reported by the owner; the lead did not see the result. Measurement only: no product code changed. After the runs, at the owner's request, five robustness findings from the owner's code review were fixed in the measurement scripts (`45a3d83d`); every recorded result was produced by the scripts as at `069fe36c`, and the three read-only S2 scripts were measured to print byte-identical output before and after (see the record's section "Scripts changed after the runs"). Filed as notes, not fixed: the `content.bin` mix at near-zero gaps with the inputs for later sync work (`note_5f0521e0`), and the project listing observation with several projects on one server (`note_3a19f55f`). Feature 79 stays Not started. Update, 2026-10-23 (owner decision to reopen the `content.bin` mix, after a data-loss audit and #291, which now also sends a pending autosave on switch and reload): the mix was reproduced without a browser or server by `frontend/tests/unit/revision-concurrent-saves.test.ts`, which calls `updateRevisionInPlace` twice at once on the real filesystem, long document first: 16, 16 and 19 of 40 repetitions left `content.bin` as the whole short document followed by the long document's tail, at the long document's length, the shape the app measurement recorded. With a per-resource lock around `updateRevisionInPlace` and an atomic (temporary file and rename) write of `content.bin`, 120 of 120 repetitions held one whole document. This settles that two overlapping in-process writes produce the mix; which of H1 to H6 it corresponds to was not mapped. The lock is per server process, so several hosted server instances are not covered. The app-level S2 harness was not re-run. Branch `fix/serialize-canonical-saves`. The last-save-wins behaviour itself (no conflict check, the overwritten device not told) is unchanged, and Feature 79 stays Not started.

### Feature 79: Last save wins — stated in the app — Not started

**Value:** A writer who has the same resource open on two of their own devices is told plainly, in the product, what happens when both save, and that statement is true because Feature 78's two-client measurement demonstrated it.
**Vertical slice:** Interface: a plain sentence in the desktop app's sharing section (the surface Feature 75 builds) saying that when two of the writer's devices save the same resource the last save wins. The sentence is shown only if Feature 78's measurement demonstrates last-save-wins. Logic and data: none beyond showing or withholding the sentence on the recorded result. What happens when the measurement does not demonstrate it follows the carried default in Open Questions (sharing ships without the statement and the gap is recorded), pending the owner's decision after the measurement.
**Requirements covered:** None of its own: it delivers the last-save-wins promise, the part of the home-network sharing requirement that the sharing-and-pairing feature owns.
**User stories:** US-27
**Depends on:** Feature 75, Feature 78
**Branch suggestion:** feat/last-save-wins-statement
**Notes:** Small follow-on. Needs Feature 75's sharing section to carry the sentence and Feature 78's recorded result to decide whether to show it. FR-66 treats the promise as met only after the test passes, so this feature must not ship the sentence on an unmeasured or failing result. The Q8 outcome (change the save path, change the promise, or ship without the statement) is not decided here. Nothing here was run.

### Feature 80: Change the desktop server's default port — Merged, not released

**Value:** The desktop app's bundled server stops using port 3000, a common default that other local software also uses, and uses a port chosen for GetWrite instead, so that a writer who shares projects on the home network (Feature 75) pairs devices against an address that is not a generic default.
**Vertical slice:** Logic: the port the desktop main process starts the bundled server on, and everything derived from it, changes from 3000 to a new value. Read, not run: the port is the constant `PORT` in `electron/src/server-config.ts` (line 11, `export const PORT = 3000;`; it moved there from `electron/src/main.ts`, which now imports it), and the window's own navigation guard and load URLs are built from it through `localOrigin(PORT)` in `electron/src/main.ts` (lines 292, 300, 304, 683, 732, 738, 745 and 782; the server's `PORT` env at line 173 and the sharing status at line 313); `BETTER_AUTH_URL` and the CSRF allowed-origin fallbacks default to `http://localhost:3000` in `frontend/src/lib/auth/auth-server.ts` and `frontend/app/api/_tenant/with-storage-context.ts`. Data: none unless the value is made configurable. Interface: none beyond the desktop window loading from the new address.
**Requirements covered:** None of its own: a port change serves the home-network sharing requirement, owned by the sharing-and-pairing feature, by fixing the address paired devices save, and no requirement in the product spec asks for it directly.
**User stories:** None
**Depends on:** none
**Branch suggestion:** feat/desktop-server-port
**Notes:** Raised by the owner at Gate 2, 2026-10-09: "I've been wanting to change it from 3000 (due to its default nature), that step may need to precede this work, and I don't know what address I want to use, but other Saboteur apps will be offset from it". Not decided, open points inside this feature: the port value itself (the owner has not chosen it; other Saboteur apps' ports will be offset from whatever GetWrite's is), and whether it is a fixed constant or configurable. Ordering (owner decision, 2026-10-09: "Port change proposal is fine, 80 before release"): Feature 75 is specified against a single port source and does not depend on its value, so Feature 80 need not precede 75's build; but Feature 80 MUST be merged before any release containing Feature 75, because a paired device saves the desktop's address (host and port), so changing the port after writers have paired devices would break their saved addresses. Together with the Gate 2 decision, the release containing Feature 75 is held until Features 76, 77 and 80 are all merged (76 has since merged, 2026-10-10). Nothing here was run. (Update, 2026-10-10: Features 76 and 77 have since merged, so the release hold waits on this feature only.) (Update, 2026-10-11: this feature has since merged; see the status record at the end of these Notes.) Owner decision, Gate 0, 2026-10-10: the desktop app's bundled server port becomes 7340 (was 3000), and Saboteur apps take blocks of ten: GetWrite owns 7340 to 7349, the next Saboteur app starts at base plus 10 (7350), and so on. This settles the port value above; whether the port is a fixed constant or configurable is still open. Screening done by the pipeline lead, stated as facts and not as guarantees: on the owner's Mac, `/etc/services` (a local copy of the registry, not the live IANA list) registers no TCP service in 7340 to 7349, 7350 to 7359, 7370 to 7379 or 7380 to 7389, while 7365 is registered in the 7360 block and 7391 to 7395 and 7397 in the 7390 block; 7340 is not among the common development defaults (3000, 4200, 5000, 5173, 6006, 7000, 8000, 8080, 8888, 9000) and lies between 1024 and 32767. That 7340 is absent from Chrome's and Firefox's restricted-port lists is from memory and was not checked against the browsers' current lists; the feature spec requires loading the app in real browsers to verify it. Feature spec: `specs/features/desktop-server-port.md`. The final suites for this feature include `pnpm test:e2e` alongside the unit suites, typecheck, lint, knip, the CLI suite and `pnpm test:sharing-smoke` (owner decision, Gate 0, 2026-10-10). Standing decisions carried from Features 75 to 77: working-copy strings are reviewed in one later copy pass; the Android app as a client is later. Status, 2026-10-11 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. PR #267, merge commit `db052756`, branch `feat/desktop-server-port`, branch tip merged `41c9a678`, merged 2026-10-11. This was the last blocker: with it merged, every condition of the release hold on home-network sharing (Features 76, 77 and 80 merged) is met. Nothing has been released; the owner merges the release PR by hand and no release has been cut, so the release is the owner's step. Remaining home-network features: 78 and 79, both Not started. Feature spec `specs/features/desktop-server-port.md`, task list `specs/features/desktop-server-port/tasks.md` (21 tasks: 19 done; Tasks 13 and 14 closed as not needed), measurements `specs/features/desktop-server-port/experiments.md`. Built: the desktop server port is the fixed constant 7340 (`electron/src/server-config.ts`), and Saboteur apps take blocks of ten (GetWrite owns 7340 to 7349; ADR-023, with a line in CLAUDE.md); a pre-start check refuses to start, with a message naming the port, when anything listens on it; a start-up identity check so the app accepts only the server it forked (the server echoes a per-launch value) and the window secret is sent to nothing, and the window loads the local origin only, until that is confirmed; and `GET /api/sharing/ready` as a fourth enumerated gate exception (exact path, GET only, after the Host allowlist), independent of the credential store. Owner decisions: 2026-10-10: the port is 7340 and apps take blocks of ten; a busy port refuses to start and there is no fallback; an ADR records the convention; the port is a fixed constant, not configurable; the hosted fallbacks (`BETTER_AUTH_URL` and the CSRF allowed-origin defaults), Feature 77's scripts and the AppImage smoke workflow are left alone. At the Task 7 stop, 2026-10-10 (the owner answered "your recs"): the dev desktop app follows the constant to 7340 and plain `pnpm dev` / `pnpm start` stay on 3000 (Task 13 closed as not needed); `device-credentials.json` is left alone with no migration code; one documentation line only for the old address, no listener or redirector on 3000 (Task 14 closed as not needed); and the widened start-up scope (the pre-start check, the identity check, the window loading only after confirmation). Also 2026-10-10: the fourth gate exception was approved by the owner. 2026-10-11: the readiness route answering under an unreadable device store, which narrows Feature 75's rule that an unreadable store refuses everything, was confirmed by the owner as "Leave as built"; the lead had made that call earlier, when the sharing smoke failed on it, and reported it as one the owner could overrule. The reason, read from the code and not separately run: the start-up poll carries no window secret, so without the carve-out the app could not start to show the unreadable-store message; the route returns a keyed hash of the caller's own challenge or a fixed error and reads nothing from the store, cookies, headers or projects. Motivating measurement on the unchanged code (Task 3, dev mode, port 3000, sharing off, one run per listener variant): with a foreign listener answering 200 the window loaded the foreign listener's page and the page was given the desktop bridge, and the window-secret header reached the listener on every readiness poll (up to 61 of 61 polls in one run). Whether released builds behave so was not checked: the packaged build was not run on the unchanged code. Verified, with the kind of check for each: a built-server script against the production standalone build on 7340, 68 of 68 checks, with the sharing smoke (`pnpm test:sharing-smoke`) at 92 entries, 34 checks, 0 failures, the lead having re-run the smoke; pairing through the page's own field and button in Chromium 148 on the unpacked production build (a wrong code gave 400 and the page's alert, the right code reached the application page, a device appeared in the app's list); the scripted real Electron app in dev mode, 61 of 61 checks, and on the unpacked build, 71 of 71 checks (as reported by the implementing agents), including the window on `http://localhost:7340`, nothing listening on 3000, and the displayed addresses ending `:7340`; busy port in three listener shapes (127.0.0.1 only, all interfaces, `::1` only) in both dev mode and the unpacked build (sharing off), where the window showed the refusal message naming 7340 and the listener received 0 requests, so no readiness poll and no window-secret header reached it; the unpacked build with sharing on and an unreadable `device-credentials.json`, where the app started and showed the unreadable-store message with the file's location; the owner's Android phone, reported by the owner and not observed by the pipeline: still paired on the new port, edits worked, and the old `:3000` address failed; and the suites against the baselines recorded at the start (frontend 6468 passed 1 skipped against 6434 passed 1 skipped, desktop 488 passed against 384, CLI 144 unchanged, e2e 214 passed 1 skipped unchanged, typecheck and lint unchanged, knip compared by set), as reported by the implementing agents, the lead having re-run the desktop suite and the sharing smoke. Every scripted browser request came from the host machine to its own LAN address and is not a second-device result. Not verified: Node 20 and 22 locally; the lead did not see the PR's CI result before the merge (the owner reported afterwards, 2026-10-11, that there were no CI issues on the PR); browsers other than Chromium (the restricted-port lists of Chrome and Firefox were never checked, and the statement that 7340 is absent from them remains unchecked memory); the sharing toggle with a restart in scripted runs (sharing was seeded on); a busy port with sharing on; pairing from scratch on 7340 from the phone (the phone was already paired); which browser the phone used; what the phone displayed for the old address; the second `/pair` navigation in the production build, whose cause was not established. Known limits: a relaying local process and anything that can read the server's environment are not closed by the identity check; a dev desktop app and a packaged app both want 7340 (whether the two can otherwise run together was not measured); browser storage (`localStorage`, `sessionStorage`) is per port, measured separate in Chromium. Correction: before Task 5 the lead told the owner that a paired device would have to pair again after a port change because the cookie "belongs to the host and port"; that was wrong for Chromium (Task 5: one host-only cookie, accepted on a second port against the same store) and for the owner's phone, which stayed paired. Deviations and incidents: the verification wave halted twice, once on an out-of-date smoke expectation (Task 15, the readiness route under a corrupt store) and once on dev-mode pairing (Task 16); the pairing check moved to the production build, with the build task (18) run ahead of the dev-mode task (17); one desktop test was red on the tip after the build wave (a source-text guard rejecting the port-check wiring line) and was rewritten to be independent of formatting, `fde5ef69`, before verification, the cause of the orchestrator's differing count not being established; an agent's script left two servers running once and they were stopped by pid; the packaged app appended lines to the owner's real log folder (`~/Library/Logs/getwrite-electron`) during scripted runs, which `--user-data-dir` does not move. Found outside the feature and filed as notes, not fixed: in dev mode the page's own pairing form did not pair with sharing on (4 of 4 runs, the input emptied and the page stayed on `/pair`; cause not established, and not run on `main`, so whether it relates to the port change is unknown; it did not occur on the unpacked production build); the Start page showed two "Sharing is on" address sections for one address (cause not established); and a project folder without `project.json` was skipped at listing in the owner's projects directory (`ENOENT`, cause not established).

### Feature 81: User handbook — structure and the existing pages absorbed — Merged, not released

**Value:** A writer (and a maintainer of a repository that publishes GetWrite's online documentation) gets one navigable handbook at `docs/user/handbook/`, with a contents page, a stable file per topic and a "verified against version or commit" line on every page, built from the user pages GetWrite already has, so there is a single written source of user documentation and a place for every later slice to add to.
**Vertical slice:** Content and structure only (no app code, data or interface): (1) the handbook directory with an index file serving as the contents and organised into parts a reader can navigate individually; (2) the portable format defaults: plain Markdown, one kebab-case file per topic, minimal YAML front matter (`title`, `order`, `summary`), relative links only, images in an `images/` folder beside the pages and linked relatively, consumers reading from a release tag and not from `main`; (3) the existing `docs/user/*.md` pages (and `docs/user/editor/`, `docs/user/views/`) moved or merged into the handbook, with short stubs left at the old paths and the links that point at them (`README.md`, `docs/user/installing.md`) kept working; (4) each absorbed page checked against the running app or its source and given its "verified against version or commit X" line, a statement the app does not bear out corrected or removed, and a behaviour nobody has measured not stated as fact. Read, not run, from the repository on 2026-10-14: `docs/user/` holds 21 Markdown files (945 lines by `wc -l`: `compiling`, `features`, `installing`, `metadata-queries`, `metadata`, `project-configuration`, `project-types`, `resource-tree`, `resources`, `revisions`, `search`, `start-page`, `writing-log`, `editor/headings`, `editor/settings`, `views/data`, `views/diff`, `views/entity-relationship-graph`, `views/entity-roster`, `views/organizer`, `views/timeline`), no handbook directory exists, and `README.md` links to `docs/user/installing.md` at lines 12 and 20. The in-app help (`frontend/components/help/help-content.ts`) is left alone and is a known, separate source, not covered by the single-source rule.
**Requirements covered:** FR-69
**User stories:** US-28, US-29
**Depends on:** none
**Branch suggestion:** feat/user-handbook-foundation
**Notes:** Owns the handbook requirement as a whole in this document's coverage check, because the structure, the format and the single-source rule are what the other four slices add to; Features 82 to 85 deliver the remaining parts and carry none of its requirement IDs. Why this is the first slice and ships alone: after it the handbook exists, is navigable and consumable, and everything in it is accurate, even though it covers only what the old pages covered. Settled, not reopened (Owner decision, Gate 1, 2026-10-14; OQ-86, OQ-87, OQ-90): absorb and leave stubs; portable defaults; the verified-against line on every page. One boundary read from the repository, not run: `docs/user/features.md` currently carries a "Home-network sharing (not yet released)" paragraph; the handbook's main parts must not describe an unreleased feature, so this slice leaves that paragraph out of the main parts and Feature 84 writes the Upcoming page that replaces it (between the two the unreleased paragraph is simply not in the handbook). Risk: the work is checking, not moving. The old pages were not verified at the time they were written (not checked here), so each one is a small verification job, and the slice is as large as that checking; the bounded alternative is the carried default in Open Questions. Owner decisions, Gate 2, 2026-10-14: this slice verifies ALL 21 absorbed `docs/user/` pages in one slice, with no split into 81a/81b; any statement that cannot be verified is dropped, not shipped; every page carries its verified-against line. The verified-against line is the app version from root `package.json` plus the base commit the page was checked against, not the PR's own commit (unknowable inside the PR); at the time of reading the version was 2.2.0 everywhere (`.release-please-manifest.json`, root/`frontend`/`electron` `package.json`, top `CHANGELOG.md` entry dated 2026-09-24) and changes only at release, so for unreleased code the line reads like "app version 2.2.0 plus unreleased changes up to commit X" (the triage's suggested wording, medium confidence; this slice defines the final form). Nothing here was run. Status, 2026-10-15 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. PR #269, merge commit `8dcebca4`, branch `docs/user-handbook`, branch tip merged `8616dca7`, merged 2026-10-15. CI on the PR: a first run failed one test outside this change (`frontend/tests/component/TrashView.test.tsx`, the empty-state check at line 900; the branch changes no file under `frontend/`, `electron/` or `cli/`, and the test file passed 10 of 10 runs locally; cause not established); the re-run passed, as reported by the owner; the lead did not see either result. Documentation only: no app code changed. Record: `specs/features/user-handbook/verification.md` (42 app defects, D-1 to D-42, recorded and not fixed). Features 82 to 85 stay Not started.

### Feature 82: User handbook — released features the old pages miss, with warnings and gotchas — Not started

**Value:** A writer learns the released features that GetWrite's current user pages do not cover, and meets each feature's warnings, limits and gotchas (work that can be lost or overwritten, actions that cannot be undone, settings that need a restart or reload) in the handbook before meeting them by surprise in the app.
**Vertical slice:** Content only, added as new topic pages (or additions to the absorbed ones) in the handbook from Feature 81, each with its verified-against line and its own warnings section. Gaps found by a keyword search of `docs/user/` against the released feature list in `CLAUDE.md` (read, grep, not run; the match is by word and so is a lower bound on coverage, not a measurement of it): the Trash (Feature 26) is named only in `features.md` and `revisions.md`, with no page of its own; encryption (ADR-022) is named only in `features.md`; status roll-up (Feature 60) has no mention; the prose diagnostics (Feature 62) are mentioned only in `metadata.md`; the word-count goals (Feature 61) only in `writing-log.md` and `project-configuration.md`; resource subtype (Feature 72) only in `metadata.md` and `project-configuration.md`; entity mention noise flagging and App Settings only in passing; the mention jump (Feature 71) only in passing. Candidate topics for the feature spec to confirm against the running app: the Trash and its purge and empty actions; locking, unlocking and the workspace passphrase; the entity features end to end (declare, aliases, mentions, noise flags, relationships, graph); the status roll-up; word-count goals and prose diagnostics; resource subtypes; resource templates; and the Scrivener, Word and (CLI-only) plain-text imports as a writer sees them. No app code changes.
**Requirements covered:** None of its own: it delivers the warnings, limits and gotchas coverage and the no-undescribed-capability rules of the handbook requirement, which the first handbook slice owns.
**User stories:** US-28
**Depends on:** Feature 81
**Branch suggestion:** feat/user-handbook-feature-coverage
**Notes:** Separable from 81 because the handbook is useful and accurate without it; it widens coverage. Open to being cut further by topic (the Trash and encryption pages are the ones where an unwarned writer loses work, and are the first candidates) if the owner wants to pick a smaller piece; the topics are independent pages. The accuracy rule binds here hardest: where a behaviour was never measured (for example the stale-sidecar save and revision-less resource cases recorded in `CLAUDE.md`'s Glossary, whose cause is not established), the page states what was observed and says it is not explained, and does not state a cause. Nothing here was run.

### Feature 83: User handbook — differences by runtime and the CLI appendix — Not started

**Value:** A writer who uses GetWrite somewhere other than the desktop app, or who runs a command-line import or repair, can find in the handbook what differs and which commands exist, and a page that is desktop-only says so.
**Vertical slice:** Content only: (1) a "Differences by runtime" part covering the hosted web mode and the CLI, with the short "Desktop only" (or similar) label added to pages where behaviour differs; (2) Android described as not yet available, and not documented; (3) a CLI appendix for the writer-facing commands only: the imports (`import-scrivener`, `import-docx`, `import-plaintext`), `repair-revisions`, `reindex`, `doctor`, `prune` and the like, drawn from the CLI section of `CLAUDE.md` and `docs/features/cli.md` (read, not run) and each checked by running it against a throwaway project at the verified-against version. Self-hosting (environment configuration for the hosted mode) stays in developer docs and is not in the handbook. Read, not run: `docs/user/` has no page on any CLI command (grep for `repair-revisions` and `doctor` found nothing there).
**Requirements covered:** None of its own: it delivers the runtime-differences and CLI-appendix decisions of the handbook requirement, which the first handbook slice owns.
**User stories:** US-28
**Depends on:** Feature 81
**Branch suggestion:** feat/user-handbook-runtimes-cli
**Notes:** Separable from 82 because it documents a different surface (commands and runtimes, not app screens) and can be written in either order relative to it. The accuracy rule means the appendix describes only what a command is observed to do; it must not repeat a CLI claim from `CLAUDE.md` that has not been run. The hosted web mode is described only as far as a writer sees it, with the audience boundary above. Nothing here was run.

### Feature 84: User handbook — the "Upcoming" section for unreleased home-network sharing — Not started

**Value:** A writer who reads the handbook can see that home-network sharing exists in the code but is not yet in a release, and what it does, without it being mistaken for something they can use today; and a consuming repository can leave it out.
**Vertical slice:** Content and a front-matter marker: a clearly flagged "Upcoming" part of the handbook holding the home-network sharing pages (the sharing setting, pairing, the paired-device list with rename and revoke, the five paired-device limits, the port the desktop server uses, and the unencrypted-HTTP warning), each page carrying the front matter marker `status: unreleased`, the verified-against line and its warnings. Source for the content: `docs/features/home-network-sharing.md` and the sharing paragraph in `docs/user/features.md` (both read, not run); every statement kept to what those records say was measured, including their "not verified" and "known limits" statements (for example that an already-open page on a paired device does not update on its own), and the last-save-wins promise left out because Feature 79's sentence is not written and the measurement did not support it.
**Requirements covered:** None of its own: it delivers the unreleased-feature decision of the handbook requirement, which the first handbook slice owns.
**User stories:** US-28, US-29
**Depends on:** Feature 81
**Branch suggestion:** feat/user-handbook-upcoming
**Notes:** Separable because it is the one slice that depends on release state, not only on the app: "released" means included in a tagged release (release-please), triage evidence of medium confidence since the release-please manifest and CHANGELOG contents were not read, and the slice should read them before writing the marker. Features 75 to 77 and 80 are merged and not released as at the last status records in this document (Feature 78, the measurement, is merged and changes no product behaviour; Feature 79 is not started). When the release is cut the marker must be removed and the pages moved out of "Upcoming", which is the upkeep rule's job (Feature 85), not this slice's. Owner decision, Gate 2, 2026-10-14: `status: unreleased` is cleared by a follow-up handbook PR opened right after the owner merges a release PR, its description naming the release version and the pages cleared (a release-checklist step, written into Feature 85). Clearing is manual because release-please config (`.release-please-config.json`) cannot edit Markdown front matter and the owner merges the release PR by hand. A CI stale-marker check is deferred. Release-please state read by triage: `.release-please-manifest.json` is `{".": "2.2.0"}` and the top `CHANGELOG.md` entry is 2.2.0, 2026-09-24. Nothing here was run.

### Feature 85: User handbook — keeping it current: definition of done and link check — Not started

**Value:** The handbook stays accurate: a later feature that changes what a writer sees cannot be finished without updating the handbook in the same pull request, and a broken link in the handbook fails a check instead of reaching a reader.
**Vertical slice:** Process and check: (1) the rule, recorded where the pipeline's definition of done lives, that any feature that changes writer-visible behaviour MUST update the handbook in the same PR; (2) the verified-against line as the evidence of accuracy, with the rule for refreshing it; (3) a link check over `docs/user/handbook/` (relative links, image paths, and the stubs left at the old paths) run in CI beside the existing workflows (`.github/workflows/` holds `frontend-checks.yml`, `electron-checks.yml`, `cli-smoke-tests.yml`, `e2e-tests.yml` and others, read, not run); (4) the release-time step that clears `status: unreleased` on the pages whose feature the release contains; (5) where the app and the handbook disagree, the authority hierarchy applies (specs, then code, then docs) and the handbook is corrected. No app code changes.
**Requirements covered:** None of its own: it delivers the currency and link-check decision of the handbook requirement, which the first handbook slice owns.
**User stories:** US-28, US-29
**Depends on:** Feature 81
**Branch suggestion:** feat/user-handbook-upkeep
**Notes:** Needs the handbook to exist so the link check has something to check, and is otherwise independent of 82 to 84; it can ship before them. The part of the rule that lives outside this repository (the pipeline's definition of done in `saboteur-labs/ai-workflows`, not read here) is not changed by this repository's PR; see Open Questions. Owner decisions, Gate 2, 2026-10-14: (1) the rule is delivered in three parts: (a) a new `docs/standards/user-handbook.md` holding the rule (a writer-visible change updates the handbook in the same PR; the verified-against line is refreshed), listed in `CLAUDE.md`'s "Key standards", plus a line in `.claude/skills/implement-feature/SKILL.md`; (b) a new `.github/pull_request_template.md` with a "writer-visible change: handbook updated" checkbox (the owner opens PRs by hand); (c) a request to the owner to change the definition of done in the external `saboteur-labs/ai-workflows` pipeline, which this repository cannot change. Only the link check is mechanically enforced. (2) The release-time step (item 4 of the slice) is a release-checklist step: after the owner merges a release PR, a follow-up handbook PR is opened right away, its description naming the release version and the pages whose `status: unreleased` it clears; a CI stale-marker check is deferred. (3) The link check is a new workflow `.github/workflows/handbook-links.yml`, filtered on `docs/user/**` and `README.md`, running a small dependency-free Node script that checks relative links only (per FR-69(g)). Nothing here was run.

### Feature 86: Query correctness — the query builder's output matches what the evaluator handles — Merged, not released

**Value:** A writer who builds a metadata query in the query builder gets the results the chip says it asks for: "includes all of" returns only resources holding every chosen value, date conditions ("in the last", "is on") return the resources they describe and reopen as the condition the writer chose, the Tags value box offers tags, and the Status list is the same list in the sidebar, the query builder and the Organizer filter, instead of an empty or wrong one.
**Vertical slice:** Logic and interface, one query path: (1) D-16, "includes all of" behaves like "includes any of" (owner decision OQ-94 (a), Gate 1, 2026-10-16: saved smart folders are not migrated or rewritten; the corrected evaluation reads the existing saved shape, `and` with one `in` child of several values, as "every listed value", and reopening one shows "includes all of"): `chipToAst` in `frontend/components/QueryBuilder/ast-chip-bridge.ts:146-150` builds `and[ in(field,[A,B]) ]` and the evaluator's `evalIn` matches on any value (READ); the intended shape, one `in` per value, is the one `tests/unit/query-evaluator.test.ts:922` uses; `operator-utils.ts` and its test at `:196` carry the wrong stub shape, and the reverse mapping at `ast-chip-bridge.ts:368` needs checking; (2) D-17, "in the last" and "is on" return nothing (owner decision OQ-92 (a), Gate 1, 2026-10-16: the saved condition keeps its amount and unit, as the builder already stores it, and the span is computed each time the query or smart folder is evaluated; no fixed date is stored; also in scope: a saved "in the last" condition reopened in the builder must show "in the last", where it is read to reopen as "is after", `ast-chip-bridge.ts:236-237`, READ, not run): "in the last" becomes `gte {amount,unit}` and `compareValues` (`frontend/src/lib/models/query-evaluator.ts:288-298`) returns null for an object, and "is on" becomes `eq "YYYY-MM-DD"`, compared by string equality against ISO timestamps (both READ); (3) D-19, the Tags value box suggests resources: `query-intrinsics.ts:123` types `tags` as `multi-resource-ref`, and `FilterChip.tsx:364-389` and `ValuePicker.tsx:641,676` take their options from `resolveResourceOptions` (HYPOTHESIS, strong); (4) D-20, the Status chip's value list is empty when `config.statuses` is `[]`: `FieldPicker.tsx:106-109` falls back to the schema options, which are empty, while the sidebar's `StatusSelector.tsx:14,21` has its own fallback list "Draft", "In review", "Published" (READ). Owner decision OQ-93 (a), Gate 1, 2026-10-16: that built-in list is offered by the sidebar Status control, the query builder's Status value list and the Organizer status filter when no statuses are configured, fixed by one shared "effective statuses" value all three read; it is not written to config and needs no migration; a resource with no status keeps today's display; D-28 is not part of this feature. The Organizer filter is a third consumer: `OrganizerView.tsx:172-176` reads `config.statuses` directly and sets its default status to `statuses[0] ?? ""` (READ, not run), so it is not in scope already and is added by this decision. Plus a check that the query builder's output matches what the evaluator handles: a test that takes each chip the builder can produce, runs `chipToAst`, and evaluates the result against fixtures, so a shape the evaluator cannot handle fails a test (none exists today). Data: none (no migration, no config write). Interface: no new control; the existing chips behave as their labels say, and the Organizer filter's Status select gains the fallback options.
**Requirements covered:** None of its own as owner: the smart-folder query requirement stays owned by the feature that shipped smart folders, because a requirement may have only one owning feature. This feature delivers that requirement's query-semantics statements as the product spec revised them after the owner's first review gate (every condition returns what its label says, "includes all of"/"includes any of", "is on", "in the last" with its reopen behaviour, the Tags value box, the Status value list and the no-migration rule). It also touches the Organizer status filter and the sidebar Status control, whose requirements earlier features own, and adds no capability.
**User stories:** US-7
**Depends on:** none
**Branch suggestion:** fix/query-correctness
**Notes:** Defects D-16, D-17, D-19 and D-20, recorded and not fixed in the Feature 81 handbook verification, `specs/features/user-handbook/verification.md` (search "D-16", "D-17", "D-19", "D-20"; D-16 appears twice there, the query defect is the one under "Metadata queries, multiple choice"). Scoped 2026-10-15 from three read-only code investigations; none ran the app. Cause labels as the scoping labels them: D-16, READ (file and line above, not tested). D-17, READ (both mechanisms). D-19, HYPOTHESIS (strong): the cause is not established; the experiment that would settle it is to change the `tags` field type in `query-intrinsics.ts` (or the picker's option source) and open the Tags chip's value box, or to log which branch of `FilterChip.tsx:364-389` is taken for a Tags chip. D-20, READ. Shared origin of D-16 and D-17 (READ): both come from `chipToAst` producing shapes the evaluator cannot handle, and nothing checks the bridge's output against the evaluator, which is why the check above is in this feature. Size estimates: D-16 S; D-17 M; D-19 M; D-20 S/M (one shared "effective statuses" value); the feature as a whole is M to L if taken together, and can be cut by defect, since D-16 and D-20 do not depend on D-17 or D-19. Owner decisions, Gate 1, 2026-10-16, in the product spec: OQ-92 (resolved, (a), evaluation-time for D-17), OQ-93 (resolved, (a), built-in list everywhere for D-20) and OQ-94 (resolved, (a), no migration for D-16); FR-10 was revised to state them. Slice width: OQ-93 adds the Organizer status filter (a Feature 24 surface) to D-20, and the reopen-as-"in the last" behaviour is added to D-17, so D-17 and D-20 are each somewhat larger than the size estimates above, which predate the decisions and were not re-estimated. Open design points for the feature spec (not product questions): (a) D-16: the fix changes what an already-saved "includes all of" smart folder returns, and the feature spec must decide how the evaluator tells that saved shape (`and` with a single `in` child carrying several values) from other `and`/`in` shapes, for example a hand-written query, so that no other shape changes meaning; where the fix lives (the bridge, or the evaluator reading the saved shape) is open, and the second option is the one that affects other shapes; (b) D-17: how the amount-and-unit form is represented in the AST and evaluated at evaluation time, and how "is on" compares a calendar day to ISO timestamps (time zone is not decided here); (c) D-20: where the shared "effective statuses" value lives and how the Organizer's default status behaves with the fallback list. The spec statement that the Organizer "resolves [a resource with no status] to the default status" is the existing behaviour and stays. Nothing here was run by the feature breakdown; code locations marked READ in this entry are reads, not runs; the defect observations are the handbook run's (web build, `logs/task5/`). Status, 2026-10-18 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. PR #271, merge commit `ad8959e0`, branch `fix/query-correctness`, branch tip merged `4ccfcc8d`, merged 2026-10-18. The first CI run on the PR failed six month-clamp cases in `query-evaluator.test.ts` under UTC (the cases built their dates before the test set its time zone); `4ccfcc8d` changed the test only, and the file then passed under UTC, Denver, Berlin, Tokyo and Sydney locally. The owner reported that CI was green on the PR after that; the pipeline lead did not see the CI result. Feature spec `specs/features/query-correctness.md`, task list `specs/features/query-correctness/tasks.md` (27 tasks), measurements `specs/features/query-correctness/experiments.md`. Rungs 2 and 3 were run (OQ-92 to OQ-94, Gate 1, 2026-10-16). Built: D-16, the evaluator reads `and` with one `in` child on an array field as every listed value, saved folders not migrated; D-17, "in the last" evaluated at evaluation time as a rolling span and reopened as "in the last", and "is on" plus before/after/between on `createdAt`/`updatedAt` compared by calendar day in the evaluating process's time zone; F-1, "starts with" anchored, escaped and case-insensitive; D-19, the Tags value box offers tags for "includes"/"does not include"; D-20, one effective-statuses value read by the sidebar Status control, the query Status chip and the Organizer status filter; the builder-to-evaluator check test. Verified: `TZ=UTC pnpm test:ci` 6967 passed, 2 expected fail, 1 skipped; typecheck passed; lint 0 errors, 393 warnings; `pnpm test:e2e` 214 passed, 1 skipped; the electron (488/488) and cli (144/144) suites; on the web build only, the behaviours listed in CLAUDE.md's Query pipeline entry. Not verified: the desktop app; "is between" and midnight boundaries in the app; the time-zone limit across machines; Enter in the Tags value box. Known failure kept by owner decision: a reference chip with a typed name matching no option saves plain text (POS note `note_219c3977`). Known limits: a hosted server or a paired device in another zone gets the server's day; Tags with "includes any of / all of / none of" keeps a plain text input. Not in this feature: D-28.

### Feature 87: Saves that lose or omit data — Merged, not released

**Value:** A writer's saved work stays what they saved: saving Body Text Styles no longer erases the Heading Styles they saved before, a Status chosen after typing does not zero the resource's word count (or the Data view's By status figures), deleting a resource clears the built-in Point of View reference other resources held to it, and the Start Page's Package view lists and compiles every resource, including those that sit outside any folder.
**Vertical slice:** Logic, four independent corrections that share a theme: a write or a read that drops data. (1) D-9: `frontend/src/lib/models/editor-config-core.ts:105` always re-sanitizes `input.headings` and the body-style save omits it, so `editorConfig.headings` becomes `{}` (CONFIRMED); `tests/unit/native-editor-config-backend.test.ts:64-67` asserts that reset as matching the pre-lift route's exact behaviour, and the fix flips that assertion. (2) D-26 and D-29: choosing a Status after typing stores `wordCount: 0`, and the Data view By status reads 0 until a reload: `frontend/app/(app)/page.tsx:460-525`'s `updateResource` sends the whole local resource, the server merges `{...existing, ...update}` (`resource-crud-core.ts:467-469`), and the canonical save's fresh `wordCount` (`revision-core.ts:479-491`) never reaches the local copy (HYPOTHESIS); D-29 has a second, independent part, `project-loader.ts:120-124` recomputes `wordCount` from `content.txt` and ignores the sidecar value (READ). (3) D-36: deleting a resource does not clear another resource's built-in Point of View reference: ref keys come from `getSchema` (`metadata-schema.ts:448`), which is `config.metadataSchema ?? {groups:[]}`, and the built-in defaults are persisted only on the first schema edit, at both `resource-crud-core.ts:314-320` and `trash.ts:520-526` (HYPOTHESIS, strong); a third copy, `frontend/app/api/resource/[resource-id]/delete/route.ts:43`, filters only `resource-ref`, and whether it is still live was not checked. (4) D-3 and D-39: Start Page Manage > Package lists and compiles only resources inside folders: `project-view-adapter.ts:89-93` drops a resource with no matching folder and `StartPage.tsx:309-345` iterates folder resources only (READ); the Start Page resource count (about `StartPage.tsx:365`) may drop the same resources and was not measured. Data: none, apart from D-36 if the fix persists the built-in defaults. Interface: none new.
**Requirements covered:** None of its own: it corrects data-handling behaviour in the editor-configuration, status roll-up, trash and project-packaging requirements, each owned by an existing feature, and adds no capability.
**User stories:** US-9, US-14, US-15, US-19
**Depends on:** none
**Branch suggestion:** fix/saves-that-lose-data
**Notes:** Defects D-9, D-26, D-29, D-36, D-3 and D-39, recorded and not fixed in `specs/features/user-handbook/verification.md` (search each ID). Scoped 2026-10-15 from three read-only investigations; none ran the app. Cause labels as the scoping labels them: D-9 CONFIRMED (read in the code and backed by a test run; the existing test asserts the reset). D-26 and D-29, first part: HYPOTHESIS; the experiment that would settle it is to log the sidecar written by the Status change and the `wordCount` in the local resource just before `updateResource` sends it, and compare with the canonical save's value, or to re-run the handbook's steps with the local copy's `wordCount` removed from the payload. D-29, second part: READ. D-36: HYPOTHESIS (strong); the experiment is to delete a resource in a project whose schema was never edited and read `config.metadataSchema` and the other resource's sidecar, then repeat after one schema edit. D-3 and D-39: READ. D-9 is not in the stale-save family; D-26 and D-29 are related to the stale-save observation in `CLAUDE.md`'s "Resource subtype" glossary entry (`frontend/tests/page-stale-sidecar-save.test.tsx`), whose cause is likewise not established, so this feature must not claim to fix that family. Size estimates: D-9 S (the fix flips that assertion); D-26 and D-29 M; D-36 S/M; D-3 and D-39 S/M; the feature as a whole is M to L and can be cut by defect, the four parts being independent. Nothing here was run by the feature breakdown. Status, 2026-10-16 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. PR #270, merge commit `279e960e`, branch `fix/saves-that-lose-data`, branch tip merged `fb54294a`, merged 2026-10-16. The owner reported that CI was green on the PR; the pipeline lead did not see the CI result. Feature spec `specs/features/saves-that-lose-data.md`, task list `specs/features/saves-that-lose-data/tasks.md` (14 tasks, all ticked), measurements `specs/features/saves-that-lose-data/experiments.md`. Rungs 2 and 3 were skipped on the owner's instruction (Gate 0, 2026-10-15). Built: D-9, saving body styles keeps the stored heading styles; D-26/D-29, `updateSidecarCore` ignores a client-sent `wordCount` and `page.tsx` carries the Redux value; D-36, `getEffectiveResourceRefFieldKeys` uses the built-in fields only when no schema is persisted, used by both delete paths, and the old delete route is now a thin call to `deleteResourceCore`; D-3/D-39, the Start Page compile places resources by `folderId`. Owner decisions after code review, 2026-10-16: built-in fields are used only when no schema is persisted (OQ-4 and FR-17 revised), and the swallowed schema-read failure stays as it is (OQ-5). Verified: `pnpm test:ci` 6505 passed, 1 skipped; typecheck passed; lint 0 errors, 393 warnings; `pnpm test:e2e` 214 passed, 1 skipped, no retries; on the web build only, none of the defect observations recurred when the Feature 81 scripts were re-run. Not verified: the desktop app; the electron and cli suites; whether the two e2e tests that once needed a retry are flaky on `main`. Filed as POS notes, not fixed: `note_17bf406e` (swallowed schema read) and `note_746a516e` (unlocked read-modify-writes, hypothesis). Not in this feature: the `entityKind` omission measured by `page-stale-sidecar-save.test.tsx`.

### Feature 88: Desktop defects — Word import, noise words, and a compile check — Merged, not released

**Value:** A writer on the desktop app can import a Word document without being told its project type is not recognised, in the development app and in a packaged build, can add a global noise word in the development desktop app without a crash mid-write being able to damage the desktop settings file, and the question of whether desktop compile produces no file is answered (as a product defect or as a fault in the verification script), instead of left open.
**Vertical slice:** Logic, three fixes and one check. (1) D-8, Word import says "That project type isn't recognized." (owner decision OQ-95, Gate 1, 2026-10-18: fix in both builds unconditionally): `electron/src/main.ts:661` forks the DOCX worker with no env and no cwd, and `frontend/src/lib/projectTypes.ts:65-83` reads `GETWRITE_PROJECT_TYPES_DIR`, falling back to cwd-relative paths; main never sets that variable (it passes `GETWRITE_TEMPLATES_DIR` to the Next server only), and a packaged build ships the files under `process.resourcesPath/getwrite-config` (`electron/electron-builder.yml`) (all READ). That the result depends on the working directory is measured (Electron dev, launched from another directory); that a packaged build launched from Finder fails the same way is a HYPOTHESIS (medium confidence). The fix: pass `GETWRITE_PROJECT_TYPES_DIR` (the templates directory main already computes) and an explicit `cwd` to the DOCX worker fork, so the result no longer depends on how the app was launched. Size S; the two environment names are not unified here. A packaged-build import then runs as verification of the fix, not as a gate on it. The Scrivener worker does not read project types (READ) and is not changed. (2) D-2, adding a global noise word fails in the development desktop app (owner decision 2026-10-18, see Open Questions, D-2): `electron/src/main.ts:124` sets `userDataDir: ""` when unpackaged and `main.ts:438,445` pass it on, giving `mkdir ''` (READ; a one-line reproduction matched the logged error). The noise-word handlers use the development app's own `app.getPath("userData")` (a packaged build already passes it) and stop reading `projectsDirEnvironment().userDataDir`, which stays empty when unpackaged for the projects-folder logic. In the same task, `writeWorkspaceConfig` in `electron/src/projects-dir.ts` writes `workspace.json` to a temporary file and renames it, modelled on `electron/src/sharing/device-store-writer.ts`, in both builds. An unreadable `workspace.json` still reads as empty (unchanged). Size S/M. (3) D-40, desktop compile produced no file: CHECK first, by a manual desktop compile outside the verification script (owner decision OQ-95, 2026-10-18). Whether this is a product defect at all or a fault in the verification script is not established; candidate causes, none established: the script's hook (`specs/features/user-handbook/scripts/task8-desk.mjs:23` calls `require` inside `app.evaluate`, which may be undefined on Electron 34; HYPOTHESIS), the product revoking the object URL synchronously after `click()` (`frontend/src/lib/compile/download-file.ts:32-42`; HYPOTHESIS), or interception elsewhere. Size rule for the result: a script fault means the script is fixed and it is recorded that no product change was needed; a product defect fixable by a one-line change (for example deferring `revokeObjectURL`) is fixed inside this feature; a main-process download handler or a decision about where compiled files go is scoped as a separate feature, not built here. Desktop runs in this feature (the packaged Word import and the manual compile) use a throwaway user-data directory and a throwaway workspace folder, never the owner's real ones; if that cannot be arranged safely, the packaged import is the owner's manual check. Data: none beyond the atomic-write change to `workspace.json`'s write path. Interface: none new.
**Requirements covered:** None of its own: it corrects behaviour of requirements each owned by an existing feature, and adds no capability. It touches the Word import requirement (the desktop import recognises the same project types as the command line and project creation, however the app was launched), the global noise-word requirement (adding a global noise word works in the development app) and the desktop-application requirement (the desktop settings file is written so an interrupted write cannot leave it partly written), as the product spec amended them after the owner's first review gate; ownership of each stays with the feature that shipped it.
**User stories:** US-18, US-2
**Depends on:** none
**Branch suggestion:** fix/desktop-defects
**Notes:** Defects D-8, D-2 and D-40, recorded and not fixed in `specs/features/user-handbook/verification.md` (search each ID). Scoped 2026-10-15 from three read-only investigations; none ran the app; revised 2026-10-18 for the owner's Gate 1 decisions (OQ-95 resolved, D-2 resolved, FR-33, FR-54 and FR-15 amended in the product spec). Cause labels: D-8, the dependence on the working directory is MEASURED (Electron dev); the env/cwd/shipped-path reads are READ; that a packaged build fails is a HYPOTHESIS (medium confidence) and no longer gates the fix, because the owner decided to fix both builds unconditionally; the packaged-build run is verification of the fix (it can show the fix works there, and shows nothing about whether the build failed before unless run on the unfixed tree, which is not required). D-2: READ (file and line above), with the owner decision of 2026-10-18 in the product spec's Open Questions (D-2) and FR-54/FR-15; the atomic write is in the same task. D-40: HYPOTHESIS on every candidate; the experiment is a manual desktop compile outside the script (or re-running the hook without `require`), and the fix, if any, is sized by the rule in the slice above. A fix beyond a one-line change becomes a new feature and is not part of this one. Throwaway user-data directory and workspace folder for every desktop run: the owner's real user-data folder, workspace folder and logs are not read, listed or written. Size estimates: D-8 S; D-2 S/M (handler change plus atomic write); D-40 a check (small) with the fix size set by the rule above; the feature as a whole is S to M. Nothing here was run by the feature breakdown; the defect observations are the handbook run's (Electron dev, `task8-desk.mjs`). Status, 2026-10-18 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. PR #272, merge commit `586ce7a4`, branch `fix/desktop-defects`, branch tip merged `cc6ff31f`, merged 2026-10-18. The owner reported that CI was green on the PR; the pipeline lead did not see the CI result. Feature spec `specs/features/desktop-defects.md`, task list `specs/features/desktop-defects/tasks.md` (17 tasks), measurements `specs/features/desktop-defects/experiments.md`. Rungs 2 and 3 were run with targeted edits (FR-33, FR-54, FR-15 amended; OQ-95 resolved; decision D-2 resolved). Built: D-8, the DOCX import worker is forked with `GETWRITE_PROJECT_TYPES_DIR` and `cwd: getRepoRoot()` in both builds (`electron/src/docx-import/fork-options.ts`); D-2, the global noise-word IPC handlers take `app.getPath("userData")` in both builds (`electron/src/noise-words-ipc.ts`), and `workspace.json` is written through a temporary file and a rename, the temp file fsynced before the rename and the directory after it, an existing file's mode kept (`electron/src/projects-dir.ts`; the fsync and mode came from code-review findings 1 to 3, Task 17); D-40, no product change, the verification script's download hook no longer calls `require` (`specs/features/user-handbook/scripts/task8-desk.mjs`). Verified: Word import (Blank, Novel) in the dev app launched from a non-`electron` directory and in an unpacked arm64 build launched from `/` and the repo root; adding a global noise word in the dev app succeeded and persisted across a restart (throwaway workspace.json); a require-free compile hook recorded `will-download` and a file in the dev app and an unpacked build (txt only); electron typecheck and `build:worker` passed and electron tests 510 passed after Task 17; at Task 16, frontend `test:ci` 6967 passed, 2 expected fail, 1 skipped, typecheck passed, lint 0 errors and 393 warnings, knip 413 findings as baseline, `pnpm test:e2e` 214 passed, 1 skipped. Not verified: the unfixed tree under these conditions; a Finder or `.dmg` launch; a non-arm64 build; compile formats other than txt; a real crash or power loss. That the original D-40 run failed because of the script's hook is a hypothesis, not repeated. Follow-ups not built (POS notes): the dev workspace-folder chooser passes `""` as userData (`note_858d1897`, read, not run); `getwrite:global-noise-words-set` has no sender check or payload validation (`note_56d253e9`); stale `.workspace.json.*.tmp` files after a crash and a symlinked `workspace.json` replaced by a regular file (`note_aba08cb9`).

### Feature 89: Hidden and lost work — unreadable projects, nested-folder delete, deprecated fields, a dropped entity kind, a swallowed lock error — Merged, not released

**Value:** A writer's work stops disappearing without a word: one project with a damaged `project.json` no longer hides every other project on the start page and is itself shown as a card that says it cannot be opened, deleting a folder with folders inside it moves the whole tree to Trash, a field the writer deprecated stops showing in the sidebar, a resource's entity declaration is not left out of a later save, and a locked or keyless project is no longer shown as an empty folder tree.
**Vertical slice:** Logic and interface, five independent parts, each a defect from the 2026-10-18 triage of `main`, sharing the theme "a failure or a hidden thing rendered as absence". (1) D-38 and the silently skipped projects (FR-23; owner decision OQ-96, Gate 1, 2026-10-18, both halves (a)): every project whose `project.json` exists but cannot be used (a wrong-typed field, a file that does not parse, a manifest missing `id` or `createdAt`) appears on the start page as a card that cannot be opened, with a reason, following the locked-project card pattern; the card may say the project's files are still on disk and unchanged, and shows the folder id when no readable name exists; no repair action; the remaining projects list and open; a folder with no `project.json` stays skipped (POS note_3c11e2c4, out of scope). Measured: one wrong-typed `project.json` hid every project (D-38, `specs/features/user-handbook/verification.md`). Read, not run: `listProjectsCore` (`frontend/src/lib/models/project-crud-core.ts` ~142-168) skips an unusable project with only a `console.warn`, against `docs/standards/failure-visibility.md` section 1, and the client rejects the whole list when any entry fails validation (`frontend/src/lib/api/projects.ts:101`), pinned by `frontend/tests/unit/projects-api-validation.test.ts` ("REJECTS a malformed array entry"), which this part changes. Where validation happens (client per entry, or server per project) is left to the feature spec. (2) Soft delete of a folder with nested child folders (FR-28 as amended; POS note_f818d108): 404 measured earlier, not re-run on `main`; the whole subtree, at any depth, must move to Trash as one restorable unit. Parents-before-children (a child's original path gone once its parent has moved, read in `trash.ts`) is a HYPOTHESIS to be tested first; existing tests use flat folder layouts. (3) Deprecated fields still shown in the sidebar (FR-20 as amended; POS note_230d6135): read in `MetadataSidebar.tsx`, which filters on feature flags and subtype only, not run; a deprecated field must not be shown, its stored values stay on the resource and reappear if the field is restored. Four places tell the writer the field is hidden. (4) `entityKind` omitted from a later sidecar save (FR-35 as amended; POS note_fa1c425b): measured at request-payload level only, with the save mocked (`frontend/tests/page-stale-sidecar-save.test.tsx`): after setting `entityKind` and then editing a custom field the second payload omitted it while the client state held both; whether a missing or stale value is then stored is unmeasured, and that harm is a hypothesis. The feature measures it first (what the server stores) and fixes what the measurement shows; it must not claim to fix the wider stale-save family, whose cause is not established, and `aliases` and `wordCountGoal` were not measured. (5) `readFolderTree` swallows locked-access errors (the locked-access constraint in the product spec; POS note_36a47f66): a bare `catch {}` in `frontend/src/lib/models/folder-utils.ts` discards every error including `ProjectLockedError` and `MissingProjectKeyError` (read, not run); which callers are exposed was not surveyed, so the feature surveys them first. Data: none expected; part 1 may add a response shape for an unusable project. Interface: a card state for an unusable project; no other new control.
**Requirements covered:** None of its own: it corrects behaviour in requirements each owned by an existing feature (start-page project list, resource-tree and metadata-field handling, entity declaration, Trash, and the locked-access constraint) as the product spec amended them after the owner's first review gate (the sidebar field-visibility, start-page project, entity declaration and Trash requirements, and the locked-access constraint), and adds no capability.
**User stories:** US-14, US-15, US-3, US-11, US-30
**Depends on:** none
**Branch suggestion:** fix/hidden-and-lost-work
**Notes:** Scoped 2026-10-18 from the triage of `main`; the breakdown ran nothing. Cause labels, exactly as the product spec amendments carry them: part 1, D-38 MEASURED (the handbook run), the `listProjectsCore` skip and the client whole-list rejection READ, not run; part 2, the 404 MEASURED earlier and not re-run on `main`, parents-before-children HYPOTHESIS, not established (the experiment: build a folder with a nested child folder, with and without a grandchild, delete it on `main` and read the response and `.trash/`); part 3, READ, not run; part 4, the omitted `entityKind` MEASURED at payload level only, whether a wrong value is stored UNMEASURED, harm HYPOTHESIS; part 5, READ, not run, callers not surveyed. Parts 1 to 5 are independent and the feature can be cut by part. Size estimates: not estimated for any part or for the feature; nothing was read in enough depth to ground them (no part has had its fix located beyond the files named above). Owner decision, Gate 1, 2026-10-18: OQ-96 (resolved, (a) and (a)). Open design point for the feature spec, not a product question: where project validation happens (client per entry, or server per project), and how the unusable card is built from the locked-project card. The locked-encrypted project case in the start page was already fixed (commit 96b4bff7) and is not part of this feature. Not in this feature: the wider stale-save family, folders without `project.json` (note_3c11e2c4). Owner decisions, Gate 3, 2026-10-18 (recorded in the feature spec): OQ-1 validation in the shared core `listProjectsCore` against `ProjectSchema` with the client staying strict; OQ-2 (b) narrow catches in `readFolderTree` and `childDirs` (ENOENT and JSON parse error only); OQ-3 (b) the "Add field" form says a deprecated field is hidden and offers only Close; OQ-4 (b) an unreadable `project.json` becomes a "could not be read" card; and a project whose `folders/` or `resources/` cannot be read also becomes a card, so one bad project never hides the rest; US-30 added for part 5. Status, 2026-10-18 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. PR #274, merge commit `18b2ad47`, branch `fix/hidden-and-lost-work`, branch tip merged `4de3a8da`, merged 2026-10-18. The owner reported that CI was green on the PR; the pipeline lead did not see the CI result. Feature spec `specs/features/hidden-and-lost-work.md`, task list `specs/features/hidden-and-lost-work/tasks.md` (18 tasks; 16 run, Tasks 14 and 15 not applicable), measurements `specs/features/hidden-and-lost-work/experiments.md`. Rungs 2 and 3 were run with targeted edits (FR-20, FR-23, FR-28, FR-35 and the locked-access constraint amended; OQ-96 resolved; US-30 added). Built: part 1 (D-38), `listProjectsCore` returns a project whose `project.json` exists but is unusable as an entry with a reason (`unparseable`, `missing-field`, `invalid-manifest`, `manifest-unreadable`, `tree-unreadable`) instead of rejecting the list, the client keeps strict validation with a third list-entry member, native and HTTP pinned to agree, and the start page shows a card that cannot be opened; part 2 (note_f818d108), `softDeleteFolder` moves descendant folders deepest first (the parent-first order as cause established by reversing it on the unfixed tree) and a retry merges the earlier manifest; part 3 (note_230d6135), deprecated custom fields are hidden from the sidebar with values kept, and Add field says a deprecated key exists, with Close only. Closed with no product change: part 4, with the real `updateSidecarCore` a payload omitting `entityKind` kept the stored value (core level only; a running app and the wider stale-save family not measured); part 5 (note_36a47f66), no `readFolderTree` caller exposed, so `tree-unreadable` is declared and not produced. Verified: frontend `test:ci` 7063 passed, 2 expected fail, 1 skipped; typecheck passed; lint 0 errors, 393 warnings; `pnpm test:e2e` 214 passed, 1 skipped; knip, the two exports this feature added removed (4de3a8da); in-app on a web build (`next start`, Task 16) and on the standalone server at the branch tip (pipeline lead): unusable-project cards for an unparseable, a missing-field and a wrong-typed manifest with the healthy project opening, a three-level folder deleted to one Trash entry and restored, a deprecated field hidden with its value kept across a save and the Add field message shown. Not verified: the desktop app; the electron and cli suites (neither package changed; the cli baseline was not obtained); that the earlier 404 is the same ENOENT. Still failing, pinned by characterisation tests: a bad `folder.json` rejects the list on the client, and a bad resource sidecar makes `listProjectsCore` throw. Found during the in-app run, older than this feature, not fixed: creating a folder over HTTP shows "Some data couldn't be loaded correctly." and the folder appears only after a reload (`ResourceResponseSchema` uses `AnyResourceSchema`, which has no folder member; READ, the same steps not run on `main`); `POST /api/resource` with a project id that names no directory creates one (measured); the start page shows "No projects yet" while the list loads; the Add field button's accessible name is `add-metadata-field`.

### Feature 90: Writer-made project types, and paragraph leading that follows the project's line height — Merged, not released

**Value:** A writer can save a project type they create or edit in the Project Type Manager and then choose it when creating a project, importing a Word document or using the command line, and a writer's body line height setting now actually sets the line spacing of every paragraph they have not spaced themselves.
**Vertical slice:** Data, logic and interface, two parts the owner chose to run as one combined feature (owner decision, 2026-10-19). (1) D-1, FR-70: a store of saved project types the app can write to (app-wide for the installation, in the desktop app's userData next to `workspace.json`, following the global-noise-words precedent; the web build is given a writable location by path), a Save control and a Delete control in the Project Type Manager, an unsaved-changes warning that does not lose edits silently, one resolver that merges the built-in and saved types and feeds the new-project dialog, the desktop import's project-type choice and the CLI, so a newly saved type appears without a restart, and refusal with a visible reason when a saved type would reuse a built-in or another saved type's id or name. Editing a built-in type saves a copy as a new saved type; built-in types are never changed; a saved type can be renamed and deleted; existing projects are unaffected. Android and hosted multi-tenant are out of scope for now. Seams read in the product spec, not run: `frontend/app/api/project-types/route.ts:10-18` (`GETWRITE_TEMPLATES_DIR`), `frontend/src/lib/projectTypes.ts:68-69,85,107,175` (`GETWRITE_PROJECT_TYPES_DIR`, in-memory cache), `electron/src/docx-import/fork-options.ts:27-33`, `frontend/src/lib/models/project-creator.ts:228-237`, `frontend/src/lib/models/project-types-static.ts:57-60`. (2) D-10, FR-71: a paragraph whose leading is unset renders at the project's Body Text Styles line height (`--gw-body-line-height`, default 1.8); unset is represented distinctly (an absent attribute) so an explicit choice, 1.5 included, is kept; a stored paragraph leading of "1.5" is treated as unset on read; opening a document does not change a writer's set leading or turn unset into set; the 1.8 floor is enforced on the Body Text Styles line height and, by the spec's stated implication, on the Project Type Manager's line height field, while a writer's explicit paragraph leading may go below 1.8. Seams read in the product spec, not run: `GetWriteParagraphLeading.ts:21,31,34,37`, `TipTapEditor.tsx:483-491`, `toolbar-command-schema.ts:348-357`, `frontend/src/lib/api/schemas.ts:87`, `ProjectTypeEditorForm.tsx:536-539`. Interface: Save and Delete controls and a refusal message in the Project Type Manager; the floor's validation message in the two line height fields; no other new control.
**Requirements covered:** FR-70, FR-71
**User stories:** US-1, US-9
**Depends on:** none
**Branch suggestion:** feat/writer-project-types-and-paragraph-leading
**Notes:** Defects D-1 and D-10, recorded and not fixed in the Feature 81 handbook verification, `specs/features/user-handbook/verification.md` (search each ID). Product spec FR-70 and FR-71; owner decisions at Gate 1, 2026-10-19: OQ-97 to OQ-100 (resolved, FR-70) and OQ-101 and OQ-102 (resolved, FR-71). Owner direction on D-1, 2026-10-19: "it makes no sense to have a form without a way to save". The owner states there are zero users, so no migration or compatibility constraint applies to either part. Cause and fact labels as the product spec carries them. D-1: MEASURED (web build and Electron development app, throwaway copy of the type files): the manager's form is editable and marks "Unsaved changes", no save or delete control was found, and edits and a new draft were gone after reopening; READ: nothing in the app saves Project Type Manager edits, and the built-in types are JSON in `getwrite-config/templates/project-types/`, shipped read-only inside the app bundle. D-10: MEASURED (web build): Body Text Styles line height 2.2 and 1 were stored in `project.json` and a project type's 2.4 was copied into a new project, but the paragraph's inline style stayed `line-height: 1.5` and the rendered height stayed 1.5; a new Blank project stores 1.8 and renders 1.5; no floor was enforced on 1 (and 1.2 and 0.5 were accepted in the toolbar). READ (not measured in the running app): no floor is enforced anywhere (files above), and the paragraph-leading control's default "1.5" is rendered as an inline line-height that overrides `--gw-body-line-height`. HYPOTHESIS (not established, and not stated here as the cause): `TipTapEditor`'s `onCreate` runs `selectAll().setParagraphLeading("1.5")` on every document open and so may overwrite leading a writer chose; the experiment that settles it is to set leading on one paragraph, reopen the document, and read the paragraph's inline style; the feature runs it first. No cause is stated for the measured D-10 behaviour. Size estimates, by part: D-1 L (writable store, one resolver across three surfaces, the packaged-build location, collision refusal, manager controls; the earlier scoping sized it L because templates are read-only when packaged); D-10 S to M. Each part can be cut independently: the two share no code or data (the only link is that the floor also reaches the Project Type Manager's line height field; this feature places that floor in part 2, so part 1 can be cut without it). Not in this feature: Android and hosted multi-tenant saved types; any change to existing projects made from a type. Nothing here was run by the feature breakdown; the code locations are reads from the product spec. Open design points for the feature spec, not product questions: where the writable location is on the web build and how the server is given its path; how the resolver is shared with the CLI and the import worker, which read different environment variables today; how an absent leading attribute is parsed and rendered. Status, 2026-10-20 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. Implemented on branch `feat/writer-project-types-and-paragraph-leading`, merged as PR #281, merge commit `38ecf588`; the branch tip merged was `d505b955`. CI green (owner report, 2026-10-20). Feature spec `specs/features/writer-project-types-and-paragraph-leading.md`, task list `specs/features/writer-project-types-and-paragraph-leading/tasks.md` (39 tasks, all ticked), measurements `specs/features/writer-project-types-and-paragraph-leading/experiments.md`. Gate 6 was approved by the owner 2026-10-20 (Task 38 deviations accepted). Verified, per the Task 39 record in experiments.md: frontend `test:ci` 7529 passed, e2e 222 passed, electron 516, CLI 153. Two later fixes, each covered by unit tests only: `8edd555f` (name inputs in the folder, subfolder and starter document rows keep focus while typing) and `69ec336a` (readable refusal messages for folders, id and word count goal); after them frontend `test:ci` was 7543 passed and CLI 153; e2e and the packaged app were not re-run for these two fixes. Not verified: a project made by an older build (only a hand-made document was used); a starter document with an empty Folder landing in the first folder of a created project; one console 404 per packaged launch, not investigated. Deferred: POS note_d4ec29c6 (folder-level starter documents are ignored by project creation).

### Feature 91: Font pickers that show every font, fonts that ship with the app, and one typography form for Project Settings and the Project Type Manager — Merged, not released

**Value:** A writer choosing a font for headings, body text or the editor toolbar sees the full list of fonts GetWrite can render at all times (not only the one already set), picks a bundled font that looks the same offline and on every device, can type any other font name with a plain hint about what shows if it is not installed, and gets the same, evenly sized typography inputs in the Project Type Manager as in Project Settings.
**Vertical slice:** Data, logic and interface, four requirements the owner asked to run as one feature (owner request, 2026-10-21; POS note_db7c7c58). (1) FR-73, bundled fonts: the `FONT_OPTIONS` fonts and the IBM Plex families ship as WOFF2 files (Latin and Latin Extended; the weights already in use) imported in the frontend so one mechanism serves web, desktop and native; `app/layout.tsx` stops linking Domine and Google Fonts; a font chosen in Project Settings or a project type renders in the editor without also being chosen in the toolbar; the toolbar fallback becomes the project's body font, else IBM Plex Serif; the weight select offers exactly the weights shipped; the SIL OFL licence text and per-font notices ship as a file. (2) FR-72, one font dropdown: bundled fonts, Arial, Georgia, Times New Roman, Courier New, Verdana, Trebuchet MS and the generic families serif, sans-serif and monospace, plus "Other..." with a free-text name rendered with a fallback stack and a fixed hint; shown in full whether or not a font is set; a stored value matching no entry shows as "Other..." with the text unchanged and is not rewritten unless edited; used by Project Settings, the Project Type Manager and the editor toolbar; no enumeration of installed fonts. (3) FR-74, one shared typography component (font dropdown, numeric size, weight select, colour picker, letter spacing, line height) used by Project Settings' Editor tab and the Project Type Manager's heading and body fields, replacing free-text fields; the FR-71 line-height floor applies to the form's line height field. (4) FR-75, matching rendered heights for the controls in one row of Project Settings' Editor tab. Seams read in the product spec, not run: `components/preferences/FontFamilyInput.tsx`, `src/lib/fonts/fonts.ts`, `src/lib/fonts/loadGoogleFont.ts`, `app/layout.tsx`, `components/Editor/MenuBar/toolbar-command-schema.ts`, `styles/saboteur-base.css`, `ProjectTypeEditorForm.tsx`. Interface: the dropdown with its "Other..." field and hint; the shared typography component in two places; no other new control.
**Requirements covered:** FR-72, FR-73, FR-74, FR-75
**User stories:** US-9, US-1
**Depends on:** Feature 90
**Branch suggestion:** feat/font-picker-and-typography-inputs
**Notes:** Product spec FR-72 to FR-75; owner decisions at Gate 1, 2026-10-21: OQ-103 to OQ-109 (resolved: Domine removed; the system-font list; "Other..." fallback stack and hint; stored unlisted values shown as "Other..."; WOFF2 Latin and Latin Extended through `@fontsource` packages with a justification each per `docs/standards/package-selection.md`; one mechanism for web, desktop and native; licence notice as a shipped file, an in-app Licences view being a later follow-up and not part of this feature). Depends on Feature 90 because the Project Type Manager's form and the FR-71 line-height floor on its line height field are Feature 90's, and Project Settings' typography fields are existing code with no owning feature in this list. Fact labels as the product spec carries them: the datalist showing only the set value, fonts loading from Google Fonts, Domine linked in the layout, and no `@font-face` for IBM Plex are READ (code, not run); the Colour box being taller and the Font Weight select shorter in FR-75 are reported by the owner, not measured. No size is fixed in advance for the bundled fonts: the added size for the web build, the Electron bundle and the native `out/` is measured after the first build and recorded. Packaging note: the feature is one slice by the owner's request, but it contains parts that could be shipped separately (FR-73 bundled fonts; FR-72 with FR-74 the shared dropdown and form; FR-75 height fix), so FR-72 depends on FR-73 only for the list of bundled names and the weights the select offers. Nothing here was run by the feature breakdown. Status, 2026-10-22 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. Implemented on branch `feat/font-picker-and-typography-inputs`, merged as PR #283, merge commit `eb832dee`; the branch tip merged was `1293832c` (37 commits). CI green (owner report, 2026-10-22). Feature spec `specs/features/font-picker-and-typography-inputs.md` (FR-1 to FR-22), task list `specs/features/font-picker-and-typography-inputs/tasks.md` (29 tasks), measurements `specs/features/font-picker-and-typography-inputs/experiments.md`. Owner decisions at Gate 5, 2026-10-22: PDF export fonts bundled (OQ-12), Playwrite IE Latin only (OQ-13), refusal callback on `TypographyFields` (OQ-14). Gate 6 approved by the owner 2026-10-22. Verified: frontend `test:ci` 7878 passed, e2e 227 passed (1 skipped), electron 528, CLI 153; the built web app and a packaged arm64 desktop build (throwaway name, contents matched to `GetWrite.app`) were exercised with the network blocked: 0 font host requests, bundled fonts rendered, refused names and line heights blocked Save, PDF export embedded IBM Plex (PR #283 comment). Fixed after Gate 6, before merge: `d77b81a3` (IBM Plex Serif no longer repeated in its own fallback stack) and `1293832c` (15 s timeout for the Type Manager field-errors axe test, which timed out twice on CI; POS note_684e71db). Not verified: native (Android) PDF fonts (OQ-15; native PDF compile already throws, POS note_875f2e5b; tracked as task_34cb2a68 with note_f25a54b0), `build:native` (existing type error in `stories/Start/CreateProjectModal.stories.tsx`), signed or dmg builds, x64, Firefox and WebKit.

### Feature 92: Overlapping saves to a project's settings file or a resource's metadata keep every change — Merged, not released

**Value:** A writer on deadline who changes several project settings in quick succession, or whose editor settings save at the moment another setting (for example a new metadata field) is saved, keeps every one of those changes and still has a project that opens, instead of finding a setting silently reverted. Revised (Owner decision, Gate 5, 2026-10-23): the same holds for a resource's metadata: a metadata edit made while that resource autosaves, or while a metadata field is removed, is kept together with the other change, and the resource still opens. Narrowed (Owner decision, Gate 5 re-gate, 2026-10-23; feature spec OQ-9 option a): for metadata, two metadata saves read and write the file in order; values a client sends are stored as sent.
**Vertical slice:** Data and logic, with the interface unchanged. Revised (Owner decision, Gate 5, 2026-10-23): the slice now has two parts under one feature, a per-file lock for `project.json` and the same per-file lock for each resource sidecar (`meta/resource-<id>.meta.json`), with every sidecar read-modify-write (`updateSidecarCore`, the sidecar update inside `updateRevisionInPlace`, `forEachUserMetadata` in `metadata-schema.ts`, and the others the feature spec inventories) taking the sidecar's lock with the read inside it; `writeSidecar`'s `metadataRevision` bump remains a `project.json` write under the `project.json` key, after the sidecar write has released its own key. The original description of the `project.json` part follows. Every read-modify-write of `project.json` goes through one narrow `project.json` lock, the shape of `updateProjectJson` in `frontend/src/lib/models/project-json-write.ts` (read, mutate, atomic write under `withMetaLock(projectRoot)`), with the read a write is based on taken inside that same lock (a read outside it is for display only). That includes the writers that today hold `locks.ts` `acquireLock` (`metadata-schema.ts`, `project-features.ts`) and the `metadataRevision` bump in `sidecar.ts`. Migrations and other saves otherwise run as they do now, so a quick settings save waits at most one `project.json` write, not a whole field migration. A write waits for the lock with no time limit; no timeout and no new failure path is added; a write that cannot get the lock never looks saved (`docs/standards/failure-visibility.md`). The guarantee is stated for one server process (the desktop app and a single web server). Three pieces of work belong inside the slice. (1) Lock order: the feature spec must show the lock order cannot deadlock, because `acquireLock` and `withMetaLock` are each per process, keyed by `projectRoot`, not reentrant, and do not serialize with each other, and `writeSidecar` takes `withMetaLock` and bumps `metadataRevision` while several `metadata-schema.ts` operations (`changeFieldTypeWithMigration`, `renameFieldKey`, `updateFieldOptionsWithMigration`) hold `acquireLock` while rewriting sidecars (READ, not run). (2) Proof: the race test that measured the loss, an editor-config save (`updateEditorConfigCore`) against `addField`, in `frontend/tests/unit/metadata-concurrent-writes.test.ts`, which lost the new field in 20 of 20 repetitions in each of 9 runs on 2026-10-23, must pass with no lost change. (3) Two carried checks: a sidecar race experiment (each sidecar writer pair that uses a different lock family; sidecars come into scope only if it reproduces a lost update), and a check of whether any writer reads `project.json` in one request and writes it in a later one, run before any claim of coverage. Revised (Gate 5, 2026-10-23): the first carried check is done and reproduced lost updates (see Notes), so sidecars are in scope; the second carried check is extended to sidecar writers that build a whole object from an earlier read in another function or request.
**Requirements covered:** FR-76
**User stories:** US-31
**Depends on:** none
**Branch suggestion:** fix/project-json-write-lock
**Notes:** Product spec FR-76 and US-31, added 2026-10-23 (reliability and data-loss work, the same group as Feature 89). Owner decisions at Gate 1, 2026-10-23: OQ-110 to OQ-114, all resolved: `project.json` only (sidecars, `meta/index/*`, `backlinks.json`, `relationships.json` and writing-log files are unknown, not promised); one server process, with hosted multi-instance coordination deferred to the revisit conditions in ADR-017 and ADR-019; a waiting write has no time limit; the read behind a write is inside the lock; option (c), one narrow `project.json` lock for every read-modify-write. One feature, not several: the lock, the three writer families moved onto it and the race test prove one behaviour and cannot ship usefully apart (moving only some writers leaves the measured race open). Facts as the product spec carries them: before PR #294, two concurrent `updateEditorConfigCore` calls left `project.json` unparseable on the first of 20 repetitions in two runs; PRs #294 and #295 (merged) made the writers atomic so they can no longer leave the file unparseable; the editor-save-against-`addField` loss is measured; sidecar lost updates are not measured (a status change racing a canonical save was not reproduced, 20 of 20 kept, two runs); the lock-family and holder descriptions are READ, not run. Revised (Owner decision, Gate 5, 2026-10-23; option 2, expand scope to sidecars; OQ-110 revised in the product spec): Task 2's sidecar race experiment (`specs/features/project-json-single-lock/experiments.md`; script `specs/features/project-json-single-lock/scripts/fr15-sidecar-races.test.ts`; 100 repetitions per pair on unchanged `main`) measured: metadata save (`readSidecar` then `writeSidecar`) against `updateRevisionInPlace`, 41 of 100 lost a change (23 lost the revision's `updatedAt`, 18 lost the metadata edit); metadata save against `clearField` via `forEachUserMetadata`, 10 of 100; `updateRevisionInPlace` against `forEachUserMetadata`, 0 of 100; 0 unparseable; no writer rejected. Cause not established; the lead's hypothesis, untested, is a read outside any lock followed by `writeSidecar`. This keeps one feature: the lock primitive, the `project.json` writers and the sidecar writers prove one behaviour (no overlapping read-modify-write of one file loses a change) and share one primitive and one deadlock argument. `meta/index/*`, `backlinks.json`, `relationships.json` and writing-log files stay unknown, not promised. Task 1 and Task 2 are done (commits `ce84dc34`, `de1012fa`). Related open work, kept separate: Feature 79 (the last-save-wins statement for one resource on two devices) is a different promise about resource content over home-network sharing and is not part of this feature. Nothing here was run by the feature breakdown. Status, 2026-10-24 (verified with git by the pipeline lead): BUILT on branch `fix/project-json-write-lock`. (Update, 2026-10-24: MERGED to `main` and NOT RELEASED, PR #296, merge commit `b1d3e9e8`, branch tip merged `4452b9bc`; CI result not seen by the lead.) Task list `specs/features/project-json-single-lock/tasks.md` (27 tasks, all ticked); measurements `specs/features/project-json-single-lock/experiments.md`. Built: a per-file lock (`file-lock.ts` `withFileLock`, innermost) taken by every `project.json` read-modify-write through `updateProjectJson` (the schema writers included), and a sidecar sink (`sidecar.ts` `mutateSidecar`) used by every sidecar read-modify-write; a test-only lock-order guard and a source scan. Measured, before then after: the editor-config save against `addField` lost one change in every repetition (180 of 180 over 9 runs) and then 0 of 180; the metadata save against `updateRevisionInPlace` lost 43 to 49 per 100 and then 0 (9 runs); against `clearField` 6 to 13 per 100 and then 0; five of six remaining sidecar families lost 25 to 28 per 100 and then 0 (`relinkResourceRefs` lost 0 before as well). Final suites: typecheck 0; lint 0 errors, 391 warnings; test:ci 8152 passed; e2e 230 passed, 1 skipped; CLI 153; electron 528; build exit 0; knip 412 (baseline). Exercised by the lead in a throwaway dev server: 20 rounds each of overlapping editor-config and add-field requests, and of overlapping canonical saves and sidecar saves, through the real routes, 0 lost; values shown after reload. Owner decisions: OQ-110 to OQ-114 (Gate 1), OQ-1 to OQ-8 (Gate 3), scope widened to sidecars and OQ-9, OQ-10 option a (Gate 5); Gate 6, 2026-10-24: Task 16 wording amended (calls for different resources in one project queue on `withMetaLock`, as before). Not covered, by decision: trash move and restore of a sidecar (note_131ecc62); stale whole-object client saves (note_68454d5d). Follow-up notes: note_bd7bd1cd, note_8cfdc308, note_63613105, note_86858ada, note_4d01c0b5, note_136798e2, note_f2fac1f3, note_f1e07672, note_a39b6637, note_4afd32d5, note_51c813c1, note_b90fdd40.

### Feature 93: A save never puts back an older value, and overlapping server writers keep each other's change — Merged, not released

**Value:** A writer on deadline who edits a resource's metadata, project settings or entity details, or whose resource is saved, indexed or deleted at the same moment, does not find a tag, status, setting, mention or backlink silently reverted or missing; this holds across two devices under home-network sharing, where the newest write to a key wins and there is no conflict screen.
**Vertical slice:** Data and logic, with the interface unchanged. Four parts under one feature. (1) Class A, stale client copy of a sidecar: `updateSidecarCore` (`frontend/src/lib/models/resource-crud-core.ts`) accepts only an allowlist of keys a client may write (fail-closed, `docs/standards/security.md`) in place of the denylist `SERVER_DERIVED_SIDECAR_KEYS`; `updatedAt`, `name` and `dismissedNoiseTerms` become server-owned (a client value is ignored; writers are the canonical save in `revision-core.ts`, `renameResourceSidecarCore`, and the noise-term route); `entityKind`, `aliases`, `wordCountGoal`, `resourceSubtype` and `userMetadata` stay writer-owned and are stored as sent. Precondition, before any key is dropped: search every caller of `updateSidecarCore` for one that relies on it to rename or to set `updatedAt` or `dismissedNoiseTerms`. (2) The features route, promised now: `POST /api/project/features` (`features`, `relationshipTypes`, `subtypes`, `organizerCardBody`) stops putting back an older value for a key it did not change; decided at Gate 2 (F93-5): the four blocks stay whole blocks with last-write-wins per block, documented, and the fix is preventing overlapping sends from one window (for example `RelationshipTypesSettings` waits for an in-flight save, as `SubtypesSettings` does with `isSaving`; `ProjectFeatureToggles` is also checked); between two devices the newest write wins per block, not per item. (3) Two carried checks, measured first and brought into the promise only if a reverted or lost setting reproduces: editor config (`editor-config-core.ts`) and entity-graph settings (`entity-graph-settings-core.ts`). Per F93-3, a reproduced revert is fixed in this feature only if the fix is small (a key-level merge inside the existing `updateProjectJson` mutate); otherwise it is a follow-up with the measurement recorded. (4) Class B, conditional: a race test for the mention index (`mention-index.ts`, `indexer-queue.ts` `runTask`) and for backlinks (`backlinks.ts`), in the manner of PR #300's inverted-index test; fix only what reproduces, as one locked load, change and save. Per F93-4, an atomic `computeBacklinks` recompute is a recorded follow-up, widened into this feature (wider lock) only if a race test reproduces a loss one locked step cannot close; the inaccurate "inside one `withMetaLock`" comments are corrected either way. Per F93-1, the allowlist applies at `updateSidecarCore` only (the one client-reachable path taking a client-supplied object).
**Requirements covered:** FR-77
**User stories:** US-32
**Depends on:** none
**Branch suggestion:** fix/stale-saves-and-index-races
**Notes:** Product spec FR-77 and US-32, added 2026-10-24 (reliability and data-loss work, the same group as Features 89 and 92). Owner decisions at Gate 1, 2026-10-24: OQ-115 to OQ-119, all resolved and carried here, not reopened: allowlist alone for sidecars, with no key-by-key `userMetadata` merge, no client-sends-changed-keys and no version check (OQ-115); `updatedAt`, `name`, `dismissedNoiseTerms` server-owned (OQ-116); features route promised, editor config and entity-graph settings carried checks (OQ-117); two devices covered, newest write per key wins, a version check being a recorded follow-up (OQ-118); mention index and backlinks kept in this requirement as a conditional class-B section (OQ-119, option c). One feature, not several: the pipeline carries one feature per run and the owner chose to keep class B in this run; the parts also share one idea (no save or writer undoes a change it did not make), the same files (`resource-crud-core.ts`, `project-features.ts`, the index modules) and one test approach (a race or stale-copy test run first, a fix only for what reproduces). The parts can be built and merged in separate pull requests inside the branch if the feature spec prefers; none depends on another. Facts as the product spec carries them. MEASURED: a client sidecar copy read before a canonical save and sent through `updateSidecarCore` after it (sequential) left the stored `updatedAt` at the older value in 100 of 100 repetitions (Feature 92 Task 5, `specs/features/project-json-single-lock/experiments.md`, "OQ-9"); in `inverted-index.ts` two concurrent calls lost a resource in 20 of 20 trials before PR #300 (merged, `b2771181`). READ, not run: `updateSidecarCore` shallow-merges the client object and drops only `wordCount` and `file`; `orderIndex` and `folderId` are re-applied from the stored sidecar by `mergeSidecarUpdate` (closes Feature 92 follow-up F-6 for existing sidecars); `metadataRevision` is a `project.json` key, not a sidecar key; the features route replaces its four keys with the client's copy and its senders are `SubtypesSettings.tsx` and `RelationshipTypesSettings.tsx` (`RelationshipTypesSettings` sends the whole list with no in-flight guard, `SubtypesSettings` guards with `isSaving`, `ProjectFeatureToggles` sends the whole features map); the editor-config modals each send only their own block and the entity-graph panel loads once per mount (lower confidence). NOT MEASURED: which other keys a stale copy puts back, how often real UI paths send a stale copy, whether the mention index and backlinks lose a change (a hypothesis until a race test reproduces it), and the cause of any loss in the settings routes. Known gap, by decision: a stale `userMetadata` is replaced wholesale and is not fixed by the allowlist. Caveat: `computeBacklinks` reads every resource before `persistBacklinks` takes the lock, so one locked load, change and save makes the write safe but does not make a whole recompute atomic; the "inside one `withMetaLock`" comments in `mention-index.ts` and `backlinks.ts` are inaccurate and the feature spec should correct them. Not promised: `relationships.json`, writing-log files and other indexes. Related, kept separate: Feature 79 (last-save-wins for one resource's content on two devices) and Feature 92 (per-file lock; this feature is its recorded follow-up). Gate 2, 2026-10-24: the owner carried Feature 93 forward as this run's one feature. F93-1 and F93-2 resolved from evidence (allowlist needed at one path only; no caller relies on the three keys; the page save's stale passengers are the measured source). F93-3 to F93-5 owner decisions as recorded in Open Questions. Scope narrowing accepted: the features route is whole-block last-write-wins between two devices, narrower than OQ-118's "newest write per key". Nothing here was run by the feature breakdown. Status, 2026-10-24 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. Implemented on branch `fix/stale-saves-and-index-races`, merged as PR #301, merge commit `7f9c3615`; the branch tip merged was `3f894bea` (26 commits). Task list `specs/features/stale-saves-and-index-races/tasks.md`; measurements `specs/features/stale-saves-and-index-races/experiments.md`. Built: `updateSidecarCore` stores only five client keys (`entityKind`, `aliases`, `wordCountGoal`, `resourceSubtype`, `userMetadata`) and ignores the rest; in-flight guards in `RelationshipTypesSettings` and `ProjectFeatureToggles` (an `OrganizerCardBodySettings` guard was built and reverted by owner decision at Gate 5; follow-up: save the excerpt length on blur or after a typing pause); `updateMentionIndex` and `updateBacklinks` hold `withMetaLock` across load, change and save for the removal functions, `runTask`'s mention step only and `rescanEntityAcrossProject` (its backlinks step keeps `persistBacklinks`; known gap b6, F93-4); a test-only nested-lock guard. Measured, before then after: stale `name` after a rename 20 of 20 then 0, stale `updatedAt` after a canonical save 100 of 100 then 0, stale `dismissedNoiseTerms` 20 of 20 then 0; five mention-index and backlinks pairs (removal against `runTask`, removal against rescan, rescan against `runTask`, `removeResourceFromBacklinks` against `persistBacklinks`, `removeResourceFromBacklinks` against `runTask`, with the removal held at its `backlinks.json` load; a removal landing between `runTask`'s scan and its write was measured at Gate 6 to still lose, 20 of 20, and is a known gap) lost in gated mode in 20 of 20 repetitions and then in 0 of 20 (natural mode 0 of 20 for the pairs that were 0 before). Not fixed, named as known gaps: a stale `userMetadata` is replaced wholesale; two persist callers (importers, `reindex`; mention index and backlinks) and the watcher against `runTask`, and a `computeBacklinks` recompute against a removal (F93-4), still lose in 20 of 20 gated; the entity-graph settings revert (E-7, accepted follow-up); the editor-config case did not reproduce in the shapes the modals send and was not changed. Gate 6 code-review fixes: the page save overlays `entityKind`, `aliases` and `wordCountGoal` from Redux; a sidecar that re-reads as valid is not replaced; replacement keeps `folderId` and `orderIndex`. Final suites, measured on d17c4674 (as reported by the implementor): typecheck 0 errors; lint 0 errors / 392 warnings; test:ci 678 files, 8269 passed, 7 expected fail, 1 skipped; test:e2e 230 passed, 1 skipped; knip 412; CLI 153/153 and electron 528/528 (recorded by the Task 24 run on 7e3863df). Exercised on the web dev build (throwaway server and projects folder) on 2026-10-24. Covered: a server-side rename followed by a sidebar Status edit from the stale page copy kept the server name and stored the status; typing "120" fast into the Organizer excerpt length kept focus and stored 120; a second feature-toggle click during the first save was blocked and both flags were stored; two quick relationship-type adds were both stored. The mention-index and backlinks races were not exercised in the app (test-only). The desktop app was not run.

### Feature 94: Spell checker engine spike — measurement — Folded into Feature 95

**Value:** Before GetWrite ships its own spell checker, this establishes which engine (`nspell` with `dictionary-en`, or `harper.js`) meets the owner's "minimal" bar on the three platforms, and whether Android's WebView honours `spellcheck="false"`, so Feature 95 is built on a measured choice and not a guess. It delivers no writer-facing change.
**Vertical slice:** A measurement-only pass, producing no behaviour change in the shipped app. For each candidate engine, in a Web Worker (the design the owner leans to) on hosted web, in the desktop window and in the Android WebView: load time (cold and warm), suggestion time, download size (the dictionary and any WebAssembly included), memory, and the time to check a long document, with a long-document fixture stated in the result. Plus one check per platform that an editor element with `spellcheck="false"` shows no native underline (Android WebView included). The deliverable is a recorded result and an engine recommendation, in `specs/features/spell-checker-engine-spike/experiments.md`; the owner decides the engine at the gate that follows. Seams: none in the app beyond a throwaway harness.
**Requirements covered:** None of its own: it delivers the engine spike that the spell-checker requirement makes a precondition of fixing the engine and of promising any performance limit, a part of that requirement owned by the spell-checker feature.
**User stories:** None
**Depends on:** none
**Branch suggestion:** n/a — measurement only, no feature branch expected (a throwaway spike branch, for example `spike/spell-checker-engine`, if the harness needs committing)
**Notes:** Product spec FR-78 and US-33, added 2026-10-25. This entry is this document's own scoping call, confirmed at Gate 2, 2026-10-25 (F94-1): a separate measurement feature follows the precedent of Features 57 and 78, because the engine "is not final until a spike has measured `harper.js` against `nspell`" (FR-78) and every later slice depends on that choice. The alternative, the spike as the first task of Feature 95's task list, was F94-1, resolved as above. Package installs (`nspell`, `dictionary-en`, and `harper.js` for the spike) are the owner's decision: the owner runs `pnpm add`; the pipeline does not install them. Licences as read from the npm registry: `nspell` MIT, `dictionary-en` "MIT AND BSD", `harper.js` Apache-2.0; notices for whichever ship are Feature 95's work. No size, time or memory limit is promised in advance (OQ-129); the spike records numbers and the owner sets any limit after seeing them. NOT MEASURED: everything the spike is for (load time, suggestion time, download size, memory, long-document behaviour on any platform, what each platform underlines today including Android in Capacitor, whether Android honours `spellcheck="false"`). READ, not run: the editor sets no `spellcheck` attribute today (F94-2: no contradiction with OQ-124, which is the design). The Android measurement is an owner step on the owner's phone. Nothing here was run by the feature breakdown. The spike must not be run on the owner's real projects; use a throwaway projects folder. Folded into Feature 95 (Owner decision, Gate 2, 2026-10-25, overriding the F94-1 default): the engine spike is the first task of Feature 95 (its Part 0), with a halt for the owner's engine choice, and Feature 94 is not built separately. The scope above is unchanged and carried by Feature 95; the result is recorded in `specs/features/spell-checker/experiments.md`, not in the `spell-checker-engine-spike` path named above, and the throwaway spike branch is not needed because Feature 95's branch carries the harness.

### Feature 95: A built-in spell checker in the editor — underline, replace, Ignore, Add to the project, app-wide switch — Merged, not released

**Value:** A writer on deadline sees a real misspelling underlined the same way on the web, on desktop and on Android, can replace it from suggestions, can Ignore a flagged word or Add it to the project's own word list so a name or term used on purpose is not flagged again, and can turn the checker off and on for the whole app, with the change applied at once to every open project. Entity names and aliases are never flagged. This is the smallest slice a writer can use on its own.
**Vertical slice:** All layers. Data: two keys in project.json `config`, the project word list and the separate ignore list, written under `withMetaLock` / `updateProjectJson` through a core, a route and a native-backend pair so they work on Android (the shape of `project-noise-words-core.ts:115-134`); an app-wide on/off setting, default on for everyone including existing users. Part 0, first task (folded in from Feature 94, Owner decision, Gate 2, 2026-10-25): the engine spike, measuring `nspell` with `dictionary-en` against `harper.js` in a Web Worker on web, desktop and Android, after which the run halts for the owner to choose the engine, and no engine-dependent code is written before that choice. Logic: the engine the owner chooses after Part 0, run in a Web Worker, with a known-word set made of the dictionary, the project list, the ignore list, and entity names and aliases derived at check time from the cached entity alias table (`entityAliasTableSlice`) and not copied into either list; a TipTap decoration that underlines unknown words in the editor body only. Interface: a context menu on a flagged word offering suggestions ("replace with"), Ignore and Add to project dictionary; an on/off control in app settings; a "Spelling" tab in Project Settings to view and remove words in the project word list and the ignore list, following `NoiseWordsSettingsTab.tsx` (per-word remove at line 180) (F94-4, option d); every other text field and the Markdown source view explicitly set `spellcheck="false"` so nothing relies on the native checker; the editor body itself sets `spellcheck="false"` so no native underline ever shows. Design points left to the feature spec, not decided here: where the app-wide switch is stored and how a change reaches open editors (today's only app-wide preference store is localStorage, `frontend/src/lib/user-preferences.ts:163-239`, which is per browser and origin and has no change notification); how multi-word entity names are tokenised; whether compile or an export bundles project.json (export does not read `config`: no `config` reference in `export-core.ts`; compile not checked); how the editor context menu (Feature 67) takes the new entries.
**Requirements covered:** FR-78
**User stories:** US-33
**Depends on:** none
**Branch suggestion:** feat/spell-checker
**Notes:** Product spec FR-78 and US-33, added 2026-10-25 (owner request: "the last thing I want to add before release", a minimal checker to start). Owner decisions at Gate 1, 2026-10-25: OQ-120 to OQ-129, all resolved and carried here, not reopened: Ignore is a per-project list in project config, separate from the project word list (OQ-120); English only from `dictionary-en`, no language setting (OQ-121); suggestions in v1 (OQ-122); editor body only (OQ-123); native checker never relied on (OQ-124; F94-2 resolved: the editor body will set the attribute, Feature 95 adds it); project and ignore lists in project.json `config`, user list in three platform stores (OQ-125, the user list is Feature 96); entity names and aliases derived at check time (OQ-126); switch app-wide, default on (OQ-127); on a paired device adding a word defaults to the project list (OQ-128); no performance limit until measured (OQ-129). Split proposal, for the owner: FR-78 divides into three independently shippable slices. Feature 94 (spike) has no writer-facing value and ships nothing. Feature 95 (this one) is the smallest release-worthy slice: a checker without Ignore and Add would flag every character name again and again, which is the complaint in US-33, so Ignore, Add to the project and the switch are inside it, and entity names are inside it because they are the largest source of deliberate unknown words in fiction and share the known-word set with the lists. Feature 96 (the cross-project user list) can follow: without it a writer adds a word once per project. One feature rather than several for the checker itself: engine, decoration, menu, lists and switch cannot be used apart (an underline with no way to dismiss it, or a list with no underline, delivers nothing). Entity names are the part most easily cut to a follow-up inside this feature's task list if the owner wants it smaller; that is a task-list choice, not a requirement change. Package installs are the owner's decision: the owner runs `pnpm add` for `nspell` and `dictionary-en` (or `harper.js` if Feature 94 chooses it); the pipeline does not. Licences from the npm registry: `nspell` MIT, `dictionary-en` "MIT AND BSD", `harper.js` Apache-2.0. THIRD_PARTY notices are required for what ships: follow the top-level `THIRD_PARTY_FONTS.txt` precedent (Feature 91: a shipped notice file, an in-app Licences view a later follow-up). Decided at Gate 2, 2026-10-25 (F94-5): a second file, `THIRD_PARTY_SPELLCHECK.txt` (final name left to this feature's spec), at the repo root, with a `frontend/public` copy and an `extraResources` entry in `electron/electron-builder.yml:24-25`, also reaching the `build:native` output; the fonts file is not repurposed (font-specific test `frontend/tests/unit/third-party-fonts.test.ts`). Gate 2 also decided: this feature may be released without Feature 96, the missing user list stated as a known gap in the release notes (F94-3); and list management is inside this feature for the project word list and the ignore list (F94-4, option d), a "Spelling" tab in Project Settings following the noise-words precedent. Each new package needs a justification per `docs/standards/package-selection.md`. Facts: READ, not run: the editor has no spell checker and sets no `spellcheck` attribute; the only `spellCheck` in the editor area is `spellCheck={false}` in `frontend/components/Editor/MarkdownSourceView.tsx:67` (grep, 2026-10-25, re-run by this breakdown; the same attribute is also in `frontend/components/QueryBuilder/AdvancedModeToggle.tsx:99`), so any underline in the editor today comes from the browser or Electron default; the global noise-word list's three stores and the project-config pattern are at `frontend/src/lib/api/global-noise-words.ts:1-46,133-169`, `project-noise-words-core.ts:115-134` and `electron/CLAUDE.md:23`. NOT MEASURED: engine load time, suggestion time, download size and memory on any platform (Feature 94), what each platform underlines today, whether Android honours `spellcheck="false"`, per-keystroke cost of checking a long document. Owner override, Gate 2, 2026-10-25: this feature is carried in this run with the engine spike as its first task (Part 0), replacing the separate Feature 94 (F94-1); the spike results go in `specs/features/spell-checker/experiments.md`, the run halts for the owner's engine choice, and no engine-dependent code is written before it. Where this entry says "Feature 94" or "after Feature 94", read Part 0. Whatever the spike adds that is not chosen is removed afterwards. Nothing here was run by the feature breakdown. Status, 2026-10-26 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED. Implemented on branch `feat/spell-checker`, merged as PR #302, merge commit `57cb0843`; the branch tip merged was `d43efcd2` (72 commits). Spec `specs/features/spell-checker.md`; task list `specs/features/spell-checker/tasks.md` (62 tasks); measurements `specs/features/spell-checker/experiments.md`; user doc `docs/features/spell-checker.md`; release note `specs/features/spell-checker/release-note.md`. Engine: `nspell` with `dictionary-en` (owner decision after the Part 0 spike, 2026-10-25); `harper.js` removed. Built: wavy underline in the editor body from a classic Web Worker with same-origin assets (offline); a spelling group in the editor context menu (up to 5 suggestions, Ignore, Add to project dictionary) by right-click, the context-menu key or a touch long-press; the project word list and ignore list in project.json `config` with a Project Settings Spelling tab; the app-wide switch in App Settings, stored per origin in `localStorage`; entity names and aliases as known words; `THIRD_PARTY_SPELLCHECK.txt`. Two defects found in the real-app check and fixed before merge: a project created in-session was not checked until reopened (FR-46) and touch had no spelling menu (FR-47). Final suites, measured on 9782d930: typecheck 0; lint 0 errors / 392 warnings; test:ci 701 files, 8691 passed, 7 expected fail, 1 skipped; test:e2e 230 passed, 1 skipped; CLI 153; electron 528; knip with no new findings against main. Exercised: built web and packaged desktop offline; Pixel 7 Pro (Android 17, WebView 155.0.8059.43) offline with scripted `adb` presses (finger presses not measured). Known gaps: no user-level list (Feature 96); the spelling copy of the alias table is not refreshed on entity edit until reopen (POS task_2da52ad1); on Android, Cut/Copy after a long-press on a non-flagged word act on the editor's previous selection (task_0162a56f) and the menu can pass the right screen edge (task_ea1bcc80); a newly created project does not fetch the entity-highlighting alias table (task_a01aea7f). Amendment 2026-10-26: the known gap "no user-level list (Feature 96)" is closed by Feature 96, on branch `feat/spell-checker-user-list` and not merged; this entry records Feature 95 as merged. Amendment 2026-10-26, later: Feature 96 merged as PR #307.

### Feature 96: A user word list that follows the writer across projects — Merged, not released

**Value:** A writer who adds a word to their own dictionary (not to one project) has it treated as correct in every project they open on that device, so a term they use everywhere is not flagged project by project.
**Vertical slice:** Data: a user word list in three platform stores, following the global noise-word list: desktop `userData` through IPC (`getDesktopBridge`), hosted web in a server-side tenant-root file behind an /api route, Android in a device file; not synced across platforms. Logic: the user list joins the known-word set Feature 95 builds, so a word in either list is correct; the paired-device rule, adding defaults to the project list and adding to the user list happens from the desktop window. Interface: an "Add to my dictionary" entry in the flagged-word menu, absent or refused for a paired device, beside Feature 95's "Add to project dictionary". Plus a view and remove section for the user list in App Settings, following the global noise-word list in `AppSettingsDialog.tsx` and `NoiseWordsSettingsTab.tsx` (per-word remove at line 180) (F94-4, option d).
**Requirements covered:** None of its own: it delivers the user-list part of the spell-checker requirement (the user list of the two word lists, and the paired-device placement rule), owned by the spell-checker feature.
**User stories:** US-33
**Depends on:** Feature 95
**Branch suggestion:** feat/spell-checker-user-list
**Notes:** Product spec FR-78, OQ-125 and OQ-128 (Gate 1, 2026-10-25, resolved). Separable from Feature 95 because Feature 95 is usable with the project list alone; it is a slice of its own because it adds three stores, an IPC channel, a route and a native backend, a different kind and size of work from the editor behaviour. Owner decision, Gate 2, 2026-10-25 (F94-3, option (c)): Feature 95 may be released without this feature, and the missing user list is stated as a known gap in the release notes; FR-78 says two lists exist and a word in either is correct, so a release with Feature 95 alone does not yet meet FR-78 as written. Also decided at Gate 2 (F94-4, option d): the user list's view and remove section in App Settings is built inside this feature. Evidence for the store pattern is READ, not run (`frontend/src/lib/api/global-noise-words.ts:1-46,133-169`, `electron/CLAUDE.md:23`). Not synced across platforms by decision. NOT MEASURED: behaviour on a paired device (the desktop-window-versus-paired-device distinction uses Feature 75's window secret and classification, not re-read here). Package installs: none beyond Feature 95's. Nothing here was run by the feature breakdown. Status, 2026-10-26: PARTIAL, on branch `feat/spell-checker-user-list`, not merged and not released. Tasks 1 to 22 are committed there. A read and mutation ordering fix and a knip tidy are committed (`55eafa38`: a list read never replaces a newer add or remove result). Task 23, the real-app check, was MEASURED on web, on desktop (a throwaway packaged build, port 7340 approved by the owner) and on Android, including offline; the record is in `specs/features/user-word-list/experiments.md` (`d67ddfc2`). It found four defects. Defects 1 to 3 (App Settings section heading and spacing, the clipped Add word button, the failure shown twice with internal wording) are fixed (`59ec0edb`). Defect 4 (no cue in the editor while the list read has failed) became FR-24, the editor footer cue, built as Task 25 (`e91eb591`). Task 24, the final suites, were run on `e91eb591`: typecheck clean; lint 0 errors; test:ci 717 files, 8946 passed, 7 expected fail, 1 skipped; test:e2e 247 passed, 1 skipped; electron 552 passed; knip exit 1 with no item from this branch (every listed name exists on main). NOT measured: a paired phone (the paired checks used `curl` and desktop Chromium on the same machine), finger presses on Android (all phone input was `adb shell input`), and the desktop sharing toggle and restart through the UI (done through the bridge). Task list `specs/features/user-word-list/tasks.md`. The known gap "no user-level list" in Feature 95's release note and `docs/features/spell-checker.md` has been removed from both; Feature 95 itself is unchanged. Merged, 2026-10-26 (verified with git by the pipeline lead): MERGED to `main` and NOT RELEASED, as PR #307, merge commit `57e1f1c2`; the branch tip merged was `94968d21`, which adds a follow-up real-app record (finger presses, the editor cue on the phone, the sharing switch and restart through the UI, and a paired phone in Chrome, all MEASURED). Known gaps after merge: on Android a damaged list file gets the generic failure text (POS task_7e0626da); in the first project opened after a launch on the phone the editor text drew light on a light surface, seen twice, cause not established (POS task_66ece5f1).

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
  - FR-33: Feature 45
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
  - FR-42: Feature 31
  - FR-43: Feature 43
  - FR-44: Feature 44
  - FR-45: Feature 58
  - FR-46: Feature 60
  - FR-47: Feature 61
  - FR-48: Feature 59
  - FR-49: Feature 62
  - FR-50: Feature 59 (owner; Features 60, 61 and 62 follow it for their own transports)
  - FR-51: Feature 68
  - FR-52: Feature 69
  - FR-53: Feature 69
  - FR-54: Feature 70
  - FR-55: Feature 70
  - FR-56: Feature 70
  - FR-57: Feature 72
  - FR-58: Feature 72
  - FR-59: Feature 72
  - FR-60: Feature 72
  - FR-61: Feature 72
  - FR-62: Feature 73
  - FR-63: Feature 73
  - FR-64: Feature 73
  - FR-65: Feature 74
  - FR-66: Feature 75 (Features 78 and 79 deliver its two-client test and
    its last-save-wins statement, none of their own; Feature 80 serves it
    by changing the port, none of its own)
  - FR-67: Feature 75 (Feature 76 delivers its device-management part and
    Feature 77 its capability-limit parts, none of their own; Feature 80
    delivers none of it)
  - FR-68: Feature 75 (Feature 77 delivers its unlock-and-lock limits part;
    Features 78 and 79 deliver none of it)
  - FR-69: Feature 81 (Features 82 to 85 deliver its coverage, runtime and
    CLI, Upcoming-section and upkeep parts, none of their own)
  - FR-70: Feature 90 (writer-made project types, D-1)
  - FR-71: Feature 90 (paragraph leading follows the project line height,
    D-10)
  - FR-72: Feature 91 (one font dropdown)
  - FR-73: Feature 91 (fonts bundled with the app)
  - FR-74: Feature 91 (shared typography inputs in the Project Type
    Manager)
  - FR-75: Feature 91 (matching input heights in Project Settings)
  - FR-76: Feature 92 (overlapping saves to project.json or a resource sidecar keep every change)
  - FR-77: Feature 93 (a save never puts back an older value; overlapping server writers keep each other's change)
  - FR-78: Feature 95 (a built-in spell checker, whose first task is the engine spike folded in from Feature 94; Feature 96 delivers its user-list part, none of its own)
  - Features 86, 87 and 88 (defect fixes, added 2026-10-15) carry no
    requirement of their own: each corrects behaviour that an earlier
    feature owns and adds no capability, the same device Features 37, 38
    and 76 to 80 use
- Unassigned requirements: none

## Summary

- Total features: 96
- Suggested build order: 72 → 73 for resource subtype (73 needs 72's
  sidecar key; 72 has since shipped and merged to `main` (PR #260,
  2026-10-08), and 73 has since shipped and merged to `main` (PR #261,
  2026-10-08)). Features 1 through 23
  are already shipped
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
  parent feature. 26 (Trash UI) has shipped (merged 2026-09-14 as
  `2f180cd5`), depending only on the already-shipped Feature 1; a set of
  post-merge follow-up refinements is tracked separately (see Feature 26's
  own Notes). 24 (Organizer filters) has since shipped too (merged in PR
  #249 as `f1254f76`), depending only on the already-shipped Feature 11. Of
  the remaining pre-existing work: 25 (signed installers) and 27 (search
  across revisions) are independently startable now. 28 (hosted multi-device
  access) must land before 30 (its conflict-resolution model, which depends
  on it). 29 (durable search backend) is contingent on demonstrated need
  rather than sequenced by dependency. 31 (Scrivener CLI importer) has
  shipped, having depended only on the already-shipped Feature 2. 43
  (Scrivener UI import flow) and 44 (repeatable Scrivener import) both
  depended on 31 shipping first, per the CLI-first sequencing the parent
  spec's resolved OQ-14 settles. 43 has since shipped too (merged
  2026-09-13 as `e2768ed4`), wrapping 31's conversion logic in a UI; 44
  needs 31's one-shot conversion to already exist before a re-run/merge
  strategy can build on it and has not started. 43 and 44 did not depend on
  each other and could be built in either order once 31 had shipped.
  45 (Word/DOCX importer) has shipped, carried forward through the pipeline
  (owner decision, 2026-09-13; parent spec FR-33) and depending on the
  already-shipped Feature 2 and, for its UI and CLI delivery pattern, the
  already-shipped Features 31 and 43 — its own DOCX parsing was new work
  with no Scrivener conversion logic to reuse. 32 (joining search and
  query predicates) depends on the already-shipped Features 8 and 9. 42
  (removing an entity declaration) has shipped, having depended on the
  already-shipped Features 33 and 38 — 33 for the entity declaration it
  reverses, 38 for the authored edges its keep/delete-edges choice acted on.
  48 (transport response-body validation) has shipped, having had no
  dependency on any other feature — it was cross-cutting work over the
  existing `frontend/src/lib/api/` call sites. 49 (native Trash transport)
  has shipped, having depended on the already-shipped Feature 26, whose
  native gap it fills; its own two steps — the `trash-core.ts` extraction,
  then the native backend built on it — landed as two separately merged
  pull requests, extraction first. 50, 51, 52, and 53 (the deferred
  remainder of Feature 48's transport-boundary validation, re-measured at
  21 sites across 12 modules — see the parent spec's OQ-33) were regrouped
  by transport mechanism at Gate 2 review, 2026-09-17 (owner decision — see
  this document's Open Questions): 50 covers the 12 degrade-to-fallback
  sites across 7 modules (`resources.ts`, `entity-relationships.ts`,
  `tags.ts`, `mentions.ts`, `entity-cooccurrence.ts`,
  `entity-mention-counts.ts`, `resource-excerpts.ts`); 51 covers the 5
  status-only-reject, unchecked-success-cast sites across 3 modules
  (`resources.ts`'s `patchRevisionContent`, `compile.ts`, `export.ts`); 52
  covers the 1 separate-error-body-parse site (`encryption.ts`); and 53
  covers the 3 one-body-serves-both-outcomes sites across 2 modules
  (`editor-config.ts`, `preferences.ts`). Each still depends only on the
  already-shipped Feature 48 for its shared validation mechanism, not on
  one another, and can be built in any order or in parallel; all four —
  50, 51, 52, and 53 — have since shipped (52 and 53 together, in one
  combined implementation pass via
  `specs/features/transport-validation-remaining-sites.md`, merged in PR
  #248/merge commit `6f7ac3f5`), completing Feature 48's deferred
  transport-boundary-validation remainder in full. 54, 55, 56, and 57 (the
  locked-access survey's breakdown, added 2026-09-17 per the parent spec's
  locked-access constraint and its OQ-36/OQ-37) each depend only on the
  already-shipped Feature 23 and not on one another; 54 and 55 were sized as
  alternatives for the same choice rather than a sequenced pair — see each
  entry's Notes for the trade-off — and the owner's pick, 54, has since
  shipped, superseding 55 (closed, not built). 56 (CLI) has also since
  shipped, and 57 (native measurement) closed as a completed measurement;
  both were independent of 54 and 55 and of each other, since neither the
  resolution-layer gate nor its interim alternative reaches the CLI or
  native transport.
- Home-network serving (Features 75 to 80; FR-66 to FR-68, amendment of
  2026-10-09; build order): the owner chose Feature 75 to carry forward in
  this pipeline run (Gate 2, 2026-10-09); Feature 75 has since been merged to `main` (PR #263, merge commit `1160bf6e`, 2026-10-09) and is not released; Feature 76 has also been merged (PR #264, merge commit `44ae6ca3`, 2026-10-10) and is not released; Features 77, 78, 79 and 80 remain
  Not started and each needs its own pass. 75 first, on its own, because it
  carries both the network bind and the pairing gate (see its Notes for why
  they cannot be split: no shippable state may have the server reachable from
  another device without the gate on every route and page). Inside 75 the
  gate is built and tested before the bind is changed. Then 76 (device list,
  rename, revoke), which has merged. Then 77 (the limits, decided at Gate 1
  and Gate 2, 2026-10-10: its first tasks are the two measurements, the
  classification on a POST and projectId validation, followed by a stop with
  the results reported to the owner; then the five limits, their store,
  desktop switches, route enforcement, read route, passphrase-prompt
  suppression, the paired-browser experience, and the conditional projectId
  fix), depending on 75 and 76 only. 78 (the
  two-client save measurement) has no dependency in its logic and could be
  run at any point, subject to its open point on how a mobile second client
  reaches the server before 75 exists; 79 (the in-app last-save-wins
  statement) depends on 75 and 78. 80 (the desktop server's port change) has
  no dependency. Build order is not release order (owner decision, Gate 2,
  2026-10-09): 75 may merge to `main`, but no release containing 75 goes out
  until 76, 77 and 80 are merged; the owner merges the release PR by hand, so
  the hold is enforced at that step; 75 and 76 are now merged and the hold is
  in force, waiting on 77 and 80. Owner decision, 2026-10-09: 80 need not
  precede 75's build, because 75 is specified against a single port source
  and does not depend on its value, but 80 MUST be merged before any release
  containing 75, because a paired device saves the desktop's address (host
  and port).
  Spell checker (FR-78, added 2026-10-25): 95 (the checker, whose first task is the engine spike folded in from Feature 94, with a halt for the owner's engine choice: underline, replace, Ignore, Add to the project, app-wide switch, entity names; the smallest release-worthy slice) → 96 (user word list across projects; may follow 95).
- Independently shippable: 95 (spell checker, engine spike as its first task, no dependency), 93 (stale saves and index races, no dependency; follows 92 in intent only), 92 (overlapping saves to project.json, no dependency), 86, 87 and 88 (the defect features, no dependency), 81 (the user handbook's first slice; 82 to 85 each depend on 81 only), 75, 78 and 80 (the home-network features with no dependency), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 48, 49, 50, 51, 52, 53, 54, 55, 56,
  57, 58, 59, 60, 61, 62, 64, 65, 66, 70, 72, 73, 74 (Features 72, 73 and 74 having all merged; 30 and 28 are the only pair left with an unmet hard dependency;
  Feature 31 and Feature 43 have both since shipped, so 44's former
  dependency on 31 and 46/47's former dependency on 43 are now satisfied)
- Not yet built: 27, 28, 29, 30, 32, 44, 46, 47, 79. Everything
  else in this list has shipped, apart from Features 75 and 76, which are
  merged to `main` but release-held (Feature 24 shipped, merged in PR #249 as
  `f1254f76` — see its own entry's Notes; Feature 26 shipped on
  hosted web and Electron desktop; its native Android gap shipped
  separately as Feature 49; Feature 48's own deferred remainder is tracked
  separately as Features 50-53, all of which have since shipped — 50 and
  51 each their own pass, 52 and 53 together in one combined pass (PR
  #248/merge commit `6f7ac3f5`) — completing that initiative in full; the
  locked-access gap was tracked as Features 54-57, of which 54 and 56 have
  since shipped, 55 was superseded by 54 and will not be built, and 57
  closed as a completed measurement; Feature 65 shipped, merged in PR
  #250 as `309658a6` — see its own entry's Notes).
- User handbook (Features 81 to 85, added 2026-10-14): build 81 first; then 82, 83, 84 and 85 in any order or in parallel, each depending on 81 only. 85 can ship before 82 to 84 since the link check and the rule need only the handbook to exist; 84 should follow reading the release state. Risk: 81 is mostly verification of 21 existing pages that were not checked against the app when written, so its size is the size of that checking.
- Defect features (Features 86 to 88, added 2026-10-15; Feature 89 added 2026-10-18 from a later triage, see its entry): fixes for app defects found during the Feature 81 handbook verification (42 defects, D-1 to D-42, recorded in `specs/features/user-handbook/verification.md`), scoped by three read-only code investigations that did not run the app. 86 (query correctness: D-16, D-17, D-19, D-20), 87 (saves that lose or omit data: D-9, D-26/D-29, D-36, D-3/D-39) and 88 (desktop: D-8, D-2, D-40) have no dependency on one another or on any other feature and can be built in any order or in parallel; each can also be cut by defect. 88 holds two checks, not fixes: whether a packaged build hits D-8, and whether D-40 is a product defect at all or a fault in the verification script. Every cause is labelled in each entry's Notes as CONFIRMED, READ or HYPOTHESIS; a hypothesis is not stated as a cause. Sizes: 86 M to L, 87 M to L, 88 S to M. Not placed in these three features (later, or awaiting an owner decision): D-6, D-35, D-1, D-28, D-30, D-31, and two groups of defects not yet investigated; see Open Questions. Added 2026-10-19: Feature 90 (D-1 and D-10, FR-70 and FR-71, Not started, no dependency) owns two requirements and combines two parts that can be cut independently (D-1 L, D-10 S to M); D-1 is therefore no longer awaiting an owner decision.
- Risks (added with Features 75 to 80): Feature 75 is large (bind, gate on
  every route and page, pairing, window exemption, two statements) and its
  gate has to cover surfaces not all behind one seam; Feature 77 cannot be
  built as described if the window-exemption mechanism chosen in Feature 75
  cannot tell the desktop window from a paired device at the route level;
  Feature 78's outcome is unknown until the measurement is run, and how it is
  run with a mobile second client before Feature 75 exists is open; the
  outcome decides Feature 79 and may change the promise or the save path
  (carried default: ship sharing without the statement). Feature 80's port
  value is undecided, and a port changed after writers pair devices breaks
  their saved addresses, hence the decided merge-before-release ordering
  (owner decision, 2026-10-09).
  Risks added 2026-10-10 with the Gate 2 folding of the limits work into
  Feature 77: Feature 77 is the largest of the limits work (two
  measurements and a stop, store, IPC, shared route check across three
  route families, a new read route, the prompt suppression, the
  paired-browser experience, desktop switches, one conditional fix) and its
  design rests on a result it has not yet produced (the classification on a
  POST); if that fails, route-level enforcement needs another design. The
  conditional `projectId` task may turn out to be no work. Defaults on mean
  an upgraded, already-paired device loses abilities until the writer
  switches them back on.
  Interim exposure between 75 and 77 is described in Feature 75's Notes and
  is closed by the release hold, not by build order. Features 75 and 76 are
  merged and unreleased (2026-10-09 and 2026-10-10); until Features 77 and 80
  are merged, a paired device can lock, unlock and delete projects (it can be
  revoked from the desktop app since Feature 76), so nothing containing
  Feature 75 may be released. Also unverified after the merge: any forged request from a
  second device against the finished gate, and `.local` names (the gate's
  `.local` name comes from `os.hostname()`, which differed from the Mac's
  Bonjour name).
  Update, 2026-10-19: forged requests against the finished gate were
  measured (37, all refused; see Feature 75's Notes), the sharing-off hole
  found the same day was fixed in PR #277, and the owner lifted the release
  hold; Features 75 to 77 are now "Merged, not released". The `.local` name
  check remains unverified.
- Risks: Feature 30 is undesigned — its Vertical slice describes a
  resolution policy still to be chosen, so its task breakdown will need a
  design decision before implementation tasks can be written. Feature 28 is
  the largest slice in this list (hosted tenancy + sync transport) and is
  likely to need its own further feature breakdown rather than a single
  task list, though substantial foundations already ship. Feature 31 has
  shipped; its RTF-parsing approach was measured against a real Scrivener
  project's 75 RTF files rather than left as an unverified assumption about
  Scrivener's undocumented `.scriv` container format
  (`specs/features/scrivener-cli-importer.md`'s OQ-4: bold/italic control
  words appeared in the majority of files, Unicode escapes in under half,
  and no file exercised underline, tables, images, strikethrough, or a
  Scrivener-specific link/annotation control word). Feature 45 has shipped
  (carried forward through the pipeline, owner decision, 2026-09-13; parent
  spec FR-33), and its feature spec (`specs/features/docx-importer.md`)
  records that the equivalent format-parsing risk went unmeasured for
  DOCX at ship time — no real `.docx` sample was surveyed the way
  `import-inputs/The SF Sideshow.scriv` grounded Feature 31's OQ-4; testing
  relied on synthetic fixtures instead. Feature 43 has
  since shipped: it depended on Feature 31 and did not carry Feature 31's
  former unmeasured-format risk by inheritance, since it was a UI wrapper,
  per FR-43, around already-shipped conversion logic — its own risk was
  confined to the Electron main-process directory-picker handoff, settled
  in that feature's own feature spec (`specs/features/scrivener-ui-import.md`).
  Feature 44's dependency on Feature 31 is now satisfied, but it remains
  undesigned in the same sense Feature 30 and Feature 38 are — see its own
  entry. Feature 27 merges two
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
- Observed maintenance pattern: this document's statuses are not updated
  when a PR merges, so entries go stale one at a time until someone
  cross-checks them against the tree. Features 26, 48, and 49 were corrected
  earlier in one 2026-09-22 session, then 50, 54, 55, and 56 in the same
  session — eight stale entries found and fixed in a single pass.

## Open Questions

User handbook split (Features 81 to 85; this document's own scoping call, 2026-10-14; the owner's decisions OQ-86 to OQ-91 are carried, not reopened). New scoping questions, not answered here:

- **Resolved: do pages absorbed in Feature 81 have to be fully verified in that slice?** The handbook requirement says no unverified statement may appear and every page carries a verified-against line, so absorbing 21 unchecked pages means checking 21 pages before anything ships. Carried default: Feature 81 verifies every page it absorbs and drops any statement it cannot verify (smaller pages, never unverified ones). Alternative for the owner: absorb a subset first and leave the rest as stubs pointing at the old pages until checked. Owner decision, Gate 2, 2026-10-14 (answer "1a"): option (a), the carried default. Feature 81 verifies all 21 absorbed `docs/user/` pages in one slice; a statement that cannot be verified is dropped, not shipped; every page has its verified-against line; no split into 81a/81b.
- **Resolved: what exactly is the "version or commit" in the verified-against line?** A commit hash cannot be known inside the PR that creates the line, and a release version is only known at release. Carried default: the line names the app version in `package.json` at the time of checking plus the base commit it was checked on. Not decided by the owner. Resolved from evidence by triage, accepted at Gate 2 (2026-10-14) without objection: the line is the app version from root `package.json` plus the base commit the page was checked against, not the PR's own commit (unknowable inside the PR). Evidence (read, not run): `.release-please-manifest.json` is `{".": "2.2.0"}`; root, `frontend` and `electron` `package.json` are all 2.2.0; the top `CHANGELOG.md` entry is 2.2.0 dated 2026-09-24; the version changes only at release, so for unreleased code the line reads like "app version 2.2.0 plus unreleased changes up to commit X". That wording is the triage's suggestion (medium confidence); Feature 81 defines the final form.
- **Resolved: where does the definition-of-done rule live, and who enforces it?** The pipeline's definition of done is outside this repository (`saboteur-labs/ai-workflows`, not read here); this repository can add a review checklist item and a CI link check but not change the pipeline. Carried default: Feature 85 records the rule in this repository's own contributor-facing instructions and adds the CI link check, and the pipeline-side change is raised with the owner separately. Owner decision, Gate 2, 2026-10-14 (answer "2 your rec"): all three parts of the recommendation. (a) A new `docs/standards/user-handbook.md` holds the rule (a writer-visible change updates the handbook in the same PR; the verified-against line is refreshed), is listed in `CLAUDE.md`'s "Key standards", and gets a line in `.claude/skills/implement-feature/SKILL.md`. (b) A new `.github/pull_request_template.md` carries a "writer-visible change: handbook updated" checkbox (the owner opens PRs by hand). (c) A request to the owner to change the definition of done in the external `saboteur-labs/ai-workflows` pipeline, which this repository cannot change. Only the link check is mechanically enforced.
- **Resolved: who clears `status: unreleased` at release time, and by what step?** Carried default: the release PR (release-please) is not changed; clearing the marker is a handbook edit made in the same PR as the release's last feature or by the owner when merging the release, to be decided in Feature 85's spec. Owner decision, Gate 2, 2026-10-14 (answer "3b"): a follow-up handbook PR opened right after the owner merges a release PR, its description naming the release version and the pages cleared; written into Feature 85 as a release-checklist step. A CI stale-marker check is deferred. Evidence (triage, accepted without objection): clearing is a manual step, because release-please config (`.release-please-config.json`) cannot edit Markdown front matter and the owner merges the release PR by hand.
- **Resolved: how is the link check run?** (Raised and answered at Gate 2, 2026-10-14; the owner's answer "4b".) Owner decision: a new workflow `.github/workflows/handbook-links.yml`, filtered on `docs/user/**` and `README.md`, running a small dependency-free Node script that checks relative links only (per FR-69(g)).
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
  (`getEntityMentionedIn`) — it does not currently look up which _other_
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

FR-39/FR-40/FR-51 amendment (Feature 68, added 2026-10-01):

- Feature 68's default hop count for focal-point selection's ego-graph
  hop-filter, and whether/how a writer can adjust it, is not decided here
  and is left to that feature's own feature spec, per the parent spec's
  OQ-52 (resolved), which explicitly defers rather than decides this.
- Whether a hop-filter-hidden node's persisted-but-not-drawn position/edges
  still count toward another visible node's hop distance is unresolved and
  is left to Feature 68's feature spec, per the parent spec's OQ-52
  (resolved), which flags this interaction without resolving it.

FR-42 split (this document's own scoping call, 2026-09-11):

- **Resolved 2026-09-11 in the Feature 31 feature spec
  (`specs/features/scrivener-cli-importer.md`): Feature 31's exact CLI
  subcommand name and invocation shape.** Previously open here as "not
  decided and left to that feature's own task breakdown."
- **Resolved 2026-09-11 in the Feature 31 feature spec
  (`specs/features/scrivener-cli-importer.md`): whether Feature 31 splits
  further into a binder-plus-text slice and a separate metadata-mapping
  slice.** It does not split; the feature spec confirms the combined scope
  ships as one feature (see Feature 31's Notes for the reasoning this
  document already recorded).
- **Resolved 2026-09-11 in the Feature 31 feature spec
  (`specs/features/scrivener-cli-importer.md`): the exact mapping from
  Scrivener's per-document Label/Status/keywords/custom metadata onto
  GetWrite's metadata layer.** Bold/italic formatting is preserved; Label
  maps onto a custom select field; Keywords map onto leaf-name tags with
  collisions/merges reported to the writer.
- **Resolved in the Feature 43 feature spec
  (`specs/features/scrivener-ui-import.md`), per the parent spec's resolved
  OQ-18: Feature 43's exact UI entry point and main-process handoff design.**
  Previously open here as "not decided and left to that feature's own
  feature spec." The entry point is an "Import" button on `StartPage.tsx`,
  shown only when a desktop bridge is present; the handoff runs through IPC
  channels `getwrite:scrivener-choose-source` (native picker, returns an
  opaque selection handle rather than a path) and
  `getwrite:scrivener-start-import`, with the actual conversion run in a
  separate forked utility process (`electron/worker/scrivener-import-worker.ts`).
- **Resolved (owner decision, Gate 2 review, 2026-09-12): the deferred
  hosted-web/native-Android Scrivener UI import scope gets two placeholder
  feature entries now, not one.** The parent spec's OQ-18 defers Scrivener UI
  import on hosted web and native Android without a defined mechanism (hosted
  web has no multi-file/directory upload today; native Android has no
  directory-picking precedent) — this was previously left open here as
  whether that deferred scope should eventually become its own feature entry.
  The owner chose to add it now rather than wait for a platform mechanism to
  exist, as two separate entries rather than one, since the two platforms'
  blocking mechanisms differ: Feature 46 (Scrivener UI import on hosted web)
  and Feature 47 (Scrivener UI import on native Android). Both are
  placeholders — undesigned, not scheduled, mechanism unproven — and neither
  carries a dedicated FR of its own; see each entry's Notes.
- Feature 44's diff/merge strategy for reconciling a re-import against an
  already-imported project's current state — and how a prior import's
  identity is recorded and linked back to its `.scriv` source — is
  genuinely undesigned and left open, consistent with the parent spec's own
  framing of FR-44 as a MAY-level requirement with no defined mechanism yet.
- **Resolved (owner decision, Gate 2 review, 2026-09-16): Feature 48 is not
  split into two features.** It ships as one feature scoped to Tier 1 plus
  the four named Tier 2 shapes (`ProjectApiEntry`, `EntityRelationshipEdge`,
  `TrashedResourceEntry`/`TrashedFolderEntry`, `EntityAliasTable`) — about 9
  sites across 5 modules. The much larger remainder of Tier 2 was estimated
  at this 2026-09-16 decision point as about 17 further sites across 9
  modules with no existing schema (`tags`, `mentions`, `compile`, `export`,
  `encryption`, `preferences`, `entity-cooccurrence`,
  `entity-mention-counts`, `resource-excerpts`); re-measured 2026-09-17 at
  21 sites across 12 modules (see the parent spec's OQ-33 and this
  document's Features 50-53, which add `resources.ts`,
  `entity-relationships.ts`, and `editor-config.ts` to that list). Either
  figure is explicitly deferred to a tracked follow-up rather than folded
  into this feature or silently dropped. Previously open here as whether
  Tier 1 and Tier 2 should ship as one feature or split into two.
- **Resolved (owner decision, Gate 2 review, 2026-09-16): Feature 48's
  "always surface" plumbing is a new shared helper** — e.g.
  `reportTransportValidationFailure()`, importable by `lib/api/` modules —
  that logs now and provides a single seam to wire a toast or hosted
  telemetry to later. This is new infrastructure and part of Feature 48's
  scope. Rejected alternatives: bare `console.*` per module (developer-only,
  invisible to users and hosted operators) and routing through the existing
  `AppToaster` (transports cannot currently reach it without a circular
  dependency on UI/store code, and it leaves no developer record).
  Previously open here as what that plumbing should be. **Correction
  (2026-09-17):** the "circular dependency" premise for rejecting
  `AppToaster` was measured false — see the Correction note under Feature
  48 above for the evidence (`toast-service.ts`'s single, plain
  `react-hot-toast` import; `run-compile-and-download.ts`'s existing,
  shipped `toastService` usage from a non-component `lib/` module; that
  module's test passing in the node vitest project). The shared-helper
  decision itself stands; only this one stated reason for ruling out the
  toaster was wrong.
- **Resolved (owner decision, Gate 2 review, 2026-09-17): Features 50-53
  regroup Feature 48's deferred 21-site/12-module remainder by transport
  mechanism, not by content severity.** Previously open here as two
  severity-framing judgment calls: (1) whether `resources.ts`'s and
  `entity-relationships.ts`'s degrade-contract sites should fold into the
  contract-shape grouping rather than staying with a "finish the partial
  module" entry, and (2) whether `encryption.ts` belongs with
  `compile.ts`/`export.ts` on a substantial-content/security-relevant
  severity judgment or as its own entry. Both are answered by the same
  decision: the severity framing is dropped entirely, since it forced
  `encryption.ts` and `patchRevisionContent` into placements neither fit
  cleanly. The four groups are now mechanism-defined and partition all 21
  sites with no overlaps and no leftovers: Feature 50 (12 sites, 7
  modules) degrades to a fallback on failure — this answers (1) yes, since
  `resources.ts`'s and `entity-relationships.ts`'s degrade-contract sites
  now sit in the same group as `tags.ts`/`mentions.ts`/etc. by mechanism;
  Feature 51 (5 sites, 3 modules) rejects on status alone with an unchecked
  success cast; Feature 52 (1 site, 1 module) parses a separate error body
  — this answers (2), giving `encryption.ts` its own entry on mechanism
  grounds, not severity; and Feature 53 (3 sites, 2 modules) has one body
  serving both the error and success path. The product owner has chosen
  Feature 50 to carry forward this run; Features 51-53 remain candidates
  for a future pass.
- Feature 53 (`editor-config.ts` + `preferences.ts`'s one body serving
  both the error and success path) needs a concrete schema-validation
  strategy decided in its own feature spec before implementation: whether
  the two response shapes are validated as a discriminated union (error
  variant vs. success variant) or as one lenient schema with every field
  optional. This document does not resolve it, per this document's own
  instructions not to resolve open questions raised by a breakdown. A
  substantive finding bears on that decision without resolving it: all
  three of Feature 53's bodies are already typed all-optional today, so a
  fully lenient schema would validate very little — mostly confirming the
  body parsed as an object — and would mostly add the reporting seam
  rather than catch a malformed field; a discriminated union would
  validate more, but first requires deciding what distinguishes an error
  body from a success body at each site, a candidate discriminant being
  presence of `error` vs. presence of `editorConfig` (or the module's
  analogous success field) / `defaultRevisionName`.
- Resolved by measurement, 2026-09-17: Feature 54's prior expectation that
  its single `adapterFor` change would collapse most of the survey's ~12
  silent-ciphertext-as-data read sites is disproved. A static call-graph
  trace of all fifteen sites (the ~12 read sites plus the write sites) found
  4 surface the new error, 10 are swallowed by an untyped `catch` and become
  silent missing data instead of silent wrong data, and the write half of
  the original claim holds (all three confirmed destructive writes are
  blocked and surface). See Feature 54's Vertical slice for the full
  breakdown and citations. This was a static trace, not an exercised
  measurement, and it surfaced two further unexercised inferences Feature
  54's own task list must settle before or during implementation: (1)
  whether `AsyncLocalStorage` propagates the routed adapter into the
  `setImmediate` callback `enqueueEntityRescan` runs in
  (`indexer-queue.ts:364`, capturing an adapter set up at `sidecar.ts:178`)
  — if not, that site sits outside the gate entirely; and (2) whether an API
  route's own top-level catch would re-swallow a propagated
  `ProjectLockedError` into an opaque 500, unverified because the
  route-level 4xx mapping this feature adds does not exist yet. Also open:
  whether any read site outside the traced fifteen bypasses
  `io.ts`/`currentAdapter()` entirely (the way `convert-project.ts`'s own
  conversion logic deliberately calls `getPlainStorageAdapter()` directly
  rather than going through `adapterFor`) — this document did not survey for
  that pattern beyond the fifteen sites named.
- New: whether Feature 54 and Feature 55 are genuinely mutually exclusive as
  drafted, or whether the owner could choose to run Feature 55 as a
  short-lived stopgap merged and then explicitly superseded by Feature 54
  shortly after — this document frames them as alternatives for one gate
  choice per this skill's instruction to size candidates so the choice is
  meaningful, but does not rule out a sequenced use of both if the owner
  decides the interim risk window is worth the later duplication cost.
- New: Feature 56's audit scope is provisional — only `reindex` was
  confirmed to write into a project directory with no encryption check;
  whether `prune`, `templates`, or either importer command also need the
  same guard was not checked by this survey and is left to that feature's
  own task list.
- New: Feature 57 is scoped as measurement-only with no merged code change
  expected, which is an unusual shape for an entry in this document — its
  Branch suggestion field is `n/a` rather than a real branch name for this
  reason; if the resulting finding shows a live gap, a follow-on feature
  (not yet named here) would carry the fix.
- Features 59-62 (FR-46 to FR-50, amendment of 2026-09-26). Build order: 59 first (OQ-42), then 60, 61 and 62 in any order or in parallel; all four depend only on shipped features (59 on 4, 31 and 45; 60 and 61 on 7 and 11; 62 on 9). Scoping questions, all four resolved below.
- **Resolved: FR-50 owner.** Resolved at Gate 2 by the user ("we'll go with your recs"), 2026-09-26. Feature 59 owns FR-50 (it ships first and adds the first transport). Features 60, 61 and 62 each keep a note that they must follow FR-50 for their own transports.
- **Resolved: where the daily goal lives.** Resolved at Gate 2 by the user ("we'll go with your recs"), 2026-09-26. A new optional `dailyWordGoal` field in project config, next to `wordCountGoal` and named to be clearly distinct from it; the log records only figures. Feature 59's tasks must flag the `schemas.ts` change so it does not collide with Feature 61's edits to the same area.
- **Resolved: daily-goal comparison and imports.** Resolved at Gate 2 by the user ("we'll go with your recs"), 2026-09-26. The comparison shows import entries as a separate line and compares only non-import words against the goal.
- **Resolved: legacy plain-text revisions in Feature 60's roll-up.** Resolved at Gate 2 by the user ("we'll go with your recs"), 2026-09-26. The roll-up shows stored counts with a visible note that older resources with legacy plain-text revisions may read low, per `docs/standards/failure-visibility.md`.

Defect features (Features 86 to 88; this document's own scoping call, 2026-10-15; defect IDs refer to `specs/features/user-handbook/verification.md`). Owner decisions needed, captured and not answered here:

- **Resolved: D-17, resolve relative dates at save time or at evaluation time?** Owner decision, Gate 1, 2026-10-16 (product spec OQ-92, option (a)): evaluation time. A saved "in the last" condition keeps its amount and unit and the span is computed each time the query or smart folder is evaluated; a saved condition reopened in the builder shows the condition chosen. OQ-93 (built-in status list everywhere) and OQ-94 (no migration of saved "includes all of" folders) were resolved at the same gate and are folded into Feature 86.
- **Resolved: D-2, where should the development desktop app's global noise-word list live?** The unpackaged app passes an empty user-data directory (`electron/src/main.ts:124`), so there is no location for it. Owner decision, 2026-10-18: the development app keeps the list in its own `app.getPath("userData")`, the folder its sharing setting already uses (`main.ts:354`); the noise-word handlers stop reading `projectsDirEnvironment().userDataDir`, which stays empty when unpackaged for the projects-folder logic. In the same task, `writeWorkspaceConfig` (`electron/src/projects-dir.ts`) writes to a temporary file and renames it, as `device-store-writer.ts` does, so a crash mid-write cannot truncate `workspace.json` in either build. Not changed: an unreadable `workspace.json` still reads as empty, and the next write keeps only the field being set (a separate decision). Read, not measured: the development and packaged builds are expected to use different user-data folders (`getwrite-electron` from `electron/package.json`, `GetWrite` from `electron-builder.yml`'s `productName`); the check is to log `app.getPath("userData")` in both builds.
- **Resolved: D-38, how to validate projects one by one, and how is a bad project flagged?** One wrong-typed project hides all projects because `frontend/src/lib/api/projects.ts:101` validates the whole list at once (READ). Candidates the scoping named: per-entry client parsing, or server-side per-project validation. "How a bad project is flagged" is resolved: OQ-96 (a), Gate 1, 2026-10-18, an unopenable card with a reason, for every project with an unusable `project.json` (Feature 89). "Where validation happens" stays open and is carried into Feature 89's feature spec as a design point. Not in Features 86 to 88; now Feature 89, part 1. Resolved 2026-10-18, Feature 89 feature spec OQ-1 (Gate 3): validated per project in `listProjectsCore` against `ProjectSchema`; the client stays strict, with a third list-entry member. Merged as PR #274.
- **Resolved: D-1, writable project types or a read-only manager?** Resolved by owner direction, 2026-10-19: writable ("it makes no sense to have a form without a way to save"); product spec FR-70, Gate 1 decisions OQ-97 to OQ-100; now Feature 90 (with D-10, FR-71, as one combined feature by owner decision, 2026-10-19). The earlier sizing stands: writable types are L (templates are read-only when packaged); making the manager read-only (S) was not taken.
- **Open: D-28, the organizer-card-filtering spec's FR-1 conflicts with its FR-2.** The Organizer's Draft filter matches resources with no status, which is FR-2 of `specs/features/organizer-card-filtering.md`, while its FR-1 offers a "no status set" option. Which governs is not decided.
- **Open: D-30, commit `4528bfd2` conflicts with `STYLE.md`.** Timeline lane packing was changed deliberately on 2026-09-30, against `STYLE.md:384`. Which is to change is not decided.
- **Open: D-31, `STYLE.md` prescribes the repeated labels.** The Timeline's repeating axis labels are prescribed by `STYLE.md:334`; whether the handbook's report of them as a defect stands, or `STYLE.md` changes, is not decided.
- **Open: D-6 and D-35, which feature do they go into?** D-6: an uploaded image or audio file gets `orderIndex` 0 (`uploadMediaResourceCore`, `resource-crud-core.ts:206-224`), so the order changes after a reload (HYPOTHESIS, size S/M). D-35: graph saved positions are checked against the default connection types before the project settings load, and `EntityGraphCanvas.tsx:1144-1180` skips already-placed nodes (HYPOTHESIS, size S/M). Not placed in Features 86 to 88.
- **Open: the two groups of defects not yet investigated.** The "stale until reload" group (D-4, D-5, D-14, D-18, D-21, D-22, D-33) and the display and wording group (D-7, D-10, D-11, D-12, D-15, D-23, D-24, D-25, D-27, D-32, D-34, D-37, D-41, D-42) have no scoping, no cause label and no feature, except that D-10 is no longer uninvestigated: it is now Feature 90, with D-1 (2026-10-19). D-11 and D-12 were fixed in PR #280 and D-14 in PR #278 (both merged 2026-10-19), so they are no longer uninvestigated either.

Features 75-80 (home-network serving; FR-66 to FR-68, amendment of 2026-10-09). Scoping questions raised by this breakdown and the owner's Gate 2 answers of 2026-10-09, folded in below. OQ-67 to OQ-75 are resolved in the product spec and are not reopened. (Resolved by the owner, 2026-10-09, and not an open question: resource and folder deletion from a paired device is ordinary editing and is not governed by the project-deletion setting; the product spec text was being updated separately.)

- **Resolved: are the toggle and the gate one feature?** Owner decision, Gate 2, 2026-10-09: (a), one feature (Feature 75), the gate built and tested before the bind inside it, as drafted. Rejected options: (b) two features with the gate first on the loopback bind; (c) one feature with the bind as a separate last task.
- **Resolved: may Feature 75 reach writers before Features 76 and 77?** Owner decision, Gate 2, 2026-10-09: (a), hold Feature 75's release until 76 and 77 are merged (extended to Feature 80 as well by the owner decision of 2026-10-09 recorded in the listen address and port entry below). The owner merges the release PR by hand, so the hold is enforced at that step. Build order is not release order: 75 may merge to `main`, but no release containing 75 goes out until 76, 77 and 80 are merged. Recorded in the Notes of Features 75, 76 and 77 and in the Summary.
- **Carried to the Feature 75 spec: how does the server tell the desktop window from a paired device?** Carried by owner decision, Gate 2, 2026-10-09; not resolved here. Evidence as drafted: FR-67 requires the exemption and not a mechanism; no mechanism exists today and whether the server exposes the peer address to routes is unverified (read, not run). Options: (a) the peer address if it can be read at the route; (b) a secret the desktop main process gives its own window and the server checks; (c) a separate loopback-only listener for the window beside the shared listener. This decides whether Feature 77 is buildable and is to be settled in the Feature 75 feature spec before tasks.
- **Carried to the Feature 75 spec: what must the gate cover beyond API routes and `(app)` pages?** Carried by owner decision, Gate 2, 2026-10-09; not resolved here. Evidence as drafted: `frontend/app/api/version-check/route.ts` does not contain `withStorageContext`; `login`, `preferences`, `project-types`, `reset-password` and `verify-email` sit beside the `(app)` group; static assets under `/_next` are unexamined. Options: (a) gate everything the server answers except the pairing screen and its code-entry route; (b) gate routes and pages and leave static assets open; (c) list the exceptions explicitly in the feature spec.
- **Resolved: does the sharing setting persist across restarts of the desktop app?** Owner decision, Gate 2, 2026-10-09: (a), persist the writer's choice, and show clearly in the desktop window at launch that sharing is on. FR-66's off-by-default and off-after-a-fresh-install still apply (absent means off).
- **Partly carried, partly a new feature: listen address and port.** Owner words, Gate 2, 2026-10-09: "As for the listen address-- I've been wanting to change it from 3000 (due to its default nature), that step may need to precede this work, and I don't know what address I want to use, but other Saboteur apps will be offset from it". Recorded: (1) the owner wants the desktop server's port changed away from 3000 because 3000 is a common default; the new value is not decided, and other Saboteur apps' ports will be offset from whatever GetWrite's is. This is now Feature 80 (Change the desktop server's default port, Not started, no dependency); the port value and whether it is a fixed constant or configurable are open points inside Feature 80, not settled. (2) Ordering, resolved (owner decision, 2026-10-09: "Port change proposal is fine, 80 before release"): the owner said the port change "may need to precede this work". Feature 75 is specified against a single port source and does not depend on its value, so Feature 80 need not precede 75's build; but Feature 80 MUST be merged before any release containing Feature 75, because a paired device saves the desktop's address (host and port), so changing the port after writers have paired devices would break their saved addresses. With the earlier Gate 2 decision, the release containing Feature 75 is held until Features 76, 77 and 80 are all merged. Still open, inside Feature 80: the port value, and fixed constant versus configurable. (3) Carried to the Feature 75 spec: which interface(s) to listen on (all interfaces, or one chosen LAN interface), and what the address display shows on a machine with several addresses.
- **Carried to the Feature 75 spec: where are paired-device credentials stored and in what form?** Carried by owner decision, Gate 2, 2026-10-09; not resolved here. Evidence as drafted: options are `userData/workspace.json` beside the other per-install fields, or a separate file in `userData`; the credential kept as given or only a hash of it.
- **Carried default, not a final decision: what if the two-client save measurement (Feature 78) does not show last-save-wins?** Owner decision, Gate 2, 2026-10-09: decide after the measurement; until then the default is (c), sharing ships without the statement and the gap is recorded. Not a final choice among (a) change the save path so it does; (b) change the promise the owner approved (OQ-68) to what is observed; (c) ship sharing without the statement and record the gap. Feature 79 shows the statement only if the measurement demonstrates last-save-wins.
- **Resolved: does Feature 78 stay one feature?** Owner decision, Gate 2, 2026-10-09: (b), split. Feature 78 is now the measurement only (no dependency, no product statement; modelled on Feature 57), Feature 79 is the in-app last-save-wins statement (depends on 75 and 78), and Feature 80 is the port change raised under the listen-address question. Owner's note, recorded verbatim in Feature 78's Notes: "the second device will have to be a mobile device". Open point for Feature 78's own spec, raised by the pipeline lead and not settled: a mobile device can only reach the server if it is reachable on the network, which the desktop app's loopback bind (`electron/src/main.ts:150`, read not run) prevents today, so how the measurement is run with a mobile second client before Feature 75 exists may change "No dependency".
- **Resolved (this document's own scoping call): one owner per requirement.** `sab.features/1` requires every requirement to belong to exactly one feature (the checker fails a document where two features claim one, measured on this amendment's first draft, which split FR-66, FR-67 and FR-68 across Features 75 to 78, before the split into 78 to 80). FR-66 to FR-68 each span several independently shippable slices, so Feature 75 owns all three and Features 76, 77, 78, 79 and 80 are listed with no requirement of their own, the same device Features 37 and 38 use. The alternative, to cut each requirement's text into separate requirements in the product spec, was not taken because it would edit the spec; the owner may prefer it.

Feature 77 (limits on a paired device; Gate 1 and Gate 2 decisions of 2026-10-10 folded in; product spec OQ-76 to OQ-85 are resolved there). The five scoping questions this amendment raised were answered at Gate 2 (Owner decision, Gate 2, 2026-10-10 (the pipeline lead's recommendation, accepted by the owner: 'Your recs')); Features 81, 82 and 83, which an earlier draft of this amendment had added, were folded into Feature 77 and removed:

- **Resolved: how does the paired browser learn that it is a paired device and which limits are on?** Owner decision, Gate 2, 2026-10-10 (the pipeline lead's recommendation, accepted by the owner: 'Your recs'): (a), one new read route returning the caller's status and the five limit states, gated like every route and added to the route enumeration tests. Rejected options: (b) the same facts on an existing response; (c) inferring from refusals only, which cannot suppress the passphrase prompt before it is typed. The route's path, response shape and caching are for the feature spec.
- **Resolved: should the desktop window show the limits' effect anywhere besides App Settings?** Owner decision, Gate 2, 2026-10-10 (the pipeline lead's recommendation, accepted by the owner: 'Your recs'): (a), App Settings only. Rejected options: (b) also a line in the sharing status; (c) also a per-limit note beside the paired-device list.
- **Resolved: is the paired-device experience (formerly Feature 83) part of the release hold?** Owner decision, Gate 2, 2026-10-10 (the pipeline lead's recommendation, accepted by the owner: 'Your recs'): the question is moot, because the experience is folded into Feature 77, which is in the hold. Nothing misleading ships separately.
- **Resolved: is the `projectId` fix (formerly Feature 82), if it is needed, part of the release hold?** Owner decision, Gate 2, 2026-10-10 (the pipeline lead's recommendation, accepted by the owner: 'Your recs'): inside the hold. The mechanism is the pipeline lead's choice, not the owner's: a conditional task inside Feature 77's task list, built only if the measurement shows a traversal value is accepted and closed with a recorded "not needed" otherwise. It remains a defect independent of sharing.
- **Carried to the Feature 77 spec: where does the limits file live and how does the server find it?** A file of its own beside the other sharing files (`GETWRITE_SHARING_DIR`) is assumed, with the constraint that it is not `device-credentials.json`; `workspace.json` was not checked as an alternative, and whether the server can read it was not checked. Carried by the lead's instruction; not resolved here.

Feature 93 (stale saves and index races; this document's own scoping calls, 2026-10-24; the owner's decisions OQ-115 to OQ-119 are carried, not reopened). Scoping questions, all resolved at Gate 2, 2026-10-24 (numbered F93-1 onward; this list's groups are otherwise unnumbered):

- **F93-1: Does the class-A allowlist cover every route that writes a sidecar, or only `updateSidecarCore`?** FR-77 names `updateSidecarCore`; other writers (for example the noise-term route, `renameResourceSidecarCore`, entity and word-count-goal routes) were not enumerated by the feature breakdown. Carried default: the feature spec inventories every client-reachable sidecar write path and applies the allowlist to each that takes a client-supplied object; one that takes named fields only is listed as already safe. Resolved from evidence (confirmed at Gate 2, 2026-10-24): the allowlist is needed at exactly one client-reachable path, `updateSidecarCore` (`POST /api/resource/[resource-id]/sidecar`, `route.ts:44`; `native-resource-backend.ts:129`). Every other sidecar writer takes named fields (rename, `renameResourceSidecarCore`; noise term, `setNoiseTermDismissedCore`; reorder; canonical save in `revision-core.ts`) or writes server-built data (metadata-schema migrations, trash, Scrivener import, create, copy, template). Confidence high on routes, medium-high on completeness (searched by function name, read not run).
- **F93-2: If the caller search finds a caller that relies on `updateSidecarCore` to rename or to set `updatedAt` or `dismissedNoiseTerms`, is it moved to its dedicated writer inside this feature, or does the key stay writable?** OQ-116 made the three keys server-owned on condition that no caller relies on them; it did not say what happens if one does. Carried default: the caller moves to the dedicated writer in this feature, since leaving the key writable would keep the measured loss open. Resolved from evidence (confirmed at Gate 2, 2026-10-24): moot. No caller relies on `updateSidecarCore` to rename or to set `updatedAt` or `dismissedNoiseTerms`; there are only 2 production callers. The page save (`app/(app)/page.tsx` around line 537) sends a stale `name`, `updatedAt` and `dismissedNoiseTerms` as passengers, which is the source of the measured 100 of 100 stale `updatedAt`. Read, not run: a rename followed by a stale page metadata save would revert the name today; the allowlist closes it.
- **F93-3: If a carried check (editor config or entity-graph settings) reproduces a reverted setting, is the fix in this feature or a follow-up?** OQ-117 says such a setting comes into the promise; the size of that fix is unknown. Carried default: in this feature, with the experiments recorded first, as Feature 92 did for sidecars. Resolved (Owner decision, Gate 2, 2026-10-24; option (b)): if a carried check (editor config or entity-graph settings) reproduces a reverted setting, the fix is in this feature only if small (a key-level merge inside the existing `updateProjectJson` mutate); otherwise it is a follow-up with the measurement recorded. The carried default (in this feature) is replaced.
- **F93-4: If the class-B race tests reproduce a loss in the mention index or backlinks that needs more than one locked load, change and save (for example making a whole `computeBacklinks` recompute atomic), is that in scope?** OQ-119 and its caveat say one locked step is safe but not an atomic recompute. Carried default: the feature fixes the lost write only; an atomic recompute is recorded as a follow-up unless the owner widens scope. Resolved (Owner decision, Gate 2, 2026-10-24; option (a) with conditional widening): the feature fixes the lost write only (one locked load, change and save, as PR #300's `updateIndex`). An atomic `computeBacklinks` recompute is a recorded follow-up, widened into this feature (option (b), wider lock) only if a race test reproduces a loss that (a) cannot close. The inaccurate "inside one `withMetaLock`" doc comments in `mention-index.ts` and `backlinks.ts` are corrected in this feature either way.
- **F93-5: Does the features route fix make `relationshipTypes` and `subtypes` per item, or leave them as whole-block last-write-wins?** FR-77 leaves the mechanism to the feature spec but notes a stale whole block between two devices stays last-write-wins unless made per item. Carried default: choose after the measurement; a whole-block result is acceptable if documented. Resolved (Owner decision, Gate 2, 2026-10-24; option (a)): `relationshipTypes` and `subtypes` stay whole blocks; last-write-wins per block is documented. Facts (read, confirmed): `POST /api/project/features` takes four optional whole blocks, an omitted block is untouched, every client thunk sends exactly one block, no per-item operations exist. Consequence: the features-route fix becomes preventing overlapping sends from one window (for example `RelationshipTypesSettings` waits for an in-flight save, as `SubtypesSettings` already does with `isSaving`; `ProjectFeatureToggles` is also checked); between two devices the newest write wins per block, not per item, which is narrower than OQ-118's "newest write per key". That narrowing is accepted at Gate 2.

Features 94 to 96 (spell checker; FR-78 and US-33; this document's own scoping calls, 2026-10-25; the owner's decisions OQ-120 to OQ-129 are carried, not reopened). Questions raised by this breakdown, not answered here (numbered F94-1 onward):

- **F94-1: Is the engine spike its own feature (Feature 94) or the first task of Feature 95?** Carried default: a separate measurement-only feature, as Features 57 and 78 did, because every later slice depends on the engine choice and the spike produces a decision, not shipped behaviour. Alternative: fold it into Feature 95's task list as a start-and-stop task. Not decided. Resolved (presented at Gate 2, 2026-10-25; from evidence): the spike stays a separate measurement-only Feature 94, following the Feature 57 and Feature 78 precedent (`getwrite.features.md:2055`, `:2970`). The carried default is confirmed. Risk: the Android measurement is an owner step on the owner's phone. Overridden (Owner decision, Gate 2, 2026-10-25): the owner chose to carry Feature 95 in this run with the engine spike as its first task (Part 0), so the spike is folded into Feature 95 and Feature 94 is not built separately; this overrides the default confirmed above.
- **F94-2: The product spec contradicts itself on whether the editor sets `spellcheck="false"`.** OQ-124 reads "the editor always sets `spellcheck="false"`, so a native underline never appears whether ours is on or off", but the same requirement's fact (1) says the editor sets no `spellcheck` attribute, and a grep by this breakdown (2026-10-25) found `spellCheck={false}` only in `MarkdownSourceView.tsx:67` and `AdvancedModeToggle.tsx:99` (READ, not run). Carried default: treat fact (1) as correct; Feature 95 adds `spellcheck="false"` to the editor body, and the spike measures what each platform underlines today. The product spec is not edited by this breakdown; the owner may want OQ-124's wording corrected. Resolved from evidence (Gate 2, 2026-10-25): no contradiction. FR-78 fact (1) is the current code (the editor sets no `spellcheck` attribute); OQ-124 is the decided design (the editor body will always set `spellcheck="false"`). Feature 95 adds the attribute. OQ-124's wording was corrected from present tense to the design in the product spec (a wording correction, not a decision).
- **F94-3: Can Feature 95 be released without Feature 96?** FR-78 says two word lists exist and a word in either is correct; Feature 95 alone has only the project list. Carried default: Feature 95 is the smallest release-worthy slice and Feature 96 follows; the owner decides whether the release waits for Feature 96, as the release hold on Features 75 to 80 did. Not decided. Resolved (Owner decision, Gate 2, 2026-10-25; option (c)): Feature 95 may be released without Feature 96. The missing user list is stated as a known gap in the release notes.
- **F94-4: Is there a way to undo an Add or an Ignore?** FR-78 requires Ignore and Add but no way to view or remove a word from either list, and no settings screen for the lists; this breakdown did not add one. A mistaken Add would stay until project.json is edited by hand. Carried default: no removal UI in Features 94 to 96, recorded as a known gap; the owner may want a minimal management view added to FR-78 and to Feature 95 or a new feature. Resolved (Owner decision, Gate 2, 2026-10-25; option (d)): list management follows the noise-words precedent (`frontend/components/Layout/NoiseWordsSettingsTab.tsx`, per-word remove at line 180; the global list in `AppSettingsDialog.tsx`). A "Spelling" tab in Project Settings to view and remove words in the project word list and the ignore list is built inside Feature 95; the user list's view and remove section in App Settings is built inside Feature 96. The carried default (no removal UI, a recorded known gap) is replaced, and FR-78 now requires view and remove.
- **F94-5: Where is the licence notice shipped?** Carried default: follow `THIRD_PARTY_FONTS.txt` and Feature 91 (a shipped notice file, an in-app view later); the file name and whether the existing fonts file is renamed or a second file added is a feature-spec point. Not decided by the owner. Resolved from evidence (Gate 2, 2026-10-25): a second notice file, `THIRD_PARTY_SPELLCHECK.txt` (final name left to the Feature 95 spec), shipped like `THIRD_PARTY_FONTS.txt`: repo root, a `frontend/public` copy, and an `extraResources` entry in `electron/electron-builder.yml:24-25`. It also needs to reach the `build:native` output. The fonts file is not repurposed: it has a font-specific test (`frontend/tests/unit/third-party-fonts.test.ts`).
