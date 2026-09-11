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
**Done:** [ ]

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
**Done:** [ ]

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
**Done:** [ ]

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
**Done:** [ ]

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
**Done:** [ ]

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
**Done:** [ ]

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
**Done:** [ ]

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
**Done:** [ ]

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
**Done:** [ ]

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
**Done:** [ ]

### Task 11: Manual verification against the private sample project

**What:** A human/lead-run, non-automated check of the shipped command
against the real, private sample project, to catch anything the synthetic
fixture doesn't surface.
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
source `.scriv` directory is byte-for-byte unmodified afterward. No content
or structure from this sample project is copied into any repository fixture
or test file as a result of this task.
**Depends on:** 9
**Estimate:** 2
**Notes:** Manual/exploratory — not part of the automated suite, and not a
gate for Task 10.
**POS:** task_5b75a0d2
**Done:** [ ]

## Summary
- Total tasks: 11
- Total estimated effort: 52 points
- Critical path: Tasks 1 → 2 → 4 → 8 → 9 → 10
- Risks: Task 3 (RTF→TipTap) and Task 4 (binder mapper) are the two largest
  and most novel units — Task 3 has no existing converter to model beyond
  `plainTextToTiptap`'s mark-free baseline, and Task 4 must get the FR-13
  nesting rules exactly right since Task 8's integration test is the first
  point both nesting shapes are exercised end to end. Task 8 is a wide
  integration point depending on five prior tasks (3, 4, 5, 6, 7); a defect
  surfaced there may require revisiting one of those five rather than being
  fixable locally. Task 11 depends on access to the private sample project
  and a human/lead's availability, and is not required for the automated
  gate (Task 10) to pass.

## Open Questions

None. All open questions on the source feature spec (OQ-1 through OQ-8) are
recorded there as resolved by owner decision; this task list does not
reopen or re-answer any of them.
