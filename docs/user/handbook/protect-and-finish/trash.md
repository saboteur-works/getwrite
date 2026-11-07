---
title: Trash
order: 190
summary: Deleted resources, folders and removed attachments go to a project Trash tab, where they can be restored or permanently deleted.
---

# Trash

When you delete a resource or a folder, GetWrite moves it to the project's Trash. It keeps its content, its details and its revision history, so you can bring it back. Trash works in the browser and in the desktop app.

## Delete a resource or folder

Choose **Delete** in the item's options menu, then confirm. Deleting a folder moves everything in it to Trash too, including the folders inside it.

## Find what's in Trash

Open the **Trash** tab, next to **Edit**, **Organizer**, **Data** and the other views. It lists everything you have deleted from the project. A deleted folder is one entry, with the resources and folders that were inside it listed under it. A deleted Source is one entry, and its attachments go with it.

An attachment you removed from a Source, or replaced with another file, is its own entry, named **Attachment of** and the Source's name, with the file's name beside it.

## Restore items

1. In the **Trash** tab, tick one or more items.
2. Choose **Restore selected**, then confirm.

A restored item goes back where it was. A deleted folder comes back with everything that was inside it.

- If the item's folder no longer exists, it goes back to the top level of the project, and a notice tells you.
- If something with the same name is already there, the restored item gets "(restored)" added to its name, and a notice tells you.

## Restore an attachment

An attachment entry restores like any other item: tick it, choose **Restore selected**, then confirm. The file goes back to the end of its Source's attachment list, with the same contents it had.

- If the Source already has an attachment with the same name, the restored one gets "(restored)" added to its name.
- If the Source is itself in Trash or has been permanently deleted, the attachment can't be restored. A message says "This attachment cannot be restored because its Source is in Trash or has been deleted. Restore the Source first." The entry stays in Trash.
- If the Source already holds 500 attachments, the restore is refused and the entry stays in Trash.

## Delete items permanently

- To delete chosen items, tick them and choose **Delete selected permanently**.
- To delete everything in Trash, choose **Empty trash**.

Both ask you to confirm. Permanent deletion can't be undone.

## How references to a deleted resource work

A **Ref** or **Point of View** field in another document can point at the resource you delete. While the resource is in Trash, that field is no longer linked to it, but it still shows the resource's name. When you restore the resource, the field links to it again.

If you pointed the field at something else while the resource was in Trash, GetWrite leaves your choice alone. A notice says that the reference could not be restored automatically.

## Good to know

- The notice about a reference that could not be restored names the document by an id, not by its title. Check the **Ref** and **Point of View** fields of the documents that pointed at the restored resource.
