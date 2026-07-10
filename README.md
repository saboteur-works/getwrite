# GetWrite

GetWrite is a local-first writing workspace for structured, long-form projects — novels, serials, articles, game docs, and more. There is no database and no cloud: every project, resource, and piece of metadata is a plain file or folder on your own machine, so your work stays inspectable, backup-friendly, and yours.

## Highlights

- **Local-first, no database.** Projects persist as JSON and directory trees under `projects/` — no server, no account, no lock-in. The filesystem _is_ the data model.
- **Structured projects.** Reproducible scaffolding from project-type specs (novel, article, serial, poetry, game documentation, …), each with its own folder layout, metadata fields, and resource templates.
- **Metadata & smart folders.** Per-resource sidecar metadata, a typed query language, and saved queries rendered as smart folders in the resource tree.
- **Revisions built in.** Every resource keeps a versioned snapshot history with a single canonical revision the editor autosaves to.
- **Backlinks & search.** A materialized inverted index and backlinks graph computed on save, powering cross-resource search and reference previews.
- **Desktop app.** Ships as a signed-soon Electron desktop build that bundles the Next.js server — see [why desktop, not web](docs/user/installing.md#why-desktop-not-web).

## Install (desktop app)

GetWrite ships as a desktop app for macOS, Windows, and Linux. Download the
latest build from the [Releases page](https://github.com/saboteur-works/getwrite/releases/latest).

The current builds are **not yet signed by Apple/Microsoft**, so the OS will warn
before the first launch — see **[docs/user/installing.md](docs/user/installing.md)**
for the one-time steps to open it (and a note on [why GetWrite is desktop, not web](docs/user/installing.md#why-desktop-not-web)).

The rest of this README is for developing GetWrite from source.

## Quick links

- Docs: `docs/features` (project types, sidecars, data types)
- Specs examples: `specs/002-define-data-models/project-types/`
- Runtime templates: `getwrite-config/templates/project-types/`
- Frontend source: `frontend/src`

## Requirements

- Node.js >= 24 (we use Volta in CI/dev). If using nvm:

- pnpm (preferred package manager). Install with npm if needed:

```bash
npm install -g pnpm
```

## Setup

1. Install dependencies (repo root):

```bash
pnpm install
```

2. Install frontend workspace dependencies (if working in `frontend` alone):

```bash
cd frontend
pnpm install
```

## Development

- Run frontend unit tests:

```bash
cd frontend
pnpm exec vitest
```

- Run the repo test task (runs frontend tests used by CI):

```bash
pnpm run test
```

- Start a local frontend dev server (when implemented / for app development):

```bash
cd frontend
pnpm run dev
```

## Environment variables

GetWrite reads a small set of environment variables. None are required for the
default local/desktop experience — the app resolves sensible defaults when they
are unset.

| Variable | Purpose |
| --- | --- |
| `GETWRITE_PROJECTS_DIR` | Absolute path to the single-tenant projects directory (the local/desktop store). Injected by the Electron main process; falls back to `<cwd>/../projects` when unset. |
| `GETWRITE_DATA_ROOT` | Hosted multi-tenant only. Base directory under which each signed-in user's isolated data root lives at `<data-root>/<userId>/`. Distinct from `GETWRITE_PROJECTS_DIR` and has **no fallback** — if a request resolves to a signed-in user while this is unset, resolution fails closed rather than leaking into the shared directory. See [ADR-018](docs/architecture/ADRs/adr-018-tenant-resolution-per-user-data-root.md). |
| `GETWRITE_ENABLE_DEV_IDENTITY` | Hosted/dev only. Opt-in flag that activates the **interim** development identity source, which reads a `userId` from the `x-getwrite-dev-user` request header. Inert (no identity asserted) unless set. This is a scaffold for exercising the tenant-resolution path — **not production authentication** — and logs a loud warning when active. |
| `GETWRITE_CLI_TESTING` | Set to `1` to suppress `process.exit` when invoking `getwrite-cli` commands from tests. |

## Project structure (high level)

- `frontend/` — Next.js frontend, components, tests, and runtime models
- `getwrite-config/` — example runtime configuration and templates shipped alongside the app
- `specs/` — specification artifacts and example project-type definitions used for docs and tests
- `docs/` — user- and developer-facing documentation (see `docs/features`)
- `cli/` — `getwrite-cli` workspace package; bundled to `cli/dist/bin/getwrite-cli.cjs`

## Runtime models & validation

Key model files live under `frontend/src/lib/models/`:

- `schemas.ts` — Zod runtime schemas and helpers (use `validateProjectType()` / `validateProjectTypeFile()`)
- `project-creator.ts` — scaffolding helper `createProjectFromType()` which validates specs and creates folders/resources
- `sidecar.ts` — read/write helpers for sidecar metadata

See `docs/features` for more detailed docs on project types, sidecars, and data types.

## Adding project-types and templates

- Examples and tests reference `specs/002-define-data-models/project-types/`.
- Runtime-discoverable templates belong in `getwrite-config/templates/project-types/`.
- When adding or changing project-type schemas, update `frontend/src/lib/models/schemas.ts` and add unit tests under `frontend/tests/unit`.

## Tests

- Unit & integration tests run with Vitest in the `frontend` workspace.
- The repository `pnpm run test` target executes the CI test runner for the frontend workspace.

## Contributing

- Open issues and PRs against the `002-define-data-models` branch for data model changes.
- Follow repository standards found under `standards/` (TypeScript implementation, package selection, template integrity).
- Run and update unit tests for any model/schema changes.

## Troubleshooting

- If tests fail due to Node version mismatch, ensure you are running Node v24+.
- Validation errors for project types include Zod error messages — use `validateProjectTypeFile()` locally to inspect problems.

## Where to look next

- `docs/features/project-types.md` — project-type spec guidance
- `docs/features/sidecars.md` — sidecar metadata guidance
- `docs/features/data/data-types.md` — data type reference

## Known Issues

### Resource Tree

- ResourceTree selected item does not update when resource is set from outside of the component
