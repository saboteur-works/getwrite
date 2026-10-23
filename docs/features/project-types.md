# Project Types (developer reference)

This is the developer reference for the project-type JSON format, validation, and scaffolding. For the writer-facing guide to choosing and managing project types in the app, see [docs/user/handbook/organize/project-types.md](../user/handbook/organize/project-types.md).

**Purpose:** Define reusable templates that describe a project's folder structure and initial placeholder resources. Project types let users scaffold a new project with a consistent set of folders, placeholder documents, and metadata.

**File Location:** Typically shipped in `getwrite-config/templates/project-types/` or in `specs/002-define-data-models/project-types/` for examples used by tests and documentation.

**When to use:** When you need a repeatable project skeleton (novel, blog, research notes, etc.). Use project-types for onboarding, sample projects, and CLI scaffolding.

## Structure (JSON)

- `id` (string): stable identifier for the project type (snake_case recommended).
- `name` (string): human-facing display name.
- `description` (string, optional): short summary of the type.
- `folders` (array of objects): ordered list of **top-level** folders. Each has:
  - `name` (string): display name (e.g. `"Workspace"`, `"Story Elements"`).
  - `metadataSource` (object, optional): records authoring intent only; it has
    no runtime effect — see below.
  - `defaultResources` (array, optional): resources seeded into this folder.
  - `special` (boolean, optional): **deprecated and ignored.** See
    [Deprecated: `special`](#deprecated-special).
- `defaultFolders` (array of objects, optional): **subfolders**, each declared
  flat with a pointer to its parent rather than nested. Each has:
  - `folder` (string): the name of the parent folder it is created under.
    The parent may itself be a `defaultFolders` entry, so trees nest to any
    depth.
  - `name` (string): display name.
  - `metadataSource` (object, optional), `special` (boolean, optional): as above.
- `defaultResources` (array of objects, optional): resources to create. Each has:
  - `folder` (string): folder name that owns the resource. If omitted, the
    first folder is used.
  - `name` (string): resource title.
  - `type` (string): resource type (e.g. `text`).
  - `template` (string, optional): initial plain text for the resource.
- `statuses` (array of strings, optional), `relationshipTypes` (array of
  strings, optional — seeds the project's list of entity-relationship types,
  e.g. `["ally of", "rival of"]`), `subtypes` (array of strings, optional —
  seeds the project's resource-subtype list, Feature 72; validated by
  `SubtypeListSchema`, so a blank or case-insensitively duplicate entry fails
  validation; none of the built-in types ships a list), `wordCountGoal`
  (integer, optional), `editorConfig` (object, optional).

The schema is `.strict()` — unknown top-level keys are rejected.

### `metadataSource` — authoring intent, not a runtime mechanism

A folder may carry a `metadataSource` object:

```json
{
  "name": "Characters",
  "folder": "Story Elements",
  "metadataSource": {
    "isMetadataSource": true,
    "metadataInputType": "multiselect"
  }
}
```

- `isMetadataSource` (boolean, required within the object).
- `metadataInputType` (optional): `"text" | "multiselect" | "autocomplete"`.

**Be aware that this flag is superseded and now write-only.** It is a real
authoring control — the project-type editor renders a toggle for it, Zod
validates it, and `project-creator.ts` writes it onto the folder it creates.
It also used to do something: from `0094c97` (2026-04-02) until `cc04767`
(2026-05-17) the Metadata sidebar selected folders by this flag and generated
a reference row for each one, picking the control from `metadataInputType`.
The "schema-driven MetadataSidebar rewrite" removed that in favour of
per-field `refFolder` scoping, and nothing has consumed the flag since.

Treat it as a vestigial authoring surface rather than a switch that does
something. Note the retirement was never recorded as follow-up work, so the
editor still offers a control for a contract nothing honours.

What actually governs reference candidates is a **per-field** setting on the
metadata schema, not a property of the folder. A `multi-resource-ref` field
carries a `refFolder` (a folder **id**) chosen in the Metadata Fields manager,
which offers every folder in the project plus an "Any folder" option and an
include-descendants toggle; scoping is resolved by
`frontend/components/Sidebar/folderScope.ts`. A single `resource-ref` field is
not scoped at all and draws on every resource in the project.

So a template declaring `isMetadataSource` on `Characters` does not by itself
make anything reference-able — it documents that the author meant that folder
to be used that way. Twenty-two such declarations exist across the six shipped
templates, on folders as varied as `Chapters`, `Parts`, `Research`,
`Fact Checking` and `Dialogue & Scripts`, which is a fair indication that the
concept was always meant to be generic rather than tied to particular names.

### Deprecated: `special`

`special` is accepted by the schema and propagated, but **nothing reads it**.
It predates the removal of the Workspace requirement, when certain folder
names carried application behaviour. Today no folder name or flag confers
ordering, protection, or UI semantics (`schemas.ts`, `types.ts`), and there is
no protected folder — any folder can be renamed, moved, or deleted.

If you are updating a hand-written project type, drop `special` — leaving it
in place is harmless, it simply does nothing. Note that `metadataSource` is
not a replacement for it: that flag is also inert at runtime. To make a
folder's contents referenceable, add a `resource-ref` or `multi-resource-ref`
field in the project's Metadata Fields manager and scope it to the folder
there.

## Example

Excerpted from the real `novel` template
(`getwrite-config/templates/project-types/novel_project_type.json`):

```json
{
  "id": "novel",
  "name": "Novel",
  "folders": [
    { "name": "Workspace" },
    { "name": "Story Elements" },
    { "name": "Outline" },
    { "name": "Notes" }
  ],
  "defaultFolders": [
    { "name": "Front Matter", "folder": "Workspace" },
    {
      "name": "Chapters",
      "folder": "Workspace",
      "metadataSource": {
        "isMetadataSource": true,
        "metadataInputType": "multiselect"
      }
    },
    { "name": "Chapter 1", "folder": "Chapters" },
    {
      "name": "Characters",
      "folder": "Story Elements",
      "metadataSource": {
        "isMetadataSource": true,
        "metadataInputType": "multiselect"
      }
    },
    {
      "name": "Locations",
      "folder": "Story Elements",
      "metadataSource": {
        "isMetadataSource": true,
        "metadataInputType": "multiselect"
      }
    }
  ],
  "defaultResources": [
    {
      "folder": "Characters",
      "name": "Character Profile",
      "type": "text",
      "template": "# Character Name\n\n- Description\n- Significance\n"
    }
  ]
}
```

Note that `Front Matter` here is an ordinary folder with no flag and no
behaviour. There is no `Back Matter` folder in any shipped template.

## Validation & Runtime

- Runtime validation is provided by the Zod schema in `frontend/src/lib/models/schemas.ts`. Use the exported helpers `validateProjectType()` and `validateProjectTypeFile()` to check a JSON object or file before scaffolding.
- Entry rules (Feature 90, FR-28): the type `name`, folder, subfolder (`defaultFolders[].name`, `.folder`) and starter document names are trimmed and must not be blank. `statuses` and `relationshipTypes` are trimmed, with no blank entries and no duplicates under `normalizeSubtypeLabel`. Sibling `folders` names, and `defaultFolders` names within one parent, must differ under `slugify` ("Folder name “Chapter 1!” is too similar to “Chapter 1”."). Starter documents with equal slugs are allowed (they are written as separate resources). Each refusal is an issue with a path; `projectTypeFieldErrors()` keys them by the path joined with "." and the write core returns them as `fieldErrors` on a 400 `invalid` refusal so the manager places each message at its field.
- Id and goal rules: `id` must be 1 to `MAX_PROJECT_TYPE_ID_LENGTH` (64, defined in `schemas.ts` and re-exported by `project-types-write-core.ts`) characters of lowercase letters, numbers, hyphens and underscores, so the form refuses an over-long id as well as the write core. `folders` needs at least one entry, and `wordCountGoal` must be a whole number of 0 or more. Each has its own message ("ID must not be blank.", "ID can use only lowercase letters, numbers, hyphens (-) and underscores (\_).", "ID must be 64 characters or fewer.", "Add at least one folder. A new project needs a folder to hold its documents.", "Word count goal must be a whole number of 0 or more."). The folders issue has no field, so the manager shows it in the action-bar list rather than beside a field. `validateProjectType()` gives any other issue a fallback message, "A value under <section> is not valid.", or for an unknown key "This project type has a setting GetWrite does not recognise: <key>.". These messages are covered by unit tests only; they were not measured in the app.
- A saved file that breaks these rules is reported in `unusable` as `invalid`, so the CLI skips it as well.
- The scaffolding entrypoint `createProjectFromType()` (in `frontend/src/lib/models/project-creator.ts`) validates incoming specs and throws a descriptive error if validation fails.

## Usage Notes & Best Practices

- Prefer stable `id` values and snake_case to make programmatic selection predictable.
- Keep folder `name` unique within the `folders` array; the scaffolder uses folder `name` values to match `defaultResources` entries (slug normalization applied).
- When authoring `defaultResources`, include `folder` where possible. If not present, scaffolder falls back to the first `folders[0]` entry.
- Keep templates short and focused; larger starter content can be added as separate templates or via CLI `templates import`.
- Place example types in `specs/002-define-data-models/project-types/` for documentation and tests; place user-configurable templates in `getwrite-config/templates/project-types/` for runtime discovery.

## Extending

- Additional optional fields may be added later (e.g., metadata, per-folder ordering). If you extend the spec, update the Zod schema in `frontend/src/lib/models/schemas.ts` and corresponding unit tests in `frontend/tests/unit`.

## Bundled Project Types

The following project types ship with GetWrite in `getwrite-config/templates/project-types/`:

| File                          | ID                  | Name              | Folders                                   |
| ----------------------------- | ------------------- | ----------------- | ----------------------------------------- |
| `blank_project_type.json`     | `blank`             | Blank             | Workspace                                 |
| `novel_project_type.json`     | `novel`             | Novel             | Workspace, Story Elements, Outline, Notes |
| `serial_project_type.json`    | `serial`            | Serial            | Workspace, Story Elements, Outline, Notes |
| `article_project_type.json`   | `article`           | Article           | Workspace, References, Sources, Ideas     |
| `game_documentation.json`     | `game_writing`      | Game Writing      | Workspace, Research, Notes                |
| `poetry_and_lyrics_type.json` | `poetry_and_lyrics` | Poetry and Lyrics | Workspace, Inspiration, Experiments       |

Note that the file name does not always match the `id` (e.g. `game_documentation.json` has id `game_writing`).

For detailed folder structure and default resources, see each JSON file directly. The project-type selection UI reads these at runtime via `GET /api/project-types`, which returns the built-in types followed by any saved ones (see below).

## Saved project types (Feature 90, Part 1)

Writers can create, edit and delete their own project types in the Project Type Manager. A saved type is one JSON file, `<id>.json`, holding exactly the spec described above, in a **saved store** that is separate from the bundled directory. Built-in types are never written, replaced or deleted.

### Where the store is

The store is the directory named by the environment variable `GETWRITE_SAVED_PROJECT_TYPES_DIR`. Nothing else decides it: there is no default, no working-directory fallback and no use of the projects folder.

- **Desktop:** `electron/src/main.ts` sets the variable for the forked server to `<userData>/project-types` (`app.getPath("userData")`, in packaged and unpackaged builds). It is app-wide, not per workspace: moving the workspace does not move or hide saved types, and app updates do not touch it, because it is outside the app bundle and outside `workspace.json`. The directory is created on the first save.
- **Web dev (`pnpm start`):** the variable is unset unless you export it, so saving is unavailable. Export it to a throwaway or personal folder before starting the dev server to save types, for example `GETWRITE_SAVED_PROJECT_TYPES_DIR=$HOME/getwrite-project-types pnpm start`. Without it the manager still lists and edits the built-in types, but Save, Save as copy and Delete are refused.
- **Hosted auth active (`DATABASE_URL` and `BETTER_AUTH_SECRET` set):** treated as not configured, even if the variable is set.
- **Native (Capacitor) build:** there are no API routes; the project-types backend serves the bundled list only and reports the saved store as `not-configured`.

### Fail-closed behaviour

An unset or blank variable, or active hosted auth, means no saved directory is read and every write is refused with reason `saving-unavailable` (HTTP 503 from the routes). There is no fallback location. A missing directory is not an error (nothing has been saved yet); any other failure to read it makes the resolution report `unreadable`, and writes are then refused with `unreadable` (HTTP 500) rather than treating the store as empty.

### The resolver

`frontend/src/lib/projectTypes.ts` `resolveProjectTypes()` is the single place that lists types. It returns `{ entries, unusable, savedStatus }`: built-in entries first (cached in memory), then saved entries (read from disk on every call, never cached, so a write is visible on the next call). Each entry has `source: "built-in" | "saved"`. A saved file that cannot be used (`unparseable`, `invalid`, `unreadable`) is skipped and reported in `unusable` by file name and short reason only. `savedStatus` is `ok`, `not-configured` or `unreadable`. A built-in id wins over a saved entry with the same id in `getProjectType`. The server, the CLI and the dialogs all read through it.

### Routes

Under `frontend/app/api/project-types/` (not wrapped by `withStorageContext`: app-level configuration, no tenant or project; nothing reads a path, file name or `source` from the client):

- `GET /api/project-types` returns `{ entries: [{ spec, fileName, source }], unusable, savedStatus }`. Server paths are not sent.
- `POST /api/project-types` creates a saved type (201 `{ fileName, spec }`).
- `PUT /api/project-types/[id]` replaces one; the body `id` must equal the path id (200).
- `DELETE /api/project-types/[id]` deletes exactly `<id>.json` (200 `{ fileName }`).

Bodies are capped at 256 KiB, refused before parsing, and validated with the strict schema. A refusal is `{ error, reason, conflictsWith?, fieldErrors? }`: 400 `invalid`, 403 `built-in`, 404 `not-found`, 409 `id-clash` / `name-clash`, 503 `saving-unavailable`, 500 `unreadable` / `write-failed`. The core is `frontend/src/lib/project-types-write-core.ts`; creation is exclusive and replacement is an atomic rename.

### The clash rule

A save is refused when its **id** equals any existing type's id (built-in or saved), or when its **name**, after trimming and case-folding (`normalizeSubtypeLabel`), equals another type's name (built-in or saved). Replacing a saved type never clashes with itself. The refusal names the type it clashes with.

### In the manager

- A built-in type offers **Save as copy** only. Saved types offer **Save**, **Save as copy** and **Delete** (after a confirmation). A new draft offers **Save** and its id can be edited until it is saved; after that the id is read-only.
- **Save as copy** writes the edited content as a new saved type with a new id and name; the original is unchanged.
- The manager shows one line when the list lost saved types: "Saved project types could not be read." (`unreadable`) or "1 saved project type file could not be used." or "N saved project type files could not be used." (unusable files; singular for one). There is **no notice** when the store is `not-configured`: that is not a failure. The new-project dialog and the Word import dialog show the same lines.
- **Unsaved-changes prompt** (`UnsavedChangesPrompt.tsx`): leaving the manager (close, browser back) or selecting another item while any item has edits opens "Unsaved changes", naming the items, with **Keep editing**, **Discard** and **Save**. Escape or an outside click means Keep editing. Save writes the item and then carries on with the exit; a refused save keeps the writer in the manager.

The new-project dialog and the Word import dialog load their list from the resolver, so a saved type is offered wherever a built-in is. The Word import dialog refuses an id that was deleted after the dialog loaded, before anything is written.

## Troubleshooting

- Saving a type fails with "Saving project types is not available here." (503) when `GETWRITE_SAVED_PROJECT_TYPES_DIR` is unset: this is the normal state of `pnpm start` without the variable. The Project Type Manager does not wait for that refusal: when the list reports `savedStatus: "not-configured"` (unset variable, hosted auth, or the Android static registry), it shows `SAVING_UNAVAILABLE_NOTE` (`src/lib/api/project-types.ts`) and turns Save, Save as copy, Delete and the unsaved-changes prompt's Save off. The status reaches the manager through `ShellProjectTypeLoader`, and each refresh replaces it. The manager is reached only as a modal from the settings menu; the standalone `/project-types` page was removed.
- If scaffolding fails with a validation error, run the validator against the file to see field-level problems. The error message contains the zod validation errors.
