# Metadata

> Symbol Legend
>
> - 💡: Metadata with this symbol is prescribed and automatically added to its scope.
> - ❗️: Metadata with this symbol is expected to be in its scope, and should not be deleted by the user.
> - 🤖: Metadata with this symbol is managed by the system and should not be directly edited by the user. Direct changes may break files or projects.
> - ✏️: Metadata with this symbol is safe to edit directly in a text editor or via the filesystem.
>
> Fields with none of the above symbols should be modified through the UI. Direct edits may be overwritten or cause inconsistency.

## System vs User Metadata

GetWrite consumes either System Metadata or User Metadata.

**System Metadata** is created automatically and managed primarily by GetWrite. Examples include file locations, creation dates, and slugs.

**User Metadata** is usually created as a result of user input. Examples include notes, file status (such as Draft, In Review, Published), and POV.

`Resources` contain top-level system metadata fields (e.g. `id`, `name`, `createdAt`, `orderIndex`) alongside a `userMetadata` field that holds user-defined key/value pairs. These are intentionally distinct to avoid confusion between system-managed and user-managed data.

## Scopes

### Project Metadata

Project-level metadata is split across two fields in `project.json`: `metadata` for runtime preferences and `config` for behavioral settings.

#### `metadata`

A free-form key/value map on the project record. Currently used to persist project-scoped user preferences.

##### `metadata.userPreferences`

💡❗️✏️ **colorMode** ["light" | "dark"]: The preferred color mode for this project. Overrides the global app-level color mode preference when set, so users don't have to reset it each time they open the project.

#### `config`

Behavioral configuration for the project, persisted in `project.json`.

💡✏️ **maxRevisions** \[Number]: Maximum number of revisions to retain per resource. Defaults to 50 when omitted.

💡✏️ **statuses** \[String[]]: Custom status values available to resources in this project (e.g. `["Draft", "In Review", "Complete"]`).

💡✏️ **autoPrune** \[Boolean]: When `true`, the oldest non-canonical revisions are pruned automatically when the `maxRevisions` limit is exceeded. When `false`, the UI prompts the user interactively (or aborts in headless contexts).

💡 **tags** \[Tag[]]: Project-scoped tags. Each tag has an `id` (UUID), `name` (String), and optional `color` (String). Tag IDs must stay consistent with `tagAssignments` — use the UI to manage these.

💡 **tagAssignments** \[Record\<UUID, UUID[]\>]: Map of resource UUIDs to arrays of tag UUIDs. UUIDs must match valid resources and entries in `tags` — use the UI to manage these.

---

### Resource Metadata

Resource-level metadata consists of system fields at the top level plus an optional `userMetadata` map for user-defined data. All resource types share a common base, with additional type-specific fields.

#### Base fields (all resource types)

🤖 **id** \[UUID]: The unique identifier for the `Resource`

✏️ **name** \[String]: The display name of the resource

🤖 **type** \["text" | "image" | "audio"]: The resource type

🤖 **orderIndex** \[Number]: The order the resource appears in tree views

🤖 **folderId** \[UUID | null]: The UUID of the containing folder, or `null` if top-level

**slug** \[String]: The resource's URL/file slug. Used in filename construction — changing this directly without renaming the associated file will cause inconsistency. Use the UI.

🤖 **sizeBytes** \[Number]: File size in bytes, derived from the filesystem.

✏️ **notes** \[String]: Optional free-text notes

✏️ **statuses** \[String[]]: Optional status tags (project-scoped values, e.g. "Draft", "In Review")

🤖 **createdAt** \[ISO Date]: Creation timestamp

🤖 **updatedAt** \[ISO Date]: Last-modified timestamp

#### `userMetadata`

✏️ **userMetadata** \[Record\<String, MetadataValue\>]: A free-form key/value map for user-defined metadata. Values may be strings, numbers, booleans, or arrays. This field is populated from templates and can be extended freely by the user.

#### Text resource fields

Additional fields present on resources with `type: "text"`.

🤖 **plainText** \[String]: Canonical plain-text representation of the resource content. Used for exports and search.

🤖 **tiptap** \[TipTapDocument]: TipTap editor document (JSON AST) used for rich editing and persistence.

🤖 **wordCount** \[Number]: Derived word count.

🤖 **charCount** \[Number]: Derived character count.

🤖 **paragraphCount** \[Number]: Derived paragraph count.

#### Image resource fields

Additional fields present on resources with `type: "image"`.

🤖 **width** \[Number]: Image width in pixels.

🤖 **height** \[Number]: Image height in pixels.

🤖 **exif** \[Record\<String, MetadataValue\>]: EXIF and related metadata extracted from the image file.

#### Audio resource fields

Additional fields present on resources with `type: "audio"`.

🤖 **durationSeconds** \[Number]: Duration of the audio file in seconds.

🤖 **format** \[String]: Audio file format (e.g. `"mp3"`, `"wav"`).

---

### Revision Metadata

`Revision` metadata is automatically created and handled by the system. These files should **not** be edited by the user.

Changes may cause revisions to break or behave in unexpected ways.

🤖 **id** \[UUID]: The unique identifier of the `Revision`.

🤖 **resourceId** \[UUID]: The Resource the `Revision` represents.

🤖 **versionNumber** \[Number]: The `Revision` version number. The `versionNumber` is created sequentially. The latest `Revision` should have the highest `versionNumber`.

🤖 **createdAt** \[ISO Date]: The ISO date string representing the time the `Revision` was created.

🤖 **savedAt** \[ISO Date]: The ISO date the `Revision` was last saved.

🤖 **filePath** \[String]: The absolute path of the `Revision` on the user's file system.

🤖 **isCanonical** \[Boolean]: `True` if the revision is currently set as the canonical `Revision` of the `Resource`. Only 1 `Revision` is allowed to be set as canonical for any given `Resource` at a time.

✏️ **author** \[String]: Optional author identifier or display name associated with the revision.
