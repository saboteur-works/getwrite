---
title: Merge Documents
order: 59
summary: Add the text of other documents to the end of the first document you select, choose what travels with it, and undo the latest merge.
---

# Merge documents

**Merge** adds the text of two or more other documents to the end of the first document you select. The first document you select is the one that keeps its name and takes the others' text. The other documents stay in your project, in the same place, and each shows that it was merged. A saved copy of every document is kept first, so nothing is lost.

Merge is for the desktop app and GetWrite on the web. It is not offered on Android.

## Merge documents

1. In the Resource Tree, select two or more text documents. Click the one that should take the others' text first, then **Cmd+click** or **Ctrl+click** the others, or hold **Shift** and click to select a range. The first document you click is the one that receives the text.
2. Right-click one of the selected documents and choose **Merge**. If you right-click a document that is not part of the selection, Merge is not offered.
3. In the **Merge** window, choose what travels with the text (see below), and choose **Merge**.

Merge is only in the Resource Tree's menu. It is not in the command palette or the editor's menu, and it has no keyboard shortcut. You can select documents from different folders.

After a merge:

- The first document keeps its own text unchanged, followed by the text of each other document. The other documents' text follows in the order the Resource Tree shows them, whatever order you selected them in.
- Between two texts there is exactly one empty paragraph. GetWrite adds no title and no separator. A document with no text adds nothing.
- The other documents are not moved, renamed or changed in folder. Each one keeps its own text.
- Each document, the first one and each of the others, gets a protected revision named "Before merge" with the date, holding its whole text as it was before the merge. Every revision a document had is still there. See [Revisions](../protect-and-finish/revisions.md).
- The merge adds nothing to the [Daily Writing Log](writing-log.md): the text that moved is not logged as words added or words deleted.
- If one of the merged documents is open in the editor, the editor shows the stored text after the merge.

While the window is open, GetWrite sends any text it was still waiting to save before it asks the server about the documents. If a document changed after the window opened, GetWrite tells you and does nothing; open the window again and retry.

### The Merge window

The window shows the first document by name and the documents added to it in order, with each document's folder and word count. It asks what travels, every time. It opens with the same starting choices whatever you chose last, and it remembers nothing between merges.

- **Notes, citations and claims** in the other documents are listed by document and kind, one tick box each, whether or not the module they belong to is switched on. They start ticked. A ticked one moves to the first document with its passage, keeping its text, its saved passage, its link to a Source and, for a claim, its status and date. An unticked one stays with the document it was in, and its highlight is removed from the text that is added.
- **Details** such as status, point of view and each custom field are listed only where one of the other documents holds a value. They start unticked. For each detail you choose one document to copy it from, or none. Lists of values are combined with the first document's. A detail you do not copy is left as it was on the first document.
- The first document's name, subtype, word-count goal, compile setting, folder and position are never changed.
- The window states what happens to each other document after the merge (see "After a merge: what applies to the other documents" below).
- A warning is shown when the first document is left out of compile or is in the Inbox while a document being added is not, because the added text will then be left out of compile or of your goals. You can still merge.
- A merge takes at most 25 documents. If a selection is bigger, the window says so.

**Cancel** or **Esc** closes the window and changes nothing.

### When Merge is refused

GetWrite refuses a merge and tells you why. A refusal changes nothing: no revision, note, setting or index is written.

- Fewer than two documents are selected, or the same document appears twice.
- A folder is in the selection. Folders cannot be merged; select only documents.
- A document is an image, audio, a Source, or a document set up as an entity.
- A document was already merged into another document. The first document you selected cannot be one, and neither can any other document in the selection.
- A document can no longer be found, or is in the Trash.
- A document changed after the window opened.
- Moving the chosen notes would give the first document more notes than a document can hold. The message names the numbers.
- More documents are selected than a merge takes.
- The project is locked. GetWrite offers the unlock prompt and tries the merge once more after you unlock. If you decline, GetWrite tells you the project is locked and nothing is changed.

In the tree's menu, Merge stays visible but disabled when the selection cannot be merged, with the reason shown.

### If something fails

If a step fails, GetWrite puts everything back as it was before the merge and tells you which step failed and which state remains. If a step cannot be put back, the message names it. A failed merge is never reported as a success.

If the merge was saved but search and link data could not all be brought up to date, GetWrite says so and names what was not updated. The merge stays in place. The `reindex` command repairs the search index, the notes search index, links and name mentions. Prose diagnostics refresh the next time you save the document.

## After a merge: what applies to the other documents

Each document that was added to another shows **Merged into** and the name of the first document in the Resource Tree, as text. When it is open, a line at the top of the editor says what applies, and you can still edit it. The rules below apply for as long as the mark is on the document. There is no way to remove the mark except Undo merge, or deleting the document.

- **Compile.** It is left out of every compile, in every format, in the Compile dialog and in the Compile Entity Resources dialog, and the dialog says so when a document being compiled is one of them. There is no way to include it for one run, and nothing is saved to your compile defaults.
- **Export.** It is still included in export.
- **Search.** It is still found by search, including by the text of its notes.
- **Goals.** It no longer counts toward the project word-count goal or the goal filter. For the daily goal, words written before the merge still count, so a merge does not change today's figure. Words you type into the first document after the merge count as usual. The document's own word-count goal is unchanged.
- **Word counts.** Its words are left out of the project word totals (the Data view totals and the "By status" figures). Its own word count is unchanged.

If the first document is later moved to the Trash or removed, the mark on the other documents says so, and the rules above still apply.

## Undo merge

**Undo merge** undoes the latest merge in the project. It is offered while the latest thing you did with Split or Merge is a merge, and it works after you close and reopen the project.

1. Press **Cmd+K** or **Ctrl+K** and choose **Undo merge**, or right-click in the editor and choose **Undo merge**. It is offered whichever document is open. The entry names the first document and the number of other documents.
2. GetWrite sends any text it was still waiting to save, then undoes the merge.

Undo merge:

- Puts the first document's text back as it was before the merge, and puts each other document's text back where it differs.
- Removes the merged mark from the other documents. They stay in the Resource Tree.
- Saves the text each document has at that moment as its own protected revision, named "Before undo merge" with the date, **before** it puts the old text back. Edits you made since the merge are kept there, in the revisions of the document you made them in.
- Moves the notes, citations and claims that were moved to the first document back to the document they came from. A note you did not move stays where it is.
- Clears the record of the merge, so Undo merge runs once. A later merge or split replaces it.
- Adds nothing to the Daily Writing Log.
- Leaves alone any merged document that is now in the Trash or has been permanently removed. It never removes a document.

An open document that Undo changed shows its stored text afterwards.

Undo merge is refused, and changes nothing, when the first document is in the Trash or has been permanently removed, or when a saved copy from before the merge is no longer kept. If a step fails, GetWrite puts the documents back as they were before the Undo started and tells you the state that remains. The result of an Undo appears as a message at the bottom right of the screen that you can dismiss; a failure stays until you dismiss it.

## Not available

- Unmerge of an older merge: only the latest merge can be undone.
- Merging a Source, an entity document, a folder, an image or audio.
- Merge on Android.
