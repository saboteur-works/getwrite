# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GetWrite** is a local-first, file-system backed writing workspace. There is no database—projects, resources, and metadata persist as JSON files and directory structures under `/projects`. The stack is Next.js (App Router), React 19, Redux Toolkit, TipTap editor, and Zod for validation.

## Development Commands

All commands run from `frontend/` unless noted. Use Node 22.16.0 (`nvm use 22.16.0`).

```bash
# Dev server
pnpm dev

# Type checking
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build

# Run all unit tests (watch)
pnpm test

# Run all unit tests (CI, single pass)
pnpm test:ci

# Run E2E tests (requires Storybook running on port 6006)
pnpm test:e2e

# Run from repo root (pnpm workspace)
pnpm --filter getwrite-frontend exec vitest
```

## Architecture

### Data Layer (No Database)

- **Storage**: `/projects` directory contains one folder per project; each text resource is a directory at `resources/<uuid>/` with `content.txt` + `content.tiptap.json`; sidecars at `meta/resource-<uuid>.meta.json`; revisions at `revisions/<uuid>/v-<N>/`
- **API routes** (`/frontend/app/api`): Read/write the filesystem directly — `/projects`, `/project/*`, `/resource/*`, `/resource/revision/*`
- **Schemas** (`/frontend/src/lib/models/schemas.ts`): Zod validators gate all persisted data; all data crosses the boundary through these
- **File locking** (`locks.ts`) prevents concurrent writes

### State Management

Redux Toolkit slices mirror filesystem state into the UI:

- `projectsSlice` — active project selection and metadata
- `resourcesSlice` — resources and folder hierarchy
- `revisionsSlice` — revision/version history

State is loaded on mount via `GET /api/projects` and updated explicitly via API calls. There is no optimistic or auto-sync layer.

### Frontend Structure

```
frontend/
  app/                  # Next.js App Router (pages + API routes)
  components/           # Feature-organized React components
    Layout/             # AppShell, ShellLayoutController, ShellModalCoordinator, ShellProjectTypeLoader
    Editor/             # TipTap rich text editor
    Tree/               # ResourceTree, ResourceContextMenu, CreateResourceModal
    SearchBar/          # Cross-resource search UI
    Sidebar/            # Metadata/properties panel
    Start/              # Project selection screen
    WorkArea/           # Primary editing surface (Edit, Organizer, Data, Diff, Timeline views)
    common/             # Shared modals and dialogs (CompilePreviewModal, ExportPreviewModal, ConfirmDialog, ResourceCommandPalette)
    help/               # Help overlay components
    notifications/      # Toast and notification system
    preferences/        # User preferences UI
    project-types/      # Project type selection and management
  src/
    lib/models/         # Core data models, Zod schemas, resource templates
    store/              # Redux store and slices
    cli/                # CLI tooling (bundled separately with esbuild)
  tests/                # Vitest unit + integration tests
  e2e/                  # Playwright tests (run against Storybook)
```

### Key Models

- `schemas.ts` — Zod validators for UUIDs, metadata, projects, resources
- `project-creator.ts` — Scaffolds new projects from templates
- `resource-factory.ts` — `createResourceOfType` factory
- `resource-persistence.ts` — `writeResourceToFile`, `getLocalResources`
- `resource-templates.ts` — Template save/load/create/duplicate
- `revision.ts` — Version control: `writeRevision`, `pruneRevisions`, `setCanonicalRevision`
- `pruneExecutor.ts` — CLI-orchestrated pruning across all project resources
- `sidecar.ts` — `readSidecar`, `writeSidecar` helpers
- `backlinks.ts` — `computeBacklinks`, `persistBacklinks`, `loadBacklinks`, `BacklinkIndex` type
- `tags.ts` — Project-scoped tag CRUD (`config.tags` + `config.tagAssignments`)
- `trash.ts` — `softDeleteResource` (moves to `.trash/`)
- `template-service.ts` — Project-type template loading
- `project-view.ts` / `project-view-adapter.ts` — Project view model adapters
- `types.ts` — Core TypeScript interfaces

### Key Store Files

- `projectsSlice.ts` — Active project selection, `StoredProject` dictionary
- `resourcesSlice.ts` — Resources, folders, selected resource ID
- `revisionsSlice.ts` — Revision list, canonical selection, loading/saving state
- `project-actions-controller.ts` — Multi-step project operations (create, load, delete)
- `revision-canonical-guards.ts` — Enforces single-canonical invariant client-side
- `revision-normalization.ts` — Normalizes raw revision data to `RevisionEntry`
- `revision-transport-service.ts` — HTTP layer for revision API calls
- `hooks.ts` — `useAppDispatch`, `useAppSelector` typed hooks

## Standards & Authority Hierarchy

When resolving conflicts, precedence is: **specs → existing code → `/docs/standards/*` → explicit instructions → conventions**

Key standards (read these before making significant changes):

- `docs/standards/typescript-implementation.md` — No `any`, explicit types, pure functions, single responsibility
- `docs/standards/testing.md` — Test structure and node version requirements
- `docs/standards/template-integrity.md` — Minimal patch-style edits to template-derived files
- `docs/standards/storybook-implementation.md` — Component documentation requirements

## Styling

Brand name: **GetWrite** (one word, camelCase). Parent brand: **Saboteur LLC**.

- **Color tokens**: `black`, `white`, `red` (#D44040), `mid`, and `surface` variants
- **Red is reserved** for position/canonical state indicators only — never for actions or alerts
- **Typography**: IBM Plex Sans (UI), IBM Plex Mono (code), IBM Plex Serif (editor body only)
- **Editor line height**: 1.8+ minimum — this is essential for writers
- Dark/light mode support via CSS tokens defined in `styles/`
- Tailwind CSS 4 with brand tokens extended in theme config

Detailed styling guidance exists in STYLING.md

## Testing Notes

- Unit, integration, component, and a11y tests live in `tests/`
- E2E tests run against a Storybook server (start with `pnpm storybook` first)
- Playwright config: Chromium only, test dir `e2e/`, captures screenshots/video/trace on failure
- Accessibility tests use `@storybook/addon-a11y`
