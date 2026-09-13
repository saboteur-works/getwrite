# Task List: Word/DOCX project importer

Source spec: `specs/features/docx-importer.md` (Feature 45, Gate 3 approved
2026-09-13). All 18 functional requirements' open questions are resolved on
the source spec; this task list does not reopen or re-answer any of them.

**Model-layer-vs-CLI-vs-Electron placement decision:** mirroring
`specs/features/scrivener-cli-importer/tasks.md`'s decision for Feature 31,
all parsing/conversion/mapping/reporting/orchestration logic lives under a new
`frontend/src/lib/models/docx/` sibling to `frontend/src/lib/models/scrivener/`,
re-exported by name through `frontend/src/lib/core.ts`. `cli/src/commands/
project.ts` adds only a thin `import-docx` subcommand parsing argv and calling
the orchestrator inside `runForTenant`, the same way `import-scrivener` does.
The Electron desktop path gets its own dedicated worker process, bundle, and
main-process modules under `electron/src/docx-import/` and
`electron/worker/docx-import-worker.ts` — a parallel copy of the
`electron/src/scrivener-import/` / `electron/worker/scrivener-import-worker.ts`
pattern, never a generalization of it, per FR-17's explicit "own worker, not a
generalized one" decision (Gate 3) and this feature's Non-goals ("Any change
to Feature 31/43's Scrivener import conversion, UI, or CLI").

**Shared-file caution (schedule sequentially, not concurrently):** the
following files are touched by more than one task below and must not be
edited by two tasks running in parallel worktrees — each later touching task
depends (directly or transitively) on the earlier one specifically to avoid
this: `frontend/package.json` and `pnpm-lock.yaml` (Task 1, then read-only
after — Task 1 is the sole owner of every `frontend/package.json`/
`pnpm-lock.yaml` change in this feature; no other task below may edit either
file); `frontend/src/lib/core.ts` (Task 9, then read by Tasks 10 and 12);
`electron/src/main.ts`, `electron/package.json`, and
`electron/electron-builder.yml` (Tasks 12–14, sequenced); `electron/src/preload.ts` and
`frontend/src/lib/desktop-bridge.ts` (Task 15). Adding new IPC channels,
bridge methods, and worker-bundle wiring to these already-shared files is
expected — Feature 43 established the same pattern — and is not itself a
Scrivener-code change.

**Docs (CLAUDE.md, CLI section, Electron section):** left to the scribe stage,
per the pipeline's own separation of implementation from documentation update
— no task below edits `CLAUDE.md`.

**Test locations:** frontend model-layer unit/integration tests go under
`frontend/tests/unit/` and `frontend/tests/integration/` (Vitest, `pnpm
--filter getwrite-frontend exec vitest run <path>`); the CLI-level test goes
in `cli/tests/project.test.ts` (`pnpm --filter getwrite-cli test`), matching
where `import-scrivener`'s own tests live; Electron main-process-adjacent unit
tests go under `electron/tests/docx-import/` (`pnpm --filter getwrite-electron
test`); component/story tests follow `docs/standards/storybook-implementation.md`.

### Task 1: Add `mammoth` and `jszip` dependencies and record the package-selection checks

**What:** Implements FR-16. Adds `"mammoth": "1.12.3"` (exact, no caret) and
`"jszip": "^3.10.1"` to `frontend/package.json`'s `dependencies` and runs
`pnpm install` to update `pnpm-lock.yaml`, then records the
`docs/standards/package-selection.md` justification for each directly in this
task's Notes below. `jszip` is promoted from transitive (currently pulled in
only via `docx@9.6.1`) to a direct dependency because there is no `.npmrc` at
the repo root or in `frontend/` — pnpm's isolated `node_modules` layout
therefore does not let `frontend/src` import a package that isn't declared
directly, and Tasks 4 and 5 both need to unzip a `.docx` package
(`docProps/core.xml` and `word/*.xml` parts) to read data `mammoth` doesn't
expose. This exact dependency set was owner-approved at Gate 4 based on the
pipeline lead's measurement (2026-09-13, `pnpm --filter getwrite-frontend add
mammoth@1.12.3 jszip@^3.10.1 --lockfile-only --ignore-scripts`, pnpm 10.28.0,
run against a scratch copy of the workspace manifests and lockfile, and the
diff of the resulting `pnpm-lock.yaml`): the resolution adds exactly these new
lockfile package entries — `mammoth@1.12.3`, `@xmldom/xmldom@0.8.15`,
`argparse@1.0.10`, `bluebird@3.4.7`, `dingbat-to-unicode@1.0.1`, `duck@0.1.12`,
`lop@0.4.2`, `option@0.2.4`, `sprintf-js@1.0.3`, `underscore@1.13.8`, and
`xmlbuilder@10.1.1` — and reuses three already-resolved entries without
introducing a second copy of any of them: `jszip@3.10.1`, `base64-js@1.5.1`,
and `path-is-absolute@1.0.1`. `@xmldom/xmldom@0.8.15` is a distinct, additional
resolved version alongside the pre-existing `@xmldom/xmldom@0.9.10` (a
transitive dependency of `plist@3.1.1`, itself pulled in by
`electron-builder`) — the two coexist because pnpm's isolated `node_modules`
layout permits multiple resolved versions of the same package.
**Files:** `frontend/package.json`, `pnpm-lock.yaml`.
**Done when:** `mammoth` and `jszip` both appear in
`frontend/package.json`'s `dependencies` with the exact specifiers above;
`pnpm install` completes without error (this step needs network access to the
npm registry; if the environment has none, install offline is not possible —
flag this as a blocker rather than fabricating a lockfile edit); the
post-install `pnpm-lock.yaml` diff (`git diff pnpm-lock.yaml`) MUST add
exactly the package entries listed above, at exactly those versions — no
other package or version added, removed, or changed — **other than** the
peer-suffix normalization of existing `eslint-plugin-import` /
`eslint-import-resolver-typescript` / `eslint-module-utils` entries (which the
Gate 4 dry run also produced, with no version change); if the diff shows
anything beyond that, the implementor MUST stop and report the task as
blocked with the diff, not proceed and not hand-edit the lockfile; this
comparison is part of the task's verification. `pnpm --filter
getwrite-frontend typecheck` still passes (no code yet imports `mammoth` or
`jszip`, so this only confirms the install didn't break anything).
**Depends on:** none
**Estimate:** 2
**Notes:** Package-selection justification per `docs/standards/package-selection.md`:
for `mammoth` — purpose is DOCX→HTML parsing (this feature's whole conversion
pipeline depends on it); necessity is confirmed — `docx@9.6.1`, the only
DOCX-related dependency already in `frontend/package.json`, only generates
`.docx` files, it does not parse one, so no existing dependency covers this;
license is BSD-2-Clause. For `jszip` — purpose is reading `docProps/core.xml`
and `word/*.xml` package parts directly, which `mammoth` doesn't expose;
necessity is that it's already in the dependency tree (transitively, via
`docx@9.6.1` and `mammoth` itself) at `3.10.1`, so pinning a direct
dependency range that resolves to the same version adds no second copy;
license is MIT. `@xmldom/xmldom@0.8.15` (the new, additional version this
task's dependency addition introduces alongside the pre-existing `0.9.10`) is
the package's current `lts` dist-tag and is not deprecated. `pnpm audit` on
the resolved tree reported no advisories for any package this task adds. The
13 `@xmldom/xmldom` advisories it did report all target `>=0.9.0 <=0.9.11`
and so apply to the pre-existing `0.9.10` (via electron-builder/plist, marked
deprecated on npm), which this feature does not introduce and does not
change. `pnpm add` also printed unmet-peer warnings (better-auth/drizzle-orm,
@better-auth/core, valibot) unrelated to mammoth; whether they pre-date this
change was not checked. On the fixture-script runner for
Task 2: no new devDependency was needed — the repo's Volta-pinned Node
version (24.15.0, matching root `package.json`'s `volta.node`) supports
`--experimental-strip-types` natively, confirmed by running a `.ts` file with
a type annotation directly (`node --experimental-strip-types <file>.ts`)
ahead of this task; `tsx` is not a dependency anywhere in the repo and was
not added.
**POS:** task_3bf469c5
**Done:** [x]

### Task 2: Synthetic `.docx` fixture generation script

**What:** Implements FR-12. A one-time generation script over the existing
`docx@9.6.1` package producing committed, synthetic binary `.docx` fixtures —
never regenerated at test-run time — mirroring
`scrivener-cli-importer/tasks.md`'s Task 1 committed-fixture convention.
**Files:** `frontend/tests/fixtures/docx/generate-docx-fixtures.ts` (the
generation script, not itself a test), and its generated output:
`frontend/tests/fixtures/docx/multi-heading.docx` (headings at levels 1–3,
bold/italic runs), `frontend/tests/fixtures/docx/footnotes-endnotes.docx`
(at least one footnote and one endnote reference), `frontend/tests/fixtures/docx/core-properties.docx`
(non-empty `docProps/core.xml` title and author), `frontend/tests/fixtures/docx/comments.docx`,
`frontend/tests/fixtures/docx/tracked-changes.docx` (both an inserted and a
deleted run), `frontend/tests/fixtures/docx/with-image.docx`,
`frontend/tests/fixtures/docx/no-headings.docx`, and a folder-source fixture
tree under `frontend/tests/fixtures/docx/folder-source/` containing: a nested
subfolder with at least one `.docx` file, a non-`.docx` file (e.g. `notes.txt`),
a `~$scratch.docx` lock-file-named file, and a hidden dot-file/dot-directory.
**Done when:** running the script from `frontend/` via `node
--experimental-strip-types tests/fixtures/docx/generate-docx-fixtures.ts`
(Node 24.15.0, the repo's Volta-pinned version, strips the script's type
annotations natively — no `tsx`/`vite-node`/other runner dependency is added
for this; confirmed ahead of this task by running a `.ts` file with a type
annotation directly) produces all of the files above; every fixture is
committed to git (binary `.docx` files are not excluded by `.gitignore`,
verified by `git check-ignore` reporting nothing for any of them); `pnpm
--filter getwrite-frontend typecheck` passes on the script itself.
**Depends on:** 1
**Estimate:** 5
**Notes:** Uses the `docx` package's documented constructs — multi-level
`HeadingLevel`, `Bold`/`Italics` run properties, `Document.Footnotes.createFootNote`
/ `FootnoteReferenceRun`, `Document.Endnotes.createEndnote` /
`EndnoteReferenceRun`, `Comment`/`CommentRangeStart`/`CommentRangeEnd`/
`CommentReference`, `InsertedTextRun`/`DeletedTextRun`, and `ImageRun` — all
verified present in `docx@9.6.1`'s type declarations per the source spec's
FR-12. Keep each fixture minimal — one instance of each shape, not full
coverage breadth.
**POS:** task_d0757835
**Done:** [x]

### Task 3: Source detection and folder walk

**What:** Implements FR-1, FR-3, and FR-15 as pure functions: auto-detecting
a single-file vs. directory source, refusing a directory with no `.docx`
anywhere in its tree, recursive traversal to any depth, skip-and-summarize
categorization of non-`.docx`/`~$*.docx`/hidden files, pruning a subfolder
with no `.docx` beneath it, and case-insensitive natural-order sorting of
siblings.
**Files:** `frontend/src/lib/models/docx/source-detection.ts`,
`frontend/tests/unit/docx-source-detection.test.ts`.
**Done when:** `detectDocxSource(sourcePath)` returns `{ kind: "file" |
"directory" }` for an existing path and throws a typed
`NoDocxFilesFoundError` for a directory containing no `.docx` file anywhere
beneath it, reading via `io.ts` (not `node:fs`, per
`docs/standards/storage-context.md` §5); `walkDocxFolder(dirPath)` returns an
ordered plan of `.docx` files and subfolders where: `~$*.docx` files, other
non-`.docx` files, and hidden/dot files or directories are collected into
per-category skip summaries (not one entry per file); a subfolder with no
`.docx` anywhere beneath it is omitted from the plan entirely; siblings
(files and subfolders alike) within the same parent are ordered via
`localeCompare(..., undefined, { numeric: true, sensitivity: "base" })`.
Tests run against Task 2's `folder-source/` fixture and assert: the lock file,
non-`.docx` file, and hidden entry are each summarized once under their own
category; the nested subfolder's `.docx` file is included; natural-order
sorting is asserted with a "Chapter 2"/"Chapter 10"-style pair.
**Depends on:** 2
**Estimate:** 5
**POS:** task_c2258b9e
**Done:** [x]

### Task 4: `docProps/core.xml` properties reader

**What:** Implements FR-14's read side: a small, separate reader for a
`.docx`'s core title/author, since `mammoth` does not read document
properties.
**Files:** `frontend/src/lib/models/docx/core-properties.ts`,
`frontend/tests/unit/docx-core-properties.test.ts`.
**Done when:** `readDocxCoreProperties(docxBytes)` unzips the package (via
`jszip`, a direct `frontend/package.json` dependency added by Task 1) to
`docProps/core.xml`, parses it with the already-present `fast-xml-parser`,
and returns `{ title?: string; author?: string }`, with both fields
`undefined` when absent or empty (never an empty string treated as present).
Tests run against Task 2's `core-properties.docx` fixture (asserting the
exact title/author values it was generated with) and a fixture/file with no
`docProps/core.xml` title or author present (asserting both fields are
`undefined`, not thrown).
**Depends on:** 1, 2
**Estimate:** 3
**POS:** task_0db8238c
**Done:** [x]

### Task 5: Package-part detection — comments, tracked changes, images

**What:** Implements FR-18: detecting comments, tracked changes, and
images/embedded media by inspecting the DOCX package's own parts directly,
never relying on `mammoth`'s conversion messages.
**Files:** `frontend/src/lib/models/docx/package-parts.ts`,
`frontend/tests/unit/docx-package-parts.test.ts`.
**Done when:** `detectDocxPackageFeatures(docxBytes)` unzips the package (via
`jszip`, a direct `frontend/package.json` dependency added by Task 1) and
reads `word/document.xml` (via the already-present `fast-xml-parser`) for
`w:ins`/`w:del` occurrences (returning a tracked-change count) and
`w:drawing`/`w:pict`/`w:object` occurrences (returning an image/embedded-media
count), and reads `word/comments.xml` when present for a comment count (`0`
when the part is absent, not an error). Tests run against Task 2's
`comments.docx`, `tracked-changes.docx`, and `with-image.docx` fixtures, each
asserting the correct non-zero count for its own feature and a zero count for
the other two; a fourth test against `no-headings.docx` (which has none of
the three) asserts all three counts are zero.
**Depends on:** 1, 2
**Estimate:** 5
**POS:** task_e3e650db
**Done:** [x]

### Task 6: `mammoth` HTML → TipTap conversion, including footnote/endnote handling

**What:** Implements FR-4's conversion pipeline (DOCX → `mammoth` HTML →
TipTap JSON) and FR-13's temporary footnote/endnote treatment, plus FR-18's
image-stripping requirement.
**Files:** `frontend/src/lib/models/docx/mammoth-to-tiptap.ts`,
`frontend/tests/unit/docx-mammoth-to-tiptap.test.ts`.
**Done when:** `convertDocxToTiptap(docxBytes)` runs `mammoth.convertToHtml`,
collects `mammoth`'s own conversion messages/warnings (for FR-6 report
section (a)), and converts the resulting HTML into a `TipTapDocument` using
the on-disk mark names `"bold"`/`"italic"` (confirmed per FR-4, matching
`rtf-to-tiptap.ts`'s own convention); heading elements (`h1`–`h6`) become
TipTap `heading` nodes carrying their level; any `<img>` (or other embedded
media) `mammoth` emits in its HTML is stripped before the HTML → TipTap step
and never appears in the output; each footnote/endnote reference in the
running text is rendered as plain `"[n]"` text at the point of reference (no
superscript mark, per FR-13/resolved OQ-1), and every referenced note's text
is returned separately as an ordered `notes: { n: number; text: string
}[]` list — appending that list as the resource's own numbered "Notes"
paragraph list at the end of the correct resource is Task 9's job (the note
belongs with whichever split section referenced it), not this module's. Tests
run against Task 2's `multi-heading.docx` (headings/bold/italic asserted),
`footnotes-endnotes.docx` (asserting `[1]`-style inline markers and the
returned `notes` array), `comments.docx` and `tracked-changes.docx` (asserting
the accepted-as-shown text per FR-6(c)/resolved OQ-10 — inserted text kept,
deleted text dropped, with no thrown error or dropped-conversion), and
`with-image.docx` (asserting no `image`/media node and no stray `<img>` text
appear anywhere in the output).
**Depends on:** 1, 2
**Estimate:** 8
**POS:** task_e547c5a1
**Done:** [ ]

### Task 7: Heading-level document split

**What:** Implements FR-2: splitting a single document's converted content
into one section per heading at a configurable level (default 1), with "no
split" and "no heading at that level" handling.
**Files:** `frontend/src/lib/models/docx/heading-split.ts`,
`frontend/tests/unit/docx-heading-split.test.ts`.
**Done when:** `splitDocxAtHeadingLevel(tiptapDoc, notes, level)` — where
`level` is `1`–`6` or `"none"` — returns an ordered array of `{ title:
string; content: TipTapDocument; notes: NoteRef[] }` sections, each carrying
only the footnotes/endnotes (from Task 6's `notes` array) referenced within
its own content range; `level: "none"` returns exactly one section
containing the whole document; a document with no heading at the chosen
level returns exactly one section containing the whole document, with a
`noHeadingFound: true` flag on the result for the FR-6(f) report entry;
section titles come from the heading text that starts each section (falling
back to a generic placeholder for the pre-first-heading section, when
non-empty content precedes the first heading). Tests run against Task 2's
`multi-heading.docx` at levels 1, 2, and 3; `no-headings.docx` at the default
level (asserting the single-section, `noHeadingFound: true` result); and
`footnotes-endnotes.docx` split so that a footnote referenced after a
mid-document heading lands in that later section, not the first.
**Depends on:** 6
**Estimate:** 5
**POS:** task_c251bafc
**Done:** [ ]

### Task 8: DOCX import report builder

**What:** Implements FR-6: the DOCX-specific post-import report, built and
written by a new sibling module mirroring `import-report.ts`'s
`buildImportReport`/`writeImportReport` shape without modifying
`import-report.ts` itself.
**Files:** `frontend/src/lib/models/docx/docx-import-report.ts`,
`frontend/tests/unit/docx-import-report.test.ts`.
**Done when:** `buildDocxImportReport(input)` renders a readable report with,
at minimum, sections for: (a) skipped/unconvertible items (FR-5); (b)
comments not imported, with a count; (c) tracked changes present and how
many (accepted-as-shown, per FR-6(c)/resolved OQ-10 — not "not imported");
(d) images/embedded media not imported, with a count; (e) non-`.docx` files,
lock files, and hidden/dot files skipped in a folder source, one line per
category (FR-15); (f) documents with no heading found at the chosen split
level (FR-2/Task 7's `noHeadingFound` flag); and (g) footnotes and endnotes
converted to the Notes-list treatment, with a count (FR-13). A section with
nothing to report is omitted or explicitly stated empty, never silently
dropped. `writeDocxImportReport(projectRoot, report)` persists the rendered
text via the `io.ts` wrappers (no `node:fs`). Tests cover a report with all
seven sections populated and one with none.
**Depends on:** none
**Estimate:** 3
**POS:** task_faeaa2d6
**Done:** [x]

### Task 9: Import orchestrator — `importDocxProject`

**What:** The single model-layer entry point tying Tasks 3–8 together into a
complete, valid destination GetWrite project. Implements FR-5 (skip and
continue, never abort), FR-7 (fresh project, refuse non-empty destination),
FR-8 (project-type selection and validation), and FR-14's write side (title/
author mapping onto project name and the `docx-import` metadata group).
**Files:** `frontend/src/lib/models/docx/import-docx-project.ts`,
`frontend/src/lib/core.ts` (adds named re-exports for
`importDocxProject` and its thrown error types — not `export *`, matching
that file's existing convention), `frontend/tests/integration/docx-import.test.ts`.
**Done when:** `importDocxProject({ sourcePath, projectRoot, name?,
splitLevel?, projectType? })`: (1) refuses and writes nothing to
`projectRoot` when it already exists and is non-empty (`DestinationNotEmptyError`,
reused from the Scrivener importer's existing error type — this is a shared,
format-agnostic condition, not Scrivener-specific logic) or when
`projectType` doesn't match a known project-type spec `id` (a new
`UnknownProjectTypeError`), both before any write; (2) for a single-file
source, runs Task 6 + Task 7 and creates one resource per section (bulk-create
pattern from `createProjectFromType`/`import-scrivener-project.ts`:
`writeResourceToFile` then `writeRevision(..., { isCanonical: true })` with
the section's own serialized TipTap document, not plain text — mirroring
`scrivener-cli-importer/tasks.md`'s Task 27 fix, not its original defect);
appends each section's own Notes list as trailing paragraphs; sets the
project name from the document's core title (Task 4) when no `name` is
supplied; writes the document's core author, when present, into an "Author"
field under a new `docx-import` metadata group (via `metadata-schema.ts`'s
`addGroup`/`addField`) on every created resource; (3) for a folder source,
runs Task 3's walk, creates one resource per `.docx` file (each independently
converted via Task 6, no heading split applied) and mirrors subfolders as
GetWrite folders in Task 3's sorted order; sets the project name from the
source folder's own name (still overridden by `name`); sets each resource's
`name` from that file's own core title, falling back to the filename without
its `.docx` extension; writes each file's own core author under the same
`docx-import` group; (4) wraps its entire write phase in
`withIndexingSuspended` (`indexer-queue.ts`, already added for the Scrivener
importer and reused here unmodified) and rebuilds indexes from scratch on
completion, mirroring `import-scrivener-project.ts`'s own FR-11 rebuild; (5)
on a fatal error, removes `projectRoot` only when this run created it,
mirroring `import-scrivener-project.ts`'s existing cleanup rule; (6) never
mutates the source `.docx`/folder. The integration test runs the full
function against both a Task 2 single-file fixture and the `folder-source/`
fixture, asserting: the destination's folder/resource tree, section
titles/content, Notes lists, project name and `Author` field, the FR-6
report's contents, an unknown-`projectType` refusal before any write, a
non-empty-destination refusal before any write, and — via a before/after hash
or mtime comparison — that the source was not modified.
**Depends on:** 3, 4, 5, 6, 7, 8
**Estimate:** 10
**Notes:** This is the feature's one significant orchestration function,
playing the same role `importScrivenerProject` plays for Feature 31. Reusing
`DestinationNotEmptyError` (rather than defining a DOCX-specific duplicate) is
a deliberate choice — it is a generic, format-agnostic condition already
exported from `core.ts`, not Scrivener conversion/UI/CLI logic, so reusing it
does not conflict with this feature's Non-goals.
**POS:** task_c93ff801
**Done:** [ ]

### Task 10: CLI command — `project import-docx`

**What:** Implements FR-9: registers the CLI subcommand and validates its
own flags before calling the orchestrator.
**Files:** `cli/src/commands/project.ts`, `cli/tests/project.test.ts`.
**Done when:** `getwrite-cli project import-docx <source> [projectRoot]
[-n, --name <name>] [-s, --split-level <1-6|none>] [-t, --project-type <id>]`
is registered under the existing `project` command group, wrapped in
`runForTenant` the same way as `import-scrivener`; defaults are split level
`1` and project type `blank`; `--split-level` is refused with a clear
message, non-zero exit, and nothing written when `<source>` resolves (via
Task 3's `detectDocxSource`) to a directory; an unknown `--project-type` id
or an invalid `--split-level` value is refused before any write, mapping
`importDocxProject`'s thrown errors to a non-zero exit with a clear message
(matching `import-scrivener`'s try/catch → `process.exit(2)` shape); all
orchestration logic stays in Task 9 — this task is argv parsing, flag
validation, and exit-code glue only. Tests cover: a successful single-file
run (exit 0, destination created); a successful folder run; `--split-level`
rejected against a folder source; an unknown `--project-type` id rejected
before any write; and missing/invalid argument handling. `pnpm --filter
getwrite-cli build` (the esbuild bundle) completes without error — `mammoth`
is pure JavaScript with no native bindings, so no new `--external` esbuild
flag is expected, but this is confirmed by running the build, not assumed.
**Depends on:** 9
**Estimate:** 5
**POS:** task_17473395
**Done:** [ ]

### Task 11: Full frontend + CLI gate verification

**What:** Confirms the model-layer and CLI test/typecheck/build/knip gate is
green after Tasks 1–10 land, before the Electron desktop work (Tasks 12–18)
proceeds.
**Files:** none expected beyond fixes to files already touched by Tasks 1–10,
if any failure surfaces.
**Done when:** `pnpm --filter getwrite-frontend exec vitest run
docx-source-detection docx-core-properties docx-package-parts
docx-mammoth-to-tiptap docx-heading-split docx-import-report docx-import`
and `pnpm --filter getwrite-frontend typecheck` both pass; `pnpm --filter
getwrite-cli test` and `pnpm --filter getwrite-cli typecheck` both pass;
`pnpm knip` (repo root) reports no new unused-export warnings from
`frontend/src/lib/models/docx/` or the `core.ts` additions.
**Depends on:** 10
**Estimate:** 2
**POS:** task_cad18601
**Done:** [ ]

### Task 12: Electron worker entry point, `handle-import-request`, and `build:worker` bundle

**What:** Implements the DOCX half of FR-17: a dedicated worker process and
bundle, structured on the same `electron/src` (rootDir-safe, `@gw/core`-free)
vs. `electron/worker` (allowed to import `@gw/core`) split
`scrivener-cli-importer/tasks.md`'s Task 4 established, for the same TS6059
`rootDir` reason recorded there. This is a new, parallel pair of files — it
does not modify `electron/src/scrivener-import/` or
`electron/worker/scrivener-import-worker.ts` in any way.
**Files:** `electron/src/docx-import/handle-import-request.ts` (pure,
electron-runtime-free; declares its own local `ImportOutcomeData`/outcome
types and takes injected `deps: { runImport(request): Promise<ImportOutcomeData>;
isUnsupportedSourceError(err): boolean; isNonEmptyDestinationError(err):
boolean; isUnknownProjectTypeError(err): boolean }`, resolving to `{ kind:
"success", ... }`, `{ kind: "refusal-no-docx-found" }`, `{ kind:
"refusal-destination-not-empty" }`, `{ kind: "refusal-unknown-project-type"
}`, or `{ kind: "fatal", message }`), `electron/worker/docx-import-worker.ts`
(the thin real entry point outside `electron/src`, importing
`importDocxProject`/`runForTenant`/the DOCX error classes from `@gw/core`,
wiring `process.parentPort` to `handleImportRequest`), `electron/tests/docx-import/handle-import-request.test.ts`.
**Done when:** tests confirm each of the four discriminated outcomes above
resolves correctly given fake `deps`, and that `handleImportRequest`'s only
call into `deps` is `runImport(request)` (no `@gw/core` import anywhere in
the test file); `pnpm --filter getwrite-electron build` (real `tsc` emit)
completes with no TS6059; `pnpm --filter getwrite-electron typecheck` (both
`tsconfig.json` and `tsconfig.worker.json` — the latter's existing `include:
["worker"]` already covers the new worker file with no edit needed) passes;
`electron/package.json`'s `build:worker` script is extended with a second
esbuild invocation (or the existing one is parameterized) producing
`electron/dist/docx-import-worker.cjs` in addition to the existing
`scrivener-import-worker.cjs` output — `pnpm --filter getwrite-electron
build:worker` produces both files; `pnpm --filter getwrite-electron test`
passes.
**Depends on:** 9
**Estimate:** 6
**Notes:** Reuses the `NoDocxFilesFoundError`-shaped refusal from Task 3/9
rather than the Scrivener worker's `refusal-unsupported` naming, since the
underlying condition differs (no `.docx` found vs. an unsupported `Creator`).
No esbuild dependency or `--external` flag change is needed for the extended
`build:worker` script: `mammoth` and `jszip` (Task 1) are both pure
JavaScript with no native bindings, so esbuild bundles them into
`docx-import-worker.cjs` the same way it already bundles Feature 31's
Scrivener dependencies — confirmed by running the build, not assumed.
**POS:** task_99d8d530
**Done:** [ ]

### Task 13: Package and build wiring for the worker bundle

**What:** Implements the packaging half of FR-17: `extraResources` entry for
the new worker bundle, plus build-script wiring so it is never stale.
**Files:** `electron/electron-builder.yml`, `package.json` (repo root),
`electron/package.json`.
**Done when:** `electron/electron-builder.yml` gains an `extraResources` entry
shipping `dist/docx-import-worker.cjs` to `docx-import-worker.cjs` at the
packaged app's resources root, alongside (not replacing) the existing
Scrivener entry; root `package.json`'s `electron:build` script still runs
`pnpm --filter getwrite-electron build:worker` (Task 12 already extended that
script to produce both bundles, so no further change is needed here beyond
confirming it); `electron/package.json`'s `dev` script continues to build
both worker bundles before launching Electron. `pnpm electron:build` (repo
root) completes and both `electron/dist/scrivener-import-worker.cjs` and
`electron/dist/docx-import-worker.cjs` exist afterward; inspecting the
resolved `extraResources` list (e.g. via `electron-builder --config
electron/electron-builder.yml --dir` on that build output) confirms
`docx-import-worker.cjs` is present alongside the existing Scrivener entry.
**Depends on:** 12
**Estimate:** 3
**POS:** task_e197764b
**Done:** [ ]

### Task 14: Main-process IPC — selection handles, import guard, and `main.ts` wiring

**What:** Implements FR-10's main-process half: two-button native picking
(file vs. folder) via opaque selection handles, a single-import guard, and
`main.ts` registration, mirroring Feature 43's pattern (`docs/standards/security.md`
§2). New, DOCX-specific modules — not a reuse or generalization of
`electron/src/scrivener-import/selection-handles.ts` or `import-guard.ts`.
**Files:** `electron/src/docx-import/selection-handles.ts`,
`electron/src/docx-import/import-guard.ts`,
`electron/src/docx-import/await-worker-outcome.ts` (races the worker's
terminal outcome against an early exit/error, mirroring
`scrivener-import/await-worker-outcome.ts`'s `WorkerLike`-based design exactly,
but importing its `ImportOutcome` type from this feature's own
`handle-import-request.ts`), `electron/src/main.ts`,
`electron/tests/docx-import/selection-handles.test.ts`,
`electron/tests/docx-import/import-guard.test.ts`,
`electron/tests/docx-import/await-worker-outcome.test.ts`.
**Done when:** `createSelectionHandleRegistry()` behaves identically to the
Scrivener version (record/resolve/consume, a fresh record supersedes the
prior handle); `createImportGuard()` behaves identically (`tryStart()`/
`finish()`); `awaitWorkerOutcome` resolves on the worker's first `message`,
resolves `{ kind: "fatal", ... }` on an early `exit`/`error`, and never
resolves twice — same test shape as the Scrivener equivalent. `main.ts`
registers `getwrite:docx-choose-file` (`dialog.showOpenDialog({ properties:
["openFile"], filters: [{ name: "Word Document", extensions: ["docx"] }]
})`), `getwrite:docx-choose-folder` (`dialog.showOpenDialog({ properties:
["openDirectory"] })`), and `getwrite:docx-start-import` (accepts `{ handle,
name, splitLevel, projectType }`; guards single-flight via the new guard;
resolves the handle; forks `docx-import-worker.cjs` via
`utilityProcess.fork`, resolved dev-vs-packaged the same way the Scrivener
worker path is resolved; awaits `awaitWorkerOutcome`; calls `finish()` in a
`finally`). The picked path never crosses into the renderer or an
`ipcMain.handle` return value — only the opaque handle and display name do.
`pnpm --filter getwrite-electron typecheck` and `pnpm --filter
getwrite-electron test` both pass.
**Depends on:** 12
**Estimate:** 8
**POS:** task_a4d4cc0c
**Done:** [ ]

### Task 15: `preload.ts` and `desktop-bridge.ts` — renderer-facing channels

**What:** Implements FR-10's renderer-facing half. Adds three methods to
`preload.ts`'s `GetWriteDesktopBridge` interface and its `bridge`
implementation — `chooseDocxFile()`, `chooseDocxFolder()` (each returning
`{ ok: true; handle: string; displayName: string } | { ok: false; cancelled:
true }`), and `startDocxImport(handle: string, options: { name: string;
splitLevel?: number | "none"; projectType: string }): Promise<DocxImportOutcome>`
— invoking Task 14's three IPC channels, where `DocxImportOutcome` mirrors
Task 12's discriminated kinds. Adds the matching methods and types to
`desktop-bridge.ts`'s `DesktopBridge` interface, following the existing
`chooseScrivenerSource`/`startScrivenerImport` pattern exactly (no
general-purpose `invoke` passthrough).
**Files:** `electron/src/preload.ts`, `frontend/src/lib/desktop-bridge.ts`.
**Done when:** `pnpm --filter getwrite-electron typecheck` and `pnpm --filter
getwrite-frontend typecheck` both pass; a direct read of both files confirms
the three new bridge methods' request/response shapes match byte-for-byte
between `preload.ts` and `desktop-bridge.ts`.
**Depends on:** 14
**Estimate:** 2
**POS:** task_455afc11
**Done:** [ ]

### Task 16: `ImportDocxDialog` — the import flow's state machine

**What:** Implements FR-2's UI (split-level control), FR-8's UI (project-type
control), and FR-10's dialog states, following
`ImportScrivenerDialog.tsx`'s state-machine shape (`choose-source` →
`editing-name` → `importing` → terminal) but with a `choose-source` state
offering two explicit buttons — "Choose document…" and "Choose folder…" —
each calling its own bridge method (Task 15), and an `editing-name` state
that also exposes the split-level control (shown only when a document, not a
folder, was chosen) and the project-type control before the writer can start.
**Files:** `frontend/components/Start/ImportDocxDialog.tsx`,
`frontend/tests/component/ImportDocxDialog.test.tsx`.
**Done when:** a test confirms the dialog opens in `choose-source` with both
buttons present and keyboard-focusable; a test confirms picking a document
moves to `editing-name` showing the split-level control, and picking a
folder moves to `editing-name` with no split-level control shown; a test
confirms a cancelled pick from either button leaves the dialog in
`choose-source` with no error shown and `startDocxImport` never called; a
test confirms the project-type control defaults to `blank` and offers every
known project-type id; a test confirms clicking Start calls
`startDocxImport(handle, { name, splitLevel, projectType })` exactly once,
disables the controls, and renders no cancel control while pending; a test
confirms a `{ kind: "success", ... }` resolution renders the report text and
an "Open Project" action; tests confirm `refusal-no-docx-found`,
`refusal-destination-not-empty`, and `refusal-unknown-project-type` each
render distinct, specific messages (not one shared generic string), and
`fatal` renders a message distinct from all three; a class/token-level check
confirms none of the failure/refusal states use the reserved red color
token; every state transition moves focus per `docs/standards/accessibility.md`.
`pnpm --filter getwrite-frontend exec vitest run ImportDocxDialog` and `pnpm
--filter getwrite-frontend typecheck` both pass.
**Depends on:** 15
**Estimate:** 10
**POS:** task_858ac96d
**Done:** [ ]

### Task 17: Wire the "Import Word Document" entry point on the Start page

**What:** Adds a second desktop-only import entry point beside the existing
Scrivener "Import" button, opening Task 16's dialog.
**Files:** `frontend/components/Start/StartPage.tsx`,
`frontend/app/(app)/page.tsx`, `frontend/tests/component/StartPage.test.tsx`.
**Done when:** a test confirms the new button is absent when
`getDesktopBridge()` returns `null` and present (alongside, not replacing,
the existing Scrivener "Import" button) when it returns a bridge stub; a
test confirms clicking it opens `ImportDocxDialog` in its `choose-source`
state; a test confirms the dialog's `onImported` callback triggers the same
`refreshProjects()`-then-`handleOpen(projectId)` sequence the Scrivener
import flow already wires. `pnpm --filter getwrite-frontend exec vitest run
StartPage` and `pnpm --filter getwrite-frontend typecheck` both pass.
**Depends on:** 16
**Estimate:** 3
**POS:** task_8df6a3f4
**Done:** [ ]

### Task 18: Storybook stories and accessibility pass

**What:** Adds stories covering every `ImportDocxDialog` state, per
`docs/standards/storybook-implementation.md` and
`docs/standards/accessibility.md`.
**Files:** `frontend/stories/Start/ImportDocxDialog.stories.tsx`, and
`frontend/stories/Start/StartPage.stories.tsx` if it exists (read first to
confirm before editing).
**Done when:** stories exist for: `choose-source`; `editing-name` after
picking a document (split-level control shown); `editing-name` after picking
a folder (split-level control absent); the in-progress state; the
success-with-report state; each of the three distinct refusal states; and
the fatal-failure state, each driven by a mocked `getDesktopBridge()` (never
a real Electron bridge); plus a `StartPage` story showing the new button
present/absent depending on the mocked bridge. No prop is used on
`Dialog`/`DialogContent`/`Button`/`Input`/`Select` that isn't already
verified against their own source/stories. All stories render without error
in Storybook and pass the `@storybook/addon-a11y` check with no new
violation, run via `pnpm storybook` + `pnpm test-storybook`, both outside the
Bash command sandbox per the project's sandbox-breaks-device-and-watcher-tools
note.
**Depends on:** 17
**Estimate:** 3
**POS:** task_54107608
**Done:** [ ]

### Task 19: Full gate verification pass

**What:** Runs the repository's complete pre-merge verification suite
against the finished feature branch (Tasks 1–18) and fixes any failure that
traces back to this feature's own changes, without silencing or configuring
around a pre-existing, unrelated failure already on `main`. Also confirms
FR-11's non-goal boundary (no hosted web or native Android DOCX import code
was added).
**Files:** none expected beyond fixes to files already touched by Tasks
1–18, if any failure surfaces.
**Done when:** `pnpm --filter getwrite-frontend typecheck`, `pnpm --filter
getwrite-frontend lint`, and `pnpm --filter getwrite-frontend test:ci` all
pass; `pnpm --filter getwrite-cli test`, `pnpm --filter getwrite-cli
typecheck`, and `pnpm --filter getwrite-cli build` all pass; `pnpm --filter
getwrite-electron typecheck` and `pnpm --filter getwrite-electron test` both
pass; `pnpm knip` (repo root) reports no new unused-export findings versus
the known pre-existing baseline; `pnpm electron:build` (repo root) completes
successfully and both `electron/dist/scrivener-import-worker.cjs` and
`electron/dist/docx-import-worker.cjs` exist afterward; the resolved
`extraResources` list (defined in `electron/electron-builder.yml`) includes
both worker bundles; a diff review confirms
no file under `frontend/app/api/`, `android/`, or any hosted-auth-only path
was touched by this feature's changes (FR-11).
**Depends on:** 11, 13, 18
**Estimate:** 2
**Notes:** This is the automated gate. Per the pipeline's own Stage 6.5, a
real desktop-app exercise of this feature (launching the app, running a real
import, opening imported documents) happens there rather than as a duplicate
manual task in this list.
**POS:** task_4b44ded0
**Done:** [ ]

## FR coverage map

| FR | Covered by |
| --- | --- |
| FR-1 | Task 3, Task 9, Task 10 |
| FR-2 | Task 7, Task 9, Task 10, Task 16 |
| FR-3 | Task 3, Task 9 |
| FR-4 | Task 6, Task 9 |
| FR-5 | Task 9 |
| FR-6 | Task 8, Task 9 |
| FR-7 | Task 9 |
| FR-8 | Task 9, Task 10, Task 16 |
| FR-9 | Task 10 |
| FR-10 | Task 14, Task 15, Task 16 |
| FR-11 | Task 19 (verifies the non-goal boundary by omission) |
| FR-12 | Task 2 |
| FR-13 | Task 6, Task 8 |
| FR-14 | Task 4, Task 9 |
| FR-15 | Task 3, Task 9 |
| FR-16 | Task 1 |
| FR-17 | Task 12, Task 13 |
| FR-18 | Task 5, Task 6 |

## Summary

- Total tasks: 19
- Total estimated effort: 89 points
- Critical path: 1 → 2 → 3/4/5/6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 →
  16 → 17 → 18 → 19 (Task 1 is now the sole owner of every
  `frontend/package.json`/`pnpm-lock.yaml` change and gates Task 2 directly
  and Tasks 3–6 transitively — Task 2 depends on Task 1 so its fixture-script
  runner decision and Task 1's dependency/lockfile edit never run
  concurrently, and Tasks 4, 5, and 6 each depend on Task 1 directly, since
  all three need `jszip`/`mammoth` in place; Task 8 has no upstream
  dependency and can be built any time before Task 9; Tasks 3, 4, and 5 are
  independent of each other and can run in parallel once Task 1's
  dependencies and Task 2's fixtures land — Task 3 alone has no direct
  dependency on Task 1, only on Task 2; Task 13 depends only on Task 12, not
  on Task 14, so it can proceed in parallel with Task 14 once Task 12 lands).
- Risks: Task 9 (the orchestrator) is the single highest-leverage task,
  exactly as `importScrivenerProject` was for Feature 31 — it is the first
  point every prior unit's output is exercised together, and depends on six
  prior tasks (3–8), so a defect surfaced there may require revisiting one of
  those six rather than being fixable locally. Task 6 (`mammoth` HTML → TipTap
  conversion) carries real inference risk: FR-6(c)/resolved OQ-10 records
  that `mammoth`'s accepted-as-shown tracked-change behavior and its silent
  handling of comments were read from `mammoth`'s published source, not
  confirmed by running it against a fixture — Task 6's own fixture-based
  tests are what confirm or refute that inference, mirroring how
  `scrivener-cli-importer/tasks.md`'s later fix-pass tasks repeatedly found
  gaps between an inferred format shape and the real one. Task 1 depends on
  network access to the npm registry for `pnpm install`; if that access is
  unavailable in the environment running this task, it is a genuine blocker,
  not something to work around by hand-editing `pnpm-lock.yaml`. Tasks 12–18
  (the Electron desktop path) duplicate Feature 43's structure file-for-file
  rather than generalizing it, per FR-17's explicit decision — this trades a
  small amount of duplication for zero risk of regressing the already-shipped
  Scrivener import worker, main-process wiring, or dialog. Task 16
  (`ImportDocxDialog`) is the largest single UI task and, like
  `ImportScrivenerDialog` before it, the one most likely to blur two of its
  three distinct refusal messages into one generic string if rushed.

## Open Questions

None. All open questions on the source feature spec (OQ-1 through OQ-10) are
recorded there as resolved by owner decision at Gate 3, 2026-09-13; this task
list does not reopen or re-answer any of them.
