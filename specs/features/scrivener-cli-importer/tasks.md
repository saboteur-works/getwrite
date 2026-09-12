# Task List: Scrivener CLI importer

Source spec: `specs/features/scrivener-cli-importer.md` (Feature 31). Per OQ-3,
this ships as one combined implementation pass — the tasks below are
sequenced internally within that single pass, not split into separate
features or branches.

**Model-layer-vs-CLI placement decision:** all parsing/conversion/mapping
logic (`.scrivx` parsing, RTF→TipTap, binder→resource-tree mapping, metadata
mapping, report building, and the import orchestrator) lives under
`frontend/src/lib/models/scrivener/` and is re-exported by name through
`frontend/src/lib/core.ts`, with `cli/src/commands/project.ts` adding only a
thin subcommand that parses argv and calls the orchestrator inside
`runForTenant`. This mirrors the existing pattern exactly: `project create`
delegates to `createProjectFromType` (`frontend/src/lib/models/project-creator.ts`,
re-exported at `frontend/src/lib/core.ts:25`) and `reindex` delegates to
`listResourceIds`/`computeBacklinks`/`persistBacklinks`/`indexResource`/
`buildEntityAliasTable`/`persistMentionIndex` (all re-exported from
`core.ts:37-60`, consumed thinly by `cli/src/commands/reindex.ts:23-60`).
Placing the logic in the model layer (not `cli/src/`) is also what lets
Feature 43's UI wrapper reuse it later without duplicating or reaching across
package boundaries, consistent with `docs/architecture/ADRs/adr-016-cli-extraction-and-deferred-core-package.md`'s
framing of `core.ts` as the pre-staged `@gw/core` extraction boundary.

Test locations follow `docs/standards/testing.md` and the existing CLI test
layout: model-layer unit/integration tests go under `frontend/tests/unit/`
and `frontend/tests/integration/` (Vitest, `pnpm --filter getwrite-frontend
exec vitest run <path>`); the one CLI-level test (argv/registration/exit
codes) goes in `cli/tests/project.test.ts` (Vitest via `pnpm --filter
getwrite-cli test`), matching where `project create`'s own tests already
live in that same file.

### Task 1: Synthetic `.scriv` fixture

**What:** A committable, synthetic Scrivener 3 Mac-authored `.scriv` project
fixture built from scratch for testing — never copied or derived from the
private `import-inputs/The SF Sideshow.scriv` sample.
**Files:** `frontend/tests/fixtures/scrivener/sample.scriv/sample.scrivx`,
`frontend/tests/fixtures/scrivener/sample.scriv/Files/Data/<uuid>/content.rtf`
(+ `synopsis.txt`/`notes.rtf` for some items), `frontend/tests/fixtures/scrivener/sample.scriv/Snapshots/<uuid>.snapshots/*.rtf`.
**Done when:** the fixture is tracked in git (not matched by `.gitignore`'s
`/import-inputs` rule, since it lives under `frontend/tests/fixtures/`
instead) and its `.scrivx` root `Creator` attribute starts with `SCRMAC-3`;
the binder includes: (1) a `Folder`-type item under `DraftFolder` that itself
carries a `content.rtf` body (FR-13); (2) a `Text`-type item under
`DraftFolder` that itself has child binder items (FR-13); (3) a `Text` item
and a non-text (non-`Folder`/`Text`) item under `ResearchFolder`; (4) one
top-level user folder beside Draft/Research/Trash, containing at least one
`Text` item; (5) a `Type="Other"` item somewhere in the binder; (6) a
`TrashFolder` subtree with at least one item; (7) a `Snapshots/<uuid>.snapshots/`
directory with one `.rtf` snapshot; (8) a `StatusSettings` block and at least
one document with a `StatusID`; (9) a `LabelSettings` block and at least one
document with a `LabelID`; (10) a `Keywords` tree containing two keywords
with the identical leaf name nested under two different parent keywords, and
at least one document tagged with each, to exercise FR-15's merge; (11)
`CustomMetaData` field definitions of type `Text`, `Date`, and `List`, each
with at least one document supplying a value; (12) `content.rtf` bodies
exercising `\b`/`\b0` bold, `\i`/`\i0` italic, at least one `\uN` Unicode
escape, and one `\field`/`HYPERLINK` run.
**Depends on:** none
**Estimate:** 5
**Notes:** Keep the fixture minimal but complete — every shape listed above
needs only one instance, not full coverage of the survey project's breadth.
**POS:** task_af28e884
**Done:** [x]

### Task 2: `.scrivx` parser and Creator allow-list check

**What:** A pure parser that reads a `.scrivx` file into a typed binder tree
plus `StatusSettings`/`LabelSettings`/`CustomMetaData`/`Keywords` blocks, and
the FR-2 Creator allow-list check.
**Files:** `frontend/src/lib/models/scrivener/scrivx-types.ts`,
`frontend/src/lib/models/scrivener/scrivx-parser.ts`,
`frontend/tests/unit/scrivener-scrivx-parser.test.ts`.
**Done when:** `parseScrivxFile(scrivxPath)` returns a typed binder item tree
(`Type`, `Title`, `UUID`, `MetaData`, `children`) plus the settings/keyword
blocks and the raw `Creator` string, reading via `io.ts` (not `node:fs`,
per `docs/standards/storage-context.md` §5); `isSupportedScrivenerProject(creator)`
returns `true` only when `creator` starts with `SCRMAC-3` (FR-2's allow-list,
not a Windows/Scrivener-2 denylist); tests cover the Task 1 fixture's
`Creator` (accepted), a synthetic non-`SCRMAC-3` `Creator` string (rejected),
and a malformed/truncated `.scrivx` file (throws rather than partially
parsing).
**Depends on:** 1
**Estimate:** 5
**POS:** task_01594827
**Done:** [x]

### Task 3: RTF → TipTap converter

**What:** The hand-rolled RTF→TipTap converter required by FR-14, scoped to
the measured control words only.
**Files:** `frontend/src/lib/models/scrivener/rtf-to-tiptap.ts`,
`frontend/tests/unit/scrivener-rtf-to-tiptap.test.ts`.
**Done when:** `convertRtfToTiptap(rtfBytes)` returns `{ tiptap, plainText,
droppedFeatures }` where `tiptap` is a `TipTapDocument` using mark names
literally `"bold"` and `"italic"` (confirmed on-disk names per FR-14/OQ-5,
not asserted from the currently-undocumented `TipTapNodeSchema`); it handles
`\b`/`\b0`, `\i`/`\i0`, `\uN` Unicode escapes, and paragraph breaks; a
`\field`/`HYPERLINK` run converts to its visible plain text only (no link
mark) and is added to `droppedFeatures`; any other control word is either
kept as plain text where safe or reported via `droppedFeatures` per FR-8;
`plainText` has no formatting. No new RTF-parsing package dependency is
added (`docs/standards/package-selection.md`). Tests run the Task 1 fixture's
`content.rtf` files and assert the exact mark names and the reported
`HYPERLINK` drop.
**Depends on:** 1
**Estimate:** 8
**POS:** task_d31e3f24
**Done:** [x]

### Task 4: Binder → resource-tree mapper

**What:** Maps a parsed binder tree into an ordered, path-aware import plan
of GetWrite folders/resources, implementing FR-3, FR-13, FR-16, and FR-17's
placement and nesting rules.
**Files:** `frontend/src/lib/models/scrivener/binder-mapper.ts`,
`frontend/tests/unit/scrivener-binder-mapper.test.ts`.
**Done when:** `mapBinderToImportPlan(parsed)` returns a plan where: Draft
binder content is placed at the destination project's root (no extra
wrapper folder); Research text content is placed under one top-level
"Research" folder preserving source hierarchy, with non-text Research items
collected separately (for the FR-9 report, not converted); every other
top-level binder item becomes its own top-level GetWrite folder preserving
hierarchy; a `Folder`-type item with its own `content.rtf` becomes a GetWrite
folder whose first child is a text resource named after the folder (FR-13);
a `Text`-type item with children becomes a GetWrite folder of the same name
containing the document's own text as its first child, followed by its
converted children in binder order (FR-13); `TrashFolder` and every
`Type="Other"` item (wherever in the binder) are excluded from the plan and
returned in a separate `excluded` list with each item's title and binder
path (for FR-9). Folder identity is tracked by generated id + `parentId`
(the pattern at `frontend/src/lib/models/project-creator.ts:248-272`), not
by slug-matching `defaultFolders` (`project-creator.ts:276-282`), since two
same-named folders in different branches must not collide. Tests assert
against the Task 1 fixture's known shape for every case above.
**Depends on:** 2
**Estimate:** 8
**POS:** task_8899ba4a
**Done:** [x]

### Task 5: Metadata mapper — Status, Label, Keywords, CustomMetaData

**What:** Resolves per-document Status/Label/CustomMetaData values and
builds the project-level Status/Label/custom-field/tag-merge plan (FR-6,
FR-7, FR-15).
**Files:** `frontend/src/lib/models/scrivener/metadata-mapper.ts`,
`frontend/tests/unit/scrivener-metadata-mapper.test.ts`.
**Done when:** `buildMetadataPlan(parsed)` returns: the destination
project's `config.statuses` seeded from `StatusSettings` labels; a "Label"
custom **select** field definition seeded from `LabelSettings` (per
`frontend/src/lib/models/schemas.ts:135`'s existing `"select"` type); custom
field definitions for each `CustomMetaData` field, mapping Scrivener `Text`/
`Date`/`List` to GetWrite `text`/`date`/`select`, with a field type carrying
no mapping reported via FR-8; per-document resolved `userMetadata.status`,
`userMetadata.label`, and `userMetadata.<fieldKey>` values; and a keyword
leaf-name → tag-id merge plan where two keywords sharing a leaf name under
different parents merge into one tag, with every such merge recorded for the
FR-9 report. Test exercises the Task 1 fixture's two same-leaf-name
keywords and asserts a single merged tag plus one recorded merge entry.
**Depends on:** 2
**Estimate:** 5
**POS:** task_a04d9498
**Done:** [x]

### Task 6: Import report builder

**What:** Assembles and persists the FR-9 post-import report.
**Files:** `frontend/src/lib/models/scrivener/import-report.ts`,
`frontend/tests/unit/scrivener-import-report.test.ts`.
**Done when:** `buildImportReport(input)` renders a readable report
covering, when present: (a) every FR-8 skip with item title, binder path,
and reason; (b) every FR-15 keyword merge; (c) non-text Research content
left uncoverted; (d) every excluded `Type="Other"` item with its binder
path; (e) the project's Trash content; (f) any snapshot history found. A
category with nothing to report is omitted or explicitly stated empty, never
silently dropped. `writeImportReport(projectRoot, report)` persists the
rendered text under the created project via the `io.ts` wrappers (no
`node:fs`). Tests cover a report with all six categories populated and one
with none.
**Depends on:** none
**Estimate:** 3
**POS:** task_6b2bd6ed
**Done:** [x]

### Task 7: Sidecar synopsis/notes and feature-toggle enablement

**What:** Carries a document's synopsis/notes into its sidecar and enables
the corresponding project feature toggles (FR-5).
**Files:** `frontend/src/lib/models/scrivener/apply-document-metadata.ts`,
`frontend/tests/unit/scrivener-apply-document-metadata.test.ts`.
**Done when:** `applyDocumentMetadata(projectRoot, resourceId, doc)` writes
`synopsis.txt`/`notes.rtf`-derived text into `userMetadata.synopsis` /
`userMetadata.notes` on the resource's sidecar via `writeSidecar`
(`frontend/src/lib/models/sidecar.ts:131`); a separate
`resolveFeatureTogglesToEnable(plan)` reports which per-project feature
toggles (per parent spec FR-9) must be enabled when any imported document
carries a synopsis or notes value, for the orchestrator (Task 8) to apply
via `updateFeatureConfig` (`frontend/src/lib/models/project-features.ts:66`).
Tests cover a document with only synopsis, only notes, both, and neither.
**Depends on:** 2
**Estimate:** 3
**POS:** task_6743a166
**Done:** [x]

### Task 8: Import orchestrator — `importScrivenerProject`

**What:** The single model-layer entry point that ties Tasks 2–7 together
into a complete, valid destination GetWrite project (FR-1, FR-4, FR-10,
FR-11).
**Files:** `frontend/src/lib/models/scrivener/import-scrivener-project.ts`,
`frontend/tests/integration/scrivener-import.test.ts`.
**Done when:** `importScrivenerProject({ scrivPath, projectRoot })`: (1)
refuses and writes nothing to `projectRoot` when
`isSupportedScrivenerProject` (Task 2) is false, returning a clear error
before any destination write (FR-2, FR-10); (2) creates every resource from
the Task 4 plan using the bulk-create pattern already used by
`createProjectFromType` — `writeResourceToFile` followed by
`writeRevision(..., { isCanonical: true })`
(`frontend/src/lib/models/project-creator.ts:334-341`) — with each `Text`
item's `content.rtf` converted via Task 3; (3) creates the "Label" field and
every custom field from the Task 5 plan via `metadata-schema.ts`'s
`addField`, and writes `config.statuses`; (4) creates tags and assignments
from the Task 5 keyword-merge plan via `tags.ts`'s `createTag` /
`assignTagToResource`; (5) applies Task 7's sidecar and feature-toggle
writes; (6) writes the Task 6 report; (7) rebuilds the destination project's
indexes using the same rebuild logic `reindex`'s command already uses
(`listResourceIds`/`computeBacklinks`/`persistBacklinks`/`indexResource`/
`buildEntityAliasTable`/`persistMentionIndex`, mirroring
`cli/src/commands/reindex.ts:23-60`) so indexes are consistent on completion
(FR-11); (8) never reads the source `.scriv` path with a mutating operation.
The integration test runs the full function against the Task 1 fixture and
asserts: the destination's folder/resource tree matches the expected shape
(including both FR-13 nesting cases), sidecar `userMetadata` values,
`config.statuses`, the "Label" field and custom fields, tag assignments
(including the merged pair), the report's contents, and — via a
before/after hash or mtime comparison of the fixture directory — that the
source fixture was not modified.
**Depends on:** 3, 4, 5, 6, 7
**Estimate:** 8
**Notes:** This is the feature's one significant orchestration function,
playing the same role `createProjectFromType` plays for template-based
project creation.
**POS:** task_f60daa66
**Done:** [x]

### Task 9: Core barrel export and thin CLI command

**What:** Exposes `importScrivenerProject` through `core.ts` and registers
`project import-scrivener` on the CLI (FR-1).
**Files:** `frontend/src/lib/core.ts`, `cli/src/commands/project.ts`,
`cli/tests/project.test.ts`.
**Done when:** `frontend/src/lib/core.ts` adds a named re-export (not
`export *`, per that file's own convention) of `importScrivenerProject` and
any error/result types it throws or returns; `cli/src/commands/project.ts`
registers `project import-scrivener <scrivPath> [projectRoot]` under the
existing `project` command group, wrapped in `runForTenant` the same way as
`project create` (`cli/src/commands/project.ts:4-47`) — parsing argv,
calling `runForTenant(projectRoot, () => importScrivenerProject(...))`,
printing a short summary on success, and mapping a Task 8 refusal to a
non-zero exit with a clear message and `process.exit`, matching `create`'s
try/catch → `process.exit(2)` shape; all orchestration logic stays in Task
8's model function — this task is registration and argv/exit-code glue
only. `cli/tests/project.test.ts` covers: a successful run against the Task
1 fixture (exit 0, destination project created); a refusal run against a
fixture variant with a non-`SCRMAC-3` `Creator` (non-zero exit, no
destination directory written, message printed); and missing/invalid
argument handling.
**Depends on:** 8
**Estimate:** 3
**POS:** task_088c019d
**Done:** [x]

### Task 10: Verify build, type, and dead-export gates

**What:** Confirms the full test/typecheck/knip gate is green after Tasks
1–9 land.
**Files:** none (verification only).
**Done when:** `pnpm --filter getwrite-frontend exec vitest run
scrivener-scrivx-parser scrivener-rtf-to-tiptap scrivener-binder-mapper
scrivener-metadata-mapper scrivener-import-report
scrivener-apply-document-metadata scrivener-import` and `pnpm --filter
getwrite-frontend typecheck` both pass; `pnpm --filter getwrite-cli test`
(covering the new `project import-scrivener` cases) and `pnpm --filter
getwrite-cli typecheck` both pass; `pnpm knip` (repo root) reports no new
unused-export warnings from `frontend/src/lib/models/scrivener/` or the
`core.ts` additions.
**Depends on:** 9
**Estimate:** 2
**POS:** task_39e4a136
**Done:** [x]

### Task 11: Rebuild the fixture to the measured real-project shapes

**What:** Rebuild `sample.scrivx` (and any fixture files it references) to
the element shapes recorded in `scrivener-format.md` (FR-18), replacing the
guessed shapes the fixture previously used, and add the newly measured
edge cases FR-18 now requires.
**Files:** `frontend/tests/fixtures/scrivener/sample.scriv/sample.scrivx`,
`frontend/tests/fixtures/scrivener/sample.scriv/Files/Data/<uuid>/*`,
`frontend/tests/unit/scrivener-scrivx-parser.test.ts`,
`frontend/tests/unit/scrivener-binder-mapper.test.ts`,
`frontend/tests/unit/scrivener-metadata-mapper.test.ts`,
`frontend/tests/integration/scrivener-import.test.ts`.
**Done when:** the fixture's `BinderItem`, `Keyword`, `MetaDataField`,
`LabelSettings`, and `StatusSettings` names come from a child `<Title>`
element (never a `Title` attribute); per-document custom metadata uses
`CustomMetaData/MetaDataItem/FieldID` + `.../Value` (never an `ID`
attribute on `MetaDataItem`); project-level custom field definitions live
under `CustomMetaDataSettings/MetaDataField` (`@ID`/`@Type`/`@Align`/
`@DateType`/`@Wraps`, child `<Title>`, and `ListOptions/Option@ID` for the
`List`-type field); per-document keywords use `Keywords/KeywordID`; Label
and Status names are element text, not attributes. The fixture additionally
includes: a `Text` binder item with no `<Title>` element at all; a `List`
custom field whose document value is an `Option@ID` (not option text); two
`Date` custom field values, one in each measured shape
(`YYYY-MM-DD HH:MM:SS.fffff ±HHMM` and `YYYY-MM-DD HH:MM:SS ±HHMM`); and a
document with `StatusID` `-1`. All prior FR-12/FR-13/FR-15 fixture cases
(nested Folder-with-content.rtf, Text-with-children, same-leaf-name
keyword merge, etc.) are preserved in the rebuilt fixture. Existing tests
in the four listed files are updated to assert against the new shapes and
pass.
**Depends on:** none
**Estimate:** 5
**POS:** task_49aed81c
**Done:** [x]

### Task 12: Fix `.scrivx` parser to the real element shapes, with recoverable fragment errors

**What:** Rewrite `scrivx-parser.ts`/`scrivx-types.ts` to read the FR-18
shapes and to collect malformed/unexpected fragments as reported skips
(FR-8) instead of throwing and aborting the run.
**Files:** `frontend/src/lib/models/scrivener/scrivx-parser.ts`,
`frontend/src/lib/models/scrivener/scrivx-types.ts`,
`frontend/tests/unit/scrivener-scrivx-parser.test.ts`.
**Done when:** the parser reads titles from child `<Title>` elements
(binder items, keywords, metadata fields, Label/Status settings); reads
per-document custom metadata from `CustomMetaData/MetaDataItem/FieldID` +
`.../Value`; reads project-level field definitions from
`CustomMetaDataSettings/MetaDataField` (including `ListOptions/Option@ID`
for List-type fields); reads per-document keywords from
`Keywords/KeywordID`; reads Label/Status names from element text. A
`MetaDataItem` missing `FieldID` or `Value`, or any other malformed or
unexpected element the parser encounters while walking the tree, is
collected into a `fragmentErrors`/`skips` list on the parse result (item
title or binder path, and a reason) rather than thrown, so parsing
continues past it — the parser's public entry point only throws for an
unreadable or non-XML `.scrivx` file. Tests cover: the Task 11 fixture
parses cleanly with the new shapes; a synthetic `.scrivx` variant with a
`MetaDataItem` missing `FieldID` parses successfully with that item
recorded as a skip rather than throwing; a fully malformed/non-XML
`.scrivx` still throws.
**Depends on:** 11
**Estimate:** 8
**POS:** task_0ac3e8a3
**Done:** [x]

### Task 13: Fix binder-mapper (untitled fallback) and metadata-mapper (Option→text, date parsing, recoverable errors)

**What:** Implements FR-19 (untitled fallback naming) in the binder mapper,
and FR-20 (List `Option@ID`→text resolution, both Date shapes) plus
recoverable per-value errors (FR-8) in the metadata mapper.
**Files:** `frontend/src/lib/models/scrivener/binder-mapper.ts`,
`frontend/src/lib/models/scrivener/metadata-mapper.ts`,
`frontend/tests/unit/scrivener-binder-mapper.test.ts`,
`frontend/tests/unit/scrivener-metadata-mapper.test.ts`.
**Done when:** `mapBinderToImportPlan` gives a `<Title>`-less binder item
the fallback name "Untitled", de-duplicated among siblings lacking a title
by an appended counter ("Untitled", "Untitled 2", …) in binder order, and
records each fallback-named item (name used, binder path) in a form the
Task 6 report builder can consume; `buildMetadataPlan` resolves a List
field's per-document `Option@ID` to that option's text before writing
`userMetadata.<fieldKey>`, treating an unresolvable ID as a recorded FR-8
skip for that value rather than a thrown error; it parses both measured
Date shapes, treating an unparseable value as a recorded FR-8 skip for
that value; a `StatusID` of `-1` (or any `StatusID` with no matching
`Status@ID`) resolves via the same recorded-skip path rather than
throwing. Tests exercise the Task 11 fixture's untitled item, its
Option@ID list value (asserting resolved text, not the raw ID), both date
shapes, and the `-1` status value.
**Depends on:** 12
**Estimate:** 8
**POS:** task_f212cf59
**Done:** [x]

### Task 14: Wire recoverable skips into the report and RTF converter fixes

**What:** Threads the Task 12/13 recoverable-skip lists through
`import-report.ts` and the orchestrator (FR-8, FR-9, FR-19), and fixes the
RTF converter's text-fidelity gaps (FR-14 amendment): the special-character
mapping, `hardBreak` for `\line`, list-item text handling, super/subscript
reporting, and the layout-word silent-ignore list.
**Files:** `frontend/src/lib/models/scrivener/import-report.ts`,
`frontend/src/lib/models/scrivener/import-scrivener-project.ts`,
`frontend/src/lib/models/scrivener/rtf-to-tiptap.ts`,
`frontend/tests/unit/scrivener-import-report.test.ts`,
`frontend/tests/unit/scrivener-rtf-to-tiptap.test.ts`,
`frontend/tests/integration/scrivener-import.test.ts`.
**Done when:** `buildImportReport` gains an "Untitled fallback names" entry
(FR-19) and folds Task 12/13's recoverable skips into its existing FR-8
skip list (no separate never-reported category); the orchestrator no longer
aborts on a `.scrivx` fragment error and instead surfaces it through the
report. `convertRtfToTiptap` converts `\emdash`→"—", `\endash`→"–",
`\lquote`/`\rquote`/`\ldblquote`/`\rdblquote`→‘/’/“/”, `\bullet`→"•",
`\tab`→a tab character, and `\line`→a TipTap `hardBreak` node (node type
confirmed at
`projects/937079b8-83d0-4052-8688-8c3b77499c2b/resources/9f32a555-583f-4824-b272-c3953938f8e2/content.tiptap.json`);
a list paragraph's item text becomes an ordinary paragraph with the
`\listtext` marker text discarded, not duplicated; `\super`/`\sub` runs
keep their text and are added to `droppedFeatures`; the layout-only control
words named in the FR-14 amendment are consumed silently, producing no
text, no mark, and no `droppedFeatures` entry; an unknown destination
(`{\*\…}`) is skipped silently. Tests use synthetic RTF snippets only (one
per mapped/dropped/ignored control word) plus a re-run of the Task 11
fixture's `content.rtf` bodies.
**Depends on:** 13
**Estimate:** 8
**POS:** task_986df71a
**Done:** [x]

### Task 15: Re-run the gate

**What:** Confirms the full test/typecheck/knip gate is green after Tasks
11–14 land.
**Files:** none (verification only).
**Done when:** `pnpm --filter getwrite-frontend exec vitest run
scrivener-scrivx-parser scrivener-rtf-to-tiptap scrivener-binder-mapper
scrivener-metadata-mapper scrivener-import-report
scrivener-apply-document-metadata scrivener-import` and `pnpm --filter
getwrite-frontend typecheck` both pass; `pnpm --filter getwrite-cli test`
and `pnpm --filter getwrite-cli typecheck` both pass; `pnpm knip` (repo
root) reports no new unused-export warnings from
`frontend/src/lib/models/scrivener/` or `core.ts`.
**Depends on:** 14
**Estimate:** 2
**POS:** task_74d187f0
**Done:** [x]

### Task 16: Fixture and tests for field-key clash, destination cleanup, and no-leftover-indexing

**What:** Extend the synthetic fixture and write the test coverage FR-7,
FR-22, and FR-23 require before the production code changes land: a custom
field whose id clashes with a built-in metadata key, and the test cases for
suffix-rule resolution, run-created-vs-pre-existing destination cleanup, and
no leftover watcher/queued indexing after an import.
**Files:** `frontend/tests/fixtures/scrivener/sample.scriv/sample.scrivx`
(add a `CustomMetaData` field whose id/derived key is `pov`, matching
`default-metadata-schema.ts:18`), `frontend/tests/integration/scrivener-import.test.ts`,
`frontend/tests/unit/scrivener-metadata-mapper.test.ts`.
**Done when:** the fixture includes a `CustomMetaData` field deriving the
key `pov` with at least one document value, alongside all prior fixture
cases (unchanged). New/updated tests assert: (1) the imported `pov` field
lands under the key `pov-scrivener` (or the next free
`pov-scrivener-<n>` if that fixture also happens to collide), keeps
"Point of View" — the fixture's field title — as its `label`, and the
rename is recorded in the FR-9 report; (2) running the importer against a
fatal error injected after writing has started, targeting a `projectRoot`
that did not exist beforehand, leaves no directory behind at that path
afterward; (3) the same injected-fatal-error run targeting a `projectRoot`
that already existed (empty) before the run leaves that directory (now
however far the run got) untouched — not removed; (4) a run against a
non-empty pre-existing `projectRoot` is refused before any write, exits
non-zero, and writes nothing; (5) after a full successful
`importScrivenerProject` run resolves, no "sidecar not found" warning was
logged during the run, and the process has no live backlinks watcher left
running for the destination project (e.g. asserting `indexer-queue.ts`'s
watcher registry has no entry for it, or an equivalent observable signal).
**Depends on:** 15
**Estimate:** 5
**POS:** task_1802ca57
**Done:** [x]

### Task 17: Field-key clash suffix rule and per-field FR-8 recovery

**What:** Implements FR-7's amendment (built-in/already-added key clash
resolves to a free `<key>-scrivener[-<n>]` suffix, Scrivener title kept as
label, rename recorded) and FR-8's generalization (any per-field
metadata-schema creation failure is a recorded skip, never an abort).
**Files:** `frontend/src/lib/models/scrivener/metadata-mapper.ts`,
`frontend/src/lib/models/scrivener/import-scrivener-project.ts`,
`frontend/src/lib/models/scrivener/import-report.ts`,
`frontend/tests/unit/scrivener-metadata-mapper.test.ts`,
`frontend/tests/integration/scrivener-import.test.ts`.
**Done when:** the destination project's realized metadata schema (every
built-in field from `default-metadata-schema.ts` plus every field already
added earlier in the same import) is checked before each candidate field
key — including the "Label" field's key — is used; a colliding key is
retried as `<original-key>-scrivener`, then `-scrivener-2`,
`-scrivener-3`, … until free, keeping the source field's title as `label`;
every such rename is recorded (original key, field title, renamed key) and
folded into the FR-9 report by `import-report.ts`; a field whose creation
still fails for any other reason is recorded as an FR-8 skip rather than
thrown. This is additive to `deriveFieldKey`'s existing within-import `-2`/
`-3` disambiguation (`metadata-mapper.ts:174-189`), which is unchanged.
Uses Task 16's fixture and tests.
**Depends on:** 16
**Estimate:** 5
**POS:** task_30b653a1
**Done:** [x]

### Task 18: Run-created-destination cleanup on fatal error, and up-front non-empty refusal

**What:** Implements FR-22: refuse a non-empty pre-existing `projectRoot`
up front; on a fatal error after writing has started, remove `projectRoot`
only when this run created it (it did not exist beforehand), reporting the
error and the failed phase either way.
**Files:** `frontend/src/lib/models/scrivener/import-scrivener-project.ts`,
`cli/src/commands/project.ts`, `frontend/tests/integration/scrivener-import.test.ts`,
`cli/tests/project.test.ts`.
**Done when:** `importScrivenerProject` records, once and before any write,
whether `projectRoot` existed and whether it was empty; refuses
immediately (no write) when it existed and was non-empty; on any later
fatal error (not an FR-8/FR-20 skip), removes `projectRoot` via
`rm(projectRoot, { recursive: true, force: true })` from `io.ts` only when
it did not exist before the run, and never touches it otherwise; the
thrown/printed error identifies the orchestration phase it failed in
(module doc's "Orchestration order" list) for the CLI wrapper to print.
Uses Task 16's fixture and tests; extends `cli/tests/project.test.ts` with
the up-front-refusal CLI case if not already covered by the model-layer
test.
**Depends on:** 16
**Estimate:** 5
**POS:** task_107b0536
**Done:** [x]

### Task 19: Import-scoped indexing suppression and watcher stop

**What:** Implements FR-23: a minimal, import-scoped addition to
`indexer-queue.ts` that suspends background indexing/watcher-starting for
the duration of the importer's own writes, restoring normal behavior
afterward for any other in-process consumer.
**Files:** `frontend/src/lib/models/indexer-queue.ts`,
`frontend/src/lib/models/scrivener/import-scrivener-project.ts`,
`frontend/src/lib/core.ts` (if the new function needs re-exporting),
`frontend/tests/unit/indexer-queue.test.ts` (or existing equivalent),
`frontend/tests/integration/scrivener-import.test.ts`.
**Done when:** `indexer-queue.ts` exports a new function (e.g.
`withIndexingSuspended<T>(fn: () => Promise<T>): Promise<T>`) that sets the
existing `isStopped` flag, runs `fn`, and on completion (success or throw)
stops any watcher recorded in `activeBacklinkWatchers` and resets
`isStopped` to its prior state; `enqueueIndex`/`enqueueEntityRescan`/
`shutdownIndexer`'s behavior for the running app is unchanged by this
addition. `importScrivenerProject` wraps its entire write phase
(destination-project creation through the FR-11 rebuild) in this call, so
`writeResourceToFile`, `applyDocumentMetadata`, and `addField`/`addGroup`
never schedule background indexing or start a backlinks watcher during an
import, and the importer's own FR-11 rebuild remains the only indexing
that runs. Uses Task 16's no-leftover-indexing test. `writeSidecar`,
`revision-manager.ts`, and `inverted-index.ts` are unmodified by this task.
**Depends on:** 16
**Estimate:** 5
**POS:** task_173aca2a
**Done:** [x]

### Task 20: Re-run the gate

**What:** Confirms the full test/typecheck/knip gate is green after Tasks
16–19 land.
**Files:** none (verification only).
**Done when:** `pnpm --filter getwrite-frontend exec vitest run
scrivener-scrivx-parser scrivener-rtf-to-tiptap scrivener-binder-mapper
scrivener-metadata-mapper scrivener-import-report
scrivener-apply-document-metadata scrivener-import` and `pnpm --filter
getwrite-frontend typecheck` both pass; `pnpm --filter getwrite-cli test`
and `pnpm --filter getwrite-cli typecheck` both pass; `pnpm knip` (repo
root) reports no new unused-export warnings from
`frontend/src/lib/models/scrivener/`, `frontend/src/lib/models/indexer-queue.ts`,
or `core.ts`.
**Depends on:** 17, 18, 19
**Estimate:** 2
**POS:** task_6b49b143
**Done:** [ ]

### Task 21: Fixture and tests for hex-escape/paragraph-break/silent-ignore coverage

**What:** Extend the synthetic fixture and write the test coverage the
third fix pass's FR-8/FR-14 amendments require, ahead of the production
code changes: backslash-newline-only and mixed `\par`/backslash-newline
paragraph breaks; `\'XX` escapes covering a punctuation case, an
accented-letter case, a non-breaking space, and a C0 control byte; a `\uN`
escape with an ANSI fallback under `\uc1`; and `\deftab`/`\pardeftab`
present but absent from the report.
**Files:** `frontend/tests/fixtures/scrivener/sample.scriv/sample.scrivx`,
`frontend/tests/fixtures/scrivener/sample.scriv/Files/Data/<uuid>/content.rtf`
(new/updated fixture documents), `frontend/tests/unit/scrivener-rtf-to-tiptap.test.ts`,
`frontend/tests/unit/scrivener-import-report.test.ts`.
**Done when:** the fixture gains: (1) a document using only
backslash-newline paragraph breaks with no `\par` at all; (2) a document
mixing `\par` and backslash-newline breaks; (3) `\'XX` escapes covering a
punctuation case (e.g. `\'92`), an accented-letter case (e.g. `\'e9`), a
non-breaking-space case (`\'a0`), and a C0 control-byte case (e.g.
`\'01`), all under a document declaring `\ansicpg1252`; (4) a `\uN` escape
immediately followed by its ANSI fallback bytes under `\uc1`; (5) a
`\deftab`/`\pardeftab` occurrence with no corresponding report entry
expected. All prior fixture cases (Tasks 1, 11, 16) are preserved
unchanged. New test cases are written against these fixture additions but
are expected to fail (red) until Tasks 22–24 land, since they specify the
not-yet-implemented behavior.
**Depends on:** 20
**Estimate:** 5
**POS:** task_cfaead61
**Done:** [x]

### Task 22: Hex-escape/code-page decoding, C0 control-character drop, and `\ucN` fallback skip

**What:** Implements FR-14's `\'XX`-decoding amendment and FR-8's
code-page/control-character amendment: general `\ansicpg`-driven
Windows-code-page decoding of `\'XX` escapes, an FR-8 skip for an
unsupported declared code page, dropping a decoded C0 control character
with one report entry per affected document, and `\ucN` ANSI-fallback-byte
skip semantics.
**Files:** `frontend/src/lib/models/scrivener/rtf-to-tiptap.ts`,
`frontend/src/lib/models/scrivener/import-report.ts`,
`frontend/tests/unit/scrivener-rtf-to-tiptap.test.ts`.
**Done when:** `convertRtfToTiptap` decodes every `\'XX` escape as a byte
in the document's declared `\ansicpg` code page (starting with
Windows-1252 support, since that is the only code page measured in the
real project), producing the correct Unicode character for each of the 14
measured escape values in `scrivener-format.md`'s third-pass table; a
document declaring an unsupported code page is recorded as an FR-8 skip
rather than decoded with a guess; a decoded C0 control character (0x00–
0x1F) is dropped from the output text and recorded as exactly one FR-9
report entry per affected document (not one per occurrence); and under an
active `\ucN` (N > 0), the N ANSI-fallback bytes following a `\uN` escape
are consumed and discarded rather than emitted, so the decoded Unicode
character is not duplicated. Tests use Task 21's fixture cases and
synthetic RTF snippets for each escape value and the unsupported-code-page
case.
**Depends on:** 21
**Estimate:** 8
**POS:** task_ce03b6b4
**Done:** [x]

### Task 23: Backslash-newline paragraph breaks

**What:** Implements FR-14's backslash-newline paragraph-break amendment.
**Files:** `frontend/src/lib/models/scrivener/rtf-to-tiptap.ts`,
`frontend/tests/unit/scrivener-rtf-to-tiptap.test.ts`.
**Done when:** `convertRtfToTiptap` treats a backslash immediately
followed by a line-feed or CR-LF newline (nothing else between them) as a
paragraph break, identically to `\par`; an escaped literal backslash
(`\\`) is never treated as a paragraph break, including when ordinary text
or a newline follows it; a control word whose name/parameter is split
across a source line break is never mistaken for a paragraph-breaking
backslash-newline; `\line` continues to produce a `hardBreak` node within
the current paragraph and is never treated as a paragraph break. Tests use
Task 21's backslash-newline-only and mixed fixture documents, plus
synthetic snippets isolating `\\` followed by a newline and a control word
split across a line break, asserting paragraph count and structure.
**Depends on:** 21
**Estimate:** 5
**POS:** task_2bf3e928
**Done:** [x]

### Task 24: Silent-ignore list completion for `\deftab`/`\pardeftab`

**What:** Implements FR-14's silent-ignore amendment for tab-stop/
default-tab-width control words.
**Files:** `frontend/src/lib/models/scrivener/rtf-to-tiptap.ts`,
`frontend/tests/unit/scrivener-rtf-to-tiptap.test.ts`.
**Done when:** `\deftab` and `\pardeftab` are consumed silently —
producing no text, no mark, and no `droppedFeatures`/FR-9 report entry —
joining the existing layout-only silent-ignore list. Tests assert a
`content.rtf` snippet containing `\deftab`/`\pardeftab` produces no report
entry, using Task 21's fixture case.
**Depends on:** 21
**Estimate:** 2
**POS:** task_7ec9e89a
**Done:** [x]

### Task 25: Correct the false dependency comment in `scrivx-parser.ts`

**What:** Fixes the false module-doc claim at `scrivx-parser.ts:32` about
`fast-xml-parser`'s origin, per FR-18's dependency-justification amendment
and the owner's after-the-fact decision to keep the dependency.
**Files:** `frontend/src/lib/models/scrivener/scrivx-parser.ts`.
**Done when:** the module doc comment no longer states or implies
`fast-xml-parser` was "already a transitive dependency elsewhere in the
lockfile" before this feature; it instead states plainly that
`fast-xml-parser` is a direct `frontend` dependency added for this
feature, with a one-line reason (parsing the `.scrivx` XML binder tree; no
existing dependency in `frontend/package.json`/`cli/package.json` covered
XML parsing). No behavior change — comment only.
**Depends on:** none
**Estimate:** 1
**POS:** task_ade307b4
**Done:** [x]

### Task 26: Re-run the gate

**What:** Confirms the full test/typecheck/knip gate is green after Tasks
21–25 land.
**Files:** none (verification only).
**Done when:** `pnpm --filter getwrite-frontend exec vitest run
scrivener-scrivx-parser scrivener-rtf-to-tiptap scrivener-binder-mapper
scrivener-metadata-mapper scrivener-import-report
scrivener-apply-document-metadata scrivener-import` and `pnpm --filter
getwrite-frontend typecheck` both pass; `pnpm --filter getwrite-cli test`
and `pnpm --filter getwrite-cli typecheck` both pass; `pnpm knip` (repo
root) reports no new unused-export warnings from
`frontend/src/lib/models/scrivener/` or `core.ts`.
**Depends on:** 22, 23, 24, 25
**Estimate:** 2
**POS:** task_fc36f70d
**Done:** [x]

### Task 27: Write the canonical revision as the serialized TipTap document

**What:** Implements FR-4's amendment: the resource's initial canonical
revision payload MUST be the same serialized TipTap document written to
`content.tiptap.json`, not plain text, so the app's revision parser
(`useRevisionContent.ts`) recognizes it and does not flatten the document
on first open.

**Files:** `frontend/src/lib/models/scrivener/import-scrivener-project.ts`,
`frontend/tests/integration/scrivener-import.test.ts`.
**Done when:** the orchestrator's per-`Text`-item write no longer calls
`writeRevision(..., resource.plainText ?? "", { isCanonical: true })`
(the plain-text pattern mirrored from `project-creator.ts:334-341` that
caused the defect); it instead writes
`writeRevision(..., JSON.stringify(tiptapDocument), { isCanonical: true })`
using the same `TipTapDocument` value written to `content.tiptap.json` for
that resource, so the two are byte-identical in content (not merely
structurally similar). `content.txt`'s plain-text write is unchanged. A new
unit or integration test asserts, for at least one fixture document with
multiple paragraphs and at least one bold/italic mark: (1) the written
canonical revision payload parses as JSON; (2) the parsed value's `type` is
`"doc"`; (3) its paragraph count equals `content.tiptap.json`'s paragraph
count for that resource; (4) its bold/italic mark counts equal
`content.tiptap.json`'s mark counts for that resource. No paragraph `attrs`
(`id`, `textAlign`, `paragraphLeading`) are added by this task — per FR-4's
amendment, the editor's own extensions (`UniqueID`, `TextAlign`,
`GetWriteParagraphLeading`) supply defaults for any node missing them, so
the importer does not need to populate them.
**Depends on:** 26
**Estimate:** 3
**POS:** task_12a1b0a4
**Done:** [x]

### Task 28: Re-run the gate

**What:** Confirms the full test/typecheck/knip gate is green after Task 27
lands.
**Files:** none (verification only).
**Done when:** `pnpm --filter getwrite-frontend exec vitest run
scrivener-scrivx-parser scrivener-rtf-to-tiptap scrivener-binder-mapper
scrivener-metadata-mapper scrivener-import-report
scrivener-apply-document-metadata scrivener-import` and `pnpm --filter
getwrite-frontend typecheck` both pass; `pnpm --filter getwrite-cli test`
and `pnpm --filter getwrite-cli typecheck` both pass; `pnpm knip` (repo
root) reports no new unused-export warnings from
`frontend/src/lib/models/scrivener/` or `core.ts`.
**Depends on:** 27
**Estimate:** 2
**POS:** task_6e6cd439
**Done:** [x]

### Task 29: Manual verification against the private sample project

**What:** A human/lead-run, non-automated check of the shipped command
against the real, private sample project, to catch anything the synthetic
fixture doesn't surface. (Renumbered from Task 11 to Task 16, to Task 21,
to Task 26, to Task 27, and now to Task 29, so its dependency on the
fix-pass tasks satisfies task-list ordering; its POS id and scope are
otherwise unchanged from the original Task 11.)
**Files:** none tracked — operates only on the gitignored
`import-inputs/The SF Sideshow.scriv`.
**Done when:** a human/lead runs `getwrite-cli project import-scrivener
"import-inputs/The SF Sideshow.scriv" <temp-destination>` targeting a
temporary directory outside the repo's `projects/` directory (e.g. under
`$TMPDIR`), never writing into `projects/` unintentionally, and confirms by
inspection that: the Draft binder's structure and text, Research text
content, the four top-level user folders, Status/Label/Keywords, and
CustomMetaData all carried over plausibly; the report correctly lists the
three `Other` items, the Trash content, and any snapshot history; and the
source `.scriv` directory is byte-for-byte unmodified afterward. Per FR-21's
fourth-pass amendment, the lead MUST additionally open at least two of the
imported documents in the running app and confirm, for each, that its
paragraphs and bold/italic marks survive the open and that opening it does
not rewrite `content.tiptap.json` or the canonical revision into a
flattened, single-paragraph, mark-free form. No content or structure from
this sample project is copied into any repository fixture or test file as
a result of this task. Per FR-21, this run MUST complete successfully (exit
0, a report written) — this is the Stage-6.5-style acceptance requirement,
verified by the lead, not by an automated test.
**Depends on:** 28
**Estimate:** 2
**Notes:** Manual/exploratory — not part of the automated suite, and not a
gate for Task 10, Task 15, Task 20, or Task 28. It now depends on the full
Task 16–19 second fix pass and the Task 27 canonical-revision fix landing
first, since the real project previously aborted mid-run on the field-key
clash the second pass fixes, and opening an imported document previously
flattened it before the Task 27 fix.
**POS:** task_5b75a0d2
**Done:** [ ]

## Summary
- Total tasks: 29
- Total estimated effort: 133 points
- Critical path: Tasks 1 → 2 → 4 → 8 → 9 → 11 → 12 → 13 → 14 → 15 → 16 →
  17/18/19 → 20 → 21 → 22/23/24 → 25 → 26 → 27 → 28 → 29
- Risks: Task 3 (RTF→TipTap) and Task 4 (binder mapper) are the two largest
  and most novel units — Task 3 has no existing converter to model beyond
  `plainTextToTiptap`'s mark-free baseline, and Task 4 must get the FR-13
  nesting rules exactly right since Task 8's integration test is the first
  point both nesting shapes are exercised end to end. Task 8 is a wide
  integration point depending on five prior tasks (3, 4, 5, 6, 7); a defect
  surfaced there may require revisiting one of those five rather than being
  fixable locally. Task 12 (parser rewrite to real shapes, with
  recoverable-error collection) and Task 13 (List/Date resolution with the
  same recoverable-error discipline) are the two riskiest first-fix-pass
  tasks: both replace throw-on-malformed behavior with skip-and-report, and
  a missed case in either would reproduce the original real-project
  failure. Tasks 17, 18, and 19 are independent of each other (each touches
  a distinct concern — field-key clashes, destination cleanup, indexing
  suppression — with limited file overlap in
  `import-scrivener-project.ts`) and can run in parallel once Task 16's
  fixture/tests land; Task 19 (indexing suppression) carries the most risk
  of the three, since it adds new shared state-management to
  `indexer-queue.ts` that must not regress the running app's own indexing.
  Tasks 22, 23, and 24 are independent of each other (each touches a
  distinct concern in `rtf-to-tiptap.ts` — code-page/control-character
  decoding, paragraph-break detection, and the silent-ignore list — with
  limited overlap) and can run in parallel once Task 21's fixture/tests
  land; Task 22 (code-page decoding + `\ucN` fallback skip) carries the
  most risk of the three, since a general `\ansicpg`-driven decode table
  is new surface area with no prior converter code to model beyond the
  hardcoded punctuation shortlist it replaces, and Task 23 (backslash-
  newline detection) must not misfire on an escaped `\\` or a control word
  split across a line, which the fixture can only partially exercise.
  Task 25 (dependency-comment fix) is low-risk and independent of Tasks
  22–24, touching only a module doc comment in `scrivx-parser.ts` with no
  behavior change. Task 27 (write the canonical revision as the serialized
  TipTap document) is low-risk and narrowly scoped — it changes one call
  site's payload argument to reuse a value already computed for
  `content.tiptap.json` — but is on the critical path to Task 29, since a
  regression there reproduces the fourth-measured-pass defect (an imported
  document flattening to one paragraph on first open in the app). Task 29
  (originally Task 11, then Task 16, then Task 21, then Task 26, then Task
  27, now Task 29) still depends on access to the private sample project
  and a human/lead's availability, and is not required for the automated
  gate (Task 28) to pass.

## Open Questions

None. All open questions on the source feature spec (OQ-1 through OQ-20)
are recorded there as resolved by owner decision; this task list does not
reopen or re-answer any of them.
