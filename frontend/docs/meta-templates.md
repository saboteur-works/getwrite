# Project Meta: Templates

> **Which commands are shipped.** The bundled CLI (`cli/src/commands/templates.ts`, registered by `cli/src/getwrite-cli.ts`) registers only five `templates` subcommands: `save`, `save-from-resource`, `create`, `duplicate` and `list`. `create` takes `<projectRoot> <templateId> [name]` and no other options (no `--vars`, no `--dry-run`); `list` takes `<projectRoot>` and no `--query`. The other subcommands and options described below exist only in an unbundled developer helper, `cli/src/templates.ts`, which is not part of the shipped binary. For the shipped commands, see [docs/features/cli.md](../../docs/features/cli.md).

This document explains the on-disk layout and usage for resource templates.

Location

- Resource templates (used to create resources inside a project) are stored per-project under `meta/templates/` as individual JSON files named `<templateId>.json`.

- Project-type templates (JSON specs that define project folder structure and default resources) are maintained in the repository under `getwrite-config/templates/project-types/`. These files can be passed to the CLI `project create --spec <path>` to scaffold new projects.

Format

- Each template is a JSON object with at least the following fields:
  - `id`: string (template identifier)
  - `name`: string (human readable name)
  - `type`: `text|image|audio`
  - `plainText` (optional): for `text` templates the initial body
  - `userMetadata` (optional): metadata applied to the created resource's sidecar (`{{VAR}}` placeholders are substituted)
  - `resourceSubtype` (optional): top-level subtype label for the created resource; absent when unset, and a template without it creates a resource with no subtype
  - `folderId` (optional): target folder; must name an existing folder when set

Operations

- Use the CLI helper at `cli/src/templates.ts` for quick management in development. The helper supports the following commands (developer-facing). Only `save-from-resource`, `save`, `create` (without `--vars`/`--dry-run`), `duplicate` and `list` (without `--query`) are also registered in the shipped CLI:
  - `save-from-resource <projectRoot> <resourceId> <templateId> [--name <name>]` — capture an existing text resource (plain-text body, `userMetadata`, `resourceSubtype`) and persist it as a template; shipped.
  - `save <projectRoot> <templateId> <name>` — create an empty template stub.
  - `create <projectRoot> <templateId> [name] [--vars '{}'] [--dry-run]` — create a resource from a template; `--vars` accepts a JSON object of substitutions; `--dry-run` prints planned writes.
  - `duplicate <projectRoot> <resourceId>` — duplicate an existing resource in-place.
  - `list <projectRoot> [--query <text>]` — list available templates (optional query filter).
  - `inspect <projectRoot> <templateId>` — show template details and placeholders.
  - `parametrize <projectRoot> <templateId> --placeholder "{{NAME}}"` — replace literal occurrences with a placeholder and return introduced variables.
  - `export <projectRoot> <templateId> <out.zip>` — package a template (JSON) into a ZIP file for sharing.
  - `import <projectRoot> <pack.zip>` — import templates from a ZIP package into `meta/templates/`.

- Programmatic APIs are exposed by `frontend/src/lib/models/resource-templates.ts`.

Notes

- Templates are project-local; do not commit generated template files to version control unless intentionally shared.
