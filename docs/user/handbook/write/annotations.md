---
title: Annotations
order: 65
summary: Attach private notes to passages of a document, edit or delete them, re-attach detached ones, and find them in search.
---

# Annotations

An **annotation** is a note attached to a passage of a document. The passage is highlighted in the text, and the note is kept alongside it. Annotations are for you: they are never part of the document's text, and they are left out when you [compile or export](../protect-and-finish/compiling.md).

Annotations work on documents. Images and audio can't have them.

## Add a note

1. In the editor, select the passage the note is about.
2. Choose **Add note** in the editor toolbar.
3. Type the note under **Note text** and choose **Save note**.

A note holds 1 to 5000 characters, and the passage it is attached to can be at most 500 characters. A document can have up to 500 notes. GetWrite refuses anything over these limits and tells you; it never cuts a note short.

## See and change your notes

Choose **Annotations** in the editor toolbar to open the panel below the text. It lists each note with the passage it is on.

- **Show in text** selects the passage and scrolls it into view. A note whose passage holds the cursor is marked **At cursor**.
- **Edit** changes the note's text. The passage stays the same.
- **Delete** asks you to confirm, then removes the note and its highlight. The text itself is not changed.

If the notes can't be read, the panel says so and offers **Try again**. That is a failure, not an empty list.

## Detached notes

A note is **detached** when its passage is no longer in the document, for example because you deleted the text. Detached notes are not lost. They are listed under **Detached** with the passage as it was ("Saved quote") and are kept until you delete them.

To attach a detached note to new text, select the passage in the document and choose **Re-attach** on the note. The note keeps its text; only the passage changes.

Choosing an older [revision](../protect-and-finish/revisions.md) as the current one removes highlights whose note no longer exists. It never deletes a note: a note whose highlight is gone is listed as detached.

## Copy, cut and paste

- **Copy and paste** annotated text, in the same document or another, and the pasted text gets its own copy of the note. Editing or deleting one does not change the other.
- **Cut and paste in the same document** moves the passage and keeps its note.
- **Cut and paste into another document** gives the new document a copy of the note. The note also stays in the first document, where it is listed as detached.
- Cutting only part of an annotated passage counts as a copy.
- Text pasted from outside GetWrite, or from a copy that is no longer the last thing you copied, is pasted as plain text without the note.

If a note can't be copied, the text is pasted without the highlight and a message says why.

When you copy or duplicate a whole document, its notes are copied too. A template made from a document does not carry its notes. A document in the Trash keeps its notes and they come back with it.

## Search

Search finds text inside notes. See [Search](search.md).

## Good to know

- In an encrypted project, notes are stored encrypted. When the project is locked, they can't be read or changed.
- Annotations are not in compiled or exported files.
