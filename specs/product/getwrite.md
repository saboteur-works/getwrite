# Product Spec: GetWrite

**Milestone scope:** All milestones — Shipped / In Progress / Next / Later
**Status:** Draft
**Source concept:** GetWrite (reconstructed concept, backfilled 2026-08-24)

> **Reconstructed spec.** This document backfills the `saboteur-ship` ladder
> onto an existing codebase. Requirements under "Shipped Requirements" are a
> record of what the product already does, derived from the codebase, the
> Feb 2026 product-intent document (this file's own predecessor content — it
> was moved from `docs/app-spec.md` to this path on 2026-08-24 and rewritten
> in place, so its content lives in this path's git history rather than at
> the old, now-nonexistent path), `specs/product/getwrite.features.md`, and
> `docs/roadmap.md` — not a record of decisions made at build time. Later
> milestones reflect owner-supplied direction from a 2026-08-24 ideation
> interview.

## Overview

GetWrite is a local-first, filesystem-backed writing workspace for long-form,
structured projects — novels, serials, scripts. Writers working in this shape
are served badly by note-taking tools (which handle fragments but not a
manuscript's shape) and by dedicated structured-writing tools (which trap the
work in proprietary containers and offer no queryable layer over the writing
itself). GetWrite's value is that a long-form project can be structured,
annotated, and interrogated — via a typed, queryable metadata layer — while
remaining a plain directory of files the writer owns outright, with no
database and, on desktop, no server and no account.

The product is released and versioned: the current release is **2.1.0**
(tag `getwrite-v2.1.0`, released 2026-08-18, per
`.release-please-manifest.json` and `CHANGELOG.md`). This release-version
axis is separate from the milestone buckets below (Shipped / In Progress /
Next / Later), which track product maturity, not release numbers — the two
are not to be conflated. The desktop product is live and in use, not a
speculative or pre-1.0 effort; the Later-milestone items in this spec are
planned expansions of an already-shipped product, not the product's first
version.

## Goals

- A writer can scaffold a structured, multi-resource project from a
  declarative project type and see it as real folders and files on disk.
- A writer can author in a rich-text surface that autosaves into a single,
  always-present canonical revision, with prior revisions retained and
  diffable.
- A writer can attach typed metadata to any resource — an always-on Status
  field, five further built-in fields switched on per project, and any field
  they define themselves, including reference fields scoped to a folder of
  their choosing — and query across all of it.
- A writer can search full text across a project, filter by metadata, and
  follow backlinks between resources.
- A writer can compile a selected subtree into a single manuscript file
  (PDF, DOCX, or text) with predictable, rule-based ordering.
- The product achieves real desktop adoption by writers currently using
  Scrivener or plain-file/Obsidian-style workflows, not merely a working demo.

## Non-goals

- **Not a note-taking or PKM system.** GetWrite assumes a manuscript, not a
  graph of atomic notes.
- **Not a real-time collaborative editor.** Two people never edit the same
  project: collaboration and shared-project multi-user access are permanent
  non-goals, not a future maybe. Multi-device access for a single writer
  (the same writer reaching the same projects from more than one device) is
  a different, planned capability — see FR-30 and FR-32 — and is not
  collaboration.
- **Not a layout or typesetting tool.** Compile produces a manuscript, not a
  designed book interior.
- **Not a publishing or distribution platform.** The product's surface ends
  at export.
- **Not an AI writing assistant.** No generation or rewriting features are
  in scope at any milestone in this spec.
- Hosted multi-tenant access and Android are addressed only as later
  milestones (see Functional Requirements); this spec does not treat them as
  shipped even though technical foundations exist. They are pursued on a
  fixed calendar horizon in parallel with desktop work, not gated on desktop
  adoption metrics.
- **Shared-project multi-user access is out of scope.** Resolved: hosted
  GetWrite is sync for one writer across devices, never collaboration
  between two people on one project (see FR-32 for the multi-device sync
  conflict model this implies).

## Users

**Scrivener-frustrated novelists**
Writers who want Scrivener-grade project structure, corkboard, and compile
without a proprietary `.scriv` container or its aging interface.
**Key need:** Structured, multi-scene project management without format lock-in.
**Success looks like:** They can rebuild their existing workflow's structure
and compile step in GetWrite and stop needing Scrivener day to day.

**Plain-file-ownership writers**
Writers from Obsidian/markdown workflows who insist on inspectable,
scriptable, backup-friendly files but have outgrown a flat note graph.
**Key need:** Chapters, scenes, ordering, and compile on top of files they
still fully own.
**Success looks like:** They can open the project folder in any other tool
and lose nothing if GetWrite disappears, while getting compile and structure
a note vault can't offer.

**Working writers on deadline** (secondary)
Writers for whom compile and revision history are daily instruments, not
reassurance.
**Success looks like:** Compile output is clean enough to send to an agent
or publisher without manual cleanup, and revision history reliably recovers
lost work.

## User Stories

**Scrivener-frustrated novelists**
- US-1: As a novelist, I want to scaffold a new project from a declarative
  project type so that I get a working folder structure immediately. [Shipped]
- US-2: As a novelist, I want to compile a selected subtree of my project
  into a single manuscript file so that I can produce a deliverable draft. [Shipped]
- US-3: As a novelist, I want to link my scenes to the contents of a folder
  I choose, so that I can track who and what appears where — whether that
  folder holds characters, locations, factions, or anything else my project
  needs. [Shipped]
- US-4: As a novelist migrating from Scrivener, I want to import my existing
  Scrivener project into GetWrite so that I don't have to manually re-create
  its structure. [In Progress]
- US-17: As a novelist, I want to see how my declared entities relate to one
  another — not just where each one individually appears — so that I can
  spot connections a flat per-entity roster or a single entity's mention list
  doesn't surface. [Next]
- US-18: As a novelist migrating from Word, I want to import my existing
  Word/DOCX project into GetWrite so that I don't have to manually re-create
  its structure. [Later]

**Plain-file-ownership writers**
- US-5: As a plain-file writer, I want to have every resource stored as an
  inspectable file with a sidecar metadata file so that I can read or script
  my project outside GetWrite. [Shipped]
- US-6: As a plain-file writer, I want to move a resource without breaking
  its metadata associations so that reorganizing costs nothing. [Shipped]
- US-7: As a plain-file writer, I want to search full text with metadata
  filters and follow backlinks so that I can navigate a project too large to
  hold in memory. [Shipped]
- US-8: As a plain-file writer, I want to install a signed desktop build
  so that I can trust and use the app day to day. [In Progress]

**Working writers on deadline**
- US-9: As a writer on deadline, I want to autosave into a single canonical
  revision while retaining history so that I never lose work and can always
  see what changed. [Shipped]
- US-10: As a writer on deadline, I want to view a diff between revisions so
  that I can evaluate an edit before keeping it. [Shipped]
- US-11: As a writer on deadline, I want to browse and restore soft-deleted
  resources so that an accidental delete is recoverable without a filesystem
  detour. [Next]
- US-12: As a writer on deadline, I want to reach the same project from
  another device so that a project isn't bound to one machine. [Later]
- US-13: As a writer on deadline, I want to save and reuse resource
  templates so that I can create new resources with consistent structure
  without rebuilding it each time. [Shipped]
- US-14: As a writer on deadline, I want to define metadata fields beyond
  the built-in schema so that I can track attributes specific to my
  project. [Shipped]
- US-15: As a writer on deadline, I want to create, open, rename, delete,
  and package projects from a start page so that I can manage my whole
  project lifecycle without leaving the app. [Shipped]
- US-16: As a writer on deadline, I want to encrypt my project at rest on
  desktop or Android so that my files remain private if my device is lost
  or accessed by someone else. [Shipped]

## Functional Requirements

### Shipped Requirements

- FR-1: The product MUST persist all projects, resources, and metadata as
  files/directories on the local filesystem, with no database. [US-5]
- FR-2: Users MUST be able to create a project from a declarative project
  type that defines the initial folder layout and starter resources. [US-1]
- FR-3: Resource identity MUST be independent of file path; moving a
  resource MUST NOT break its metadata associations. [US-6]
- FR-4: The editor MUST autosave text edits, debounced, into the resource's
  canonical revision without creating a new revision on every save. [US-9]
- FR-5: Every resource MUST have exactly one canonical revision at all
  times, and a resource MUST NOT be left without at least one revision. [US-9]
- FR-6: The current canonical revision MUST NOT be deletable; other
  revisions MAY be deleted, subject to the max-revisions-per-resource
  pruning configuration. [US-9]
- FR-7: Users MUST be able to view a word-based diff between the current
  canonical revision and any other retained revision of a text resource. [US-10]
- FR-8: A multi-reference metadata field MUST be scopeable to a folder by
  folder **id**, never by folder name, chosen per field in the schema manager
  from every folder in the project plus an "Any folder" option, optionally
  including descendants. Single-reference fields are unscoped and draw on all
  resources. No folder name carries application semantics. A project type MAY
  additionally record an `isMetadataSource` flag and a `metadataInputType`
  against a folder. This is a **superseded** mechanism: until the
  schema-driven sidebar rewrite (`cc04767`, 2026-05-17) the sidebar selected
  folders by that flag and generated a reference row per folder, choosing the
  control from `metadataInputType`. The rewrite replaced folder-driven
  rendering with the per-field `refFolder` model above. The authoring control
  and the persistence remain; no consumer does. It therefore confers no
  privilege today.
  Deleting a resource that is referenced elsewhere MUST NOT remove the
  reference entry; it MUST nullify the reference (retaining `{id: null, name}`
  in place) rather than delete the entry, including within multi-reference
  arrays. [US-3]
- FR-9: Text resources MUST support the built-in metadata schema. Exactly one
  field is unconditional: Status, a locked, project-scoped select whose
  options come from the project type and are user-editable and reorderable.
  Five further built-in fields — Synopsis, Notes, Point of View (a single
  resource reference that also accepts free text, preserved as a name with a
  null id when no resource is linked or when a linked resource is later
  deleted), and the Timeline group's Story Date, Duration and Story End Date
  (stored with no ordering validation between start and end) — are each
  governed by a per-project feature toggle and are **hidden unless that
  toggle is on**; an absent flag reads as disabled. Toggling a field off hides
  its control without discarding stored values. Reference fields for entities
  such as characters, locations, or items are NOT built-ins — they are
  user-defined schema fields (FR-20), optionally folder-scoped (FR-8). [US-3]
- FR-10: Users MUST be able to save a metadata query and have it appear in
  the resource tree as a smart folder. [US-7]
- FR-11: Users MUST be able to search full text across all resources in a
  project and filter results by folder, Status, and Tags. [US-7]
- FR-12: The product MUST maintain a backlinks index between resources that
  reference one another. [US-7]
- FR-13: The work area MUST provide six views — Edit, Organizer, Data,
  Diff, Timeline, and the entity roster (FR-38) — each rendering the
  selected resource, folder, or project-wide data per its type
  (text/image/audio/mixed) or scope. Timeline is gated behind a per-project
  `timelineView` feature flag and is disabled unless that flag is on;
  enabling it force-enables the timeline date fields, an invariant enforced
  at the feature-config write seam so the view can never be on without the
  data it reads. [US-9][US-10][US-7]
- FR-14: Compile MUST produce a single PDF, DOCX, Markdown, or text manuscript from a
  user-selected subtree of the resource tree, walking it depth-first with
  siblings ordered by their resource-tree position (plain resource-tree
  order, as arranged by the user); compile MUST NOT emit metadata and MUST
  NOT mutate revisions or project state. [US-2]
- FR-15: The product MUST ship as an account-free desktop application
  (Electron) that runs against the local filesystem with no server
  dependency. [US-5]
- FR-16: The product MUST support dark and light mode with a per-project
  color-mode preference. [US-5]
- FR-17: Users MUST be able to add image and audio resources through the UI
  via a type selector and file input in the create-resource flow, plus
  editor drag-and-drop; both feed a dedicated media viewer. [US-3]
- FR-18: The product MUST support project-scoped tags that can be created,
  assigned to and removed from resources, and deleted, with management UI
  in the sidebar and a tag manager modal; tags cannot be renamed at any
  layer (model or UI) — renaming a tag requires deleting and recreating it,
  which drops its existing resource assignments. [US-7]
- FR-19: Users MUST be able to save, create from, duplicate, and list
  resource templates via the CLI, producing reusable scaffolds for new
  resources; this capability is CLI-and-model-only — there is no UI and no
  HTTP route. A separate, richer template CLI (export/import to `.zip`,
  scaffold, validate, preview, version, changeset) exists in the source tree
  but is not wired into the shipped `getwrite-cli` binary and is reachable
  only from tests; it MUST NOT be treated as a shipped capability. [US-13]
- FR-20: Users MUST be able to define and manage custom metadata field
  definitions per project through a schema manager UI, beyond the built-in
  fields: add, edit, and delete field definitions; rename a field's label;
  rename a field's key with a migration preview; change a field's type with
  migration; reorder fields; and choose between deprecating and clearing a
  field as distinct removal semantics, with a preview of select-option
  removal before it is applied. Only the built-in `status` field is
  locked: it cannot be renamed, retyped, reordered, or removed, though its
  options are project-supplied and user-editable. Every other built-in field
  is unlocked at load time and is editable exactly like a user-defined field —
  `locked` protects a field definition, not its option list. [US-14]
- FR-21: Users MUST be able to reorder resources and folders via
  drag-and-drop, with order persisted to disk, and MUST have context-menu
  actions to create, rename, copy/duplicate (a single behavior offered
  under both labels), delete, convert to smart folder, and export tree
  nodes. [US-6]
- FR-22: The editor MUST provide TipTap-based WYSIWYG rich-text editing with
  a config-driven toolbar, heading/body styling, tables, and paste
  normalization. [US-9]
- FR-23: Users MUST be able to create, open, rename, delete, and package
  projects from a start page; package compiles selected project resources
  to PDF, DOCX, Markdown, or text — it is not a project-level zip export.
  [US-15]
- FR-24: The product MUST render a lightweight hover preview — the
  referenced resource's stored name plus the first 8 characters of its id,
  or "Deleted" if the reference is broken — when a resource reference is
  selected in the QueryBuilder value picker. This preview does not load the
  referenced resource's content and shows no excerpt or thumbnail, and
  resource-ref fields in the Metadata Sidebar have no hover preview at all.
  [US-7]
- FR-25: The product MUST support per-project, opt-in end-to-end encryption
  on desktop and native Android: a workspace keyring with an unlock/lock
  session lifecycle, sealed (AES-256-GCM, Argon2id-derived) file bodies for
  project content, crash-safe and resumable conversion between plaintext
  and encrypted storage in both directions, and a plaintext export escape
  hatch. This capability is scoped to desktop and native Android only; the
  hosted deployment excludes it behind a fail-closed, server-side gate (see
  Constraints). [US-16]
- FR-35: Users MUST be able to declare a resource as an entity and give it
  one or more alternate names, after which every prose mention of that
  entity's name or alternate names anywhere else in the project MUST be
  attributed to it automatically, without a manual link. Detection MUST be
  deterministic and MUST run fully offline, consistent with the
  local-first architecture and the native Android build. The product MUST
  let a writer see, per resource, which entities it mentions, and, per
  entity, every resource that mentions it, so that appearance lists and
  per-entity mention indexes are computed rather than hand-maintained; it
  MUST also let a saved query or smart folder filter resources by entity
  mention. The product MUST NOT infer an entity the writer never declared,
  and MUST NOT perform pronoun or coreference resolution. [US-3]
- FR-36: Users MUST be able to toggle a working mode that visually marks every
  declared entity's name and aliases inline in the editor, so that the
  entities present in a passage are apparent at a glance without opening a
  sidebar panel or running a search. The highlight MUST be view-layer only
  and MUST NOT alter persisted resource content in any way. The toggle state
  MUST persist per project. Detection MUST run fully offline and
  deterministically, consistent with the local-first architecture and the
  native Android build. The feature MUST reuse the entity declarations (name
  and aliases) already established by FR-35 and MUST NOT introduce any new
  mechanism for declaring an entity. [US-3]
- FR-37: Users MUST be able to select a declared entity and compile every
  resource associated with it into a single, ordered document, so that they
  can read that entity's whole thread as one continuous pass — a
  consistency-check read-through — rather than following mention links one
  at a time. The resource set MUST be the same merged set
  `mentions-core.ts`'s `getEntityMentionedIn` already builds for the
  entity's own "mentioned in" view — both detected prose mentions (the
  `mentions` query intrinsic, FR-35) and explicit `linkedFrom` backlinks —
  so the compiled pass is never narrower than the association list the user
  sees when they invoke it. Ordering MUST be resource-tree position,
  depth-first with siblings ordered by `orderIndex`, filtered to only the
  resources in that merged set — the same rule FR-14 uses for subtree
  compile, applied here as new work rather than inherited: `compile-core.ts`
  performs no ordering of its own, and FR-14's depth-first ordering is
  produced upstream by `compileSelection.ts`'s `getDescendantLeafIds`. If a
  project is not organized in story order, the compiled output will not be
  in story order either; this is an accepted consequence, consistent with
  FR-14's subtree compile having the same property. Entity-scoped compile
  MUST remain export-only and MUST NOT mutate revisions, entity
  declarations, or the mention index, consistent with the existing compile
  constraint. [US-2][US-3]
- FR-38: The product MUST provide a project-level entity roster listing
  every declared entity — reusing the alias table `entity-alias-table.ts`'s
  `buildEntityAliasTable` already builds (name, `entityKind`, aliases) — so
  that a writer can see their project's declared entities as a set rather
  than one resource's sidebar at a time, and identify at a glance an entity
  that was declared and never mentioned anywhere. Per-entity counts — both prose occurrences and the number of resources they span, since either alone misleads —
  MUST be derived from the existing mention index (`mention-index.ts`,
  surfaced through `mentions-core.ts`'s merged mentioned-in set — the same
  set FR-37 compiles) rather than newly computed or separately persisted.
  The roster MUST also surface, per entity, the ambiguous-alias and
  common-word warnings that `entity-alias-table.ts`'s `claimedBy` map and
  `entity-alias-warnings.ts`'s `getAliasWarning` already compute but which
  the entity-highlighting feature (FR-36) deliberately confines to the
  inline highlight itself — the roster is the summary surface for exactly
  that information. The roster is a new, sixth top-level work-area view
  (FR-13), alongside Edit, Organizer, Data, Diff, and Timeline, rather than
  a sidebar panel, modal, or dedicated route — it presents project-wide,
  cross-resource data, which is what Organizer and Data already do, and
  that placement is the most discoverable. The roster is read-only:
  activating a roster row MUST navigate to that entity's resource and open
  the existing `EntitySection` alias editor already used to edit entity
  declarations, reusing the existing `updateSidecar` write path unchanged.
  The roster rides the existing per-project `entities` feature flag (FR-35)
  and MUST NOT introduce a flag of its own. The roster MUST remain fully
  offline and deterministic, consistent with the local-first architecture
  and the native Android build; it MUST NOT introduce any new
  entity-declaration mechanism (it reuses FR-35's sidecar `entityKind` and
  `aliases` unchanged) — including no inline editing path for entity
  declarations from within the roster itself — MUST NOT discover or infer
  an entity the writer never declared, and MUST NOT perform
  pronoun/coreference resolution or any model-backed inference. [US-3]
- FR-42: The product SHOULD offer a CLI command that imports an existing
  Scrivener 3, Mac-authored `.scriv` project into a new GetWrite project.
  Shipped: merged to main 2026-09-12 as `f12745de` ("Merge branch
  'feat/scrivener-cli-importer'"). The command is
  `getwrite-cli project import-scrivener <scrivPath> [projectRoot] [-n
  <name>]`; its entry point is
  `frontend/src/lib/models/scrivener/import-scrivener-project.ts`
  (`importScrivenerProject`). Its feature spec,
  `specs/features/scrivener-cli-importer.md`, is the authoritative record of
  the shipped scope. Owner decision (2026-09-11): Scrivener import was
  committed as current work — Scrivener is the closest analogue to
  GetWrite's own structure and is the first import source — reversing the
  concept's earlier "planned but not near-term" posture for Scrivener
  specifically. The CLI command was the first deliverable (resolved:
  OQ-14); a writer-facing UI import flow is a separate follow-up
  requirement (FR-43). Import is one-shot: each run creates a fresh
  GetWrite project, with no notion of re-importing into or merging with an
  existing one (resolved: OQ-12; repeatable import is a separate, deferred
  requirement — FR-44). The imported content is the project's binder —
  Draft, user-created top-level folders beside Draft (e.g. Templates,
  Archive, Scraps), and text documents (and their folders) within Research —
  plus each document's text, synopsis and notes, status, keywords, and
  custom metadata fields, mapped onto GetWrite's metadata layer (resolved:
  OQ-13). Scrivener `Other`-typed top-level items are skipped and reported,
  same as any other unconvertible content. Owner decision (widened
  2026-09-11 at the Feature 31 feature-spec gate): this scope was widened
  from an earlier "Draft binder's folder structure" framing to also cover
  user-created top-level binder folders beside Draft and text documents
  within Research; only non-text Research content (media: images, PDFs, web
  archives) remains deferred. Carrying over Scrivener snapshots as GetWrite
  revisions, Research-folder media, and the project's Trash is out of scope
  for this requirement (see Out of Scope (Deferred)).
  When the importer encounters content it cannot convert, it MUST skip that
  item, continue importing the rest of the project, and produce a report a
  writer can read after the import listing what was skipped and why
  (resolved: OQ-15). This requirement supports only Scrivener 3 projects
  authored on Mac; Scrivener 2 projects and Windows-authored projects are an
  explicit, documented gap, not rejected outright (resolved: OQ-16; see Out
  of Scope (Deferred)). [US-4]
- FR-43: The product SHOULD offer a writer-facing UI flow for importing an
  existing Scrivener project (FR-42), so that Scrivener import is not
  limited to CLI users. This is the follow-up half of the CLI-first
  sequencing decided for FR-42 (owner decision, 2026-09-11). Shipped: merged
  to main 2026-09-13 as `e2768ed4` ("Merge pull request #198 from
  saboteur-works/feat/scrivener-ui-import"). Its feature spec,
  `specs/features/scrivener-ui-import.md`, is the authoritative record of
  the shipped scope. The Electron main process (`electron/src/main.ts`)
  registers IPC channels `getwrite:scrivener-choose-source` (a native OS
  directory picker returning an opaque selection handle and display name via
  `electron/src/scrivener-import/selection-handles.ts` — the source path
  itself never crosses into the renderer, consistent with the "no
  client-supplied path" rule this requirement's In Progress entry set out)
  and `getwrite:scrivener-start-import` (one import in flight at a time,
  `electron/src/scrivener-import/import-guard.ts`). The import runs in a
  separate forked utility process, `electron/worker/scrivener-import-worker.ts`,
  which drives the existing `importScrivenerProject` conversion (FR-42)
  unchanged. The UI is `frontend/components/Start/ImportScrivenerDialog.tsx`,
  opened from an "Import" button on `StartPage.tsx` that renders only when a
  desktop bridge is present — i.e. only in the Electron shell. Scope
  otherwise matches FR-42 — same one-shot behavior, same imported content,
  same skip-and-report handling of unconvertible content, same Scrivener
  3/Mac-only support. Scoped to the Electron desktop build only; hosted web
  and native Android UI import remain deferred (resolved: OQ-18; see Out of
  Scope (Deferred)). [US-4]
- FR-33: The product SHOULD offer an importer for existing Word/DOCX
  projects, converting them into a GetWrite project structure. Split
  2026-09-11 (owner decision) from the Scrivener half of this requirement —
  see FR-42, which has since shipped (2026-09-12). Owner decision
  (2026-09-13): FR-33 moved from Later Requirements into In Progress
  Requirements, carried forward through the pipeline as Feature 45. Shipped:
  merged to main 2026-09-13 as `15d77139` ("Merge pull request #199 from
  saboteur-works/feat/docx-importer"). Its feature spec,
  `specs/features/docx-importer.md`, is the authoritative record of the
  shipped scope. The importer auto-detects and supports both a single
  `.docx` file and a folder of `.docx` files as its source (resolved:
  OQ-19). A single `.docx` is split into multiple GetWrite resources at
  Heading 1 by default, with the split level configurable to another
  heading level or to no split at all; a document with no headings at the
  chosen level imports as a single resource, and the import report says so
  (resolved: OQ-19). A folder of `.docx` files imports one resource per
  file, with the folder's subdirectory structure mirrored as GetWrite
  folders (resolved: OQ-19). Imported content includes text,
  heading/paragraph structure, and bold/italic — matching FR-42's fidelity
  bar — plus footnotes and basic document properties (title, author);
  comments, tracked changes, and images/embedded media are deferred
  (resolved: OQ-20; see Out of Scope (Deferred)). The importer ships a CLI
  command and an Electron desktop UI together in this first delivery, not
  CLI-first as FR-42/FR-43 sequenced (resolved: OQ-21). The desktop UI
  follows FR-43's pattern: a native OS picker running in the Electron main
  process, with the source path never crossing into the renderer or
  reaching a Next API route (`docs/standards/security.md` §2, "Never Trust a
  Client-Supplied Path") (resolved: OQ-21). Hosted web and native Android
  DOCX import are deferred (resolved: OQ-21; see Out of Scope (Deferred)).
  When the importer encounters content it cannot convert, it skips that
  item, continues importing the rest of the project, and produces a
  DOCX-specific import report a writer can read after the import, whose
  sections reflect DOCX content rather than reusing Scrivener's
  eight-section report as-is (resolved: OQ-22). Import is one-shot: each run
  creates a fresh GetWrite project and refuses a non-empty destination,
  mirroring FR-42/FR-43's resolved OQ-12; repeatable DOCX import is out of
  scope (resolved: OQ-23; see Out of Scope (Deferred)). The writer chooses
  the destination project's project type at import time — a CLI flag and a
  UI choice — from the existing project types, with a default (resolved:
  OQ-23). [US-18]
- FR-28: Users MUST be able to browse, restore, and permanently purge
  soft-deleted resources through a dedicated Trash UI (the soft-delete,
  restore, and purge model existed in part beforehand; FR-28 extended it).
  Owner decision (2026-09-14): FR-28 moved from Next Requirements into In
  Progress Requirements, carried forward through the pipeline as Feature 26.
  Shipped: merged to main 2026-09-14 as `2f180cd5` ("Merge pull request #200
  from saboteur-works/feat/trash-ui"). Its feature spec,
  `specs/features/trash-ui.md`, is the authoritative record of the shipped
  scope. Owner decisions (2026-09-14, OQ-24 through OQ-30) fixed its scope:
  the Trash view is scoped to the currently open project only, with no
  workspace-wide aggregation (resolved: OQ-24). The UI supports
  multi-select restore, multi-select permanent delete, and "Empty trash";
  there is no automatic retention or auto-purge (resolved: OQ-25). Deleting
  a folder cascade-soft-deletes the folder and everything beneath it into
  Trash as a restorable/purgeable unit, rather than orphaning its contents
  as before (resolved: OQ-26). Restore never blocks: a missing original
  parent folder falls back to the project root, a name collision at the
  destination gets a suffix, and the UI tells the writer when an item was
  relocated or renamed (resolved: OQ-27). Permanent delete requires
  explicit confirmation (one confirmation for a whole batch on Empty Trash
  or multi-select delete) and removes the trashed resource's files, its
  sidecar, all its revisions, and its entries in the inverted index,
  backlinks, the mention index, and any authored relationship edges naming
  it as source or target, including when the resource was an entity
  (resolved: OQ-28). FR-28 ships on hosted web and Electron desktop, which
  share the Next API routes; native Android transport parity is deferred,
  not rejected (resolved: OQ-29). Restore re-links references: the product
  records exactly which other sidecars' `ResourceRef` fields a deletion
  nullified, and restoring the resource points every still-nullified
  recorded reference back at it, leaving and reporting to the writer any
  reference that changed in the meantime (resolved: OQ-30). A set of
  follow-up refinements identified after the merge is tracked separately in
  `specs/features/trash-ui/follow-up-work.md` and addressed by
  `specs/features/trash-ui-followups.md`. [US-11]

### In Progress Requirements

- FR-26: Organizer view MUST support filtering cards by Status, by word
  count, and by the resource-reference fields a project defines (the
  characters and locations folders the fiction templates provide being the
  common case); no card filtering of any kind exists today. Organizer's only
  in-view control is a show/hide-bodies toggle — though what a card body
  renders (nothing, a text excerpt of configurable length, or any metadata
  field) is a separate per-project setting that already ships. [US-7]
- FR-27: Desktop builds MUST be signed and installable without an OS
  security warning on macOS and Windows. [US-8]

### Next Requirements

- FR-39: The product SHOULD provide a project-level entity relationship
  graph — a view presenting declared entities as nodes and their
  relationships to one another as edges — so that a writer can see how
  entities connect, a question neither the entity roster (FR-38, a flat
  per-entity list) nor entity-scoped compile (FR-37, one entity's own thread)
  answers. The graph MUST be read-only and MUST introduce no new
  entity-declaration mechanism: it reuses FR-35's sidecar `entityKind` and
  `aliases` unchanged. It rides the existing per-project `entities` feature
  flag and MUST NOT introduce a flag of its own. Consistent with FR-35
  through FR-38, the graph MUST NOT discover or infer an entity the writer
  never declared and MUST NOT perform pronoun/coreference resolution or any
  model-backed inference. The graph's edges MUST come from both of the two
  sources named when this capability was deferred (see the resolved OQ-2
  below): derived co-occurrence edges (two entities mentioned in the same
  resource, computed from the existing mention index, with no new persisted
  data of their own) and explicit, writer-authored typed relationship edges
  (e.g. "ally of", "parent of" — new authored, persisted data requiring a new
  schema). The graph MUST visually distinguish a co-occurrence edge from an
  authored typed edge wherever both appear, so a reader can always tell
  whether a given edge is something the system observed or something the
  writer asserted — a concrete instance of the existing product-wide rule
  that a detected mention (found, never authored) and an authored link
  (asserted, never detected; `mentions-core.ts`'s merge-only-for-display
  discipline) are never conflated. This is a large, two-part requirement —
  see Open Questions for whether it should split into more than one feature
  before task breakdown. [US-17]
- FR-40: A writer MUST be able to reposition a node on the entity
  relationship graph (FR-39) by dragging it. The resulting position is
  ephemeral, exactly like every other node position on this graph: it MUST
  NOT be persisted anywhere and does not survive a reload, the same
  constraint the graph's underlying feature spec already places on its
  computed layout. Dragging does not weaken FR-39's read-only guarantee —
  it mutates only ephemeral view-layer position state, never entity data,
  co-occurrence values, or authored relationship edges, none of which a
  drag reads or writes. A drag repositions only the dragged node: no live
  force simulation runs during or after a drag, and neighbouring nodes do
  not respond, so dragging a node stretches its edges rather than letting
  the layout relax around the new position (resolved: OQ-4). Dragging has
  no keyboard-operable equivalent at this ship (resolved: OQ-6). [US-17]
- FR-41: A writer MUST be able to remove a resource's entity declaration in
  one action — un-declaring it as an entity, clearing both `entityKind` and
  its `aliases` — while the resource itself (content, revisions, tags, and
  all other metadata) remains untouched; this is not resource deletion. This
  is a materially different action from the only path that exists today:
  clearing the "Entity Kind" field in `EntitySection.tsx`, whose
  `withEntityKind` sets `entityKind: undefined` and whose own doc comment
  records that it deliberately leaves `aliases` dormant on the resource
  until `entityKind` is set again. That field-clearing path remains
  unchanged and distinct — a lighter-weight action that keeps aliases
  dormant, as documented today — while this action is the complete one
  (resolved: OQ-9). Because the alias editor renders only while `isEntity`
  (`EntitySection.tsx:144`), that existing path leaves aliases with no UI to
  remove once `entityKind` is cleared — a gap this requirement closes.
  Removing the declaration MUST result in the persisted sidecar no longer
  carrying `entityKind` or `aliases`, on every runtime this product ships
  (web, desktop, and native), so that `sidecar.ts`'s `enqueueEntityRescan`,
  `indexer-queue.ts`'s removal of that entity's `MentionRecord`s from
  `meta/index/mentions.json`, and `entity-alias-table.ts`'s exclusion of
  resources without an `entityKind` all see the field genuinely absent and
  mention data and the alias table are actually cleaned up, not merely
  requested to be. This premise was measured false on the web/desktop
  runtime as it stood at Stage 6.5 (2026-09-10): the sidecar POST returned
  200 but `entityKind` remained on disk, because the client
  (`frontend/src/lib/api/resources.ts`) sends
  `JSON.stringify({ projectId, updatedResource })`, which drops any key
  whose value is `undefined`, before it ever reaches
  `updateSidecarCore`'s `{ ...existing, ...updatedResource }` merge — so an
  omitted key silently keeps its old persisted value instead of being
  cleared. The existing field-clearing path (`withEntityKind`, clearing
  only `entityKind`) has the identical on-disk defect and is corrected
  alongside this requirement, as the owner-approved exception to "unchanged
  as it is today": its documented intent — clearing only `entityKind` and
  leaving `aliases` dormant — does not change, but its clear now reaches
  disk. The action MUST offer, as an explicit choice at the point of
  removal, whether to also delete every authored relationship edge (FR-39's
  authored half, persisted by `entity-relationships.ts`) in which the
  entity being un-declared is source or target. This is a deliberate,
  scoped exception to the product's existing rule that deleting an entity
  leaves its authored edges untouched, mirroring `backlinks.json` and
  `mentions.json` (see the CLAUDE.md glossary's "Entity relationship" entry
  and FR-39) — stated here plainly because this requirement carves out an
  exception to it rather than reaffirming it. The choice MUST default to
  keeping the edges, matching that product-wide default, and MUST NOT be
  shown at all when the entity has zero authored edges, since it would be
  inert (resolved: OQ-7). The action MUST require confirmation via the
  existing `ConfirmDialog` component before acting — the same precedent
  used for project deletion (`ManageProjectMenu.tsx`) rather than the
  immediate, unconfirmed single-edge removal `EntityRelationshipsSection.tsx`
  otherwise uses — because this action's blast radius is broader. There is
  no undo: edges deleted via the "delete" choice are not recoverable, and no
  trash-like holding area is introduced for `meta/relationships.json`,
  consistent with edges never being trashed anywhere in the product
  (resolved: OQ-8). If the writer chooses not to delete the edges,
  `EntityRelationshipsSection.tsx` continues to render an "Unknown entity"
  placeholder for each one left dangling, exactly as it already does for
  any other dangling edge. The action MUST live only in the entity's own
  sidebar view; the roster (FR-38) remains read-only and gains no mutating
  action of its own kind (resolved: OQ-10). This requirement interacts with
  FR-35 (entity declaration — the mechanism this action reverses), the
  authored-relationship capability of FR-39 (whose edges the explicit
  choice may delete), and FR-38 (the roster, whose listing drops the entity
  once this action completes). It rides the existing per-project `entities`
  feature flag (FR-35) and MUST NOT introduce a flag of its own. [US-3]
- FR-29: Search MUST become able to find matches across all retained
  revisions of a resource, not only its canonical revision (today only the
  canonical revision is indexed and searched — see Constraints); when a
  user opens the diff view from such a result, the diff MUST consistently
  select the most recent matching revision. [US-7]

### Later Requirements

- FR-30: The product SHOULD ship hosted, multi-device access to the same
  project data as a user-facing product. The foundations already ship —
  per-user tenant resolution, a production better-auth identity source, full
  auth UI (login/verify-email/reset-password), a pluggable object-store
  backend, route-level tenant enforcement tests, and a live-infra smoke
  harness — but no user-facing multi-device product exists yet. This is
  pursued on a fixed calendar horizon in parallel with desktop work, not
  gated on desktop adoption metrics. [US-12]
- FR-31: The product SHOULD replace the JSON inverted index with a durable
  search backend once it demonstrably bottlenecks on large projects. [US-7]
- FR-32: The product SHOULD define a conflict-resolution model for a single
  writer's offline edits made from multiple devices to the same project (a
  sync, not collaboration, conflict model), as part of the hosted
  multi-device work in FR-30. [US-12]
- FR-44: The product MAY support repeatable Scrivener import — re-running
  import against the same `.scriv` project to merge changes into, or
  refresh, an already-imported GetWrite project, rather than always
  creating a fresh one. Split 2026-09-11 (owner decision) from FR-42/FR-43,
  which are one-shot only; repeatable import needs a notion of a prior
  import's identity and a diff/merge strategy that neither of those
  requirements defines. [US-4]
- FR-34: The product SHOULD extend full-text search filtering to the saved
  query builder's predicates — its intrinsics (word count, character count,
  created/updated dates, tags, inbound and outbound links) and any
  user-defined schema field, including reference fields sourced from
  metadata-source folders — joining the two currently-separate filter
  surfaces. Full-text search has no predicate over those fields today, and
  the saved-query builder has no full-text-over-content predicate. [US-7]
## Constraints

- Folder names carry no application semantics: any folder layout is valid,
  and no folder is protected from rename, delete, move, or reordering. A
  Workspace-folder invariant was considered earlier in the product's
  history and was deliberately removed; it is not planned to return as a
  special-named-folder mechanism.
- The single-canonical-revision invariant must hold at all times; no
  feature may leave a resource with zero or more than one canonical
  revision.
- Resource identity must remain independent of on-disk path for the life of
  the project; no feature may rely on path as identity.
- Data crossing the HTTP/transport boundary must be validated before the
  rest of the app trusts it, as Zod schemas already do at the filesystem
  persistence boundary (`frontend/src/lib/models/schemas.ts`); scope,
  failure semantics, and rollout are settled in OQ-31/32/33, and the
  measured gap and the crash it caused are recorded in
  `specs/features/trash-ui/follow-up-work.md` FU-10.
- The desktop build must remain fully functional with no network access and
  no account.
- A CLI import path from Scrivener (`.scriv`) now exists (FR-42, shipped
  2026-09-12), and a writer-facing UI import path for the Electron desktop
  build has since shipped alongside it (FR-43, shipped 2026-09-13); a CLI
  and Electron desktop UI import path from Word/DOCX projects now exists too
  (FR-33, shipped 2026-09-13), and hosted web and native Android still have
  no UI import path of their own for either source format — both FR-43 and
  FR-33 are scoped to the Electron desktop build only (see Out of Scope
  (Deferred)).
- Compile is export-only and must never mutate revisions or project state.
- Full-text search indexes and searches only each resource's canonical
  revision today; retained revisions remain browsable and diffable but are
  not searchable until FR-29 ships.
- `frontend/src/lib/models/previews.ts` (image/audio/text preview
  generation) has zero production consumers; no requirement in this spec
  relies on it, and it must not be described as a shipped capability.
- End-to-end encryption (FR-25) is offered only on desktop and native
  Android; the hosted deployment excludes it behind a fail-closed,
  server-side gate (`crypto/encryption-availability.ts`). Offering it on
  hosted before the model layer runs client-side would be a padlock whose
  key the server holds, so the gate is deliberate rather than a gap to
  close.
- The on-disk layout uses UUID-named directories for path-independent
  identity; this is a known tension with the "open your folder and see your
  files" ownership claim and is not resolved by this spec.
- Any hosted/multi-device work must not compromise the local-first, no-account
  desktop experience that is the stated basis for adoption. Hosted and
  Android work is not gated on desktop adoption metrics: both are timeboxed
  to a fixed calendar horizon and pursued as parallel-track investment
  alongside desktop work.
- Observability: the product collects no telemetry and must continue to collect
  none — there is no analytics or crash-reporting dependency in the tree, and the
  only outbound call on the desktop path is the opt-in GitHub release check.
  Diagnostics are a local log file (`app.getPath("logs")/getwrite.log`). A hosted
  deployment may add server-side health checks and structured logs, but nothing
  that reports a local user's activity off their machine.
- Performance: no performance budget is currently measured anywhere — there are
  no latency targets, benchmarks, or performance gates in CI. The one identified
  scaling limit is the whole-file JSON inverted index, which is expected to
  bottleneck on large projects (FR-31). This constraint records the absence
  deliberately: a target nobody measures is not a commitment, and any future
  budget should arrive with the measurement that enforces it.
- Hosted GetWrite's data model must support multi-device sync for a single
  writer without supporting multi-user collaboration on a shared project;
  see FR-32.
- Access to an encrypted project's files when no usable key is available for
  it in this process — no keyring has been established, an established
  keyring has been explicitly locked, or an established, unlocked keyring
  simply holds no key for that particular project — must fail closed with a
  signal the caller can act on, in both directions — never return the
  undecrypted envelope bytes as though they were readable content, and never
  let a write land inside a sealed project as plaintext. This makes
  concrete, for this no-usable-key case specifically, the fail-closed
  default `docs/standards/security.md` already states; it is not a new
  principle. The write direction is the more serious of the two: a read with
  no usable key merely hands back unusable ciphertext bytes, while such a
  write both exposes plaintext inside a project marked encrypted and
  destroys the ciphertext it overwrites, with no way back short of
  restoring from a backup outside this system.

  Measured 2026-09-17 (static reading of source, not exercised): `adapterFor`
  in `frontend/src/lib/models/crypto/workspace-adapter.ts:84` returns the
  plain inner adapter whenever `!keyring || keyring.isLocked()`, for every
  path including a sealed project's files, with no error and no signal that
  decryption was skipped — this is the read gap. Separately, on the write
  side, `mutatingAdapter` (`frontend/src/lib/models/io.ts:227-229`) calls
  `assertWritable(...)` — the mid-conversion write barrier, not a
  key-availability check — and then `currentAdapter()`, which under a
  keyring with no usable key resolves through the same pass-through above;
  no write path checks key availability at all. Four sites confirmed by
  static reading to reach a sealed project's files this way: `updateSidecarCore`
  (`frontend/src/lib/models/resource-crud-core.ts:409-430`), whose
  `readSidecar(...).catch(() => null)` at line 409 swallows the parse error
  thrown on envelope bytes and merges the update over an empty object,
  discarding every pre-existing sidecar field in the plaintext write that
  follows; `writeSidecar` (`frontend/src/lib/models/sidecar.ts:170-171`),
  whose plaintext write at line 170 commits before `bumpMetadataRevision` at
  line 171 can throw; `rescanEntityAcrossProject`
  (`frontend/src/lib/models/indexer-queue.ts:310-341`), whose read failures
  degrade silently so it persists over `meta/index/mentions.json` at line
  341; and the CLI's `reindex` command (`cli/src/commands/reindex.ts`, 150
  lines total), which contains no key-availability check anywhere in the
  file. Also measured: every non-marker file under a sealed project is an
  envelope, not only prose content — `listProjectFiles`
  (`frontend/src/lib/models/crypto/convert-project.ts:270-300`) excludes
  only the project marker and conversion marker — so an incident with no
  usable key can corrupt an index, a sidecar, or a manifest as readily as a
  resource's text.

  Measured 2026-09-17, further
  (`frontend/src/lib/models/crypto/keyring-session.ts:47-48,58-60,217-220`):
  `!keyring` is not a rare edge relative to `keyring.isLocked()` in this
  codebase. The module-level session reference
  (`let session: Keyring | null = null;`) starts `null`, is assigned only on
  unlock, and `lockSession()` discards it entirely
  (`session?.lock(); session = null;`) rather than leaving a locked
  `Keyring` object in place. `getSessionKeyring()` therefore returns `null`
  both before any unlock in a given server process and after an explicit
  lock, so the two most common no-usable-key states in this process are
  both `!keyring`, not `keyring.isLocked()` on a retained object. This is
  why the constraint above is framed around "no usable key is available,"
  which covers `!keyring`, `keyring.isLocked()` on a retained object, and an
  unlocked keyring with no key for a specific project, rather than around
  "locked," which names only one of those states — and, per this
  measurement, the least commonly reached one in this process. None of this
  establishes why the write path has no key-availability check, or why
  `lockSession` discards the reference rather than leaving a locked object
  in place; both are unverified and this spec does not assert intent behind
  either.

## Open Questions

**OQ-1: What is the licensing and distribution posture — open source, paid,
freemium?**
**Impact:** Affects positioning and any future feature gating; not
addressed by any requirement in this spec.
**Owner:** Product owner / business.
**Evidence:** Verified: no `LICENSE` file exists in the repository. The
root `package.json` declares `"license": "ISC"`, but this is `npm init`
scaffolding rather than a deliberate licensing decision — the other three
workspace packages (`frontend`, `electron`, `cli`) declare no `license`
field at all, which is inconsistent with a real, intentional choice having
been made.

**OQ-2 (resolved): Should the entity relationship graph's (FR-39) edges come
from derived co-occurrence, explicit writer-authored typed links, or both —
and if authored links are in scope, what relationship-type schema?**
**Resolution:** Both. FR-39 carries derived co-occurrence edges and
explicit, writer-authored typed relationship edges together, and the two
MUST be visually distinguishable wherever both appear on the graph. The
relationship-type schema itself (its shape, and where it persists) is not
decided here and remains open — see OQ-3.
**Evidence:** Co-occurrence requires no new persisted data: `MentionIndex`
is keyed by `resourceId`, each `MentionRecord` carries `entityId` +
`resourceId` + `offsets`, and `invertMentionIndex` already produces the
entity-keyed view (`frontend/src/lib/models/mention-index.ts:16-28,67-79`)
— "which entity pairs share a resource" is a pure derivation over data
already on disk. Authored typed links do not fit `EntitySidecarFieldsSchema`
(`frontend/src/lib/models/schemas.ts:333-336`), which is `entityKind` +
`aliases` — one entity's own declaration, not a directed typed edge between
two entities — so they need a new top-level persisted structure alongside
`meta/index/mentions.json` / `meta/backlinks.json`. Neither
`specs/features/entity-layer.md:193-194` nor
`specs/features/entity-roster.md:135-136` scoped this in; this product spec
is the first rung to settle it.
**Impact:** FR-39.

**OQ-3: FR-39 bundles two materially different halves under one
requirement — should it split into more than one shippable feature, and if
the authored-typed-link half ships, what happens to an entity's authored
edges when that entity is deleted?**
**Impact:** The co-occurrence half is a read-only view over data that
already exists (the mention index) and adds nothing new to persist. The
authored-typed-link half brings a new schema, a new authoring surface, and
a new edge lifecycle — including what happens to an edge that names an
entity later deleted — none of which the co-occurrence half needs. Bundling
both into a single FR risks either half blocking the other's delivery.
Genuinely unresolved: no relationship-type schema, no authoring surface, and
no edge-deletion-on-entity-deletion behavior has been decided anywhere in
this spec or the two feature specs that deferred this capability.
**Owner:** Product owner / feature-breakdown rung.
**Evidence:** `specs/features/entity-layer.md:193-194` and
`specs/features/entity-roster.md:135-136` each deferred the graph as a
single undifferentiated capability; OQ-2's resolution is the first point at
which the two halves' different costs and lifecycles become visible, and
the feature-list rung is where a product spec's requirements are split into
independently shippable features.

**OQ-4 (resolved): When a writer drags a node (FR-40), does the drag only
reposition that one node, or does it drive the graph's `d3-force`
simulation live so neighbouring nodes respond?**
**Resolution:** Static reposition. Dragging moves only the dragged node;
neighbours do not respond, and no live force simulation runs during or
after a drag. `computeGraphLayout` keeps its existing contract — the
simulation is stopped immediately and advanced a fixed 300 synchronous
ticks, remaining a pure, deterministic function of its inputs. The
accepted trade-off: because neighbours do not respond, dragging a node
stretches its edges rather than letting the layout relax around the new
position. The live alternative was available and costed, not dismissed —
`d3-force@3.0.0` as installed does support it (`fx`/`fy` position pinning,
plus `restart()`/`alphaTarget()`), and 3 of the 34 tests in
`frontend/tests/component/EntityGraphCanvas.test.tsx` read rendered
coordinates. Neither of those facts was weighed as better or worse than
the static approach — no comparison of look, feel, or performance between
the two was measured.
**Evidence:**
`frontend/components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphCanvas.tsx:249-257`
(fixed-tick, non-live layout); `frontend/node_modules/d3-force/src/simulation.js:53-56,66-67`
(`fx`/`fy` pinning and `restart()`/`alphaTarget()` as installed);
`frontend/tests/component/EntityGraphCanvas.test.tsx` (3 of 34 tests read
rendered coordinates).
**Impact:** FR-40.

**OQ-5 (resolved): Should a dragged arrangement survive a view switch or a
reload?**
**Resolution:** No — positions stay ephemeral; nothing is persisted. This
confirms the existing answer rather than changing it: FR-40 as already
written, and FR-13 with its resolved OQ-2 in
`specs/features/entity-relationship-graph.md`, already say this. The
question was raised and deliberately closed in favour of the status quo,
so a later reader sees it was considered rather than overlooked. The
accepted limitation stands: a manual rearrangement does not survive a
reload or a view switch. No amendment to FR-13, the CLAUDE.md glossary, or
the canvas's design comment is needed.
**Evidence:** `specs/features/entity-relationship-graph.md:120,157-162`
(OQ-2, resolved: positions are ephemeral).
**Impact:** FR-40.

**OQ-6 (resolved): Does dragging a node need a keyboard-operable
equivalent?**
**Resolution:** No, not at this ship — recorded explicitly as out of scope
rather than left silent (see Out of Scope). `docs/standards/accessibility.md`
states WCAG 2.1 AA as the working target, and drag-movement alternatives
are WCAG 2.2 SC 2.5.7, which is absent from that standards file. The graph
feature already rejected novel canvas keyboard affordances as its
accessibility mechanism in favour of the synchronized accessible list (that
feature spec's own resolved OQ-4). Consequence: a keyboard-only user cannot
reposition a node. They retain full read access to every node and edge
through the accessible list, which is unchanged — repositioning is the
only thing lost, and it alters nothing about the data the graph presents.
**Evidence:** `docs/standards/accessibility.md` (WCAG 2.1 AA target); WCAG
2.2 SC 2.5.7 is not referenced anywhere in this repository's standards;
`specs/features/entity-relationship-graph.md` (OQ-4, resolved: synchronized
accessible list as the accessibility mechanism).
**Impact:** FR-40.

**OQ-7 (resolved): When removing an entity's declaration (FR-41), what does
the authored-edge-deletion choice default to, and is the choice shown at
all when the entity has zero authored edges?**
**Resolution:** The choice defaults to keeping the edges, matching the
product-wide rule that removing an entity leaves its edges, backlinks, and
mentions untouched. The choice is not shown at all when the entity has zero
authored edges, since offering it would be inert.
**Evidence:** No UI for this action exists yet; `entity-relationships.ts`
has no bulk-delete-by-entity operation today, only per-edge
`createEntityRelationship`/`removeEntityRelationship`.
**Impact:** FR-41.

**OQ-8 (resolved): Is removing an entity's declaration (FR-41) reversible
or confirmed before it acts, and should edges deleted this way be
recoverable?**
**Resolution:** The action requires confirmation via the existing
`ConfirmDialog` component before acting, following the precedent of project
deletion (`ManageProjectMenu.tsx:127`) rather than the immediate,
unconfirmed single-edge removal `EntityRelationshipsSection.tsx:141-146`
otherwise uses — this action's broader blast radius warrants the heavier
precedent. There is no undo, and edges deleted via the "delete" choice are
not recoverable: no trash-like holding area is introduced for
`meta/relationships.json`, consistent with the existing product-wide
absence of edge soft-deletion (edges are never trashed anywhere).
**Evidence:** `trash.ts` (soft-delete for resources and sidecars only, no
equivalent for `meta/relationships.json`); `ManageProjectMenu.tsx:127`
(confirmation precedent for a broad, destructive action);
`EntityRelationshipsSection.tsx:141-146` (immediate, unconfirmed single-edge
removal precedent).
**Impact:** FR-41.

**OQ-9 (resolved): Should removing an entity's declaration (FR-41) clear
aliases, or leave them dormant as today's field-clearing path does — and
should that existing path's dormant-alias behavior change to match?**
**Resolution:** FR-41 clears aliases as written. The existing path —
clearing the Entity Kind field directly in `EntitySection.tsx` — remains
unchanged and distinct, keeping aliases dormant per its current documented
behavior. Two entry points exist deliberately with different outcomes: the
Remove Entity action is the complete one; field-clearing stays the lighter,
intentionally partial one.
**Evidence:** `EntitySection.tsx`'s `withEntityKind` doc comment (clearing
`entityKind` "never touches `aliases` — they stay dormant on the resource
until `entityKind` is set again").
**Impact:** FR-41.

**OQ-10 (resolved): Where does the Remove Entity action (FR-41) live — the
entity's own sidebar view, a roster row, or both?**
**Resolution:** The sidebar only. The roster (FR-38) remains read-only;
adding a roster-row equivalent is deferred (see Out of Scope).
**Evidence:** FR-38 ("The roster is read-only... MUST NOT introduce any
new entity-declaration mechanism"); `EntitySection.tsx` (existing sidebar
surface for entity declaration and editing).
**Impact:** FR-41.

**OQ-11 (resolved): Is "In Progress" the right milestone for Scrivener
import (FR-42), or should it sit in "Next" instead?**
**Resolution:** "In Progress" is confirmed. Owner decision (2026-09-11):
FR-42 stays in In Progress.
**Evidence:** The owner decision recorded 2026-09-11 says only that
"importing projects is now being started," which is ambiguous between this
spec's two committed-but-not-shipped milestones. "In Progress" was chosen
here because the spec already uses that label loosely for committed,
near-term work regardless of how much of it is actually built (FR-26 sits
in In Progress despite the concept recording its underlying capability as
"not started"), which matches "being started" more closely than "Next."
**Impact:** FR-42's milestone placement, and by extension its priority
relative to FR-26/FR-27 (the rest of In Progress) versus FR-28/FR-29/FR-39
through FR-41 (Next).

**OQ-12 (resolved): Is Scrivener import (FR-42) a one-shot conversion, or
must it be repeatable — e.g. re-run against the same `.scriv` project after
the writer has made further changes in Scrivener, or resumed after a
partial import?**
**Resolution:** One-shot. Owner decision (2026-09-11): each import creates
a fresh GetWrite project; import needs no notion of a prior import's
identity or diffing against it. Repeatable import (re-import or merge into
an existing project) is deferred, not dropped — it is recorded as a
separate requirement, FR-44, in Later Requirements.
**Impact:** FR-42, FR-43, FR-44.

**OQ-13 (resolved): Which Scrivener-project content beyond the Draft
binder's folder structure and each document's text must also come across
on import — the project's revision history
(per-document `Snapshots/<UUID>.snapshots/*.rtf`), per-document synopses and
notes, keywords/labels/status, custom metadata fields, Research-folder
media, and/or the project's Trash?**
**Resolution:** Owner decision (2026-09-11): beyond binder structure and
document text, import MUST also bring across each document's synopsis and
notes, status, keywords, and custom metadata fields, mapped onto
GetWrite's metadata layer. Scrivener snapshots → GetWrite revisions,
Research-folder media, and the project's Trash are deferred, out of FR-42's
scope — recorded in Out of Scope (Deferred) so they stay visible.
Refined 2026-09-11: Research text documents are imported; only Research
media is deferred.
**Evidence:** A real `.scriv` project (`import-inputs/The SF Sideshow.scriv`,
Scrivener 3.5.2, gitignored/private, examined for structure only, never for
content) shows document bodies stored as RTF under `Files/Data/<UUID>/`,
per-document synopsis/notes sidecar files, and per-document revision
history under `Snapshots/<UUID>.snapshots/*.rtf` — content types beyond
binder structure and document text that a writer may reasonably expect to
carry over but which this spec does not decide.
**Impact:** FR-42.

**OQ-14 (resolved): Does Scrivener import (FR-42) run through the app's UI,
the CLI, or both?**
**Resolution:** CLI first. Owner decision (2026-09-11): the first
deliverable is a CLI command (FR-42); a writer-facing UI import flow is a
follow-up requirement, FR-43, in Next Requirements — not built alongside
FR-42, and not shipped at launch.
**Evidence:** Consistent with how FR-19's template CLI already ships
CLI-only with no UI or HTTP route.
**Impact:** FR-42, FR-43.

**OQ-15 (resolved): What must Scrivener import (FR-42) do when it
encounters content it cannot convert — a document format, a compile
setting, or a feature with no GetWrite equivalent?**
**Resolution:** Owner decision (2026-09-11): skip the unconvertible item,
continue importing the rest of the project, and produce a report the
writer can read after the import listing what was skipped.
**Impact:** FR-42, FR-43.

**OQ-16 (resolved): Which Scrivener format and platform variants must
import (FR-42) support — Scrivener 2 projects as well as Scrivener 3, and
projects authored on Windows as well as Mac?**
**Resolution:** Owner decision (2026-09-11): support Scrivener 3,
Mac-authored projects only. Scrivener 2 projects and Windows-authored
projects are an explicit, documented gap — deferred, not rejected — and are
recorded in Out of Scope (Deferred).
**Evidence:** This spec's one grounding example
(`import-inputs/The SF Sideshow.scriv`) is a Scrivener 3.5.2, Mac-authored
project; Scrivener 2 and 3 use different project formats, and a
Windows-authored `.scriv` project has not been surveyed against this
example.
**Impact:** FR-42, FR-43.

**OQ-17 (resolved): Now that FR-42's CLI dependency has shipped, should
FR-43 (the Scrivener UI import flow) move out of Next Requirements into a
different milestone, or stay in Next?**
**Resolution (owner decision, 2026-09-12):** FR-43 moves from Next
Requirements into In Progress Requirements, with its start gated on OQ-18's
resolution. OQ-18 is resolved in this same decision, so that gate is
satisfied and FR-43 sits in In Progress now.
**Impact:** FR-43's milestone placement, and by extension its priority
relative to the rest of Next (FR-28, FR-29, FR-39 through FR-41) versus In
Progress (FR-26, FR-27).
**Evidence:** FR-43's original rationale for sitting in Next rather than In
Progress was that "the CLI command it depends on has not yet shipped"
(owner decision, 2026-09-11, OQ-14). FR-42 merged to main 2026-09-12
(`f12745de`), so that stated blocker no longer holds.

**OQ-18 (resolved): Which platform(s) must the Scrivener UI import flow
(FR-43) support, and how does the source `.scriv` project reach the
conversion on each?**
**Resolution (owner decision, 2026-09-12):** Electron desktop first;
hosted web and native Android UI import are deferred, not permanently
excluded (see Out of Scope (Deferred)). Mechanism: a native OS directory
picker running in the Electron main process (precedent:
`electron/src/main.ts`'s `getwrite:choose-workspace-dir` IPC handler using
`dialog.showOpenDialog({ properties: ["openDirectory"] })`, exposed via
`electron/src/preload.ts`), with the picked `.scriv` path handed to the
already-shipped `importScrivenerProject` conversion through a trusted
main-process path — not by the renderer sending a filesystem path to a Next
API route, since `docs/standards/security.md` §2 "Never Trust a
Client-Supplied Path" forbids that. The exact handoff design is a
feature-level decision, not decided here.
**Impact:** FR-43.
**Evidence:** The shipped CLI importer (FR-42) reads the `.scriv` source by
filesystem path through `frontend/src/lib/models/io.ts` —
`scrivx-parser.ts`, `binder-mapper.ts`, and `import-scrivener-project.ts`
all import from `../io`. GetWrite ships on three platforms with different
filesystem access models: hosted web (a server-side filesystem/object-store
backend per request, tenant-scoped), Electron desktop (a local Next
standalone server with direct `node:fs` access), and native Android
(Capacitor, no `node:fs`, every client-to-server call collapsed in-process
per ADR-021). A browser file picker yields no filesystem path for the
hosted-web case, and a `.scriv` project is a directory bundle rather than a
single file, which a standard file input does not hand over as a path
either; neither case has an existing multi-file/directory upload or zip
mechanism to build on (`app/api/resource/upload` is single-file), and
native has no directory-picking precedent, which is why both remain
deferred rather than resolved here.

**OQ-19: What is a "Word/DOCX project" as an import source for FR-33 — one
`.docx` split into multiple GetWrite resources, a folder of `.docx` files
each becoming its own resource, or both?**
**Resolution (owner decision, 2026-09-13):** Both source kinds are
supported and auto-detected: (a) a single `.docx` file, split into
multiple GetWrite resources, and (b) a folder of `.docx` files, imported
one resource per file with the folder's subdirectory structure mirrored as
GetWrite folders. For case (a), the default split point is Heading 1; the
split level is configurable to another heading level or to no split at
all. A document with no headings at the chosen level imports as a single
resource, and the import report records that.
**Impact:** This decides the entire shape of the importer. If the source is
a single `.docx`, the importer needs a splitting rule (e.g. at Heading 1,
at a page break, at a section break) with no obvious default — Word has no
binder-like structure the way a `.scriv` project does, so there is no
Scrivener-equivalent document boundary to carry over. If the source is a
folder of separate `.docx` files, the importer instead needs a decision
about whether the folder's own directory structure becomes GetWrite folders
(mirroring how FR-42 carries over Scrivener's binder folders) or every file
lands flat. Left undecided, a feature spec would have to invent this
boundary itself.
**Owner:** Product owner.
**Evidence:** `frontend/src/lib/models/scrivener/binder-mapper.ts` maps an
explicit Scrivener Binder tree (Draft, top-level folders, Research) onto
GetWrite folders/resources — that structure comes for free from Scrivener's
own project format. A `.docx` file (or a plain folder of them) carries no
equivalent explicit multi-resource structure; Word's own outline/heading
levels are the closest analogue, and this spec does not decide whether they
should be read as split points.

**OQ-20: For FR-33, which content within a Word/DOCX source carries over,
and which is deferred — headings/structure, bold/italic and other
character/paragraph formatting, comments, tracked changes, footnotes,
images/embedded media, and document properties (author, title, custom
fields)?**
**Resolution (owner decision, 2026-09-13):** Text, heading/paragraph
structure, and bold/italic carry over — matching FR-42's fidelity bar —
plus footnotes and basic document properties (title, author). Comments,
tracked changes, and images/embedded media are deferred. Where footnotes
and document properties land in GetWrite's data model is a feature-spec
decision, not decided here.
**Impact:** FR-42's own content scope (OQ-13) took a real owner decision to
pin down piece by piece (text, synopsis/notes, status, keywords, custom
metadata in; snapshots, Research media, Trash out). FR-33 has had no
equivalent pass. Word/DOCX-specific content types with no Scrivener
analogue — tracked changes, comments, footnotes — aren't even covered by
that precedent and need their own call.
**Owner:** Product owner.
**Evidence:** `frontend/src/lib/models/scrivener/rtf-to-tiptap.ts` is
narrowly scoped to the RTF control words FR-42's own source material
actually used (bold/italic, `\line`/`\par`, `\'XX` hex escapes, `\field`
flattening) rather than full RTF fidelity — the same document-by-document
scoping choice would need to be made for `.docx`'s OOXML markup, and no
survey of a real `.docx` project's markup (comments, tracked changes,
footnotes, embedded media) has been done the way
`import-inputs/The SF Sideshow.scriv` grounded FR-42/OQ-13.

**OQ-21: What delivery surface(s) does FR-33 ship on — CLI first (as FR-42
did, per resolved OQ-14), desktop UI, or both from the start — and on which
platforms (Electron desktop, hosted web, native Android)?**
**Resolution (owner decision, 2026-09-13):** CLI and Electron desktop UI
ship together in FR-33's first delivery, not CLI-first as FR-42/FR-43
sequenced. The desktop UI follows FR-43's pattern: a native picker running
in the Electron main process, with the source path never crossing into
the renderer or reaching a Next API route (`docs/standards/security.md`
§2). Hosted web and native Android DOCX import are deferred.
**Impact:** Determines sequencing (a single deliverable vs. a CLI-then-UI
split mirroring FR-42/FR-43) and which platforms need a source-selection
mechanism at all. If a desktop UI is in scope, the same constraint FR-43 had
to design around applies: a renderer MUST NOT send a filesystem path to a
Next API route (`docs/standards/security.md` §2, "Never Trust a
Client-Supplied Path") — FR-43 resolved this via a native OS picker running
in the Electron main process handing the path to the conversion through a
trusted main-process path, never through the renderer or an API route
(resolved OQ-18). Whether that same mechanism, a different one, or none (CLI
only) applies to FR-33 is not decided.
**Owner:** Product owner.
**Evidence:** `docs/standards/security.md` §2; FR-42's resolved OQ-14
(CLI-first sequencing) and FR-43's resolved OQ-18 (Electron-desktop-only UI,
native-picker mechanism) are the only precedent this product has for
sequencing and platform scope on an importer; neither commits FR-33 to the
same path.

**OQ-22: Does FR-33 reuse Scrivener import's skip-and-report model — a
post-import report file listing unconvertible content — for content it
cannot carry over?**
**Resolution (owner decision, 2026-09-13):** Same skip, continue, and
report principle as FR-42/FR-43 (resolved: OQ-15), but with a
DOCX-specific report whose sections reflect DOCX content — it does not
reuse Scrivener's eight-section list as-is. Whether the report-writing
code is shared with `import-report.ts` is a feature-spec decision.
**Impact:** FR-42/FR-43 (resolved OQ-15) commit to skip, continue, and
report rather than abort on unconvertible content, and
`frontend/src/lib/models/scrivener/import-report.ts` is a working
implementation of that pattern. Reusing or diverging from it changes what a
Word/DOCX-import feature spec needs to design from scratch versus adapt.
**Owner:** Product owner.
**Evidence:** `frontend/src/lib/models/scrivener/import-report.ts`
(`buildImportReport`/`writeImportReport`, fixed eight-section report written
to `<projectRoot>/scrivener-import-report.txt`) is the only precedent in
this codebase for a post-import report; nothing commits FR-33 to reusing its
shape, its file-naming convention, or its section list.

**OQ-23: Does FR-33 create only a fresh GetWrite project (one-shot, no
merge/re-import — mirroring FR-42's resolved OQ-12), and which project type
does the new project use?**
**Resolution (owner decision, 2026-09-13):** One-shot only, mirroring
FR-42/FR-43's resolved OQ-12: each import creates a fresh GetWrite project
and refuses a non-empty destination; repeatable DOCX import is out of
scope. The writer picks the destination project's project type at import
time — a CLI flag and a UI choice — from the existing project types, with
a default. Which type is the default is a feature-spec decision.
**Impact:** FR-42 resolved this for Scrivener (one-shot; repeatable import
deferred to FR-44) but nothing in this spec states the same for Word/DOCX.
Separately, `getwrite-cli project create` and `import-scrivener-project.ts`
both need to know which project-type spec (`getwrite-config/templates/
project-types/`) shapes the destination project's config, statuses, and
metadata schema — Scrivener import builds this from the source project's
own Binder/metadata; a `.docx` source has no equivalent self-describing
project-type signal.
**Owner:** Product owner.
**Evidence:** `frontend/src/lib/models/scrivener/import-scrivener-project.ts`
refuses a non-empty pre-existing `projectRoot` and always creates a fresh
project (one-shot); `getwrite-config/templates/project-types/*.json` is the
existing project-type mechanism FR-33 would need to select from, or extend,
for a Word/DOCX-sourced project.

**OQ-24: Is the Trash UI (FR-28) scoped to the currently open project, or
does it browse deleted resources across every project workspace-wide, and
where does it live in the app?**
**Resolution (owner decision, 2026-09-14):** Trash is per project. A Trash
view lives inside an open project and shows only that project's `.trash/`.
There is no workspace-wide aggregation. Exactly where it appears in the
project UI is a feature-spec decision.
**Impact:** `trash.ts`'s `trashPaths` is keyed by a single `projectRoot`; a
per-project surface is a straightforward list view reachable from within an
open project (e.g. alongside the resource tree or Start-page project
actions), while a workspace-wide surface would need a new cross-project
registry that reads every project's `.trash/` directory and nothing like
that exists today. This decides the surface's information architecture
before a feature spec can lay it out.
**Owner:** Product owner.
**Evidence:** `frontend/src/lib/models/trash.ts`'s `trashPaths(projectRoot)`
computes `.trash/resources` and `.trash/meta` relative to one project root
only; no code anywhere aggregates trash state across more than one project.

**OQ-25: Does the Trash UI (FR-28) offer bulk actions — "empty trash"/
purge-all, multi-select restore or purge — and is there any automatic
retention window or auto-purge?**
**Resolution (owner decision, 2026-09-14):** Bulk actions are in:
multi-select restore, multi-select permanent delete, and "Empty trash".
There is no automatic retention or auto-purge; nothing in Trash is ever
deleted without an explicit writer action.
**Impact:** Today's model layer has no bulk primitive at all: a writer
recovering from an accidental multi-resource delete, or wanting to clear
trash entirely, would need one action per resource unless a feature spec
adds a bulk operation. Whether trashed items expire on their own also
determines whether "permanently purge" in FR-28's own wording is the only
way anything ever leaves trash.
**Owner:** Product owner.
**Evidence:** `frontend/src/lib/models/trash.ts`'s `purgeResource` takes one
`resourceId` at a time; no `purgeAll`/`emptyTrash` function exists.
`pruneExecutor.ts` (the one existing automatic-deletion mechanism in the
product) prunes old non-canonical *revisions*, not trashed resources — there
is no analogous auto-purge job for `.trash/` anywhere in the codebase.

**OQ-26: What does the product promise when a writer deletes a folder — are
its contents cascade-soft-deleted into Trash along with it, or does today's
gap (folders aren't soft-deleted at all) stay as-is until a separate
requirement addresses it?**
**Resolution (owner decision, 2026-09-14):** Fix folder deletion inside
FR-28. Deleting a folder MUST soft-delete the folder and everything
beneath it (nested folders and resources) into the project's Trash instead
of orphaning the contents. Trash MUST represent a deleted folder with its
contents so it can be restored as a unit, and it MUST be possible to
restore or permanently delete that folder together with its contents.
Whether individual items inside a trashed folder can be restored on their
own is a feature-spec decision.
**Impact:** This determines whether FR-28's Trash UI needs to represent
deleted folders as a first-class trash entry (with their former contents
nested under them for restore) or whether folder deletion remains entirely
outside this requirement's scope, leaving today's gap unaddressed.
**Owner:** Product owner.
**Evidence:** The only client-side delete function,
`frontend/src/lib/api/resources.ts`'s `deleteResource`, and the only
delete route, `frontend/app/api/resource/[resource-id]/delete/route.ts`, are
both resource-shaped — the route reads a sidecar for the given id and calls
`softDeleteResource`, which moves a sidecar from `meta/` and files under
`resources/` whose name contains the id. Folders live in a separate
`folders/`-tree structure that `trash.ts` never touches, so invoking the
existing "delete" context-menu action (`ResourceContextMenu.tsx`,
`AppShell.tsx`'s `handleResourceAction`) on a folder id finds no matching
sidecar or `resources/` entries to move and instead only removes the folder
from Redux/on-disk folder-tree state — its contained resources are not
cascade-soft-deleted, moved to `.trash/`, or reported anywhere. This is a
real, pre-existing gap: `getwrite-cli doctor` (`cli/src/commands/doctor.ts`)
exists specifically to detect "orphaned resources/folders" left over from
exactly this kind of gap.

**OQ-27: What must the Trash UI (FR-28) do about a restore whose original
parent folder no longer exists, or whose restore destination collides with
an existing resource of the same name?**
**Resolution (owner decision, 2026-09-14):** A restore never blocks. If the
original parent folder no longer exists, the item goes to the project root.
If the name collides at the destination, it gets a suffix; the exact suffix
wording is a feature-spec decision. The UI MUST tell the writer when an item
was relocated or renamed on restore.
**Impact:** Restore either needs a defined fallback (e.g. restore to
project root, or block with a writer-facing choice) for a missing parent
folder, and a defined collision policy (overwrite, rename, or refuse) for a
same-name clash — neither exists today, so a feature spec would otherwise
invent both silently.
**Owner:** Product owner.
**Evidence:** `restoreResource`'s own doc comment: "If multiple resource
filenames exist in the trash, restores the first match" — the function does
not check whether the resource's original parent folder id still exists in
the current folder tree, and performs no check for a same-named entry
already occupying the restore destination before calling `rename()`.

**OQ-28: Beyond deleting the resource's own trashed content and sidecar,
what should "permanently purge" (FR-28) actually remove, and does it need a
confirmation step?**
**Resolution (owner decision, 2026-09-14):** A permanent delete MUST
require explicit confirmation and MUST remove everything associated with
the resource: the trashed resource files, its sidecar, all its revisions,
and its entries in the inverted index, backlinks, the mention index, and
any authored relationship edges naming it (as source or target). A resource
that was an entity is covered by the same sweep. Emptying Trash and
multi-select delete confirm once for the whole batch. Today
`softDeleteResource` doesn't move revisions to `.trash/`; where revisions
live while trashed is a feature-spec decision, but the purge sweep MUST end
with none remaining.
**Impact:** A writer reasonably expects "permanently purge" to mean the
resource is gone everywhere, but today it is not: `purgeResource` only
`rm`s the sidecar and resource files already sitting in `.trash/`. It never
touches the resource's revision history, its entries in the inverted index,
backlinks, or the entity mention index, or any authored relationship edges
naming it — all of which persist on disk indefinitely, unreferenced, after
a purge. A feature spec needs a decision on whether purge should also sweep
these, which changes its blast radius and whether a confirmation dialog
(as FR-41's Remove Entity action uses) is warranted.
**Owner:** Product owner.
**Evidence:** `frontend/src/lib/models/trash.ts`'s `purgeResource` deletes
only `<projectRoot>/.trash/meta/resource-<id>.meta.json` and
`<projectRoot>/.trash/resources/<id>-*` — it never calls into
`revision-manager.ts`, `indexer-queue.ts`, `backlinks.ts`,
`mention-index.ts`, or `entity-relationships.ts`. Revisions under
`revisions/<resourceId>/v-<N>/` are not moved to `.trash/` by
`softDeleteResource` in the first place, so they remain at their original
path, still keyed to the deleted resource's id, both before and after
purge.

**OQ-29: Which platform(s) does the Trash UI (FR-28) ship on at first
delivery — hosted web, Electron desktop, native Android, or all three —
and what transport parity (ADR-021) does that require?**
**Resolution (owner decision, 2026-09-14):** FR-28 ships on hosted web and
Electron desktop, which share the Next API routes. Native Android parity (a
`createTransport` + `native-*-backend.ts` pair per ADR-021) is deferred,
not rejected.
**Update (2026-09-16):** The deferred native Android parity work is now
underway. `native-trash-backend.ts` exists today only as a stub whose
`list`/`restore`/`purge` each reject as not supported on this platform; the
seam around it (`native-trash-backend.web-stub.ts`, the
`turbopack.resolveAlias` entries) is already in place. This does not
reverse the 2026-09-14 decision — it is the deferred work being taken up,
not a new decision.
**Impact:** No restore or purge transport exists on any platform today, so
this decides real scope: a desktop-first slice needs only a local HTTP
route (or direct model call) plus UI, while day-one parity across all three
platforms means designing native `createTransport`/`native-*-backend.ts`
counterparts for restore and purge alongside the UI, following the pattern
Feature 33 and later features already established for other entity/mention
reads.
**Owner:** Product owner.
**Evidence:** Across `frontend/src/lib/api/*`, `frontend/src/store/
transport/*`, and `frontend/app/api/*`, the only trash-related code in the
entire tree is the single delete route
(`app/api/resource/[resource-id]/delete/route.ts`); there is no HTTP route,
`lib/api/trash.ts`, or `native-*-backend.ts` for `restoreResource` or
`purgeResource` — both model functions are reachable today only from tests,
not from any client, on any platform.

**OQ-30: When a resource is restored from Trash, should the product also
restore other resources' `ResourceRef` fields that were nullified when it
was deleted, or leave them permanently null?**
**Resolution (owner decision, 2026-09-14):** Restore MUST re-link
references. At delete time the product MUST persist a record of exactly
which other sidecars and fields `nullifyResourceRefs` cleared. On restore,
every recorded reference that is still in its cleared `{ id: null, name }`
state MUST be pointed back at the restored resource. A reference that has
changed since MUST be left alone and reported to the writer. That record is
purged with the resource. Where the record is stored is a feature-spec
decision.
**Impact:** Today, deleting a resource nullifies every other resource's
reference to it (`{id: null, name}` retained in place) but restoring it does
not reverse that nullification — a writer who deletes and then restores a
resource would find it back in the tree with its own content intact, but
every place that used to point to it still shows a broken/nulled reference.
Whether restore should re-link those references, and how it would even find
them (nothing records which references were nullified by which deletion),
is undecided.
**Owner:** Product owner.
**Evidence:** `frontend/src/lib/models/trash.ts`'s `nullifyResourceRefs` is
called from the delete route before `softDeleteResource`, patching every
sidecar's `ResourceRef` values that match the deleted id to `{id: null,
name}`; `restoreResource` contains no corresponding re-link step, and no
record of which sidecars were patched by a given deletion is persisted
anywhere for a later restore to consult.

**OQ-31: Does the transport-boundary validation invariant bind only the
current HTTP transport, or every transport that crosses a serialization
boundary — including a future sync transport and the hosted path?**
**Resolution (owner decision, 2026-09-16):** The invariant binds the current
HTTP transport only. The hosted path is already covered because it is itself
HTTP. A future sync transport is explicitly named as deferred and out of
scope, not silently unbound. ADR-021's in-process native transport crosses no
serialization boundary and is unaffected either way.
**Impact:** Determines whether the invariant is written narrowly (HTTP
only) or broadly (any serialization boundary). A narrow reading could leave
a future sync transport unvalidated by default; a broad reading commits
work not yet designed to a guarantee before its shape is known.
**Owner:** Product owner.
**Evidence:** ADR-021's `createTransport` collapse means every client→server
call already resolves HTTP-vs-native through one seam; the native path
returns in-process objects and crosses no serialization boundary, so it is
unaffected either way. No sync transport exists yet to test either reading
against.

**OQ-32: Under this invariant, is a validation failure always a rejection,
or do the existing per-module degrade-by-design contracts in
`frontend/src/lib/api/` survive unchanged?**
**Resolution (owner decision, 2026-09-16):** A validation failure follows the
module's existing contract — reject where the module already rejects,
degrade where it already degrades — but is always surfaced (logged/reported)
so malformed data never propagates silently. This deliberately preserves the
existing per-module UX distinctions — e.g. `lib/api/trash.ts` rejects because
a degrade-to-empty listing would be indistinguishable from a real empty
trash, while other modules degrade so one failed section does not take down
a view. The always-surface half requires plumbing that does not exist today.
**Impact:** `lib/api/trash.ts` rejects on any transport failure by design,
since a degrade-to-empty listing would be indistinguishable from a real
empty trash, while several sibling modules degrade by design instead.
Deciding "validation failure = reject" uniformly would flatten that
distinction; deciding it per-module leaves the invariant's failure
semantics as fragmented as today's error handling.
**Owner:** Product owner.
**Evidence:** Error-handling contracts already differ deliberately across
`frontend/src/lib/api/` modules per the codebase's own documented
conventions (see CLAUDE.md's Store/Transports notes on `lib/api/trash.ts`
vs. its siblings).

**OQ-33: Is the transport-boundary validation invariant retroactive over
the 39 existing `response.json()` call sites in `frontend/src/lib/api/`, or
forward-only for new code?**
**Resolution (owner decision, 2026-09-16):** Staged by cost. Tier 1 — call
sites whose response shapes already have a reusable Zod schema in
`frontend/src/lib/models/schemas.ts` — is remediated first: about 4 sites
across 2 modules (`resources.ts` x3, `project-types.ts` x1). Tier 2 — sites
whose shapes are API-only with no existing schema — is larger than
originally framed: about 22 sites across 12 modules, of which only about 5
sites (the four shapes named below) are scheduled now. The remaining
deferred remainder was re-measured on 2026-09-17 (see Evidence) at 21
unvalidated success-path sites across 12 modules: `resources.ts` (3),
`entity-relationships.ts` (3), `editor-config.ts` (2), `tags.ts` (2),
`mentions.ts` (2), `compile.ts` (2), `export.ts` (2), `encryption.ts` (1),
`preferences.ts` (1), `entity-cooccurrence.ts` (1),
`entity-mention-counts.ts` (1), `resource-excerpts.ts` (1). Three of these
modules — `resources.ts`, `entity-relationships.ts`, `editor-config.ts` —
were not named in the original 2026-09-16 deferred list above; of those,
`resources.ts` and `entity-relationships.ts` are modules Feature 48 itself
partially validated (it validated `resources.ts`'s create/uploadMedia/copy
paths and left its three read paths bare, and validated
`entity-relationships.ts`'s `list`/`listOrThrow` and left its three write
paths bare). This remainder is tracked as a separately scheduled follow-up
beyond the four Tier 2 shapes scheduled now. The four named Tier 2 shapes
scheduled now are `ProjectApiEntry`, `EntityRelationshipEdge`,
`TrashedResourceEntry`/`TrashedFolderEntry`, `EntityAliasTable`; note that
`TrashedResourceEntry`/`TrashedFolderEntry` contributes zero unchecked call
sites in practice, since `trash.ts` already guards all three of its call
sites with a narrow-then-throw check. This is a deliberate staged rollout,
so the invariant is understood as not yet fully true of the codebase while
the deferred remainder is outstanding. One untested hypothesis for why the
2026-09-16 deferred-list count (~17 sites/9 modules) differed from the
2026-09-17 re-measurement (21 sites/12 modules): the original pass may have
counted modules lacking an existing Zod schema rather than sites lacking a
runtime check, which would miss a module like `editor-config.ts` that was
never assigned to either tier. Re-running the original grep against the
pre-Feature-48 tree would settle which explanation is correct.
**Impact:** A retroactive reading implies remediation work across 12
existing Tier-2 modules (plus the 2 Tier-1 modules) before the invariant
can be said to hold; a forward-only reading leaves the concrete failure
already observed (`openProject`) unaddressed unless it is separately
scheduled.
**Owner:** Product owner.
**Evidence:** Measured at 2026-09-16 (pre-Feature-48): of 39
`response.json()` calls across the 17 modules in `frontend/src/lib/api/`,
26 return their parsed body via a bare `as` cast with no runtime check on
the success path; 5 (`trash.ts` x3, `entity-relationships.ts` x2) already
narrow the parsed body with `typeof`/`Array.isArray` guards and throw on a
malformed shape before casting; 3 cast an error-body read
(`encryption.ts:44`, `preferences.ts:63`, `resources.ts:201`); 5 read an
error body with no cast (`projects.ts` x3, `editor-config.ts` x2).
Re-measured at 2026-09-17, on `main` at commit 35353595, after Feature 48
shipped: every `.json()` call site in `frontend/src/lib/api/` was
enumerated and classified by whether its success path returns a cast body
with no runtime check. The remaining unvalidated success-path sites total
21 across 12 modules: `resources.ts` (3: `:291`, `:300`, `:313`),
`entity-relationships.ts` (3: `:180`, `:198`, `:216`), `editor-config.ts`
(2: `:59`, `:74`), `tags.ts` (2), `mentions.ts` (2), `compile.ts` (2),
`export.ts` (2), `encryption.ts` (1: `:49`), `preferences.ts` (1),
`entity-cooccurrence.ts` (1), `entity-mention-counts.ts` (1),
`resource-excerpts.ts` (1). Separately, and not part of the 21, three
error-body casts remain: `encryption.ts:44`, `resources.ts:209`, and
`preferences.ts:63` (a dual-purpose read whose success return is counted
in the 21 above).

**OQ-34: Does replacing the native Trash stub (OQ-29's deferred work)
belong in the same unit of work as extracting the shared `*Core` module
the HTTP restore/purge routes currently lack, or is the extraction a
separable step done first?**
**Resolution (owner decision, 2026-09-16):** The `trash-core.ts` extraction
and the native backend both live under the one feature spec, but the
extraction is its own independently-mergeable task, landing first. This
splits the bisect risk — a regression in the two shipped web/desktop routes
stays separable from new native code — while keeping the two from drifting
apart or being separately deprioritised. Supporting measurements taken
during triage: the extraction is thin, not a refactor — in
`app/api/project/[project-id]/trash/restore/route.ts` (129 lines), roughly
57 lines are already transport-agnostic (`restoreOne(projectPath: string,
id: string)` takes no `NextRequest`/`NextResponse` and does no HTTP work),
with only ~40 lines of genuine HTTP glue (body parsing, `NextResponse`
wrapping, `withStorageContext`); `.../purge/route.ts` has the identical
shape; `.../trash/route.ts` (42 lines) holds roughly 5 lines of real logic.
Existing coverage of the routes a lift would touch:
`frontend/tests/integration/trash-routes.test.ts` (7 cases across all three
routes) and `frontend/tests/integration/trash-legacy-layout.test.ts` (6
cases) — structural coverage only; whether it exercises the branchier paths
(relocated/renamed restores, the ordered purge sweep's retry path) was not
confirmed. This decision deliberately diverges from the repo's own
precedent: both comparable ADR-021 Phase 2 core lifts landed in the same
commit as their native backends — `resource-crud-core.ts` in `d8570063`
("feat(task-3): native transport for resources + resource-excerpts"),
alongside `native-resource-backend.ts`; and `project-crud-core.ts` in
`61eb52bb` ("feat(task-2): native transport for projects +
project-actions-controller"), alongside `native-project-backend.ts`. The
owner chose to separate them here anyway, to keep a refactor of two
shipped, working platforms bisectable from new-platform work.
**Impact:** The restore and purge orchestration (iterate requested ids,
resolve each to a resource or folder, dispatch to the matching
restore/purge function, assemble a per-item results array) lives only in
`app/api/project/[project-id]/trash/restore/route.ts` and
`.../trash/purge/route.ts` today, unlike every comparable native backend in
this codebase, which shares a `*Core` module with its HTTP route. Writing
the native backend directly against `lib/models/trash.ts` would duplicate
that orchestration; lifting it into a shared core touches the two routes
that already work in production on web and desktop. Bundling both changes
into one unit of work carries regression risk for two platforms that
currently function, in service of adding a third that does not yet work at
all; treating them as separable steps changes sequencing and review scope
for whoever picks up the feature spec and task list.
**Owner:** Product owner.
**Evidence:** `app/api/project/[project-id]/trash/route.ts` (42 lines),
`.../trash/restore/route.ts` (129 lines), and `.../trash/purge/route.ts`
(129 lines) contain the per-item dispatch logic directly; no
`trash-core.ts` exists in `frontend/src/lib/models/`.

**OQ-35: Should the native Trash backend, once implemented, match the
"reject on any transport failure" contract `lib/api/trash.ts` already
declares for its web/desktop siblings, or does native's current stub
behavior (rejecting every call) set a different expectation worth
preserving?**
**Resolution (owner decision, 2026-09-16):** The native backend adopts the
same all-reject contract as `lib/api/trash.ts`: `list`/`restore`/`purge` let
anything outside the per-item catch propagate as a rejected promise, while
per-item failures continue to produce `{ ok: false, error }` entries exactly
as the HTTP path does. This is not the obvious reasoning transferred
unchanged — `lib/api/trash.ts`'s rejection rule is about result-shape
ambiguity, not HTTP semantics: a caller cannot distinguish "the batch never
ran" from "it ran and every item failed," and a degrade-to-empty listing is
indistinguishable from a genuinely empty trash. That argument transfers to
an in-process call unchanged. It is also the repo's established convention
that a native backend mirrors its HTTP sibling per-method, evidenced by
`native-entity-relationships-backend.ts`'s `listOrThrow`, which propagates
precisely because its HTTP sibling does, while its sibling methods degrade
because theirs do. The owner attached a condition: the feature spec (rung 4)
MUST enumerate native's actual failure taxonomy against this contract
before implementation — at minimum a missing project root, a Capacitor
filesystem-bridge error, and a `PurgeSweepError` raised mid-sweep — since
nobody has yet checked that an all-reject contract behaves sensibly for
each. The stub's current unconditional reject is an artifact of being
unimplemented (its own module doc says the real implementation is out of
scope) and is not evidence of an intended contract.
**Impact:** `lib/api/trash.ts`'s `list`/`restore`/`purge` all reject rather
than degrade, on the reasoning that a degraded result (an empty list, a
synthesized failure) would be indistinguishable from a real empty trash or
a real per-item failure. A native implementation needs the same contract
decided for it explicitly, rather than inheriting it by default from the
stub it replaces.
**Owner:** Product owner.
**Evidence:** `frontend/src/store/transport/native-trash-backend.ts` (44
lines) rejects unconditionally today, described in this document's Store
section as "a deliberate stub," not an implementation of the eventual
contract.

**OQ-36: Is `adapterFor`'s pass-through of the plain inner adapter when the
keyring is absent or locked (`workspace-adapter.ts:84`) deliberate and
load-bearing for the plaintext-conversion sweep, or an unintended gap in
the fail-closed default this spec now states as a constraint? Separately,
what should a failed locked read return to a caller — a typed error, a
sentinel, or something else — and does each of the three call sites that
currently compensate for this on their own (`loadProjectCore`,
`listProjectsCore`, the CLI `doctor` command) then drop its own check, or
keep it as defence in depth?**
**Impact:** Every caller that reads a locked project's files today either
gets an opaque JSON-parse crash (as `loadProjectCore` does, surfaced as an
HTTP 500) or must carry its own ad hoc compensating check, which is what
`doctor` and `listProjectsCore` currently do independently of each other
and of `adapterFor`. Deciding the caller-facing failure shape also decides
whether these three sites keep their own checks or can retire them.
**Owner:** Product owner.
**Evidence:** Measured 2026-09-17: `adapterFor`
(`frontend/src/lib/models/crypto/workspace-adapter.ts:84`) returns `inner`
unconditionally when `!keyring || keyring.isLocked()`. The nearby
`readTolerantly` function (same file, ~line 117) also falls back to a plain
read, but only after a sealed read fails with `EnvelopeFormatError` and only
when a conversion marker is present on disk — and that path runs under an
unlocked keyring, since `adapterFor` already resolved the encrypting adapter
to get there. That the two mechanisms are distinct is inference from reading
the code, not a measurement of intent; the experiment that would settle it
is exercising `convert-project.ts`'s read paths against a locked keyring and
observing whether anything currently depends on the locked pass-through.
Confirmed by measurement: `loadProjectCore`
(`frontend/src/lib/models/project-crud-core.ts:412-416`) calls
`loadProjectFromDisk` directly with no marker/keyring check, while
`listProjectsCore` (same file, ~113-136) checks the marker itself and
branches to `listEncryptedProject`; the CLI `doctor` command
(`cli/src/commands/doctor.ts:52-68`) independently checks
`isProjectEncrypted` before reading anything and exits 3 with an explanatory
message, its own comment recording that reading through the plain adapter
otherwise throws `Unexpected token 'G', "GWE ..."` on an encrypted project.
**Resolution (owner decision + measurement, 2026-09-17):** Part (a),
settled from evidence: the pass-through is **not** load-bearing. Traced
2026-09-17: `convertProject`
(`frontend/src/lib/models/crypto/convert-project.ts:164`) defaults to
`getPlainStorageAdapter()` and never routes through `adapterFor`.
`enableProjectEncryption`
(`frontend/src/lib/models/crypto/enable-encryption.ts:94-101`) and
`resumeInterruptedConversions` (same file, ~143) both require an unlocked
session keyring before converting. `readTolerantly` only falls back to a
plain read after a sealed read throws `EnvelopeFormatError`, which
requires `adapterFor` to have already returned the encrypting adapter —
i.e. an unlocked keyring; the locked branch at line 84 is never reached by
this path. `project-marker.ts` and `name-index.ts` call the plain adapter
directly by design, not via line 84. The real carve-out is not "line 84
must pass through" but that the `!projectId` branch immediately after it
(`workspace-adapter.ts:86-87`) must keep returning `inner` unconditionally,
because workspace-level files — the keyring, the sealed name index,
dot-prefixed at the tenant root — resolve there. A fix must change line
84's behaviour only for paths that resolve to an actual project id. This
risk does not extend to FR22 (`specs/features/end-to-end-encryption.md:146-148`,
"interrupted conversion leaves the project openable, never
half-readable"): that guarantee is delivered by `readTolerantly`, which as
traced above only ever runs under an unlocked keyring, so the encryption
spec's FR22 says nothing about readability while locked and making line 84
fail closed cannot break it.

Confidence limit: this was a static call-graph trace, not the live
experiment the question originally named. Only `loadProjectCore` was
confirmed broken by measurement; `listProjectsCore` and `doctor`
short-circuit before reaching the adapter. Other readers — resource,
revision, compile, export, search — were not checked and may share the
same opaque-crash shape; a separate measurement of those readers is
underway and its result is not yet known. Treat this as a known limit of
the evidence, not a settled all-clear.

Part (b), owner decision: a failed locked read throws a typed error from a
fail-closed `adapterFor`, reusing the crypto layer's existing convention —
`ProjectLockedError` / `MissingProjectKeyError`
(`frontend/src/lib/models/crypto/adapter-selection.ts:50-74`), which exist
today but are caught by no route or CLI command. The route catches it and
returns a clean 4xx in place of `loadProjectCore`'s current HTTP 500.

`listProjectsCore` and the CLI `doctor` keep their own existing checks as
defence in depth rather than dropping them. Accepted trade-off: two
mechanisms then assert the same fact and could drift apart over time; this
was accepted deliberately, because each fails earlier and with a friendlier,
more specific message than a generic locked-read error would give.

**OQ-37: Does the fix for the locked-write gap (see the locked-access
constraint above) also need to cover the CLI, and does the native
(Capacitor/Android) transport path share the same exposure?**
**Impact:** The CLI binds no encrypting adapter at all — `cli/src`
references encryption only in `doctor.ts` — so a fix implemented solely
inside the encrypting-adapter layer the web/desktop routes go through may
not reach `reindex` or any other CLI write path against a sealed project.
Separately, whether the native transport's own in-process write paths
resolve through the same `adapterFor`/`mutatingAdapter` machinery, or
through a different route with its own exposure, was not examined by this
survey. Scoping the fix without answering either question risks leaving one
or both write paths unprotected after the encrypting-adapter path is fixed.
**Owner:** Product owner.
**Evidence:** Measured 2026-09-17 (static reading, not exercised): the CLI's
`reindex` command (`cli/src/commands/reindex.ts`) contains no encryption
check anywhere in its 150 lines. The native transport path was not
inspected as part of this survey; whether it shares the locked-write
exposure is unresolved.

## Out of Scope (Deferred)

- A keyboard-operable equivalent for dragging a node on the entity
  relationship graph (FR-40, resolved: OQ-6). A keyboard-only user cannot
  reposition a node; the synchronized accessible list remains the
  unaffected read path for every node and edge.
- A roster-row equivalent of the Remove Entity action (FR-41, resolved:
  OQ-10). The action lives only in the entity's own sidebar view; the
  roster (FR-38) remains read-only.
- Carrying Scrivener snapshots across as GetWrite revisions, importing
  Research-folder media, and importing the project's Trash, as part of
  Scrivener import (FR-42/FR-43, resolved: OQ-13). Import is scoped to the
  project's binder — Draft, user-created top-level folders, and text
  documents in Research (widened 2026-09-11 at the Feature 31 feature-spec
  gate) — plus document text, synopsis/notes, status, keywords, and custom
  metadata fields; these three content types (snapshots, Research media,
  Trash) are wanted later but not decided or built now.
- Scrivener 2 project support and Windows-authored `.scriv` project support
  for Scrivener import (FR-42/FR-43, resolved: OQ-16). Only Scrivener 3,
  Mac-authored projects are supported; this is an explicit, documented gap,
  not a rejection.
- Scrivener UI import (FR-43) on hosted web and native Android (resolved:
  OQ-18). Hosted web has no existing multi-file/directory upload or zip
  mechanism to build on (`app/api/resource/upload` is single-file), and
  native Android has no directory-picking precedent; a future requirement
  would be needed for either. FR-43 is scoped to Electron desktop only;
  this deferral is not a permanent exclusion.
- Comments, tracked changes, and images/embedded media as part of
  Word/DOCX import (FR-33, resolved: OQ-20). Text, heading/paragraph
  structure, bold/italic, footnotes, and basic document properties (title,
  author) carry over; these three content types are deferred, not decided
  against.
- Word/DOCX import (FR-33, resolved: OQ-21) on hosted web and native
  Android. FR-33 ships a CLI command and an Electron desktop UI together
  in its first delivery; either other platform would need a future
  requirement of its own.
- Repeatable Word/DOCX import — re-running import to merge into or
  refresh an already-imported GetWrite project (FR-33, resolved: OQ-23).
  Import is one-shot only, mirroring FR-42/FR-43's resolved OQ-12 and
  FR-44's Scrivener-scoped precedent.
- Native Android transport parity for the Trash UI (FR-28, resolved:
  OQ-29). FR-28 ships on hosted web and Electron desktop, which share the
  Next API routes; a `createTransport` + `native-*-backend.ts` pair for
  restore/purge (per ADR-021) would be needed for native Android and is
  deferred, not rejected. As of 2026-09-16 this deferred work is underway
  (see OQ-29's update); it moves out of this list once shipped.
- [Later] Hosted multi-tenant access and cross-device sync as a shipped,
  user-facing product (foundations exist per ADR-017–ADR-022; not shipped).
- [Later] Native Android packaging, signing, and distribution as a shipped
  release channel. The in-process app itself is complete — 15 native
  transport backends collapse every client→server call in-process, a real
  Capacitor filesystem bridge, native bootstrap, and a `build:native`
  static-export pipeline, running inside a real Gradle project
  (`android/android/{build,settings}.gradle`, `app/build.gradle`) — but
  `pnpm --filter getwrite-android build` is a placeholder log statement and
  CI exercises only that placeholder, not a real packaged build.
- Multi-user real-time collaborative editing, and multiple users on a
  shared project generally — a permanent non-goal, not a future milestone
  (resolved: see Non-goals and Constraints).
- [Exploring] Mobile/tablet-optimized responsive layout as a complete
  experience (partial implementation exists).
- [Exploring] Expanded resource-template CLI command set (export/import to
  `.zip`, scaffold, `--vars`, inspect, validate, preview, version,
  changeset) — this exists in the source tree (`cli/src/templates.ts`) but
  is not wired into the shipped `getwrite-cli` binary and is reachable only
  from tests (see FR-19).
