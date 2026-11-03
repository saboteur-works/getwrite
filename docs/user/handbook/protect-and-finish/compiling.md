---
title: Compiling Projects
order: 210
summary: Compile a project, or only the documents tied to one entity, into a single txt, md, pdf or docx file.
---

# Compiling Projects

A project is written across many separate documents. **Compiling** joins the documents you choose into one file, in the format you pick. Compiling never changes anything in your project.

## Compile a project

You can start a compile in two places:

- On the [Start Page](../organize/start-page.md), without opening the project: open the project's **Manage** menu and choose **Package**.
- Inside the project: open the project menu and choose **Compile Project**.

Both open the **Compile Project** dialog.

1. Tick the resources to include in the tree, or use **Select All** and **Select None**. The dialog shows how many are selected.
2. Under **Compile as**, choose **txt**, **md**, **pdf** or **docx**.
3. Choose **Compile (n)**, where n is the number selected.

GetWrite makes one file, named after the project, and downloads it. Each document starts with its title, followed by its text.

## Choose the order

Documents appear in the file in the same order as your [resource tree](../organize/resource-tree.md). A document inside a folder comes where that folder sits in the tree. To change the order, drag documents in the tree before you compile.

## Compile an entity's resources

You can compile only the documents tied to one [entity](../story/metadata.md), such as a character or a place.

1. Open the entity's document. Its sidebar's **Entity Mentions** section lists every resource that mentions it or links to it.
2. Choose **Compile this entity's resources**.
3. In the **Compile Entity Resources** dialog, choose a format under **Compile as**, then **Compile (n)**.

The dialog lists that same set of resources in resource-tree order, and you can't add or remove any. Only documents go into the file. An image in the set is listed and marked **excluded — not a text resource**.

## Good to know

- In the **Compile Project** dialog, a ticked image counts towards "resource(s) selected" and **Compile (n)**, but its content is not in the file. Only documents are compiled.
