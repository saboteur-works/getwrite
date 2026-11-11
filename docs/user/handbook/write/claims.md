---
title: Claims
order: 66
summary: Mark a statement in your text as a claim, record whether you have checked it, tie it to a Source, and review every claim in the project.
---

# Claims

A **claim** is a statement in your text that you want to back up with evidence. You mark the passage, write the claim in your own words, say whether you have checked it, and tie it to a [Source](../protect-and-finish/resources.md#sources-and-attachments). The **Claims** tab then lists every claim in the project, so you can find the ones that are unsourced or unchecked before you publish.

Claims are for you. They are never part of the document's text, and they are left out when you [compile or export](../protect-and-finish/compiling.md).

## Coming in the next release

### Turn Claims on

Claims are off until you switch them on for a project.

1. Open **Project Settings** and choose the **Modules** tab.
2. Select **Enable Claims**.

The **Claims** tab appears beside **Sources**, and the claim controls appear in the editor. Clear **Enable Claims** to hide them again. Your claims stay stored, and they show again when you switch Claims back on.

A [project type](../organize/project-types.md#start-new-projects-with-modules-on) can start new projects with Claims already on. A project that already exists is never changed by its project type.

### Mark a claim

1. Open a document in the editor and select the passage.
2. Below the text, find **Mark a claim**. Type the claim in **Claim statement**.
3. Choose **Mark as claim**. A message says **Marked as a claim.**

The passage is highlighted, as for any [annotation](annotations.md). A new claim starts as **Unverified**.

A claim statement holds 1 to 5000 characters, and the passage can be at most 500 characters. A document can hold up to 500 notes and claims together. GetWrite refuses anything over these limits and tells you; it never cuts a statement short.

You can mark claims in documents only. Images, audio and Sources can't have them. The control is hidden when the editor is read-only. You don't need Sources switched on to mark a claim.

If you choose **Mark as claim** with no passage selected, the control tells you to select one.

### Set the status

Each claim has one of four statuses:

- **Unverified**
- **Verified**
- **Disputed**
- **Needs review**

Choose **Annotations** in the editor toolbar to open the panel. Each claim shows a **Claim** label, the passage, its status and the date the status last changed ("Status changed" and a date). Change the status in the **Status** list. The date changes only when the status changes. Editing the statement or the Source does not change it.

GetWrite keeps only the date of the last change, not earlier statuses.

If a claim carries a status that is not one of the four, the panel shows it as it was stored, marked "not a listed status", and does not change it.

### Link a Source

1. In the panel, choose **Link Source** on the claim. If it already has a Source, the button reads **Change Source**.
2. Choose a Source in the **Source** list.
3. Choose **Save Source**.

Choose **No Source** and **Save Source** to remove the link. A claim has at most one Source. **Link Source** appears only while Sources is switched on.

The panel shows the Source's name as it was when you linked it. Renaming the Source later does not change that name.

### Unsourced claims

A claim with no Source reads **Source: unsourced** in the panel and **Unsourced** in the **Claims** tab. A claim is unsourced only because it has no link. GetWrite never marks a claim as verified because it has no Source. A claim can be both **Verified** and unsourced, and both facts are shown.

If a claim's Source is in Trash, the panel reads "removed" beside its saved name, and the **Claims** tab reads "in Trash". If the Source was deleted for good, both read "permanently deleted". If GetWrite can't check the Source, the claim says "The Source could not be checked." and is not counted as sourced or unsourced. In each case the status stays as you set it. To point the claim at another Source, choose **Change Source**.

### Edit or delete a claim

- **Edit** in the panel changes the statement. A statement can't be empty.
- **Show in text** selects the passage.
- **Delete** asks you to confirm, then removes the claim and its highlight. The text is not changed.

Deleting the passage text does not delete the claim. See "Detached claims" below.

### Review claims in the Claims tab

Choose **Claims** to see every claim in the project. Each entry shows the statement, the passage, the document it is in, the status with its date, and the Source or **Unsourced**.

- **Status** limits the list to one status, or **All**.
- **Source** limits it to **Sourced** or **Unsourced**, or **All**.
- The two combine. A line starting "Showing:" says which filters are on.
- If no claim matches, a message says no claim matches the filters. If the project has none, it says "There are no claims."
- **Open** takes you to the document and selects the claim's passage.

The tab only lists and opens claims. To change a status, a Source or a statement, use the panel.

If GetWrite can't read some documents, the tab names them as "not read", still lists the claims it did read, and offers **Try again**. A failed read is never shown as "There are no claims." If the project is locked, the tab says so and asks you to unlock it. A claim in a document in Trash is not listed.

### Detached claims

A claim is **detached** when its passage is no longer in the document. It is not lost. The panel lists it with the passage as it was ("Saved quote"), and its status and Source stay as they were. To attach it to new text, select the passage and choose **Re-attach** on the claim.

**Open** on a detached claim opens the document but does not select a passage. Open **Annotations** to find the claim there.

### Copy, paste and search

- Copying and pasting annotated text, duplicating a document, restoring a revision and moving a document to Trash and back keep a claim's status, date and Source.
- Search finds the words of a claim's statement. The result reads "Note:", as for any note. Search does not look at a claim's status or Source.

### When Claims is off

With **Enable Claims** cleared, the **Claims** tab and the claim controls are hidden. Each claim is still in the panel as an ordinary note, with its statement as the note's text. You can edit that text. The status and date are not shown, and editing the text does not change them. Search still finds the statement.

With **Enable Sources** cleared, **Link Source** and **Change Source** are hidden. A claim's Source name still shows, and you can't change it until Sources is on again.

### Good to know

- Claims are stored in the document's annotations. An older version of GetWrite doesn't know about claims. When it pastes a claim or reads a document's annotations, it may drop the claim's status, date and Source link.
- A project type that sets modules can't be used by an older version of GetWrite.
- In an encrypted project, claims are stored encrypted. When the project is locked, they can't be read or changed.
- On Android, GetWrite can't encrypt what it saves. In a project marked as encrypted, it refuses to change claims and says nothing was saved.
- On a paired device, deleting a claim follows the same limit as deleting any note. If permanent deletion is turned off for paired devices, **Delete** is off and a reason appears beside it. Changing a status, a Source or a statement is not limited.
