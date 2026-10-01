/**
 * @module EditorContextMenu
 *
 * Right-click context menu scoped to the TipTap editor's `.ProseMirror`
 * content area (`specs/features/editor-context-menu.md`). Wraps the editor's
 * rendered content in the shared shadcn/Radix `ContextMenu` primitive — the
 * same primitive `ResourceContextMenu` and `EditContextMenu` already use —
 * following `EditContextMenu.tsx`'s trigger-wrapping pattern: a `display:
 * contents` span around the children keeps the trigger invisible to layout
 * while still carrying the native `contextmenu` event.
 *
 * Task 3 (FR-9): the component now receives the live TipTap `Editor`
 * instance (the same prop convention `MenuBar` already uses) and tracks its
 * current ProseMirror selection. A plain `TextSelection` (clicking/selecting
 * text) lets Radix's normal `contextmenu`-triggered open proceed. A
 * `NodeSelection` (e.g. clicking directly on an image node, which TipTap
 * sets via `setNodeSelection`) disables the Radix trigger outright —
 * Radix's `ContextMenuTrigger` skips its own open/`preventDefault` logic
 * entirely when `disabled`, so the browser's native context menu is shown
 * instead. That `disabled` flag has to already be correct *before* the
 * `contextmenu` event fires (Radix decides whether to wire up its internal
 * handler at render time, not inside the event itself), so the selection is
 * tracked reactively via the editor's own `selectionUpdate` event rather
 * than only captured inside the `contextmenu` handler. The `contextmenu`
 * handler itself (mirroring `EditContextMenu.tsx`'s capture-at-event-time
 * pattern) re-captures the selection at the moment of the right-click as a
 * defensive refresh and to freeze the `from`/`to`/empty/read-only details
 * Tasks 4-6 will read to decide which menu items to enable.
 *
 * Task 4 (FR-2, FR-3) adds Cut/Copy/Paste `ContextMenuItem`s, operating on
 * the captured ProseMirror range (`captured.from`/`captured.to`) rather than
 * whatever `editor.state.selection` happens to be when the item is actually
 * activated — Radix's `onSelect` fires asynchronously after the native
 * `contextmenu` event, so the live selection could have moved on by then
 * (the same rationale Task 3's doc comment above gives for capturing a
 * `CapturedEditorSelection` snapshot in the first place). Each handler
 * re-applies the captured range via `editor.chain().focus().setTextSelection(...)`
 * before acting, mirroring `EditContextMenu.tsx`'s own
 * capture-then-restore-then-act pattern for plain `<input>`/`<textarea>`
 * fields, adapted to ProseMirror's selection/command API rather than
 * `setSelectionRange`/`execCommand`. Copy/Cut read the selected text via
 * `editor.state.doc.textBetween(from, to, "\n")` and write it with
 * `navigator.clipboard.writeText`; Cut then deletes the range with
 * `deleteSelection()`. Paste reads `navigator.clipboard.readText()` and
 * inserts it at the captured range with `insertContent`, which replaces a
 * non-collapsed selection the same way typing over a selection would.
 * Task 5 (FR-4) adds Bold/Italic/Underline/Strikethrough/Inline Code
 * `ContextMenuItem`s below Cut/Copy/Paste. Rather than re-deriving the
 * toggle/active/disabled logic, each item reuses the exact command objects
 * already registered in `MenuBar/toolbar-command-schema.ts`'s "Text
 * Formatting" group (`findToolbarTextFormattingCommand`) — the same `run`,
 * `isActive`, and `isDisabled` functions the toolbar's own buttons invoke —
 * so behavior can never drift between the toolbar and this menu. `run`
 * itself always acts on `editor.state.selection` (e.g.
 * `editor.chain().focus().toggleBold().run()`), so each handler first
 * re-applies the captured range via `setTextSelection` (mirroring Task 4's
 * capture-then-restore-then-act pattern) and *then* invokes the toolbar
 * command's unmodified `run`. `isActive`/`isDisabled` read `MenuBarState`
 * (`menuBarState.tsx`'s `menuBarStateSelector`), the identical derived state
 * object the toolbar itself renders from; it's recomputed on every render so
 * it stays in sync with the selection-tracking effect already in place from
 * Task 3. The shared `ContextMenu`/`ContextMenuItem` primitives
 * (`components/common/UI/ContextMenu/ContextMenu.tsx`) have no
 * checkbox/toggle variant, so active state is rendered as a checkmark glyph
 * on a plain `ContextMenuItem` rather than a dedicated toggle component.
 * Select All/Markdown-source-mode gating remain out of scope (Tasks 6-7,
 * same file, later).
 */
"use client";

import * as React from "react";
import type { Editor } from "@tiptap/core";
import type { EditorStateSnapshot } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import {
  Scissors,
  Copy,
  Clipboard,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Check,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../common/UI/ContextMenu";
import {
  toolbarCommandSchema,
  type ToolbarIconCommand,
} from "./MenuBar/toolbar-command-schema";
import {
  menuBarStateSelector,
  type MenuBarState,
} from "./MenuBar/menuBarState";

/**
 * Looks up a `ToolbarIconCommand` by its `id` from the "Text Formatting"
 * group in `toolbarCommandSchema` (FR-4). Reuses the exact command object
 * the toolbar itself renders from, so this menu's run/isActive/isDisabled
 * logic can never drift from the toolbar's.
 */
function findToolbarTextFormattingCommand(id: string): ToolbarIconCommand {
  const group = toolbarCommandSchema.find(
    (g) => g.groupId === "text-formatting-controls",
  );
  const item = group?.items.find((candidate) => candidate.id === id);
  if (!item || item.kind !== "icon") {
    throw new Error(`Toolbar text-formatting command not found: ${id}`);
  }
  return item;
}

const BOLD_COMMAND = findToolbarTextFormattingCommand("bold");
const ITALIC_COMMAND = findToolbarTextFormattingCommand("italic");
const UNDERLINE_COMMAND = findToolbarTextFormattingCommand("underline");
const STRIKETHROUGH_COMMAND = findToolbarTextFormattingCommand("strikethrough");
const INLINE_CODE_COMMAND = findToolbarTextFormattingCommand("inline-code");

export interface EditorContextMenuProps {
  /** The editor's rendered content area (TipTap's `EditorContent`). */
  children: React.ReactNode;
  /** The live TipTap editor instance whose selection gates the menu (FR-9). */
  editor: Editor;
}

/** A snapshot of the editor's ProseMirror selection at a point in time. */
export interface CapturedEditorSelection {
  from: number;
  to: number;
  isEmpty: boolean;
  /** True for a plain text cursor/range selection. */
  isTextSelection: boolean;
  /** True for a selected node (e.g. an image), which has no text range. */
  isNodeSelection: boolean;
  /** True when the editor is not currently editable. */
  readOnly: boolean;
}

function captureEditorSelection(editor: Editor): CapturedEditorSelection {
  const { selection } = editor.state;
  return {
    from: selection.from,
    to: selection.to,
    isEmpty: selection.empty,
    isTextSelection: selection instanceof TextSelection,
    isNodeSelection: selection instanceof NodeSelection,
    readOnly: !editor.isEditable,
  };
}

/**
 * Wraps the TipTap editor's content area so a right-click inside it opens an
 * app-styled context menu instead of the browser's native one (FR-1), gated
 * on the editor's current selection kind (FR-9).
 */
export default function EditorContextMenu({
  children,
  editor,
}: EditorContextMenuProps) {
  const [captured, setCaptured] = React.useState<CapturedEditorSelection>(() =>
    captureEditorSelection(editor),
  );

  React.useEffect(() => {
    const syncSelection = () => setCaptured(captureEditorSelection(editor));
    syncSelection();
    editor.on("selectionUpdate", syncSelection);
    editor.on("transaction", syncSelection);
    return () => {
      editor.off("selectionUpdate", syncSelection);
      editor.off("transaction", syncSelection);
    };
  }, [editor]);

  const handleContextMenu = React.useCallback(() => {
    setCaptured(captureEditorSelection(editor));
  }, [editor]);

  const handleCopy = React.useCallback(() => {
    const { from, to } = captured;
    const text = editor.state.doc.textBetween(from, to, "\n");
    if (!text) return;
    void navigator.clipboard.writeText(text);
  }, [editor, captured]);

  const handleCut = React.useCallback(() => {
    const { from, to } = captured;
    const text = editor.state.doc.textBetween(from, to, "\n");
    const run = () => {
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .deleteSelection()
        .run();
    };
    if (!text) {
      run();
      return;
    }
    void navigator.clipboard.writeText(text).then(run, run);
  }, [editor, captured]);

  // Recomputed fresh on every render — this component already re-renders on
  // every `selectionUpdate`/`transaction` (Task 3's effect), so this stays in
  // sync with the editor the same way MenuBar's `useEditorState` does.
  const menuBarState = menuBarStateSelector({
    editor,
  } as EditorStateSnapshot<Editor>);

  const runTextFormattingCommand = React.useCallback(
    (command: ToolbarIconCommand) => {
      const { from, to } = captured;
      editor.chain().focus().setTextSelection({ from, to }).run();
      command.run({ editor, state: menuBarState });
    },
    [editor, captured, menuBarState],
  );

  const handlePaste = React.useCallback(() => {
    const { from, to } = captured;
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (!text) return;
        editor
          .chain()
          .focus()
          .setTextSelection({ from, to })
          .insertContent(text)
          .run();
      })
      .catch(() => {
        // No clipboard permission/content available — nothing to paste.
      });
  }, [editor, captured]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={captured.isNodeSelection}>
        <span onContextMenu={handleContextMenu} style={{ display: "contents" }}>
          {children}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label="Editor options"
        className="resource-context-menu"
      >
        <ContextMenuItem
          className="resource-context-menu-item"
          disabled={captured.isEmpty || captured.readOnly}
          onSelect={handleCut}
        >
          <Scissors size={14} className="resource-context-menu-item-icon" />
          Cut
        </ContextMenuItem>
        <ContextMenuItem
          className="resource-context-menu-item"
          disabled={captured.isEmpty}
          onSelect={handleCopy}
        >
          <Copy size={14} className="resource-context-menu-item-icon" />
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          className="resource-context-menu-item"
          disabled={captured.readOnly}
          onSelect={handlePaste}
        >
          <Clipboard size={14} className="resource-context-menu-item-icon" />
          Paste
        </ContextMenuItem>
        <ContextMenuSeparator className="resource-context-menu-separator" />
        <TextFormattingMenuItem
          command={BOLD_COMMAND}
          label="Bold"
          icon={Bold}
          editor={editor}
          state={menuBarState}
          onRun={runTextFormattingCommand}
        />
        <TextFormattingMenuItem
          command={ITALIC_COMMAND}
          label="Italic"
          icon={Italic}
          editor={editor}
          state={menuBarState}
          onRun={runTextFormattingCommand}
        />
        <TextFormattingMenuItem
          command={UNDERLINE_COMMAND}
          label="Underline"
          icon={Underline}
          editor={editor}
          state={menuBarState}
          onRun={runTextFormattingCommand}
        />
        <TextFormattingMenuItem
          command={STRIKETHROUGH_COMMAND}
          label="Strikethrough"
          icon={Strikethrough}
          editor={editor}
          state={menuBarState}
          onRun={runTextFormattingCommand}
        />
        <TextFormattingMenuItem
          command={INLINE_CODE_COMMAND}
          label="Inline Code"
          icon={Code}
          editor={editor}
          state={menuBarState}
          onRun={runTextFormattingCommand}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface TextFormattingMenuItemProps {
  command: ToolbarIconCommand;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  editor: Editor;
  state: MenuBarState;
  onRun: (command: ToolbarIconCommand) => void;
}

/**
 * Renders a single Bold/Italic/Underline/Strikethrough/Inline Code item
 * (FR-4), reusing a toolbar command's own `isActive`/`isDisabled` predicates
 * so the menu's active/disabled data can never drift from the toolbar's.
 * Active state is shown as a leading checkmark since the shared
 * `ContextMenuItem` primitive has no checkbox/toggle variant to opt into.
 */
function TextFormattingMenuItem({
  command,
  label,
  icon: Icon,
  editor,
  state,
  onRun,
}: TextFormattingMenuItemProps) {
  const isActive = command.isActive?.({ editor, state }) ?? false;
  const isDisabled = command.isDisabled?.({ editor, state }) ?? false;

  return (
    <ContextMenuItem
      className="resource-context-menu-item"
      disabled={isDisabled}
      onSelect={() => onRun(command)}
    >
      {isActive ? (
        <Check size={14} className="resource-context-menu-item-icon" />
      ) : (
        <Icon size={14} className="resource-context-menu-item-icon" />
      )}
      {label}
    </ContextMenuItem>
  );
}
