# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It holds repo-wide rules only. Each package has its own `CLAUDE.md`, which Claude Code loads when working in that directory:

- `frontend/CLAUDE.md`: data layer, Code Map (models, store, transports, auth, home-network sharing), commands, testing and Storybook
- `electron/CLAUDE.md`: desktop shell, server start-up, workspace location, sharing main process, import workers
- `cli/CLAUDE.md`: CLI commands
- `android/CLAUDE.md`: Capacitor shell and native build

Feature records live in `specs/features/<slug>.md` and `specs/features/<slug>/experiments.md`; prose docs in `docs/features/`. Release and merge status of each feature is in `specs/product/getwrite.features.md`, not in these files.

## Project Overview

**GetWrite** is a local-first, file-system backed writing workspace. There is no database: projects, resources and metadata persist as JSON files and directory structures under `projects/` at the repo root (one UUID-named folder per project). The stack is Next.js (App Router), React 19, Redux Toolkit, TipTap and Zod. It ships as a hosted Next.js app, as a desktop Electron app that bundles the Next.js standalone server, and has a Capacitor Android shell (ADR-021) whose app build is the frontend's `pnpm build:native`; its Gradle build is still a placeholder.

## Workspace Layout

A pnpm workspace (pnpm@10.28.0, pinned; Node managed by Volta). `pnpm-workspace.yaml` lists four packages:

- `frontend/`: `getwrite-frontend`. Next.js app, Redux store, Zod models, Storybook, all UI tests.
- `electron/`: `getwrite-electron`. Desktop shell that spawns the Next.js standalone server on port 7340 and opens a `BrowserWindow`.
- `cli/`: `getwrite-cli`. Standalone esbuild-bundled CLI. See also `docs/features/cli.md`.
- `android/`: `getwrite-android`. Capacitor Android shell (ADR-021). Its Gradle build is a placeholder; the real app build is the frontend's `pnpm build:native`.

Repo-root directories that are not workspace packages but are used at runtime or by the pipeline:

- `projects/`: on-disk project store.
- `getwrite-config/templates/project-types/`: JSON specs for the built-in project types (`article`, `blank`, `game_documentation`, `novel`, `poetry_and_lyrics`, `serial`) plus `project-type.schema.json`.
- `specs/`: specification artifacts; specs win conflicts (see the authority hierarchy below). `specs/product/` holds `getwrite.md` (product spec, `sab.product-spec/1`) and `getwrite.features.md` (feature list, `sab.features/1`); `specs/features/` holds per-feature specs. `001-…` through `005-…` are the earlier numbered specs.
- `docs/standards/`: coding and testing standards (listed below). `docs/architecture/ADRs/`: architecture decisions.
- `scripts/`: repo-level scripts (currently `showcase`).

Repo-root scripts:

```bash
pnpm start            # alias for: pnpm --filter getwrite-frontend dev
pnpm electron:dev     # tsc + electron dist/main.js (electron workspace)
pnpm electron:build   # build frontend + electron
pnpm electron:package # electron-builder
pnpm storybook        # frontend storybook (port 6006)
pnpm knip             # dead-code / unused export check
```

Frontend checks run from `frontend/`: `pnpm typecheck`, `pnpm lint`, `pnpm test:ci`, `pnpm test:e2e` (needs `pnpm storybook` running). Full list in `frontend/CLAUDE.md`.

**Next.js DevTools MCP**: when a task involves running, debugging, or modifying the Next.js app itself (dev server, App Router routing, server components, build config, caching), call the `init` tool from `next-devtools` first. Skip it for tasks that only touch unrelated files (CLI, models, Electron, docs).

## Running git from outside the repo

Claude Code's command sandbox allows writes only under the session's working
directory. If the session's cwd is _not_ this repo, writes into `.git/` are denied:

```
$ touch /path/to/getwrite/.git/probe
touch: ... Operation not permitted
```

This splits git commands into two cases:

- **Read-only (`git log`, `git diff`, `git show`, `git status`) — works from anywhere.**
  These only _opportunistically_ refresh `.git/index`; git tolerates that write failing
  and still prints correct output. Use `git -C /path/to/getwrite …` rather than `cd`.
- **Mutating (`git commit`, `git checkout`, `git merge`, `git rebase`) — needs cwd inside
  the repo.** These genuinely must write to `.git/`, so they fail rather than degrade.
  `-C` is not a workaround; start the session in the repo.

**Do not disable the sandbox to run read-only git.** `git log --oneline main..HEAD` and
`git diff --stat main..HEAD` both succeed sandboxed — a `dangerouslyDisableSandbox`
prompt on those is a preemptive guess, not a real denial, and escaping buys nothing.

A PreToolUse Bash hook, `.claude/hooks/guard-worktree-git.py` (registered in
`.claude/settings.json`), separately blocks whole-tree `git checkout`/`restore … .`
and `git reset --hard <other ref>` in the main worktree, and — while
`.claude/.pipeline-active` exists — also blocks bare `git reset --hard`, `git switch`,
and `git checkout <existing ref>`; single-path restores, `git show <ref>:<path>`,
`git worktree add`, and other worktrees are unaffected. It exists because a subagent
once overwrote the main worktree from another ref during a pipeline run.

## Glossary

Short terms only; detail lives in the docs named at the end of each entry (`docs/features/`, plus `specs/features/<slug>.md` for feature records).

- **Resource** — A user-authored unit (text, image, audio). Stored at `projects/<projectId>/resources/<resourceId>/` (`content.txt` + `content.tiptap.json`).
- **Sidecar** — A resource's metadata file, `meta/resource-<resourceId>.meta.json`, via `sidecar.ts`. See `docs/features/sidecars.md`.
- **Canonical revision** — The one revision per resource with `isCanonical: true` (`revision-canonical-guards.ts`); the editor loads and autosaves into it. Created with a text resource (`v-1`, via `resource-initial-revision.ts`); a text resource with none is not saveable, and `getwrite-cli repair-revisions` writes the missing `v-1`. See `docs/features/revisions.md`, `docs/features/cli.md`.
- **Revision** — A snapshot under `revisions/<resourceId>/v-<N>/`. `pruneRevisions` drops oldest non-canonical, unprotected ones; `metadata.preserve` protects one from pruning and delete. See `docs/features/revisions.md`.
- **Project type** — A JSON spec in `getwrite-config/templates/project-types/` (folders, fields, templates; optionally seeds `statuses`, `relationshipTypes`, `subtypes`). Not a Resource subtype. See `docs/features/project-types.md`.
- **Metadata schema** — Per-project field definitions: custom fields plus built-ins (`default-metadata-schema.ts`). A custom field may carry `appliesTo` subtype labels.
- **Smart folder** — A saved query (`querySlice`, `saved-queries.ts`) shown as a folder-like row in the resource tree.
- **Stub resource** — A resource flagged "Needs content" (zero word count); `isStub`.
- **Backlinks** — Authored resource-to-resource links, computed by `backlinks.ts` into `meta/backlinks.json`.
- **Entity** — A resource declared via sidecar `entityKind` (open string) plus optional `aliases`. Remove Entity clears both; the resource is never deleted. Cleared via `updateSidecar`'s `clearKeys`. See `docs/features/entities.md`.
- **Mention** — A detected prose occurrence of an entity name/alias (`entity-detection.ts`), with a character offset. Detected, never authored; distinct from Backlinks (authored). Stored separately and merged only for display (`mentions-core.ts`).
- **Mention index** — `meta/index/mentions.json` (`mention-index.ts`), keyed by `resourceId`. Updated on save by `indexer-queue.ts`; rebuilt by `reindex`.
- **Alias** — An alternate entity name in the sidecar `aliases`, matched like the name. A shared alias is flagged ambiguous (`entity-alias-table.ts`); a noise-prone one is flagged (`entity-noise-check.ts`).
- **Entity highlighting** — View-only editor decoration of name/alias occurrences (`EntityHighlightDecorationExtension.ts`); reads/writes no index. Flag `entityHighlighting`, independent of `entities` in the schema.
- **Entity roster** — Read-only "Entities" Work Area tab (`EntityRosterView.tsx`): kind, aliases, mention count, resource span, needs-attention state. Flag `entities`.
- **Entity-scoped compile** — Compile of all resources in an entity's Mention + Backlinks set, in tree order (`EntityCompileSection.tsx`, `compileSelection.ts`). Export-only.
- **Entity co-occurrence** — Derived: two entities mentioned in the same resource (`getEntityCooccurrence`, from the mention index only). Not authored, not from backlinks; unordered pairs, no self-pairs.
- **Entity relationship** — Authored, directed, typed edge between two entities in `meta/relationships.json` (`entity-relationships.ts`; types from `config.relationshipTypes`). Distinct from Mention (detected), Backlink (untyped, resource-level) and co-occurrence (derived). No inverse is created.
- **Entity relationship graph** — Read-only "Graph" tab (`EntityRelationshipGraphView.tsx`, `EntityGraphCanvas.tsx`, accessible list `EntityGraphAccessibleList.tsx`); node positions persist in `meta/entity-graph-positions.json`. Flag `entities`.
- **Entity graph connection types** — Five edge kinds: `authored`, `cooccurrence` (default on), `backlinks`, `proximityMentions`, `sharedMetadata`; per project in `config.entityGraphConnectionTypes`.
- **Focal point** — One graph node chosen by shift-click/long-press; neighbours within `config.entityGraphFocalHopRadius` stay emphasised, the rest are dimmed (`entityGraphHopDistance.ts`). UI state only.
- **Entity mention noise flagging** — Advisory, non-blocking flag that an entity name/alias also reads as an ordinary word (`entity-noise-check.ts`; bundled, project and global lists). Dismissal is per entity per term (`dismissedNoiseTerms`). Changes no detection.
- **Mention jump** — Clicking a mention snippet moves the editor to its offset and highlights it briefly (`offset-resolver.ts`, `MentionJumpHighlightExtension.ts`, `config.mentionHighlightDurationSeconds`). A stale offset no-ops with a toast.
- **Resource subtype** — Optional per-resource label (`resourceSubtype`) from the per-project list `config.subtypes`. Distinct from resource `type`, from `entityKind`, and from Project type. Scopes custom fields via `appliesTo`, matched by `normalizeSubtypeLabel`. See `docs/features/resource-subtype.md`.
- **Status roll-up** — Data view "By status": per status, count and word total of text resources, from `userMetadata.status` (`lib/status-rollup.ts`). Client-side only. See `docs/features/status-rollup.md`.
- **Trash** — Per-project soft-delete area `.trash/` with a project-wide Trash tab; restore, purge, empty (`trash.ts`, `trash-core.ts`). See `docs/features/revisions.md` (Soft-Delete section) and `specs/features/trash-ui.md`.
- **Writing log** — Append-only per-UTC-day words added/deleted record at `meta/writing-log/YYYY-MM-DD.json` (`writing-log.ts`); imports logged separately. `reindex` does not clear it. See `docs/features/writing-log.md`.
- **Daily word goal** — `config.dailyWordGoal`, compared with today's non-import net words. Distinct from Word-count goal. See `docs/features/writing-log.md`.
- **Word-count goal** — Total-length goals: project `config.wordCountGoal` and per-resource `wordCountGoal` on a text sidecar. Distinct from Daily word goal. See `docs/features/word-count-goals.md`.
- **Prose diagnostics** / **Located detail** — Per-resource dialogue ratio, average sentence length, top repeated words (`prose-diagnostics.ts`), persisted at `meta/index/diagnostics.json`; Located detail is the unpersisted offsets of the repeated words, computed on demand. See `docs/features/prose-diagnostics.md`.
- **Home-network sharing** — Off-by-default desktop setting that serves the bundled server to other devices on the local network, gated by pairing (`frontend/proxy.ts`, `lib/sharing/`, `electron/src/sharing/`). Desktop server port 7340. Plain HTTP. Excludes hosted auth. See `docs/features/home-network-sharing.md`.
- **Pairing** / **Paired device** — A one-time 6-digit code confirms a device once; the server stores a hashed credential (`device-credentials.json`) and sets the `getwrite_device` cookie. Revoke deletes the record. See `docs/features/home-network-sharing.md`.
- **Paired-device limits** — Five desktop switches (project deletion, unlocking, locking, encryption changes, permanent deletion), on by default, global to all paired devices; the window is never limited. State in `sharing-limits.json`; a refusal is HTTP 403 `{ error, limit }`. See `docs/features/home-network-sharing.md`.
- **Window secret** — Per-launch value from Electron main, sent as `x-getwrite-window` on the desktop window's requests; how the server tells the window from other clients.
- **Host allowlist** — With sharing on, a non-window request is served only if its `Host` is exactly an own-machine name or IPv4 address with the port (`host-allowlist.ts`); otherwise 403.
- **Hosted auth** — Opt-in hosted identity layer (better-auth + PostgreSQL, `lib/auth/`, ADR-020), active only when `DATABASE_URL` and `BETTER_AUTH_SECRET` are set; feeds the `IdentitySource` seam for tenant isolation. Desktop never configures it.

## Standards & Authority Hierarchy

When resolving conflicts, precedence is: **specs (`specs/`) → existing code → `docs/standards/*` → explicit instructions → conventions**

Key standards (read these before making significant changes):

- `docs/standards/typescript-implementation.md` — No `any`, explicit types, pure functions, single responsibility
- `docs/standards/testing.md` — Test structure and node version requirements
- `docs/standards/template-integrity.md` — Minimal patch-style edits to template-derived files
- `docs/standards/storybook-implementation.md` — Component documentation requirements
- `docs/standards/code-documentation.md` — Code documentation conventions
- `docs/standards/package-selection.md` — Guidance on adding dependencies
- `docs/standards/storage-context.md` — Request-scoped `StorageContext` seam: when routes/CLI/background jobs must establish it
- `docs/standards/security.md` — Fail-closed defaults, no client-supplied paths, boundary validation, tenancy, crypto, secrets
- `docs/standards/failure-visibility.md` — A failure must not render as absence: narrow catches, never return the same value for "failed" and "empty"
- `docs/standards/accessibility.md` — WCAG 2.1 AA target, semantic roles, keyboard operability, a11y test conventions

## Styling

Brand name: **GetWrite** (one word, camelCase). Parent brand: **Saboteur LLC**.

- **Color tokens**: `black`, `white`, `red` (#D44040), `mid`, `surface` variants, and `fg-tertiary`/`fg-inv-tertiary` (AA-contrast secondary text — `mid` is structural/decorative only, never text)
- **Red is reserved** for position/canonical state indicators only — never for actions or alerts. The `destructive` Button variant is styled identically to `secondary` (no red); danger is conveyed by label and confirmation dialog only
- **Typography**: IBM Plex Sans (UI), IBM Plex Mono (code), IBM Plex Serif (editor body only)
- **Editor line height**: 1.8+ minimum — this is essential for writers
- Dark/light mode support via CSS tokens defined in `styles/`
- Tailwind CSS 4 with brand tokens extended in theme config

Detailed styling guidance exists in STYLING.md

## Testing

Unit, integration, component and a11y tests live in `frontend/tests/`; E2E (`frontend/e2e/`, Playwright, Chromium only) runs against Storybook. Prefer TDD and extend an existing test file before creating one. Never use a prop on an in-project component without opening its source and stories first. Details in `frontend/CLAUDE.md` and `docs/standards/testing.md`.
