# Templates CLI

The `templates` subcommand group provides helpers for creating, inspecting, exporting, importing and auditing resource templates in a project.

Common subcommands (each section shows Usage, example and expected output)

### save-from-resource

`templates save-from-resource <projectRoot> <resourceId> <templateId> [--name <name>]` — Capture an existing resource into `meta/templates/<templateId>.json`.

```bash
node cli/dist/bin/getwrite-cli.cjs templates save-from-resource ./my/project <resourceId> my-template --name "My Template"
```

Expected output:

```
Saved template my-template from resource <resourceId>
```

### save

`templates save <projectRoot> <templateId> <name>` — Create a simple template file.

```bash
node cli/dist/bin/getwrite-cli.cjs templates save ./my/project my-template "My Template"
```

Expected output:

```
Saved template my-template
```

### create

`templates create <projectRoot> <templateId> [name] [--vars '{}'] [--dry-run]` — Instantiate a resource; `--dry-run` prints planned writes.

```bash
# dry-run
node cli/dist/bin/getwrite-cli.cjs templates create ./my/project my-template --vars '{"TITLE":"Hello"}' --dry-run

# real create
node cli/dist/bin/getwrite-cli.cjs templates create ./my/project my-template --vars '{"TITLE":"Hello"}'
```

Expected output (dry-run):

```
Dry-run planned writes:
/path/to/resources/--dry-run-<id>.txt
/path/to/meta/resource-<id>.meta.json
```

Expected output (real):

```
Created resource <id>
```

### duplicate

`templates duplicate <projectRoot> <resourceId>` — Duplicate a resource (new id, cloned sidecar/file).

```bash
node cli/dist/bin/getwrite-cli.cjs templates duplicate ./my/project <resourceId>
```

Expected output:

```
Duplicated resource -> <newId>
```

### list

`templates list <projectRoot> [--query <text>]` — List templates (id, name, type).

```bash
node cli/dist/bin/getwrite-cli.cjs templates list ./my/project --query "novel"
```

Expected output:

```
my-template-id	My Template	text
```

### inspect

`templates inspect <projectRoot> <templateId>` — Print template details: placeholders and metadata keys.

```bash
node cli/dist/bin/getwrite-cli.cjs templates inspect ./my/project my-template
```

Expected output:

```
id: my-template
name: My Template
type: text
placeholders: TITLE
metadataKeys: author,tags
```

### parametrize

`templates parametrize <projectRoot> <templateId> --placeholder "{{NAME}}"` — Replace literal strings with a placeholder variable and return introduced variables.

```bash
node cli/dist/bin/getwrite-cli.cjs templates parametrize ./my/project my-template --placeholder "{{TITLE}}"
```

Expected output:

```
Parametrized template my-template
Variables: TITLE
```

### export

`templates export <projectRoot> <templateId> <out.zip>` — Export template JSON into a .zip package.

```bash
node cli/dist/bin/getwrite-cli.cjs templates export ./my/project my-template out.zip
```

Expected output:

```
Exported template my-template -> out.zip
```

### import

`templates import <projectRoot> <pack.zip>` — Import templates from a .zip package into `meta/templates/`.

```bash
node cli/dist/bin/getwrite-cli.cjs templates import ./my/project out.zip
```

Expected output:

```
Imported templates: my-template
```

### validate

`templates validate <projectRoot> <templateId>` — Validate template JSON against the runtime schema (zod) and print errors.

```bash
node cli/dist/bin/getwrite-cli.cjs templates validate ./my/project my-template
```

Expected output (valid):

```
Template my-template is valid
```

Expected output (invalid):

```
Template my-template is invalid:
  - name: Invalid input: expected string, received undefined
```

### scaffold

`templates scaffold <projectRoot> <templateId> <count>` — Generate `<count>` resources from a template using sequential names.

```bash
node cli/dist/bin/getwrite-cli.cjs templates scaffold ./my/project my-template 5
```

Expected output:

```
Created 5 resources
```

### apply-multiple

`templates apply-multiple <projectRoot> <templateId> <inputPath>` — Create multiple resources from a JSON array or CSV file of variable sets.

```bash
node cli/dist/bin/getwrite-cli.cjs templates apply-multiple ./my/project my-template ./rows.json
```

Expected output:

```
Created 3 resources
```

### preview

`templates preview <projectRoot> <templateId> [--vars '{}'] [--out <file>]` — Render the template with vars; prints plainText or writes to `--out`.

```bash
node cli/dist/bin/getwrite-cli.cjs templates preview ./my/project my-template --vars '{"TITLE":"Preview"}'
```

Expected output (stdout):

```
Hello Preview
```

### version

`templates version <projectRoot> <templateId>` — Snapshot current template to `<templateId>.v<N>.json`.

```bash
node cli/dist/bin/getwrite-cli.cjs templates version ./my/project my-template
```

Expected output:

```
Saved version -> /path/to/meta/templates/my-template.v1.json
```

### history

`templates history <projectRoot> <templateId>` — List saved template versions.

```bash
node cli/dist/bin/getwrite-cli.cjs templates history ./my/project my-template
```

Expected output:

```
1	/path/to/meta/templates/my-template.v1.json
```

### rollback

`templates rollback <projectRoot> <templateId> <version>` — Restore a saved version into the main template file.

```bash
node cli/dist/bin/getwrite-cli.cjs templates rollback ./my/project my-template 1
```

Expected output:

```
Rolled back my-template -> v1
```

### changeset

`templates changeset <projectRoot> <templateId> [--since <ISO-date>]` — Show compact change entries recorded when templates are saved (timestamps, action, changed keys).

```bash
node cli/dist/bin/getwrite-cli.cjs templates changeset ./my/project my-template --since "2026-02-01T00:00:00Z"
```

Expected output:

```
2026-02-21T05:12:13.957Z	create	created
2026-02-21T05:13:00.000Z	edit	plainText
```
