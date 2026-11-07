---
title: Compiling Projects
order: 210
summary: Compile a project, or only the documents tied to one entity, into a single txt, md, pdf or docx file, export documents, and save which resources a dialog leaves out.
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

## Save a project default

If you usually leave the same resources out of a compile, you can save that choice for the project. Each project has one saved default for the **Compile Project** dialog and one for the **Export** dialog. They are separate: saving one does not change the other.

- **Open the dialog.** The resources you saved as left out start unticked. The dialog says how many resources the project default leaves out and lists them by name.
- **Override it for one run.** Tick a left-out resource in the list to include it this time. Nothing is saved, and the next time you open the dialog it is left out again.
- **Save as default.** Untick the resources you want left out, then choose **Save as default**. The dialog confirms with "Saved." and the unticked resources are now the project's default.
- **Clear default.** Choose **Clear default** and confirm. Every resource is selected the next time you open the dialog. Nothing is deleted from your project.

A saved default only records which resources are left out. A resource you add to the project later is selected as usual. A resource that has since been deleted drops out of the default without a message.

If GetWrite can't read the saved default when the dialog opens, the dialog says so, selects every resource and offers **Retry**. You can still compile or export, and **Save as default** stays off until the read works. If a save fails, the dialog shows the reason and the default stays as it was.

The **Compile Entity Resources** dialog has no saved default.

### From the Start Page

Choosing **Package** on the [Start Page](../organize/start-page.md) applies the project's saved compile default for a normal project, and the dialog has the same **Save as default** and **Clear default** controls. A project that is encrypted, locked or can't be opened (the **Cannot be opened** card) has no saved default there: its Start Page dialog selects every resource and shows no **Save as default** control. Open the project and compile from inside it to use a saved default.

## Export a document or folder

To export, open a document's or folder's menu in the [resource tree](../organize/resource-tree.md) and choose **Export**. The **Export** dialog lists the resources to export, with a tick box for each, and a **Format** choice of plain text (.txt) or Markdown (.md). It has the same **Save as default**, **Clear default** and override controls as the compile dialog, with its own saved default.

## Good to know

- In the **Compile Project** dialog, a ticked image counts towards "resource(s) selected" and **Compile (n)**, but its content is not in the file. Only documents are compiled.
- [Annotations](../write/annotations.md) are not part of a compiled or exported file, in any format.
- On Android, PDF compile works without a network connection and uses the same IBM Plex fonts.
