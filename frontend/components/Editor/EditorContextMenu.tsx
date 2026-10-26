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
 * Task 6 (FR-5) adds a "Select All" `ContextMenuItem` below the formatting
 * items (its own separator above it, mirroring the clipboard/formatting
 * separator already in place). It has no existing toolbar command to reuse
 * (`toolbar-command-schema.ts`'s "Text Formatting" group has no `selectAll`
 * entry), so it calls TipTap core's own `editor.chain().focus().selectAll().run()`
 * directly, matching every other item's `editor.chain().focus()....run()`
 * convention. It acts on the whole document regardless of what was
 * captured, so — unlike Cut/Copy/Paste — it never reads `captured.from`/`to`/
 * `isEmpty`/`isNodeSelection`. It is also left enabled on a read-only editor:
 * the formatting items above it are already unaffected by read-only (a
 * read-only editor can still have its marks toggled from this menu), and
 * selecting all text to copy it is a reasonable thing to want to do on a
 * document you can't edit — so, unlike Cut/Paste, read-only is not treated
 * as a reason to disable it.
 * Markdown-source-mode gating remains out of scope (Task 7, same file,
 * later).
 */
"use client";

import * as React from "react";
import type { Editor } from "@tiptap/core";
import type { EditorStateSnapshot } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { ReactReduxContext } from "react-redux";
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
  TextSelect,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
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
import {
  findSpellRangeAt,
  type SpellRange,
} from "./Extensions/SpellCheckDecorationExtension";
import { findWordRangeAt } from "./word-at-position";
import type { SuggestResult } from "../../src/lib/spelling/spell-client";
import { MAX_SUGGESTIONS } from "../../src/lib/spelling/engine";
import { applyReplacement } from "../../src/lib/spelling/apply-replacement";
import { addProjectWord, ignoreWord } from "../../src/store/spellingSlice";
import { addToUserList } from "../../src/store/userWordListSlice";
import { useUserListAvailable } from "../../src/hooks/useUserListAvailable";
import type { AppDispatch } from "../../src/store/store";
import { toastService } from "../../src/lib/toast-service";

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
  /**
   * Called each time the menu is opened with the flagged range frozen at that
   * moment (spell-checker FR-29), or `null` when the click/caret is not on a
   * flagged word. Later decoration changes do not retarget it.
   */
  onFlaggedWordFrozen?: (range: SpellRange | null) => void;
  /**
   * Asks the editor's one spell client for suggestions for a single word
   * (FR-30). Absent: the menu shows "Suggestions unavailable" for a flagged
   * word.
   */
  requestSuggestions?: (word: string) => Promise<SuggestResult>;
}

/** Where the suggestion request for the frozen word stands. */
type SuggestionsState =
  | { status: "pending" }
  | { status: "ok"; suggestions: string[] }
  | { status: "unavailable" };

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
  onFlaggedWordFrozen,
  requestSuggestions,
}: EditorContextMenuProps) {
  const [captured, setCaptured] = React.useState<CapturedEditorSelection>(() =>
    captureEditorSelection(editor),
  );

  // Tracks whether the Radix menu is currently open. `syncSelection` below
  // consults this (via a ref, not state, so the effect doesn't need to
  // resubscribe on every open/close) to stop live selection changes from
  // overwriting the snapshot the `contextmenu` handler froze while the menu
  // is open — the whole point of capturing it in the first place (see this
  // file's Task 4 doc comment). Once the menu closes, `syncSelection` goes
  // back to tracking the live selection as before, which is what keeps the
  // Radix trigger's `disabled` (NodeSelection) gating correct between opens.
  const isMenuOpenRef = React.useRef(false);

  React.useEffect(() => {
    const syncSelection = () => {
      if (isMenuOpenRef.current) return;
      setCaptured(captureEditorSelection(editor));
    };
    syncSelection();
    editor.on("selectionUpdate", syncSelection);
    editor.on("transaction", syncSelection);
    return () => {
      editor.off("selectionUpdate", syncSelection);
      editor.off("transaction", syncSelection);
    };
  }, [editor]);

  // OQ-3: a `pointerdown` with button 2 immediately before `contextmenu`
  // marks the event as pointer-originated; otherwise (context-menu key,
  // Shift+F10) it is keyboard-originated. The marker is consumed by the
  // `contextmenu` that follows it. FR-47 (OQ-15 a): a touch long-press is
  // pointer-originated too; Android fires `pointerdown` (pointerType "touch",
  // button 0) and then `contextmenu` (button -1).
  const rightPointerDownRef = React.useRef(false);
  const touchPointerDownRef = React.useRef(false);
  // The flagged range frozen when the menu opened (null: none).
  const [flaggedRange, setFlaggedRange] = React.useState<SpellRange | null>(
    null,
  );
  // The flagged word's text, frozen with the range; "Replace with" checks the
  // document still holds it (FR-31).
  const [flaggedWord, setFlaggedWord] = React.useState("");

  const [suggestions, setSuggestions] = React.useState<SuggestionsState>({
    status: "pending",
  });
  // Identifies the latest suggestion request; a reply for an older one (the
  // menu was reopened elsewhere) is dropped.
  const suggestionRequestRef = React.useRef(0);

  const requestSuggestionsFor = React.useCallback(
    (word: string) => {
      const requestId = ++suggestionRequestRef.current;
      setSuggestions({ status: "pending" });
      if (!requestSuggestions) {
        setSuggestions({ status: "unavailable" });
        return;
      }
      void requestSuggestions(word).then(
        (result) => {
          if (requestId !== suggestionRequestRef.current) return;
          setSuggestions(
            result.status === "ok"
              ? { status: "ok", suggestions: result.suggestions }
              : { status: "unavailable" },
          );
        },
        () => {
          if (requestId !== suggestionRequestRef.current) return;
          setSuggestions({ status: "unavailable" });
        },
      );
    },
    [requestSuggestions],
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      const isTouch = event.pointerType === "touch";
      touchPointerDownRef.current = isTouch;
      rightPointerDownRef.current = event.button === 2 || isTouch;
    },
    [],
  );

  // A tap (touch `pointerdown`, no long-press) leaves the marker set; a key
  // press after it means the next `contextmenu` is keyboard-originated.
  const handleKeyDown = React.useCallback(() => {
    rightPointerDownRef.current = false;
    touchPointerDownRef.current = false;
  }, []);

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      const isPointerOriginated = rightPointerDownRef.current;
      const isTouchOriginated = touchPointerDownRef.current;
      rightPointerDownRef.current = false;
      touchPointerDownRef.current = false;
      let range: SpellRange | null = null;
      let pressPos: number | null = null;
      if (isPointerOriginated) {
        const at = editor.view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        pressPos = at ? at.pos : null;
        range = at ? findSpellRangeAt(editor.state, at.pos) : null;
      }
      // The caret word stands in when the event gives no usable position
      // (keyboard, or a press off the text). A touch press that landed on the
      // text means the word there, so it never falls back to a flagged word
      // elsewhere (task_0162a56f; right-click keeps FR-29's fallback).
      const isPressOnText = isTouchOriginated && pressPos !== null;
      if (!isPressOnText) {
        range ??= findSpellRangeAt(editor.state, editor.state.selection.from);
      }
      // FR-47 (OQ-17 c): the long-press DOM selection is never used to find
      // the word; on a flagged word the editor selection becomes the frozen
      // range so Replace/Cut/Copy act on the same word. On any other word
      // (task_0162a56f) the selection becomes the word under the press, or a
      // caret there when no word is, so Cut/Copy/Paste act where the writer
      // pressed rather than on a selection left from before. Captured after
      // this so Cut/Copy read it.
      if (isTouchOriginated && range) {
        editor.commands.setTextSelection({ from: range.from, to: range.to });
      } else if (isTouchOriginated && pressPos !== null) {
        const word = findWordRangeAt(editor.state.doc, pressPos);
        editor.commands.setTextSelection(
          word ?? { from: pressPos, to: pressPos },
        );
      }
      setCaptured(captureEditorSelection(editor));
      setFlaggedRange(range);
      onFlaggedWordFrozen?.(range);
      if (range) {
        const word = editor.state.doc.textBetween(range.from, range.to);
        setFlaggedWord(word);
        requestSuggestionsFor(word);
      } else {
        setFlaggedWord("");
        suggestionRequestRef.current++;
      }
    },
    [editor, onFlaggedWordFrozen, requestSuggestionsFor],
  );

  // The store is read from context rather than `useDispatch` so the menu still
  // renders (spelling items inert) where no Provider is mounted.
  const reduxContext = React.useContext(ReactReduxContext);

  // Ignore / Add write the project's config, not the document (FR-32), so they
  // are not gated on read-only. No optimistic update: the slice replaces both
  // lists from the response, which redraws every open editor; a failure leaves
  // the word underlined and toasts.
  const runSpellingListThunk = React.useCallback(
    (
      run: (dispatch: AppDispatch, word: string) => Promise<ListThunkResult>,
      failure: string,
    ) => {
      if (!reduxContext || !flaggedWord) return;
      const dispatch = reduxContext.store.dispatch as AppDispatch;
      void run(dispatch, flaggedWord).then((result) => {
        if (result.meta.requestStatus !== "rejected") return;
        toastService.error(failure, rejectionReason(result));
      });
    },
    [reduxContext, flaggedWord],
  );
  const handleIgnore = React.useCallback(
    () =>
      runSpellingListThunk(
        (dispatch, word) => dispatch(ignoreWord(word)),
        "Could not ignore the word.",
      ),
    [runSpellingListThunk],
  );
  const handleAddWord = React.useCallback(
    () =>
      runSpellingListThunk(
        (dispatch, word) => dispatch(addProjectWord(word)),
        "Could not add the word to the project dictionary.",
      ),
    [runSpellingListThunk],
  );
  // The user list is device-wide and separate from the project lists (FR-17):
  // the same word may be in both, and neither add touches the other list.
  const handleAddToMyDictionary = React.useCallback(
    () =>
      runSpellingListThunk(
        (dispatch, word) => dispatch(addToUserList(word)),
        "Could not add the word to your dictionary.",
      ),
    [runSpellingListThunk],
  );

  const handleReplace = React.useCallback(
    (suggestion: string) => {
      if (!flaggedRange) return;
      applyReplacement(editor, flaggedRange, flaggedWord, suggestion);
    },
    [editor, flaggedRange, flaggedWord],
  );

  const handleOpenChange = React.useCallback((open: boolean) => {
    isMenuOpenRef.current = open;
  }, []);

  // Radix's default close behavior restores DOM focus to whatever had it
  // before the menu opened — typically the ProseMirror contenteditable
  // itself, since the editor is usually focused at the moment of a
  // right-click. That restoration fires the DOM's native `focus` event on
  // `.ProseMirror`, and prosemirror-view's own `focus` handler
  // (`handlers.focus` in `prosemirror-view`) responds by syncing the
  // browser's native selection to the document's current ProseMirror
  // selection (`selectionToDOM`) whenever the two have drifted — which they
  // always have here, since the DOM selection was never inside the
  // ProseMirror content area while the Radix menu/portal held focus.
  // Re-establishing a native Selection Range is what the browser scrolls
  // into view, producing the reported jump — not any `.focus()` call this
  // component makes itself (those only run from an actually-activated menu
  // item, mirroring the toolbar's own `editor.chain().focus()....run()`
  // convention, and are fine to scroll). Preventing Radix's default here
  // stops the spurious restoration on a plain dismiss (Escape, click
  // outside, or `onOpenChange(false)` with no action chosen). When an
  // action *was* chosen, its own handler already focused the editor (with
  // its normal scroll-into-view behavior) before the menu finished closing,
  // so `editor.isFocused` is already true and the fallback below is a
  // no-op; when nothing was chosen, it quietly returns focus to the editor
  // without scrolling, so a keyboard user who dismissed with Escape can
  // keep typing (FR-6) without losing their scroll position.
  const handleCloseAutoFocus = React.useCallback(
    (event: Event) => {
      event.preventDefault();
      // Radix's FocusScope defers this event to a macrotask (a bare
      // `setTimeout(..., 0)`), so it can still fire after the editor itself
      // has been torn down (e.g. the owning component unmounting around the
      // same time the menu closes) — guard against acting on a destroyed
      // editor instance.
      if (!editor.isDestroyed && !editor.isFocused) {
        editor.commands.focus(undefined, { scrollIntoView: false });
      }
    },
    [editor],
  );

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

  const handleSelectAll = React.useCallback(() => {
    editor.chain().focus().selectAll().run();
  }, [editor]);

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
    <ContextMenu onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild disabled={captured.isNodeSelection}>
        <span
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          style={{ display: "contents" }}
        >
          {children}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label="Editor options"
        className="resource-context-menu"
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        {flaggedRange && (
          <SpellingGroup
            suggestions={suggestions}
            readOnly={captured.readOnly}
            onReplace={handleReplace}
            onIgnore={handleIgnore}
            onAddWord={handleAddWord}
            onAddToMyDictionary={handleAddToMyDictionary}
          />
        )}
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
        <ContextMenuSeparator className="resource-context-menu-separator" />
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={handleSelectAll}
        >
          <TextSelect size={14} className="resource-context-menu-item-icon" />
          Select All
        </ContextMenuItem>
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

/** What the menu reads from a settled list thunk. */
interface ListThunkResult {
  meta: { requestStatus: string };
  payload?: unknown;
  error?: { message?: string };
}

/** The text a rejected list thunk offers the toast: its payload message, else its error message. */
function rejectionReason(result: ListThunkResult): string | undefined {
  const payload = result.payload as { message?: unknown } | undefined;
  if (payload && typeof payload.message === "string" && payload.message) {
    return payload.message;
  }
  return result.error?.message || undefined;
}

interface SpellingGroupProps {
  suggestions: SuggestionsState;
  /** True when the editor is read-only: suggestions cannot be applied. */
  readOnly: boolean;
  onReplace: (suggestion: string) => void;
  onIgnore: () => void;
  onAddWord: () => void;
  onAddToMyDictionary: () => void;
}

/**
 * The menu's first items for a flagged word (FR-29, FR-30): "Replace with" and
 * up to {@link MAX_SUGGESTIONS} suggestions, or one disabled item saying why
 * there are none (pending, empty, and failed are three different states),
 * then Ignore, Add to project dictionary and, only where the user list is
 * available (Feature 96, FR-6/FR-7: not on a paired device, not while the
 * role is unknown), Add to my dictionary, then a separator.
 */
function SpellingGroup({
  suggestions,
  readOnly,
  onReplace,
  onIgnore,
  onAddWord,
  onAddToMyDictionary,
}: SpellingGroupProps) {
  const userListAvailability = useUserListAvailable();
  let body: React.ReactNode;
  if (suggestions.status === "ok" && suggestions.suggestions.length > 0) {
    body = suggestions.suggestions.slice(0, MAX_SUGGESTIONS).map((word) => (
      <ContextMenuItem
        key={word}
        className="resource-context-menu-item"
        disabled={readOnly}
        onSelect={() => onReplace(word)}
      >
        {word}
      </ContextMenuItem>
    ));
  } else {
    const text =
      suggestions.status === "pending"
        ? "Loading suggestions"
        : suggestions.status === "ok"
          ? "No suggestions"
          : "Suggestions unavailable";
    body = (
      <ContextMenuItem className="resource-context-menu-item" disabled>
        {text}
      </ContextMenuItem>
    );
  }
  return (
    <>
      <ContextMenuLabel className="resource-context-menu-header">
        Replace with
      </ContextMenuLabel>
      {body}
      <ContextMenuItem
        className="resource-context-menu-item"
        onSelect={onIgnore}
      >
        Ignore
      </ContextMenuItem>
      <ContextMenuItem
        className="resource-context-menu-item"
        onSelect={onAddWord}
      >
        Add to project dictionary
      </ContextMenuItem>
      {userListAvailability === "available" && (
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={onAddToMyDictionary}
        >
          Add to my dictionary
        </ContextMenuItem>
      )}
      <ContextMenuSeparator className="resource-context-menu-separator" />
    </>
  );
}
