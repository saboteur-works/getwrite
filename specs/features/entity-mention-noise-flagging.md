# Feature Spec: Entity Mention Noise Flagging

> **Scope note:** this spans a sidecar schema change (dismissal state), a
> project-config change (per-project custom word list), a new bundled
> frequency-list data file, UI changes across two existing surfaces
> (`EntitySection.tsx`, `EntityRosterView.tsx`), a new dedicated Project
> Settings tab, and — per Gate 3 triage resolution of OQ-1 — genuinely new
> cross-project "global" noise-word-list storage infrastructure in **all
> three runtimes** (web/hosted, Electron desktop, native Android). None of
> the three runtimes has an existing cross-project or device-level
> preferences seam today (web has no per-user preferences table beyond
> better-auth; Electron's `userData/workspace.json` is main-process-only with
> no renderer IPC bridge; native Capacitor storage is app-private and
> per-project only), so this is new infrastructure in each runtime, not an
> extension of an existing mechanism, and runtime parity across all three is
> a hard requirement rather than a staged or partial rollout. This document
> is at the upper bound of what should stay one spec.

## Overview

Entity mention detection (`entity-detection.ts`) is pure literal/word-boundary
matching with no semantic awareness, so a name or alias that is also an
ordinary English word produces false-positive "mentions" — an entity named
"Case" matches "in that case"; an alias "Tiny" matches "a tiny thing." A
narrower version of this already exists: `entity-alias-warnings.ts`'s
`getAliasWarning` flags an alias as noise-prone if it is under three
characters or appears in a small (~20-word), hardcoded, fixed list of common
given-names-that-double-as-words — but it applies only to `aliases`, never to
an entity's `name`, and its fixed list cannot anticipate every ordinary word a
writer might pick. This feature extends the same advisory, never-blocking,
never-filtering warning mechanism to an entity's `name`, replaces the
hardcoded word list with a bundled frequency-ranked word list the writer can
extend per-project, and adds per-term dismissal so a flagged word stops
resurfacing once the writer has acknowledged it — all while keeping the tone
strictly observational, never directive, matching this codebase's existing
constraint that red/alert styling is reserved for position/canonical-state
indicators only.

## Goals

- An entity's `name` is checked against the same noise heuristic its aliases
  already are, with no UI distinction between the two surfaces.
- The noise word list is a bundled, static, top-N English frequency list
  (~2–3k words) committed as repo data, not an npm dependency, replacing the
  current ~20-word hardcoded list.
- A writer can add or remove words from a per-project custom noise list and
  from a cross-project "global" custom noise list (usable across every
  project, with parity across web/hosted, Electron desktop, and native
  Android), and can exclude a specific global word within one project.
- A writer can dismiss the noise observation for a specific term on a
  specific entity, and it does not resurface for that exact term (normalized,
  case-insensitive) unless the term later changes.
- The observation never reads as an instruction — no imperative language, no
  red/alert styling — and never causes a mention to be hidden, filtered, or
  auto-discarded.

## Non-goals

- Automatically hiding, filtering, or excluding a flagged mention from any
  mention list, count, or index. The feature only flags; a writer always sees
  every detected mention and discards noise themselves.
- Any semantic, contextual, or model-backed disambiguation of whether a given
  occurrence of a flagged word is "really" the entity. Detection itself
  (`entity-detection.ts`) is unchanged.
- Replacing the bundled frequency list with a full dictionary (tens of
  thousands of words) — the explicit reason for choosing a smaller top-N list
  is that a full dictionary over-flags.
- Finalizing the exact approved copy strings for the softened observation
  text (FR-8) — the direction (soft, neutral-aside, non-imperative) is
  settled, but specific wording still needs a review beat (see FR-8).
- Localizing the bundled word list to languages other than English.
- Any change to how `aliases` or `name` validation rejects input at write
  time; this remains advisory-only, matching FR-2 of `entity-layer.md`.

## User stories

- US-1: As a novelist, I want to have my entity's name checked for the same
  common-word noise as its aliases, so that "Case" or "Hope" as a character
  name gets the same heads-up an alias would.
- US-2: As a novelist, I want to have the noise check catch ordinary words
  beyond a short hardcoded list, so that a word nobody thought to add ahead
  of time still gets flagged.
- US-3: As a novelist working on one project, I want to add my own
  project-specific words (jargon, invented terms that happen to double as
  real words) to the noise list, so that I'm warned about terms that are
  noisy for my story even if they're not common English words generally.
- US-4: As a novelist, I want to dismiss a noise observation once I've
  acknowledged it, so that it doesn't keep nagging me for a term I've already
  decided to keep.
- US-5: As a novelist, I want to have the noise observation read as a
  neutral aside, not an instruction, so that it doesn't feel like the app is
  grading my character names.
- US-6: As a novelist who works across multiple projects (a series, or
  several unrelated manuscripts), I want to maintain one noise-word list
  that applies everywhere I write, on whichever device or build I'm using,
  so that I don't have to re-add the same invented terms project by project,
  while still being able to turn off a specific global word for the one
  project where it isn't noise.

## Functional requirements

FR-1: The noise-check MUST be applied to an entity's `name` using the same mechanism and same thresholds as its `aliases` (length-based and word-list-based), removing the current scoping that excludes `name` (the `EntityRosterView.tsx` comment stating the check is scoped to aliases "not its name" MUST be removed along with the behavior it describes). [US-1]

FR-2: The bundled common-word list MUST be replaced with a static, top-N (~2,000–3,000 word) English word-frequency list committed as a plain data file in the repository, mirroring `inverted-index.ts`'s existing `STOP_WORDS` precedent of a bundled constant rather than an npm dependency. The file MUST NOT be sourced from a full dictionary package (which this feature explicitly rules out as over-flagging). [US-2]

FR-3: A project MUST be able to maintain its own custom noise-word list, additive to the bundled list (FR-2), persisted on project config in a shape mirroring the existing `config.statuses` array (string list, writer add/remove, no structural validation beyond non-empty trimmed strings). [US-3]

FR-4: A writer MUST be able to add and remove entries from the per-project custom noise-word list (FR-3) from a new, dedicated Project Settings tab created for this feature — this list MUST NOT be folded into the existing "Writing Goals" tab, the "Metadata" tab, or any other pre-existing Project Settings tab. [US-3]

FR-5: A writer MUST be able to maintain a cross-project "global" custom noise-word list — additive to the bundled list (FR-2), independent of and distinct from any single project's own custom list (FR-3) — with equivalent add/remove functionality implemented independently in all three runtimes: web/hosted, Electron desktop, and native Android. This requires new, runtime-specific persistence infrastructure, since no existing cross-project or device-level preferences seam exists in any runtime today: (a) web/hosted — a tenant-root-level JSON file at `<tenantRoot>/.global-noise-words.json` (leading dot required) written/read through the existing `io.ts` `StorageAdapter` machinery, using the per-request `tenantRoot` the existing `storage-context.ts`/ADR-018 seam already resolves at `<data-root>/<userId>/` — above any single project directory — plus a new API route to expose it; no new Postgres table or migration tooling, since this codebase's Postgres (ADR-020) is scoped exclusively to better-auth's own identity tables and is never used for app/tenant data. The leading dot is required specifically because, for a local/desktop/locally-run-web deployment with no hosted auth configured, the resolved `tenantRoot` is the single flat shared `defaultProjectsDir()` — the same top-level directory every project's UUID folder lives in — and `listProjectsCore()` (`frontend/src/lib/models/project-crud-core.ts:114-182`) filters out only dot-prefixed entries from that directory; a non-dot-prefixed stray file there instead falls into a `try/catch`, gets dropped from the project list, but logs a `console.warn` on every single `GET /api/projects` call forever. A leading dot uses the exact same filter/precedent as the existing `.getwrite-keyring.json` at that same top level, eliminating that warning noise entirely with no other behavior change; (b) Electron desktop — an extension to `userData/workspace.json` plus a new main-process↔renderer IPC channel, since no such channel exists today for arbitrary preferences. Per Gate 3 triage resolution of OQ-1, this MUST follow the existing `getwrite:workspace-dir`/`getwrite:choose-workspace-dir` precedent exactly (`electron/src/main.ts`'s `registerWorkspaceHandlers`): promise-based `ipcMain.handle(...)`/`ipcRenderer.invoke(...)` pairs (never `ipcMain.on`/sync), registered in `electron/src/main.ts` and exposed via `contextBridge.exposeInMainWorld` in `electron/src/preload.ts` plus a typed wrapper in `frontend/src/lib/desktop-bridge.ts` — not the heavier opaque-handle-plus-forked-worker pattern used by Scrivener/DOCX import, which exists only because that pipeline touches arbitrary filesystem paths; this feature does not. Two channels: `getwrite:global-noise-words-get` (no arguments, returns `string[]`) and `getwrite:global-noise-words-set` (takes `string[]`, persists to `userData/workspace.json`, returns a result shape matching `choose-workspace-dir`'s `{ ok: true }` / `{ ok: false, message }`). No forked worker process is needed — this is a plain JSON read/write via `node:fs`, the same file family `electron/src/projects-dir.ts`'s `writeConfiguredProjectsDir` already reads/writes; (c) native Android — a new device-level, app-private file, resolved the way `native-bootstrap.ts` resolves its app-private directory today but explicitly NOT scoped to a single project. Per Gate 3 triage resolution of OQ-2, this file does NOT participate in the ADR-022 per-project encryption/keyring scheme, and architecturally cannot as designed: ADR-022's keyring wraps one data key per project, resolved by parsing a project id out of the storage path, and already passes through unencrypted for any file with no project id and for workspace-level files. A cross-project global list has no project id by construction, so it lives outside any `<tenantRoot>/<projectId>/` path — e.g. a sibling to the native `/projects` root (see `native-bootstrap.ts`'s `PROJECTS_SUBPATH` resolution), such as `/global-noise-words.json` under `Directory.Data` — and is read/written as plain, unencrypted JSON, the same posture Electron's `userData/workspace.json` already has (also plain JSON, unencrypted). File format: a plain JSON array of strings, mirroring the bundled frequency list's and per-project custom list's existing shape (FR-3). This is an intentional, correct posture given there is no cross-project encryption concept anywhere in this codebase today (ADR-022 defers native transport wiring generally and has no cross-project encryption mechanism to extend even if one were wanted) — not a gap to flag as risk. All three runtimes MUST ship together; a partial rollout (e.g. web-and-desktop only) does not satisfy this requirement. Per FR-15, "ship together" is a functional-parity requirement — the same capability exists in each runtime — not a data-parity or sync requirement between the three stores. [US-6]

FR-6: A project MUST be able to record, per global-list word (FR-5), that the word is excluded from applying within that specific project — an override mechanism distinct from simply not adding the word to that project's own custom list (FR-3), since the word still applies to every other project that has not excluded it. This exclusion list is itself per-project state (alongside FR-3's additive list) and MUST be editable from the same per-project custom word-list UI surface (FR-4). [US-6]

FR-7: The noise check for a given term (name or alias), within a given project, MUST evaluate against: the bundled list (FR-2) UNION the active project's custom list (FR-3) UNION the global list (FR-5), MINUS any global-list word that project has excluded (FR-6). A term flagged by any non-excluded source MUST be flagged, with no need for the writer to know which source matched. [US-1][US-2][US-3][US-6]

FR-8: A writer MUST be able to dismiss the noise observation for one specific term (name or alias) on one specific entity. Once dismissed, that exact term (compared case-insensitively, normalized the same way `getAliasWarning` normalizes today) MUST NOT surface the observation again for that entity, in any surface (alias editor, entity roster), unless the term's text later changes, at which point the dismissal MUST NOT carry over to the new text. [US-4]

FR-9: Dismissal state (FR-8) MUST persist to the entity's own sidecar as a new field, surviving reload and reopening the project, and MUST be readable/writable through the existing `updateSidecar` write path rather than a new transport mechanism. [US-4]

FR-10: Observation copy, in both the existing alias-warning surface (`EntitySection.tsx`) and the entity roster (`EntityRosterView.tsx`), MUST use non-imperative, neutral-aside phrasing that states a fact about the term (e.g., that it also reads as an ordinary word, so some detected matches may not be about this entity) rather than an instruction to the writer (e.g., "will add noise," "fix this"). The existing `getAliasWarning` message strings MUST be revised to this standard as part of this feature, for both the pre-existing alias case and the newly covered name case (FR-1). This direction is settled, but the exact approved copy strings are NOT yet finalized by this spec — final wording MUST go through a lightweight copy-review step (likely during task breakdown or implementation) before shipping, rather than being invented ad hoc during implementation. [US-5]

FR-11: The noise observation's UI treatment, wherever it appears, MUST NOT use the reserved position/canonical-state color token (`#D44040` / `red`) or any other alert-styled treatment, consistent with this codebase's styling convention and with entity highlighting's and the entity roster's existing "needs attention" precedent of text-based, non-color-only disclosure. [US-5]

FR-12: This feature MUST NOT change detection (`entity-detection.ts`), the mention index, or any mention count/list surface to omit, filter, or suppress a mention matched by a flagged term — every detected mention remains visible exactly as today; only the observation that a term is noise-prone is new or extended. [US-1][US-2][US-3]

FR-13: A dismissed term's observation state (FR-8) MUST be scoped per-entity-per-term — the same literal term flagged and dismissed on one entity MUST still surface its observation on a different entity that also uses it, since dismissal records a specific writer's judgment about a specific entity's use of that term, not a global suppression of the term itself. [US-4]

FR-14: Per Gate 3 resolution of OQ-1, the cross-project global noise-word list (FR-5) MUST be managed from a new, standalone, top-level settings surface that is independent of any single project — distinct from `ProjectSettingsDialog.tsx` and from FR-4's per-project Settings tab, which is project-scoped and cannot host project-independent state. This surface MUST be reachable regardless of login state — including for a writer on the local/desktop build with no hosted account at all, since hosted auth (`isHostedAuthActive()`, ADR-020) is opt-in and not active for most users — from the Start Page or app shell, not gated behind signing in or having an account. Its naming and copy MUST NOT imply a user account exists (e.g. MUST NOT be called "Account Settings" and MUST NOT use phrasing like "your account" or "sign in to manage"); the working name is "App Settings," flagged here as a reasonable but not-yet-approved name, consistent with how FR-10 treats its own unapproved copy strings. [US-6]

FR-15: Per Gate 3 resolution of OQ-4, the global noise-word list's three runtime stores (FR-5a/b/c) MUST have no sync, merge, or conflict-resolution mechanism between them in this feature: the web/hosted tenant-root file, the Electron `userData` file, and the native Android device file are three fully independent per-device/per-deployment stores. A word added or removed on one runtime or device MUST NOT be expected to appear on another runtime or device; a writer's global list on one device will not reflect edits made on another until a possible future feature adds sync. This is a scope boundary, not an oversight: FR-5's "all three runtimes MUST ship together" requirement is satisfied by functional parity (the same add/remove/exclude capability existing in each runtime), not by data parity or synchronization across them. [US-6]

## Open questions

None.

## Out of scope (deferred)

- Bulk dismissal management from the entity roster — confirmed deferred by
  product-owner decision (Gate 3 triage of the former OQ-5): dismissal
  (FR-8/FR-9) stays inline-only, surfaced in the alias editor and the entity
  roster row, with no bulk-dismissal control added to the roster. This is a
  settled decision, not an open lean.
- The exact approved copy strings for the observation text (FR-10) — the
  direction (soft, neutral-aside, non-imperative) is settled; final wording
  needs a lightweight review beat, likely during task breakdown or
  implementation (see FR-10).
- Cross-runtime sync of the global noise-word list — resolved by Gate 3
  triage of the former OQ-4 (see FR-15): for v1, each runtime's global list
  is independent, unsynced per-device/per-deployment state, with no merge
  or conflict-resolution mechanism between them. This is a settled scope
  boundary, not an open lean; a possible future feature could add sync.
- Localizing the bundled frequency list (FR-2) to any language other than
  English.
- Any change to detection matching semantics (word boundary, possessive,
  plural) in `entity-detection.ts` — this feature only adds an advisory
  observation layer on top of existing matches.
- Exposing the noise-word lists (bundled or per-project) to the query
  pipeline or smart folders.
