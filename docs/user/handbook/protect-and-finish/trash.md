---
title: Trash
order: 190
summary: Deleted resources and folders go to a project Trash tab, where they can be restored or permanently deleted.
---

# Deleting and recovering resources (Trash)

When you delete a resource or a folder, it isn't erased immediately. GetWrite moves it to a **Trash** area inside the project folder (a hidden `.trash` folder), keeping its content, metadata, and revision history. Deleting a folder moves its entire contents — every resource and sub-folder inside it — to Trash together.

The **Trash** tab (alongside Edit, Organizer, Data, Diff, Timeline, Entities, and Graph) lists everything currently trashed in the project. A trashed folder is one entry, with the resources and folders that were inside it listed beneath it. Tick the checkboxes of one item or several, then choose **Restore selected** or **Delete selected permanently**; each asks you to confirm. **Empty trash** deletes everything in Trash at once, after a confirmation.

In a web run, a folder Parent holding a folder Child, which held a folder Grandchild with a document in it, was deleted from Parent's row menu. The Trash tab then showed one entry, "Parent", listing "folder: Child", "folder: Grandchild" and "resource: Leaf doc". Selecting it and choosing **Restore selected** returned all of it: the tree showed Parent, Child, Grandchild and Leaf doc again, each folder under the same parent as before. This is the only nesting depth tried in the app (three folders deep), and it is not in a release yet (merged after 2.2.0).

Restoring an item puts it back where it was: in a run, a document deleted from between two others came back between them. If its original folder no longer exists, it's restored to the project root instead, and a notice says so. A name collision with something already there is resolved by appending "(restored)" to the name — a restored "Dup" came back as "Dup (restored)" with a notice.

A custom reference field (field type **Ref**) in another resource that pointed at a since-deleted resource is cleared of its link when the resource is deleted, and re-linked automatically when the resource is restored, where possible. A field you pointed somewhere else in the meantime is left alone, and a notice says that its reference could not be restored automatically.

Permanently deleting an item from Trash cannot be undone: the confirmation says so, and afterwards the item was gone from the Trash list, from the resource tree and from the `.trash` folder.

Trash is available on web and desktop.

## Warnings and limits

- Permanent deletion cannot be undone ("Permanently delete 1 item? This cannot be undone.").
- The confirmation for deleting a single resource reads "This will remove the resource. Proceed?" and does not mention Trash; the one for a folder reads "This will move the folder and everything in it to Trash. Proceed?".
- In the run this page was verified from, deleting a resource did not change the built-in **Point of View** field of another resource that pointed at it (the field kept its link and its name, before and after the restore); a custom **Ref** field was cleared and re-linked as described above. A later change (unreleased) makes delete clear the built-in Point of View reference in a project whose metadata fields were never edited; this change was re-checked on the web app with the same steps and the observation no longer occurred; the desktop app was not re-checked.
- In a test of the earlier code (not the app), deleting a folder with a child and a grandchild folder failed with a "no such file or directory" error and left part of the folder in Trash. That is not what the web run above showed after the change. Restoring a folder's contents on their own, name conflicts on restoring a nested folder, Trash with more than one entry, and encrypted projects were not tried in that run.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit 3a3ea9f7.
