---
title: Installing GetWrite
order: 10
summary: Where GetWrite keeps your projects on disk and what a project folder contains.
---

# Installing GetWrite

## Where your work is stored

GetWrite is **local-first**: your projects live as plain files and folders on the machine that runs GetWrite. The first launch with a fresh settings folder starts with an empty workspace ("No projects yet", shown once the project list has loaded; "Loading projects…" until then, and "Projects could not be loaded." if reading the list fails). Each project is one folder, named by a UUID, inside the projects folder. Because everything is on disk, you can back a project up by copying its folder, and you can inspect it with ordinary file tools: `project.json` and each document's `content.txt` are readable text.

## No database

No database files were found in a project folder. Every project, resource, and piece of metadata that was checked is a file or folder on disk, for example:

- `project.json`
- `resources/<id>/content.txt` and `content.tiptap.json`
- `meta/resource-<id>.meta.json`
- `revisions/<id>/v-1/`
- `folders/`

## Warnings and limits

None recorded.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit b9ddb83c.
