# Tasks: Plain-Text File Import

Source spec: `specs/features/plain-text-import.md` (all 7 Open Questions resolved).

Architectural precedent: `frontend/src/lib/models/docx/` (module split, orchestration
order, error-signaling convention, destination-cleanup-on-fatal-error convention) and
`frontend/src/lib/models/scrivener/` (secondary precedent — both are
always-creates-a-new-project importers). The task breakdown below follows the DOCX
importer's module shape (source detection → content conversion → report builder →
orchestrator → CLI wiring → tests) rather than inventing a new structure, per the
codebase's existing precedent.

Granularity: story points (1/2/3/5/8).

## Task list

### Task 1: Add `"plaintext"` as a writing-log source
**What:** Extends the writing-log's fixed source enum so a plain-text import can tag its entry, exactly like DOCX (`"docx"`) and Scrivener (`"scrivener"`) already do.
**Files:** `frontend/src/lib/models/schemas.ts` (`WritingLogSourceSchema`), `frontend/src/lib/models/writing-log.ts` (`WritingLogSource` type re-export, if separately declared — confirm it derives from the schema).
**Done when:** `WritingLogSourceSchema` is `z.enum(["docx", "scrivener", "plaintext"])`, the `WritingLogSource` type reflects the new member, and existing writing-log unit tests (`frontend/tests/unit/writing-log*.test.ts` or equivalent) still pass unmodified.
**Depends on:** none
**Estimate:** 1
**Notes:** This is a narrow, additive enum change — do not touch the read/aggregate logic in `writing-log-core.ts`, which is source-agnostic already (FR-8 confirms imports are excluded from daily-goal comparison at the read layer, not per-source).
**Done:** [ ] — check off when the task is complete

### Task 2: Plain-text source detection and folder walk
**What:** A new module that auto-detects a single `.txt` file vs. a directory source, and recursively walks a directory into an ordered plan of `.txt` files and non-empty subfolders — mirroring `docx/source-detection.ts`'s `detectDocxSource`/`walkDocxFolder` almost exactly, adjusted for `.txt` (no Word-lock-file concept).
**Files:** New: `frontend/src/lib/models/plaintext/source-detection.ts`.
**Done when:** `detectPlainTextSource(sourcePath)` returns `{ kind: "file" }` or `{ kind: "directory" }`, throwing a new `NoTxtFilesFoundError` (mirroring `NoDocxFilesFoundError`) for a directory with no `.txt` file anywhere in its tree (FR-4), before any write; `walkPlainTextFolder(dirPath)` recursively walks a directory into an ordered `entries` plan of `.txt` files and non-empty subfolders, with files and subfolders interleaved (not files-then-folders) via case-insensitive natural filename sort (`localeCompare(..., { numeric: true, sensitivity: "base" })`), a hidden/dot file or directory skipped as one unit without descending, a non-`.txt` file skipped and tallied, and a subfolder with no `.txt` anywhere beneath it pruned from `entries` (resolves FR-2, FR-3, FR-4).
**Depends on:** none
**Estimate:** 3
**Notes:** Only reads via `io.ts`'s read-only wrappers (`readdir`/`stat`), never `node:fs` directly, per `docs/standards/storage-context.md`. There is no lock-file skip category for `.txt` (that's DOCX-specific), so the skip-counts shape only needs a non-`.txt`-files count and a hidden-files count, not three categories.
**Done:** [ ] — check off when the task is complete

### Task 3: Plain-text-to-TipTap conversion
**What:** A pure function converting a `.txt` file's raw content into a GetWrite TipTap document, applying FR-6's fixed parsing rules.
**Files:** New: `frontend/src/lib/models/plaintext/txt-to-tiptap.ts`.
**Done when:** `convertPlainTextToTiptap(rawContent: string)` (a) strips a leading UTF-8 byte-order mark if present, (b) splits the text into paragraphs on a blank line (one or more consecutive blank lines act as a single separator), (c) within a paragraph block, joins a single `\n` as a soft wrap into the same paragraph rather than starting a new paragraph, (d) returns a `{ type: "doc", content: [...] }` TipTap document using the same `"paragraph"`/`"text"` node shapes the DOCX/Scrivener converters emit, and (e) an all-blank or empty input produces a document with zero or one empty paragraph rather than throwing. Unit-tested in Task 10.
**Depends on:** none
**Estimate:** 3
**Notes:** The spec resolves *whether* a single `\n` starts a new paragraph (it does not) but not what visual marker represents the joined soft wrap. Follow `rtf-to-tiptap.ts`'s existing precedent for an intra-paragraph line break — emit a `hardBreak` node at each internal `\n`, the same node RTF's `\line` control word already produces — rather than collapsing it to a space, so the source's original line layout survives round-trip. File reading itself (UTF-8, `readFile(path, "utf8")`) belongs to the orchestrator (Task 5), not this pure function — this module only ever receives an in-memory string.
**Done:** [ ] — check off when the task is complete

### Task 4: Plain-text import report builder
**What:** Builds and writes the FR-7 import report, mirroring `docx-import-report.ts`'s `buildDocxImportReport`/`writeDocxImportReport` shape and file-naming convention.
**Files:** New: `frontend/src/lib/models/plaintext/plaintext-import-report.ts`.
**Done when:** `buildPlainTextImportReport(input)` renders a fixed set of always-present sections — files processed (count), skipped/unconvertible content (folder-source non-`.txt` and hidden-file skip counts), and untitled/name-collision notes if any — and `writePlainTextImportReport(projectRoot, report)` persists it to `<projectRoot>/plaintext-import-report.txt`, matching the DOCX/Scrivener report's plain-text rendering style.
**Depends on:** none
**Estimate:** 2
**Notes:** Unlike DOCX (comments, tracked changes, images, footnotes) there is no rich-content category to report — keep the section list deliberately short rather than padding it with always-zero DOCX-specific fields.
**Done:** [ ] — check off when the task is complete

### Task 5: Plain-text import orchestrator
**What:** The single model-layer entry point (`importPlainTextProject`) tying source detection, conversion, and the report together into one call that produces a complete, valid destination GetWrite project, mirroring `import-docx-project.ts`'s orchestration order and error-signaling/cleanup conventions.
**Files:** New: `frontend/src/lib/models/plaintext/import-plaintext-project.ts`.
**Done when:** `importPlainTextProject({ sourcePath, projectRoot, name? })` (a) refuses — before any write — a `projectRoot` that already exists and is non-empty, via a new `PlainTextDestinationNotEmptyError` (its own class with plain-text-specific wording, not a reuse of the DOCX/Scrivener classes, per Stage-6.5 precedent) (FR-5); (b) auto-detects the source via Task 2, refusing a folder with no `.txt` file anywhere beneath it before any write (FR-4); (c) for a single-file source, creates one text resource named from the filename with its extension stripped (FR-6), converted via Task 3; (d) for a folder source, creates one resource per walked `.txt` file plus mirrored GetWrite folders, in the walk's own order (FR-2); (e) creates every resource via the existing bulk-create pattern (`writeResourceToFile` + `writeRevision(..., { isCanonical: true })`), which validates against `schemas.ts` before writing (FR-9); (f) writes the Task 4 report (FR-7); (g) rebuilds the destination project's inverted index, backlinks, and entity mention index from scratch (mirroring `rebuildIndexes` in `import-docx-project.ts`/`import-scrivener-project.ts`); (h) appends exactly one writing-log entry via the existing `appendWritingLogEntry` call (`writing-log.ts`) tagged `source: "plaintext"`, written last, after the index rebuild, reusing the same call site pattern `import-docx-project.ts` uses at its own orchestration step 8 (FR-8); and (i) on a fatal write-phase error, removes a run-created `projectRoot` the same way the DOCX/Scrivener orchestrators do, leaving a pre-existing empty `projectRoot` untouched.
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Estimate:** 5
**Notes:** Run the whole write phase inside `withIndexingSuspended` (`indexer-queue.ts`), mirroring the DOCX/Scrivener precedent, so no leftover incremental indexing work happens mid-import. FR-10 (fail-closed on a locked/keyless destination) needs no new code here: it is inherited for free from the same `writeResourceToFile`/`writeRevision`/storage-adapter write path the DOCX and Scrivener orchestrators already go through, which is why neither of those two has a dedicated FR-10 implementation task or test of its own — Task 12's integration test only needs to confirm the inherited behavior, not implement it. No project-type selection option (`--project-type`) is in scope — the spec's FRs never mention one, unlike DOCX's `--split-level`/`--project-type`; default to the `"blank"` project type unconditionally.
**Done:** [ ] — check off when the task is complete

### Task 6: Export the plain-text importer from the `@gw/core` barrel
**What:** Adds the new orchestrator, error classes, and source-detection function the CLI needs to the shared barrel the CLI consumes, mirroring the existing DOCX/Scrivener export blocks.
**Files:** `frontend/src/lib/core.ts`.
**Done when:** `importPlainTextProject`, `PlainTextDestinationNotEmptyError`, `NoTxtFilesFoundError`, and the `ImportPlainTextProjectOptions`/`ImportPlainTextProjectResult` types are exported from `core.ts`, grouped under a `// Plain-text import (CLI's \`project import-plaintext\` command)` comment matching the existing DOCX/Scrivener sections' style.
**Depends on:** Task 5
**Estimate:** 1
**Done:** [ ] — check off when the task is complete

### Task 7: CLI command — `project import-plaintext`
**What:** Registers the new CLI subcommand, mirroring `import-scrivener`'s and `import-docx`'s registration shape in `cli/src/commands/project.ts` (FR-1, FR-2, FR-3).
**Files:** `cli/src/commands/project.ts`.
**Done when:** `getwrite-cli project import-plaintext <source> [projectRoot] [-n, --name <name>]` is registered on the `project` subcommand, calls `runForTenant(projectRoot, () => importPlainTextProject({ sourcePath: source, projectRoot, name: options?.name }))`, logs a success summary (project root, folder/resource counts, report path) and exits `0` on success, and on failure `instanceof`-checks `PlainTextDestinationNotEmptyError` and `NoTxtFilesFoundError` to print their own message and exit `2` (mirroring the `import-docx`/`import-scrivener` catch blocks), falling back to a generic "Failed to import plain-text project:" message and exit `2` for any other error.
**Depends on:** Task 6
**Estimate:** 2
**Done:** [ ] — check off when the task is complete

### Task 8: Plain-text test fixtures
**What:** Committed `.txt` fixture files and a fixture folder tree for the unit, integration, and CLI-wiring tests below.
**Files:** New: `frontend/tests/fixtures/plaintext/` — at minimum a single standalone `.txt` file with a UTF-8 BOM and multiple blank-line-separated paragraphs (some containing an internal soft-wrap `\n`), and a `folder-source/` subtree with several `.txt` files, at least one nested subfolder, at least one non-`.txt` file to be skipped, and at least one hidden/dot file or folder to be skipped, ordered so a natural-sort assertion (e.g. "Chapter 2" before "Chapter 10") is meaningful.
**Done when:** The fixtures exist on disk, are committed, and are referenced (paths resolve) from the test files in Tasks 9-13.
**Depends on:** none
**Estimate:** 2
**Notes:** Mirrors `frontend/tests/fixtures/docx/` and `frontend/tests/fixtures/scrivener/`'s role as committed, hand-authored (not generated-at-test-time) fixtures.
**Done:** [ ] — check off when the task is complete

### Task 9: Unit tests — source detection and folder walk
**What:** Unit coverage for Task 2's `detectPlainTextSource`/`walkPlainTextFolder`.
**Files:** New: `frontend/tests/unit/plaintext-source-detection.test.ts`.
**Done when:** Tests cover: single-file detection; directory detection; `NoTxtFilesFoundError` thrown for a folder with no `.txt` anywhere beneath it, before any write; case-insensitive natural sort ordering files and subfolders together (not files-then-folders); a subfolder with no `.txt` beneath it pruned from `entries` but its skip counts still tallied; a hidden/dot entry skipped as one unit without being descended into; a non-`.txt` file skipped and counted. All pass.
**Depends on:** Task 2, Task 8
**Estimate:** 2
**Done:** [ ] — check off when the task is complete

### Task 10: Unit tests — plain-text-to-TipTap conversion
**What:** Unit coverage for Task 3's `convertPlainTextToTiptap`.
**Files:** New: `frontend/tests/unit/plaintext-txt-to-tiptap.test.ts`.
**Done when:** Tests cover: a leading UTF-8 BOM stripped before parsing; a blank line (and multiple consecutive blank lines) treated as a single paragraph separator; a single internal `\n` within a block joined into the same paragraph (not a new paragraph) as a `hardBreak`; an empty or all-blank input handled without throwing; multi-paragraph content producing one TipTap paragraph node per block in source order. All pass.
**Depends on:** Task 3, Task 8
**Estimate:** 2
**Done:** [ ] — check off when the task is complete

### Task 11: Unit tests — import report builder
**What:** Unit coverage for Task 4's `buildPlainTextImportReport`/`writePlainTextImportReport`.
**Files:** New: `frontend/tests/unit/plaintext-import-report.test.ts`.
**Done when:** Tests cover: a report with zero skips renders the fixed section headings with zero counts (never omits a section); a report with non-`.txt`/hidden-file skips renders the correct counts; `writePlainTextImportReport` persists the exact rendered text to `<projectRoot>/plaintext-import-report.txt`. All pass.
**Depends on:** Task 4
**Estimate:** 1
**Done:** [ ] — check off when the task is complete

### Task 12: Integration test — full orchestration pipeline
**What:** An integration test exercising `importPlainTextProject` end-to-end against the Task 8 fixtures, mirroring `frontend/tests/integration/docx-import.test.ts`'s structure (source-tree-untouched hash check, single-file mode, folder mode, writing-log entry assertion, destination-non-empty refusal, no-`.txt`-found refusal).
**Files:** New: `frontend/tests/integration/plaintext-import.test.ts`.
**Done when:** Tests cover, all against a real temp directory on disk (not an in-memory fake): (1) single-file import produces one resource named from the stripped filename, with paragraph structure preserved, a written report, and an index/backlinks/mention-index rebuild; (2) folder import produces one resource per `.txt` file plus mirrored folders in natural-sort order, with non-`.txt`/hidden entries skipped and reported; (3) `PlainTextDestinationNotEmptyError` thrown, before any write, for a non-empty pre-existing `projectRoot` (FR-5); (4) `NoTxtFilesFoundError` thrown, before any write, for a folder with no `.txt` file anywhere in it (FR-4); (5) exactly one writing-log entry is appended per import invocation, tagged `source: "plaintext"` (spying on `appendWritingLogEntry` the same way the DOCX test does), and that entry is excluded from daily-goal comparison at the read layer (FR-8); (6) the source fixture tree's own file hashes are unchanged after the import (source is never mutated); (7) persisted resource/sidecar/project-manifest output validates against `schemas.ts` (FR-9, exercised implicitly by the shared write path already enforcing it — assert no validation error is thrown, not that validation runs, since that internal mechanism isn't directly observable from this test). All pass.
**Depends on:** Task 5, Task 8
**Estimate:** 5
**Done:** [ ] — check off when the task is complete

### Task 13: CLI wiring-level test — `project import-plaintext` end-to-end
**What:** A wiring-level test that invokes the real CLI entry point (`main(argv)` from `cli/src/getwrite-cli.ts`) with real `project import-plaintext` argv, against the real Task 8 fixtures on the real filesystem, verifying the on-disk result — not a unit test of `importPlainTextProject` or any other isolated pure function in isolation. This is the required wiring-level test for this feature: it must exercise the actual CLI command-parsing and registration path (Task 7), not call the orchestrator directly.
**Files:** New: `cli/tests/project-import-plaintext.test.ts` (or added to the existing `cli/tests/project.test.ts`, following that file's existing `describe("getwrite-cli project:...")` grouping and its precedent of leaving the real orchestrator un-mocked — see that file's own comment: "everything else... stays real so the... tests below exercise the actual orchestrator against real fixtures/temp directories on disk").
**Done when:** A test builds a real `argv` array (`["node", "getwrite-cli", "project", "import-plaintext", <fixturePath>, <tempProjectRoot>, "--name", "My Import"]`), calls `await main(argv)`, and then asserts directly against the real filesystem at `<tempProjectRoot>` — `project.json` exists and is readable/valid, the expected number of resource files/sidecars exist, `plaintext-import-report.txt` exists at the project root, and a writing-log day file under `<tempProjectRoot>/meta/writing-log/` contains one entry tagged `source: "plaintext"` — with `process.exit`/`console.log` spied-and-restored the same way `cli/tests/project.test.ts` already does for the `import-docx`/`import-scrivener` commands, and with a second test asserting the folder-source form of the same command against the Task 8 `folder-source/` fixture. A third test asserts the CLI exits non-zero with the correct message for a non-empty pre-existing `projectRoot` (FR-5) invoked through `main(argv)`, not through calling `importPlainTextProject` directly. All pass.
**Depends on:** Task 7, Task 8
**Estimate:** 3
**Notes:** This task exists specifically to catch defects in how the real CLI entry point parses argv and constructs the options object handed to the orchestrator — the kind of defect a test that only calls `importPlainTextProject` with a hand-built, pre-shaped options object would never see. Do not weaken this task into another orchestrator-level test; `cli/tests/project.test.ts` is the existing, working precedent for the exact wiring shape to reuse (`main` import, `process.exit`/`console.log` spies, only `createProjectFromType` left mockable and everything else real).
**Done:** [ ] — check off when the task is complete

### Task 14: Full verification gate — typecheck, lint, test
**What:** Runs the project's standard verification gate across both affected workspaces before this feature is considered complete.
**Files:** none (verification only).
**Done when:** `pnpm --filter getwrite-frontend typecheck`, `pnpm --filter getwrite-frontend lint`, and `pnpm --filter getwrite-frontend test:ci` all pass with the new plain-text-import code included; `pnpm --filter getwrite-cli exec vitest run` (or the CLI workspace's equivalent single-pass test command) passes, including Task 13's new CLI wiring test. Any failure surfaced here is fixed before this feature is marked done, not deferred.
**Depends on:** Task 9, Task 10, Task 11, Task 12, Task 13
**Estimate:** 2
**Done:** [ ] — check off when the task is complete

## Summary
- Total tasks: 14
- Total estimated effort: 34 story points
- Critical path: Task 1/2/3/4 → Task 5 → Task 6 → Task 7 → Task 13 → Task 14 (Task 8's fixtures must also land before Tasks 9, 10, 12, 13 — it has no upstream dependency so it can run in parallel with Tasks 1-7)
- Risks:
  - Task 3 (txt-to-tiptap conversion): the spec resolves *that* a single `\n` is a soft wrap, not *how* it should render in TipTap; Task 3 makes an explicit implementation call (a `hardBreak` node, mirroring `rtf-to-tiptap.ts`'s existing `\line` handling) that should be confirmed against the product owner's intent before it ships, since it's a judgment call filling a gap the resolved Open Questions didn't cover.
  - Task 5 (orchestrator): the highest-effort task and the one every other write-path task depends on; a defect in its destination-cleanup-on-fatal-error logic would be the highest-blast-radius bug in this feature, mirroring the DOCX/Scrivener precedent's own highest-risk module.
  - Task 13 (CLI wiring-level test): this is new ground — neither the DOCX nor Scrivener importer has a dedicated CLI-entry-point wiring test of its own in `cli/tests/project.test.ts` beyond the `project:create`/`import-scrivener`/`import-docx` coverage already there (which follows the identical pattern this task reuses), so there is no prior "plain-text-shaped" precedent to copy verbatim — some adaptation risk in getting the argv/mocking shape exactly right on the first attempt.

## Next step

Once this task list is reviewed, the natural next step is to begin implementation with Task 1 (or hand Tasks 1-4, which have no dependencies on each other, to parallel sessions), working down the dependency order toward Task 14's gate. Confirm before implementation begins, or flag anything in the breakdown that should be revised first.
