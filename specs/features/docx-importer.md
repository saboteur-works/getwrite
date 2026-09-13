# Feature Spec: Word/DOCX project importer

**Feature ID:** Feature 45 (`specs/product/getwrite.features.md`)
**Requirements covered (parent):** FR-33 (`specs/product/getwrite.md`)
**User stories (parent):** US-18

## Overview

A novelist migrating from Word has no path into GetWrite today short of
manually re-creating their project by hand. This feature adds a DOCX
importer — a CLI command and an Electron desktop UI shipped together — that
converts either a single `.docx` file or a folder of `.docx` files into a
new, complete GetWrite project: text, heading/paragraph structure,
bold/italic, footnotes, and basic document properties carry over; content
the importer cannot convert is skipped, reported, and never aborts the run.
Unlike Feature 31/43's Scrivener importer, `.docx` has no binder-like
container to read a project's own document boundaries from, so the split
between "one document" and "many resources" has to come from the document's
own heading structure or from the filesystem, not from a self-describing
project format.

## Goals

- A writer can import a single `.docx` file or a folder of `.docx` files,
  auto-detected, into a fresh GetWrite project without hand-recreating
  structure.
- A single `.docx`'s Heading 1 sections (configurable to another level or to
  no split) become separate GetWrite resources; a folder's own subdirectory
  structure is mirrored as GetWrite folders.
- Text, heading/paragraph structure, bold/italic, footnotes, and title/author
  properties carry over; unconvertible content is skipped and reported, never
  silently dropped or fatal.
- A writer using the desktop app can run the import without a terminal,
  following Feature 43's native-picker, main-process-only path pattern.
- Each import is one-shot into a fresh, writer-chosen project type; a
  non-empty destination is refused before any write.

## Non-goals

- Comments, tracked changes, and images/embedded media (deferred per the
  parent spec's resolved OQ-20; see Out of scope).
- Repeatable/merge import into an already-imported project (deferred per
  resolved OQ-23, mirroring Feature 44's Scrivener equivalent).
- Hosted web and native Android DOCX import (deferred per resolved OQ-21).
- Any change to Feature 31/43's Scrivener import conversion, UI, or CLI.
- Scrivener 2 / Windows-authored `.scriv` support — unrelated to this format
  entirely.

## User stories

- US-1: As a novelist migrating from Word, I want to import a single `.docx`
  manuscript, split into chapters, into a new GetWrite project so that I
  don't have to manually re-create its structure. [parent US-18]
- US-2: As a novelist with a folder of `.docx` files (one per chapter or
  scene), I want to import the whole folder, with its subfolders preserved,
  into a new GetWrite project so that I don't have to import each file by
  hand. [parent US-18]
- US-3: As a novelist using the desktop app, I want to run this import from
  the UI so that I don't have to open a terminal, the same way I can already
  import a Scrivener project. [parent US-18]

## Functional requirements

1. FR-1: The importer MUST accept a single `.docx` file or a directory as its
   source and MUST auto-detect which kind it is (resolved parent OQ-19); a
   directory containing no `.docx` file anywhere in its tree MUST be refused
   before any write, mirroring `DestinationNotEmptyError`'s "refuse before
   writing" convention in `import-scrivener-project.ts`. [US-1][US-2]
2. FR-2: For a single `.docx` source, the importer MUST split the document
   into one GetWrite resource per Heading 1 section by default, MUST accept a
   configurable split level (another heading level, or no split at all), and
   a document with no headings at the chosen level MUST import as a single
   resource with the import report recording that (resolved parent OQ-19).
   [US-1]
3. FR-3: For a folder-of-`.docx` source, the importer MUST create one GetWrite
   resource per `.docx` file and MUST mirror the folder's own subdirectory
   structure as GetWrite folders, matching how `binder-mapper.ts` mirrors
   Scrivener's binder folders (resolved parent OQ-19). [US-2]
4. FR-4: Imported content MUST include text, heading/paragraph structure, and
   bold/italic — the same fidelity bar as `rtf-to-tiptap.ts` — plus footnotes
   and endnotes (converted per FR-13) and basic document properties, title
   and author (mapped per FR-14); comments and images/embedded media MUST NOT
   be imported, and tracked-change markup (revision marks, authorship, and
   the ability to accept or reject) MUST NOT be preserved — the document's
   text MUST import as if every tracked change were accepted (insertions
   kept, deletions dropped; resolved parent OQ-20, see also FR-6(c), FR-18,
   OQ-10). The
   conversion pipeline MUST be DOCX → `mammoth` HTML (collecting `mammoth`'s
   own conversion messages/warnings for the FR-6 report's skipped/
   unconvertible section (a); sections (b), (c), and (d) come from FR-18's
   own detection, not from mammoth's messages) → TipTap JSON, per FR-16
   (resolved: OQ-5). [US-1][US-2]
5. FR-5: When the importer encounters content it cannot convert, it MUST skip
   that item, continue importing the rest of the project, and record the skip
   with its location and reason — mirroring `import-scrivener-project.ts`'s
   skip-and-continue convention — never aborting the run on a single
   unconvertible item (resolved parent OQ-22). [US-1][US-2]
6. FR-6: The importer MUST produce a DOCX-specific post-import report, written
   to the destination project root, whose sections reflect DOCX content
   rather than reusing Scrivener's eight-section list as-is (resolved parent
   OQ-22). The report MUST be built and written by a new sibling module,
   `frontend/src/lib/models/docx/docx-import-report.ts`, mirroring
   `import-report.ts`'s `buildImportReport`/`writeImportReport` build-and-write
   shape without modifying `import-report.ts` itself (resolved: OQ-4). Its
   sections MUST be, at minimum: (a) skipped/unconvertible items (FR-5); (b)
   comments not imported; (c) tracked changes: since `mammoth` imports
   tracked-change content as accepted-as-shown (insertions kept, deletions
   dropped — resolved: OQ-10), this section MUST instead record that the
   document contained tracked changes and how many, so the writer knows this
   happened, per FR-18's own detection; (d) images/embedded media not
   imported; (e) non-`.docx` files skipped in a folder source, plus lock
   files and hidden/dot files, summarized per FR-15; (f) documents with no
   heading at the chosen split level (FR-2); (g) footnotes and endnotes
   converted to the endnote-style Notes-list treatment (FR-13) (resolved:
   OQ-4); and (h) Untitled Fallback Names: each generated "Untitled"/
   "Untitled 2"/... resource name produced by FR-14's no-heading/preamble
   naming rule, mirroring Scrivener's own "Untitled Fallback Names" report
   section (owner decision, Stage 6.5, 2026-09-13). [US-1][US-2]
7. FR-7: Each import run MUST create a fresh GetWrite project and MUST refuse
   a non-empty destination before any write, mirroring
   `DestinationNotEmptyError`'s existing "refuse before writing" behavior;
   repeatable/merge DOCX import is out of scope (resolved parent OQ-23). The
   refusal MUST be reported to the writer with DOCX-appropriate wording and
   MUST NOT mention Scrivener; the Scrivener importer's own refusal message is
   unchanged (Non-goals) (owner decision, Stage 6.5, 2026-09-13 — measured
   finding: the DOCX CLI's non-empty-destination refusal printed `Cannot
   import Scrivener project: destination "…" already exists and is not
   empty…`, because `import-docx-project.ts` reuses `DestinationNotEmptyError`
   from the Scrivener importer along with its Scrivener-worded message).
   [US-1][US-2]
8. FR-8: The writer MUST choose the destination project's project type at
   import time — a CLI flag (`-t, --project-type`, FR-9) and, on the desktop
   UI, a UI control (FR-10) — from the existing project types under
   `getwrite-config/templates/project-types/`, identified by each spec's own
   `id` field (`article`, `blank`, `game_writing`, `novel`,
   `poetry_and_lyrics`, `serial` — verified against every spec's `id` field;
   note `game_documentation.json`'s `id` is `game_writing`, not
   `game_documentation`), defaulting to `blank` when the writer chooses none
   (resolved parent OQ-23; resolved: OQ-3). An unknown project-type id MUST
   be refused before any write (FR-9). The destination project's tree MUST
   mirror the source only — a single document's split sections (FR-2) or a
   folder's own subdirectory structure (FR-3) — and the chosen project type
   MUST contribute config only (statuses, metadata schema) and MUST NOT
   scaffold its own default folders (owner decision, Stage 6.5, 2026-09-13,
   confirming measured behavior: with `-t novel`, statuses were populated but
   none of the type's default folders were created — this is the intended
   behaviour, not a defect). [US-1][US-2][US-3]
9. FR-9: The product MUST ship a CLI command for this import (mirroring
   `getwrite-cli project import-scrivener`'s registration in
   `cli/src/commands/project.ts`) and an Electron desktop UI together in the
   first delivery, not CLI-first (resolved parent OQ-21). The command MUST be
   `getwrite-cli project import-docx <source> [projectRoot] [-n, --name
   <name>] [-s, --split-level <1-6|none>] [-t, --project-type <id>]`,
   registered under the existing `project` command group the same way as
   `import-scrivener`. Defaults are split level `1` and project type `blank`
   (FR-2, FR-8). `--split-level` MUST be refused — a clear message, non-zero
   exit, nothing written — when `<source>` is a folder, not silently ignored,
   since FR-3's per-file split does not use a heading level. An unknown
   `--project-type` id or an invalid `--split-level` value MUST be refused
   before any write (resolved: OQ-9). [US-1][US-2][US-3]
10. FR-10: The desktop UI's source picker MUST run in the Electron main
    process and MUST NOT let the picked path cross into the renderer or reach
    a Next API route, following Feature 43's native-picker pattern
    (`docs/standards/security.md` §2, "Never Trust a Client-Supplied Path";
    resolved parent OQ-21). The dialog MUST offer two explicit buttons —
    "Choose document…" (invoking `dialog.showOpenDialog` with
    `properties: ["openFile"]`, filtered to `.docx`) and "Choose folder…"
    (invoking it with `properties: ["openDirectory"]`) — each calling its own
    main-process picker, behaving identically on every platform; the picked
    path is returned to the renderer only as an opaque selection handle, the
    same pattern as Feature 43's `selection-handles.ts`. The main process
    still performs FR-1's auto-detection in the conversion layer once a
    selection is made — the two buttons choose which native picker mode to
    open, not which conversion path to run. The dialog MUST also expose the
    split level (FR-2; shown only when a document was chosen) and the
    project type (FR-8) before starting the import (resolved: OQ-6).
    [US-3]
11. FR-11: Hosted web and native Android DOCX import MUST NOT be built by this
    feature (resolved parent OQ-21; deferred, not rejected — see Out of
    scope). [US-1][US-2]
12. FR-12: This feature MUST add a rigorous fixture-based test suite covering
    DOCX parsing; the CI suite MUST run against committed synthetic `.docx`
    fixtures, since no `.docx` sample exists in this repository today
    (`import-inputs/` holds only the `.scriv` sample used for Feature 31/43).
    A real Word-authored manuscript, supplied separately by the owner, is a
    manual check only and MUST NOT be relied on by CI (see below). The
    committed fixtures MUST be
    synthetic `.docx` files generated with the existing `docx` generation
    package (`frontend/package.json`'s `docx@9.6.1`, already used for
    compile/export), produced by a one-time generation script (e.g.
    `frontend/tests/fixtures/docx/generate-docx-fixtures.ts`) run to produce
    committed binary `.docx` fixtures, rather than regenerated in every test
    run's setup — preferred because it gives tests a stable, reviewable
    artifact that does not silently drift with a future `docx` version bump,
    mirroring `scrivener-cli-importer.md`'s FR-12 committed-synthetic-fixture
    convention (there, hand-built XML/RTF; here, a generation script over the
    `docx` package). Verified against
    `docx@9.6.1`'s type declarations
    (`node_modules/docx/dist/index.d.ts`): the package can produce every
    construct this suite needs — multi-level headings, bold/italic,
    footnotes (`Document.Footnotes.createFootNote`,
    `FootnoteReferenceRun`), endnotes (`Document.Endnotes.createEndnote`,
    `EndnoteReferenceRun`), comments (`Comment`, `CommentRangeStart`,
    `CommentRangeEnd`, `CommentReference`), tracked changes
    (`InsertedTextRun`, `DeletedTextRun`), and images (`ImageRun`) — so no
    fixture in this suite needs a hand-built OOXML fallback. The fixture set
    MUST cover: multiple heading levels; bold/italic; footnotes and
    endnotes; core title/author (`docProps/core.xml`); comments; tracked
    changes; an image; a document with no headings; and a folder tree with a
    nested subfolder, a non-`.docx` file, and a `~$` lock file (resolved:
    OQ-8). Separately, the owner will supply one real Word-authored
    manuscript as a gitignored sample under `import-inputs/` for a manual
    check when the feature is exercised, mirroring
    `import-inputs/The SF Sideshow.scriv`; this sample is not a CI
    requirement (resolved: OQ-8). [US-1][US-2]

13. FR-13 (added 2026-09-13, owner decision): Footnote and endnote conversion
    is a TEMPORARY measure pending a real footnote node in GetWrite's TipTap
    schema (see Out of scope). Each footnote or endnote reference in the
    running text MUST be rendered as plain "[n]" text at the point of
    reference, and every referenced footnote's and endnote's text MUST be
    appended as a numbered "Notes" list at the end of the resource that
    contains the reference (a footnote/endnote referenced from a
    mid-document split section, per FR-2, lands in that section's own
    resource, not the document's first or last resource). No TipTap schema
    change is made. Plain "[n]" text, rather than a superscript number, is
    used because no superscript mark exists to render one with — verified
    against `frontend/components/Editor/editorExtensions.ts`:
    `baseSchemaExtensions` includes no superscript or subscript mark — no
    `@tiptap/extension-superscript`/`-subscript` import, and `StarterKit` is
    configured with `heading`/`bulletList`/`orderedList`/`listItem`/
    `blockquote`/`codeBlock`/`listKeymap` disabled but does not itself supply
    a superscript mark by default either (resolved: OQ-1). [US-1][US-2]
14. FR-14 (added 2026-09-13, owner decision): A DOCX source's title and
    author, read from `docProps/core.xml` (mammoth does not read document
    properties, so this is a small separate read reusing the already-present
    `fast-xml-parser`), MUST be mapped as follows. For a single-`.docx`
    source: the document's core title MUST become the destination project's
    name when the writer supplies neither `-n`/`--name` (CLI) nor a name in
    the desktop UI; the document's core author, when present, MUST be
    written to an "Author" custom metadata field under a dedicated
    `docx-import` metadata group, created via `metadata-schema.ts`'s
    `addGroup`/`addField` the same way `import-scrivener-project.ts` creates
    its own `scrivener-import` group (`METADATA_GROUP_ID`,
    `frontend/src/lib/models/scrivener/import-scrivener-project.ts:230`) for
    its Label field, on every resource created from that document (i.e. on
    each of FR-2's split resources, since they share one source author). For
    a folder-of-`.docx` source: the destination project's name MUST come
    from the source folder's own name (still overridden by `-n`/`--name`
    when given), and each file's own core title, when present and non-empty,
    MUST become that file's created resource's `name` (falling back to the
    filename without its `.docx` extension when the title is absent or
    empty); each file's own core author, when present, MUST be written to
    that same file's resource under the `docx-import` group's "Author" field,
    the same field/group used in the single-document case (resolved: OQ-2).
    For a single-`.docx` source, when the document has no heading at the
    chosen split level (including `--split-level none`), the one resulting
    resource MUST be named the same way FR-14 already names the
    whole-document resource in the folder case: from the document's core
    title, falling back to the filename without its `.docx` extension when
    the title is absent or empty. When non-empty content precedes the first
    split-level heading, that leading section MUST be created as its own
    resource named "Untitled", or "Untitled 2", "Untitled 3", and so on if
    the name repeats under the same parent; each such generated name MUST be
    recorded in the FR-6(h) report section (owner decision, Stage 6.5,
    2026-09-13 — measured finding: a single-document import named the
    resource "Front Matter" both when the whole document had no heading at
    the split level, e.g. `footnotes-endnotes.docx`/`tracked-changes.docx`,
    and when content preceded the first heading, seen on the owner's real
    manuscript — two different conditions collapsed into one name). [US-1]
    [US-2]
15. FR-15 (added 2026-09-13, owner decision): A folder source MUST be
    traversed recursively to any depth (FR-3's subdirectory mirroring is not
    limited to one level). A non-`.docx` file, a Word temporary lock file
    (`~$*.docx`, created while a document is open in Word), and any
    hidden/dot file or directory (a name starting with `.`) MUST be skipped
    and summarized in the FR-6 report as one line per category, not one line
    per file. A subfolder containing no `.docx` file anywhere beneath it
    MUST NOT be created as a GetWrite folder. Resources and folders created
    within the same parent MUST be ordered deterministically, in
    case-insensitive natural filename order (e.g. "Chapter 2" sorts before
    "Chapter 10") — verified that no existing filename-ordering convention
    exists elsewhere in this codebase to reuse (`localeCompare` appears only
    in `frontend/src/store/querySlice.ts`, for an unrelated purpose; no
    natural-sort utility exists), so this is a new, explicit ordering rule
    for this importer, implementable via `localeCompare(..., undefined, {
    numeric: true, sensitivity: "base" })` (resolved: OQ-7). [US-2]
16. FR-16 (added 2026-09-13, owner decision): The importer MUST depend on
    `mammoth` for DOCX parsing (verified 2026-09-13: `mammoth@1.12.3`,
    BSD-2-Clause, npm-published 2026-09-12; its README lists headings,
    bold/italic/underline/strikethrough/superscript/subscript, lists,
    tables, footnotes and endnotes, images, links, and comments as
    supported, with comments ignored by default). Adding it MUST pass
    `docs/standards/package-selection.md`'s justification checks, recorded
    in the implementation task list (purpose, necessity, and that no
    existing dependency already covers DOCX parsing). `mammoth` depends on
    `jszip` and `@xmldom/xmldom`; `jszip@3.10.1` is already present in
    `pnpm-lock.yaml` as a transitive dependency of the existing `docx`
    generation package (verified: `pnpm-lock.yaml`'s `docx@9.6.1` entry
    lists `jszip: 3.10.1` as a dependency), so `mammoth` does not newly
    introduce `jszip` to the dependency tree; whether `@xmldom/xmldom`
    is already present transitively or is newly introduced MUST be checked
    and recorded in the same task. The dependency MUST be added to
    `frontend/package.json`, the workspace package containing
    `frontend/src/lib/models/` where this importer's model code lives
    (resolved: OQ-5). [US-1][US-2]
17. FR-17 (added 2026-09-13, owner decision): The Electron desktop import
    MUST run in its own dedicated worker process and bundle — a new
    `electron/worker/docx-import-worker.ts`, forked via `utilityProcess.fork`
    the same way `scrivener-import-worker.ts` is, with its own esbuild
    `build:worker`-style bundling step to `electron/dist/docx-import-
    worker.cjs` and its own `extraResources` entry in
    `electron/electron-builder.yml` — rather than generalizing the existing
    Scrivener worker to handle both formats, because generalizing it would
    require modifying Feature 31/43's existing worker registration and
    bundling code, which this feature's Non-goals section excludes (lead/
    spec decision taken at Gate 3, 2026-09-13). [US-3]
18. FR-18 (added 2026-09-13, resolved from evidence, confirmed by owner at
    Gate 3, 2026-09-13; see OQ-10): The FR-6 report's (b) comments, (c)
    tracked changes, and (d) images/embedded media sections MUST NOT rely on
    `mammoth`'s conversion messages. The importer MUST detect each of these
    itself by inspecting the DOCX package's own parts — reusing the
    already-present `fast-xml-parser` — reading `word/document.xml` for
    `w:ins`/`w:del` (tracked changes) and `w:drawing`/`w:pict`/`w:object`
    (images/embedded media), and `word/comments.xml` for comments. Any
    `<img>` (and any other embedded media) that `mammoth` emits in its HTML
    output MUST be stripped before the HTML → TipTap step, not imported.
    FR-12's comments, tracked-changes, and image fixtures MUST assert both
    this detection and FR-6(c)'s accepted-as-shown text, which also confirms
    or refutes the inferred no-warning behavior recorded at OQ-10. [US-1]
    [US-2]
19. FR-19 (added 2026-09-13, owner decision, Stage 6.5): A successful DOCX
    import MUST NOT print a diagnostic for a condition the importer itself
    caused — including the `sidecar not found` message — to stdout/stderr.
    Measured finding: every one of the 7 fixture imports run at Stage 6.5
    printed `sidecar not found for <resourceId> at
    <projectRoot>/meta/resource-<id>.meta.json` to the terminal before
    `Imported DOCX project to: …`; which call triggers it has not yet been
    investigated, and Task 21 (`specs/features/docx-importer/tasks.md`) names
    that investigation as its first requirement. [US-1][US-2]

## Open questions

- OQ-1 (resolved, owner decision, 2026-09-13): Footnote/endnote conversion is
  a TEMPORARY measure — each reference becomes plain "[n]" text at point of
  reference (rather than a superscript number, since no superscript mark
  exists in the editor's schema, verified) and the referenced notes are
  appended as a numbered "Notes" list at the end of the resource containing
  the reference; endnotes are treated identically. No TipTap schema change is
  made. A real footnote node with a linked reference, and migrating imported
  notes onto it, is a future feature (see Out of scope). — Impact: FR-4,
  FR-6, FR-13.
- OQ-2 (resolved, owner decision, 2026-09-13): For a single-`.docx` source,
  the document's core title becomes the destination project's name when no
  `-n`/`--name`/UI name is given; the document's core author becomes an
  "Author" field in a new `docx-import` custom metadata group (mirroring
  `import-scrivener-project.ts`'s `scrivener-import` group), written on
  every resource created from that document. For a folder source, the
  project name comes from the folder name (`-n`/`--name` still overrides),
  and each file's own title/author land on that file's own resource (title
  as its `name`, falling back to the filename; author under the same
  `docx-import` group). Title and author are both read from
  `docProps/core.xml`, since `mammoth` does not read document properties. —
  Impact: FR-4, FR-14.
- OQ-3 (resolved, owner decision, 2026-09-13): The default project type,
  when the writer chooses none, is `blank`. — Impact: FR-8, FR-9.
- OQ-4 (resolved, owner decision, 2026-09-13): The DOCX-specific report is a
  new sibling module, `frontend/src/lib/models/docx/docx-import-report.ts`,
  with the same build/write shape as `import-report.ts` (unmodified) and its
  own DOCX-specific sections: skipped/unconvertible items, comments not
  imported, tracked changes present and how many (imported accepted-as-shown
  per OQ-10/FR-18, not "not imported"), images/embedded media not
  imported, non-`.docx`/lock/hidden files skipped in a folder source,
  documents with no heading at the chosen split level, and footnotes/
  endnotes converted to the OQ-1 Notes-list treatment. — Impact: FR-6, FR-16.
- OQ-5 (resolved, owner decision, 2026-09-13): The parsing dependency is
  `mammoth` (verified: `mammoth@1.12.3`, BSD-2-Clause, npm last modified
  2026-09-12; its README lists headings, bold/italic/underline/
  strikethrough/superscript/subscript, lists, tables, footnotes and
  endnotes, images, links, and comments as supported, comments ignored by
  default). Pipeline: DOCX → `mammoth` HTML (collecting its warnings for the
  report) → TipTap JSON, plus a small separate `docProps/core.xml` read via
  the already-present `fast-xml-parser`. `jszip`, one of `mammoth`'s runtime
  deps, is already a transitive dependency of the existing `docx` generation
  package (verified in `pnpm-lock.yaml`), so it is not newly introduced;
  `@xmldom/xmldom`'s status must be checked and recorded by the
  implementation task. Adding `mammoth` must pass
  `docs/standards/package-selection.md` and land in `frontend/package.json`,
  where the model code lives. — Impact: FR-4, FR-12, FR-16.
- OQ-6 (resolved, owner decision, 2026-09-13; corrects an inaccurate premise
  in the original open question — see below): The desktop import dialog
  offers two explicit buttons, "Choose document…" (`openFile`, filtered to
  `.docx`) and "Choose folder…" (`openDirectory`), each calling its own
  main-process picker; they behave identically on every platform. FR-1's
  auto-detection still runs in the conversion layer on the resulting
  selection. The picked path never crosses into the renderer (an opaque
  selection handle, as in Feature 43's `selection-handles.ts`). The dialog
  also exposes the split level (document source only) and the project type.
  Correction: the original open question stated that neither platform's
  native dialog supports a combined file-or-folder mode; that is only true
  of Windows and Linux. Electron's own type documentation
  (`electron@34.5.8`'s `electron.d.ts`, near line 7269) states: "On Windows
  and Linux an open dialog can not be both a file selector and a directory
  selector, so if you set `properties` to `['openFile', 'openDirectory']`
  on these platforms, a directory selector will be shown" — implying macOS
  does not share this restriction. The two-button design was chosen anyway,
  for identical cross-platform behavior rather than relying on a
  macOS-only combined mode. — Impact: FR-1, FR-10, FR-17.
- OQ-7 (resolved, owner decision, 2026-09-13): A folder source recurses to
  any depth. Non-`.docx` files, `~$*.docx` Word lock files, and hidden/dot
  files are skipped and summarized in one report line per category.
  Subfolders with no `.docx` anywhere beneath them are not created as
  GetWrite folders. Resource/folder ordering within a parent is
  case-insensitive natural filename order — a new rule for this codebase;
  no existing ordering convention was found to reuse. — Impact: FR-1, FR-3,
  FR-5, FR-15.
- OQ-8 (resolved, owner decision, 2026-09-13): Committed fixtures are
  synthetic `.docx` files generated by a one-time script over the existing
  `docx` generation package (preferred over per-test-run generation, for a
  stable artifact that doesn't drift with a `docx` version bump), covering
  multiple heading levels; bold/italic; footnotes and endnotes; core
  title/author; comments; tracked changes; an image; no headings; and a
  folder tree with a nested subfolder, a non-`.docx` file, and a `~$` lock
  file. Verified against `docx@9.6.1`'s type declarations that the package
  can produce every one of these constructs itself, so no hand-built OOXML
  fallback is needed for any of them. Separately, the owner will supply one
  real Word-authored manuscript as a gitignored sample in `import-inputs/`
  for a manual check when the feature is exercised; this is not a CI
  requirement. — Impact: FR-12.
- OQ-9 (resolved, owner decision, 2026-09-13): The CLI command is
  `getwrite-cli project import-docx <source> [projectRoot] [-n, --name
  <name>] [-s, --split-level <1-6|none>] [-t, --project-type <id>]`,
  defaulting to split level 1 and type `blank`. `--split-level` is refused
  with a folder source, not silently ignored; an unknown project-type id or
  invalid level is refused before any write; project-type ids are each
  spec's own `id` field, verified as `article`, `blank`, `game_writing`,
  `novel`, `poetry_and_lyrics`, `serial` (`game_documentation.json`'s id is
  `game_writing`, not the filename). The Electron import runs in its own
  new worker/bundle (`docx-import-worker.ts`), not a generalized worker,
  since the latter would require modifying Feature 31/43's Scrivener worker
  code, excluded by this feature's Non-goals. — Impact: FR-2, FR-8, FR-9,
  FR-17.
- OQ-10: Does `mammoth`'s HTML output keep or drop tracked-change
  (`w:ins`/`w:del`) text, does that match FR-6's report wording, and does
  `mammoth` emit a warning about it? — Resolution (from evidence, confirmed
  by owner at Gate 3, 2026-09-13): Read by the lead from the published
  `mammoth@1.12.3` package
  source (`lib/docx/body-reader.js`): `"w:ins": readChildElements` keeps
  inserted-run content; `"w:del": true` sits in the ignored-elements table
  (~line 723), so deleted-run content is dropped; the `w:p` reader routes a
  paragraph whose `w:pPr/w:rPr` contains `w:del` into
  `deletedParagraphContents` and returns an empty result (~line 289); a
  table row whose `w:trPr` has `w:del` also returns an empty result (~line
  494). Net effect: `mammoth`'s output shows the document as if every
  tracked change were accepted (insertions kept, deletions dropped) — this
  matches FR-6(c)'s "accepted-as-shown" wording. Measured vs. inferred: the
  code paths above were read directly. That `mammoth` emits no
  warning/message for tracked changes, and none for comments (ignored by
  default), is inferred from `w:del`/comments being handled without an
  entry in `mammoth`'s message-producing paths — it was not run and
  confirmed by executing `mammoth` against a fixture; FR-18's fixture
  assertions are what will confirm or refute that inference.
  `mammoth`'s README lists images as supported, converted to `<img>`. —
  Impact: FR-4, FR-6, FR-12, FR-18.

## Out of scope (deferred)

- A real footnote/endnote node in the TipTap schema, with a linked
  reference, and migrating the OQ-1 Notes-list treatment onto it once it
  exists — the current inline-number-plus-Notes-list handling is explicitly
  temporary (resolved OQ-1).
- Comments, tracked-change markup (the text itself imports as
  accepted-as-shown per FR-6(c)), and images/embedded media (resolved parent
  OQ-20).
- Repeatable/merge DOCX import into an already-imported project (resolved
  parent OQ-23; would need the same "notion of a prior import's identity"
  Feature 44 has not yet designed for Scrivener).
- Hosted web and native Android DOCX import (resolved parent OQ-21) — no
  multi-file/directory upload mechanism exists on hosted web
  (`app/api/resource/upload` is single-file only) and no directory-picking
  precedent exists on native Android, the same blockers Feature 46/Feature 47
  record for Scrivener's equivalent deferred scope.
- Any change to Feature 31/43's Scrivener import conversion logic, CLI
  command, or desktop UI.
