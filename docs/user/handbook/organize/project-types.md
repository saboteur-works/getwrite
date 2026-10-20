---
title: Project Types
order: 30
summary: The six built-in project types, the folders and starter documents each creates, and saving your own in the Project Type Manager.
---

# Project Types

A **project type** is a template that defines how a new project starts out — which folders are created and which starter documents they contain.

## Using a project type

When you create a new project from the Start Page, you pick a project type. GetWrite then creates the folders and any starter documents the type defines.

## Bundled project types

GetWrite ships with these built-in types. The description is the text shown when you create a project; the last column is what was created in a new project of that type.

| Type                  | Description shown when creating a project                                                                                          | Folders and starter documents created                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Blank**             | Minimal project type with only a Workspace folder.                                                                                 | One folder, Workspace. No documents.                                                                                                                                                                                                 |
| **Novel**             | Project type optimized for long-form fiction. Includes drafts, research, and assets.                                               | Workspace (Front Matter, Prologue, Chapters > Chapter 1, Epilogue), Story Elements (Characters, Items, Locations), Outline, and Notes. Starter documents: Scene 1 (in Chapter 1), Character Profile, Item Profile, Location Profile. |
| **Serial**            | Serialized fiction project type for episodes or installments.                                                                      | Workspace (Parts > Part 1), Story Elements (Characters, Items, Locations), Outline, and Notes. Starter document: Scene 1 (in Part 1).                                                                                                |
| **Article**           | Short-form article project type with drafts and references.                                                                        | Workspace (Articles > Article 1), References (Fact Checking), Sources (Interviews & Transcripts), and Ideas. Starter document: Article Outline.                                                                                      |
| **Game Writing**      | Project type optimized for game writing (video game or tabletop RPG). Includes folders for lore, characters, quests, and dialogue. | Workspace (Lore > Factions, History, Geography & Worldbuilding, Characters; Quests & Story Arcs; Dialogue & Scripts), Research, and Notes. No documents.                                                                             |
| **Poetry and Lyrics** | Project type optimized for poetry and song lyrics. Includes drafts, research, and assets.                                          | Workspace, Inspiration (Phrases & Fragments, Influences), and Experiments. No documents.                                                                                                                                             |

## Managing project types

Open the **Project Type Manager** from the settings menu (gear icon). It lists the built-in types and any you have saved, and opens the selected type in a form with its id, name, word count goal, description, statuses, folders, default folders, default resources and editor settings. **New Project Type** opens a blank draft.

- A built-in type offers **Save as copy** only. Built-in types are never changed or deleted.
- **Save as copy** writes your edits as a new saved type with its own id and name; the original is unchanged.
- A type you saved offers **Save** (replaces it), **Save as copy** and **Delete**. Delete asks you to confirm.
- A new draft offers **Save**. Its id can be edited until the first save, and is read-only after that.
- Each type needs its own id and its own name. A save is refused if the id matches any other type, or if the name matches another type's name ignoring capitals and surrounding spaces. The refusal names the type it clashes with.
- If you close the manager, go back, or select another type while any type has unsaved edits, an "Unsaved changes" prompt lists them with **Keep editing**, **Discard** and **Save**. Escape or clicking outside means Keep editing. If a save is refused, you stay in the manager.
- A saved type appears in the new-project dialog and the Word import dialog. The Word import dialog refuses a type that was deleted after the dialog loaded, before anything is written.

On the desktop app, saved types are kept in a `project-types` folder inside the app's data folder, shared by every workspace. Where that folder is not configured (for example `pnpm start` without `GETWRITE_SAVED_PROJECT_TYPES_DIR` exported, or hosted auth active), Save, Save as copy and Delete are refused with "Saving project types is not available here." and nothing is written. If saved files cannot be read or used, the manager shows "Saved project types could not be read." or "N saved project type file(s) could not be used." For the command line, see [the CLI guide](../../../features/cli.md) (`project types`, `project create --project-type`).

## Warnings and limits

- The Word import dialog lists the same names as the Project Type Manager: Article, Blank, Game Writing, Novel, Poetry and Lyrics, Serial.
- The command-line tool sees saved types only when `GETWRITE_SAVED_PROJECT_TYPES_DIR` is exported to the same folder, so its list can differ from the app's.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit b9ddb83c. The Managing project types section (Feature 90) was read from the code in `ProjectTypesManagerPage.tsx`, `UnsavedChangesPrompt.tsx` and `project-types-write-core.ts`, not re-measured in a running app.
