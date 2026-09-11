# Feature Spec: Scrivener CLI importer

**Feature ID:** Feature 31 (`specs/product/getwrite.features.md`)
**Requirements covered (parent):** FR-42 (`specs/product/getwrite.md`)
**User stories (parent):** US-4

## Overview

A novelist migrating from Scrivener has no way to bring an existing project
into GetWrite except by manually re-creating its structure, prose, and
metadata by hand. This feature adds a `getwrite-cli` command that reads a
Scrivener 3, Mac-authored `.scriv` project and creates a new GetWrite project
that mirrors its Draft binder's folder/document hierarchy, each document's
text, and a defined set of per-document metadata. It is a one-shot,
CLI-only conversion — the first of two committed deliverables (the second,
a UI wrapper, is Feature 43) and does not touch the source project.

## Goals

- A writer can run one CLI command against a Scrivener 3, Mac-authored
  `.scriv` project and get back a new, complete GetWrite project.
- The Draft binder's folder/document nesting and per-document text, plus
  Research-folder text content and every top-level user folder beside
  Draft/Research/Trash, carry over faithfully into GetWrite's resource
  tree.
- Each document's synopsis, notes, status, label, keywords, and custom
  metadata fields carry over onto GetWrite's metadata layer.
- Content the importer cannot convert is skipped without aborting the run,
  and the writer gets a readable report of what was skipped and why.
- An unsupported source project (Scrivener 2, or Windows-authored) is
  detected and refused with a clear message rather than partially imported.

## Non-goals

- No writer-facing UI for import (Feature 43).
- No re-import, merge, or refresh against a previously-imported project
  (Feature 44); every run creates a fresh GetWrite project.
- No carry-over of Scrivener snapshots as GetWrite revisions, no import of
  non-text Research content (media, PDFs, web archives), and no import of
  the project's Trash.
- No support for Scrivener 2 projects or Windows-authored `.scriv` projects
  beyond detecting and refusing them.
- No write access to the source `.scriv` project under any circumstance.

## User stories

- US-1: As a novelist migrating from Scrivener, I want to import my existing
  Scrivener project into GetWrite so that I don't have to manually re-create
  its structure. [parent US-4]

## Functional requirements

1. FR-1: The CLI MUST offer the subcommand
   `getwrite-cli project import-scrivener <scrivPath> [projectRoot]`,
   registered under the existing `project` command group alongside
   `project create` and wrapped in `runForTenant` the same way
   (`cli/src/commands/project.ts:4-47`), producing a new, complete GetWrite
   project in one run. (Resolves former OQ-1.) [US-1]
2. FR-2: Before converting anything, the command MUST inspect the source
   project's `<name>.scrivx` root element and refuse to import — with a
   clear message and a non-zero exit code, writing nothing to the
   destination — when the project is not Scrivener 3, Mac-authored. The
   measured evidence for a Scrivener-3, Mac-authored project examined for
   this spec (`import-inputs/The SF Sideshow.scriv`, gitignored, structure
   only) is `<ScrivenerProject Identifier="..." Version="2.0"
   Creator="SCRMAC-3.5.2-17487" Device="...">` — the `Creator` attribute
   carries the `SCRMAC-<version>` token identifying both the authoring
   platform (Mac) and the Scrivener major version, while `Version` is the
   `.scrivx` schema version and does not vary with Scrivener's own release
   number. Windows-authored projects have not been surveyed and their exact
   `Creator` token format is not confirmed by this spec; the command MUST
   nonetheless treat this as an allow-list — refusing any project whose
   `Creator` does not start with `SCRMAC-3`, rather than special-casing
   Windows or Scrivener 2 — so an unrecognised format is refused by default
   (former OQ-8, now resolved). [US-1]
3. FR-3: The command MUST parse the source project's `.scrivx` Binder tree
   and, for every `BinderItem` under the `DraftFolder` subtree, create a
   corresponding GetWrite folder (for `Type="Folder"`) or text resource (for
   `Type="Text"`) at the same nesting depth and order, using each item's
   `Title` as the GetWrite folder/resource name, with the converted Draft
   content placed directly at the destination project's root (not nested
   under an extra folder named after the `DraftFolder` title) — chosen
   because the Draft is the project's primary manuscript and GetWrite's own
   `project-creator.ts` already seeds a new project's default resources
   directly into root-level folders, so this keeps the manuscript at the
   same depth a writer expects to find it, while Research content and each
   top-level user folder (FR-16, FR-17) each get their own top-level
   GetWrite folder since they are secondary to the Draft. `TrashFolder` and
   any `Type="Other"` item, wherever they occur in the binder, MUST be
   excluded from conversion and listed in the report (FR-9); Trash remains
   deferred per FR-42's scope. The three `Other` items observed in the
   survey project were measured under a user folder titled "Recovered Files
   (Jul 28, 2025 …)", each with a `content.xml` wrapping an embedded RTF
   comment; that they are Scrivener sync-conflict artifacts rather than
   user content is a likely inference from that shape, not a confirmed
   fact, and the importer's handling (skip and report, never guess) does
   not depend on which is true. [US-1]
4. FR-4: For every converted `Text` binder item, the command MUST read its
   `Files/Data/<UUID>/content.rtf` body, convert it with the RTF→TipTap
   converter from FR-14, and write the result as `content.txt` (plain text)
   plus `content.tiptap.json` for the created resource
   (`resource-persistence.ts`), then write it as that resource's initial
   canonical revision following the bulk-create pattern
   `createProjectFromType` already uses for a project type's seeded
   resources — `writeResourceToFile` followed by `writeRevision(...,
   { isCanonical: true })` (`frontend/src/lib/models/project-creator.ts:334-341`;
   the single-resource equivalent used by the resource-creation API route is
   `createResourceCore`, `frontend/src/lib/models/resource-crud-core.ts:106-128`).
   [US-1]
5. FR-5: For every converted `Text` binder item that has a
   `Files/Data/<UUID>/synopsis.txt` and/or `notes.rtf`, the command MUST
   carry that content into the created resource's sidecar
   `userMetadata.synopsis` / `userMetadata.notes` fields (the same
   `userMetadata` keys the built-in Synopsis/Notes schema fields already use
   — `default-metadata-schema.ts`), and MUST enable the corresponding
   per-project feature toggles (FR-9 of the parent spec) on the created
   project so those fields are visible. [US-1]
6. FR-6: For every converted `Text` binder item carrying a `StatusID` in its
   `.scrivx` `MetaData`, the command MUST resolve that ID against the
   project's `StatusSettings` block and write the resolved status label into
   the resource's `userMetadata.status`. The created GetWrite project's
   `config.statuses` MUST be seeded from the source project's
   `StatusSettings` labels (matching how `project-creator.ts`'s
   `createProjectFromType` already accepts a `statuses` array on a project
   type spec). Scrivener's separate `LabelID`/color-coded Label and its
   `Keywords` are mapped onto GetWrite's metadata layer by FR-15. [US-1]
7. FR-7: For every converted `Text` binder item carrying `CustomMetaData`
   entries, the command MUST create a corresponding user-defined field in
   the destination project's metadata schema (per field `Type` —
   `Text`/`Date`/`List` observed in the survey project map to GetWrite's
   `text`/`date`/`select` field types respectively) the first time that
   field is encountered, and MUST write each document's per-field value
   into `userMetadata.<fieldKey>` on its resource's sidecar. [US-1]
8. FR-8: When the command encounters content it cannot convert — an RTF
   feature with no GetWrite equivalent, a malformed or unreadable
   `content.rtf`/`.scrivx` fragment, or a custom-metadata field type with no
   GetWrite mapping — it MUST skip only that item, continue importing the
   rest of the project, and record the skip (item title, its binder path,
   and a reason) for the post-import report. [US-1]
9. FR-9: On completion, the command MUST write a report file the writer can
   read, listing: (a) every skipped item and reason from FR-8; (b) every
   tag-name merge from FR-15's Keywords import; (c) non-text Research
   content (media, PDFs, web archives, and any other item under
   `ResearchFolder` that is not a `Folder`/`Text` binder item) that FR-16
   intentionally did not carry over; (d) every `Type="Other"` binder item
   skipped by FR-3, wherever it occurred in the binder; (e) the project's
   Trash content; and (f) any snapshot history — so a writer can see
   everything the import left behind rather than have it silently vanish. [US-1]
10. FR-10: The command MUST NOT write to, modify, or delete anything under
    the source `.scriv` project path; all filesystem writes MUST target only
    the newly created destination GetWrite project and its report. [US-1]
11. FR-11: The command MUST create the destination as a complete, valid
    GetWrite project (`project.json`, `folders/`, `resources/`, `meta/`
    sidecars, and an initial canonical revision per resource) and MUST
    leave the project's search/backlink/mention indexes in a consistent
    state on completion — either building them incrementally during import
    or by invoking the existing `reindex` command's rebuild logic
    (`cli/src/commands/reindex.ts`) at the end of the run. [US-1]
12. FR-12: Test coverage for this command MUST use a synthetic,
    committable `.scriv` fixture built for the purpose (binder XML plus
    minimal RTF/synopsis/notes/metadata files), not the private sample
    project at `import-inputs/The SF Sideshow.scriv`, which is gitignored
    and reserved for manual verification only. The fixture MUST include a
    `Folder`-type binder item that itself carries a `content.rtf` body and
    a `Text`-type binder item that itself has child binder items — both
    shapes required by FR-13 below and neither exercised by the survey
    project (measured: 0/20 `Folder` items had their own `content.rtf`; 0
    `Text` items had children). [US-1]
13. FR-13: A Scrivener `Folder`-type binder item that itself carries a
    `content.rtf` body MUST import as a GetWrite folder whose first child
    is a text resource, named after the folder, holding that converted
    text. A Scrivener `Text`-type binder item that itself has child binder
    items MUST import as a GetWrite folder of the same name, containing the
    document's own converted text as its first child resource, followed by
    its converted children in binder order. (Resolves former OQ-6.) [US-1]
14. FR-14: The command MUST convert each `content.rtf` body to
    `content.tiptap.json` preserving bold and italic formatting as TipTap
    marks named `bold` and `italic` — confirmed as the mark names the
    editor actually persists on disk (`bold` at
    `projects/c02957ec-8ad1-480f-a5e9-62017ad1f525/resources/54ad1035-3dec-41bb-8fa5-7c35e868c76c/content.tiptap.json`;
    `italic` at
    `.../f099b2be-f15d-4fd6-b40e-e808cbeac7a3/content.tiptap.json`) — using
    a hand-rolled RTF parser scoped to the control words measured present
    in the survey project's `content.rtf` bodies (`\b`/`\b0`, `\i`/`\i0`,
    `\uN` Unicode escapes, `\field`/`HYPERLINK`) plus paragraph structure.
    No RTF-parsing dependency MUST be added, consistent with
    `docs/standards/package-selection.md`. A `\field`/`HYPERLINK` run MUST
    convert to plain text (its visible text only, mark-free) rather than a
    TipTap link mark — the simpler faithful option, chosen over building
    link-mark support for the 3 files measured to use it — and MUST be
    listed in the FR-9 report as a formatting feature dropped. Any other
    RTF control word encountered MUST be handled per FR-8: kept as plain
    text where safe, otherwise skipped-with-reason. `content.txt` remains
    plain text with no formatting. (Resolves former OQ-4 and OQ-5.) [US-1]
15. FR-15: Scrivener's `LabelID`/color-coded Label MUST be imported as a
    user-defined custom **select** field named "Label" on the destination
    project's metadata schema (`"select"` is an existing field type,
    `frontend/src/lib/models/schemas.ts:135`), with its options seeded from
    the source project's `LabelSettings` block; each document's `LabelID`
    MUST be resolved against that block and written to `userMetadata.label`
    on its sidecar. Scrivener's `Keywords` MUST be imported as GetWrite
    tags (`tags.ts`) named by each keyword's **leaf** name only — the
    hierarchy path (e.g. `Characters > Protagonists > Case`) is dropped.
    Because import always targets a fresh project, a tag-name collision can
    only arise among the imported keywords themselves (e.g. two distinct
    keywords with the same leaf name under different parents in the source
    project's keyword tree); such keywords MUST merge into one GetWrite
    tag, and every such merge MUST be recorded in the FR-9 report.
    (Resolves former OQ-2.) [US-1]
16. FR-16: Text documents and folders under the source project's
    `ResearchFolder` subtree MUST be imported the same way as Draft content
    (FR-3, FR-13, FR-14), placed under a top-level GetWrite folder named
    "Research", preserving the source hierarchy. Only non-text Research
    content (images, PDFs, web archives, and any other non-`Folder`/`Text`
    item under `ResearchFolder`) remains deferred and MUST be listed in the
    FR-9 report. [US-1]
17. FR-17: Every top-level binder item other than `DraftFolder`,
    `ResearchFolder`, and `TrashFolder` (in the survey project: the user
    folders "Templates", "Archive", "Scraps", and "Recovered Files (Jul 28,
    2025 …)", measured holding 2, 6, 1, and 0 `Text` items respectively,
    plus 3 `Other` items under "Recovered Files (…)") MUST be imported as
    its own top-level GetWrite folder alongside the Draft content and
    Research folder, preserving hierarchy, using the same conversion rules
    as Draft content (FR-3, FR-13, FR-14). `Type="Other"` items within
    these folders remain excluded per FR-3 and reported per FR-9. [US-1]

## Open questions

- OQ-1 (resolved, 2026-09-11 owner decision): CLI subcommand name and
  invocation shape is
  `getwrite-cli project import-scrivener <scrivPath> [projectRoot]`,
  registered under the existing `project` command group and wrapped in
  `runForTenant` like `project create` (`cli/src/commands/project.ts:4-47`).
  — Impact: FR-1.
- OQ-2 (resolved, 2026-09-11 owner decision): Scrivener Label maps to a
  user-defined custom **select** field named "Label" (options from
  `LabelSettings`, per-document `LabelID` resolved into the sidecar).
  Keywords map to GetWrite tags named by the **leaf** keyword name, with
  hierarchy path dropped; because import always targets a fresh project,
  a name collision can only arise among the imported keywords themselves,
  and such collisions merge into one tag and are reported. — Impact:
  FR-15.
- OQ-3 (resolved, 2026-09-11 owner decision): One combined implementation
  pass; no split into a binder-plus-text slice and a separate
  metadata-mapping slice. — Impact: FR-4 through FR-9, FR-13 through
  FR-17.
- OQ-4 (resolved, 2026-09-11 owner decision, accepted from evidence): a
  hand-rolled RTF parser scoped to the measured control words (`\b`/`\b0`,
  `\i`/`\i0`, `\uN` unicode escapes, `\field`/`HYPERLINK`) plus paragraph
  structure, no new dependency — measured against the survey project's 75
  RTF files: `\b`/`\b0` bold in 38, `\i`/`\i0` italic in 58, `\uXXXX`
  Unicode escapes in 32, `\field`/`HYPERLINK` in 3; zero files used `\ul`
  underline, `\trowd`/`\intbl` tables, `\pict` images, `\strike`
  strikethrough, or any Scrivener-specific `scrivlnk://` link or
  annotation/comment control word. — Impact: FR-14.
- OQ-5 (resolved, 2026-09-11 owner decision): bold and italic are
  preserved as TipTap marks in `content.tiptap.json`, named `bold` and
  `italic` — confirmed as the mark names the editor actually persists by
  inspecting on-disk projects (`bold` at
  `projects/c02957ec-8ad1-480f-a5e9-62017ad1f525/resources/54ad1035-3dec-41bb-8fa5-7c35e868c76c/content.tiptap.json`;
  `italic` at
  `.../f099b2be-f15d-4fd6-b40e-e808cbeac7a3/content.tiptap.json`).
  `TipTapNodeSchema`/`TipTapDocumentSchema` (`frontend/src/lib/models/schemas.ts:305-318`)
  declare no `marks` field but are used only within `schemas.ts` itself
  (no other consumer in `frontend/src`, `frontend/app`, or `cli/src`), so
  no schema change is required; the work is a new RTF→TipTap converter,
  since `plainTextToTiptap` (`frontend/src/lib/tiptap-text.ts`) has no mark
  support. `content.txt` stays plain text. — Impact: FR-14.
- OQ-6 (resolved, 2026-09-11 owner decision): a Scrivener `Folder`-type
  binder item with its own `content.rtf` imports as a GetWrite folder
  whose first child is a text resource named after the folder holding
  that text; a Scrivener `Text`-type binder item with child items imports
  as a GetWrite folder of the same name containing the document itself as
  its first child resource, followed by its converted children. Neither
  shape is exercised by the survey project (0/20 folders with text; 0
  Text items with children — measured), so the synthetic test fixture
  (FR-12) must include both. — Impact: FR-13.
- OQ-7 (resolved, 2026-09-11 owner decision, accepted from evidence):
  path-aware folder creation that tracks each created folder's id and
  assigns children by parentId (the pattern at
  `project-creator.ts:248-272`), not the slug-matching `defaultFolders`
  mechanism (`project-creator.ts:276-282`), which would collide two
  same-named folders in different branches. — Impact: FR-3.
- OQ-8 (resolved, 2026-09-11 owner decision, accepted from evidence):
  allow-list detection — accept only when the root `<ScrivenerProject>`
  `Creator` starts with `SCRMAC-3`; refuse everything else (Windows,
  Scrivener 2, unrecognised) with a clear message, non-zero exit, nothing
  written. — Impact: FR-2.

## Out of scope (deferred)

- Scrivener snapshots (`Snapshots/<UUID>.snapshots/*.rtf`) as GetWrite
  revisions.
- Non-text Research-folder content: media, PDFs, web archives, and any
  other item under the `.scrivx` `ResearchFolder` subtree that is not a
  `Folder`/`Text` binder item. (Research-folder *text* content — documents
  and folders — is in scope; see FR-16.)
- The project's Trash (`TrashFolder` subtree).
- Any `Type="Other"` binder item, wherever it occurs in the binder. The
  three observed in the survey project were measured under a user folder
  titled "Recovered Files (Jul 28, 2025 …)", each with a `content.xml`
  wrapping an embedded RTF comment; that they are Scrivener sync-conflict
  artifacts rather than user content is a likely inference from that
  shape, not a confirmed fact.
- Scrivener 2 project support and Windows-authored `.scriv` project
  support (Feature 31 detects and refuses these; a future feature would be
  needed to actually support them).
- Repeatable/merge import against an already-imported project (Feature 44).
- A writer-facing UI for import (Feature 43).
