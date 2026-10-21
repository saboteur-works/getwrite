# Tags

GetWrite supports project-scoped tags that can be assigned to any resource. Tags and their assignments are persisted in `project.json` under `config`.

---

## Data Model

Tags are stored in `project.json`:

```json
{
  "config": {
    "tags": [
      { "id": "uuid-a", "name": "POV Scene", "color": "#D44040" },
      { "id": "uuid-b", "name": "Key Event" }
    ],
    "tagAssignments": {
      "resource-uuid-1": ["uuid-a"],
      "resource-uuid-2": ["uuid-a", "uuid-b"]
    }
  }
}
```

**`config.tags`** — Array of tag objects:

- `id` (UUID): stable identifier for the tag
- `name` (string): display label
- `color` (string, optional): hex color for the tag chip

**`config.tagAssignments`** — Map of resource UUID → array of tag UUIDs assigned to that resource.

---

## Implementation (`tags.ts`)

`frontend/src/lib/models/tags.ts` provides CRUD operations for tags and assignments:

| Function                                | Description                                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create tag                              | Generates a UUID, appends to `config.tags`, writes `project.json`                                                                                                                                  |
| Create checked tag (`createCheckedTag`) | The writer-facing create (route and native transport): same rules as Update tag, then Create tag. Scrivener import calls the unchecked Create tag, since keyword names may differ only in capitals |
| Update tag (`updateTag`)                | Finds tag by ID, sets the trimmed `name` and the `color` (absent clears it), writes `project.json`; refuses a blank name, another tag's name (ignoring capitals) or a non-hex colour               |
| Delete tag                              | Removes from `config.tags` and all entries in `config.tagAssignments`                                                                                                                              |
| Assign tag to resource                  | Adds tag UUID to `config.tagAssignments[resourceId]`                                                                                                                                               |
| Remove tag from resource                | Removes tag UUID from `config.tagAssignments[resourceId]`                                                                                                                                          |
| List tags for resource                  | Reads `config.tagAssignments[resourceId]` and resolves tag objects                                                                                                                                 |

All operations read the current `project.json`, apply the change, and write back atomically.

---

## Persistence

Tags are part of `project.json` — they are project-scoped and not per-resource. This means:

- Tags exist independently of resources; a tag can exist without being assigned to anything
- Tag UUIDs in `tagAssignments` must match UUIDs in `config.tags` — orphaned assignment UUIDs are ignored at read time
- The UI manages consistency; direct edits to `project.json` should maintain this constraint

---

## UI Integration

Tags are managed through the Tags section of the Metadata sidebar when a resource is selected. The app reads `config.tags` to populate available options and writes `config.tagAssignments` when the user assigns or removes a tag.

Project-level tag management (create, edit name and colour, delete) is in Project Settings → **Manage Tags**. A tag keeps its id when edited, so its assignments and any saved query that names it follow the change. The sidebar Tags section reloads its list after any create, edit or delete made through `lib/api/tags.ts` (`onTagsChanged`).

---

## Source File

`frontend/src/lib/models/tags.ts`
