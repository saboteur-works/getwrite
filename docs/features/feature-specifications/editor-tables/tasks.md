# Editor Tables — Implementation Tasks

### Task 1: Install `@tiptap/extension-table`

**What:** Add the `@tiptap/extension-table` package to the frontend workspace.
**Files:** `frontend/package.json`
**Done when:** `pnpm install` succeeds, package resolves without conflict, and `pnpm typecheck` passes with no new errors.
**Depends on:** none
**Estimate:** 1
**Done:** [x]

---

### Task 2: Register TableKit in the TipTap extension stack

**What:** Import and register `TableKit` (`Table`, `TableRow`, `TableCell`, `TableHeader`) in `TipTapEditor`'s shared `extensions` array, and include the table node types in `UniqueID`.
**Files:** `frontend/components/TipTapEditor.tsx`
**Done when:** The editor boots without console errors; `editor.can().insertTable()` returns `true`; pressing `Tab` inside a table cell advances to the next cell; pressing `Shift+Tab` moves back.
**Depends on:** Task 1
**Estimate:** 2
**Notes:** `UniqueID` currently targets `["paragraph", "heading", "blockquote", "codeBlock"]` — add `"table"` (and optionally `"tableCell"`) to avoid ID collisions across serialized documents.
**Done:** [x]

---

### Task 3: Add `isInsideTable` to `menuBarState`

**What:** Extend the `menuBarStateSelector` to expose an `isInsideTable` boolean that is `true` when the cursor is anywhere inside a table node.
**Files:** `frontend/components/Editor/MenuBar/menuBarState.tsx`
**Done when:** `state.isInsideTable` is `true` when the cursor is in a table cell and `false` everywhere else; `pnpm typecheck` passes.
**Depends on:** Task 2
**Estimate:** 1
**Notes:** Use `ctx.editor.isActive("table")`.
**Done:** [x]

---

### Task 4: Add table icons to the toolbar icon registry

**What:** Import the relevant Lucide icons and add them to `iconRegistry` and `EditorMenuIconName` for all table toolbar actions.
**Files:** `frontend/components/Editor/MenuBar/editor-toolbar-icons.ts`
**Done when:** Icon names for `insertTable`, `addRowAfter`, `addRowBefore`, `deleteRow`, `addColumnAfter`, `addColumnBefore`, `deleteColumn`, `mergeCells`, `splitCell`, and `deleteTable` are exported and typed; `pnpm typecheck` passes.
**Depends on:** none
**Estimate:** 1
**Notes:** Lucide candidates: `Table`, `TableRowsSplit`, `Columns`, `Trash2`, `Combine`, `Split` — verify names against the installed version before committing.
**Done:** [x]

---

### Task 5: Add "Insert Table" button to the toolbar

**What:** Add an always-visible "Insert Table" `ToolbarIconCommand` to `toolbarCommandSchema` that calls `insertTable({ rows: 3, cols: 3, withHeaderRow: true })`.
**Files:** `frontend/components/Editor/MenuBar/toolbar-command-schema.ts`
**Done when:** The Insert Table button is visible in the toolbar at all times; clicking it inserts a 3×3 table with a header row at the cursor position.
**Depends on:** Task 2, Task 4
**Estimate:** 2
**Notes:** Place in a new `"Tables"` group (groupId: `"table-insert-controls"`) so it sits beside the context-sensitive group from Task 6.
**Done:** [x]

---

### Task 6: Add context-sensitive table operations toolbar group

**What:** Add a `"Table Operations"` `ToolbarCommandGroup` to `toolbarCommandSchema` with all structural table commands, and filter it out of the resolved groups when `isInsideTable` is `false`.
**Files:** `frontend/components/Editor/MenuBar/toolbar-command-schema.ts`, `frontend/components/Editor/MenuBar/useToolbarCommand.ts`
**Done when:** The table operations group (Add Row Before, Add Row After, Delete Row, Add Column Before, Add Column After, Delete Column, Merge/Split Cell, Delete Table) appears in the toolbar only when the cursor is inside a table; all commands execute correctly; group is absent when cursor is outside a table.
**Depends on:** Task 2, Task 3, Task 4, Task 5
**Estimate:** 3
**Notes:** `useToolbarCommands` currently maps groups unconditionally — needs a `shouldRender?: (context: ToolbarCommandContext) => boolean` field added to `ToolbarCommandGroup`, with `useToolbarCommands` filtering groups where `shouldRender` returns `false`.
**Done:** [x]

---

### Task 7: Style tables with brand CSS tokens

**What:** Add CSS rules for `.tiptap table`, `th`, and `td` to `editor.css` using brand tokens (`surface`, `mid`, `black`/`white`) with cell padding that accommodates the 1.8+ line-height.
**Files:** `frontend/styles/editor.css`
**Done when:** Tables render with visible borders using brand tokens; `th` cells are visually distinct from `td`; cell padding is ≥ 8px vertical / 12px horizontal; styles apply correctly in both light and dark mode.
**Depends on:** Task 2
**Estimate:** 2
**Done:** [x]

---

### Task 8: Verify word-count includes table cell text

**What:** Add a unit test to confirm that `tiptapToPlainText` extracts text from within table cells.
**Files:** `frontend/tests/unit/tiptap-utils.test.ts`
**Done when:** A test passes that provides a TipTap JSON document containing a table with known cell text and asserts that `tiptapToPlainText` returns a string containing that text.
**Depends on:** Task 2
**Estimate:** 1
**Notes:** `extractTextFromNode` already recurses through `node.content`, so this is likely to pass without code changes — the task is verification via test, not implementation.
**Done:** [x]

---

### Task 9: Verify and fix HTML table paste

**What:** Confirm that pasting a `<table>` from a web page or Google Docs produces a valid TipTap table node; fix the paste pipeline if existing normalization strips table tags.
**Files:** `frontend/components/Editor/Extensions/NormalizePastedHTML.ts` (if changes needed), `frontend/components/Editor/Extensions/NormalizePastedText.ts` (if changes needed)
**Done when:** Pasting a `<table>` from a real web page and from Google Docs produces a structured table node with cell content intact and header rows preserved where the source used `<th>`; no table markup is silently dropped.
**Depends on:** Task 2
**Estimate:** 2
**Notes:** TipTap's Table extension registers an HTML parser rule that handles `<table>` natively — the main risk is that an existing `NormalizePastedHTML` extension strips or rewrites table tags before TipTap sees them. Inspect that extension first; the fix may be a simple allowlist addition.
**Done:** [x]

---

## Summary

- **Total tasks:** 9
- **Total estimated effort:** 15 story points
- **Critical path:** Task 1 → Task 2 → Task 3 → Task 6
- **Risks:**
  - **Task 6 (3 pts)** — Highest complexity; `useToolbarCommands` needs a new conditional-rendering mechanism that doesn't currently exist. Risk of regressions in existing toolbar groups.
  - **Task 9 (2 pts)** — Behavior depends on how `NormalizePastedHTML` interacts with TipTap's internal paste parser; may require debugging across two extension layers.
