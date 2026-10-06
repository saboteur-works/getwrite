# Tasks: Entity Mention Noise Flagging

Source spec: `specs/features/entity-mention-noise-flagging.md` (FR-1–FR-15, all
Open Questions resolved).

Dependency shape: a small cluster of foundational schema/data tasks (1–4) feed
a core logic task (5) and a project-list core task (6); the three per-runtime
global-list persistence tasks (8, 9, 10) are mutually independent and can run
in parallel with each other and with tasks 1–7; everything else fans back in
once the core logic and the collapsed global-list transport (11) exist.

### Task 1: Bundled word-frequency data file
**What:** Add a committed, static top-N (~2,000–3,000 word) English
frequency word list as a plain repo data file, replacing the current ~20-word
hardcoded list.
**Files:** New `frontend/src/lib/models/bundled-noise-words.ts` (or
`.json` data file imported by it); removes/retires the hardcoded list
currently in `entity-alias-warnings.ts`.
**Done when:** The file exports an array of ~2,000–3,000 lowercase English
words, sourced from a frequency list (not a full dictionary package), added
as a plain committed constant with no new npm dependency — mirroring
`inverted-index.ts`'s `STOP_WORDS` precedent.
**Depends on:** none
**Estimate:** 2
**Notes:** Source the list from a permissively-licensed public
frequency-rank dataset; record the source/license in a code comment. Keep the
format a flat array so downstream union logic (Task 5) treats it like any
other word list.
**Done:** [ ]

### Task 2: Project config schema — custom noise list + global-word exclusions
**What:** Add the per-project custom noise-word list (FR-3) and per-project
global-word exclusion list (FR-6) to project config.
**Files:** `frontend/src/lib/models/schemas.ts` (`ProjectConfigSchema`),
`frontend/src/lib/models/project-config.ts`.
**Done when:** `ProjectConfigSchema` has two new optional string-array
fields (custom noise words; excluded global words), each validated as
non-empty trimmed strings, mirroring `config.statuses`'s existing shape;
both default to `[]` for projects created before this feature; schema unit
tests cover add/validate/default.
**Depends on:** none
**Estimate:** 2
**Done:** [ ]

### Task 3: Sidecar schema — dismissal state
**What:** Add a new field to the entity sidecar recording dismissed
noise-observation terms (FR-8/FR-9/FR-13).
**Files:** `frontend/src/lib/models/schemas.ts`
(`EntitySidecarFieldsSchema` or equivalent).
**Done when:** Sidecar schema has a new optional field (e.g.
`dismissedNoiseTerms: string[]`) storing normalized, case-folded dismissed
terms scoped to that one entity's own sidecar; defaults to `[]`; schema unit
tests cover add/validate/default.
**Depends on:** none
**Estimate:** 1
**Done:** [ ]

### Task 4: Copy review — finalize observation strings
**What:** Draft and get sign-off on the non-imperative, neutral-aside
observation copy for both the alias case and the newly-covered name case
(FR-10), replacing `getAliasWarning`'s current directive-leaning strings.
**Files:** New `frontend/src/lib/models/entity-noise-copy.ts` (or similar)
holding the approved string constants; no UI wiring yet.
**Done when:** Approved copy strings exist for (a) the alias-warning case
and (b) the name case, stating a fact about the term rather than instructing
the writer, with no imperative language; strings are reviewed/approved
(lightweight copy-review beat per FR-10) before Tasks 14/15 consume them.
**Depends on:** none
**Estimate:** 1
**Notes:** This is the FR-10 "lightweight review step" the spec defers;
resolve it here rather than inventing wording ad hoc inside the UI tasks.
**Done:** [ ]

### Task 5: Noise-check core module — union formula + dismissal
**What:** Extend/replace `entity-alias-warnings.ts`'s `getAliasWarning` into
a shared noise-check function applied identically to `name` and `aliases`
(FR-1), evaluating the FR-7 union/exclusion formula (bundled ∪ project
custom ∪ global, minus project-excluded global words) and suppressing a
dismissed term (FR-8, scoped per-entity-per-term per FR-13).
**Files:** `frontend/src/lib/models/entity-alias-warnings.ts` (or a renamed
`entity-noise-check.ts`); any call sites of the current `getAliasWarning`.
**Done when:** A single function takes a term (name or alias), the
project's custom/excluded lists, the resolved global list, and the entity's
dismissed-terms set, and returns the flag/no-flag result per FR-7's union
formula with dismissal suppression per FR-8/FR-13; `entity-detection.ts` and
the mention index are untouched (FR-12); unit tests cover: bundled-list
match, project-custom match, global-list match, project-exclusion
suppressing a global match, dismissal suppressing a repeat observation, and
dismissal not carrying over once the term text changes.
**Depends on:** Task 1, Task 2, Task 3, Task 4
**Estimate:** 5
**Done:** [ ]

### Task 6: Project noise-word list core + API
**What:** Add the read/write core and API route for a project's custom
noise-word list (FR-3) and global-word exclusion list (FR-6).
**Files:** New `frontend/src/lib/models/project-noise-words-core.ts` (or
folded into `project-config.ts`), new
`frontend/app/api/project/noise-words/route.ts`, new
`frontend/src/lib/api/project-noise-words.ts`,
`frontend/src/lib/api/schemas.ts` (`NoiseWordListsResponseSchema`).
**Done when:** A project's custom list and exclusion list can be read, and
individual words added/removed, through a core function + HTTP route
(mirroring the existing `config.statuses` read-modify-write shape); response
body validated per the transport-validation precedent; tests cover add,
remove, and exclude/un-exclude a global word.
**Depends on:** Task 2
**Estimate:** 5
**Done:** [ ]

### Task 7: Dismissal write path
**What:** Add the write-path helper that sets/clears a dismissed term on an
entity's sidecar through the existing `updateSidecar` mechanism (FR-9),
with no new transport.
**Files:** `frontend/src/lib/models/resource-crud-core.ts` (or a thin
helper alongside it); no new API route.
**Done when:** A dismiss/undismiss action persists to the entity's sidecar
via the existing `updateSidecar` write path (reusing its `clearKeys`
pattern where appropriate), survives reload, and a later change to the
term's text does not retain the old dismissal (FR-8); covered by a model
test.
**Depends on:** Task 3
**Estimate:** 2
**Done:** [ ]

### Task 8: Web/hosted global noise-word list persistence
**What:** Implement the web/hosted runtime's cross-project global
noise-word list store (FR-5a) — a tenant-root-level JSON file via `io.ts`,
plus the API route exposing it.
**Files:** New `frontend/src/lib/models/global-noise-words.ts` (reads/writes
`<tenantRoot>/.global-noise-words.json` (leading dot required) via the
`StorageAdapter`), new `frontend/app/api/global-noise-words/route.ts`.
**Done when:** GET/PUT at the new route reads/writes the tenant-root file
at `.global-noise-words.json` (resolved via the existing
`storage-context.ts`/ADR-018 seam, not a client-supplied path) as a plain
JSON array of strings; works for a writer with no project open; no
Postgres table/migration added; tests cover read-empty-default, add,
remove.
**Depends on:** none
**Estimate:** 3
**Notes:** Independent of Tasks 9 and 10 — can run in parallel with them.
The leading dot is required: for a local/desktop/locally-run-web
deployment with no hosted auth, `tenantRoot` resolves to the single flat
shared `defaultProjectsDir()` — the same directory every project's UUID
folder lives in — and `listProjectsCore()`
(`frontend/src/lib/models/project-crud-core.ts:114-182`) only filters out
dot-prefixed entries there; a non-dot-prefixed stray file instead gets
caught by a `try/catch`, dropped from the project list, and logs a
`console.warn` on every `GET /api/projects` call forever. The dot matches
the existing `.getwrite-keyring.json` precedent at that same top level.
**Done:** [ ]

### Task 9: Electron desktop global noise-word list persistence
**What:** Implement the Electron runtime's cross-project global
noise-word list store (FR-5b) — an extension to `userData/workspace.json`
plus a new main↔renderer IPC channel pair, following the
`getwrite:workspace-dir`/`getwrite:choose-workspace-dir` precedent exactly.
**Files:** `electron/src/main.ts` (new `ipcMain.handle` pair:
`getwrite:global-noise-words-get` / `-set`), `electron/src/preload.ts`
(`contextBridge.exposeInMainWorld`), `frontend/src/lib/desktop-bridge.ts`
(typed wrapper).
**Done when:** `getwrite:global-noise-words-get` returns `string[]` and
`getwrite:global-noise-words-set` persists a `string[]` to
`userData/workspace.json` and returns `{ ok: true }` / `{ ok: false,
message }` matching `choose-workspace-dir`'s shape; both are promise-based
`ipcMain.handle`/`ipcRenderer.invoke` pairs, not `ipcMain.on`; no forked
worker process; unit tests added under `electron/tests/`.
**Depends on:** none
**Estimate:** 5
**Notes:** Independent of Tasks 8 and 10 — can run in parallel with them.
**Done:** [ ]

### Task 10: Native Android global noise-word list persistence
**What:** Implement the native Android runtime's cross-project global
noise-word list store (FR-5c) — a new device-level, app-private,
unencrypted JSON file sibling to the native `/projects` root.
**Files:** New `frontend/src/lib/models/native-global-noise-words.ts`,
resolving its path the way `native-bootstrap.ts` resolves `PROJECTS_SUBPATH`
but explicitly outside any `<tenantRoot>/<projectId>/` path.
**Done when:** Get/set functions read/write a plain JSON array of strings
at a device-level path with no project id in it; the file is never routed
through `encryptingAdapter.ts`/the keyring (confirmed by test — no project
id means no encryption per ADR-022's existing pass-through); tests use
`capacitor-filesystem.ts`'s in-memory fake.
**Depends on:** none
**Estimate:** 3
**Notes:** Independent of Tasks 8 and 9 — can run in parallel with them.
**Done:** [ ]

### Task 11: Client transport collapse for the global noise-word list
**What:** Collapse the three runtime-specific global-list stores (Tasks 8,
9, 10) behind one client-facing transport, per the `createTransport`
pattern used elsewhere in the codebase (ADR-021).
**Files:** New `frontend/src/lib/api/global-noise-words.ts`
(`createTransport`-based), new
`frontend/src/store/transport/native-global-noise-words-backend.ts` +
`.web-stub.ts`, `frontend/src/lib/api/schemas.ts`
(`GlobalNoiseWordsResponseSchema`).
**Done when:** One client API (`getGlobalNoiseWords`/`setGlobalNoiseWords`
or equivalent) resolves to the correct runtime backend (web HTTP route,
Electron IPC, or native device file) with no sync/merge logic between them
(FR-15 — each runtime's store stays independent); tests confirm the correct
backend is selected per runtime and that no cross-runtime merge occurs.
**Depends on:** Task 8, Task 9, Task 10
**Estimate:** 3
**Done:** [x]

### Task 12: App Settings standalone surface
**What:** Add the new, standalone, top-level "App Settings" surface (FR-14)
for managing the cross-project global noise-word list, reachable with no
login/account required.
**Files:** New `frontend/components/AppSettings/AppSettingsDialog.tsx` (or
equivalent), entry point wiring in `frontend/components/Start/StartPage.tsx`
and/or `frontend/components/Layout/AppShell.tsx`, a Storybook story.
**Done when:** The surface is reachable from the Start Page or app shell
without signing in or having an account; its copy never says "Account
Settings," "your account," or "sign in to manage"; add/remove on the global
list round-trips through Task 11's transport; Storybook story + tests pass.
**Depends on:** Task 11
**Estimate:** 5
**Done:** [x]

### Task 13: Project Settings "Noise Words" tab
**What:** Add the new, dedicated Project Settings tab (FR-4) for the
per-project custom noise-word list (add/remove) and per-project exclusion of
specific global words (FR-6).
**Files:** New `frontend/components/Layout/NoiseWordsSettingsTab.tsx` (or
similar), wiring into `frontend/components/Layout/ProjectSettingsDialog.tsx`
(new tab, not folded into "Writing Goals" or "Metadata").
**Done when:** The tab lets a writer add/remove per-project custom words
(persisted via Task 6) and toggle exclusion of a specific global word
(reading the global list via Task 11, persisted via Task 6); it is a new
tab distinct from any existing one; Storybook story + tests pass.
**Depends on:** Task 6, Task 11
**Estimate:** 5
**Done:** [x]

### Task 14: `EntitySection.tsx` integration
**What:** Wire the noise check onto an entity's `name` field (not just
`aliases`), and add the inline per-term dismiss control, in the existing
alias-warning surface.
**Files:** `frontend/components/Sidebar/EntitySection.tsx` (or wherever the
alias/name editor and `getAliasWarning` call site currently live).
**Done when:** `name` is checked with the same mechanism/thresholds as
`aliases` (FR-1); a flagged term shows the Task 4 copy and a dismiss
control that persists via Task 7; no red/alert styling is used (FR-11);
tests updated to cover the name case and the dismiss interaction.
**Depends on:** Task 4, Task 5, Task 6, Task 7, Task 11
**Estimate:** 5
**Done:** [x]

### Task 15: `EntityRosterView.tsx` integration
**What:** Remove the roster's "scoped to aliases, not name" comment and the
behavior it describes, apply the noise check to both `name` and `aliases`
per entity row, and add the inline per-term dismiss control.
**Files:** `frontend/components/WorkArea/Views/EntityRosterView.tsx` (or
`EntityRosterRow.tsx`).
**Done when:** The stale comment and its scoping behavior are removed; each
roster row flags a noisy `name` the same way it already flags a noisy
alias; a dismiss control works per-entity-per-term (FR-13, independent of
the same term's dismissal state on a different entity); no red/alert
styling is used (FR-11); tests updated.
**Depends on:** Task 4, Task 5, Task 6, Task 7, Task 11
**Estimate:** 5
**Done:** [x]

## Summary
- Total tasks: 15
- Total estimated effort: 55 points
- Critical path: Task 9 → Task 11 → Task 14 (Task 15, Task 12, and Task 13
  finish alongside Task 14 off the same Task 11 dependency; Task 5/Task 6's
  own path through Task 2 is shorter and not the bottleneck)
- Risks: Task 9 (Electron IPC) and Task 10 (native Android) are the least
  precedented pieces of new infrastructure and carry the most schedule risk
  despite being independent of each other; Task 5 (core union/dismissal
  logic) is the highest-complexity single task and a correctness risk since
  Tasks 14 and 15 both depend on it directly; Task 4 (copy review) blocks
  Tasks 14/15 on a human sign-off step that is outside engineering's control.
