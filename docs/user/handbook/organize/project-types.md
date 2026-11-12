---
title: Project Types
order: 30
summary: The six built-in project types, the folders and starter documents each creates, and saving your own in the Project Type Manager.
---

# Project Types

A **project type** is a template for a new project. It sets which folders are created and which starter documents they contain.

## Choose a type for a new project

When you create a project from the Start Page, you pick a project type. GetWrite then creates the folders and starter documents that type defines.

## Built-in project types

GetWrite comes with these types. The description is the text shown when you create a project.

| Type                  | Description shown when creating a project                                                                                          | Folders and starter documents created                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Blank**             | Minimal project type with only a Workspace folder.                                                                                 | One folder, Workspace. No documents.                                                                                                                                                                                                 |
| **Novel**             | Project type optimized for long-form fiction. Includes drafts, research, and assets.                                               | Workspace (Front Matter, Prologue, Chapters > Chapter 1, Epilogue), Story Elements (Characters, Items, Locations), Outline, and Notes. Starter documents: Scene 1 (in Chapter 1), Character Profile, Item Profile, Location Profile. |
| **Serial**            | Serialized fiction project type for episodes or installments.                                                                      | Workspace (Parts > Part 1), Story Elements (Characters, Items, Locations), Outline, and Notes. Starter document: Scene 1 (in Part 1).                                                                                                |
| **Article**           | Short-form article project type with drafts and references.                                                                        | Workspace (Articles > Article 1), References (Fact Checking), Sources (Interviews & Transcripts), and Ideas. Starter document: Article Outline.                                                                                      |
| **Game Writing**      | Project type optimized for game writing (video game or tabletop RPG). Includes folders for lore, characters, quests, and dialogue. | Workspace (Lore > Factions, History, Geography & Worldbuilding, Characters; Quests & Story Arcs; Dialogue & Scripts), Research, and Notes. No documents.                                                                             |
| **Poetry and Lyrics** | Project type optimized for poetry and song lyrics. Includes drafts, research, and assets.                                          | Workspace, Inspiration (Phrases & Fragments, Influences), and Experiments. No documents.                                                                                                                                             |

## Make your own types

Open the **Project Type Manager** from the settings menu (the gear icon). It lists the built-in types and any you have saved. Select a type to see its ID, name, word count goal, description, statuses, folders, subfolders, starter documents, editor settings and modules.

- A built-in type offers **Save as copy** only. Built-in types never change.
- **Save as copy** saves your edits as a new type with its own ID and a name ending in "copy". The original stays as it was.
- A type you saved offers **Save**, which replaces it, plus **Save as copy** and **Delete**. **Delete** asks you to confirm. The confirmation says projects already made from the type are not affected.
- **New Project Type** starts a new type with **Save**. You can change its ID until you first save it. After that, the ID is fixed.

Your saved types appear with "(Saved)" in the list of types when you create a project or import a Word document.

### Start new projects with modules on

_Coming in the next release._

Some features, such as [Claims](../write/claims.md), are switched on per project in **Project Settings**, **Modules**. A type can set whether a new project starts with each of them on or off.

In the **Project Type Manager**, the **Modules** section has one choice for each module: **On**, **Off** or **Not set**. **Not set** declares nothing for that module, so the module follows its usual setting for a new project. Claims is off unless a type turns it on. Sources is on.

- A built-in type's modules are shown for reading only. No built-in type turns Claims on.
- Where saving types isn't available, the modules of every type are shown for reading only, with a message saying so.
- A type sets modules only for projects created from it afterward. Changing or deleting a type never changes a project that already exists.
- A type that lists a module with anything other than on or off is refused with a message and not saved.
- An older version of GetWrite can't use a saved type that sets modules. It lists the file as one that could not be used.

### Start new projects with Organizer arrangements

_Coming in the next release._

A project type can list [Organizer arrangements](../views/organizer.md) for new projects to start with. Each one has a name, a folder, and a choice for the rows and for the columns. The folder is named by its folder name in the type, and the arrangement can show just that folder or that folder and its subfolders.

- The Project Type Manager does not show or edit arrangements. A type's file holds them, under the key `arrangements`. No built-in type has any.
- A new project gets its own copy of each arrangement. You can rename or delete them like any you save yourself. Changing or deleting a type later never changes a project that already exists.
- GetWrite leaves an arrangement out when the type has no folder by that name, when two arrangements share a name, or when it can't be applied. It does not tell you. The project is still created.
- An arrangement can't use a smart folder, because a new project has none.

### Unsaved changes

If a type has unsaved edits and you close the manager, go back, or select another type, an **Unsaved changes** prompt lists the types with edits. Choose **Keep editing**, **Discard** or **Save**. Pressing Escape or clicking outside the prompt also keeps you editing. If a save is refused, you stay in the manager.

### What a type needs before it saves

Each type needs its own ID and its own name. GetWrite won't save a type if another type has the same ID, or the same name (ignoring capitals and spaces at either end). The message names the type it clashes with.

GetWrite also shows a message and saves nothing when:

- the name is blank
- a status is blank, or matches another status (ignoring capitals and spaces at either end)
- a folder, subfolder or starter document name is blank
- a subfolder's **Parent Folder** is blank
- two folders, or two subfolders in the same parent, have names that would make the same folder on disk, for example "Chapter 1" and "Chapter 1!"
- the ID is blank, uses anything other than lowercase letters, numbers, hyphens (-) and underscores (\_), or is longer than 64 characters
- the word count goal is below 0
- the type has no folders

Two starter documents can have the same name. Spaces at the start or end of a name are removed when you save.

You can leave a starter document's **Folder** empty. The document then goes in the first folder, and a line under the field says so.

## Where your saved types are kept

In the desktop app, your saved types are kept in a `project-types` folder inside GetWrite's data folder.

In a web copy of GetWrite that you run yourself, saving types needs the `GETWRITE_SAVED_PROJECT_TYPES_DIR` setting, pointed at a folder, before you start GetWrite. Without it, the manager says at the top: "Saving project types isn't available in this version of GetWrite, so Save, Save as copy and Delete are turned off. You can still view every type and create projects from it. To save your own types, use the GetWrite desktop app." **Save**, **Save as copy** and **Delete** are then turned off, and so is **Save** in the **Unsaved changes** prompt. This depends on where GetWrite is running, not on whether a project is open.

If GetWrite can't use your saved types, the manager says "Saved project types could not be read." or "1 saved project type file could not be used." (or the number of files, for more than one). A saved file that breaks the rules above is left out of the list.

## Good to know

- If you delete a saved type while the **Import from Word** dialog is open, and then start the import with that type, GetWrite refuses with "That project type isn't recognized." Nothing is imported. Choose another type and start again.
- The command-line tool only sees your saved types when `GETWRITE_SAVED_PROJECT_TYPES_DIR` is set to the same folder, so its list can differ from the app's. It also skips a saved file that breaks the rules above.
