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

Resource-level metadata is persisted in a sidecar file at `meta/resource-<uuid>.meta.json`. It consists of a set of system fields plus a `userMetadata` map for user-defined data. All resource types share a common base, with additional type-specific fields.

#### Base fields (all resource types)

The following fields are written to the sidecar file by the primary persistence path.

🤖 **id** \[UUID]: The unique identifier for the `Resource`

✏️ **name** \[String]: The display name of the resource

🤖 **type** \["text" | "image" | "audio"]: The resource type

🤖 **orderIndex** \[Number]: The order the resource appears in tree views. Note: when persisting, this value is sourced from `userMetadata.orderIndex`.

🤖 **folderId** \[UUID | null]: The UUID of the containing folder, or `null` if top-level

**slug** \[String]: The resource's URL/file slug. For folder resources, this is used as the directory name on disk — changing it directly without renaming the directory will cause inconsistency. Use the UI.

🤖 **createdAt** \[ISO Date]: Creation timestamp

The following fields are defined in the schema and may be present in the sidecar (e.g. after a sidecar update via the UI), but are not written by the primary resource creation path.

🤖 **sizeBytes** \[Number]: File size in bytes, derived from the filesystem.

🤖 **updatedAt** \[ISO Date]: Last-modified timestamp

#### `userMetadata`

✏️ **userMetadata** \[Record\<String, MetadataValue\>]: A free-form key/value map for user-defined metadata. Values may be strings, numbers, booleans, null, homogeneous primitive arrays, or nested objects. This field is populated from templates and can be extended freely by the user.

##### Well-known `userMetadata` keys

The following keys are set by the MetadataSidebar UI and have defined meaning within the app. They are safe to edit directly.

✏️ **notes** \[String]: Free-text notes for the resource.

✏️ **status** \["draft" | "in-review" | "published"]: Publication status of the resource. The available values are defined by `config.statuses` in `project.json`.

✏️ **characters** \[String[]]: Character names associated with the resource.

✏️ **locations** \[String[]]: Location names associated with the resource.

✏️ **items** \[String[]]: Item or prop names associated with the resource.

✏️ **pov** \[String]: Point-of-view character name for the resource.

**orderIndex** \[Number]: The resource's position in tree views. Sourced from this key by the persistence layer when writing the top-level `orderIndex` sidecar field. Use the UI to reorder.

#### Text resource fields

Additional fields present on resources with `type: "text"`.

`plainText` and `tiptap` are stored in separate files under `resources/<uuid>/`, not in the sidecar. `wordCount`, `charCount`, and `paragraphCount` are computed in-memory at creation time; they may appear in the sidecar after a UI-triggered update but are not written by the primary resource creation path.

🤖 **plainText** \[String]: Canonical plain-text representation of the resource content. Stored at `resources/<uuid>/content.txt`. Used for exports and search.

🤖 **tiptap** \[TipTapDocument]: TipTap editor document (JSON AST) used for rich editing and persistence. Stored at `resources/<uuid>/content.tiptap.json`.

🤖 **wordCount** \[Number]: Derived word count.

🤖 **charCount** \[Number]: Derived character count.

🤖 **paragraphCount** \[Number]: Derived paragraph count.

#### Image resource fields

Additional fields present on resources with `type: "image"`. Schema-defined; not written by the primary persistence path.

🤖 **width** \[Number]: Image width in pixels.

🤖 **height** \[Number]: Image height in pixels.

🤖 **exif** \[Record\<String, MetadataValue\>]: EXIF and related metadata extracted from the image file.

#### Audio resource fields

Additional fields present on resources with `type: "audio"`. Schema-defined; not written by the primary persistence path.

🤖 **durationSeconds** \[Number]: Duration of the audio file in seconds.

🤖 **format** \[String]: Audio file format (e.g. `"mp3"`, `"wav"`).

---

### Folder Metadata

Folder metadata is persisted as a `folder.json` file inside the folder's own directory at `folders/<slug>/folder.json`. Unlike resources, folders do not use a sidecar file.

🤖 **id** \[UUID]: The unique identifier for the `Folder`.

✏️ **name** \[String]: The display name of the folder.

🤖 **type** \["folder"]: Always `"folder"`. Discriminates folders from resources.

🤖 **slug** \[String]: Used as the folder's directory name on disk. Changing this directly without renaming the directory will break the folder. Use the UI.

🤖 **parentId** \[UUID | null]: The UUID of the parent folder, or `null` for top-level folders.

🤖 **orderIndex** \[Number]: The order the folder appears in tree views.

🤖 **createdAt** \[ISO Date]: Creation timestamp.

🤖 **special** \[Boolean]: When `true`, marks the folder as a system-designated special folder (e.g. Workspace). Special folders may be treated differently in ordering and UI. Should not be set by the user.

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
