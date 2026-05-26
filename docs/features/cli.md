# GetWrite CLI

The GetWrite CLI (`getwrite-cli`) is a Node.js command-line tool for project management, template operations, revision pruning, and screenshot capture. It is bundled separately from the Next.js frontend using esbuild.

---

## Building the CLI

From the `frontend/` directory:

```sh
pnpm build:cli
```

(`pnpm build` runs `next build` and does **not** produce the CLI.)

The bundled CLI is written to:

```
frontend/dist-cli/bin/getwrite-cli.cjs
```

---

## Invocation

```sh
node ./dist-cli/bin/getwrite-cli.cjs <command> [args]
```

During development you can also run via ts-node or vitest (the CLI is tested with `GETWRITE_CLI_TESTING=1` to suppress `process.exit`).

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
node dist-cli/bin/getwrite-cli.cjs project create ./my-novel \
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
node dist-cli/bin/getwrite-cli.cjs templates save ./my-novel scene "Scene"
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
node dist-cli/bin/getwrite-cli.cjs templates create ./my-novel scene "Opening Scene"
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
node dist-cli/bin/getwrite-cli.cjs templates duplicate ./my-novel b19abcd4-81b2-44ef-b4b4-ba1310dbdf87
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
node dist-cli/bin/getwrite-cli.cjs templates list ./my-novel
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
node dist-cli/bin/getwrite-cli.cjs prune

# Prune a specific project, keeping only the 10 most recent revisions
node dist-cli/bin/getwrite-cli.cjs prune /path/to/my-project --max 10
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
node dist-cli/bin/getwrite-cli.cjs reindex ./my-novel
# [reindex] Done — indexed 12 resource(s) in ./my-novel
```

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
node dist-cli/bin/getwrite-cli.cjs screenshots capture \
  --storybook https://storybook.example.com --out /tmp/shots --limit 20
```

---

## Environment Variables

| Variable                | Effect                                                     |
| ----------------------- | ---------------------------------------------------------- |
| `GETWRITE_CLI_TESTING`  | When set, suppresses `process.exit` calls (for test usage) |

---

## Source

CLI entry point: `frontend/src/cli/getwrite-cli.ts`  
Command implementations: `frontend/src/cli/commands/`
