---
title: Split at the Cursor
order: 58
summary: Split a text document in two at the cursor, choose what travels with the text that moves, and undo the latest split.
---

# Split at the cursor

**Split** cuts an open text document in two at your cursor. The text before the cursor stays in the document you are in. The text after the cursor becomes a new document placed directly after it. A saved copy of the whole document is kept first, so nothing is lost.

Split is for the desktop app and GetWrite on the web. It is not offered on Android.

## Coming in the next release

### Split a document

1. Open a text document in the editor and place the cursor where the new document should start.
2. Choose **Split** from the editor's context menu, or press **Cmd+K** or **Ctrl+K** and choose **Split at cursor**.
3. In the **Split document** window, choose what travels with the text that moves (see below), check the name, and choose **Split**.

You can also use the shortcut **Cmd+Shift+Enter** on a Mac or **Ctrl+Shift+Enter** on Windows or Linux. If the shortcut does nothing, use the context menu or the command palette instead. The shortcut does nothing while a window is open or while you are typing in a text box outside the editor.

Split is not in the Resource Tree's menu, because a row in the tree has no cursor.

After a split:

- The document you were in keeps its name and the text before the cursor. It stays open, with the cursor at the end.
- The new document is in the same folder, directly after the original. It is named after the original with "(part 2)" added, unless you typed another name. It starts with one revision, v1, and none of the original's other revisions are copied to it.
- A protected revision of the original, named "Before split" with the date, holds the whole document as it was before the split. See [Revisions](../protect-and-finish/revisions.md).
- The split adds nothing to the [Daily Writing Log](writing-log.md): the text that moved is not logged as words added or words deleted.

While the window is open, the editor is read-only, and GetWrite sends any text it was still waiting to save before it asks the server about the cursor. If the document changed since you placed the cursor, GetWrite tells you and does nothing; place the cursor again and retry.

### The Split document window

The window shows how many words each part holds. It then asks what travels, every time. It opens with the same starting choices whatever you chose last, and it remembers nothing between splits.

- **Notes, citations and claims** that sit wholly in the text that moves are listed by kind, one tick box each. They start ticked. A ticked one moves to the new document with its text, its saved passage, its link to a Source and, for a claim, its status and date. An unticked one stays with the original, where it shows as detached because its passage has moved.
- A note, citation or claim whose passage **crosses the cursor** is listed as staying with the original. It is never copied or lost. Its highlight covers only the part of the passage that stays, and its saved passage is not changed. See [Annotations](annotations.md).
- **Details** such as status, point of view and each custom field are listed with whether the original holds a value. They start unticked. Only the ones you tick are copied. A detail you do not copy is left empty on the new document, and the original's details are not changed.
- The new document always takes the original's subtype. If the original is among the documents your saved compile defaults leave out, the new document is left out too. If that list is full or cannot be read, the split still goes ahead and a message says the new document was not added to it. See [Compiling Projects](../protect-and-finish/compiling.md).
- An entity setting and aliases are never copied. A word-count goal is copied only if you tick it among the details.
- **Name** is the new document's name. It can't be left empty.

**Cancel** or **Esc** closes the window and changes nothing.

### When Split is refused

GetWrite refuses a split and tells you why. A refusal changes nothing: no revision, note, setting or index is written.

- The document is an image, audio, a Source, a folder, a document set up as an entity, or a document marked as merged. In the context menu and the command palette, Split stays visible but disabled, with the reason shown.
- The cursor is inside a table cell or a code block. Move it out and try again.
- There is no text before the cursor, or none after it. A part that holds only spaces or empty paragraphs counts as empty.
- The document changed after you placed the cursor.
- The project is locked. In the desktop app, GetWrite offers the unlock prompt and tries the split once more after you unlock. If you decline, GetWrite tells you the project is locked and nothing is changed. Locking is not offered on the hosted web version.

A cursor inside the text of a paragraph, heading, quote or list item is fine. GetWrite splits that block in two.

### If something fails

A split is one operation. If a step fails, GetWrite undoes the earlier steps and tells you what failed and what state your document is in. If every earlier step could be undone, the message says your document is as it was before. If one could not, the message says what remains: for example that a saved copy of the document was kept in its revisions, or that a new document may have been left behind for you to check. Read the message before you carry on.

If the split itself is saved but searching, links or mentions could not be brought up to date, the message says so, and says the split was saved. Running `getwrite-cli reindex` repairs search, note search, links and mentions. It does not rebuild a document's prose diagnostics. Those refresh the next time you save that document.

### Undo split

You can undo the latest split in the project, including after you close and reopen it.

1. Press **Cmd+K** or **Ctrl+K** and choose **Undo split**, or choose **Undo split** from the editor's context menu.

**Undo split** is offered in any open document, and with none open in the palette, for as long as the latest thing done to the project is a split. It names the new document and says that it goes to Trash and that edits made since are kept. It is checked each time you open the palette or the menu.

Undo does this:

- It saves the current text of the document that was split, and of the new document, each as its own protected revision. Edits you made after the split are in those revisions.
- It puts the original's text back to what it was before the split.
- It moves the notes, citations and claims that travelled back to the original.
- It sends the new document to Trash. It never deletes it permanently. If the new document is already in Trash, that step does nothing.
- It takes the new document off the compile-defaults list if the split had put it there.
- It adds nothing to the Daily Writing Log.

Undo runs once. Only the latest split can be undone, and a later split replaces it.

Things to know:

- The protected "Before split" revision stays in the original's revisions after Undo, and stays protected.
- Notes you added to the original after the split stay on it. Notes you added to the new document are in Trash with it.
- If the document that was split is in Trash or permanently deleted, or the saved copy of it is no longer kept, or the new document has itself been split since, Undo is refused and says which. Nothing is changed.
- If GetWrite cannot check these, it says so and changes nothing. That does not mean there is nothing to undo.
- If the project is locked, Undo says so. It does not offer to unlock.
- If a step of Undo fails, GetWrite puts back what it already did and says what state remains.

The wording of the messages in this feature is a draft and may change before release.
