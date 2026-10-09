# GetWrite CLI

The GetWrite CLI (`getwrite-cli`) is a Node.js command-line tool for project management, Scrivener, Word (DOCX), and plain-text (.txt) import, template operations, revision pruning, integrity checks, screenshot capture, and a developer-facing agentic QA harness.

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

### `project import-scrivener`

Imports a Scrivener 3, Mac-authored `.scriv` project into a new, complete GetWrite project (Feature 31). One-shot, never writes to the source project. The desktop app also exposes this pipeline as an "Import" flow on the Start Page (Feature 43) — this CLI command is no longer the only way to run it.

```sh
getwrite-cli project import-scrivener <scrivPath> [projectRoot] [--name <name>]
```

**Arguments:**

- `scrivPath` (required) — path to the source `.scriv` package directory (not the `.scrivx` file itself).
- `projectRoot` (optional) — directory to create the destination project in. Defaults to `.` (current directory).

**Options:**

- `-n, --name <name>` (optional) — destination project name. Defaults to `scrivPath`'s basename with the `.scriv` extension stripped.

**Refusal check:** before writing anything, the command inspects the source `.scrivx` file's root `Creator` attribute. Only a `Creator` starting with `SCRMAC-3` (Scrivener 3, Mac-authored) is accepted — this is an allow-list, so a Windows-authored project, a Scrivener 2 project, or any unrecognized `Creator` format is refused with a clear message and a non-zero exit, with nothing written to the destination. A `projectRoot` that already exists and is non-empty is refused the same way, before any write; if `projectRoot` did not exist before the run, a fatal error partway through the write phase deletes it again on the way out.

**What it carries over:**

1. The Draft binder's folder/document hierarchy and text (at the destination project's root), plus the Research folder's text content and every other top-level user folder, each as its own top-level GetWrite folder. A binder item with no `<Title>` is imported under a generated fallback name ("Untitled", "Untitled 2", ...), reported.
2. Each document's `content.rtf`, converted to `content.txt` + `content.tiptap.json` (bold/italic preserved as TipTap marks; `\line` as a hard break; backslash-newline treated as a paragraph break alongside `\par`; `\'XX` hex escapes decoded via the document's declared `\ansicpg` code page; a `\field`/`HYPERLINK` run converts to plain text).
3. Each document's synopsis/notes (into sidecar `userMetadata.synopsis`/`userMetadata.notes`, enabling the corresponding feature toggles), Status (seeding `config.statuses` and `userMetadata.status`), Label (a new "Label" select metadata field), Keywords (as GetWrite tags, merging keywords that share a leaf name), and CustomMetaData fields (as new per-project metadata-schema fields). A field whose derived key collides with a built-in or already-added field is created under a suffixed key instead (e.g. `pov-scrivener`), keeping its Scrivener title as the label; the rename is reported.
4. Rebuilds the destination project's inverted index, backlinks, and entity mention index from scratch (mirroring `reindex`); background indexing and the backlinks watcher are suspended for the whole write phase so this rebuild is the only indexing work the run performs.

**What it skips or defers, and reports:** an RTF feature with no GetWrite equivalent, an unreadable/malformed `content.rtf` fragment, a malformed `.scrivx` fragment (recovered as a skip rather than aborting the import), or a custom-metadata field type with no GetWrite mapping (each skipped individually, without aborting the run); the project's Trash content; non-text Research content (media, PDFs, web archives); and any `Type="Other"` binder item, wherever it occurs. On completion the command writes `<projectRoot>/scrivener-import-report.txt`, a fixed eight-section report (Skipped Items, Field Key Renames, Keyword Merges, Unconverted Research Content, Excluded "Other" Items, Trash Content, Snapshot History, Untitled Fallback Names) — every section always appears, even when empty.

**Exit codes:** `0` = success, `2` = refused source project (unsupported Creator or non-empty destination) or unexpected error

**Example:**

```sh
node cli/dist/bin/getwrite-cli.cjs project import-scrivener ./MyNovel.scriv ./my-novel
# Imported Scrivener project to: ./my-novel
# Folders: 4, Resources: 12, Tags: 6
# Report written to: ./my-novel/scrivener-import-report.txt
```

---

### `project import-docx`

Imports a single `.docx` file or a folder of `.docx` files into a new, complete GetWrite project (Feature 45). One-shot, never writes to the source. The desktop app also exposes this pipeline as an "Import Word Document" flow on the Start Page, alongside the existing Scrivener "Import" button.

```sh
getwrite-cli project import-docx <source> [projectRoot] [--name <name>] [-s, --split-level <1-6|none>] [-t, --project-type <id>]
```

**Arguments:**

- `source` (required) — path to a single `.docx` file or a directory containing one or more `.docx` files. The two shapes are auto-detected; a directory with no `.docx` file anywhere in its tree is refused before any write.
- `projectRoot` (optional) — directory to create the destination project in. Defaults to `.` (current directory).

**Options:**

- `-n, --name <name>` (optional) — destination project name. Defaults to the document's own core title (single-file source, when present) or `source`'s basename otherwise.
- `-s, --split-level <1-6|none>` (optional) — heading level to split a single-file source into one resource per section. Defaults to `1`. `"none"` imports the whole document as a single resource. Refused, before any write, against a folder source — a folder source always creates one resource per file and never splits.
- `-t, --project-type <id>` (optional) — destination project-type spec id, read from `getwrite-config/templates/project-types/`. Defaults to `blank`. An unrecognized id is refused before any write.

**What it carries over:**

1. For a single-file source: the document converted (`mammoth` → TipTap; bold/italic preserved) and split into one resource per heading at the chosen level, in document order. A split level with no matching heading anywhere is not an error — the whole document imports as one resource instead, named from the document's own core title (falling back to the source filename), and this is noted in the report. Content before the first split-level heading, and any matching heading with no text of its own, is named "Untitled" ("Untitled 2", ... for a second such section), also noted in the report.
2. For a folder source: one resource per `.docx` file (each independently converted, never split), with subfolders mirrored as GetWrite folders — walked recursively to any depth, non-`.docx` files, Word lock files (`~$*.docx`), and hidden/dot files or folders skipped and tallied, and ordered by case-insensitive natural filename order. Either way, the destination's resource/folder tree always mirrors the source; the chosen project type contributes only its `statuses`/`relationshipTypes` config, never default folders.
3. Each document's footnotes/endnotes, converted to an inline `"[n]"` reference plus a trailing "Notes" paragraph list (TipTap has no list nodes here, so a numbered list is rendered as plain paragraphs).
4. Each document's core title/author (`docProps/core.xml`), the author seeding a new `docx-import`/"Imported Fields" metadata group's "Author" field — created only when at least one processed document actually has one.
5. Rebuilds the destination project's inverted index, backlinks, and entity mention index from scratch (mirroring `reindex`); background indexing is suspended for the whole write phase so this rebuild is the only indexing work the run performs.

**What it never imports:** comments (a package's comment count is still reported) and images/embedded media (their count is still reported). Tracked changes (`w:ins`/`w:del`) are imported accepted-as-shown — insertions kept, deletions dropped — with their count reported, since they are neither skipped nor need a report entry to explain a content difference.

**Exit codes:** `0` = success, `2` = refused source (no `.docx` found, non-empty destination, or unrecognized project type) or unexpected error

**Example:**

```sh
node cli/dist/bin/getwrite-cli.cjs project import-docx ./Manuscript.docx ./my-novel
# Imported DOCX project to: ./my-novel
# Folders: 0, Resources: 8
```

---

### `project import-plaintext`

Imports a single `.txt` file or a folder of `.txt` files into a new, complete GetWrite project (Feature 64). One-shot, never writes to the source. Unlike `import-docx`/`import-scrivener`, this pipeline is CLI-only — there is no desktop UI for it yet.

```sh
getwrite-cli project import-plaintext <source> [projectRoot] [--name <name>]
```

**Arguments:**

- `source` (required) — path to a single `.txt` file or a directory containing one or more `.txt` files. The two shapes are auto-detected; a directory with no `.txt` file anywhere in its tree is refused before any write.
- `projectRoot` (optional) — directory to create the destination project in. Defaults to `.` (current directory).

**Options:**

- `-n, --name <name>` (optional) — destination project name. Defaults to the single file's basename with the `.txt` extension stripped (single-file source) or `source`'s basename (folder source).

**What it carries over:**

1. UTF-8 text only, with a leading byte-order mark stripped before parsing. A blank line (or a run of consecutive blank lines) separates paragraphs; a lone `\n` within a paragraph block is a soft wrap, preserved as a TipTap hard break rather than starting a new paragraph or becoming a literal space.
2. For a single-file source: one resource, named from the file's basename with `.txt` stripped (or `--name`, if given).
3. For a folder source: one resource per `.txt` file, with subfolders mirrored as GetWrite folders — walked recursively to any depth, non-`.txt` files and hidden/dot files or folders skipped and tallied, and ordered by case-insensitive natural filename order.
4. Rebuilds the destination project's inverted index, backlinks, and entity mention index from scratch (mirroring `reindex`); background indexing is suspended for the whole write phase so this rebuild is the only indexing work the run performs.
5. Logs exactly one writing-log entry tagged `source: "plaintext"` (even a zero-word import), excluded from the daily-goal comparison like a docx/Scrivener import.

**Scope:** like `import-docx`/`import-scrivener`, this importer only ever creates a brand-new destination project — a pre-existing, non-empty `projectRoot` is refused before any write; there is no path for importing plain-text content into an already-existing project.

**Exit codes:** `0` = success, `2` = refused source (no `.txt` found, non-empty destination) or unexpected error

**Example:**

```sh
node cli/dist/bin/getwrite-cli.cjs project import-plaintext ./Manuscript.txt ./my-novel
# Imported plain-text project to: ./my-novel
# Folders: 0, Resources: 1
# Report written to: ./my-novel/plaintext-import-report.txt
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

### `templates save-from-resource`

Captures an existing text resource as a template.

```sh
getwrite-cli templates save-from-resource <projectRoot> <resourceId> <templateId> [--name <name>]
```

Writes `<projectRoot>/meta/templates/<templateId>.json` and prints `Saved template <templateId>`. An existing template with the same id is overwritten without prompting. `--name` sets the template name; without it the resource's name is used. An encrypted project is refused. On any error the command prints `Error: <message>` to stderr and exits with code 2, writing no template.

The template records exactly these keys and nothing else from the resource's sidecar:

- `id` (the `templateId` argument), `name`, and `type` (always `text`).
- `plainText`: the resource body, read from the app's layout (`resources/<resourceId>/content.txt`, or text derived from `content.tiptap.json` when `content.txt` is missing).
- `userMetadata`: the sidecar's `userMetadata`, only when it has at least one key.
- `resourceSubtype`: the sidecar's subtype (trimmed), only when the resource has one. It is recorded as a top-level key, not inside `userMetadata`.

Placement and identity (`folderId`, `orderIndex`, `slug`, `createdAt`, `wordCount`) and the entity and goal fields (`entityKind`, `aliases`, `wordCountGoal`, `dismissedNoiseTerms`) are not recorded.

The command fails, writing nothing, when the resource has no sidecar, when its type is not `text` (image, audio and any unknown type are rejected), when its `resourceSubtype` is present but not a non-blank string, when no body can be read, or when the composed template fails schema validation.

**Limitations:**

- The body is saved as plain text only. Paragraph breaks survive; marks (bold, italic), headings, lists and other structure are flattened; soft line breaks (`hardBreak` nodes) contribute no text, so the text on either side of one is joined; trailing blank paragraphs are dropped. A resource created from the template therefore has plain paragraphs, not the original formatting.
- `userMetadata` is copied as recorded. If it contains links to other resources (`resource-ref` or `multi-resource-ref` values, which are ids of resources in the source project), every resource created from the template carries those ids.

**Example:**

```sh
node cli/dist/bin/getwrite-cli.cjs templates save-from-resource ./my-novel b19abcd4-81b2-44ef-b4b4-ba1310dbdf87 scene --name "Scene"
# Saved template scene
```

---

### `templates create`

Creates a new resource from an existing template.

```sh
getwrite-cli templates create <projectRoot> <templateId> [name]
```

Loads `<projectRoot>/meta/templates/<templateId>.json` and instantiates a new resource from it, optionally overriding the display name. Prints `Created resource <id>` on success. The command has no other options (no `--folder`, `--vars` or `--dry-run`). An encrypted project is refused. On any error it prints `Error: <message>` and exits with code 2.

The resource is written the way the app writes a resource, so the app can open it: `resources/<id>/content.tiptap.json` and `content.txt`, a full sidecar at `meta/resource-<id>.meta.json`, and an initial canonical revision `revisions/<id>/v-1`.

- Text templates only. A template whose type is `image`, `audio` or anything else is rejected with an error and nothing is written.
- The template's `userMetadata` (with `{{VAR}}` placeholders substituted) and its top-level `resourceSubtype` are carried onto the resource. A template without `resourceSubtype`, including every template saved before that key existed, creates a resource with no subtype; the subtype is not read from `userMetadata`.
- If the template has a `folderId`, the folder must exist in the project, otherwise the command is rejected. The resource's `orderIndex` is one more than the largest among its siblings (resources and folders in the same parent), or 0 when there are none.
- Validation and reads complete before the first write.

**Entity mentions need a reindex.** Measured 2026-10-08 with the CLI built from this branch, run outside the sandbox against a scratch project: after `templates create`, the new resource was present in `meta/index/inverted.json` (the search index) before any `reindex`, and was absent from `meta/index/mentions.json` until `getwrite-cli reindex` was run. Run `reindex` for entity mentions to include a resource created from the CLI. The cause of the difference between the two indexes was not investigated.

**Example:**

```sh
node cli/dist/bin/getwrite-cli.cjs templates create ./my-novel scene "Opening Scene"
# Created resource b19abcd4-81b2-44ef-b4b4-ba1310dbdf87
```

**Projects with a resource made by the older `templates create`.** Before this change, `templates create` wrote a flat `resources/<slug>-<id>.txt` file and a four-key sidecar. Measured 2026-10-08 on `main`, after such a resource existed, `loadProjectFromDisk` and `getLocalResources` threw for the whole project. These resources are not repaired. Workaround: delete the stray `meta/resource-<id>.meta.json` and the flat `resources/<slug>-<id>.*` file. `doctor` cannot report such a resource, because it loads the project's resources first and that call throws. While such a sidecar remains, `templates create` itself refuses to place a new resource and says so. Template files made by the older tooling are left as they are.

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

The duplicate keeps the source's whole sidecar, including `resourceSubtype`, `entityKind`, `aliases`, `wordCountGoal` and `dismissedNoiseTerms`, and its name and `createdAt` unchanged. A text duplicate also gets one initial canonical revision `v-1` whose content is the duplicate's own document; the source's revision history is not copied. Image and audio duplicates get no revision. A text source with no readable content files is rejected before anything is written. An encrypted project is refused; errors print `Error: <message>` and exit with code 2.

As with `create`, run `getwrite-cli reindex` for entity mentions to include a duplicated resource (measured 2026-10-08: present in the search index and absent from `meta/index/mentions.json` until `reindex`; cause not investigated).

**Example:**

```sh
node cli/dist/bin/getwrite-cli.cjs templates duplicate ./my-novel b19abcd4-81b2-44ef-b4b4-ba1310dbdf87
```

**Text resources that already have no revision.** Copies made in the app (Copy/Duplicate) and duplicates made with this command before this change had no revision, as do text resources created before the app wrote a revision at creation. Measured 2026-10-08 in the running app on `main`: edits typed into a duplicated text resource were not saved and were lost on reload, with no error, and the copy had no revision. The cause was not established by experiment; reading the code suggests the editor only autosaves into a canonical revision. This command fixes copies going forward only. To repair existing ones, run [`repair-revisions`](#repair-revisions).

The app's Copy and Duplicate actions (`copyResourceCore`) behave the same way: a text copy gets its own single initial canonical revision, and a text source with no content files is rejected before any write.

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
4. Canonical and protected (`metadata.preserve: true`) revisions are never pruned. Protected non-canonical revisions are also excluded from the count compared with `--max`; a protected canonical revision still counts.

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

Rebuilds the inverted index, backlinks, and entity mention index for a project from scratch by re-scanning all resources. Use after bulk filesystem changes that bypassed the normal save path, or to recover from a corrupted/stale index.

```sh
getwrite-cli reindex [projectRoot]
```

**Arguments:**

- `projectRoot` (optional) — project to reindex. Defaults to `process.cwd()`.

**What it does:**

1. Reads all resource UUIDs from `<projectRoot>/resources/`.
2. For each resource, loads its content and re-indexes it into `meta/index/inverted.json`.
3. Recomputes backlinks across all resources and persists `meta/backlinks.json`.
4. Rebuilds the entity mention index from scratch (declared entities detected by name/alias in every resource's prose) and persists `meta/index/mentions.json`.

**Does not touch the writing log:** `reindex` does not clear or rebuild `meta/writing-log/`. The log records when words were written and cannot be rebuilt from resources, so it is left as is. See [writing-log.md](./writing-log.md).

**Exit codes:** `0` = success, `2` = unexpected error

**Example:**

```sh
node cli/dist/bin/getwrite-cli.cjs reindex ./my-novel
# [reindex] Done — indexed 12 resource(s) in ./my-novel
```

**One-time note for existing projects:** A backlinks fix now makes
`resource-ref`/`multi-resource-ref` fields resolve correctly, including ones
nested under user-defined metadata fields — previously these were silently
skipped when computing backlinks. For a project you keep working in, no
action is needed: saving any resource recomputes and persists
`meta/backlinks.json` for the whole project, so the on-disk index self-heals
the next time you save. For a project you don't plan to edit again, run
`getwrite-cli reindex` once to bring its backlinks up to date immediately.
Note the limitation this leaves: a project that is never edited again and is
never manually reindexed keeps a stale backlink index indefinitely, and
there is no in-app signal that this is the case.

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

### `repair-revisions`

Gives every text resource that has content but no revision its initial canonical revision.

```sh
getwrite-cli repair-revisions [projectRoot] [--dry-run]
```

**Why it exists.** The editor autosaves into a resource's canonical revision. A text resource with no revision at all has nowhere for those saves to go: measured 2026-10-08 in the running app, text typed into one was not written to disk and was gone after a reload, with no error. Two sources of such resources are known, and both are closed:

- text resources created before 2026-05-13, when the app began writing a revision at creation, for which no revision was ever saved by hand;
- copies and duplicates made before copy and duplicate began writing one.

By reading the code, nothing creates a revision-less text resource today, so this is a one-time repair. Run it once per project.

**Arguments and options:**

- `projectRoot` (optional) — project to repair. Defaults to `process.cwd()`.
- `--dry-run` — list what would be repaired and write nothing.

**What it does:**

1. Lists the project's text resources. Image and audio resources are ignored; they have no revisions.
2. Skips any resource that has a `revisions/<id>/v-*` directory, including one whose metadata is unreadable. It never writes over an existing revision.
3. For each remaining resource, writes `v-1` as the canonical revision, holding the resource's own document (`content.tiptap.json`, or `content.txt` converted when that file is missing) and named by the project's default revision name.
4. A resource with neither content file is reported and left alone.

It writes only under `revisions/`. Content files, sidecars and `project.json` are not modified, and running it again repairs nothing.

**Exit codes:** `0` = nothing needed repair, or everything that did was repaired; `1` = at least one revision-less resource could not be repaired; `2` = unexpected error; `3` = the project is encrypted and was not examined.

**Example:**

```sh
node cli/dist/bin/getwrite-cli.cjs repair-revisions ./my-novel --dry-run
# [repair-revisions] Would repair 2 text resource(s) with no revision in ./my-novel:
#   - "Casey Thorne" (0f3c…)
#   - "Dolores Park" (9a1e…)

node cli/dist/bin/getwrite-cli.cjs repair-revisions ./my-novel
# [repair-revisions] Repaired 2 text resource(s) with no revision in ./my-novel:
#   ...
```

Close the project in the app before running it, and reopen it afterwards so the editor loads the new revision.

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

### `qa`

Developer-facing agentic QA harness (MVP, on-demand, not wired into CI). An
agent — a Claude Code session driving the Playwright MCP server declared in
`.mcp.json` — drives the real GetWrite web app against a disposable, out-of-tree
workspace, and every UI-reported success is independently confirmed against
the filesystem. Inventory scope is limited to projects, resources, and
revisions; see `specs/features/agentic-qa.md` for the full spec and
`specs/features/agentic-qa/procedure.md` for the agent's operating procedure.

Each sub-command below is a separate process invocation; state (workspace
path, server port/pid, accumulated outcomes) is persisted between them to
`<os.tmpdir()>/getwrite-qa/session.json`.

```sh
getwrite-cli qa start
getwrite-cli qa verify project-manifest <projectId>
getwrite-cli qa verify resource-content <projectId> <resourceId> --expected-text "hello"
getwrite-cli qa record unreachable --item-id <id> --reason "control not present"
getwrite-cli qa report
getwrite-cli qa finish
```

**`qa start`** — Creates a fresh disposable workspace via `fs.mkdtemp` outside
the repo tree, starts a Next.js dev server against it (`GETWRITE_PROJECTS_DIR`
pre-set, bound to a free port, URL reported as `http://localhost:<port>`, not
`127.0.0.1` — see note below), and writes the session record.

**`qa verify <kind> [args...]`** — Checks on-disk state for one inventory item
and records the outcome. `kind` is one of `project-manifest`,
`resource-content`, `resource-sidecar`, `revision`. Options: `--expected
<json>` (project-manifest, resource-sidecar), `--expected-text <text>`
(resource-content), `--min-count <n>` (revision), `--item-id <id>`,
`--description <text>`, `--ui-outcome <text>`.

**`qa record <status>`** — Records an outcome with no filesystem check, for
when the agent could not reach a control at all. `status` is one of
`unreachable`, `unverified`, `fail` — `pass` is deliberately not recordable
here; it must be earned via `qa verify`. `--item-id <id>` is required;
`--reason <text>` is required for `unreachable`.

**`qa report`** — Writes `specs/features/agentic-qa/run-report.md`, reconciled
against `specs/features/agentic-qa/inventory.md` so an inventory item the run
never recorded an outcome for is listed as unverified rather than silently
omitted.

**`qa finish`** — Stops the dev server (confirmed by PID, not assumed),
deletes the workspace only if every exercised item passed, and removes the
session record. Any failure or unverified item retains the workspace for
diagnosis.

Two non-obvious behaviors baked into the harness:

- The server URL must use `localhost`, not `127.0.0.1` — Next 16 treats a
  bare IP as a foreign origin absent `allowedDevOrigins` and refuses the HMR
  socket and client chunks, so the page returns 200 but React never hydrates.
- The dev server's stdio is redirected to a log file inside the workspace
  (`qa-server.log`), never a pipe — `qa start`'s process exits immediately,
  and an unread pipe buffer would deadlock the server after one request.

**Example:**

```sh
node cli/dist/bin/getwrite-cli.cjs qa start
# [qa start] Workspace: /var/folders/.../getwrite-qa-xxxxxx
# [qa start] Server URL: http://localhost:54213
```

---

## Environment Variables

| Variable               | Effect                                                     |
| ---------------------- | ---------------------------------------------------------- |
| `GETWRITE_CLI_TESTING` | When set, suppresses `process.exit` calls (for test usage) |

---

## Source

Package: `cli/` (workspace package `getwrite-cli`)
CLI entry point: `cli/src/getwrite-cli.ts`
Command implementations: `cli/src/commands/`
QA harness modules: `cli/src/qa/`
Tests: `cli/tests/`
Model layer access: the single `@gw/core` barrel (`frontend/src/lib/core.ts`), aliased in `cli/tsconfig.json` and `cli/vitest.config.ts`.
