# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**GetWrite** is a local-first, file-system backed writing workspace. There is no database—projects, resources, and metadata persist as JSON files and directory structures under `/projects`. The stack is Next.js (App Router), React 19, Redux Toolkit, TipTap editor, and Zod for validation.

**When starting work on a Next.js project, ALWAYS call the `init` tool from next-devtools-mcp FIRST to set up proper context and establish documentation requirements. Do this automatically without being asked.**

Always use Context7 when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

## Development Commands

All commands run from `frontend/` unless noted. The project's Node version is managed by Volta.

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
- Use TDD approaches to testing.
- When writing tests, look for test files where new tests should live before creating new ones.
- E2E tests run against a Storybook server (start with `pnpm storybook` first)
- Playwright config: Chromium only, test dir `e2e/`, captures screenshots/video/trace on failure
- Accessibility tests use `@storybook/addon-a11y`

## Storybook

When working on UI components, always use the `getwrite-storybook-mcp` MCP tools to access Storybook's component and documentation knowledge before answering or taking any action.

- **CRITICAL: Never hallucinate component properties!** Before using ANY property on a component from a design system (including common-sounding ones like `shadow`, etc.), you MUST use the MCP tools to check if the property is actually documented for that component.
- Query `list-all-documentation` to get a list of all components
- Query `get-documentation` for that component to see all available properties and examples
- Only use properties that are explicitly documented or shown in example stories
- If a property isn't documented, do not assume properties based on naming conventions or common patterns from other libraries. Check back with the user in these cases.
- Use the `get-storybook-story-instructions` tool to fetch the latest instructions for creating or updating stories. This will ensure you follow current conventions and recommendations.
- Check your work by running `run-story-tests`.

Remember: A story name might not reflect the property name correctly, so always verify properties through documentation or example stories before using them.
