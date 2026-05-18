# Dynamic Metadata Schema

> **Scope note:** This feature spans schema management, sidebar rendering, built-in field
> migration, and referential integrity. It exceeds the 500-word target. Each implementation
> phase should treat the functional requirements here as its acceptance baseline and produce
> a focused sub-spec or task list before work begins.

## Overview

GetWrite currently displays a fixed set of metadata fields on every resource — synopsis, notes,
status, POV, and story timeline — regardless of project type or writing workflow. Writers working
on complex projects (ensemble casts, worldbuilding taxonomies, multi-arc timelines) cannot model
domain-specific attributes, and there is no structured mechanism to link one resource to another.
This feature replaces the hardcoded metadata sidebar with a project-scoped schema system that
writers define and manage entirely from within the application, without editing files or requiring
developer involvement.

## Goals

- Writers can define custom metadata fields — scoped to an entire project or to specific folders
  — using any of seven field types, including direct resource-to-resource links.
- The metadata sidebar renders controls purely from the active project schema; adding a new field
  requires no code change.
- All existing stored metadata values survive the schema introduction with no data loss.
- Resource-to-resource links degrade gracefully on deletion: the referenced name is preserved when
  the UUID is nulled.
- Writers can add, rename, reorder, and delete fields and groups from within the application UI.

## Non-goals

- Cross-resource querying or filtering by metadata field value.
- Schema portability between projects (export/import or shared templates).
- Undo/redo for schema edits.
- Bulk retroactive migration of legacy `pov` string values to `resource-ref` format.

## User stories

- As a novelist, I want to add a "Location" resource-reference field to scene documents so that I
  can record which setting each scene uses without maintaining a separate spreadsheet.
- As a worldbuilder, I want folder-scoped metadata groups for character files so that fields
  irrelevant to other resource types don't clutter every document's sidebar.
- As an existing GetWrite user, I want my synopsis, notes, and status values to appear unchanged
  after the update so that no previously captured work is lost.
- As an author, I want to reorder and rename field groups so that the sidebar reflects my
  current project's terminology and priorities.

## Functional requirements

1. The project schema **must** be stored in `project.json` under `config.metadataSchema`.
2. If a project has no `metadataSchema` entry, the application **must** inject the default schema
   (the seven built-in fields defined in ADR-015) in Redux on first sidebar load; it **must not**
   write to disk until the user makes a schema change.
3. The metadata sidebar **must** render field controls solely from the active project schema; no
   hardcoded field definitions **may** remain in the sidebar component after migration.
4. The seven built-in fields (`synopsis`, `notes`, `status`, `pov`, `storyDate`, `storyDuration`,
   `storyEndDate`) **must** be marked `locked: true` and **must not** be deletable from the UI.
5. Fields **must** support the following types: `text`, `number`, `date`, `boolean`, `select`,
   `multiselect`, `resource-ref`.
6. A `resource-ref` field **must** store values as `{ id: string | null, name: string }` (single)
   or an array of that shape when `multiple: true`.
7. When a resource is soft-deleted, the application **must** update all `resource-ref` values
   project-wide that contain the deleted resource's UUID to `{ id: null, name: <preserved name> }`.
8. Schema management (add/remove/reorder groups and fields, rename fields, edit select options)
   **must** be accessible via a "Metadata" entry added to the existing settings menu
   (`ShellSettingsMenu`), following existing menu patterns.
9. The metadata sidebar **must** include an "Add field" shortcut in its footer that creates a new
   schema field and immediately presents an empty input for that field on the current resource.
10. Folder-scoped schema groups **must** be keyed by folder UUID so that renaming a folder does
    not change which groups apply to its resources.
11. On the first edit of a `pov` field after migration, the application **must** attempt to
    resolve the stored string to a UUID by name-matching against resources in the configured
    target folder; if no match is found, the value **must** be stored as
    `{ id: null, name: <original string> }`.
12. Field keys (`key` property) **should** be validated as URL-safe slugs (lowercase alphanumeric
    and hyphens only) when created via the UI.

## Open questions

- When a field's `key` slug is changed after values have been written under the old key, should
  the UI warn that existing values will become orphaned, and if so, at what point in the rename
  flow?
- For `select` / `multiselect` fields: when an option is deleted from the field definition, are
  stored values that match the deleted option preserved as-is or flagged as invalid in the
  sidebar?
- Can locked built-in fields be hidden per-resource (toggled off without being deleted from the
  schema), or do they always occupy sidebar space for all resources?

## Out of scope (deferred)

- Cross-resource metadata querying and filtering by field value.
- Schema export/import and project-type schema templates.
- Bulk retroactive migration of `pov` string values.
- Extending `backlinks.ts` to index `resource-ref` field values.
- A field-key rename utility that migrates existing `userMetadata` values to the new slug.
- Undo/redo for schema structure changes.
