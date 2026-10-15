---
title: Project Types
order: 30
summary: The six built-in project types, the folders and starter documents each creates, and the Project Type Manager.
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

Open the **Project Type Manager** from the settings menu (gear icon). It lists the six built-in types by name and file name, and opens the selected type in a form with its id, name, word count goal, description, statuses, folders, default folders, default resources and editor settings. **New Project Type** opens a blank draft.

Editing a field marks the type "Unsaved changes", but no control to save or delete a project type was found in the manager. In a test on a throwaway copy of the project-type files, an edited type and a new draft were not written to those files, and after closing and reopening the manager the six originals were listed again.

## Warnings and limits

- The Project Type Manager has no save or delete control, and edits made in it were not kept (see above).
- The Word import dialog on the desktop app lists the Game Writing type as "Game Documentation" and Poetry and Lyrics as "Poetry & Lyrics"; the Start Page's create dialog and the Project Type Manager use "Game Writing" and "Poetry and Lyrics".

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit b9ddb83c.
