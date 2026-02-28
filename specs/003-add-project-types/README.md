# Project Types — Template Format

This document describes the JSON format used for Project Type templates and provides examples.

Overview

- File location: `getwrite-config/templates/project-types/*.json`
- Purpose: declare a project scaffolding template that defines folders and default resources created when a user makes a new project from the type.

Schema (summary)

- `id` (string, required): URL-safe identifier matching `/^[a-z0-9-_]+$/`.
- `name` (string, required): human-friendly display name.
- `description` (string, optional): short description shown in UI.
- `folders` (array, required, min 1): list of folder declarations. One folder must be named `Workspace`.
    - folder object fields:
        - `name` (string, required)
        - `special` (boolean, optional)
        - `defaultResources` (array of ResourceTemplate, optional)
- `defaultResources` (array of ResourceTemplate, optional): top-level default resources.

ResourceTemplate (summary)

- `id` (string, optional): template identifier for re-use (not required)
- `name` (string, required): resource name
- `type` (string, required): one of `text`, `image`, `audio`
- `folderId` (string|null, optional): target folder id or null
- `template` (string, optional): path or identifier for a content template
- `metadata` (object, optional): additional resource metadata

Validation

Runtime validation is performed via the Zod schema exported from `frontend/src/lib/models/schemas.ts`.
Use `validateProjectType(obj)` to check an in-memory object, or `validateProjectTypeFile(path)` to validate a file.

Example

```json
{
    "id": "novel",
    "name": "Novel",
    "description": "Starter project for long-form fiction",
    "folders": [
        {
            "name": "Workspace",
            "defaultResources": [
                { "name": "Notes", "type": "text" },
                { "name": "Draft", "type": "text" }
            ]
        },
        { "name": "Chapters" }
    ],
    "defaultResources": [
        {
            "name": "Project Readme",
            "type": "text",
            "template": "readme-template"
        }
    ]
}
```

Guidance

- Keep `id` lowercase and dash/underscore separated.
- Always include a `Workspace` folder to match UI assumptions.
- Prefer minimal templates for reusability; use `defaultResources` to add starter content.

If you change the schema, update `frontend/src/lib/models/schemas.ts` and add tests under `frontend/tests/unit`.
