# GetWrite CLI

The GetWrite CLI (`getwrite-cli`) is a Node.js command-line tool for project management, template operations, revision pruning, integrity checks, and screenshot capture.

It lives in its own pnpm workspace package, **`cli/`**, separate from the Next.js frontend. It consumes the framework-free model layer through the single `@gw/core` barrel (`frontend/src/lib/core.ts`), which esbuild bundles at build time. See [ADR-016](../architecture/ADRs/adr-016-cli-extraction-and-deferred-core-package.md) for the rationale and the deferred follow-up (promoting `@gw/core` to a standalone package).

---

## Building the CLI

From the repo root:

```sh
pnpm cli:build          # or: pnpm --filter getwrite-cli build
```

(`pnpm build` / `next build` does **not** produce the CLI.)

The bundled CLI is written to:

```
cli/dist/bin/getwrite-cli.cjs
```

---

## Invocation

```sh
node ./cli/dist/bin/getwrite-cli.cjs <command> [args]
```

During development you can also run the CLI's tests against the command modules directly (the CLI is tested with `GETWRITE_CLI_TESTING=1` to suppress `process.exit`):

```sh
pnpm cli:test           # or: pnpm --filter getwrite-cli test
```

---

## Commands

### `project create`

Creates a new GetWrite project on disk from a project-type spec file.

```sh
getwrite-cli project create [projectRoot] --spec <specPath> [--name <name>]
```

**Arguments:**
- `projectRoot` (optional) — directory to create the project in. Defaults to `.` (current directory).

**Options:**
- `-s, --spec <specPath>` (required) — path to a project-type JSON spec file. See `getwrite-config/templates/project-types/` for bundled specs.
- `-n, --name <name>` (optional) — display name for the project. Defaults to the spec's `name` field.

**What it does:**
1. Validates the spec file.
2. Creates `<projectRoot>/project.json`.
3. Creates `<projectRoot>/folders/<slug>/folder.json` for each folder in the spec.
4. Creates `<projectRoot>/resources/<uuid>/content.txt` and `content.tiptap.json` for each default resource.
5. Creates `<projectRoot>/meta/resource-<uuid>.meta.json` sidecars.
6. Creates `<projectRoot>/revisions/<uuid>/v-1/` initial revisions (canonical).

**Exit codes:** `0` = success, `2` = error

**Example:**
```sh
node cli/dist/bin/getwrite-cli.cjs project create ./my-novel \
  --spec getwrite-config/templates/project-types/novel_project_type.json \
  --name "My Novel"
```

---

### `templates save`

Saves a new empty template to the project's template directory.

```sh
getwrite-cli templates save <projectRoot> <templateId> <name>
```

Writes an empty text template to `<projectRoot>/meta/templates/<templateId>.json`:

```json
{ "id": "<templateId>", "name": "<name>", "type": "text", "plainText": "" }
```

**Example:**
```sh
node cli/dist/bin/getwrite-cli.cjs templates save ./my-novel scene "Scene"
```

---

### `templates create`

Creates a new resource from an existing template.

```sh
getwrite-cli templates create <projectRoot> <templateId> [name]
```

Loads `<projectRoot>/meta/templates/<templateId>.json` and instantiates a new resource from it, optionally overriding the display name. Prints the new resource's UUID on success.

**Example:**
```sh
node cli/dist/bin/getwrite-cli.cjs templates create ./my-novel scene "Opening Scene"
# Created resource b19abcd4-81b2-44ef-b4b4-ba1310dbdf87
```

---

### `templates duplicate`

Duplicates an existing resource as a new resource within the same project.

```sh
getwrite-cli templates duplicate <projectRoot> <resourceId>
```

Copies the resource's content and sidecar to a new UUID. Prints the new resource ID:

```
Duplicated resource -> <newId>
```

**Example:**
```sh
node cli/dist/bin/getwrite-cli.cjs templates duplicate ./my-novel b19abcd4-81b2-44ef-b4b4-ba1310dbdf87
```

---

### `templates list`

Lists all templates stored in a project.

```sh
getwrite-cli templates list <projectRoot>
```

Reads all `.json` files from `<projectRoot>/meta/templates/` and prints one tab-separated line per template: `<id>\t<name>\t<type>`.

**Example:**
```sh
node cli/dist/bin/getwrite-cli.cjs templates list ./my-novel
# scene    Scene    text
# chapter  Chapter  text
```

---

### `prune`

Removes old revision snapshots to enforce a maximum retained revisions count per resource.

```sh
getwrite-cli prune [projectRoot] [--max <number>]
```

**Arguments:**
- `projectRoot` (optional) — project to prune. Defaults to `process.cwd()`.

**Options:**
- `-m, --max <number>` (optional) — maximum revisions to keep per resource. Defaults to `50`.

**What it does:**
1. Reads all resource UUIDs from `<projectRoot>/resources/`.
2. For each resource, calls `pruneRevisions(projectRoot, resourceId, maxRevisions)`.
3. Deletes selected revision directories (`revisions/<resourceId>/v-<N>/`).
4. Canonical and preserved (`metadata.preserve: true`) revisions are never pruned.

**Exit codes:** `0` = success, `2` = unexpected error

**Examples:**
```sh
# Prune current directory project, keeping 50 revisions (default)
node cli/dist/bin/getwrite-cli.cjs prune

# Prune a specific project, keeping only the 10 most recent revisions
node cli/dist/bin/getwrite-cli.cjs prune /path/to/my-project --max 10
```

---

### `reindex`

Rebuilds the inverted index and backlinks for a project from scratch by re-scanning all resources. Use after bulk filesystem changes that bypassed the normal save path, or to recover from a corrupted/stale index.

```sh
getwrite-cli reindex [projectRoot]
```

**Arguments:**
- `projectRoot` (optional) — project to reindex. Defaults to `process.cwd()`.

**What it does:**
1. Reads all resource UUIDs from `<projectRoot>/resources/`.
2. For each resource, loads its content and re-indexes it into `meta/index/inverted.json`.
3. Recomputes backlinks across all resources and persists `meta/backlinks.json`.

**Exit codes:** `0` = success, `2` = unexpected error

**Example:**
```sh
node cli/dist/bin/getwrite-cli.cjs reindex ./my-novel
# [reindex] Done — indexed 12 resource(s) in ./my-novel
```

---

### `doctor`

Read-only integrity check for a project on disk. It flags **broken folder associations** — resources (and folders) whose parent folder id no longer resolves to any existing folder descriptor. These are the orphans the resource tree silently re-parents to the root, the failure mode behind a "lost" folder whose children resurface at the top level.

```sh
getwrite-cli doctor [projectRoot]
```

**Arguments:**
- `projectRoot` (optional) — project to check. Defaults to `process.cwd()`.

**What it does:**
1. Collects every folder id from `<projectRoot>/folders/**/folder.json`.
2. Flags each resource sidecar whose `folderId` is set but matches no folder.
3. Flags each folder whose parent (`parentId`/`folderId`) matches no folder.

**Exit codes:** `0` = no problems, `1` = one or more problems found, `2` = unexpected error. (The non-zero exit on findings makes it usable as a CI/pre-commit gate.)

**Example:**
```sh
node cli/dist/bin/getwrite-cli.cjs doctor ./my-novel
# [doctor] Found 6 problem(s) in ./my-novel:
#   - orphaned resource: "Episode 1 - Scene 1" (3d2604fb-…) -> missing folder 09326c57-…
#   ...
```

To repair, recreate the missing folder reusing its id (so the existing `folderId` references resolve) or move the orphaned items into an existing folder.

---

### `screenshots capture`

Captures full-page screenshots of Storybook stories via a headless Chromium browser (Playwright). Useful for visual regression baselining, design reviews, and CI artifacts.

```sh
getwrite-cli screenshots capture [options]
```

**Options:**
- `-b, --storybook <url>` (default `http://localhost:6006`) — base URL of a running Storybook instance.
- `-o, --out <dir>` (default `./screenshots`) — directory to write PNG files into.
- `-l, --limit <n>` (default `6`) — maximum number of stories to capture.

It fetches Storybook's `/index.json` manifest to discover story IDs, navigates to each story's iframe URL, and saves a full-page PNG. Output files are named from the story ID with `:` and `/` replaced by `_` (e.g. `components-button--primary.png`).

**Exit codes:** `1` = no stories found in `index.json`, `2` = unexpected capture error

**Example:**
```sh
# Capture up to 20 stories from a remote Storybook, saving to /tmp/shots
node cli/dist/bin/getwrite-cli.cjs screenshots capture \
  --storybook https://storybook.example.com --out /tmp/shots --limit 20
```

---

## Environment Variables

| Variable                | Effect                                                     |
| ----------------------- | ---------------------------------------------------------- |
| `GETWRITE_CLI_TESTING`  | When set, suppresses `process.exit` calls (for test usage) |

---

## Source

Package: `cli/` (workspace package `getwrite-cli`)
CLI entry point: `cli/src/getwrite-cli.ts`
Command implementations: `cli/src/commands/`
Tests: `cli/tests/`
Model layer access: the single `@gw/core` barrel (`frontend/src/lib/core.ts`), aliased in `cli/tsconfig.json` and `cli/vitest.config.ts`.
