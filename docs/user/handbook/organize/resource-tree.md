---
title: Resource Tree
order: 40
summary: The panel that lists a project's documents, images, audio and folders, and how to create, rename, move and reorder them.
---

# Resource Tree

The Resource Tree is the panel that shows everything inside a project — your documents, images, audio, and folders — in a file-explorer-style layout.

## Browsing and editing

Click any item to open it in the Work Area. From the tree you can create new documents and folders, rename them, and move things around.

- **Create:** the **Create Resource** button, or **Create** in a folder's options menu, opens a New resource dialog with a title, a type (Document, Image, Audio or Folder) and a parent folder.
- **Rename:** an item's options menu, **Rename**, then **Save**.
- **Move:** an item's options menu, **Move to…**, choose the destination, then **Move**.

## Reordering by drag and drop

Drag documents and folders to reorder them within the tree. The order you set stays after a reload, and the [Organizer view](../views/organizer.md) lists a folder's items in the tree's order.

## What lives in the tree

The tree holds [resources](../protect-and-finish/resources.md) of several kinds — text documents, images, audio, and folders that group them together. Selecting a folder opens its contents in the Work Area, which switches to the Organizer view showing the folder's items as cards.

## Warnings and limits

- A folder created inside the Workspace folder through the New resource dialog was not shown in the tree until the page was reloaded (three runs).
- A document, an image and an audio item created in that order under Workspace were listed in a different order, Picture, Tone, Doc One, after a reload (two runs). Order that you set by dragging was kept after a reload.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit b9ddb83c.
