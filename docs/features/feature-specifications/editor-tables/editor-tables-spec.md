# Editor Tables — Feature Spec

## Overview

Writers and technical authors frequently need to present structured data (character sheets, comparison grids, stat blocks, glossaries) inline with their prose. GetWrite currently has no way to insert or edit tables in the TipTap editor, forcing users to work around this with code blocks or external tools. This feature adds first-class table support via TipTap's `@tiptap/extension-table` package, including toolbar controls for insertion and structural edits.

## Goals

- Writers can insert a table anywhere in the editor body.
- Writers can add/remove rows and columns from an existing table.
- Writers can merge and split cells.
- Tables persist correctly in both the HTML and TipTap JSON serialization formats.
- Tables render readably in the editor at the configured editor line-height/font.

## Non-goals

- Column resizing via drag handles (resizable columns add ProseMirror complexity; deferred).
- Table captions or accessible `<caption>` elements.
- Table import from CSV.
- Custom table styles beyond what brand CSS tokens already provide.

## User stories

- As a novelist, I want to insert a table so that I can track character traits side-by-side.
- As a technical writer, I want to add and remove rows/columns so that I can adjust a table after I've started filling it in.
- As an editor, I want to merge adjacent cells so that I can create spanning header rows.

## Functional requirements

1. The extension **must** register `@tiptap/extension-table` (TableKit: `Table`, `TableRow`, `TableCell`, `TableHeader`) in `TipTapEditor`'s `extensions` array.
2. `insertTable()` **must** default to a 3×3 table with a header row.
3. The toolbar **must** include an "Insert Table" button that calls `insertTable()`.
4. When the cursor is inside a table, the toolbar **must** expose a context-sensitive table group inline in the main menubar with at minimum: Add Row After, Add Row Before, Delete Row, Add Column After, Add Column Before, Delete Column, Delete Table.
5. The table group **must** be hidden (not rendered) when the cursor is outside a table.
6. `mergeCells()` and `splitCell()` (or `mergeOrSplit()`) **must** be accessible via the table toolbar group.
7. `Tab` / `Shift+Tab` **must** navigate between cells (built-in TipTap behavior — must not be overridden).
8. Tables **must** serialize to and deserialize from TipTap JSON correctly so that content is preserved on save/reload.
9. Table markup **must** be included in word-count calculations (existing `tiptap-text.ts` utility).
10. Table styling **must** use brand CSS tokens (`surface`, `mid`, `black`/`white`) with adequate cell padding for the 1.8+ line-height requirement.
11. Pasting HTML containing a `<table>` element (e.g. from a website or Google Docs) **must** produce a properly structured TipTap table node, preserving cell content and header rows where detectable.

## Open questions

None identified.

## Out of scope (deferred)

- Resizable columns via drag handle (`resizable: true` on the Table extension).
- Accessible `<caption>` element or ARIA table roles beyond browser defaults.
- Paste from Excel or other spreadsheet formats (non-HTML clipboard data).
- Read-only / locked table cells.
