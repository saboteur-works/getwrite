# Metadata

> Symbol Legend
>
> - 💡: Metadata with this symbol is prescribed and automatically added to its scope.
> - ❗️: Metadata with this symbol is expected to be in its scope, and should not be deleted by the user.
> - 🤖: Metadata with this symbol is managed by the system and should not be directly edited by the user. Direct changes may break files or projects.

## System vs User Metadata

GetWrite consumes either System Metadata or User Metadata.

**System Medata** is created automatically and managed primarily by GetWrite. Example of System Data include file locations, creation dates, and slugs.

**User Metadata** is usually created as a result of the user generating it. Examples of User Data include notes, file status (such as Draft, In Review, Published), and POV.

> **Note**: In the current version, `Resources` contain top-level Metadata and a `metadata` field. The top level Metadata is System Metadata, while the metadata contained in the `metadata` field is user metadata. This can easily be confused as redundant, and cause issues for human and AI developers.
>
> The `metadata` field will be renamed `userMetadata` where necessary for clarity.

## Scopes

### Project Metadata

Project-scoped metadata.

```json
{
    "userPreferences": {
        "colorMode": "dark"
    }
}
```

#### `userPreferences`

💡❗️ **colorMode** ["light" | "dark"]: Informs the system whether the project should load in light mode or dark mode, so users don't have to (re)set it on each load.

### File Metadata

**id** \[UUID]: The unique identifier for the `File`

**name** \[String]: The name of the file

**type** \["text" | "image" | "audio"]: The type of `Resource` the `File` contains metadata for

**orderIndex** \[Number]: The order the resource is positioned in tree views.

**folderId** \["UUID"]: The UUID of the folder the resource is located in.

**slug** \[String]: The `Resource's` slug

### Revision Metadata

`Revision` metadata is automatically created and handled by the system. These files should **not** be edited by the user.

Changes may cause revisions to break or behave in unexpected ways.

🤖 **id** \[UUID]: The unique identifer of the `Revision`.

🤖 **resourceId** \[UUID]: The Resource the `Revision` represents.

🤖 **versionNumber** \[Number]: The `Revision` version number. The `versionNumber` is created sequentially. The latest `Revision` should have the highest `versionNumber`.

🤖 **createdAt** \[ISO Date]: The ISO date string representing the time the `Revision` was created.

🤖 **savedAt** \[ISO Date]: The ISO date the `Revision` was last saved.

🤖 **filePath** \[ISO Date]: The absolute path of the `Revision` on the user's file system.

🤖 **isCanonical** \[Boolean]: `True` if the revision is currently set as the canonical `Revision` of the `Resource`. Only 1 `Revision` is allowed to be set as canonical for any given `Resource` at a time.
