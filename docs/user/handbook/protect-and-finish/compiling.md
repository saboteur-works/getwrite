---
title: Compiling Projects
order: 210
summary: Compile a project, or just the documents tied to one entity, into a single txt, md, pdf or docx file.
---

# Compiling Projects

Writing a project means working across many separate documents. **Compiling** brings them back together — pulling the text documents you choose into a single file in the format you pick.

You can compile a project three ways:

- From the [Start Page](../organize/start-page.md), without opening the project: open the project's **Manage** menu and choose **Package**.
- From within the project itself: open the project menu and choose **Compile Project**.
- From an entity's own view, compiling just the documents associated with that entity (see below).

Both project dialogs are titled **Compile Project**. They list the project's resources as a tree, with **Select All** and **Select None**, and show how many resources are selected. A **Compile as** list offers four formats: **txt**, **md**, **pdf** and **docx**. **Compile (n)** produces the file. With the default settings in a test project:

- **txt** put each document's title on a line underlined with `=` characters, followed by its text.
- **md** put each title on a line starting with `# `, followed by the text.
- **pdf** produced a file that begins `%PDF-1.3`.
- **docx** produced a Word file holding each title and text.

The text documents are stitched together in the order of your [resource tree](../organize/resource-tree.md). In a test, a document inside a folder came out where that folder sits in the tree, and after Gamma Doc was dragged above Beta Doc in the tree and the project reloaded, both the dialog's list and the compiled file began with Gamma Doc. An image that was selected is counted in "n resource(s) selected" but its content was not in the output.

## Compiling an entity's resources

Open a document you've declared as an entity (a character, location, or the like, with Entities switched on in Project Settings — see [Metadata](../story/metadata.md)) and its sidebar's **Entity Mentions** section lists every resource linked to or mentioning it (in a test: two documents marked "Mentioned" and an image with a Ref field pointing at the entity, marked "Linked"). From there, **Compile this entity's resources** opens a **Compile Entity Resources** dialog that builds that same set — in resource-tree order — into a single output, with the same four format choices as a regular compile. The resource list in that dialog is fixed to what the entity is already associated with, with no checkboxes to pick from, and an image in the set is shown but marked "excluded — not a text resource"; in the test, **Compile (3)** produced a txt file holding the two text documents.

In the web build, each compile downloaded one file named after the project (for example `cmp-one.txt`), and the project's folder held the same files with the same contents before and after compiling in the project dialog and in the entity dialog.

## Warnings and limits

- In the run this page was verified from, the **Package** dialog opened from the Start Page listed one of two resources in a test project; the resource at the project's root was missing from the list and from the compiled file. The **Compile Project** dialog opened from inside the same project listed both. A later change (unreleased) makes the Start Page dialog list and compile resources held by no folder; this change was re-checked on the web app with the same steps and the observation no longer occurred; the desktop app was not re-checked.
- The count in "n resource(s) selected" and in **Compile (n)** includes a selected image, although its content is not in the output; the project dialogs showed no mark on the image.
- In the desktop app run unpackaged (Electron dev run), choosing **Compile** closed the dialog and the compile request returned 200, but no download was seen; what happened to the file was not established. This was not tried in a packaged build. A later check (no product change) found that the script used for that run had a download hook that failed with "require is not defined"; with a corrected hook, choosing **Compile** (txt, two documents) produced a download event and a 46-byte file holding both documents, in the unpackaged desktop app and in an unpacked arm64 build. Whether the original run failed for that reason was not repeated, so it is not established. Other formats, larger compiles, a Finder launch and a .dmg build were not tried.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit a07e14cc.
