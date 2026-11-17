# Tasks: Citations at compile, MVP (Feature 116)

Source spec: `specs/features/citations-at-compile.md` (FR-1..FR-26, US-1 to US-5; approved by the owner at Gate 3, 2026-11-14; OQ-3 to OQ-7 and OQ-9 to OQ-16 resolved and not reopened; OQ-1, OQ-2 and OQ-8 open by design, decided at Tasks 9 and 37). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 116. Depends on the shipped Features 101, 102, 103 and 108. Branch: `feat/citations-at-compile`; one PR. The module is "Citations", id `citations`, off by default. Measurements: `specs/features/citations-at-compile/experiments.md` (an index created by Task 1); each task records its results in `specs/features/citations-at-compile/experiments/task-<n>.md`, never directly in `experiments.md`, so tasks running in parallel never edit the same file; Task 54 links them at close-out.

Shape of the work:
- Engine feasibility (FR-1), Tasks 1 to 8: Task 1 creates the index and environment record; Task 2 records licence facts (a); Task 3 writes the 12-item fixture and harness for (b) and (f); Task 4 runs fidelity for Hayagriva (B) against citeproc-js as the test-only reference processor; Task 5 records runtime (c) for B; Task 6 records the Hayagriva WebAssembly build (e); Task 7 records bundle size (d) for B; Task 8 writes the table for B with a note on the reference processor. Engine pool changed (Owner, 2026-11-14, after Task 2): citeproc-js is dropped as a shipping candidate (the owner reads its licence as AGPL per its `package.json`); Hayagriva (B) is the ONLY engine candidate and D (hand-written formatter) is a fallback only if B is not accepted; citeproc-js is test-only, installed by the owner in the session scratchpad, never added to GetWrite and never distributed. Tasks 2, 4, 5, 6 and 7 need a candidate installed or a toolchain, so they are LEAD-RUN with owner install: the owner installs the package, the Rust toolchain or `wasm-pack` by `!` before the task starts, and no agent edits `package.json`, the lockfile or the toolchain (FR-2, FR-25). Engine delivery (Owner, 2026-11-15, after Task 9): the engine is vendored, not installed from a package. Task 55 (agent) writes the wrapper crate source under `tools/hayagriva-wasm/`; Task 56 (LEAD-RUN) builds it and checks the built WebAssembly, glue and licence files in under `frontend/src/lib/citations/engine/`. Because the validator allows dependencies only on lower numbers, they are numbered 55 and 56 and the lead MUST run them, in that order, before dispatching Task 32; Task 32 carries no forward Depends on.
- Task 9 is the FR-2 OWNER GATE (LEAD-RUN): the owner records "Decision: <engine, version>, <licence accepted>, <date>, <by>" and judges bundle size. Because only Task 1 and Task 54 edit `experiments.md`, the decision is written in `experiments/task-9.md` and linked from `experiments.md` at Task 54. Every engine-dependent task (32 to 46) depends on Task 9, directly or through a task that does.
- Work that does not need the engine proceeds in parallel with Tasks 1 to 9: FR-3 records (10, 11, 12), the contract (13), the module (14), field validation, mapper, core, route, client, editor and sidebar (15 to 21), citation collection and anchoring (22, 23), the compile option and its seam (24), the byte-identity test (25), the dialog switch and its wiring (26, 27), the pre-run check data reads, route and warning dialog (28 to 31). The engine adapter, the style and locale, the required-details table, rendering, bibliography, documents and the engine-dependent parts of the check start at Task 32.
- FR-12 (Task 36) returns its result to the owner; Task 37 is the OQ-8 decision point (LEAD-RUN) and gates only the PDF document (Task 42). The DOCX document (Task 41) depends on Task 36 and not on Task 37.
- The model side imports no React, JSX or JSON, and the engine is reached through one adapter module, `frontend/src/lib/citations/citation-engine.ts` (Task 32), so the FR-2 decision changes one file.
- Tasks 2, 4, 5, 6, 7, 9, 37, 51, 52, 53, 54 and 56 are LEAD-RUN (installs, builds, runs outside the sandbox from the main checkout, owner decisions); Task 55 is an agent task whose result is only checked at Task 56; Task 50 is documentation for the scribe and states no device result.
- Added after the execution run (Owner, Gate 5, 2026-11-15): Task 57 (experiment: PDF page-finding without text extraction), Task 58 (experiment: PDF font failure reproduction) and Task 59 (repair: lint ignore for the vendored engine and required-details wiring in the check route). They are numbered 57 to 59 because the validator allows dependencies only on lower numbers; the lead MUST run Tasks 57, 58 and 59 before dispatching Task 43, and Task 43 carries no forward Depends on them. Task 45 also gained a callback and a status role on the Task 20 editor (Owner, Gate 5, 2026-11-15). Task 60 (experiment: PDF font failure root cause) was added after Task 58 (Owner, Gate 5, 2026-11-15); the orchestrator runs it before Task 43's PDF work. After Task 60 the owner decided the fix (Owner, Gate 5, 2026-11-15): Task 61 (fix: PDF export faces from `.woff2` to `.woff`) and Task 62 (repair: remove machine-specific details from Task 60's record and test), both depending on Task 60; the lead runs Tasks 61 and 62 before Task 43's PDF work, and Task 43 carries no forward Depends on any of 57 to 62. Task 43's PDF work also gained space reservation for footer notes and an `onRender` layout-data pin (Owner, Gate 5, 2026-11-15).

Requirement traceability (every FR-1..FR-26 maps to at least one task; FR-25 is also an inherited rule of every code task):
- FR-1: 1, 2, 3, 4, 5, 6, 7, 8. FR-2: 9, 32. FR-3: 10, 11, 12, 14, 51. FR-4: 13, 14, 48. FR-5: 13, 15, 16. FR-6: 15, 17, 18, 48. FR-7: 20, 21, 35, 45. FR-8: 48. FR-9: 24, 26, 27. FR-10: 24, 25, 43. FR-11: 22, 23, 38, 41, 42. FR-12: 36, 37, 41, 42, 57. FR-13: 40. FR-14: 22, 34. FR-15: 28, 29, 30, 31, 44, 59. FR-16: 39. FR-17: 28, 43, 58, 60. FR-18: 24, 26, 33. FR-19: 26, 27. FR-20: 33, 46. FR-21: 18, 29, 47, 53. FR-22: 15, 24, 47. FR-23: 20, 26, 30, 49. FR-24: every task (no task adds a reference manager, Zotero sync, podcast or script format, citation or quote checking, a second style, `.csl` import, BibTeX or DOI import, citations in the entity compile dialog or in export, a project default style, a Markdown or plain-text citation form, a new resource type or a change to citation storage; a task that needs one stops and returns to the owner). FR-25: every code task. FR-26: 50, 51, 52, 53, 54.

Compact dependency graph (`a -> b` means b depends on a):
- 1 -> 2, 3, 5, 6; 2 -> 8, 33, 46; 3 -> 4; 4 -> 8; 5 -> 7; 6 -> 7; 7 -> 8; 8 -> 9; 9 -> 32, 33, 36; 10 -> 14; 11 -> 17; 12 -> 23, 24, 36; 13 -> 14, 15, 16, 19, 20, 22, 24, 26, 30, 32; 14 -> 21, 24, 25, 26, 48, 50; 15 -> 17; 16 -> 32, 35; 17 -> 18, 48; 18 -> 19, 47; 19 -> 20; 20 -> 21; 21 -> 45, 48, 49, 51; 22 -> 23, 28, 34, 38?; 23 -> 38; 24 -> 25, 26, 43; 26 -> 27, 31; 27 -> 48, 49, 51; 28 -> 29, 44; 29 -> 31, 47; 30 -> 31; 31 -> 49, 50, 51; 32 -> 34, 35, 36, 38; 33 -> 35, 36, 38, 46; 34 -> 38; 35 -> 39, 44, 45, 50; 36 -> 37, 41, 57; 37 -> 42; 38 -> 39, 40, 41, 42; 39 -> 43; 40 -> 41, 42; 41 -> 43; 42 -> 43, 58; 58 -> 60; 60 -> 61, 62; 43 -> 47, 50, 51; 44 -> 51, 59; 45 -> 49, 51; 46 -> 50, 51; 47 -> 52, 53; 48 -> 52; 49 -> 52; 51 -> 52, 53; 50, 52, 53 -> 54.
- (Task 22 reaches Task 38 through Task 23; there is no direct edge, the `?` above marks that.)
- (Tasks 57, 58, 59, 60, 61 and 62 have no edge to Task 43: they run before Task 43 by the lead's order (Task 60 is run by the orchestrator), as with Tasks 55 and 56 before Task 32.)

Parallel waves the orchestrator may run (LEAD-RUN tasks 2, 4, 5, 6, 7, 9, 37, 51, 52, 53 and 54 are never run by the orchestrator; they sit in their wave only to show when the lead can run them):
- Wave 1: {1, 10, 11, 12, 13}.
- Wave 2: {2, 3, 5, 6, 14, 15, 16, 22, 30}.
- Wave 3: {4, 7, 17, 23, 24, 28}.
- Wave 4: {8, 18, 25, 26, 29}.
- Wave 5: {9, 19, 27, 31}.
- Wave 6: {20, 32, 33}.
- Wave 7: {21, 34, 35, 36, 46}.
- Wave 8: {37, 38, 44, 45, 48, 57}.
- Wave 9: {39, 40, 49, 59}.
- Wave 10: {41, 42}.
- Wave 11: {58} (Task 43 waits for Tasks 57 to 62 by the lead's order, not by Depends on).
- Wave 12: {60} (the orchestrator runs it before Task 43).
- Wave 13: {61, 62} (the lead runs them before Task 43's PDF work; Task 61 edits `CompilePDFDocument.tsx`, so it also precedes Task 43's edit of that file).
- Wave 14: {43}.
- Wave 15: {47, 50, 51}.
- Wave 16: {52, 53}.
- Wave 17: {54}.

Hot files and the only tasks allowed to edit them (file conflicts for wave planning):
- `specs/features/citations-at-compile/experiments.md`: Task 1 creates it, Task 54 closes it; every other task writes only its own `experiments/task-<n>.md`.
- `frontend/components/common/CompilePreviewModal.tsx`: Task 26, then Task 31 by dependency. `frontend/components/Layout/ShellModalCoordinator.tsx`, `frontend/components/Layout/AppShell.tsx`, `frontend/components/Start/StartPage.tsx`, `frontend/src/lib/compile/run-compile-and-download.ts`: Task 27 only.
- `frontend/src/lib/models/compile-core.ts`: Task 24, then Task 43 by dependency. `frontend/src/lib/export/types.ts`, `frontend/app/api/compile/pdf/route.ts`, `frontend/app/api/compile/docx/route.ts`, `frontend/app/api/compile/markdown/route.ts`, `frontend/app/api/compile/text/route.ts`: Task 24 only (Task 43 edits the cores, not these).
- `frontend/src/lib/models/modules/manifest.ts`, `frontend/src/lib/models/modules/registry.ts`, `frontend/components/Modules/ModuleSwitchSection.tsx`, `frontend/tests/unit/module-registry.test.ts`, `frontend/tests/moduleSwitchSection.test.tsx`: Task 14 only.
- `frontend/components/Sidebar/MetadataSidebar.tsx`: Task 21 only. `frontend/components/Sidebar/CitationFieldsSection.tsx`: Task 21, then Task 45. `frontend/components/Sidebar/CitationFieldsEditor.tsx`: Task 20, then Task 45 (the `onDraftChange` prop and `role="status"`; Owner, Gate 5, 2026-11-15).
- `frontend/src/lib/citations/citation-engine.ts`: Task 32, then Task 34. `frontend/src/lib/models/citations-precheck-core.ts`: Task 28, then Task 44. `frontend/tests/unit/citations-precheck-core.test.ts`: Task 28, Task 44, then Task 45 (turns Task 44's `it.skip` into `it`). `frontend/app/api/citations/check/route.ts` and `frontend/tests/unit/citations-check-route.test.ts`: Task 29, then Task 59. `frontend/eslint.config.mjs`: Task 59 only.
- `frontend/src/lib/export/CompileDocxDocument.ts`: Task 41 only. `frontend/src/lib/export/CompilePDFDocument.tsx`: Task 42, then Task 61 (the four font face paths only; Owner, Gate 5, 2026-11-15), then Task 43 by the lead's order (the `onRender` prop; Owner, Gate 5, 2026-11-15). `frontend/tests/unit/citations-pdf-font-failure.test.ts`: Task 58, then Task 61. `frontend/tests/unit/citations-pdf-font-root-cause.test.ts`: Task 60, then Tasks 61 and 62 (Task 61 first by the lead's order; Task 62 edits only its Python lookup). `specs/features/citations-at-compile/experiments/task-60.md`: Task 60, then Task 62.
- `docs/`, `frontend/CLAUDE.md`, root `CLAUDE.md`, `frontend/components/project-types/ProjectTypeEditorForm.tsx` and `frontend/tests/ProjectTypeEditorForm.test.tsx`: Task 50 only.

**Builds and devices:** `next build`, `pnpm build:native`, `pnpm test:e2e`, Storybook build, Electron packaging and every real-browser or device run happen only from the main checkout, outside the command sandbox, by the lead with the owner. No orchestrator task runs them; a worktree cannot run `next build` or `build:native`. Tasks that write a story check only that it typechecks and lints.

**What the orchestrator cannot verify:** the engine in the Next.js server route, the browser build, the Electron bundle and the static export (Task 5), bundle size (Task 7), the inlining of new client modules (Task 51), the packaged desktop run with the network off (Task 52), the hosted web run (Task 53), a DOCX opened in a word processor, and screen-reader use. For these the orchestrator verifies only what the task's Done when names (tests with fakes, typecheck, lint) and reports the rest as not run. Unit tests with fakes are never evidence about a runtime or a device.

**New dependencies:** the engine package or WebAssembly toolchain is installed by the owner, never by an agent, before the task that needs it (Tasks 2, 4, 5, 6, 7 and 56; the engine itself is vendored, Tasks 55 and 56). A task that finds it needs any other dependency stops and returns to the owner. No agent edits `package.json`, a lockfile or the toolchain.

**Electron worker constraint:** every task whose Files include anything under `frontend/src/lib/models/`, `frontend/src/lib/core.ts`, `cli/` or `electron/` MUST also run `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`) and `pnpm --filter getwrite-cli typecheck`, and record each as run or not run. A bare frontend `tsc` is not accepted as evidence.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one where the Files list names one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions) and `docs/standards/code-documentation.md`. Every catch follows `docs/standards/failure-visibility.md` (a failed read of a Source or sidecar, an engine failure or a style-load failure never renders as "no citations" or as an empty bibliography; the failed and the empty outcomes never share a return value). Boundary rules follow `docs/standards/security.md` (project id, resource id, reference type, field values, style id and the citations option validated, no client-supplied path, no echo of client input, a URL stored and printed as text and never fetched). The storage context is established as `docs/standards/storage-context.md` requires. Read a component's source and stories before using any of its props. UI follows `docs/standards/accessibility.md` and `docs/standards/storybook-implementation.md`; no red, no colour alone.
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run `pnpm typecheck` and `pnpm lint` on touched files. A suite not run is reported as not run, never as passing.
- Write no cause that no experiment separated. A statement in the spec marked READ or INFERRED is a reading until its test runs.
- The model side imports no React, JSX or JSON and reaches `node:*` only through the storage adapter; the engine is reached only through the adapter module.
- Each task records its results in its own `specs/features/citations-at-compile/experiments/task-<n>.md` where its Files list names one.
- Implementors do not commit and do not push; the orchestrator commits.

### Task 1: Experiments index and environment record
**What:** Create the experiments index with fixed headings and the environment record, so every later task can write to its own file.
**Files:** `specs/features/citations-at-compile/experiments.md` (new; index with fixed headings Environment, Engine feasibility (FR-1), Decision (FR-2), Non-engine inventory (FR-3), Footnote placement (FR-12), Runs (FR-26), Not verified, Acceptance; edited by this task and by Task 54 only), `specs/features/citations-at-compile/experiments/task-1.md` (new; this task's results only)
**Done when:** `experiments.md` exists with the headings above, each saying which task file will fill it, and an environment record (node version, pnpm version, commit, branch, the commands that produced them); `experiments/task-1.md` records the same observed values and states that no engine is installed at this point; no production file is edited.
**Depends on:** none
**Estimate:** 2
**Notes:** Index only; measurements go to the per-task files. The Decision heading says the owner's decision is written in `experiments/task-9.md` and linked at Task 54 (the spec names `experiments/task-9.md` as the record; one writer per file, owner-approved at Gate 4).
**POS:** task_9139f94a
**Done:** [x]

### Task 2: FR-1 (a): licence facts from the upstream files
**What:** Record the licence facts of the candidates, the bundled style and the bundled locale, copied from upstream files at pinned versions, with the compatibility questions stated as questions for a legal read.
**Files:** `specs/features/citations-at-compile/experiments/task-2.md` (new; this task's results only)
**Done when:** `experiments/task-2.md` records, for citeproc-js (CPAL-1.0 option only), Hayagriva, the Chicago notes and bibliography style and the en-US locale, the pinned version or commit, the URL, the copied licence text and the attribution each asks for, each as an observed fact with the command or fetch that produced it; the compatibility of CPAL-1.0 and of CC BY-SA 3.0 with FSL-1.1-ALv2 is written as a question for a legal read and not answered; no recommendation is made.
**Depends on:** 1
**Estimate:** 3
**Notes:** Record already made by the lead (see `experiments/task-2.md`); after it the owner dropped citeproc-js as a shipping candidate on 2026-11-14 (reference processor only), so its CPAL-1.0 questions no longer apply to shipping and the licences to decide at Task 9 are Hayagriva's, the style's and the locale's. The tick state is unchanged. LEAD-RUN with owner install: the owner places the pinned package or checkout of each candidate under the scratchpad (an owner step by `!`) before this task; no agent installs anything or edits `package.json`. Network fetches of upstream LICENSE files are done by the lead if the sandbox blocks them.
**POS:** task_361b66fd
**Done:** [x]

### Task 3: FR-1 (b) and (f): fidelity fixture and harness
**What:** Write the 12-item CSL-JSON fixture and the script that renders it through a named candidate in a note style and an author-date style and lists differences against the reference processor.
**Files:** `scripts/citations-fidelity-fixture.json` (new), `scripts/citations-engine-fidelity.mjs` (new), `specs/features/citations-at-compile/experiments/task-3.md` (new; this task's results only)
**Done when:** The fixture has at least 12 items with at least 3 per MVP type (book, article-journal, webpage, interview), a repeated citation of one Source, and a locator of each of page, paragraph, line and a timestamp as literal text; the script takes a candidate name and style id, renders through that candidate when its package is present, and otherwise exits with a message naming the missing package, never a pass; it writes every difference verbatim with only whitespace and markup normalised; `experiments/task-3.md` records the fixture's item count, per-type counts and the command, and that the script has not been run against any engine.
**Depends on:** 1
**Estimate:** 5
**Notes:** Interviewee maps to `author` (INFERRED in the spec); the fixture includes an interview so Task 4 checks it. The script imports candidates dynamically so it runs without installing anything. Nothing here is a fidelity result.
**POS:** task_225c32db
**Done:** [x]

### Task 4: LEAD-RUN: FR-1 (b) and (f) fidelity run for B against the reference processor
**What:** Run the Task 3 harness for Hayagriva (B), compared against citeproc-js used as the test-only reference processor, in one note style and one author-date style, and record every difference and the formatting, locator and repeated-citation behaviour.
**Files:** `specs/features/citations-at-compile/experiments/task-4.md` (new; this task's results only)
**Done when:** `experiments/task-4.md` records, for B and each of the two styles, the command, the reference processor (citeproc-js, test-only) and its version, the list of differences verbatim (or "no difference"), whether the output carries formatting runs such as italics, the locator and label handling for each locator type, the repeated-citation behaviour, whether notes are numbered once across a manuscript (OQ-16) and whether the style or locale supplies a bibliography heading (OQ-12), and how an interviewee is mapped; nothing is judged pass or fail by the agent.
**Depends on:** 3
**Estimate:** 5
**Notes:** LEAD-RUN with owner install: the owner installs B and its toolchain by `!` before this task, and citeproc-js in the session scratchpad only as the test-only reference processor (never added to GetWrite, never distributed; owner decision 2026-11-14). A citeproc-js run of its own is the reference output, not a candidate result. The lead runs it and records observations only. This task is not ticked and its substance is unchanged beyond B being the only candidate; an existing lead record `experiments/task-4.md` is left as it stands.
**POS:** task_8f242109
**Done:** [x]

### Task 5: LEAD-RUN: FR-1 (c) runtime in four runtimes with the network disabled
**What:** Run B (Hayagriva compiled to WebAssembly, the only candidate) in the Next.js server route, the browser build, the Electron bundle and the Android static export build loaded in the browser, with the network disabled.
**Files:** `specs/features/citations-at-compile/experiments/task-5.md` (new; this task's results only)
**Done when:** `experiments/task-5.md` records for B and each of the four runtimes: ran or failed, the error text on failure, whether any Node-only API or network request was used, and the build commit and time; the Android static export is built with `pnpm build:native` and loaded in the browser build of the export only, and no device run is claimed; probe code is throwaway and removed after the run.
**Depends on:** 1
**Estimate:** 5
**Notes:** LEAD-RUN with owner install, outside the sandbox from the main checkout (builds fail in worktrees). Covers B only: citeproc-js is not a shipping candidate and is not run in these runtimes. The probe is not committed. No agent edits `package.json` or the lockfile.
**POS:** task_b12420f0
**Done:** [x]

### Task 6: LEAD-RUN: FR-1 (e) Hayagriva to WebAssembly build
**What:** Record whether a pinned Hayagriva commit builds to WebAssembly from a clean checkout and what bindings, input format and output formatting result.
**Files:** `specs/features/citations-at-compile/experiments/task-6.md` (new; this task's results only)
**Done when:** `experiments/task-6.md` records the pinned commit, the documented build command and its result from a clean checkout, the toolchain versions, the bindings produced, whether a CSL-JSON item is accepted directly or converted and by what, and whether the output carries formatting a PDF and DOCX renderer can use, each as observed with the command that produced it, or "failed" with the error text.
**Depends on:** 1
**Estimate:** 5
**Notes:** LEAD-RUN with owner install of the Rust toolchain and `wasm-pack` by `!`. If the build fails, the failure text is the record; B is then reported as not buildable, not dropped.
**POS:** task_77863b28
**Done:** [x]

### Task 7: LEAD-RUN: FR-1 (d) bundle size
**What:** Record the added bytes of B, its bundled style and locale in the server bundle, `frontend/out` and the Electron package.
**Files:** `specs/features/citations-at-compile/experiments/task-7.md` (new; this task's results only)
**Done when:** `experiments/task-7.md` records, for B (if it ran in Task 5) and each of the three artefacts, the baseline and with-candidate byte counts, raw and gzipped, and the commands that measured them; no ceiling is set (OQ-2).
**Depends on:** 5, 6
**Estimate:** 3
**Notes:** LEAD-RUN with owner install, outside the sandbox from the main checkout. If B failed in Task 5 it is recorded as "not measured" with the reason. Covers B only; citeproc-js is not measured.
**POS:** task_6bb81292
**Done:** [x]

### Task 8: FR-1 comparison table for B
**What:** Write the single table of B on FR-1 (a) to (f) from the recorded task files, with a note naming citeproc-js as the test-only reference processor, and no recommendation.
**Files:** `specs/features/citations-at-compile/experiments/task-8.md` (new; this task's results only)
**Done when:** `experiments/task-8.md` holds one table with rows (a) to (f) and a B column, each cell copied from or linking to `experiments/task-2.md`, `task-4.md`, `task-5.md`, `task-6.md` or `task-7.md`, a cell with no record reading "not measured"; a reference note states that citeproc-js was used only as the test-only reference processor of (b), is not a shipping candidate (owner decision 2026-11-14) and its licence record in `experiments/task-2.md` is listed for completeness only; the licence compatibility questions for B, the style and the locale are repeated as questions; D (hand-written formatter) is named as a fallback only if B is not accepted; no cell is judged pass or fail and no engine is recommended.
**Depends on:** 2, 4, 7
**Estimate:** 2
**Notes:** Copy values, do not re-derive them; if two records disagree, list both.
**POS:** task_59887691
**Done:** [x]

### Task 9: OWNER GATE (LEAD-RUN): FR-2 engine and licence decision
**What:** The owner records whether Hayagriva (B, the only candidate) is accepted, the licence decision and the bundle-size judgement.
**Files:** `specs/features/citations-at-compile/experiments/task-9.md` (new; this task's results only)
**Done when:** `experiments/task-9.md` contains the line "Decision: <engine, version>, <licence accepted>, <date>, <by>" written by the owner, the owner's bundle-size judgement against the Task 7 figures (OQ-2) and the owner's licence acceptance for B, the bundled style and the locale (OQ-1); or it records that B was not accepted, in which case the work stops and returns to the owner before any hand-written formatter (D) is built.
**Depends on:** 8
**Estimate:** 1
**Notes:** OWNER GATE, LEAD-RUN. No agent decides the engine, treats the recorded facts as a legal opinion or proceeds on a licence the owner has not accepted. The engine is vendored (Owner decision 2026-11-15, Tasks 55 and 56), run by the lead before Task 32. Every engine-dependent task depends on this one.
**POS:** task_feb4b05a
**Done:** [x]

### Task 10: FR-3 (a), (b) before, (h): module readers, switch label and a citation in a Source body
**What:** Record every reader of module state, what the Modules screen shows for an entry with no view, and whether a citation can be made in a Source body.
**Files:** `specs/features/citations-at-compile/experiments/task-10.md` (new; this task's results only)
**Done when:** `experiments/task-10.md` records, each as an observed value with the command or test that produced it: (a) every reader of `config.modules` and every production call of `isModuleEnabled`, `useModuleEnabled`, `useModuleViews`, `registry.enabledViews` and `registry.indexSteps`, and whether a fourth module with `defaultEnabled: false` and no view needs a change in any of them; (b) the label, and the on and off messages, `ModuleSwitchSection.tsx` shows today for an entry with no `view` (the "after" is recorded by Task 14); (h) whether a citation can be made in a Source body, by making one in a probe, and that a compiled Source's citations are read like any other resource's; no cause is written as a cause.
**Depends on:** none
**Estimate:** 5
**Notes:** Reads and throwaway probes only; probes live in the scratchpad and no production file is edited. Read `frontend/src/lib/models/modules/registry.ts`, `frontend/components/Modules/ModuleSwitchSection.tsx`, `frontend/components/Modules/useModuleEnabled.ts`, `frontend/components/Modules/useEnabledModuleViews.ts`, `frontend/src/lib/models/modules/manifest.ts`, `frontend/components/Editor/TipTapEditor.tsx` (citation control slot around lines 934-940) and `frontend/src/lib/export/section-loader.ts`.
**POS:** task_3473313a
**Done:** [x]

### Task 11: FR-3 (c), (d): sidecar writers and a new top-level key
**What:** Record whether a new top-level key on a Source sidecar survives every sidecar writer and whether the metadata schema sweeps touch it.
**Files:** `specs/features/citations-at-compile/experiments/task-11.md` (new; this task's results only)
**Done when:** `experiments/task-11.md` records, on a Source carrying a `citationFields` key, as observed values with the command or probe that produced each: whether the key survives `mutateSidecar`, `updateSidecar`, `clearKeys`, copy, duplicate, Trash and restore, revision restore and each importer; whether `SourceResourceSchema` parse strips an unknown key (`frontend/src/lib/models/schemas.ts` near line 715); whether `forEachUserMetadata` and the options migration touch the key; which paired-device gate classifies a sidecar write (FR-21); any behaviour that loses a stored value is listed first for the owner.
**Depends on:** none
**Estimate:** 5
**Notes:** Probes live in the scratchpad; no production file is edited. Task 17 reads this record and returns any value-losing behaviour to the owner rather than working round it.
**POS:** task_8dc7cfdc
**Done:** [x]

### Task 12: FR-3 (e), (f): what compile and annotation marks give PDF and DOCX; PDF byte reproducibility
**What:** Record what the section loader and annotation marks provide to PDF and DOCX and whether PDF bytes are reproducible with a fixed creation date.
**Files:** `specs/features/citations-at-compile/experiments/task-12.md` (new; this task's results only)
**Done when:** `experiments/task-12.md` records, as observed values with the command or probe that produced each: (e) what `loadTextSections`, `loadResourceContent` and the TipTap document give a compile today, and where an `annotation` mark's text and the end of its range are available for PDF and DOCX; (f) whether PDF bytes are identical for one input compiled twice with a fixed creation date, which decides how Task 25 compares PDF (raw bytes or ordered per-page extracted text); and the TipTap node types a compile would meet.
**Depends on:** none
**Estimate:** 5
**Notes:** Probes in the scratchpad. Read `frontend/src/lib/export/section-loader.ts`, `frontend/src/lib/models/compile-core.ts`, `frontend/src/lib/export/CompilePDFDocument.tsx`, `frontend/src/lib/export/CompileDocxDocument.ts` and `frontend/tests/unit/compile-citation-byte-identity.test.ts`. FR-3 (g) is recorded in Task 51 (build).
**POS:** task_17b98ecc
**Done:** [x]

### Task 13: Contract: citations types, constants and result types
**What:** Define the inert shared contract: module id and label, reference types, field names and limits, the citations option, style ids, marker format and messages.
**Files:** `frontend/src/lib/models/citations-types.ts` (new), `frontend/tests/unit/citations-types.test.ts` (new), `frontend/tests/unit/citations-core-import-graph.test.ts` (new)
**Done when:** `citations-types.ts` exports `CITATIONS_MODULE_ID = "citations"`, `CITATIONS_MODULE_LABEL = "Citations"`, the four reference types `book`, `article`, `web-page`, `interview` with their CSL item types (`book`, `article-journal`, `webpage`, `interview`), per-type field name lists and limits (person `{ family, given }` or `{ literal }`, up to 50 per role; text up to 500 characters; date pattern YYYY, YYYY-MM or YYYY-MM-DD), the `citationFields` key name, the typed optional compile option (`{ styleId }`, absent means today), the bundled style id list (one entry, Chicago notes and bibliography, en-US), the marker builder for `[citation incomplete: <Source name>]` with the literal "unnamed Source", the stated reasons "Open the project to turn on citations" and "Citations are available for PDF and DOCX", and the typed result unions for the check and the failed outcomes; it imports no React, JSX or JSON; `citations-core-import-graph.test.ts` asserts every `frontend/src/lib/models/citations-*.ts` file imports no React, JSX, JSON or `node:*` module (covers later files as they appear); the tests pass and `pnpm typecheck`, `pnpm lint` and both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** none
**Estimate:** 3
**Notes:** No behaviour here. Wording constants are worded exactly as FR-9, FR-16 and OQ-10, OQ-11, OQ-13 state them.
**POS:** task_2fb9f640
**Done:** [x]

### Task 14: Module declaration and optional manifest label
**What:** Declare the `citations` module in the manifest with an optional `label` added to `ModuleManifestEntry` and read by the Modules screen, and pin the switch behaviour.
**Files:** `frontend/src/lib/models/modules/manifest.ts`, `frontend/src/lib/models/modules/registry.ts`, `frontend/components/Modules/ModuleSwitchSection.tsx`, `frontend/tests/unit/module-registry.test.ts`, `frontend/tests/moduleSwitchSection.test.tsx`, `frontend/tests/unit/project-type-draft-service.test.ts`, `frontend/tests/unit/project-type-draft-service-hook.test.tsx`, `specs/features/citations-at-compile/experiments/task-14.md` (new; this task's results only)
**Done when:** Tests first, then green: `MODULE_MANIFEST` has an entry with id `citations`, `defaultEnabled: false`, empty `indexSteps`, no `view`, and `label: "Citations"`; `ModuleManifestEntry` gains an optional `label?: string` and no existing entry changes; `ModuleSwitchSection.tsx` reads `module.view?.label ?? module.label ?? module.id` and that label drives its on and off messages, pinned by tests for an entry with a view, with only a `label`, and with neither; the Modules screen shows a switch that reads off for a project with no entry and writes only its own entry through the existing `PUT /api/project/modules` path; nothing writes an entry automatically; with `config.modules.sources` off and `citations` on, `isModuleEnabled("citations")` is true; the project type draft lists the module as not set, like claims; no new slot kind and no new route; `experiments/task-14.md` records the "after" label and messages (FR-3 (b)); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 10, 13
**Estimate:** 3
**Notes:** FR-3 requires the inventory (Task 10) before a behaviour change merges, hence the dependency. If Task 10 shows another reader needs a change, stop and return to the owner. Only this task edits these module files.
**POS:** task_8c108254
**Done:** [x]

### Task 15: Citation fields validation (pure)
**What:** Validate a `citationFields` value: reference type, per-type fields, people, dates, text limits, unknown keys.
**Files:** `frontend/src/lib/models/citations-fields-validation.ts` (new), `frontend/tests/unit/citations-fields-validation.test.ts` (new)
**Done when:** Tests first, then green, each pinned by its own test: each of the four types accepts its fixed fields and an incomplete value (every field optional at the write boundary); an unknown reference type is refused; an unknown key is refused; a person is `{ family, given }` or `{ literal }` and 51 people in a role is refused; text of 501 characters is refused; a date matches YYYY, YYYY-MM or YYYY-MM-DD only, and the accessed date likewise; a URL is accepted as text and a script or markup string is stored as text, never interpreted; a non-string is refused; the refusal text is identical on every path and does not echo the input; the file imports no React, JSX, JSON or engine (covered by Task 13's import-graph test); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 13
**Estimate:** 5
**Notes:** Pure function, no I/O. Validates before any lock or write; Task 17 calls it first.
**POS:** task_2e69554c
**Done:** [x]

### Task 16: CSL-JSON mapper (pure)
**What:** Map a validated `citationFields` value to a CSL-JSON item with no engine, React or Redux import.
**Files:** `frontend/src/lib/models/citations-csl-mapper.ts` (new), `frontend/tests/unit/citations-csl-mapper.test.ts` (new)
**Done when:** Tests first, then green: book maps to `book`, article to `article-journal`, web-page to `webpage`, interview to `interview`; people map to `author`, `editor` or `interviewer` as FR-5 states (an interviewee to `author`, as Task 4 observed), `{ literal }` maps to a CSL literal name; date to `issued` and accessed to `accessed` as date-parts of the length given (a partial date stays partial); place to `publisher-place`, a container to `container-title`, URL to `URL`; a missing optional field is omitted, not emitted empty; the Source's id is carried as the item id; the output is a plain object and a field value is never interpreted as markup; the file imports no React, JSX, JSON or engine (covered by Task 13's import-graph test); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 13
**Estimate:** 3
**Notes:** The interviewee mapping is INFERRED in the spec; if Task 4 recorded otherwise, stop and return to the owner. The mapper is testable before the engine is chosen.
**POS:** task_d11c27c9
**Done:** [x]

### Task 17: Citation fields core (read and write)
**What:** Add the one core function that validates and writes a Source's `citationFields` through `mutateSidecar` touching only its own key, and a read that writes nothing.
**Files:** `frontend/src/lib/models/citations-fields-core.ts` (new), `frontend/tests/unit/citations-fields-core.test.ts` (new)
**Done when:** Tests first, then green: a write validates (Task 15) before any lock or write and touches only the `citationFields` key; the project root comes from a validated `projectId` and the Source from a validated `resourceId`, with no path argument; a resource that is not a Source is refused; a read writes nothing (asserted by a write spy) and a failed read returns a distinct failed outcome, never "no fields"; a locked project rethrows the existing locked-access error; a Source with a custom field named like each citation field keeps that custom field unchanged and the citation value is not in `userMetadata`; the survival of the key through each writer follows `experiments/task-11.md` and any value-losing behaviour is returned to the owner; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 11, 15
**Estimate:** 5
**Notes:** Model it on `claims-list-core.ts` and `annotations-core.ts` for locked and per-resource failure behaviour. Reading `experiments/task-11.md` is required before writing the tests.
**POS:** task_faaaa1de
**Done:** [x]

### Task 18: Citation fields route
**What:** Add the API route that reads and writes a Source's citation fields, sitting in the storage context.
**Files:** `frontend/app/api/citations/fields/route.ts` (new), `frontend/tests/unit/citations-fields-route.test.ts` (new)
**Done when:** Tests first, then green: the route runs inside `withStorageContext`, takes `projectId` and `resourceId` and no path, rejects a malformed id, a malformed body and an unknown reference type with the identical refusal text and without echoing client input, returns the stored fields and a distinct failed result for fake cores, fails closed on a locked project with the existing locked behaviour, is classified for the paired-device check by the same gate as every other `/api` route (a case added to the existing classification test or asserted by the new test, which one is recorded), and adds no paired-device limit switch; a tenant-scoping case shows a hosted write touches only the signed-in tenant's project; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 17
**Estimate:** 3
**Notes:** Follow `frontend/app/api/claims/route.ts` and `frontend/tests/unit/claims-route.test.ts`. No native backend is added here (Android is not claimed; see Open Questions).
**POS:** task_2df366de
**Done:** [x]

### Task 19: Citation fields client
**What:** Add the client function that calls the route and returns the typed result.
**Files:** `frontend/src/lib/api/citation-fields.ts` (new), `frontend/tests/unit/citation-fields-transport.test.ts` (new)
**Done when:** Tests first, then green: the client returns the stored fields, maps a thrown fetch or non-ok response to a distinct failed result (never "no fields"), rethrows the locked-access error, and sends only `projectId`, `resourceId` and the validated fields; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 13, 18
**Estimate:** 2
**Notes:** Follow `frontend/src/lib/api/claims.ts` and `frontend/tests/unit/claims-transport.test.ts`.
**POS:** task_709eb691
**Done:** [x]

### Task 20: Citation fields editor component
**What:** Build the presentational editor with the reference type choice and the fixed fields of the chosen type, showing a failed read and a failed save, with a slot for the "still needs" line.
**Files:** `frontend/components/Sidebar/CitationFieldsEditor.tsx` (new), `frontend/tests/component/CitationFieldsEditor.test.tsx` (new), `frontend/stories/Sidebar/CitationFieldsEditor.stories.tsx` (new)
**Done when:** Tests first, then green: a reference type choice of the four types; the fixed fields of the chosen type with accessible names and the limits of Task 13; a person entered as family and given or as an organisation; saving calls the client of Task 19 with the validated fields; opening the editor writes nothing; a failed read is shown in `role="alert"` and not as empty fields; a failed save is shown in `role="alert"` and a success in `role="status"`; the "still needs" line is a prop rendered as text and absent when not given; operable by keyboard alone; axe passes; no red, state in text; a story per state is written after reading the stories of `SourceAttachmentsPanel`; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 13, 19
**Estimate:** 5
**Notes:** Presentational with props for data and callbacks, except the save which uses the client. Read `frontend/components/Sources/SourceAttachmentsPanel.tsx` and its stories before using any prop of a shared control.
**POS:** task_0a5f974a
**Done:** [x]

### Task 21: Sidebar section and module gating
**What:** Mount the editor in the metadata sidebar for a Source while the module is on, independent of the Sources switch.
**Files:** `frontend/components/Sidebar/CitationFieldsSection.tsx` (new), `frontend/components/Sidebar/MetadataSidebar.tsx`, `frontend/tests/component/CitationFieldsSection.test.tsx` (new)
**Done when:** Tests first, then green: the section shows for a Source while `isModuleEnabled("citations")` is true and not otherwise; it is not offered on a text, image or audio resource or a folder; with `config.modules.sources` off and `citations` on it still shows; with the module off nothing is written, rewritten or deleted and switching it on again shows the same stored values; the section writes nothing on open; on the Android runtime (`NEXT_PUBLIC_GETWRITE_RUNTIME` native) with the module on, the section shows the sentence "Citation fields can be edited on desktop and web" and no inputs, and makes no read or write request (a failure must not render as absence), pinned by a test that sets the native runtime; the existing sidebar tests pass unmodified; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 14, 20
**Estimate:** 3
**Notes:** Model on `SourceAttachmentsSection.tsx`, which already ignores the Sources switch. Only this task edits `MetadataSidebar.tsx`.
**POS:** task_76c25905
**Done:** [x]

### Task 22: Citation collection and locator resolution (pure)
**What:** Collect the citations of a resource from its annotations under the FR-11 definition and resolve each citation's locator.
**Files:** `frontend/src/lib/models/citations-collect.ts` (new), `frontend/tests/unit/citations-collect.test.ts` (new)
**Done when:** Tests first, then green, each pinned by its own test: an annotation whose `target.sourceId` is not the resource it sits in is a citation; an excerpt (a target with `excerptId`, which targets its host Source) is never a citation; a Source citing itself is left out; an annotation with no target is not a citation; a resource left out of the compile contributes no citation; a citation's own locator wins, and only if it has none an excerpt citation uses the excerpt's locator read from the excerpt annotation; page, paragraph and line are returned as CSL label kinds and a timestamp as literal text flagged never to be a label; a locator value is text and is never interpreted; the case of neither locator is returned as none; the file imports no React, JSX, JSON or engine (covered by Task 13's import-graph test); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 13
**Estimate:** 5
**Notes:** Pure over annotation arrays passed in. Read `frontend/src/lib/models/annotation-validation.ts` and `frontend/src/lib/models/citation-target-state.ts` for the shapes. This task fixes the locator selection; the label passing to the engine is Task 34.
**POS:** task_a4050a35
**Done:** [x]

### Task 23: Anchor placement (pure)
**What:** Compute where each citation's note or in-text reference sits in a TipTap document: at the end of the `annotation` mark range, after trailing punctuation for a note style.
**Files:** `frontend/src/lib/models/citations-anchor.ts` (new), `frontend/tests/unit/citations-anchor.test.ts` (new)
**Done when:** Tests first, then green: an anchor is placed at the end of the cited passage's `annotation` mark range; for a note style, if the mark is immediately followed by `.`, `,`, `;`, `:`, `?`, `!` or a closing quote, the anchor is placed after that character, pinned by one test per character; an anchor does not change the compiled text of the cited passage; a mark with no matching citation is left as it renders today; a citation whose mark is absent from the document is returned as unplaced and not dropped silently; marks across nested nodes and at the end of a node are handled; the file imports no React, JSX, JSON or engine (covered by Task 13's import-graph test); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 12, 22
**Estimate:** 5
**Notes:** Where the mark's end is available is recorded in `experiments/task-12.md`; read it first. Engine-free: the rendered text of a note is Task 38.
**POS:** task_60066ef9
**Done:** [x]

### Task 24: Compile citations option and dispatch seam
**What:** Add the optional citations option to the PDF and DOCX compile requests and a seam in the compile cores that is entered only when the option is present.
**Files:** `frontend/src/lib/export/types.ts`, `frontend/src/lib/models/compile-core.ts`, `frontend/app/api/compile/pdf/route.ts`, `frontend/app/api/compile/docx/route.ts`, `frontend/app/api/compile/markdown/route.ts`, `frontend/app/api/compile/text/route.ts`, `frontend/tests/unit/compile-citations-option.test.ts` (new)
**Done when:** Tests first, then green: `CompileBody` gains an optional citations option and its existing fields are unchanged; an absent option runs exactly today's path and the seam is not entered (a spy asserts no call); a present option with a style id from the bundled list is passed to the seam; a style id not in the bundled list, a client-supplied path and an unknown key in the option are refused at the route without echoing client input; the option on a Markdown or text route is refused with a visible message; a citations option on the Markdown route (the route that calls `compileMarkdownCore`) and on the plain-text route (the route that calls `compileTextCore`) returns HTTP 400 with the message "Citations are available for PDF and DOCX", not HTTP 500, pinned by one route test for each route in `compile-citations-option.test.ts`; until the engine pass is registered (Task 43), a present option fails the compile with a message naming that citations are not available, never producing output without citations; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 12, 13, 14
**Estimate:** 5
**Notes:** Existing route tests (`compile-pdf-route.test.ts`, `compile-docx-route.test.ts`) must pass unmodified. Only this task edits the routes and `types.ts`; Task 43 edits `compile-core.ts` after it. Reopened 2026-11-14 for the route mapping: the Markdown and plain-text routes are added to Files and the HTTP 400 pins to Done when, and the box stays unticked until the repair passes.
**POS:** task_a0c9858e
**Done:** [x]

### Task 25: Byte-identity test extension (FR-10)
**What:** Extend the byte-identity test with a document carrying a citation to a Source with filled fields, run once per state, with non-vacuity checks and a spy on the new path.
**Files:** `frontend/tests/unit/compile-citation-byte-identity.test.ts`
**Done when:** Tests first, then green: a document carrying a citation to a Source with filled citation fields compiles identically to today in TXT and Markdown (exact strings), DOCX (archive entry names and exact `word/document.xml` text) and PDF (as `experiments/task-12.md` (f) decides) in each of three states, switch off, module off and option absent; each state has a non-vacuity check (a one-letter change makes the output differ); a spy asserts the seam of Task 24 is not entered when the switch is off; the existing tests in the file pass unmodified; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 12, 14, 24
**Estimate:** 5
**Notes:** Read the existing file and `experiments/task-12.md` first. A failing pin is a finding returned to the owner, not a fix made here.
**POS:** task_f7609bf9
**Done:** [x]

### Task 26: Compile dialog switch and style choice
**What:** Add the citations switch and the style choice to the compile dialog as props-driven controls, shown only while the module is on and the dialog is not in entity mode.
**Files:** `frontend/components/common/CompilePreviewModal.tsx`, `frontend/tests/compilePreviewModal.test.tsx`, `frontend/tests/a11y/compilePreviewModal.a11y.test.tsx`, `frontend/stories/CompilePreviewModal.stories.tsx`
**Done when:** Tests first, then green: the switch and style choice show only when a prop says the module is on and not in entity mode; the switch defaults off on every open; the style choice lists the one bundled style, Chicago notes and bibliography, en-US, with no project default shown; with the switch off the confirmed options carry no citations option (absent means today); with it on they carry `{ styleId }`; with Markdown or text chosen, or the Android runtime prop set, the switch is disabled with the stated reason "Citations are available for PDF and DOCX"; with an availability prop of unavailable the switch is disabled with the reason "Open the project to turn on citations"; unknown is never treated as off; the saved-defaults panel and the existing tests pass unmodified; the controls are keyboard operable with accessible names, a status message in `role="status"`, axe passes, no red; stories per state are written after reading the existing story file; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 13, 14, 24
**Estimate:** 5
**Notes:** Read `CompilePreviewModal.tsx` and its stories first. Only this task and Task 31 edit the file. The host wiring of the props is Task 27.
**POS:** task_0e154f0f
**Done:** [x]

### Task 27: Compile dialog host wiring
**What:** Pass module state, Start Page availability and the runtime to the dialog and carry the citations option into the compile request.
**Files:** `frontend/components/Layout/ShellModalCoordinator.tsx`, `frontend/components/Layout/AppShell.tsx`, `frontend/components/Start/StartPage.tsx`, `frontend/src/lib/compile/run-compile-and-download.ts`, `frontend/tests/component/compile-citations-availability.test.tsx` (new)
**Done when:** Tests first, then green: in the shell the module state comes from `useModuleEnabled`; on a Start Page entry that carries no `config` (encrypted, locked or unusable) the dialog receives unavailable with the reason "Open the project to turn on citations" and no config fetch is made; on the native Android runtime the switch is disabled with the reason "Citations are available for PDF and DOCX"; `run-compile-and-download.ts` sends the citations option only when the dialog's confirmed options carry it, and an absent option leaves the request body byte-identical to today; entity mode shows neither control; the existing compile entry tests (`native-compile-entry-paths.test.tsx`) pass unmodified; AppShell's `onConfirmCompile` (`frontend/components/Layout/AppShell.tsx`, near line 1440) passes the confirmed `citations` option to `runCompileAndDownload`, pinned by a test of the shell route end to end (the dialog is confirmed with citations on, and the `runCompileAndDownload` call carries `citations`), and a test that the Start Page path sends it as well; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 26
**Estimate:** 3
**Notes:** Read `StartPage.tsx` near the entry built without `config` (lines 373-387 per the spec) and `ShellModalCoordinator.tsx` first. The in-app PDF path and Android are not claimed. The commit landed without the AppShell wiring (the shell route dropped `citations`), and the box stays unticked until the repair passes.
**POS:** task_0640fbb4
**Done:** [x]

### Task 28: Pre-run check core (no engine)
**What:** Add the typed core that, over the citations of the resources about to be compiled, groups by Source the citations that cannot be rendered in full, taking the "missing detail" test as an injected function.
**Files:** `frontend/src/lib/models/citations-precheck-core.ts` (new), `frontend/tests/unit/citations-precheck-core.test.ts` (new)
**Done when:** Tests first, then green, each pinned by its own test: it takes `projectId` and `resourceIds` only and writes nothing (asserted by a write spy); it computes over the citations (Task 22's definition) of the listed resources only; a citation whose Source is in Trash or purged is reported removed and named by its saved `sourceName`; a citation whose Source could not be read is reported "could not be checked", never as complete and never as removed; with an injected missing-detail function a citation whose Source lacks a detail is reported naming the citation, the Source and the detail; the result is grouped by Source with each Source once and the summary counts "N citations, M Sources incomplete"; with no gaps the result is empty and distinct from a failed outcome; a locked project rethrows the existing locked-access error; a citation made before its Source had any fields reads the same as any other missing detail; the file imports no React, JSX or JSON and reaches `node:*` only through the storage adapter (covered by Task 13's import-graph test); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 22
**Estimate:** 5
**Notes:** Read `citation-target-state.ts` for `deriveCitationTargetState`. The default missing-detail function reports none until Task 44 injects the table. Only this task and Task 44 edit the file.
**POS:** task_c7b22a90
**Done:** [x]

### Task 29: Pre-run check route and client
**What:** Add the API route and client that run the pre-run check, sitting in the storage context.
**Files:** `frontend/app/api/citations/check/route.ts` (new), `frontend/src/lib/api/citations-check.ts` (new), `frontend/tests/unit/citations-check-route.test.ts` (new)
**Done when:** Tests first, then green: the route runs inside `withStorageContext`, takes `projectId` and `resourceIds` and no path, rejects malformed ids without echoing client input, returns the grouped result and a distinct failed result for fake cores, fails closed on a locked project with the existing locked behaviour, is classified by the same paired-device gate as every other `/api` route (which case is recorded), and adds no limit switch; the client maps a thrown fetch or non-ok response to a failed result (never "no gaps") and rethrows the locked-access error; a tenant-scoping case shows a hosted check touches only the signed-in tenant's project; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 28
**Estimate:** 3
**Notes:** Follow `frontend/app/api/claims/route.ts`. No native backend (Android is not claimed).
**POS:** task_8ff07a6f
**Done:** [x]

### Task 30: Pre-run warning dialog component
**What:** Build the presentational warning dialog grouped by Source with a summary, Proceed and Cancel.
**Files:** `frontend/components/common/CitationCheckDialog.tsx` (new), `frontend/tests/component/CitationCheckDialog.test.tsx` (new), `frontend/stories/CitationCheckDialog.stories.tsx` (new)
**Done when:** Tests first, then green: the dialog takes focus and the summary "N citations, M Sources incomplete" is text; the per-Source list is a list with an accessible name, each Source once; each Source's state (incomplete with the missing detail, removed, could not be checked) is conveyed by text and not by colour alone; Proceed and Cancel are callbacks and Cancel writes and starts nothing; a failed check is shown in `role="alert"` and offers Cancel only, never Proceed as if complete; keyboard operable; axe passes; no red; a story per state is written after reading `frontend/components/common/UI/Dialog` and an existing dialog story; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 13
**Estimate:** 5
**Notes:** Presentational, data by props. Read the shared `Dialog` source and stories before using any prop.
**POS:** task_a8e08249
**Done:** [x]

### Task 31: Warning flow in the compile dialog
**What:** Run the pre-run check when the switch is on, show the warning when there are gaps, and start the compile only on Proceed.
**Files:** `frontend/components/common/CompilePreviewModal.tsx`, `frontend/tests/compilePreviewModal.test.tsx`, `frontend/tests/component/compile-citations-warning-flow.test.tsx` (new)
**Done when:** Tests first, then green: with the switch on and gaps, the warning of Task 30 opens before any compile request and Proceed sends the compile with the option while Cancel sends nothing and writes nothing; with no gaps the compile runs with no warning; a failed check shows the failure and starts no compile; a locked project opens the unlock prompt as the dialog does today; with the switch off no check is made (a spy) and the flow is unchanged; the existing tests pass unmodified; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 26, 29, 30
**Estimate:** 5
**Notes:** Only Tasks 26 and 31 edit `CompilePreviewModal.tsx`. The warning's wording of the missing detail comes from Task 44 at runtime; this task tests with a fake check.
**POS:** task_a78ada8c
**Done:** [x]

### Task 32: Engine adapter module
**What:** Add the one adapter module that wraps the chosen engine and exposes a typed render of citations and a bibliography from CSL-JSON items, with formatting runs.
**Files:** `frontend/src/lib/citations/citation-engine.ts` (new), `frontend/tests/unit/citation-engine.test.ts` (new), `specs/features/citations-at-compile/experiments/task-32.md` (new; this task's results only)
**Done when:** Tests first, then green against the engine recorded in `experiments/task-9.md`: the adapter is the only file that imports the engine; it renders a citation as note text or an in-text string with formatting runs (for example italic titles) typed so a PDF and DOCX renderer can use them; it numbers notes once across the whole manuscript; it renders a repeated citation of one Source as the style says; it renders the bibliography of a list of items in the style's order, each once; an engine failure or an item the engine rejects is returned as a distinct failed outcome naming what failed, never as an empty render; it runs with no network request (asserted by a fetch spy); `experiments/task-32.md` records the engine, version, commands and the date; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 9, 13, 16
**Estimate:** 5
**Notes:** The adapter imports the vendored engine from `frontend/src/lib/citations/engine/` (Tasks 55 and 56, run by the lead before this task; no Depends on is added because the validator allows only lower numbers). No agent edits `package.json` or the lockfile. Locator labels are Task 34; the style and locale assets are Task 33; use a throwaway style string in tests only until Task 33 lands. Only Tasks 32 and 34 edit this file.
**POS:** task_431c574d
**Done:** [x]

### Task 33: Bundled style, locale and style loader
**What:** Bundle the Chicago notes and bibliography style and the en-US locale unmodified with their author metadata, load them from the app bundle and accept a style id only from the bundled list.
**Files:** `frontend/src/lib/citations/style-loader.ts` (new), `frontend/src/lib/citations/assets/chicago-notes-bibliography.csl` (new), `frontend/src/lib/citations/assets/locales-en-US.xml` (new), `frontend/tests/unit/citation-style-loader.test.ts` (new)
**Done when:** Tests first, then green: the style file is byte-identical to the pinned upstream file recorded in `experiments/task-2.md` and keeps its author metadata; the locale likewise; the loader accepts only a style id from the bundled list and refuses any other without echoing it; it reads from the bundle and makes no network request (fetch spy); a style-load failure is returned as a distinct failed outcome naming what failed, never as "no style"; the bibliography heading comes from the small table keyed by style id ("Bibliography" for Chicago) and the test records whether the style or locale supplies its own heading; the asset format matches the engine decided in `experiments/task-9.md` (if the owner's decision names a different asset format or path, stop and return to the owner); `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 2, 9
**Estimate:** 3
**Notes:** Assets are never modified (its share-alike terms are not triggered by a change). The static-export and Electron bundling of the licence texts is Task 46.
**POS:** task_03eeb6fb
**Done:** [x]

### Task 34: Locator labels in the adapter
**What:** Pass page, paragraph and line to the engine as CSL locator labels and a timestamp as literal text.
**Files:** `frontend/src/lib/citations/citation-engine.ts`, `frontend/tests/unit/citation-engine.test.ts`
**Done when:** Tests first, then green, each pinned by its own test: a page locator renders with the style's and locale's page term; paragraph and line likewise; a timestamp renders as literal text (for example "at 12:30") and is never passed as a CSL label; a citation's own locator wins and an excerpt citation with no locator of its own uses the excerpt's (as Task 22 selects); a citation with neither renders with no locator; a locator value is treated as text; the existing adapter tests pass unmodified; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 22, 32
**Estimate:** 3
**Notes:** The label terms come from the style and locale (Task 33) once it lands; where a style string is needed before then use the Task 32 test string.
**POS:** task_24831d52
**Done:** [x]

### Task 35: Required-details table
**What:** Write the hand-written table of what the bundled style needs for each reference type and test it against the engine's output.
**Files:** `frontend/src/lib/models/citations-required-details.ts` (new), `frontend/tests/unit/citations-required-details.test.ts` (new)
**Done when:** Tests first, then green: the table gives, for the bundled style and each of the four types, the details it requires; a function returns the missing details of a `citationFields` value; for each type, a value with every required detail renders through the engine adapter with no missing-variable output, and a value with one required detail removed is reported missing by the table and the engine's output visibly lacks it, so the table is checked against the engine and not only against itself; the same table is exported for the editor line and the pre-run check; the file imports no React, JSX, JSON or engine (the engine-checking test imports the adapter, the table file does not; covered by Task 13's import-graph test); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 16, 32, 33
**Estimate:** 5
**Notes:** OQ-4 resolved to a hand-written table read by both the editor and the check. Do not infer required fields from the style file; the table is written by hand.
**POS:** task_e905b6ff
**Done:** [x]

### Task 36: FR-12 footnote placement experiment
**What:** Record what each renderer can do with notes and build a compile of at least 3 resources with at least 20 notes crossing at least 3 page breaks to test placement.
**Files:** `frontend/tests/unit/citations-footnote-placement.test.ts` (new), `specs/features/citations-at-compile/experiments/task-36.md` (new; this task's results only)
**Done when:** `experiments/task-36.md` records, from reading `CompilePDFDocument.tsx` and `CompileDocxDocument.ts`, what each renderer can do with notes; then, as observed values with the test and command that produced them: for PDF, whether each note's text appears on the same page as its reference mark in at least 20 notes crossing at least 3 page breaks, by ordered per-page extracted text; for DOCX, whether `word/footnotes.xml` is present and each reference in `word/document.xml` resolves to a note, with page placement left to Word and not claimed; the result is stated as pass or fail per format by observed values and, if PDF cannot place a note on its page, the record is headed "Returns to the owner (OQ-8)" and no fallback is built; the test file is written first and its failures are the record, not hidden.
**Depends on:** 9, 12, 32, 33
**Estimate:** 5
**Notes:** An in-text style is not checked here. The result returns to the owner at Task 37 whether it passes or fails. Do not edit the production document files in this task; use the renderer's own library calls or a throwaway harness in the test.
**POS:** task_aa73975e
**Done:** [x]

### Task 37: OWNER DECISION POINT (LEAD-RUN): OQ-8 PDF note placement
**What:** The owner reads the FR-12 result and, if PDF cannot place notes on the page of their reference, decides what ships.
**Files:** `specs/features/citations-at-compile/experiments/task-37.md` (new; this task's results only)
**Done when:** `experiments/task-37.md` records either "No decision needed: PDF placed each note on its page, per `experiments/task-36.md`" or the owner's written decision on OQ-8 (accepted end-of-chapter or end-of-document notes in PDF only, a different PDF construction, or PDF held back), with the date and the owner's name; no silent fallback is chosen by an agent.
**Depends on:** 36
**Estimate:** 1
**Notes:** LEAD-RUN, owner decision. Task 42 (PDF document) depends on it. The DOCX document (Task 41) does not.
**POS:** task_5dd3b151
**Done:** [x]

### Task 38: Citation render pass (notes and in-text references)
**What:** Turn the TipTap documents of the compiled resources into sections carrying each citation as a note or in-text reference rendered through the adapter, with formatting runs.
**Files:** `frontend/src/lib/models/citations-render.ts` (new), `frontend/tests/unit/citations-render.test.ts` (new)
**Done when:** Tests first, then green, each pinned by its own test: each citation (Task 22's definition) in a compiled resource is rendered through the adapter in the bundled style at the anchor of Task 23; a citation in a resource left out of the compile is not rendered; an annotation that is not a citation renders as it does today; the compiled text of the cited passage is unchanged; the engine's formatting runs reach the output; notes are numbered once across the whole manuscript in compile order; a citation inside a Source body, when that Source is compiled, renders like any other; a Source that cannot be read or an adapter failure fails the pass with a message naming what failed and never produces output without the citations; the file reaches the engine only through the adapter and imports no React, JSX or JSON (covered by Task 13's import-graph test); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 23, 32, 33, 34
**Estimate:** 5
**Notes:** Defines the typed rendered-section output that Tasks 39 to 43 use. The incomplete marker is Task 39; the bibliography is Task 40.
**POS:** task_8ddf200a
**Done:** [x]

### Task 39: Incomplete-citation marker
**What:** Render an incomplete citation with what it has and the visible marker, never skipped and never refusing the compile.
**Files:** `frontend/src/lib/models/citations-incomplete.ts` (new), `frontend/tests/unit/citations-incomplete.test.ts` (new)
**Done when:** Tests first, then green: a removed Source, a Source missing a required detail (the table of Task 35) and a Source with no fields each render with what they have and the marker `[citation incomplete: <Source name>]`, the same text in every format and style; the name is `deriveCitationTargetState(...).displayName` and, when undefined, the literal "unnamed Source" giving `[citation incomplete: unnamed Source]`; the name is escaped for the output format like any name and never interpreted as markup; the citation is never skipped and the compile is never refused; the pass of Task 38 uses it for these three cases; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 35, 38
**Estimate:** 3
**Notes:** Read `citation-target-state.ts` (`deriveCitationTargetState`, around lines 66-83 per the spec) before writing tests. This task may edit `citations-render.ts` only to call the marker function; list any such edit in `experiments/task-39.md`.
**POS:** task_43a8ef24
**Done:** [x]

### Task 40: Bibliography
**What:** Build the bibliography of the Sources cited in the compiled resources, each once, in the style's order, with its heading.
**Files:** `frontend/src/lib/models/citations-bibliography.ts` (new), `frontend/tests/unit/citations-bibliography.test.ts` (new)
**Done when:** Tests first, then green, one test per case: a cited Source is listed once; a Source cited twice is listed once; a Source's own exclusion from compile does not stop it being cited or listed; a Source cited only in a resource left out of the compile is not listed; a Source that is not cited is not listed; the order and formatting come from the style through the adapter; the heading comes from the table keyed by style id ("Bibliography" for Chicago); an adapter failure fails with a message naming what failed and never yields an empty bibliography; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 38
**Estimate:** 5
**Notes:** A citation here is by Task 22's definition. The bibliography output is part of the typed result of Task 38.
**POS:** task_47bacd83
**Done:** [x]

### Task 41: DOCX document with footnotes and bibliography
**What:** Make the DOCX document carry each rendered note as a Word footnote, the formatting runs, and the bibliography at the end.
**Files:** `frontend/src/lib/export/CompileDocxDocument.ts`, `frontend/tests/unit/compile-docx-citations.test.ts` (new)
**Done when:** Tests first, then green: with citations input, `word/footnotes.xml` is present and each footnote reference in `word/document.xml` resolves to a note whose text is the rendered note with its formatting runs; the bibliography follows the manuscript with its heading; text is escaped and a Source name or field value is never interpreted as markup or a link; with no citations input the output is identical to today (the existing DOCX tests and Task 25 pass unmodified); page placement is left to Word and not claimed; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 36, 38, 40
**Estimate:** 5
**Notes:** Only this task edits `CompileDocxDocument.ts`. Task 36 records what the renderer can do; read `experiments/task-36.md` first.
**POS:** task_03e0b91c
**Done:** [x]

### Task 42: PDF document with notes and bibliography
**What:** Make the PDF document carry each rendered note in the way Task 36 and the owner's Task 37 decision settled, and the bibliography at the end.
**Files:** `frontend/src/lib/export/CompilePDFDocument.tsx`, `frontend/tests/unit/compile-pdf-citations.test.ts` (new)
**Done when:** Tests first, then green: the construction follows `experiments/task-36.md` and `experiments/task-37.md` and any fallback is the one the owner decided and none is chosen silently; with citations input each note's text is carried as that construction says, checked by ordered per-page extracted text; the bibliography follows the manuscript with its heading; the formatting runs reach the output; text is escaped and never interpreted as markup or a link; with no citations input the output is identical to today (existing PDF tests and Task 25 pass unmodified); `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 37, 38, 40
**Estimate:** 5
**Notes:** Only this task edits `CompilePDFDocument.tsx`. If the owner held PDF back (OQ-8), stop and return to the owner; do not build.
**POS:** task_f178c6e6
**Done:** [x]

### Task 43: Wire the citations pass into the PDF and DOCX cores
**What:** With the option present, read the TipTap sections, run the pass and bibliography and render through the PDF or DOCX document; with it absent, stay on today's plain-text path.
**Files:** `frontend/src/lib/models/compile-core.ts`, `frontend/src/lib/export/section-loader.ts`, `frontend/src/lib/export/CompilePDFDocument.tsx` (an `onRender` prop only, or render through `pdf()`; Owner, Gate 5, 2026-11-15), `frontend/tests/unit/compile-citations-core.test.ts` (new), `frontend/tests/unit/citations-pdf-layout-data-shape.test.ts` (new)
**Done when:** Tests first, then green: with the option present, `compilePdfCore` and `compileDocxCore` read the TipTap document, run Tasks 38 to 40 and render through Tasks 41 and 42; with the option absent the seam of Task 24 is not entered and the output is identical to today (Task 25 passes unmodified); a failed read of a Source or sidecar, an adapter failure and a style-load failure fail the compile with a message naming what failed and never produce output without the citations; a locked project raises the existing locked-access error; the engine runs with no network (fetch spy); the existing compile tests pass unmodified; the PDF construction follows `experiments/task-57.md`: pass 1 renders the body with `onRender` and the pass-1 layout data gives each mark's page, and pass 2 draws a fixed footer with `lineHeight: 1` on the footer `Text`, with `CompilePDFDocument.tsx` gaining an `onRender` prop or the core rendering through `pdf()`; the page's body area reserves bottom space for that page's notes, so footer notes are never drawn over body text, and if reserving changes the pagination the core re-renders until each note's page is stable, with a fixed bound on passes (the bound is a named constant), and if the bound is reached the compile fails with a message naming the bound, never emitting overlap silently; the tests show, using the corpus with tall notes from Task 57 (`frontend/tests/unit/citations-pdf-page-finding.test.ts`), that no footer box overlaps the body box on any page, and a test forces the bound to be reached and sees the named failure; a test in `citations-pdf-layout-data-shape.test.ts` pins that `_INTERNAL__LAYOUT__DATA_` exists in the `onRender` argument with the shape Task 43 reads (the `DOCUMENT > PAGE[] > ... > TEXT` tree with `lines[].runs[]` and `box`), so a react-pdf upgrade that changes it fails loudly; the page-count check in Notes is kept; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 24, 39, 41, 42
**Estimate:** 8
**Notes:** Only Tasks 24 and 43 edit `compile-core.ts`. The native backend (Android, the browser PDF renderer) is not changed and no Android support is claimed.
- Order (not a Depends on, because the validator allows only lower numbers): Tasks 57, 58, 59, 60, 61 and 62 run before Task 43 (Task 60 is run by the orchestrator; the lead runs Tasks 61 and 62, the font fix and the record repair the owner decided after Task 60, before Task 43's PDF work), because `compilePdfCore` threw on text containing `"`, `:` or `;` in Node tests (`experiments/task-58.md`), and observed once by the owner in their installed app (version not recorded; "Observed in the running app" there). Task 43's PDF construction follows the Task 57 result (`experiments/task-57.md`) or, if Task 57 finds no construction with only shipped dependencies, the owner's decision after it; no agent chooses between shipping `pdfjs-dist` and the OQ-8 endnote fallback (Task 37). Record the order followed in `experiments/task-43.md`.
- Uniform bottom reservation accepted for this feature (Owner, Gate 5, 2026-11-15): react-pdf takes one `paddingBottom` per Page, so the tallest page's notes set the reserved space on every page; on the tall-notes corpus the page count went from 12 to 19. Per-page reservation, and measuring the growth on real manuscripts, are a follow-up outside this feature.
- Estimate raised from 5 to 8 (Owner, Gate 5, 2026-11-15): the space reservation, the bounded re-render loop, the overlap tests and the layout-data pin are new work on top of the core wiring.
- Footer notes (Owner, Gate 5, 2026-11-15): Task 57 measured the footer as `position: absolute`, reserving no space (footer box top 603 or 530 against body box bottom 770 with tall notes; glyph overlap not measured). The reservation in Done when is therefore Task 43's to build; the overlap test compares layout-data boxes, as `experiments/task-57.md` did, and states that glyph overlap is not measured by it unless a test measures it.
- Page count (measured, Task 42): the builder does not check that pass 2 has the same page count as pass 1, and no space is reserved for the footer (footer top 111.8 against lowest body baseline 92.7 on tall footers). Task 43 MUST check the page count of pass 2 against pass 1 and fail the compile with a message naming both counts when they differ, never emitting a PDF whose notes may sit on the wrong page; a test covers it.
- Task 43 MUST pass `renderIncompleteCitation` (`citations-incomplete.ts`) as the `renderIncomplete` hook of the render pass; a test shows a removed Source, a Source missing a detail and a Source with no fields render the FR-16 marker through the core.
- Anchors: the render pass returns TipTap `{path, offset}` anchors (`citations-anchor.ts`); the builders place by UTF-16 offsets in their section text. Task 43 MUST map each anchor to the builders' UTF-16 section offset, tested with a multi-byte character and a surrogate pair before an anchor, so a note never lands off its mark.
- `section.unplaced` (citations whose `annotation` mark is not in the document): the spec has no requirement naming this case. The nearest are FR-16 (an incomplete citation is never skipped) and FR-17 (never produce output without the citations the writer asked for). Decided (Owner, Gate 5, 2026-11-15): if `section.unplaced` is not empty, the compile refuses, under FR-17, with a message naming each such citation (its resource and Source), and never silently drops one; a test covers it. This is in Task 43 only: no pre-run check change (Tasks 28 and 44 are untouched) and no spec change.
**POS:** task_5f56f9b8
**Done:** [x]

### Task 44: Missing details into the pre-run check
**What:** Inject the required-details table into the pre-run check so a citation whose Source lacks a required detail is reported.
**Files:** `frontend/src/lib/models/citations-precheck-core.ts`, `frontend/tests/unit/citations-precheck-core.test.ts`
**Done when:** Tests first, then green: a citation whose Source lacks a detail the table of Task 35 requires is reported with the citation, the Source and the missing detail; a Source with every detail is not reported; a Source never filled in is reported with all required details missing; the check and the editor line read the same table (a test asserts both import the same function); the existing check tests pass unmodified; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 28, 35
**Estimate:** 3
**Notes:** Only Tasks 28 and 44 edit these files.
**POS:** task_63c50bbb
**Done:** [x]

### Task 45: "Still needs" line in the editor
**What:** Show, in the sidebar section, a text line naming which details the bundled style still needs for the chosen type.
**Files:** `frontend/components/Sidebar/CitationFieldsSection.tsx`, `frontend/components/Sidebar/CitationFieldsEditor.tsx` (the Task 20 editor component; edit limited to what is named below), `frontend/tests/component/CitationFieldsSection.test.tsx`, `frontend/tests/component/CitationFieldsEditor.test.tsx`, `frontend/tests/unit/citations-precheck-core.test.ts` (only to turn Task 44's `it.skip` into `it`)
**Done when:** Tests first, then green: the section passes the line to the editor from the table of Task 35, naming the details still missing for the chosen reference type and a statement that nothing is missing when complete; it updates as the writer fills fields, through a new optional `onDraftChange` prop on `CitationFieldsEditor` called with the current draft fields as they change (a test fills a field and sees the line change before any save); the still-needs line is text, in a `role="status"` region, with `role="status"` placed on the line itself in `CitationFieldsEditor.tsx` and the section drawing no second region around it (a test finds exactly one status region for the line); a failed read shows no line and the editor's failure; the existing section and editor tests pass unmodified apart from the stated additions, and the Task 20 editor tests still pass with `onDraftChange` absent; the `it.skip` in `frontend/tests/unit/citations-precheck-core.test.ts` ("the editor line source imports findMissingDetails from the same module") is changed to `it` and passes; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 21, 35
**Estimate:** 3
**Notes:** Only Tasks 21 and 45 edit the section. Edit to Task 20's component allowed (Owner, Gate 5, 2026-11-15): an `onDraftChange` prop and `role="status"` on the still-needs line, both needed by this task's Done when and neither previously in its Files. Estimate raised from 2 to 3 for the second component and its test. Task 44's skipped test waits on this task because it asserts the editor line source reads the same function as the check; Task 44 itself stays as committed.
**POS:** task_f7118183
**Done:** [x]

### Task 46: Licences entry in App Settings and bundled licence texts
**What:** Add a "Licences" entry to App Settings showing the engine, style and locale attributions and bundle their licence texts in the static export and the Electron package.
**Files:** `frontend/components/AppSettings/LicencesSetting.tsx` (new), `frontend/components/AppSettings/AppSettingsDialog.tsx`, `frontend/public/licences/citations-licences.txt` (new), `electron/electron-builder.yml`, `frontend/tests/component/LicencesSetting.test.tsx` (new), `frontend/stories/AppSettings/LicencesSetting.stories.tsx` (new)
**Done when:** Tests first, then green: App Settings shows a "Licences" entry listing the engine (with Hayagriva's Apache-2.0 licence text and NOTICE from `frontend/src/lib/citations/engine/` included in the bundled texts), the Chicago style and the en-US locale with the attributions `experiments/task-2.md` records, as text and with no link fetched at run time; `citations-licences.txt` holds the licence texts as copied there, unmodified; the file is under the static export's public directory and `electron-builder.yml` is changed only if the packaged standalone server does not already carry it, with the packaging check itself run in Task 52 and not here; a compile-dialog attribution line is added only if the owner's reading in `experiments/task-9.md` requires it; the existing AppSettings tests pass unmodified; keyboard operable, axe passes; a story is written after reading `AppSettingsDialog.stories.tsx`; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 2, 33
**Estimate:** 5
**Notes:** Hayagriva's Apache-2.0 licence text and NOTICE, vendored at `frontend/src/lib/citations/engine/` (Task 56), are added to the bundled licence texts and to the Licences entry, with the Hayagriva attribution. The licence texts are copied from the upstream files, not written. That the files land in the package and the export is verified in Tasks 51 and 52 (LEAD-RUN), not here. Read `experiments/task-9.md` for any compile-dialog line the owner requires.
**POS:** task_214fab05
**Done:** [x]

### Task 47: Security, tenancy and gate pins (FR-21, FR-22)
**What:** Pin that every route this feature adds or extends validates its boundary, sits in the storage context, is classified by the paired-device gate, fails closed on a locked project and scopes a hosted tenant.
**Files:** `frontend/tests/unit/citations-routes-security.test.ts` (new)
**Done when:** Tests first, then green: the fields route, the check route and the PDF and DOCX compile routes with the option each run inside `withStorageContext`, take `projectId` and `resourceIds` and no path, are classified by the same paired-device gate as every other `/api` route, add no limit switch except where Task 11's record names one, and fail closed on a locked project; a hosted tenant case shows each touches only the signed-in tenant's project; a style id outside the bundled list, a client-supplied path and an unknown reference type are refused without echoing the input; a URL and a field value are printed as text and never as a link target or markup in DOCX and PDF output; the engine and style loader make no network request; a failing pin is a finding returned to the owner, not a fix made here; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 18, 29, 43
**Estimate:** 5
**Notes:** No production code is expected to change. A hosted tenant is checked by this test, not claimed from a device.
**POS:** task_a2743ceb
**Done:** [x]

### Task 48: Module-off, Sources-off, isolation and annotation-unchanged pins (FR-4, FR-6, FR-8)
**What:** Pin that the module is independent of the Sources module, switching it off deletes nothing, citation fields are isolated from custom fields, and citation creation and storage are unchanged.
**Files:** `frontend/tests/unit/citations-module-off.test.ts` (new), `frontend/tests/component/citations-sources-off.test.tsx` (new)
**Done when:** Tests first, then green: with `config.modules.sources` off and `citations` on, the field editor, the compile switch and the compile work; switching the module off hides only the compile switch and the editor and writes, rewrites and deletes no stored field value or citation, and switching it on again shows the same values; a custom field named like each citation field is unaffected and the citation fields do not appear in the metadata schema or `userMetadata`; the existing annotation tests (`annotation-validation`, annotations core, citation control) pass unmodified and `validateAnnotationTarget` is unchanged; a citation made before the module existed is readable with no migration and renders once its Source's fields are filled in; a failing pin is a finding returned to the owner; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 14, 17, 21, 27
**Estimate:** 5
**Notes:** Existing tests are run, not edited; list the exact existing test files run in `experiments/task-48.md`.
**POS:** task_eff93270
**Done:** [x]

### Task 49: Accessibility and keyboard tests (FR-23)
**What:** Add axe and keyboard tests for the editor, the compile switch, the style choice and the warning dialog.
**Files:** `frontend/tests/component/CitationsA11y.test.tsx` (new), `specs/features/citations-at-compile/experiments/task-49.md` (new; this task's results only)
**Done when:** Tests first, then green: axe passes for the editor with each reference type, the compile dialog with the switch on and disabled (each stated reason) and the warning dialog with a removed Source, a missing detail and a could-not-be-checked Source; the editor fields, the switch, the style choice, Proceed and Cancel are reachable and operable by keyboard alone; the warning takes focus; every state is conveyed by text and not colour alone; status messages sit in `role="status"` and failures in `role="alert"`; `experiments/task-49.md` records a screen-reader run as not verified; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 21, 27, 31, 45
**Estimate:** 3
**Notes:** Follow `docs/standards/accessibility.md` and an existing a11y test for the helper.
**POS:** task_63a7fcb5
**Done:** [x]

### Task 50: Documentation (handbook, feature docs, Code Map, glossary)
**What:** Write the handbook page with the field lists and the warning, and update the feature docs, the Code Map and the glossary, with no device result.
**Files:** `docs/user/handbook/write/citations.md` (new), `docs/user/handbook/index.md`, `frontend/components/project-types/ProjectTypeEditorForm.tsx`, `frontend/tests/component/ProjectTypeEditorForm.test.tsx`, `docs/features/modules.md`, `docs/features/sources.md`, `docs/features/compile-export-defaults.md`, `frontend/CLAUDE.md`, `CLAUDE.md`, `specs/features/citations-at-compile/experiments/task-50.md` (new; this task's results only)
**Done when:** The handbook page states in plain language the exact steps (switch the module on, enter a Source's fields for each of the four types and their fixed fields, what the style still needs line shows, switch citations on in the compile dialog for PDF or DOCX, the pre-run warning with Proceed and Cancel, the visible marker for an incomplete citation, the bibliography, and that Markdown, plain text and Android show the switch disabled); it claims no Android, paired-device or Word result and no placement result beyond what `experiments/task-36.md` and `experiments/task-37.md` record, and no sentence states an unmeasured result as fact; `docs/features/modules.md`, `docs/features/sources.md`, `docs/features/compile-export-defaults.md`, the `frontend/CLAUDE.md` Code Map and the `CLAUDE.md` glossary (Citation fields, Citations switch, Pre-run citation check) are updated and the module list names `citations` as switchable and off by default; the user-guide conventions (no "verified against" lines) are followed; the project type editor (`ProjectTypeEditorForm.tsx`, around line 708, which labels each manifest entry `${entry.view?.label ?? entry.id} module` and so reads "citations module" in lower case) shows "Citations" for the `citations` entry via the manifest label (`entry.view?.label ?? entry.label ?? entry.id`), pinned by a test added to `frontend/tests/component/ProjectTypeEditorForm.test.tsx`, with the labels of the existing entries unchanged.
**Depends on:** 14, 31, 35, 43, 46
**Estimate:** 5
**Notes:** Use the `write-user-guide` skill for the handbook page. Only the scribe edits these files until Task 54 adds the results. Task 14 found the lower-case "citations module" label in `ProjectTypeEditorForm.tsx`; it is placed here (Task 14 is ticked, and no other unstarted UI task touches that form) as a one-line label fix, with the Electron and CLI typechecks not needed (the file is under `frontend/components`).
**POS:** task_9d0330cd
**Done:** [x]

### Task 51: LEAD-RUN: build and inlining check, FR-3 (g)
**What:** Record that `NEXT_PUBLIC_GETWRITE_RUNTIME` is inlined in every new client module, that the web and native builds succeed and that the licence texts and style assets land in the export and the package inputs.
**Files:** `specs/features/citations-at-compile/experiments/task-51.md` (new; this task's results only)
**Done when:** From the main checkout and outside the sandbox, `experiments/task-51.md` records the commands and results of `next build` and `pnpm build:native`, the raw comparison with the count of `NEXT_PUBLIC_GETWRITE_RUNTIME` occurrences under `frontend/out/_next/static` (expected 0, as Features 105 and 107 recorded), whether `citations-licences.txt` and the bundled style and locale are present in `frontend/out` and the standalone server directory, and the build commit and time, each as observed or "not run" with the reason.
**Depends on:** 21, 27, 31, 43, 44, 45, 46
**Estimate:** 2
**Notes:** LEAD-RUN: the orchestrator does not run it; builds fail in worktrees here.
**POS:** task_fd9bfcb2
**Done:** [x]

### Task 52: LEAD-RUN: packaged desktop run, network disabled
**What:** Run the feature on the packaged desktop app with the network disabled and record only what was observed.
**Files:** `specs/features/citations-at-compile/experiments/task-52.md` (new; this task's results only)
**Done when:** `experiments/task-52.md` records the build (commit and build time), the platform and version, that the network was disabled, and as observed values: the module switch on and off; entering fields of each of the four types; the compile dialog switch and style; a compile to PDF and to DOCX of a multi-resource manuscript with notes, with each file opened and what was observed written down (the note text and page for the PDF; the DOCX opened in a word processor, which one and which version, if the owner has one); the pre-run warning with a removed Source, a missing detail and a Source never filled in, then Proceed and Cancel; the module off with the switch left on in the request; the Licences entry in App Settings; and that the licence texts are present in the packaged app; and a "Not verified" list naming at least Android and the in-app PDF path, a paired device unless run, a DOCX opened in Word unless run, screen-reader use, a manuscript with hundreds of notes, an in-text style other than the one bundled, and every path not run.
**Depends on:** 47, 48, 49, 51
**Estimate:** 5
**Notes:** LEAD-RUN with the owner, outside the sandbox, from the main checkout (Electron packaging runs outside it). A unit test or an emulator is not reported as a device run. The owner's run on 2026-11-16 found two defects in the citation-field editor (measured, see Tasks 65 and 66): the editor writes only on the Save button, so values typed and not saved are lost on switching document; and stored dates such as `2005-01-55`, `1000-02-98` and an accessed `2088` passed the pattern-only check. Tasks 65 (real-date rule) and 66 (save as you type) repair them (Owner decision, Task 52, 2026-11-16); steps 2 and 3 of this run (entering fields of each of the four types; the compile with notes) are re-run on a package built after Tasks 65 and 66, and the record names that build. Task 52 cannot list 65 or 66 under Depends on (the validator allows only lower numbers), so the lead runs them first.
**POS:** task_062fe725
**Done:** [x]

### Task 53: LEAD-RUN: hosted web run
**What:** Run the feature on hosted web and record only what was observed.
**Files:** `specs/features/citations-at-compile/experiments/task-53.md` (new; this task's results only)
**Done when:** `experiments/task-53.md` records the build (commit and build time), the browser and version, the sign-in used and, as observed values, the same steps as Task 52 that apply on the web (module switch, fields for each of the four types, the compile dialog switch and style, a PDF and a DOCX with notes opened, the pre-run warning with Proceed and Cancel, the module off with the switch left on in the request), and that a second signed-in tenant cannot reach the first tenant's Source fields or check; a "Not verified" list names every path not run.
**Depends on:** 47, 51
**Estimate:** 3
**Notes:** LEAD-RUN with the owner, outside the sandbox from the main checkout. A test is not a hosted run.
**POS:** task_0b5daa65
**Done:** [x]

### Task 54: LEAD-RUN: CI, results into docs, close-out
**What:** Run every CI workflow command, add the run results to the docs, and link the per-task records in the experiments index.
**Files:** `specs/features/citations-at-compile/experiments.md`, `specs/features/citations-at-compile/experiments/task-54.md` (new; this task's results only), `docs/user/handbook/write/citations.md`, `frontend/CLAUDE.md`, `CLAUDE.md`
**Done when:** The CI command list is taken at that time from `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` and each command is reported in `experiments/task-54.md` as run (with the result) or not run, with builds and e2e run outside the sandbox from the main checkout (including the Electron and CLI typechecks); `experiments.md` links or summarises `task-2`, `task-4`, `task-5`, `task-6`, `task-7`, `task-8`, `task-9` (with the "Decision: ..." line), `task-10`, `task-11`, `task-12`, `task-36`, `task-37`, `task-49`, `task-51`, `task-52`, `task-53` and the Not verified list; the handbook and the Code Map state the results exactly as `experiments/task-52.md` and `experiments/task-53.md` record, and nothing else; no sentence states an unmeasured result as fact.
**Depends on:** 8, 9, 10, 11, 12, 37, 50, 52, 53
**Estimate:** 3
**Notes:** LEAD-RUN. Only this task edits `experiments.md` after Task 1.
**POS:** task_aa3e3ec3
**Done:** [x]

### Task 55: Hayagriva wrapper crate source
**What:** Write the source of a small Rust wrapper crate around Hayagriva, pinned to a commit, with one exported function returning structured citation and bibliography output, and the script that builds and vendors it.
**Files:** `tools/hayagriva-wasm/Cargo.toml`, `tools/hayagriva-wasm/src/lib.rs`, `tools/hayagriva-wasm/build.sh`, `tools/hayagriva-wasm/README.md`
**Done when:** `Cargo.toml` names Hayagriva as a git dependency pinned to rev `2dbaa50518f4d93b5cfc7f9f65f0a3a8dd66bd04` with `default-features = false, features = ["csl-json"]`; `lib.rs` exports one wasm-bindgen function taking style XML, locale XML, CSL-JSON items and an ordered list of citations (each: item ids, an optional locator with label `page`, `paragraph` or `line` and a value, and a note number) and returning JSON with, per citation, the note number and structured text runs (text plus flags italic, bold, small-caps, superscript, subscript, and a link URL where present) and, for the bibliography, per entry the item key and its runs, entries with no text omitted; an error (style, locale or item that fails to parse, a citation naming an unknown item, a render failure) is returned as a distinct error value naming what failed, never as an empty render; Rust unit tests may be written in the crate, but they are not run here; `build.sh` runs `wasm-pack build --release --target web`, then `wasm-opt -Oz`, and copies `hayagriva_wasm_bg.wasm` with its glue `.js` and `.d.ts` into `frontend/src/lib/citations/engine/`; `README.md` states the pinned rev, the toolchain (rustc stable with the wasm32 target, wasm-pack 0.15.1, binaryen 133), the rebuild command and that the owner runs it when updating; no file outside `tools/hayagriva-wasm/` is edited, and `package.json`, the lockfile and the workspace files are untouched. That the source compiles is NOT claimed here: the agent sandbox has no network and no build, and compilation and the tests are verified at Task 56.
**Depends on:** 9
**Estimate:** 3
**Notes:** Grounded in `experiments/task-6.md` (throwaway wrapper, `csl-json` feature, `wasm-opt -Oz`), `experiments/task-5.md` (Turbopack needs the `.wasm` beside the glue, so `build.sh` copies both into one directory) and `experiments/task-9.md` (the decision) and the Owner's vendoring decision of 2026-11-15. The lead runs Tasks 55 and 56 before dispatching Task 32; Task 32 has no Depends on them (the validator allows only lower numbers).
**POS:** task_3e4f17b2
**Done:** [x]

### Task 56: LEAD-RUN: build and vendor the engine
**What:** Build the wrapper crate with the owner-installed toolchain, run its tests, and check in the built engine and the Hayagriva licence files.
**Files:** `frontend/src/lib/citations/engine/hayagriva_wasm_bg.wasm` (new), `frontend/src/lib/citations/engine/hayagriva_wasm.js` (new), `frontend/src/lib/citations/engine/hayagriva_wasm.d.ts` (new), `frontend/src/lib/citations/engine/LICENSE-APACHE` (new), `frontend/src/lib/citations/engine/NOTICE` (new), `specs/features/citations-at-compile/experiments/task-56.md` (new; this task's results only)
**Done when:** The lead has run `tools/hayagriva-wasm/build.sh` outside the sandbox with the owner-installed toolchain (rustc stable with the wasm32 target, wasm-pack 0.15.1, binaryen 133) and run the crate's tests; the built `.wasm`, glue `.js` and `.d.ts` are checked in under `frontend/src/lib/citations/engine/` together with `LICENSE-APACHE` and `NOTICE` copied unmodified from the pinned Hayagriva checkout; `experiments/task-56.md` records the commands, the toolchain versions, the sizes (raw and gzipped) and a smoke render of the Task 3 fixture in Node; no `package.json`, lockfile or workspace file is changed; if the crate fails to compile or a test fails, the error text is the record and the work returns to Task 55's source, or to the owner if the cause is not in the wrapper.
**Depends on:** 55
**Estimate:** 3
**Notes:** LEAD-RUN with the owner-installed toolchain, outside the sandbox from the main checkout. Run before Task 32. This is the first point at which the Task 55 source is compiled.
**POS:** task_bbd15324
**Done:** [x]

### Task 57: FR-12 PDF page-finding without text extraction (experiment)
**What:** Find out whether `@react-pdf/renderer` 4.5.1, already a dependency, can report the page on which each note's reference mark lands without reading the rendered PDF's text, and record whether a construction using only shipped dependencies places each note on its reference's page.
**Files:** `specs/features/citations-at-compile/experiments/task-57.md` (new; this task's results only), `frontend/tests/unit/citations-pdf-page-finding.test.ts` (new; test-only)
**Done when:** `experiments/task-57.md` records, each value with the test and command that produced it: which library facilities were tried to learn a reference's page (for example a `render` prop, `fixed` element callbacks, `onRender`, layout or node information) and, for each, what it returned or why it could not be used; for the Task 36 corpus (at least 3 resources, at least 20 notes, at least 3 page breaks), whether a construction using only shipped dependencies puts each note on its reference's page, checked in the test by the existing devDependency `pdfjs-dist` text extractor (with counts of notes, same-page and not-same-page); whether the construction needs the `lineHeight: 1` footer, by running it with and without; and the page-count stability between passes (pass 1 and pass 2 page counts, and a case with tall footers); production code imports `pdfjs-dist` nowhere (a test or grep over `frontend/src` and `frontend/app` shows 0 imports; `pdfjs-dist` stays a devDependency); no cause is written that an experiment did not separate (for `lineHeight: 1`, the record states only what was measured); if no construction using only shipped dependencies is found, the record is headed "Returns to the owner (OQ-8)" and states the two options, shipping `pdfjs-dist` (the owner installs it) or the OQ-8 endnote fallback for PDF (Task 37), and no agent picks one and none is built; the test file is written first and its failures are the record; `pnpm typecheck` and `pnpm lint` are run on the test file.
**Depends on:** 36
**Estimate:** 5
**Notes:** Facts it starts from (`experiments/task-36.md`): a two-pass prototype with a fixed footer put 24 of 24 notes on the page of their reference across 6 page breaks, but only with `lineHeight: 1` on the footer `Text` (cause not established), and it found each reference's page by extracting text per page with `pdfjs-dist`, a devDependency only; FR-25 forbids adding dependencies. Owner decision (Owner, Gate 5, 2026-11-15): run this experiment before Task 43; if it finds no such construction the result goes back to the owner, who chooses between shipping `pdfjs-dist` and the OQ-8 endnote fallback. Do not edit `CompilePDFDocument.tsx` (Task 42 only); use library calls or a throwaway harness in the test. The lead runs this before Task 43 and Task 43 follows its result.
**POS:** task_e6a5ee2c
**Done:** [x]

### Task 58: PDF font failure reproduction (experiment)
**What:** Reproduce, through `compilePdfCore`, the fontkit `RangeError` reported with the bundled IBM Plex fonts, and find by experiment whether it depends on the `.woff2` faces.
**Files:** `specs/features/citations-at-compile/experiments/task-58.md` (new; this task's results only), `frontend/tests/unit/citations-pdf-font-failure.test.ts` (new; test-only)
**Done when:** `experiments/task-58.md` records, each value with the test and command that produced it: whether `compilePdfCore` with the bundled IBM Plex fonts and body and note text containing `"`, `:` and `;` between letters throws `RangeError: Offset is outside the bounds of the DataView` (or any other error), with the full error text and which character or characters trigger it, and whether the same input renders with Helvetica; if it reproduces: whether the error matches `isFontError` (so whether any fallback applies), whether it depends on the `.woff2` faces, by rendering the same input with the `.woff` or `.ttf` faces from the same `@fontsource` packages if they are present in `node_modules` (no new dependency; if absent, the record says so and the comparison is not run), and by subsetting the glyphs with fontkit directly (the library `@react-pdf/renderer` already uses, imported in the test only if it resolves without a new dependency); if it does not reproduce, the record says so with the inputs tried, and that the Task 42 implementor's report stays unreproduced; the cause is stated only if an experiment discriminated it from the alternatives, otherwise the record names which experiment would settle it; the fix is not part of this task and the record goes to the lead; no production file is edited; `pnpm typecheck` and `pnpm lint` are run on the test file.
**Depends on:** 42
**Estimate:** 3
**Notes:** Facts it starts from: the Task 42 implementor reported, without reproducing it, that a bare react-pdf `Document` using the bundled IBM Plex fonts threw the `RangeError` from fontkit when body text had `"`, `:` or `;` between letters, and that Helvetica rendered fine; the error does not match `isFontError`, so no fallback applies; it was not run through `compilePdfCore`. FR-17 requires a font failure to be visible and never to yield output without the citations. Owner decision (Owner, Gate 5, 2026-11-15): reproduce and discriminate first; no fix here. The lead runs this before Task 43.
**POS:** task_3f43d29b
**Done:** [x]

### Task 59: Repair: lint ignore for the vendored engine and required-details wiring in the check route
**What:** Stop `pnpm lint` failing on the vendored engine glue, and make the check route pass the required-details table so the production pre-run check reports missing details.
**Files:** `frontend/eslint.config.mjs`, `frontend/app/api/citations/check/route.ts`, `frontend/tests/unit/citations-check-route.test.ts`
**Done when:** Tests first: a route test in `citations-check-route.test.ts` that drives the route (not `checkCitationsCore` directly) with a citation whose Source lacks a required detail and asserts the response reports the citation, the Source and the missing detail is shown failing first, with the failure recorded; then `route.ts` (around line 78) passes `{ missingDetails: requiredDetailsCheck("chicago-notes-bibliography") }` to `checkCitationsCore(projectId, resourceIds, ...)` and the test is green; `frontend/eslint.config.mjs` ignores `frontend/src/lib/citations/engine/**` (path relative to the config) with a comment naming the vendored, generated glue, and no other ignore or rule changes; `pnpm lint` from `frontend/` exits 0 with 0 errors (it exited 1 with a single parse error on `frontend/src/lib/citations/engine/hayagriva_wasm.js`, "not found by the project service", before this task); the existing check-route and precheck tests pass unmodified; `pnpm typecheck` is run; both Electron typecheck passes and the CLI typecheck are run only if a file under `frontend/src/lib/models/` is touched (none is expected).
**Depends on:** 44
**Estimate:** 2
**Notes:** Measured: in production `checkCitationsCore(projectId, resourceIds)` is called without the `missingDetails` option, so the pre-run check reports no missing details (Task 44 injects the option but the route never passes it). Edits to `route.ts`, its test and `eslint.config.mjs` by this task (Owner, Gate 5, 2026-11-15). Do not edit the vendored files under `engine/`. The lead runs this before Task 43.
**POS:** task_cb376e18
**Done:** [x]

### Task 60: PDF font failure root cause (experiment)
**What:** Establish by experiment why fontkit throws `RangeError: Offset is outside the bounds of the DataView` when subsetting `"`, `:` and `;` from the bundled `.woff2` IBM Plex faces but not from the `.woff` faces, before any fix is chosen.
**Files:** `specs/features/citations-at-compile/experiments/task-60.md` (new; this task's results only), `frontend/tests/unit/citations-pdf-font-root-cause.test.ts` (new; test-only)
**Done when:** `experiments/task-60.md` records, each value with its test or command: (a) for the glyph ids of `"`, `:` and `;` and a control glyph, in each of the four bundled faces, the `glyf` glyph object read from the `.woff2` against the `.woff` of the same face, covering its type (simple or composite), its component glyph ids, and the `loca` offsets and lengths fontkit computes, at the `_addGlyph` site (fontkit/dist/module.mjs:12177); (b) the `.woff2` decoded to TrueType by a decoder independent of fontkit, using only one already present in `node_modules` or on the system (nothing installed, `package.json` and the lockfile untouched; if none is present the record says so and (b) is not run), then subset with fontkit and the outcome for the same four glyph sets; (c) a statement of the cause only if (a) and (b) discriminate it from the alternatives `experiments/task-58.md` lists (the WOFF2 decoder's reconstruction of the transformed `glyf` and `loca` tables, a property of the glyph outlines in the published files such as composite glyphs, a fontkit subset bug in `glyf` writing), and otherwise the next experiment that would; the test file is written first and the test files are test-only; no fix is made or chosen, and no production file is edited; the record states that the failure was measured in Node tests (vitest) on code shipped in getwrite-v2.3.0 (commit 6772aae9) and observed once by the owner in their installed app (version not recorded; `experiments/task-58.md`, "Observed in the running app"); `pnpm typecheck` and `pnpm lint` are run on the test file.
**Depends on:** 58
**Estimate:** 5
**Notes:** An agent task, not LEAD-RUN: it needs no install and no unsandboxed run (fontkit is reached as in Task 58's test, through `@react-pdf/renderer`). The orchestrator runs it before Task 43, after which the owner chooses any font fix. Owner decision (Owner, Gate 5, 2026-11-15): the cause is established before any fix is chosen. Whether a fix lands on main as a hotfix or on this branch is decided by the owner after Task 60 and is not part of this task. Any font fix the owner chooses runs before Task 43's PDF work. Start from `experiments/task-58.md` and `frontend/tests/unit/citations-pdf-font-failure.test.ts`.
**POS:** task_320115d7
**Done:** [x]

### Task 61: Fix: PDF export faces from .woff2 to .woff
**What:** Point the four IBM Plex faces registered by `registerIBMPlexFonts` at the `.woff` files of the same `@fontsource` packages, which are already installed, so a PDF compile of text containing `"`, `:` or `;` no longer throws, and show that the glyphs draw.
**Files:** `frontend/src/lib/export/CompilePDFDocument.tsx` (the four face paths only: Serif 400 normal and italic, Sans 400 and 700), `frontend/tests/unit/citations-pdf-font-fix.test.ts` (new), `frontend/tests/unit/citations-pdf-font-failure.test.ts`, `frontend/tests/unit/citations-pdf-font-root-cause.test.ts`, `THIRD_PARTY_FONTS.txt` and `docs/` (only if a statement names `.woff2` for the PDF faces), `specs/features/citations-at-compile/experiments/task-61.md` (new; this task's results only)
**Done when:** Tests first, then green, each pinned: a test through `compilePdfCore` (default `renderPdfOnServer`, text containing `"`, `:` and `;`) is first shown failing on the current `.woff2` faces, with the failure recorded, then passing after the change; the same test shows the glyphs draw: for each of `"`, `:`, `;` and a few plain letters, in each registered face used, the glyph outlines embedded in the output PDF's font subset equal the source `.woff` face's outlines for those characters, both read with fontkit (reached through `@react-pdf/renderer` as in Task 58, no dependency added); the existing PDF tests pass; `THIRD_PARTY_FONTS.txt` and `docs/` are checked for any statement naming `.woff2` for the PDF faces and updated if one is found, the check and its result recorded; Task 58's and Task 60's tests are updated where they assert the old failing behaviour against the shipped faces, and their records (`experiments/task-58.md`, `experiments/task-60.md`) are not edited; `experiments/task-61.md` records the results and carries a dated note explaining why those two tests changed; `package.json` and the lockfile are untouched and nothing is installed; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 60
**Estimate:** 3
**Notes:** Owner decision (Owner, Gate 5, 2026-11-15, after reading `experiments/task-58.md` and `experiments/task-60.md`). The fix lands on this branch, before Task 43; the lead runs it before Task 43's PDF work. Commit type `fix:`, because the fault shipped in getwrite-v2.3.0. The `.woff` and `.woff2` are different builds of each face (192 to 240 glyphs differ byte for byte, `experiments/task-60.md`); the visual difference is not measured, and no cause is written beyond what Tasks 58 and 60 recorded. The other fonts bundled for the editor UI (`styles/bundled-fonts.css`) are out of scope, because fontkit does not embed them. Record results in `experiments/task-61.md`. Task 43 edits `CompilePDFDocument.tsx` after this task.
**POS:** task_c3b5765d
**Done:** [x]

### Task 62: Repair: remove machine-specific details from Task 60's record and test
**What:** Remove the names of local Python environments, pyenv versions and search paths from `experiments/task-60.md` and its test, and make the test find the Python with fontTools only through an opt-in environment variable.
**Files:** `specs/features/citations-at-compile/experiments/task-60.md`, `frontend/tests/unit/citations-pdf-font-root-cause.test.ts`
**Done when:** the record names no local environment, path or interpreter beyond "a local Python with fontTools 4.63.0 and brotli, run with -I"; the test finds that Python only through the environment variable `GETWRITE_FONTTOOLS_PYTHON` and otherwise logs `NOT RUN` for part (b), and searches no home-directory or conda path; the test passes with and without the variable set; `grep -E "miniconda|pyenv|kohya|shintai|pytorch|repo-analysis|url-shortener"` over both files returns nothing; `pnpm typecheck` and `pnpm lint` are run on the test file.
**Depends on:** 60
**Estimate:** 2
**Notes:** Owner decision (Owner, Gate 5, 2026-11-15). The measured values in the record are not changed, only how the interpreter is named. Task 61 also edits the test file (the assertions about the shipped faces); the lead runs Task 61 first, then this task, so the two edits do not collide.
**POS:** task_e366b0a3
**Done:** [x]

### Task 63: Map citations compile errors in the PDF and DOCX routes
**What:** Make `compile/pdf` and `compile/docx` answer a `CitationsCompileError` with a status and a `{ error }` JSON body carrying the core's message, and make the compile client show that message to the writer.
**Files:** `frontend/app/api/compile/pdf/route.ts`, `frontend/app/api/compile/docx/route.ts`, `frontend/src/lib/models/compile-core.ts` (only if the core must mark which failures are the writer's own, for example a `kind` on `CitationsCompileError`; no change to what it checks), `frontend/tests/unit/citations-routes-security.test.ts` (the two `it.fails` pins under "a citations compile that fails is answered with a status and a sentence", 2 of the suite's 10 expected fails), `frontend/src/lib/api/compile.ts`, `frontend/src/lib/compile/run-compile-and-download.ts`, `frontend/tests/unit/runCompileAndDownload.test.ts`, `frontend/components/common/CompilePreviewModal.tsx` and `frontend/tests/component/compilePreviewModal.test.tsx` (or the component that shows the compile failure, if the export path shows it elsewhere), `specs/features/citations-at-compile/experiments/task-63.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: both routes return `{ error }` JSON carrying the core's message for `CitationsCompileError`; the writer's own cases (a citation whose mark is not in the document, FR-17, and any other writer-correctable case the core distinguishes) return 4xx; engine, style-load and PDF-layout failures (including the re-render bound) return 5xx, still with the message; the two `it.fails` pins become ordinary `it` tests, run once as `it.fails` plus the unfixed routes to show the current rejection, then as `it` after the fix, and the suite's expected-fail count drops from 10 to 8; a route test covers one engine or style failure (5xx with its message); the compile client shows the message to the writer: `src/lib/compile/run-compile-and-download.ts` and `src/lib/api/compile.ts` currently throw `Compile failed (<status>)` for a non-ok response without reading the body, so the task reads the `{ error }` body for the PDF and DOCX path and a component or unit test shows the message reaches the toast or dialog (the existing tests are extended first, a new file only if none fits); a non-JSON or empty body still gives the existing `Compile failed (<status>)` text; no message text that could hold decrypted prose is logged: the routes log no message or `cause` of a `CitationsCompileError` (at most its name and status), per `docs/standards/failure-visibility.md` and `docs/standards/security.md`, and a test spies on the console and the logger and finds no message text; the existing compile route and client tests pass unmodified; `pnpm typecheck`, `pnpm lint` and the Electron and CLI typechecks are run.
**Depends on:** 47
**Estimate:** 5
**Notes:** Owner decision (Owner, Gate 5, 2026-11-15), after the Task 43, 47, 49 and 50 run. Measured: the routes map only `InvalidProjectIdCoreError` and `CitationsUnavailableError`; a `CitationsCompileError` is not caught and the handler rejects with no JSON; only the FR-17 unplaced case was measured, as a rejection containing "not in the document". Which other core failures are writer-correctable is for the task to read from `compile-core.ts`; none is assumed here. The native (Android) compile path is not changed. Tasks 51 to 54 (LEAD-RUN) come after this task; they cannot list 63 under Depends on (the validator allows only lower numbers), so the lead runs 63 first.
**POS:** task_8229a245
**Done:** [x]

### Task 64: Repair: citation fields sidebar sends the project directory id
**What:** Make the Citation fields section of a Source in the sidebar call `/api/citations/fields` (read and save) with the project directory id instead of the Redux `selectedProjectId`, and check every other Feature 116 client call site for the same fault.
**Files:** `frontend/components/Sidebar/MetadataSidebar.tsx`, `frontend/tests/metadataSidebarSource.test.tsx` (or the sidebar test file that fits; `frontend/tests/component/CitationFieldsSection.test.tsx` is the section's own file; a new file only if none fits), `specs/features/citations-at-compile/experiments/task-64.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: a component or integration test renders the Source sidebar with a project whose `project.json` `id` differs from its directory id and shows, first, the section reading "The citation fields could not be loaded." or the route called with the wrong id (failure recorded), then the section calling `GET /api/citations/fields` with the directory id and showing its fields; the same test confirms directly whether the Redux `selectedProjectId` is the `project.json` id and records that value (until then this is inferred from the 404 below, not checked); the save path (PUT) is covered too and is shown calling the route with the directory id; every other Feature 116 client call site of `/api/citations/*` and of the compile citations option is read, and the record lists each site with the id it passes; any that passes a non-directory project id is fixed in the same task and named in `experiments/task-64.md`; the existing tests pass; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 45
**Estimate:** 3
**Notes:** Found during the Task 52 packaged desktop run on 2026-11-15. Measured by the lead: in the packaged app the Citation fields section of a Source in the owner's throwaway project showed "Error: The citation fields could not be loaded."; that project's `project.json` `id` is `eab25dde-...` and its folder name is `d278b38b-...`; against the packaged standalone server with sharing off, `GET /api/citations/fields?projectId=<folder id>&resourceId=<id>` returned 200 `{"kind":"fields","fields":null}` and the same call with `projectId=<project.json id>` returned 404 `{"error":"The resource was not found."}`. `components/Sidebar/MetadataSidebar.tsx` line 532 passes `projectId={selectedProjectId}` (from `selectSelectedProjectId`) to `CitationFieldsSection`; the compile path (`AppShell.tsx`) passes `getProjectDirectoryId(project.rootPath)`, and `selectActiveProjectDirectoryId` exists in `projectsSlice.ts`; project routes resolve the root as `path.join(resolveProjectsDir(), projectId)`, which takes the directory id. No cause beyond that is written: that `selectedProjectId` is the `project.json` id is inferred, and this task confirms it. Existing tests used projects whose two ids were equal, which is why the suite did not catch this. Task 52 resumes on a rebuilt package after Task 64; Task 52 cannot list 64 under Depends on (the validator allows only lower numbers), so the lead runs 64 first.
**POS:** task_20fd292d
**Done:** [x]

### Task 65: Real calendar dates, not later than UTC+14 today (validator, core, editor message, pre-run check, compile marker)
**What:** Make `date` and `accessed` valid only when they are real calendar dates not later than the current date at UTC+14, in one shared pure function with an injected clock, used by the core's validation, the editor's field message, the pre-run check and the compile; a stored value that fails the rule counts as a missing detail of its Source.
**Files:** `frontend/src/lib/models/citations-fields-validation.ts` (the shared function and its reason codes, clock injected; no React, no `node:*`), `frontend/src/lib/models/citations-fields-core.ts` (only if the core must pass the clock; refusal before any lock or write), `frontend/components/Sidebar/CitationFieldsEditor.tsx` (shows the reason in text beside the invalid date field, through the same function; this task does not touch the Save button, Task 66 does), `frontend/tests/unit/citations-fields-validation.test.ts`, `frontend/tests/unit/citations-fields-core.test.ts`, `frontend/tests/component/CitationFieldsEditor.test.tsx`, `frontend/src/lib/models/citations-required-details.ts` (`findMissingDetails`, read by the editor line, the check and the render pass, also reports an invalid stored `date` or `accessed` under its field name, clock injected), `frontend/src/lib/models/citations-precheck-core.ts` (`requiredDetailsCheck`, `checkCitationsCore`: passes the clock), `frontend/src/lib/models/citations-render.ts` (`gapFor`, which decides the `missing-detail` gap and so the `[citation incomplete: <Source name>]` marker; passes the clock; no change to the marker text in `citations-incomplete.ts`), `frontend/tests/unit/citations-required-details.test.ts`, `frontend/tests/unit/citations-precheck-core.test.ts`, `frontend/tests/unit/citations-render.test.ts`, `frontend/tests/unit/compile-citations-core.test.ts`, `specs/features/citations-at-compile/experiments/task-65.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green (FR-25: no `any`, explicit types, model code imports no React, no `package.json` or lockfile edit; the clock is a parameter, no test reads the system time): the validator refuses `2005-01-55` and `1000-02-98` (day overflow), `2026-13` (month 13), `2023-02-29` and accepts `2024-02-29` (leap year), `2000-02-29` and `YYYY`, `YYYY-MM`, `YYYY-MM-DD` shapes; it refuses a year after the current year at UTC+14, a year-month after the current month at UTC+14 and a full date after the current date at UTC+14; with the injected clock at one instant, the boundary is pinned on both sides: a date equal to the UTC+14 date is accepted and the next day is refused, at an instant when UTC+14 is already the next calendar day (so the UTC date is one day behind) and at an instant just before UTC+14 rolls over; the same for the year and the year-month at a year and a month end; the accessed date follows the same rule as `date`; no lower bound on the year is applied and none is tested (OQ-17: `1000-02-08` is accepted); the core refuses such a value with the one refusal text, identical on every path and not echoing the input, before any lock or write, and a refused write leaves the sidecar unchanged; a value already accepted by the old pattern but failing the rule is refused on write and is not altered by a read (a read test writes nothing); the editor marks a failing date field invalid, with the reason as text (not a real date, or later than today), using the same function, including for a value that was stored before this rule; a stored `2005-01-55` (and a stored invalid `accessed`, whether or not the style requires it) gives a `missing-detail` entry naming the field in that Source's group in `checkCitationsCore`, shown failing first, and the same stored value in `renderCitationPass` gives a `missing-detail` gap, so that on Proceed that Source's citation compiles with the marker `[citation incomplete: <Source name>]` in a `compile-citations-core` test, with the invalid value absent from everything passed to the engine adapter (a spy on the adapter input) and the sidecar unchanged after the check and the compile; a Source whose stored dates are valid gives no new entry; the editor's "still needs" line (same `findMissingDetails`) is checked for an invalid stored date so the three readers agree; the existing tests pass; `pnpm typecheck` and `pnpm lint` are run, with both Electron typecheck passes and the CLI typecheck.
**Depends on:** 15, 17, 20, 38, 39, 44
**Estimate:** 5
**Notes:** Owner decision, Task 52, 2026-11-16 (FR-5). Measured: stored values the old check accepted, read from the owner's throwaway project, were an interview `date` of `2005-01-55`, a web page `date` of `1000-02-98` and an article `accessed` of `2088`; FR-5 specified a pattern only. The limit is the current date at UTC+14 (the furthest-ahead time zone) so a writer in any zone can enter today. Owner decisions, Task 52, 2026-11-16: no lower bound on the year, any real calendar year accepted (OQ-17); a stored value that fails the rule counts as a missing detail of its Source, listed in the pre-run check naming the field, compiled with the existing incomplete marker on Proceed, never passed to the engine and never rewritten (OQ-18). The files for the check and the compile were found by reading: `findMissingDetails` is the one function the editor line, `requiredDetailsCheck` and `gapFor` all call. Ordering: this task is numbered before Task 66 because Task 66's editor shows this task's reasons and blocks its save on them; Task 66 lists 65 under Depends on.
**POS:** task_1aebe92b
**Done:** [x]

### Task 66: Citation fields editor saves as you type
**What:** Replace the Save button of the citation fields editor with a debounced save after each change, a flush of a pending change when the writer leaves, no save while any field is invalid, and a visible not-saved message when the writer leaves with a field still invalid.
**Files:** `frontend/components/Sidebar/CitationFieldsEditor.tsx`, `frontend/components/Sidebar/CitationFieldsSection.tsx` (only if the leave or Source-change flush needs it), `frontend/tests/component/CitationFieldsEditor.test.tsx`, `frontend/tests/component/CitationsA11y.test.tsx`, `frontend/tests/component/citations-sources-off.test.tsx`, `frontend/tests/metadataSidebarSource.test.tsx` (the three files that press "Save citation fields" today, updated; a test for a Source switch goes in the existing file that fits), `frontend/stories/Sidebar/CitationFieldsEditor.stories.tsx` (stories that show or press the Save button updated; add a story for an invalid field and for the not-saved message, after reading the existing stories), `docs/features/sources.md` and `docs/user/handbook/write/citations.md` (the wording that names the Save button), `specs/features/citations-at-compile/experiments/task-66.md` (new; this task's results only)
**Done when:** Tests first, shown failing against the Save-button editor, then green (FR-25: no `any`, explicit types, no `package.json` or lockfile edit; fake timers for the debounce, no real waiting): opening the editor on a Source with stored fields makes no write request; a change calls the Task 19 client once, with the validated fields, after the debounce and not before; several changes within the debounce make one write carrying the last values; switching to another Source with a pending valid change writes that change for the first Source (its `resourceId`) before the second is read, and unmounting does the same; an invalid field (including a stored value that fails Task 65's rule, left unedited) blocks the save, marks the field with the reason in text, and makes no write; correcting the field resumes the save with everything typed; leaving (switching Source or unmounting) with a field still invalid writes nothing from that edit and the editor shows a message that the changes were not saved, in text, visible at leaving (`role="status"` or `role="alert"` as the test decides, never silent); a failed save shows `role="alert"` and keeps every typed value in the inputs; a successful save shows `role="status"`; no "Save citation fields" button is rendered and the existing tests that pressed it are updated and pass; the write goes only through the Task 19 client, to FR-6's core; the Android sentence and its no-request behaviour are unchanged; keyboard operation and axe pass; no red, state in text; the stories build; `pnpm typecheck`, `pnpm lint` and `pnpm test:ci` for these files are run.
**Depends on:** 20, 21, 45, 65
**Estimate:** 5
**Notes:** Owner decision, Task 52, 2026-11-16 (FR-7). Measured: `CitationFieldsEditor.tsx` reads once on mount and writes only when "Save citation fields" is pressed (its doc comment: "writes only when Save is pressed"), so a change to another document without pressing Save loses the typed values; every other metadata-sidebar field persists on each change (`AppShell.tsx:1180`, `onChangeField` to the per-field handlers); FR-7 stated no save model. No partial-save path: while any field is invalid nothing is saved. The debounce interval and the wording of the not-saved message are the task's to choose and record in `experiments/task-66.md`. Ordering: Task 65 comes first (this task shows its reasons and blocks on its rule); the lead runs 65, then 66, before Task 52.
**POS:** task_f7b8ee07
**Done:** [x]

## Summary
- Total tasks: 66
- Total estimated effort: 263 story points (253 before this edit, plus 5 for Task 65 and 5 for Task 66)
- Critical path: Tasks 1 → 3 → 4 → 8 → 9 → 55 → 56 → 32 (Task 32 does not list 55 or 56 under Depends on: the validator allows only lower numbers, so the lead runs them first) → 34 → 38 → 40 → 41 → 43 → 47 → 63 → 64 → 65 → 66 → 52 → 54 (Task 63 depends on 47, Task 64 on 45, Task 65 on 15, 17, 20, 38, 39 and 44, Task 66 on 20, 21, 45 and 65; Tasks 51 to 54 cannot list 63, 64, 65 or 66 under Depends on, so the lead runs 63 to 66 before Task 52). A second chain also ends at Task 43: 32 → 36 → 57 → 43, and a third: 42 → 58 → 60 → 61 → 43 (the orchestrator runs Task 60, and the lead runs Task 61, the font fix, and Task 62, the record repair, before Task 43's PDF work; neither 61 nor 62 appears in Task 43's Depends on, for the same lower-numbers reason as Task 32) (Task 57 does not appear in Task 43's Depends on, for the same lower-numbers reason as Task 32: the lead runs Tasks 57, 58 and 59 before Task 43, and Task 43's PDF construction follows the Task 57 result or the owner's decision after it); Task 58 follows Task 42, Task 60 follows Task 58 and Task 59 follows Task 44, and all three run before Task 43 too (Task 60 by the orchestrator)
- Risks: the engine decision (Task 9) is the owner's and gates Tasks 32 to 46; Task 4 may show B does not match the reference processor, or Task 6 that B does not build, which stops the work and returns to the owner before any hand-written formatter is built; Task 36 may show PDF cannot place a note on its page, which waits on the owner's decision at Task 37 and holds only the PDF document (Task 42), not DOCX; Task 36 found the PDF placement only with a two-pass build that used the devDependency `pdfjs-dist` and `lineHeight: 1` on the footer (cause not established), and Task 57 may find no construction using only shipped dependencies, which returns to the owner to choose between shipping `pdfjs-dist` and the OQ-8 endnote fallback (Task 37) and holds Task 43's PDF construction; the PDF pass 2 page count is unchecked until Task 43 and tall footers reached the body in Task 42; Task 58 reproduced a fontkit `RangeError` with the bundled `.woff2` IBM Plex faces for `"`, `:` and `;` that matches no font fallback, so PDF compile of text containing them threw in Node tests (vitest) on code shipped in getwrite-v2.3.0 (commit 6772aae9), and observed once by the owner in their installed app (version not recorded; `experiments/task-58.md`, "Observed in the running app"); Task 60 recorded the cause as consistent with fontkit's reading of the transformed WOFF2 tables, stated as a hypothesis and not discriminated further; the owner decided the fix (Task 61, `.woff` faces on this branch, `fix:` commit, because the fault shipped in getwrite-v2.3.0) and the record repair (Task 62), and Task 43's PDF work waits on both; the `.woff` faces are different builds from the `.woff2` ones and the visual difference is not measured, and whether the embedded glyphs draw is what Task 61's outline comparison shows; Task 43 grew to estimate 8 for the footer space reservation, the bounded re-render and the `_INTERNAL__LAYOUT__DATA_` pin, and that field is internal to react-pdf 4.5.1, so an upgrade may break it (the pin makes that fail loudly), and reserving space may need several passes, failing at a named bound; Task 59 changes the one lint ignore and the check route so the production pre-run check reports missing details, which it did not before; Task 45 now edits the Task 20 editor (Owner, Gate 5, 2026-11-15); Task 11 may show a sidecar writer loses `citationFields`, which Task 17 returns to the owner; Task 33 assumes the engine reads the unmodified CSL style and locale files, and the owner's decision may change the asset format; Task 46's packaging of licence texts is only checked in Tasks 51 and 52 (LEAD-RUN); Task 56 may show the Task 55 source does not compile or the wrapper's tests fail, which returns to Task 55 before Task 32 starts; Task 43 refuses a compile with any citation whose mark is not in the document (Owner, Gate 5, 2026-11-15), a case the pre-run check does not warn about, so the writer meets it only at compile time; Task 63 changes the client's compile failure text for PDF and DOCX from `Compile failed (<status>)` to the core's message, and the message must not be logged because it may hold decrypted prose; the uniform bottom reservation in Task 43 raised the tall-notes corpus from 12 to 19 pages (accepted by the owner; per-page reservation is a follow-up outside this feature); Task 64 repairs the sidebar's Citation fields call, which sent the Redux `selectedProjectId` where the routes take the directory id (measured on the packaged app; that the two ids differ only when a project's `project.json` `id` is not its folder name, and that `selectedProjectId` is the `project.json` id, is inferred until Task 64's test confirms it), and Task 52 resumes on a rebuilt package after it, so the Task 52 record must name the build that includes Task 64; Tasks 2, 4, 5, 6, 7, 9, 37, 51, 52, 53, 54 and 56 are LEAD-RUN or owner steps and depend on installs, devices and an unsandboxed main checkout, and a DOCX opened in Word, Android and a paired device are claimed only for what Tasks 52 and 53 observe. Tasks 65 and 66 repair two editor defects found in the Task 52 run (Owner decision, 2026-11-16): dates were checked by pattern only, and the editor saved only on a button; the owner decided no lower bound on the year (OQ-17) and that a stored invalid date counts as a missing detail (OQ-18), which Task 65 builds into the editor, the pre-run check and the compile marker; Task 52 steps 2 and 3 are re-run on a package built after both, and a stored invalid date is not checked in a packaged compile until that run.

## Open Questions

- OQ-1 (from the spec, still open): is Hayagriva compiled to WebAssembly (B, the only candidate; citeproc-js was dropped as a shipping candidate on 2026-11-14 and is a test-only reference) accepted, or D as a fallback, and are the licences of B, the bundled style and the locale acceptable. Decided by the owner at Task 9; not answered here.
- OQ-2 (from the spec, still open): the acceptable bundle-size ceiling. Task 7 records raw and gzipped bytes; the owner judges them at Task 9.
- OQ-8 (from the spec, still open): what ships if PDF cannot place a note on the page of its reference. Decided by the owner at Task 37 after Task 36 reports; no silent fallback.
- Task-list question, resolved (Owner, Gate 4, 2026-11-14): the "Decision: ..." line is recorded in `experiments/task-9.md` and Task 54 links it from `experiments.md`; only Task 1 and Task 54 edit `experiments.md`. The spec's FR-2 says the same.
- Task-list question, resolved (Owner, Gate 4, 2026-11-14): on Android (native runtime) with the module on, the citation-fields sidebar section shows the sentence "Citation fields can be edited on desktop and web" and no inputs; no native backend is added for the field write or check routes. Owned by Task 21; spec FR-7.
- Task-list question, resolved (Owner, Gate 5, 2026-11-15): the spec has no requirement for a citation whose `annotation` mark is not in the compiled document (`section.unplaced`, Task 23, Task 38). Decision: if `section.unplaced` is not empty, the compile refuses and names each such citation, under FR-17. This goes in Task 43 only, with no pre-run check change and no spec change.
- Task-list decisions recorded (Owner, Gate 5, 2026-11-15): Task 45 may edit the Task 20 editor (`onDraftChange` prop, `role="status"` on the still-needs line) and turns Task 44's `it.skip` into `it`; Task 57 runs the PDF page-finding experiment before Task 43 and, if it finds no shipped-dependency construction, the owner chooses between shipping `pdfjs-dist` and the OQ-8 endnote fallback (no agent picks); Task 58 reproduces the font failure without fixing it, and Task 60 (added after Task 58) establishes its cause before any fix is chosen; after Task 60 the owner decided Task 61 (fix: the four PDF faces from `.woff2` to `.woff`, on this branch before Task 43, commit type `fix:`) and Task 62 (repair: machine-specific details out of Task 60's record and test, the test finding Python only through `GETWRITE_FONTTOOLS_PYTHON`), both depending on Task 60; Task 43's PDF work follows Task 57 (pass-1 `onRender` layout data, pass-2 fixed footer with `lineHeight: 1`), reserves body space for each page's notes with a bounded re-render and fails naming the bound, pins `_INTERNAL__LAYOUT__DATA_`, and its estimate is 8; Task 59 adds the lint ignore for the vendored engine and the required-details option in the check route; the lead runs Tasks 57 to 62 before Task 43 (Tasks 61 and 62 replace the earlier "any owner-chosen font fix" wording).
- Task-list decisions recorded (Owner, Gate 5, 2026-11-15, after the Task 43, 47, 49 and 50 run): new Task 63 (map `CitationsCompileError` in the PDF and DOCX routes, 4xx for the writer's own cases and 5xx for engine, style-load and PDF-layout failures, both with the message; the two `it.fails` pins in Task 47's test file become passing tests; the client shows the message; no message text logged), depending on 47, run by the lead before Tasks 51 to 54; Task 50's test path is `frontend/tests/component/ProjectTypeEditorForm.test.tsx`; the uniform bottom reservation in Task 43 is accepted for this feature (12 to 19 pages on the tall-notes corpus), with per-page reservation and growth on real manuscripts a follow-up outside this feature.
- Task-list decisions recorded (Owner, Task 52, 2026-11-16): new Task 65 (real calendar dates, not later than the current date at UTC+14, one shared pure function with an injected clock, used by the core, the editor, the pre-run check and the compile marker; estimate 5) and Task 66 (the editor saves as you type, debounced, flushes on leaving, no partial save while a field is invalid, a visible not-saved message on leaving invalid, Save button removed), Task 66 depending on 65; the lead runs both before Task 52, which re-runs its steps 2 and 3 on a later package. Numbering: the validator is Task 65 and the save model Task 66 because Task 66 needs Task 65's reasons and Depends on may name only lower numbers.
- OQ-17 (added to the spec, resolved, Owner, Task 52, 2026-11-16): no lower bound on the year; any real calendar year is accepted. Folded into FR-5 and Task 65.
- OQ-18 (added to the spec, resolved, Owner, Task 52, 2026-11-16): a stored date or accessed value failing the real-date rule counts as a missing detail of its Source: listed in the pre-run check naming the field, compiled with the existing `[citation incomplete: <Source name>]` marker on Proceed, never passed to the engine, never rewritten. Folded into FR-7, FR-15, FR-16 and Task 65.
