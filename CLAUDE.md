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

- **Storage**: `/projects` directory contains one folder per project; each resource is a file + a `*.meta.json` sidecar; revisions in `.revisions` files
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
    AppShell/           # Main layout
    Editor/             # TipTap rich text editor
    ResourceTree/       # Hierarchical file navigation
    Sidebar/            # Metadata/properties panel
    Start/              # Project selection screen
    WorkArea/           # Primary editing surface
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
- `resource-templates.ts` — Defines resource types (chapters, scenes, etc.)
- `revision.ts` — Version control for resources
- `sidecar.ts` — Helpers for `*.meta.json` metadata files
- `types.ts` — Core TypeScript interfaces

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

- Unit tests live in `tests/` and `src/tests/unit/`
- E2E tests run against a Storybook server (start with `pnpm storybook` first)
- Playwright config: Chromium only, test dir `e2e/`, captures screenshots/video/trace on failure
- Accessibility tests use `@storybook/addon-a11y`
