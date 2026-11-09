---
title: Inbox and Capture
order: 55
summary: Save a quick note to a project's Inbox from anywhere in GetWrite, without opening the project, and file it later.
---

# Inbox and Capture

Capture saves a thought, a quote or a link as a note in a project's Inbox. You don't have to open the project first. Later you file the note where it belongs.

## Coming in the next release

### Capture a note

1. Press **Cmd+Shift+K** on a Mac or **Ctrl+Shift+K** on Windows or Linux. Or press **Cmd+K** or **Ctrl+K** and choose **Capture...**, the first row in the list.
2. In the **Capture** window, check the **Project**. It starts as the project you have open. With no project open, it starts as the project you last captured into. If that project is gone, it starts as the project you opened most recently, and otherwise as the first project in the list.
3. Type your note in **Text to capture**.
4. Press **Enter**. Press **Shift+Enter** to start a new line instead.

The window closes and a message says "Captured to" followed by the project's name. You are back where you were. Press **Esc** or choose **Close** to close the window without saving.

You can capture from the Start Page, with no project open. A project that is locked appears as **Locked project** with the date it was encrypted.

The first non-empty line of your note, up to 80 characters, becomes the note's name. A note can hold up to 50,000 characters.

If something goes wrong, the window stays open, your text stays in the box, and a message says that nothing was captured, or what was captured and what wasn't.

### The Inbox

The Inbox is a folder at the top level of the project. GetWrite creates it the first time you capture into the project. The folder is named **Inbox**, and you can rename it or move it. GetWrite still treats it as the Inbox.

When the Inbox has notes in it, the number of notes appears beside it in the [Resource Tree](../organize/resource-tree.md). Notes in folders inside the Inbox count too. The number disappears when the Inbox is empty.

Select a captured note to see a **Captured** block in the sidebar with the time you captured it. You can't edit it.

### File a note

Move a note out of the Inbox in any of these ways:

- Drag it to another folder in the Resource Tree.
- Open the note's options menu, or right-click it, and choose **File to…**.
- Open the note's options menu and choose **Move to…**.

If the move can't be saved, a message says so and the note stays where it was.

### What the Inbox leaves out

- **Compile.** A new note is unticked in the **Compile Project** dialog, as a saved project default. Tick it to include it in one compile. See [Compiling Projects](../protect-and-finish/compiling.md).
- **Export.** The **Export** dialog includes Inbox notes like any other document.
- **Word goals.** Notes in the Inbox don't count toward the whole-project goal or the daily goal, unless your goal filter selects them. The words you type into Capture are still recorded in the [Daily Writing Log](writing-log.md).

### When filing a note changes your numbers

- **Word goals.** Once a note leaves the Inbox, all its words count toward your goals from then on, including the words you captured earlier. Today's goal figure can jump when you file a note you captured today.
- **Compile default.** Filing a note out of the Inbox also removes it from the saved compile default. This includes a note you had deliberately left out yourself, so it is ticked in the **Compile Project** dialog afterward. If GetWrite can't remove it, the move still happens and a message titled "Compile default not cleared" says so.

### Good to know

- The shortcut works in Google Chrome on a Mac and in the browser built into VS Code on a Mac. It isn't checked in Safari, Firefox, the GetWrite desktop app, or on Windows or Linux. If it does nothing for you, use **Cmd+K** or **Ctrl+K** and choose **Capture...**.
- If you capture into a locked project, GetWrite asks you to unlock it. Your text is held only while that prompt is open. If you don't unlock, or unlocking isn't allowed from the device you're using, nothing is saved. If you close GetWrite before unlocking, the text is lost.
- If the project's Inbox is in Trash, GetWrite asks you to choose **Restore it** or **Make a new one**. **Cancel** keeps your text and saves nothing. A restored Inbox can come back at the top level or under a changed name, and a message tells you when it does.
- If the saved compile default already holds 5000 resources, or can't be read, GetWrite still captures the note but can't leave it out of compile. The window says so. Untick the note in the **Compile Project** dialog.
- If GetWrite can't update the writing log, the note is still captured, and the window says today's word figures may be low.
- Two captures made at the same moment into a project with no Inbox end up in one Inbox when they happen in the same running copy of GetWrite. This isn't guaranteed if two separate copies of GetWrite use the same project folder at the same time.
