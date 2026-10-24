---
title: Rich Text Editor
order: 50
summary: The text editor you write in, with toolbar formatting, keyboard shortcuts and a live word count in the footer.
---

# Rich Text Editor

When you open a text document, GetWrite gives you a rich-text editor.

## Formatting

Select text and use the toolbar to apply bold, italic, underline, strikethrough or inline code.

On macOS, **Cmd+B**, **Cmd+I** and **Cmd+U** apply bold, italic and underline to the selected text.

## Word count

A live word count appears in the footer as you type. For example, `Words: 8` after typing eight words.

## Saving

Your text is saved automatically about 2.5 seconds after you stop typing. If you open another document, close the project or reload the page before then, the waiting save is sent straight away to the document you typed in. If that save fails after you have moved on, a message says your last edits to the previous document were not saved; open it again to check.

## Warnings and limits

- In Markdown source mode (**Edit as Markdown**), edits made just before opening another document are saved to the document you typed them in (unreleased). Before this change the last half-second of typing was lost; checked in the web app with text typed 100 ms before a switch.
- Closing the desktop app's window within 2.5 seconds of typing was not tested; reloading the web app within that time was (the text was saved).

- **Ctrl+B**, **Ctrl+I** and **Ctrl+U** applied no formatting on macOS (two runs each). Windows and Linux were not run.
- The footer showed a word count only. No character count or paragraph count appeared in the footer or elsewhere in the window.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit 0343e19a.
