---
title: Installing GetWrite
order: 10
summary: Where GetWrite keeps your projects on disk and what a project folder contains.
---

# Installing GetWrite

## Where your work is stored

GetWrite keeps your projects as ordinary files and folders on the computer that runs it. There is no database.

The first time you open GetWrite, the Start Page says **No projects yet**. While your project list loads, it says **Loading projects…**. If GetWrite can't read the list, it says **Projects could not be loaded.**

## Back up a project

Each project is one folder inside your projects folder. The folder's name is a long ID made of letters, numbers and dashes, not the project's name.

To back up a project, copy its folder. A copy placed in a projects folder opens as the same project, with its documents.

## What's inside a project folder

You can open a project's files with ordinary tools. `project.json` and each document's `content.txt` are plain text. A project folder holds:

- `project.json`, the project's name and settings
- `resources/<id>/content.txt` and `content.tiptap.json`, each document's text
- `meta/resource-<id>.meta.json`, each document's details
- `revisions/<id>/v-1/`, saved versions of each document
- `folders/`, the folders you made
