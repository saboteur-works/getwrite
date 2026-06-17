# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GetWrite** is a local-first, file-system backed writing workspace. There is no database—projects, resources, and metadata persist as JSON files and directory structures under `/projects` at the repo root. The stack is Next.js (App Router), React 19, Redux Toolkit, TipTap editor, and Zod for validation. It ships both as a hosted Next.js app and as a desktop Electron app that bundles the Next.js standalone server.

## Workspace Layout

This is a pnpm workspace (pnpm@10.28.0, pinned). `pnpm-workspace.yaml` lists three packages:

- `frontend/` — `getwrite-frontend`. The Next.js app, Redux store, Zod models, Storybook, and all UI tests.
- `electron/` — `getwrite-electron`. Desktop shell that spawns the Next.js standalone server and opens a `BrowserWindow`.
- `cli/` — `getwrite-cli`. Standalone CLI tools bundled separately with esbuild.

Additional repo-root directories that are **not** workspace packages but are referenced at runtime:

- `projects/` — On-disk project store (one folder per project; UUID-named).
- `getwrite-config/templates/project-types/` — JSON specs for the built-in project types (`article`, `blank`, `game_documentation`, `novel`, `poetry_and_lyrics`, `serial`) plus `project-type.schema.json`.
- `specs/` — Numbered feature specs (`001-…` through `005-…`) that drive larger work; per the authority hierarchy, specs win conflicts.
- `docs/standards/` — Coding/testing standards (see below).
- `scripts/` — Repo-level scripts (currently `showcase`).
- `electron-builder.yml` — Packaging config for the desktop build.

Repo-root scripts (run from the repo root):

```bash
pnpm start            # alias for: pnpm --filter getwrite-frontend dev
pnpm electron:dev     # tsc + electron dist/main.js (electron workspace)
pnpm electron:build   # build frontend + electron
pnpm electron:package # electron-builder
pnpm storybook        # frontend storybook
pnpm knip             # dead-code / unused export check
```

**Next.js DevTools MCP**: when a task involves running, debugging, or modifying the Next.js app itself (dev server, App Router routing, server components, build config, caching), call the `init` tool from `next-devtools` first. Skip it for tasks that only touch unrelated files (CLI, models, Electron, docs).

## Development Commands

Run from `frontend/` unless noted. Node version managed by Volta.

```bash
pnpm dev        # Dev server
pnpm typecheck  # tsc --noEmit
pnpm lint       # ESLint
pnpm build      # next build
pnpm test       # Vitest (watch)
pnpm test:ci    # Vitest (single pass)
pnpm test:e2e   # Playwright — requires pnpm storybook on :6006
```

From the repo root: `pnpm --filter getwrite-frontend exec vitest` runs frontend tests via the workspace.

## Architecture

### Data Layer (No Database)

- **Storage**: `projects/` at the repo root contains one UUID-named folder per project. Each project directory contains:
  - `project.json` — top-level project manifest
  - `resources/<uuid>/` — one folder per text resource with `content.txt` + `content.tiptap.json`
  - `folders/` — folder-tree state for the resource tree
  - `meta/resource-<uuid>.meta.json` — per-resource sidecar metadata
  - `meta/index/` — materialized indexes (inverted index, backlinks, field values)
  - `meta/queries/` — saved queries used by smart folders
  - `meta/templates/` — resource template scaffolds
  - `revisions/<uuid>/v-<N>/` — versioned snapshots per resource
  - `.trash/{resources,meta}/` — soft-deleted content (see [Glossary: Trash](#glossary))
- **API routes** (`frontend/app/api/`): Read/write the filesystem directly. Top-level groups: `projects`, `project/*` (id, delete, rename, tags, preferences, editor-config, metadata-schema, revision-settings, query), `project-resources`, `project-types`, `resource/*` (id, revision), `compile`, `export`, `version-check` (Electron update check).
- **Schemas** (`frontend/src/lib/models/schemas.ts`): Zod validators gate all persisted data crossing the filesystem boundary
- **File locking**: `frontend/src/lib/models/locks.ts` is a generic per-key async mutex; `meta-locks.ts` serializes metadata-affecting operations keyed by project root

### State Management

Redux Toolkit slices mirror filesystem state into the UI:

- `projectsSlice` — active project selection and metadata
- `resourcesSlice` — resources and folder hierarchy
- `revisionsSlice` — revision/version history
- `editorConfigSlice` — per-project editor configuration
- `querySlice` — saved queries and query execution state
- `searchSlice` — cross-resource search state

State is loaded on mount via `GET /api/projects` and updated explicitly via API calls. There is no optimistic or auto-sync layer.

### Frontend Structure

```
frontend/
  app/                   # Next.js App Router (pages + API routes)
  components/            # Feature-organized React components
    Layout/              # AppShell + shell controllers
    Editor/              # TipTap rich text editor (+ TipTapEditor.tsx entry)
    ResourceTree/        # Tree, context menu, create/rename modals, SmartFolders
    WorkArea/            # EditView / DataView / DiffView + Views/{Organizer,Timeline}
    SearchBar/ Sidebar/ Start/ Timeline/ QueryBuilder/ SchemaManager/
    common/              # Shared modals & dialogs
    help/ notifications/ preferences/ project-types/
  src/
    lib/models/          # Filesystem-backed data layer (see Code Map)
    store/               # Redux store and slices
  tests/                 # Vitest unit + integration tests
  e2e/                   # Playwright tests (run against Storybook)
```

### Code Map

All paths relative to `frontend/src/`. Use these as orientation; open the files directly for details.

**Models (`lib/models/`)** — boundary between filesystem and the rest of the app.

- *Validation & types*: `schemas.ts`, `types.ts`
- *Projects*: `project-creator.ts`, `project-loader.ts`, `project-config.ts`, `projects-dir.ts`, `project-view.ts`, `project-view-adapter.ts`
- *Resources & templates*: `resource.ts`, `resource-factory.ts`, `resource-persistence.ts`, `resource-templates.ts`, `template-service.ts`, `sidecar.ts`, `trash.ts`, `folder-utils.ts`
- *Revisions*: `revision.ts`, `revision-manager.ts`, `revision-settings.ts`, `pruneExecutor.ts`
- *Metadata & tags*: `metadata-schema.ts`, `default-metadata-schema.ts`, `tags.ts`
- *Query pipeline*: `query-ast.ts`, `query-evaluator.ts`, `query-cache.ts`, `query-intrinsics.ts`, `saved-queries.ts`
- *Index & search*: `indexer-queue.ts`, `inverted-index.ts`, `backlinks.ts`, `backlinks-watcher.ts`, `field-values.ts`, `field-value-keys.ts`, `field-dedup.ts`, `previews.ts`, `search-scoring.ts`, `search-snippet.ts`
- *Concurrency*: `locks.ts`, `meta-locks.ts`

**Store (`store/`)** — Redux Toolkit. Pattern per feature: `<feature>Slice.ts` + `*-transport-service.ts` (HTTP) + `*-guards.ts` (invariants).

- *Slices*: `projectsSlice`, `resourcesSlice`, `revisionsSlice`, `editorConfigSlice`, `querySlice`, `searchSlice`
- *Transports*: `revision-transport-service`, `query-transport-service`, `search-transport-service`, `metadata-schema-transport-service`
- *Guards & normalizers*: `revision-canonical-guards` (single-canonical invariant), `queries-guards`, `revision-normalization`
- *Controllers*: `project-actions-controller` (multi-step project ops)
- *Plumbing*: `store.ts`, `ClientProvider.tsx`, `hooks.ts` (typed `useAppDispatch`/`useAppSelector`)

### Electron Shell (`electron/`)

- Entry: `electron/src/main.ts` + `electron/src/preload.ts`; compiled to `electron/dist/` via `tsc`.
- On launch, resolves repo root (or `process.resourcesPath` when packaged) and spawns the frontend's Next.js **standalone** server (`frontend/.next/standalone`) as a child process on port 3000, then opens a `BrowserWindow` pointed at it.
- Injects `GETWRITE_PROJECTS_DIR` into the spawned server's environment, which `frontend/src/lib/models/projects-dir.ts` honors — this is how the desktop build can store projects somewhere other than `cwd/../projects`.
- Build flow: `pnpm electron:build` (frontend `next build` → electron `tsc`); package with `pnpm electron:package` (electron-builder).
- Logs go to `app.getPath("logs")/getwrite.log` in production.

### CLI (`cli/`)

Bundled to `cli/dist/bin/getwrite-cli.cjs` via `pnpm cli:build` (esbuild, Node target). Built on `commander`. Commands:

- `getwrite-cli project create [projectRoot] --spec <specPath> [-n <name>]` — Scaffold a new project from a project-type JSON spec (delegates to `project-creator.ts`).
- `getwrite-cli prune [projectRoot] [--max <n>]` — Delete oldest non-canonical revisions until at most `--max` (default 50) remain per resource. Logic in `pruneExecutor.ts`.
- `getwrite-cli reindex [projectRoot]` — Rebuild inverted index + backlinks from scratch by re-scanning all resources. Use after bulk filesystem changes that bypassed the save path.
- `getwrite-cli templates save|create|duplicate|list <projectRoot> …` — Manage resource templates under `<projectRoot>/meta/templates/`.
- `getwrite-cli screenshots capture [-b <storybook-url>] [-o <out-dir>] [-l <limit>]` — Playwright-driven full-page screenshots of every Storybook story.
- `getwrite-cli doctor [projectRoot]` — Check a project for broken folder associations (orphaned resources/folders). Logic in `cli/src/commands/doctor.ts`.

Set `GETWRITE_CLI_TESTING=1` to suppress `process.exit` when invoking commands from tests.

## Glossary

Domain terms that recur across code, skills, and specs:

- **Resource** — A user-authored unit (text document, image, link, etc.). Stored as `projects/<projectId>/resources/<resourceId>/` with `content.txt` + `content.tiptap.json`.
- **Sidecar** — A resource's metadata file at `projects/<projectId>/meta/resource-<resourceId>.meta.json`. Read/written via `sidecar.ts`.
- **Canonical revision** — The single revision per resource with `isCanonical: true` (enforced by `revision-canonical-guards.ts`). It's the one the editor loads and autosaves to.
- **Revision** — A snapshot under `projects/<projectId>/revisions/<resourceId>/v-<N>/`. `pruneRevisions` deletes oldest non-canonical revisions, keeping at most `--max` per resource (default 50 via the `prune` CLI).
- **Project type** — A JSON spec under `getwrite-config/templates/project-types/` describing folder layout, default metadata fields, and resource templates for a new project (e.g. `novel_project_type.json`).
- **Metadata schema** — Per-project field definitions (custom user-defined fields plus built-ins from `default-metadata-schema.ts`).
- **Smart folder** — A saved query (from `querySlice` / `saved-queries.ts`) rendered as a folder-like row in the resource tree.
- **Stub resource** — A resource the UI flags as "Needs content" (zero word count). Rendered with `isStub` in lists like `StubResourcesSection`.
- **Backlinks** — Reverse links between resources, computed by `backlinks.ts` and persisted to `meta/index/`.
- **Trash** — Soft-delete area at `projects/<projectId>/.trash/` with `resources/` and `meta/` subtrees. `softDeleteResource` moves a resource's content directory and sidecar there, preserving IDs.

## Standards & Authority Hierarchy

When resolving conflicts, precedence is: **specs (`specs/`) → existing code → `docs/standards/*` → explicit instructions → conventions**

Key standards (read these before making significant changes):

- `docs/standards/typescript-implementation.md` — No `any`, explicit types, pure functions, single responsibility
- `docs/standards/testing.md` — Test structure and node version requirements
- `docs/standards/template-integrity.md` — Minimal patch-style edits to template-derived files
- `docs/standards/storybook-implementation.md` — Component documentation requirements
- `docs/standards/code-documentation.md` — Code documentation conventions
- `docs/standards/package-selection.md` — Guidance on adding dependencies

## Styling

Brand name: **GetWrite** (one word, camelCase). Parent brand: **Saboteur LLC**.

- **Color tokens**: `black`, `white`, `red` (#D44040), `mid`, and `surface` variants
- **Red is reserved** for position/canonical state indicators only — never for actions or alerts
- **Typography**: IBM Plex Sans (UI), IBM Plex Mono (code), IBM Plex Serif (editor body only)
- **Editor line height**: 1.8+ minimum — this is essential for writers
- Dark/light mode support via CSS tokens defined in `styles/`
- Tailwind CSS 4 with brand tokens extended in theme config

Detailed styling guidance exists in STYLING.md

## Testing & Storybook

- Unit / integration / component / a11y tests live in `tests/`; prefer TDD and add to an existing test file before creating a new one.
- E2E tests (`e2e/`, Playwright, Chromium only) run against Storybook — start `pnpm storybook` (port 6006) first. Screenshots/video/trace are captured on failure. A11y tests use `@storybook/addon-a11y`.
- **Never hallucinate component props.** Before using any prop on an in-project component, open its source under `frontend/components/...` and matching `*.stories.tsx` to confirm it exists. Story names may not match prop names — verify against the TypeScript props or a story's args. If undocumented, ask rather than guess.
