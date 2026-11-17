# Tasks: Split a document at the cursor, MVP (Feature 120)

Source spec: `specs/features/split-at-cursor.md` (FR-1..FR-22, US-1 to US-5; Gate 3 decisions of 2026-11-16 recorded in it; OQ-1 to OQ-7 and OQ-9 to OQ-28 resolved and not reopened; OQ-8, the shortcut, is resolved: Mod+Shift+Enter, Owner decision, Task 8, Gate 5, 2026-11-16). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 120. Depends on the shipped Features 77, 101, 102, 103 and 106. Branch: `feat/split-merge`; one PR. Totals: 37 tasks, 156 story points. Measurements: `specs/features/split-at-cursor/experiments.md` (an index created by Task 1); each task records its results in `specs/features/split-at-cursor/experiments/task-<n>.md`, never directly in `experiments.md`, so tasks running in parallel never edit the same file; Task 37 links them at close-out.

Shape of the work:
- FR-1 measurement record, Tasks 1 to 7. Task 1 creates the `experiments.md` index with one fixed heading per FR-1 item (a) to (m) and the environment record; Tasks 2 to 7 are the measurements, each in its own file: Task 2 (a), (b), (c) and the version-number question of (g); Task 3 (d), (e), (m); Task 4 (f), (l); Task 5 (g) lock edges and failure injection, (h); Task 6 (i); Task 7 (j) and (k). The spec makes Task 1 the single FR-1 record; it is split here because the items are thirteen distinct probes and cannot be one session, and the split keeps one writer per file. Every task that writes or reads a stored value depends on the measurement tasks for the items it relies on, so no behaviour change precedes its measurement. Item (j) produces the shortcut shortlist (Task 7).
- Task 8 is the LEAD/OWNER decision (OQ-8): the owner picked Mod+Shift+Enter from the Task 7 shortlist (Owner decision, Task 8, Gate 5, 2026-11-16), recorded in `experiments/task-8.md`. Task 27, the only task that binds a key, depends on it. No task before Task 27 assumes a key.
- Pure decisions with no writes (Tasks 9 to 14) run in parallel after the measurements they need: the contract (9), the message constants (10), eligibility (11), the cut (12), the annotation partition (13) and the lineage-state resolver (14).
- Split core (Tasks 15 to 22): records store (15), no-log truncating write (16), per-document index update (17), new document builder (18), preview and staleness (19), apply with ordered writes (20), reverse compensation and failure injection (21), post-commit index wiring (22).
- Routes and client (Task 23), dialog (24), host (25), editor menu item (26), palette row and shortcut (27), owner wording review of the message constants (28).
- Undo split is built last among the feature tasks, by owner decision (F120-1): core (29), its rollback tests (30), routes and client (31), UI (32). Documentation (33) follows.
- LEAD-RUN tasks at the end, as in Feature 116: the build check (34), the packaged desktop run with the owner (35), the hosted web run with the owner including a second-tenant check (36), CI plus docs and close-out (37).
- Tasks 8, 28, 34, 35, 36 and 37 are LEAD-RUN or owner steps. Task 33 is documentation for the scribe and states no device result.
- The model side imports no React, JSX or JSON and reaches `node:*` only through the storage adapter; `withIndexingSuspended` is never used (FR-1(g)).
- Merge (Feature 121), lineage display (Feature 122), split at headings (Feature 123), paired device (Feature 124), Android (Feature 128), entity documents, Alternates and any change to how canonical revisions work are not in this list; a task that needs one stops and returns to the owner (FR-20).

Requirement traceability (every FR-1..FR-22 maps to at least one task; FR-21 is also an inherited rule of every code task):
- FR-1: 1, 2, 3, 4, 5, 6, 7. FR-2: 9, 10, 11, 26. FR-3: 12, 18, 20. FR-4: 20. FR-5: 15, 20. FR-6: 20, 21. FR-7: 19, 20, 25. FR-8: 16, 20. FR-9: 17, 22. FR-10: 18, 20, 21. FR-11: 13, 20. FR-12: 19, 24. FR-13: 8, 26, 27. FR-14: 23, 31. FR-15: 14, 29. FR-16: 15, 20. FR-17: 29, 30. FR-18: 32. FR-19: 24, 26, 27, 32. FR-20: every task. FR-21: every task. FR-22: 34, 35, 36, 37 (with 33 for the documents).

Compact dependency graph (`a -> b` means b depends on a):
- 1 -> 2, 3, 4, 5, 6, 7, 9; 2 -> 16, 19; 3 -> 14, 15, 18; 4 -> 17, 19; 5 -> 18, 20; 6 -> 11, 12, 13; 7 -> 8, 23; 8 -> 27; 9 -> 10, 11, 12, 13, 14, 15, 17, 18; 10 -> 24, 26, 27; 11 -> 19, 26, 27; 12 -> 13, 18; 13 -> 19, 20; 14 -> 29; 15 -> 20, 29; 16 -> 20, 29; 17 -> 22, 29; 18 -> 20; 19 -> 20, 23; 20 -> 21; 21 -> 22; 22 -> 23, 29; 23 -> 24, 25, 31; 24 -> 25, 28; 25 -> 26, 27, 28; 26 -> 28, 32; 27 -> 28, 32; 28 -> 34; 29 -> 30; 30 -> 31; 31 -> 32; 32 -> 33, 34; 33 -> 34; 34 -> 35, 36; 35, 36 -> 37.

Parallel waves the orchestrator may run (LEAD-RUN tasks 8, 28, 34, 35, 36 and 37 are never run by the orchestrator; they sit in their wave only to show when the lead can run them):
- Wave 1: {1}.
- Wave 2: {2, 3, 4, 5, 6, 7, 9}.
- Wave 3: {8, 10, 11, 12, 14, 15, 16, 17}.
- Wave 4: {13, 18}.
- Wave 5: {19}.
- Wave 6: {20}.
- Wave 7: {21}.
- Wave 8: {22}.
- Wave 9: {23, 29}.
- Wave 10: {24, 30}.
- Wave 11: {25, 31}.
- Wave 12: {26, 27}.
- Wave 13: {28, 32}.
- Wave 14: {33}.
- Wave 15: {34}.
- Wave 16: {35, 36}.
- Wave 17: {37}.

Hot files and the only tasks allowed to edit them (file conflicts for wave planning; the dependency edges above serialize every pair):
- `specs/features/split-at-cursor/experiments.md`: Task 1 creates it, Task 37 closes it; every other task writes only its own `experiments/task-<n>.md`.
- `frontend/CLAUDE.md`, `CLAUDE.md`, `android/CLAUDE.md`, `docs/features/revisions.md`, `docs/features/annotations.md`, `docs/features/writing-log.md`, `docs/features/indexing.md`, `docs/features/home-network-sharing.md` and the handbook page: Task 33 only.
- `frontend/tests/unit/sharing-gate-enumeration.test.ts` and `frontend/scripts/sharing-refusal-smoke.mjs` (the sharing-gate enumeration and the smoke count): Task 23, then Task 31 by dependency (Task 31 reaches Task 23 through Task 30 -> 29 -> 22 -> 21 -> 20 -> 19 and directly, as Task 31 lists 23). Counts are updated where they live and never loosened.
- `frontend/src/lib/models/split-types.ts`: Task 9 only. A later task that needs another type defines it in its own file and says so in its experiments record.
- `frontend/src/lib/models/split-messages.ts` and `frontend/tests/unit/split-messages.test.ts`: Task 10, then Task 22 (the index-failure text only), then Task 28 (owner wording review).
- `frontend/src/lib/models/split-core.ts`: Task 20, Task 21, then Task 22. `frontend/src/lib/models/split-undo-core.ts`: Task 29, then Task 30.
- `frontend/src/lib/models/revision-core.ts`: Task 16 only. `frontend/src/lib/models/trash.ts`: Task 15 only, and only if Task 3 shows the purge sweep needs an exemption for the new `meta/` files.
- `frontend/components/Layout/AppShell.tsx`: Task 25 (mounts the host), Task 27 (binds the key), then Task 32 (Undo). `frontend/components/common/ResourceCommandPalette.tsx`: Task 27, then Task 32. `frontend/components/Editor/EditorContextMenu.tsx`: Task 26, then Task 32. `frontend/components/TipTapEditor.tsx`: Task 25 only.

**Builds and devices:** `next build`, `pnpm build:native`, `pnpm test:e2e`, Storybook build, Electron packaging and every real-browser or device run happen only from the main checkout, outside the command sandbox, by the lead with the owner (builds fail in worktrees here). No orchestrator task runs them. Tasks that write a story check only that it typechecks and lints.

**What the orchestrator cannot verify:** the packaged desktop app, the hosted deployment and its second tenant, Android, a paired device, screen-reader use, a document of hundreds of thousands of words and several hosted server instances. For these the orchestrator verifies only what a task's Done when names (tests, typecheck, lint) and reports the rest as not run. A unit test or an emulator run is never a device run.

**New dependencies:** none are expected. No agent edits `package.json`, a lockfile or the toolchain; a task that finds it needs a dependency stops and returns to the owner.

**Electron worker constraint:** every task whose Files include anything under `frontend/src/lib/models/`, `frontend/src/lib/core.ts`, `cli/` or `electron/` MUST also run `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`) and `pnpm --filter getwrite-cli typecheck`, and record each as run or not run. A bare frontend `tsc` is not accepted as evidence.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- FR-21 standards: tests first, with the failing run shown in the task's own `experiments/task-<n>.md` (`docs/standards/testing.md`; add to an existing test file before creating one where the Files list names one); no `any`, explicit types, pure functions (`docs/standards/typescript-implementation.md`, `docs/standards/code-documentation.md`); model code imports no React, JSX or JSON and reaches no `node:*` outside the storage adapter, filesystem access through `io.ts`; every catch is narrowed and a failed read never returns the value of an empty one (`docs/standards/failure-visibility.md`); boundary rules per `docs/standards/security.md` (validated `projectId` and resource ids, no client-supplied path, no echo of client input); the storage context is established as `docs/standards/storage-context.md` requires; no agent changes `package.json` or a lockfile; a prop of an in-project component is never used before its source and stories are opened. UI follows `docs/standards/accessibility.md` and `docs/standards/storybook-implementation.md`; no red, no colour alone.
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run `pnpm typecheck` and `pnpm lint` on touched files. A suite not run is reported as not run, never as passing.
- Write no cause that no experiment separated. A statement in the spec labelled READ or INFERRED is a reading until its test runs; a measurement is a fact, a cause is a hypothesis.
- Each task records its results in its own `specs/features/split-at-cursor/experiments/task-<n>.md`.
- Implementors do not commit and do not push; the orchestrator commits.

### Task 1: Experiments index and environment record
**What:** Create the experiments index with one fixed heading per FR-1 item (a) to (m) and the environment record, so every later task writes to its own file.
**Files:** `specs/features/split-at-cursor/experiments.md` (new; index with fixed headings Environment, FR-1 (a) to (m) each naming the task file that fills it, Shortcut decision (OQ-8), Runs (FR-22), Not verified, Acceptance; edited by this task and by Task 37 only), `specs/features/split-at-cursor/experiments/task-1.md` (new; this task's results only)
**Done when:** `experiments.md` exists with the headings above, each saying which task file will fill it (Tasks 2 to 7 for (a) to (m), Task 8 for the shortcut decision), and an environment record (node version, pnpm version, commit, branch, the commands that produced them); `experiments/task-1.md` records the same observed values and states that no behaviour change has been made; no production file is edited.
**Depends on:** none
**Estimate:** 2
**Notes:** Index only; measurements go to the per-task files. The spec names `experiments.md` as the FR-1 record; here it is the index that links Tasks 2 to 7, because only one task may edit it while the probes run in parallel.
**POS:** task_4372e2a4
**Done:** [x]

### Task 2: FR-1 (a), (b), (c) and version numbers: canonical writers, stale hash, restore
**What:** Record how a pending autosave and a stale content hash behave, what each canonical-content writer does to the writing log and revisions on a truncation, what `setCanonicalRevision` leaves, and whether two callers can pick one version number.
**Files:** `specs/features/split-at-cursor/experiments/task-2.md` (new; this task's results only)
**Done when:** `experiments/task-2.md` records, each as an observed value with the command or test that produced it: (a) whether an autosave still pending when a split would run can write after it, and that a hash computed over the stored text and compared under the revision lock refuses a stale value; (b) for every writer of a canonical revision's content, with a document truncated, the writing-log entries appended, the revisions created (including any "Auto-backup before large deletion" revision), the derived files rewritten, `wordCount` and `updatedAt`; (c) what `setCanonicalRevision` leaves in `content.tiptap.json`, `content.txt`, `wordCount` and the revision metadata for a document with annotations whose bodies are no longer in the sidecar, and, with a failure injected partway through its metadata loop, how many revisions read canonical; and whether `createRevision` and `updateRevisionInPlace` can pick the same version number (FR-1(g) second half), with the method used; no cause is written as a cause.
**Depends on:** 1
**Estimate:** 5
**Notes:** Reads and throwaway probes only; probes live in the scratchpad and no production file is edited. Read `frontend/src/lib/models/revision-core.ts`, `frontend/src/lib/models/revision.ts`, `frontend/src/lib/models/writing-log.ts`, `frontend/src/lib/pending-saves.ts` and `frontend/src/lib/models/annotation-mark-strip.ts`. Tasks 16 and 19 read this record before writing tests.
**POS:** task_835eeb4e
**Done:** [x]

### Task 3: FR-1 (d), (e), (m): sidecar writers, the two new `meta/` files, copied keys
**What:** Record whether a new top-level sidecar key survives each writer, how new files under `meta/` behave through the adapter, tenancy and purge, and which sidecar keys a copy carries.
**Files:** `specs/features/split-at-cursor/experiments/task-3.md` (new; this task's results only)
**Done when:** `experiments/task-3.md` records, each as an observed value with the command or probe that produced it: (d) whether a new top-level key on a document sidecar survives `mutateSidecar`, `updateSidecarCore`, copy, duplicate, Trash and restore, purge, revision restore, each importer and `reindex`; (e) for a lineage file and a latest-operation file under `meta/` written the way the storage adapter writes other `meta/` files: whether each is stored through the encrypting adapter and fails closed with no key, whether it is per project and per tenant, and whether the purge sweep (`PurgeSweepError` and the code it wraps in `frontend/src/lib/models/trash.ts`) leaves each alone, with the exact lines that would need an exemption if it does not; (m) the sidecar keys a copy carries today, each with its writer-visible meaning; any behaviour that loses a stored value is listed first for the owner.
**Depends on:** 1
**Estimate:** 5
**Notes:** Probes live in the scratchpad; no production file is edited. Tasks 14, 15 and 18 read this record before writing tests.
**POS:** task_9e5c6549
**Done:** [x]

### Task 4: FR-1 (f), (l): derived indexes and word counts
**What:** Record what each derived index holds for a document before and after a per-document update and after a rebuild, which figures exist as word counts, and the time on a project of at least 500 documents.
**Files:** `specs/features/split-at-cursor/experiments/task-4.md` (new; this task's results only)
**Done when:** `experiments/task-4.md` records, each as an observed value with the command that produced it: (f) for the inverted index, annotation-body index, backlinks, mention index and prose diagnostics, what each holds for one document before and after `enqueueIndex` for it and after `rebuildDerivedIndexes`; what neither updates (diagnostics); whether either reports a failure; the time of both on a project of at least 500 documents; (l) the word counts available for a document (`countWords` over `tiptapToPlainText`, the sidecar `wordCount`, the tree's figure) and where each is shown.
**Depends on:** 1
**Estimate:** 5
**Notes:** Probes in the scratchpad with a generated 500-document project. Read `frontend/src/lib/models/derived-index-rebuild.ts`, `frontend/src/lib/models/indexer-queue.ts`, `frontend/src/lib/models/prose-diagnostics.ts`, `frontend/src/lib/models/mention-index.ts`, `frontend/src/lib/models/inverted-index.ts` and `frontend/src/lib/models/backlinks.ts`. `withIndexingSuspended` is not used (FR-1(g)).
**POS:** task_f5ec5d3f
**Done:** [x]

### Task 5: FR-1 (g) lock edges and failure injection, (h) placement after the original
**What:** Record the lock edges a split must take, what a failure after each write step of the decided order leaves with reverse compensation, and how a new document is placed directly after its original.
**Files:** `specs/features/split-at-cursor/experiments/task-5.md` (new; this task's results only)
**Done when:** `experiments/task-5.md` records, each as an observed value with the command or probe that produced it: (g) the lock edges (`revision-content:<root>:<id>`, `withMetaLock`, the sidecar file lock, the `project.json` lock) in the order the spec's write sequence takes them, with the non-reentrant edges named and the reason `createRevision` needs the revision lock held across it; a failure injected after each write step of the decided order (lock the original's revision, snapshot, create the new document, move annotations, seed the exclusion, truncate, write the record last), using existing primitives composed in a probe, with what a reverse compensation leaves on disk; (h) the `orderIndex` of siblings after a copy, what the tree shows for a tie, and what `moveResource` and a contiguous renumber write when a document created at the end of its folder (max sibling + 1) is moved into place with `reorderResourcesCore`, including whether that function is reachable from model code without a client move; no cause is written as a cause.
**Depends on:** 1
**Estimate:** 5
**Notes:** Probes in the scratchpad; no production file is edited. Read `frontend/src/lib/models/locks.ts`, `frontend/src/lib/models/lock-guard.ts`, `frontend/src/lib/models/meta-locks.ts`, `frontend/src/lib/models/resource-crud-core.ts`, `frontend/src/lib/models/resource-templates.ts`, `frontend/components/ResourceTree/moveResource.ts` and `frontend/src/lib/models/saved-defaults-core.ts`. Tasks 18, 20 and 21 read this record before writing tests.
**POS:** task_921bc734
**Done:** [x]

### Task 6: FR-1 (i): TipTap cut points, marks and `UniqueID`
**What:** Record what cutting TipTap JSON at a point does to each node type and to `annotation` marks, and whether `UniqueID` gives fresh ids to moved nodes.
**Files:** `specs/features/split-at-cursor/experiments/task-6.md` (new; this task's results only)
**Done when:** `experiments/task-6.md` records, each as an observed value with the probe that produced it: a cut at a point inside a paragraph, heading, list item, table cell, code block and blockquote, at a block boundary and next to an image; what happens to an `annotation` mark that spans the point, ends at it or starts at it, to two marks with the same id, and to the stored `quote` of a spanning passage; whether the `UniqueID` extension gives fresh ids to moved nodes, and what stays the same across both halves; no cause is written as a cause.
**Depends on:** 1
**Estimate:** 5
**Notes:** Probes in the scratchpad using the schema of `frontend/components/Editor/editorExtensions.ts` and `frontend/src/lib/models/annotation-mark-ids.ts`. Tasks 11, 12 and 13 read this record before writing tests.
**POS:** task_8923f1e4
**Done:** [x]

### Task 7: FR-1 (j) shortcut shortlist and (k) paired-device and Android reach
**What:** Record every key binding that could clash with a chosen shortcut, produce the shortlist with the clash check for the owner, and record what a confirmed paired device and the Android build reach if new routes and menu items are added to shared code.
**Files:** `specs/features/split-at-cursor/experiments/task-7.md` (new; this task's results only)
**Done when:** `experiments/task-7.md` records, as observed values with the search or probe that produced each: (j) all `document`-level key handlers (`frontend/components/Layout/AppShell.tsx` and any other), the TipTap keymaps from StarterKit and each extension, the Electron menu and default accelerators, and the keys the browser reserves on hosted web, and from them a shortlist of at least three shortcuts, each with its clash check and the evidence for it; (k) what a confirmed paired device reaches on a new `/api` route that applies no limit, and what the Android build reaches if the new menu items and routes are added to shared code, with the check by which they are kept out (`NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`); no recommendation among the shortlist is made.
**Depends on:** 1
**Estimate:** 3
**Notes:** Reads and probes only. A browser-reserved key list is stated from a probe run or marked as not run; none is assumed. Task 8 reads this shortlist.
**POS:** task_bf61e250
**Done:** [x]

### Task 8: LEAD/OWNER: choose the shortcut (OQ-8)
**What:** The owner picks the Split shortcut from the Task 7 shortlist and the lead records it.
**Files:** `specs/features/split-at-cursor/experiments/task-8.md` (new; this task's results only)
**Done when:** `experiments/task-8.md` contains the line "Shortcut: <key combination>, <date>, <by>" written by the owner or recorded by the lead from the owner's word, naming the shortlist entry chosen and its clash check from `experiments/task-7.md`; or it records that none was chosen, in which case Task 27 is not dispatched and the work returns to the owner.
**Depends on:** 7
**Estimate:** 1
**Notes:** LEAD/OWNER, never run by the orchestrator. No agent chooses a key. The owner chose Mod+Shift+Enter (Cmd on macOS, Ctrl elsewhere), Owner decision, Task 8, Gate 5, 2026-11-16, and `experiments/task-8.md` exists; the Done line is left for the lead. Task 27 is the only task that binds a key and depends on this one.
**POS:** task_0cddca8b
**Done:** [x]

### Task 9: Contract: split types, constants and result unions
**What:** Define the inert shared contract: refusal reason codes, the merged-mark key-name constant, the lineage and latest-operation record shapes, the carry-over choice shape, and the typed result unions.
**Files:** `frontend/src/lib/models/split-types.ts` (new), `frontend/tests/unit/split-types.test.ts` (new), `frontend/tests/unit/split-core-import-graph.test.ts` (new), `specs/features/split-at-cursor/experiments/task-9.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: `split-types.ts` exports a distinct stable string reason for each refusal of FR-2 (image or audio resource, folder, Source, entity document, merged document, cursor in a table cell, cursor in a code block, empty first half, empty second half), plus the refusals of FR-6, FR-7 and FR-14 (stale cursor, locked project, a failed step naming the state that remains); one exported key-name constant for the merged mark (outside the client sidecar allowlist and `SIDECAR_CLEARABLE_KEYS`, asserted by a test that it is in neither); the lineage record shape (source document id, source revision id and number, operation `split`, date); the latest-operation record shape (kind `split` or `merge`, affected document ids, snapshot revision ids and numbers, new document id, date); the carry-over choice shape (annotation ids chosen, fields chosen, the new name); the five states of FR-15; typed result unions in which a failed outcome never shares a value with an empty one; it imports no React, JSX or JSON; `split-core-import-graph.test.ts` asserts every `frontend/src/lib/models/split-*.ts` file imports no React, JSX, JSON or `node:*` module (covers later files as they appear); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 1
**Estimate:** 3
**Notes:** No behaviour here. The record shapes are finalised against `experiments/task-3.md` by the tasks that write them (Tasks 15 and 20); if a measured fact contradicts a shape, that task stops and returns to the owner. Only this task edits `split-types.ts`.
**POS:** task_23348558
**Done:** [x]

### Task 10: Message constants module (drafted wording)
**What:** Add the one message-constants module holding every refusal, notice and failure text, drafted for the owner to review.
**Files:** `frontend/src/lib/models/split-messages.ts` (new), `frontend/tests/unit/split-messages.test.ts` (new), `specs/features/split-at-cursor/experiments/task-10.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: `split-messages.ts` has a text for every reason code of Task 9 (including the stated reason for a locked project, a stale cursor, a full compile exclusion list as the notice of FR-6, and a failed step that names the state that remains) and for the Undo refusals of FR-17 (original gone, snapshot gone, in Trash, purged, split-off document split since), each distinct; no text echoes client input; a test asserts every reason code has a text and no two texts are equal; the file imports no React, JSX or JSON (covered by Task 9's import-graph test); `experiments/task-10.md` lists every text for the owner's review and states the wording is a draft; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 9
**Estimate:** 2
**Notes:** Model on `frontend/src/lib/sharing/limits-copy.ts`. Wording is drafted, not final; the owner reviews it at Task 28. Texts are plain, state the cause and name no mechanism that no experiment separated.
**POS:** task_95788c4e
**Done:** [x]

### Task 11: Eligibility function (pure, FR-2)
**What:** Decide by one pure function whether a document can be split at a given offset, returning a distinct stable reason for each refusal, with the merged-mark seam.
**Files:** `frontend/src/lib/models/split-eligibility.ts` (new), `frontend/tests/unit/split-eligibility.test.ts` (new), `specs/features/split-at-cursor/experiments/task-11.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green, each pinned by its own test: an image resource, an audio resource, a folder, a Source, an entity document (a sidecar with `entityKind`) and a document with the merged key present each return their own reason from Task 9; a cursor inside a table cell and inside a code block is refused with its own reason; a cursor inside paragraph, heading, blockquote and list-item text is allowed; a cursor where the first half is empty, or holds only whitespace or empty paragraphs, is refused as empty; the same for the second half; the merged check reads one named predicate that reads the exported key-name constant of Task 9 and returns false for a sidecar without it, and a test proves the seam by substituting the key; the function does no I/O and takes the document and sidecar as arguments; the cut points follow `experiments/task-6.md`; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 6, 9
**Estimate:** 5
**Notes:** Used by the client to explain and by the server to enforce (Tasks 19, 20, 26). Read `experiments/task-6.md` before writing the tests; any cut position it does not cover is refused with a stated reason and not guessed.
**POS:** task_317ee586
**Done:** [ ]

### Task 12: Document cut (pure, FR-3 text half)
**What:** Cut a TipTap document at a text offset into a first half and a second half, splitting the node at the cursor and giving fresh ids to moved nodes.
**Files:** `frontend/src/lib/models/split-cut.ts` (new), `frontend/tests/unit/split-cut.test.ts` (new), `specs/features/split-at-cursor/experiments/task-12.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green, each pinned by its own test: a cut inside a paragraph, a heading, a blockquote and a list item yields two valid documents that together hold the original text with no character lost or duplicated; a cut at a block boundary and next to an image yields two valid documents; the function assigns a fresh id to every id-bearing node (paragraph, heading, blockquote, code block, table, nested ones included) that it places in the second half, including the second part of the node it splits, so that no id is shared between the halves, and it does not rely on the `UniqueID` extension or the editor (Owner decision, Gate 5, 2026-11-16; `experiments/task-6.md` measured that `UniqueID` gives no fresh ids to moved nodes and that both halves keep the same ids after a cut): a test cuts a document whose nodes carry ids and asserts that the set of ids in the second half is disjoint from the set in the first, that every id-bearing node of the second half has an id, that the first half's ids are unchanged, and that the id source is an argument so the test is deterministic; the first half's stored text is exactly the text before the offset; the function does no I/O, imports no React or JSX, and returns a distinct failed outcome for an offset it cannot cut, never an empty half; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 6, 9
**Estimate:** 5
**Notes:** Annotation marks are handled by Task 13, which depends on this function's cut position; this task keeps marks as they are in each half and returns the position of the cut. Node-level splitting follows OQ-3, as corrected at Gate 5: the fresh ids are assigned here, on the server side, and no later task may leave them to the editor.
**POS:** task_e5bb32e7
**Done:** [ ]

### Task 13: Annotation partition and mark cut (pure, FR-11)
**What:** Classify every annotation as before, after or spanning the cursor, apply the carry rules, shrink a spanning mark, and strip the marks of annotations not carried in the new document.
**Files:** `frontend/src/lib/models/split-annotations.ts` (new), `frontend/tests/unit/split-annotations.test.ts` (new), `specs/features/split-at-cursor/experiments/task-13.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green, each pinned by its own test: an annotation wholly before the cursor stays unchanged; one wholly after and chosen moves with its exact text, keeping body, `target` and claim status and date, and leaves the original's sidecar list; one wholly after and not chosen stays in the original's list and is detached there with its stored quote and body unchanged; one spanning the cursor stays with the original, its mark covers only the part that remains there, its stored quote is unchanged, and it is never duplicated or lost; no annotation id is shared between the two documents' lists or marks; in the new document the marks of annotations not carried are stripped; a note, a citation with its `target` and a claim are all handled the same whether or not their module is on; the result reports, for the dialog, which annotations are anchored in the moving text and which stay because they span; the 500-per-resource limit cannot be exceeded; the strip of marks in the new document leaves every node id of its input unchanged (ids are assigned by Task 12 and a test asserts none is restored, regenerated or shared with the original by this step; Owner decision, Gate 5, 2026-11-16, citing `experiments/task-6.md`); the function does no I/O; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 6, 9, 12
**Estimate:** 5
**Notes:** Mark behaviour at the cut is read from `experiments/task-6.md`; a case it does not cover is returned as a failed outcome naming the annotation id and not guessed. Reuse `frontend/src/lib/models/annotation-mark-strip.ts` and `frontend/src/lib/models/annotation-mark-ids.ts` by import without editing them.
**POS:** task_b26f7d20
**Done:** [ ]

### Task 14: Lineage-state resolver (pure, FR-15)
**What:** Resolve a lineage record against what is read from disk into exactly one of five states.
**Files:** `frontend/src/lib/models/split-lineage-resolver.ts` (new), `frontend/tests/unit/split-lineage-resolver.test.ts` (new), `specs/features/split-at-cursor/experiments/task-14.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green, one test per state: available; revision no longer kept (a fixture with the snapshot revision unprotected and deleted); document in Trash (a fixture with its revisions under `.trash/revisions`); document permanently removed (a purged source); could not be checked (a read failure, never folded into any other state, shown by a test that a failed read and an empty one return different states); the resolver does no I/O and takes what was read as arguments; nothing in the file renders or displays; the fixtures follow `experiments/task-3.md`; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 3, 9
**Estimate:** 3
**Notes:** Used only by Undo (Task 29); nothing in this feature displays a lineage state (FR-15, F120-4). The read side that gathers its inputs is written in Task 29.
**POS:** task_5305fdde
**Done:** [x]

### Task 15: Lineage and latest-operation records (store, FR-5 and FR-16)
**What:** Write and read the lineage record and the latest-operation record as new files under `meta/` through the storage adapter, outside the `project.json` schema, with the purge sweep leaving both alone.
**Files:** `frontend/src/lib/models/split-records-core.ts` (new), `frontend/src/lib/models/trash.ts` (only if `experiments/task-3.md` shows the purge sweep needs an exemption; recorded in `experiments/task-15.md` either way), `frontend/tests/unit/split-records-core.test.ts` (new), `specs/features/split-at-cursor/experiments/task-15.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: a lineage entry for a new document is written through the adapter and read back; a latest-operation record is written, read, replaced by a later one, and cleared; both files are per project; an encrypted project stores each encrypted and a read with no key fails closed with the existing locked error (not an empty read); a failed read returns a distinct failed outcome, never "none"; no client sidecar update can write or clear either (asserted against `CLIENT_WRITABLE_SIDECAR_KEYS` and `SIDECAR_CLEARABLE_KEYS`); Trash, restore, prune and purge of any document leave both files and every other document's entry unchanged (a test over each); a `project.json` write leaves both files as they were; the record shapes are those of Task 9 and a measured contradiction stops the task and returns to the owner; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 3, 9
**Estimate:** 5
**Notes:** The kind field accepts `split` and `merge` so Feature 121 needs no migration; nothing here writes a `merge`. Read `experiments/task-3.md` first. Only this task edits `trash.ts`.
**POS:** task_67fed586
**Done:** [x]

### Task 16: No-log truncating write (sibling to `updateRevisionInPlace`, FR-8)
**What:** Add a sibling function that overwrites a canonical revision's content under the same `revision-content` lock without a writing-log entry and without an automatic snapshot revision.
**Files:** `frontend/src/lib/models/revision-core.ts`, `frontend/tests/unit/revision-core-no-log-write.test.ts` (new), `specs/features/split-at-cursor/experiments/task-16.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: under the same `revision-content:<root>:<id>` lock the function calls `writeRevisionContent`, then `syncDerivedResourceContent`, then `mutateSidecar` for `wordCount` and `updatedAt`, and skips `snapshotBeforeDestructiveWrite` and `logCanonicalSave`; a truncation compared by directory listing leaves the writing-log directory byte-identical before and after; a truncation that `isDestructiveContentChange` would flag leaves no "Auto-backup" revision; a later ordinary `updateRevisionInPlace` edit still logs its own words as today; `content.txt`, `content.tiptap.json`, `wordCount` and `updatedAt` match the written text; it writes only the canonical revision named by the caller and refuses a non-canonical id; the existing `updateRevisionInPlace` behaviour is unchanged (its own tests pass unmodified); the function is also usable by Undo to overwrite the original's canonical content from the snapshot; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 2
**Estimate:** 3
**Notes:** Read `experiments/task-2.md` first. Only this task edits `revision-core.ts`. The caller (Task 20) holds the lock across the snapshot because `createRevision` takes none; this function must not take the lock a second time when the caller already holds it, which the lock-guard tests of Feature 93 check.
**POS:** task_0a9d41f8
**Done:** [x]

### Task 17: Per-document index update that reports failure (FR-9)
**What:** Add one awaited function that updates the derived data of a set of documents, rebuilds prose diagnostics for them, and returns failure instead of hiding it.
**Files:** `frontend/src/lib/models/split-index-update.ts` (new), `frontend/tests/unit/split-index-update.test.ts` (new), `specs/features/split-at-cursor/experiments/task-17.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: for a document set the inverted index, annotation-body index, backlinks, mention index (recomputed and not copied) and prose diagnostics reflect each document, and a link to the original still resolves; an injected failure in each step is returned as a failed outcome naming the document and step, and never shows as an empty or up-to-date index; after an injected failure `reindex` (the shared `rebuildDerivedIndexes`, which is all that `reindex` runs) gives, for the inverted index, annotation-body index, backlinks and mention index, a result equal to a full rebuild, compared in the test; a failed diagnostics step is not repaired by `reindex` and is written by the document's next save (`enqueueIndex`), each shown by a test, and `reindex` is not extended (Owner decision, Gate 5, 2026-11-16, citing `experiments/task-4.md` and `experiments/task-17.md`); the failure outcome carries what the writer-facing message of Task 22 needs to name the step; it does not use `withIndexingSuspended` and does not edit `indexer-queue.ts`; it runs without a whole-project reindex, shown by a spy on `rebuildDerivedIndexes`; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 4, 9
**Estimate:** 5
**Notes:** Read `experiments/task-4.md` first. It is awaited and reports; it is called after commit by Task 22 and is outside the split's rollback.
**POS:** task_32e91bb3
**Done:** [ ]

### Task 18: New document builder (FR-3 and FR-10)
**What:** Create the new text document after the original in tree order with a sidecar built from named keys, and a function that removes it again for compensation.
**Files:** `frontend/src/lib/models/split-new-document.ts` (new), `frontend/tests/unit/split-new-document.test.ts` (new), `specs/features/split-at-cursor/experiments/task-18.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: the new document is created in the same folder as the original at the end of the folder (max sibling + 1) and then placed directly after the original through `reorderResourcesCore`, the tree order shows it directly after the original and no other document's content or revision changes (only sibling `orderIndex` values the placement renumbers, as `experiments/task-5.md` records); it is named "<name> (part 2)" by default and takes a given name; it has its own id and its single initial canonical revision `v-1` written through the same initial-revision path as any new text document (`resource-initial-revision.ts`), with no copied revisions; its sidecar is built from named keys and is not a spread of the original's: it inherits the original's resource subtype, carries the metadata fields the choice names, carries no `entityKind`, aliases, `wordCountGoal`, annotations or stored `wordCount` unless chosen or derived, a field not carried is absent and never invented (a status not carried is absent as for "No status"), and the original's own metadata is unchanged; the remove function restores the folder and order as before the creation; a name collision follows the existing rule; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 3, 5, 9, 12
**Estimate:** 5
**Notes:** Read `experiments/task-3.md` and `experiments/task-5.md` first. Do not call `copyResourceCore` (it spreads the whole sidecar). The compile-exclusion inheritance is done by Task 20 through `seedCompileExclusion`, because it writes `project.json`. Placement uses `reorderResourcesCore`, never `moveResource` (`experiments/task-5.md`; Owner decision, Gate 5, 2026-11-16). The text it receives already carries fresh ids from Task 12; it neither generates nor repairs ids.
**POS:** task_a02391f0
**Done:** [ ]

### Task 19: Preview and staleness core (FR-7 server half, FR-12 data)
**What:** Add the server-side read that checks a cursor against the stored document and returns what the dialog shows: eligibility, word counts of each half, the annotations anchored in the moving text and those that stay.
**Files:** `frontend/src/lib/models/split-preview-core.ts` (new), `frontend/tests/unit/split-preview-core.test.ts` (new), `specs/features/split-at-cursor/experiments/task-19.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: given a validated `projectId`, a resource id, the canonical revision id, a content hash and a text offset, the function reads the stored canonical text, refuses a hash or revision mismatch as stale with the stale reason and changes nothing, returns the refusal of Task 11 for an ineligible document or cursor, and otherwise returns the word count of each half as `countWords(tiptapToPlainText(storedText))`, the annotations anchored in the moving text grouped by kind (note, citation, claim) with their ids and bodies, the annotations that stay because they span the cursor, and the document's carry-over field list (status, point of view, each custom field); it writes nothing (a write spy asserts it) for any outcome; a locked project rethrows the existing locked-access error and a failed read returns a distinct failed outcome, never an empty preview; the hash is computed in one exported pure function the client reuses (the same function, not a copy); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 2, 4, 11, 13
**Estimate:** 5
**Notes:** Read `experiments/task-2.md` (a) and `experiments/task-4.md` (l) first. The client flushes pending saves before it calls this and the apply call; that half is Task 25.
**POS:** task_6328278f
**Done:** [ ]

### Task 20: Split apply with ordered writes (FR-3 to FR-8, FR-10, FR-11, FR-16)
**What:** Apply a split as one operation in the decided order, holding the original's revision lock across the snapshot, with stale and overlap refusals.
**Files:** `frontend/src/lib/models/split-core.ts` (new), `frontend/tests/unit/split-core.test.ts` (new), `specs/features/split-at-cursor/experiments/task-20.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: the function checks staleness as Task 19 does inside the lock and refuses a mismatch before any write; it then writes in this order, with the locks taken in one recorded order and no non-reentrant lock nested (the lock-guard tests of Feature 93 pass): lock the original's revision; create the preserved snapshot revision of the original's full text read inside the operation, non-canonical, with `createRevision(..., { metadata: { name, preserve: true, splitSnapshot: true } })` named "Before split" plus the date; create the new document (Task 18); move the chosen annotations into the new document's sidecar and strip the uncarried marks there (Task 13); seed the compile exclusion for the new document through `seedCompileExclusion` when the original is excluded, and at the cap or an unreadable list proceed and return the notice; truncate the original with the no-log write (Task 16); write the lineage entry and then the latest-operation record last (Task 15); afterwards the original has every revision it had plus the snapshot and exactly one canonical revision, the new document has exactly its `v-1`, and no other document, folder or revision changed; the writing-log directory is byte-identical before and after and the daily goal is unchanged; the new document is placed directly after the original with `reorderResourcesCore`, not `moveResource` (Owner decision, Gate 5, 2026-11-16, citing `experiments/task-5.md`); the stored text of the new document, read from disk right after the apply with no editor running, has no node id in common with the stored text of the truncated original and every id-bearing node in it has an id (Owner decision, Gate 5, 2026-11-16, citing `experiments/task-6.md`: ids are assigned by the server-side split and never left to `UniqueID`); the lineage names the snapshot's number and id; the original keeps its id, name and canonical revision; a refusal of Task 11 writes nothing; a locked project writes nothing and rethrows the locked error; two overlapping splits of one document end with one applied and one refused (a test with two concurrent calls); the claim holds under one writer instance per tenant and the code comment says so; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 5, 13, 15, 16, 18, 19
**Estimate:** 5
**Notes:** Read `experiments/task-5.md` (lock edges, order) first. This task writes the forward path only; reverse compensation and the failure-injection suite are Task 21, which edits the same file, so the orchestrator must run it after this one. Neither task is mergeable alone, they ship in one PR. `withIndexingSuspended` is not used.
**POS:** task_ca6a5456
**Done:** [ ]

### Task 21: Reverse compensation and failure injection (FR-6)
**What:** Add reverse compensation to the split and a test that injects a failure after each write step.
**Files:** `frontend/src/lib/models/split-core.ts`, `frontend/src/lib/models/split-new-document.ts` (only if the cleanup of a discarded new document belongs in Task 18's remove function; recorded in `experiments/task-21.md` either way), `frontend/tests/unit/split-core-compensation.test.ts` (new), `specs/features/split-at-cursor/experiments/task-21.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: a failure injected after each write step of Task 20's order (snapshot, new document, annotations moved, exclusion seeded, truncation, lineage record, latest-operation record) undoes the earlier steps in reverse, and the original, the new document, the revisions, the sidecars, the project record, the saved compile exclusions, the lineage file and the latest-operation record are as they were before the split, compared by a directory snapshot in which the `project.json` `metadataRevision` counter is excluded from the comparison because it is allowed to advance (Owner decision, Gate 5, 2026-11-16); a separate test asserts the counter may be higher after a failed split and that no other `project.json` field differs; no half-written new document remains listed; after every injected failure the compensation has also removed the empty `.trash` directories it created, and the diagnostics record for the discarded new document (each asserted by listing, citing `experiments/task-5.md`); the snapshot revision is deleted by clearing its preserve flag with `setRevisionPreserve(false)` before `deleteRevision`, and a test shows a compensation that skipped the flag would be refused and that the snapshot is gone after the real one;  the failure is returned with the step that failed and never reads as success; a step that cannot be undone is returned with the state that remains named by a text of Task 10, and a test injects a failing compensation to prove it; the derived-index update is outside the rollback; the recorded results of `experiments/task-5.md` (what compensation leaves on disk) are compared with what the tests observe and any difference is written in `experiments/task-21.md`; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 20
**Estimate:** 5
**Notes:** Edits `split-core.ts` after Task 20, serial. The failed-state message texts are read from `split-messages.ts`, not edited here.
**POS:** task_b2250203
**Done:** [ ]

### Task 22: Post-commit index update wiring and failure report (FR-9)
**What:** Call the Task 17 update after the split commits, awaited, and return an index failure to the writer without rolling the split back.
**Files:** `frontend/src/lib/models/split-core.ts`, `frontend/src/lib/models/split-messages.ts` (only the index-failure text; see Done when), `frontend/tests/unit/split-messages.test.ts`, `frontend/tests/unit/split-core-index.test.ts` (new), `specs/features/split-at-cursor/experiments/task-22.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: after a committed split both documents' derived data is updated by the Task 17 function without a whole-project reindex; an injected index failure leaves the split applied and returns an index-failure outcome naming what failed, never an empty or up-to-date result; the writer-facing text of that outcome, in `split-messages.ts` (this task adds it, or edits it if Task 10 left one, with `split-messages.test.ts` still green), says that `reindex` repairs the indexes and that prose diagnostics refresh on the document's next save, and does not say that `reindex` repairs diagnostics (Owner decision, Gate 5, 2026-11-16); after the injected failure `reindex` gives the result of a rebuild for the four indexes (compared) and `reindex` is not extended; this task owns the sidecar `wordCount` duty of FR-9: after commit it writes the new document's `wordCount` through `mutateSidecar` as `countWords(tiptapToPlainText(text))` (nothing else on the index paths writes it, `experiments/task-4.md` and `experiments/task-17.md`), a failure of that write is returned as an index failure and does not roll back, and a test checks that the `wordCount` of both documents, the original's having been written by Task 16, matches `countWords(tiptapToPlainText(text))`; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 17, 21
**Estimate:** 3
**Notes:** Edits `split-core.ts` after Task 21, serial. The failure does not trigger Task 21's compensation (Owner decision, Gate 3, 2026-11-16).
**POS:** task_dcd8b2bc
**Done:** [ ]

### Task 23: Preview and split routes, client, sharing-gate enumeration and smoke count (FR-14)
**What:** Add the preview and split routes in the storage context, the client functions, and the enumeration and smoke-count entries.
**Files:** `frontend/app/api/project/split/preview/route.ts` (new), `frontend/app/api/project/split/route.ts` (new), `frontend/src/lib/api/split.ts` (new), `frontend/tests/unit/split-routes.test.ts` (new), `frontend/tests/unit/split-transport.test.ts` (new), `frontend/tests/unit/sharing-gate-enumeration.test.ts`, `frontend/scripts/sharing-refusal-smoke.mjs`, `specs/features/split-at-cursor/experiments/task-23.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: each route runs inside `withStorageContext`, takes a validated `projectId` and resource ids and no path, rejects a malformed id or body with one refusal text that does not echo client input, calls fake cores and returns the typed outcomes (applied, refused with its reason, stale, index-failed, failed with the state that remains), raises the locked error and writes nothing on a locked project with the lock prompt offered as for other writes, and on hosted web a write touches only the signed-in tenant's project (a tenant-scoping test, not a claim from a device); each route is classified by the paired-device gate, a confirmed paired device is allowed with no `checkLimit` as the capture and claims routes are, and no sixth limit switch is added; `sharing-gate-enumeration.test.ts` enumerates the two routes and its count is raised, never loosened; the smoke count in `frontend/scripts/sharing-refusal-smoke.mjs` is updated where it lives; the client maps a thrown fetch or non-ok response to a distinct failed result (never "no result"), rethrows the locked error and sends only validated fields; the Android build gets no backend pair and the record says the transport is HTTP-only; `pnpm typecheck` and `pnpm lint` are run, and `pnpm test:sharing-smoke` is reported as run or not run (it needs a build, so it is not run here).
**Depends on:** 7, 19, 22
**Estimate:** 5
**Notes:** Follow `frontend/app/api/project/capture/route.ts` and `frontend/tests/unit/claims-route.test.ts`. Read `experiments/task-7.md` (k) first. This task and Task 31 edit the enumeration test and the smoke script, so Task 31 runs after it.
**POS:** task_54172f2f
**Done:** [ ]

### Task 24: Split dialog component (FR-12, FR-19)
**What:** Build the carry-over dialog: fixed defaults, per-annotation checkboxes grouped by kind, a choice per metadata field, word counts of each half, the spanning-annotation note and an editable name.
**Files:** `frontend/components/Split/SplitDialog.tsx` (new), `frontend/tests/component/SplitDialog.test.tsx` (new), `frontend/tests/component/SplitA11y.test.tsx` (new), `frontend/stories/Split/SplitDialog.stories.tsx` (new), `specs/features/split-at-cursor/experiments/task-24.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: the dialog opens with annotations anchored in the moving text ticked (per annotation, grouped by kind) and every metadata field unticked, with the same defaults whatever the last choice was; it stores nothing between operations (a test asserts no `localStorage` and no config write); Cancel and Escape change nothing (a test counts writes and calls); it says which annotations stay with the original because they span the cursor; it shows how much text each half holds from the preview data; the name is editable and starts "<name> (part 2)"; an inline refusal known before the split is shown in the dialog from the Task 10 constants; a failure and a status after the split are shown in `role="alert"` and `role="status"` regions; focus enters the dialog and returns on close; lists are lists with accessible names; state is in text and not colour alone, no red; keyboard operation and axe pass; a story per state is written after reading the stories of `frontend/components/Capture/CaptureBox.tsx`'s neighbours and any shared control used; the stories typecheck and lint; `pnpm typecheck` and `pnpm lint` are run; a screen-reader run is listed as not verified.
**Depends on:** 10, 23
**Estimate:** 5
**Notes:** Presentational with props for data and callbacks. Read the source and stories of every shared control before using a prop. The wording shown is the drafted text of Task 10; the owner reviews it at Task 28.
**POS:** task_70d12860
**Done:** [ ]

### Task 25: Split host (flush, request, reload, cursor at end) (FR-7 client half)
**What:** Mount the host that flushes pending saves, previews, opens the dialog, applies, and then shows the stored state of the original with the cursor at its end.
**Files:** `frontend/components/Split/SplitHost.tsx` (new), `frontend/components/TipTapEditor.tsx`, `frontend/components/Layout/AppShell.tsx`, `frontend/tests/component/SplitHost.test.tsx` (new), `specs/features/split-at-cursor/experiments/task-25.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: the host sends any pending save before the preview request (a test with a pending save asserts the order of calls with `flushPendingSaves`); a stale outcome shows its message and changes nothing; after a successful split no autosave of the pre-split text overwrites the truncated original (a test holds a pending autosave and shows it does not write after the apply), and the open editor shows the stored state of the document it shows with the cursor at its end; the original stays open; a locked project opens the unlock prompt as other writes do; the host mounts in `AppShell.tsx` and works from an open editor only; nothing here binds a key, adds a menu item or a palette row; an index failure and the compile-exclusion notice are shown as toasts like other compile and Inbox notices; the existing `TipTapEditor` and `AppShell` tests pass unmodified; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 23, 24
**Estimate:** 5
**Notes:** Read `frontend/src/lib/pending-saves.ts`, `frontend/components/Capture/CaptureBoxHost.tsx` and the `TipTapEditor.tsx` autosave path before editing. The host exposes one open-request function that Tasks 26 and 27 call. Only this task edits `TipTapEditor.tsx`.
**POS:** task_a1e3520e
**Done:** [ ]

### Task 26: Editor context menu item with disabled reasons and Android exclusion (FR-13, FR-2)
**What:** Add Split to the editor's context menu, disabled with its stated reason for a document the eligibility function refuses by type, and absent on the Android runtime.
**Files:** `frontend/components/Editor/EditorContextMenu.tsx`, `frontend/tests/component/EditorContextMenuSplit.test.tsx` (new), `specs/features/split-at-cursor/experiments/task-26.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: the menu has a Split item that opens the same dialog through the host of Task 25 for the open document; for an image, audio, Source, entity or merged document the item is shown disabled with its stated reason from Task 10 and is not hidden (a test per reason); a refusal that depends on the cursor (table cell, code block, empty half) is shown inline in the dialog and not by hiding the item; with `NEXT_PUBLIC_GETWRITE_RUNTIME` set to native the item is not rendered and no request is made (inline check as in `CitationFieldsSection.tsx`); the item is keyboard operable with an accessible name; Split is not added to the tree's context menu (`ResourceContextMenu.tsx` is not edited, asserted by its existing tests passing unmodified); axe passes; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 10, 11, 25
**Estimate:** 3
**Notes:** Read the source and tests of `EditorContextMenu.tsx` first; its full item list is not known (FR-1 table). The shortcut is not bound here (Task 27).
**POS:** task_156a56b8
**Done:** [ ]

### Task 27: Command palette row and keyboard shortcut (FR-13, FR-19)
**What:** Add the Split row to the command palette and bind the chosen shortcut, Mod+Shift+Enter (Cmd on macOS, Ctrl elsewhere; Owner decision, Task 8, Gate 5, 2026-11-16), both opening the same dialog.
**Files:** `frontend/components/common/ResourceCommandPalette.tsx`, `frontend/components/Layout/AppShell.tsx`, `frontend/tests/component/SplitEntryPoints.test.tsx` (new), `specs/features/split-at-cursor/experiments/task-27.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: the palette has a Split row that opens the same dialog through the host of Task 25 for the open document and is disabled with its stated reason for an ineligible document type; the shortcut recorded in `experiments/task-8.md`, Mod+Shift+Enter (Cmd on macOS, Ctrl elsewhere), opens the same dialog, a test fires a real key event for it and asserts it is distinct from Mod+Enter in TipTap (Mod+Enter neither opens the dialog nor loses its TipTap behaviour, and Mod+Shift+Enter does not trigger TipTap's Mod+Enter binding), is bound on `document` without breaking Cmd/Ctrl+K and Cmd/Ctrl+Shift+K (their existing tests pass unmodified), and a test asserts that no other recorded binding of `experiments/task-7.md` changes; with the native runtime neither the row nor the key is active; with no document open the key does nothing and writes nothing; the row has an accessible name and is keyboard operable; axe passes; `experiments/task-27.md` records the browser-reserved-key check for Mod+Shift+Enter on hosted web and the Electron default menu check each as run or not run, because neither was measured (`experiments/task-8.md`); `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 8, 10, 11, 25
**Estimate:** 3
**Notes:** The only task that binds a key. `experiments/task-8.md` records Mod+Shift+Enter, so the task is dispatched; had it recorded none, it would not be. The `AppShell.tsx` document key handler has no native-runtime check (`experiments/task-7.md`), so this task keeps the key off Android. Read the source and stories of the palette before using any prop.
**POS:** task_70d7d231
**Done:** [ ]

### Task 28: LEAD/OWNER: wording review of the message constants (FR-2, OQ-12)
**What:** The owner reviews the drafted wording of every text in the message constants module, as shown by the dialog, menu, palette and toasts, and the lead applies the owner's edits.
**Files:** `frontend/src/lib/models/split-messages.ts`, `frontend/tests/unit/split-messages.test.ts`, `specs/features/split-at-cursor/experiments/task-28.md` (new; this task's results only)
**Done when:** `experiments/task-28.md` records the owner's decision on each text (kept or the new wording, with the date and who) and `split-messages.ts` carries the final wording with `split-messages.test.ts` still green (every code has a text, no two equal); a text not reviewed is listed as such and left drafted.
**Depends on:** 24, 25, 26, 27
**Estimate:** 1
**Notes:** LEAD/OWNER, never run by the orchestrator. The spec places this review in the UI task; it is made its own step after the UI tasks so the owner sees the texts in place. Only this task and Task 10 edit the two files.
**POS:** task_492bf42a
**Done:** [ ]

### Task 29: Undo split core (FR-15 read side, FR-17)
**What:** Undo the latest split as one operation that saves both documents' current text as preserved revisions, restores the original from the snapshot, moves carried annotations back, trashes the split-off document and clears the record.
**Files:** `frontend/src/lib/models/split-undo-core.ts` (new), `frontend/tests/unit/split-undo-core.test.ts` (new), `specs/features/split-at-cursor/experiments/task-29.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: it reads the latest-operation record (Task 15), gathers what the lineage resolver needs and resolves through Task 14; it refuses, naming the cause by a distinct text and changing nothing, when the original or the snapshot is gone, in Trash or purged, or when the split-off document has been split since (a test per case); otherwise it first saves the current text of the original and of the split-off document each as its own preserved revision, then overwrites the original's canonical content from the snapshot with the no-log function (not `setCanonicalRevision`) so its text equals its text before the split, moves carried annotations back into the original's sidecar, sends the split-off document to Trash through the existing soft delete (a split-off document already in Trash makes that step a no-op, and it is never purged), removes its compile-exclusion entry with `removeCompileExclusions`, and clears the latest-operation record so Undo runs once; after Undo no text exists only where Undo made it unreachable: an edit made after the split is in a preserved revision of the document it was made in, and a note body is on the original or in the trashed document (tests with an edit between split and Undo); it syncs the original's derived files, `wordCount` and indexes through Task 17's function, reporting an index failure without rolling back; the writing-log directory is byte-identical across Undo; it works from the stored record after a reload (a test that reads the record from disk with no in-memory state); `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 14, 15, 16, 17, 22
**Estimate:** 8
**Notes:** Built last among the feature tasks, by owner decision (F120-1). This task writes the forward path and the refusals; rollback of a failed Undo is Task 30, which edits the same file, so it runs after this one. The refusal texts are read from `split-messages.ts` (Task 10), not edited here.
**POS:** task_93383f63
**Done:** [ ]

### Task 30: Undo rollback and failure injection (FR-6 rules applied to Undo)
**What:** Add reverse compensation to Undo and a test that injects a failure after each of its write steps.
**Files:** `frontend/src/lib/models/split-undo-core.ts`, `frontend/tests/unit/split-undo-compensation.test.ts` (new), `specs/features/split-at-cursor/experiments/task-30.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: a failure injected after each write step of Task 29's order (the two preserved revisions, the original's overwrite, annotations moved back, the soft delete, the exclusion removal, the record clear) undoes the earlier steps in reverse, so the split state before Undo is restored and compared by a directory snapshot, and the latest-operation record is still present; the failure is returned with the step that failed and never reads as success; a step that cannot be undone is returned with the state that remains named, shown by a test with a failing compensation; two overlapping Undo calls end with one applied and one refused; `pnpm typecheck`, `pnpm lint`, both Electron typecheck passes and the CLI typecheck are run.
**Depends on:** 29
**Estimate:** 5
**Notes:** Edits `split-undo-core.ts` after Task 29, serial.
**POS:** task_a0daccf7
**Done:** [ ]

### Task 31: Undo and latest-operation routes, client, enumeration and smoke count (FR-14)
**What:** Add the Undo route and the latest-operation read route, their client functions, and the enumeration and smoke-count entries.
**Files:** `frontend/app/api/project/split/undo/route.ts` (new), `frontend/app/api/project/split/latest/route.ts` (new), `frontend/src/lib/api/split.ts`, `frontend/tests/unit/split-undo-routes.test.ts` (new), `frontend/tests/unit/split-transport.test.ts`, `frontend/tests/unit/sharing-gate-enumeration.test.ts`, `frontend/scripts/sharing-refusal-smoke.mjs`, `specs/features/split-at-cursor/experiments/task-31.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: both routes run inside `withStorageContext`, take a validated `projectId` and no path, reject a malformed body with one refusal text that does not echo client input, return the typed outcomes (undone, refused with its cause, failed with the state that remains; for the read, the record or none, with a failed read distinct from none), fail closed on a locked project with the lock prompt as for other writes, and on hosted web a call touches only the signed-in tenant's project (a tenant-scoping test); both are classified by the paired-device gate, allowed for a confirmed paired device with no `checkLimit`, and no sixth limit switch is added; the enumeration count and the smoke count are raised where they live, never loosened; the client functions map a thrown fetch or non-ok response to a distinct failed result and rethrow the locked error; `pnpm typecheck` and `pnpm lint` are run.
**Depends on:** 23, 30
**Estimate:** 5
**Notes:** Edits the files Task 23 edited, so it runs after it. Undo is HTTP-only with no native backend pair; the documentation says so (Task 33).
**POS:** task_bc9a8928
**Done:** [ ]

### Task 32: Undo split action in the palette and the editor menu (FR-18, FR-19)
**What:** Offer "Undo split" in the command palette and the editor context menu in any open document while the latest operation is a split.
**Files:** `frontend/components/common/ResourceCommandPalette.tsx`, `frontend/components/Editor/EditorContextMenu.tsx`, `frontend/components/Layout/AppShell.tsx`, `frontend/tests/component/SplitUndoAction.test.tsx` (new), `frontend/stories/Split/SplitUndoAction.stories.tsx` (new), `specs/features/split-at-cursor/experiments/task-32.md` (new; this task's results only)
**Done when:** Tests first, shown failing, then green: the action appears only while the latest-operation read returns a split, in any open document (a test with an unrelated document open), reachable after a reload (a test that mounts from the stored record), and is absent when the record is none or is not a split; it names the split-off document and states that it goes to Trash and that edits made since are kept; it is keyboard operable with an accessible name; success is reported in a `role="status"` region and failure or a refusal cause in `role="alert"`, from the Task 10 texts; after a successful Undo the open editor shows the stored state of the document it shows; a failed read of the record shows its own message and does not read as no split; the action is not rendered on the native runtime; the existing palette, menu and `AppShell` tests pass unmodified; axe passes; stories typecheck and lint; `pnpm typecheck` and `pnpm lint` are run; screen-reader use is listed as not verified.
**Depends on:** 26, 27, 31
**Estimate:** 5
**Notes:** Last UI task, serial after Tasks 26 and 27, which edit the same files. Read the source of each file and the stories of any shared control first.
**POS:** task_fa9780d5
**Done:** [ ]

### Task 33: Documentation for the scribe (FR-22 documents)
**What:** Update the handbook, the feature documents, `frontend/CLAUDE.md`, the root `CLAUDE.md` glossary and the Android note, without any sentence that states an unmeasured result as fact.
**Files:** `docs/user/handbook/write/split-at-cursor.md` (new), `docs/features/revisions.md`, `docs/features/annotations.md`, `docs/features/writing-log.md`, `docs/features/indexing.md`, `docs/features/home-network-sharing.md`, `frontend/CLAUDE.md`, `CLAUDE.md`, `android/CLAUDE.md`, `specs/features/split-at-cursor/experiments/task-33.md` (new; this task's results only)
**Done when:** The handbook page describes Split, the dialog, the refusals and Undo split in plain language with no test-run evidence; `docs/features/revisions.md` describes the Split snapshot (preserved, non-canonical, named "Before split" plus the date); `docs/features/annotations.md` states how a note, citation or claim is carried and that a spanning one stays; `docs/features/writing-log.md` states that a split and its Undo add no entry; `docs/features/indexing.md` states the per-document update that reports failure and that `reindex` repairs it; `docs/features/home-network-sharing.md` records the new routes in the enumeration and the smoke count where they apply; `frontend/CLAUDE.md` Code Map lists each new file; the root `CLAUDE.md` glossary has entries for Lineage record, Split snapshot and Latest operation; `android/CLAUDE.md` says the transport is HTTP-only with no native backend pair and the split surfaces are not offered; every statement of fact is traceable to a task record in `experiments/` or is marked as read; `experiments/task-33.md` lists each statement and its source.
**Depends on:** 32
**Estimate:** 3
**Notes:** Only this task edits these documents. It states no device result; the device runs are Tasks 35 and 36.
**POS:** task_92b90db4
**Done:** [ ]

### Task 34: LEAD-RUN: build check
**What:** Run the typecheck, lint, tests and builds outside the sandbox from the main checkout and record each as run or not run.
**Files:** `specs/features/split-at-cursor/experiments/task-34.md` (new; this task's results only)
**Done when:** `experiments/task-34.md` records, for each of `pnpm typecheck`, `pnpm lint`, `pnpm test:ci`, `pnpm build`, `pnpm build:native`, the Storybook build, `pnpm --filter getwrite-electron typecheck` (both passes) and `pnpm --filter getwrite-cli typecheck`: run or not run, the commit, the build time, the exit status and the failing output verbatim for any failure, from the main checkout and outside the command sandbox; the `core-import-graph` and `split-core-import-graph` tests are named; a failure returns to the task that owns the file.
**Depends on:** 28, 32, 33
**Estimate:** 3
**Notes:** LEAD-RUN. Builds fail in worktrees here, so these run only from the main checkout.
**POS:** task_35168653
**Done:** [ ]

### Task 35: LEAD-RUN: packaged desktop run with the owner
**What:** Run the feature in the packaged desktop app with the owner and record only what was observed.
**Files:** `specs/features/split-at-cursor/experiments/task-35.md` (new; this task's results only)
**Done when:** `experiments/task-35.md` records the build (commit and build time), the platform and version, and for each of the following what was observed, with the writing-log directory checked before and after: a split of a document with a note, a citation and a claim before, after and across the cursor; each refusal (type, Source, entity, merged-seam, table cell, code block, empty first half, empty second half); Cancel; the carry-over choices; a reload; Undo split after a reload with an edit made between the split and the Undo; a locked encrypted project; a path not run is listed under "Not verified" with at least Android, a paired device, screen-reader use and a document of hundreds of thousands of words; nothing is claimed that was not observed.
**Depends on:** 34
**Estimate:** 5
**Notes:** LEAD-RUN with the owner, outside the sandbox from the main checkout. A unit test or an emulator run is never reported as a device run.
**POS:** task_9a2d76bf
**Done:** [ ]

### Task 36: LEAD-RUN: hosted web run with the owner, including a second tenant
**What:** Run the same checks on hosted web with the owner and check that a second tenant cannot reach the first's project.
**Files:** `specs/features/split-at-cursor/experiments/task-36.md` (new; this task's results only)
**Done when:** `experiments/task-36.md` records the build (commit and build time), the platform and version, and what was observed for the same list as Task 35 on hosted web, plus a second tenant that cannot reach the first's project through each new route (preview, split, undo, latest); the claim is stated under one writer instance per tenant; "Not verified" includes a hosted deployment of several server instances and every path not run.
**Depends on:** 34
**Estimate:** 5
**Notes:** LEAD-RUN with the owner, outside the sandbox from the main checkout. Hosted claims are stated only for what was observed.
**POS:** task_c5168b00
**Done:** [ ]

### Task 37: LEAD-RUN: CI, documents and close-out
**What:** Run every CI workflow command, record each as run or not run, link the per-task records in `experiments.md` and close the experiments index.
**Files:** `specs/features/split-at-cursor/experiments.md`, `specs/features/split-at-cursor/experiments/task-37.md` (new; this task's results only)
**Done when:** `experiments/task-37.md` lists every command from `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` taken from the workflows at that time, each reported as run or not run from the place the workflow runs it (builds and e2e outside the sandbox from the main checkout), with the exit status and the commit; `experiments.md` links every `experiments/task-<n>.md`, carries the Shortcut decision line of Task 8, the Runs and Not verified sections (including Android, a paired device, screen-reader use, a document of hundreds of thousands of words, a hosted deployment of several server instances and any path not run) and the Acceptance heading, with no sentence stating an unmeasured result as fact; the spec's Open Questions are unchanged except OQ-8, whose resolution is linked to Task 8.
**Depends on:** 35, 36
**Estimate:** 5
**Notes:** LEAD-RUN. The last task before the PR. Only this task and Task 1 edit `experiments.md`.
**POS:** task_95a7bac7
**Done:** [ ]

## Summary
- Total tasks: 37
- Total estimated effort: 156 story points
- Critical path: Tasks 1 → 6 → 12 → 13 → 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 32 → 33 → 34 → 35 → 37 (an equal-length chain, 22 → 29 → 30 → 31 → 32, ties with it at 18 points after Task 22 and runs in parallel with it)
- Risks: Task 6 (the TipTap cut and mark behaviour) feeds Tasks 11, 12 and 13, and a cut or mark case it does not cover is refused or returned as failed and not guessed, so an unexpected result there changes three tasks; Task 3 may show that a new top-level sidecar key or a `meta/` file does not survive a writer, or that the purge sweep needs an exemption in `trash.ts`, which Tasks 14, 15 and 18 would absorb, and a value-losing behaviour is returned to the owner; Task 2 may show a pending autosave can write after a split or that two callers can pick one version number, which changes Task 20's locking and Task 25's flush; Task 5 may show `reorderResourcesCore` is not reachable from model code or that placement renumbers other siblings, which changes Task 18's scope and Task 21's compensation; the apply (Tasks 20 to 22) and Undo (Tasks 29 and 30) each span one file in two or three serial tasks, so the critical path is long and not parallelisable; Task 20 takes locks in a recorded order and the lock-guard tests of Feature 93 may reject the first order; Task 29 is estimated 8 because it combines the resolver read side, preserved revisions of two documents, the restore and the Trash step; Task 8 is an owner decision (made: Mod+Shift+Enter) and gates Task 27 only; the browser-reserved keys and Electron default menu were not measured and are checked or left as not run at Task 27; Task 28 waits on the owner's review of wording and does not gate any code task; the Task 3 measurement of the encrypting adapter path for the `meta/` files may show tenancy or key behaviour the spec did not read; the hosted claim holds under one writer instance per tenant and several server instances is not verified; Tasks 8, 28, 34, 35, 36 and 37 are LEAD-RUN or owner steps and depend on an unsandboxed main checkout and on devices; Android, a paired device, screen-reader use and a document of hundreds of thousands of words are not verified by any task.

## Open Questions

- OQ-8 (from the spec): resolved. Mod+Shift+Enter (Cmd on macOS, Ctrl elsewhere), Owner decision, Task 8, Gate 5, 2026-11-16, from the Task 7 shortlist. Browser-reserved keys and the Electron default menu were not measured, so Task 27 tests the key event (distinct from Mod+Enter in TipTap) and records the browser check as run or not run.
- Task-list question (for the lead, not resolved here): the spec makes Task 1 the whole FR-1 record, items (a) to (m). This list makes Task 1 the index and environment record and puts the items into Tasks 2 to 7, one file each, because thirteen probes do not fit one session and one writer per file keeps parallel lanes safe. The lead may instead merge Tasks 2 to 7 into Task 1.
- Task-list question (for the lead, not resolved here): the spec asks for the owner to review the message-constants wording "in the UI task". This list does it at Task 28, a separate LEAD/OWNER step after Tasks 24 to 27, so the owner sees the texts in place and Task 28 does not hold any agent task. The lead may fold it into Task 24 or Task 26 instead.
