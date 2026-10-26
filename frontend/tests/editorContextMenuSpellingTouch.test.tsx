import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import EditorContextMenu from "../components/Editor/EditorContextMenu";
import { baseSchemaExtensions } from "../components/Editor/editorExtensions";
import { toastService } from "../src/lib/toast-service";
import SpellCheckDecorationExtension, {
  SPELL_CHECK_DECORATION_KEY,
  getSpellDocVersion,
  type SpellRange,
} from "../components/Editor/Extensions/SpellCheckDecorationExtension";

/**
 * Task 59 (FR-47, AC-22, OQ-15 a, OQ-16 b, OQ-17 c): a touch long-press.
 *
 * Replays the sequence recorded on the Pixel 7 Pro (experiments.md, "Android
 * long-press (pasted)"): a `pointerdown` with pointerType "touch" and button 0,
 * then a `contextmenu` with button -1 and coordinates, while the ProseMirror
 * selection is collapsed elsewhere (the end of the line, as measured at 52).
 *
 * This is a separate file from editorContextMenuSpelling.test.tsx, which is
 * already 563 lines and is left unedited; the small harness is repeated here
 * because that file does not export it.
 *
 * Document "Hello wrold and teh fine words": "wrold" is 7-12, "teh" is 17-20,
 * "fine" is 21-25 and "words" 26-31 (not flagged). The end of the line (31) is
 * not in a flagged word, as in the measurement.
 */
const WROLD: SpellRange = { from: 7, to: 12 };
const TEH: SpellRange = { from: 17, to: 20 };
const END_OF_LINE = 31;
const IN_WROLD = 9;
const IN_FINE = 23;
const editors: Editor[] = [];

function mountEditor(): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      ...baseSchemaExtensions,
      SpellCheckDecorationExtension.configure({ isEnabled: () => true }),
    ],
    content: "<p>Hello wrold and teh fine words</p>",
  });
  editors.push(editor);
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setMeta(SPELL_CHECK_DECORATION_KEY, {
        type: "set",
        version: getSpellDocVersion(editor.state),
        ranges: [WROLD, TEH],
      }),
    );
  });
  setCaret(editor, END_OF_LINE);
  return editor;
}

function setCaret(editor: Editor, pos: number): void {
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
    );
  });
}

function mockPosAtCoords(editor: Editor, pos: number | null): void {
  vi.spyOn(editor.view, "posAtCoords").mockReturnValue(
    pos === null ? null : { pos, inside: pos },
  );
}

type SuggestResult =
  | { status: "ok"; suggestions: string[] }
  | { status: "unavailable"; reason: string };

const world = async (): Promise<SuggestResult> => ({
  status: "ok",
  suggestions: ["world"],
});

function renderMenu(
  editor: Editor,
  requestSuggestions: (word: string) => Promise<SuggestResult> = world,
): HTMLElement {
  render(
    <EditorContextMenu editor={editor} requestSuggestions={requestSuggestions}>
      <EditorContent editor={editor} data-testid="surface" />
    </EditorContextMenu>,
  );
  return screen.getByTestId("surface");
}

/** The recorded sequence: touch pointerdown (button 0), then contextmenu (button -1). */
function longPress(surface: Element, x = 135, y = 324): void {
  fireEvent.pointerDown(surface, {
    pointerType: "touch",
    button: 0,
    buttons: 1,
    clientX: x + 0.62,
    clientY: y + 0.95,
  });
  fireEvent.contextMenu(surface, {
    button: -1,
    buttons: 0,
    clientX: x,
    clientY: y,
  });
}

function menuLabels(): string[] {
  return screen
    .getAllByRole("menuitem")
    .map((i: HTMLElement) => i.textContent?.trim() ?? "");
}

const EXISTING_ITEMS = [
  "Cut",
  "Copy",
  "Paste",
  "Bold",
  "Italic",
  "Underline",
  "Strikethrough",
  "Inline Code",
  "Select All",
];

describe("EditorContextMenu touch long-press (Task 59, FR-47, AC-22)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.getSelection()?.removeAllRanges();
    while (editors.length > 0) editors.pop()?.destroy();
  });

  it("the emulated events are readable by a handler as pointerType touch, button 0 and button -1", () => {
    const seen: Array<[string, string | undefined, number]> = [];
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.addEventListener("pointerdown", (e) =>
      seen.push(["pointerdown", (e as PointerEvent).pointerType, e.button]),
    );
    el.addEventListener("contextmenu", (e) =>
      seen.push(["contextmenu", undefined, (e as MouseEvent).button]),
    );
    longPress(el);
    el.remove();
    expect(seen).toEqual([
      ["pointerdown", "touch", 0],
      ["contextmenu", undefined, -1],
    ]);
  });

  it("shows the spelling group above the existing items for the word at the contextmenu coordinates", async () => {
    const editor = mountEditor();
    const surface = renderMenu(editor);
    mockPosAtCoords(editor, IN_WROLD);
    longPress(surface, 135, 324);
    expect(await screen.findByText("world")).toBeTruthy();
    expect(editor.view.posAtCoords).toHaveBeenCalledWith({
      left: 135,
      top: 324,
    });
    expect(screen.getByText("Replace with")).toBeTruthy();
    expect(menuLabels()).toEqual([
      "world",
      "Ignore",
      "Add to project dictionary",
      ...EXISTING_ITEMS,
    ]);
  });

  it("finds the word from the coordinates, not from a DOM selection on a different flagged word", async () => {
    const editor = mountEditor();
    const surface = renderMenu(editor);
    // The long-press DOM selection is "teh"; the finger is on "wrold".
    const textNode = editor.view.dom.querySelector("p")?.lastChild;
    const walker = document.createTreeWalker(
      editor.view.dom,
      NodeFilter.SHOW_TEXT,
    );
    let tehNode: Node | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent?.includes("teh")) tehNode = n;
    }
    expect(textNode).toBeTruthy();
    expect(tehNode).toBeTruthy();
    const range = document.createRange();
    const start = (tehNode?.textContent ?? "").indexOf("teh");
    range.setStart(tehNode as Node, start);
    range.setEnd(tehNode as Node, start + 3);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    expect(window.getSelection()?.toString()).toBe("teh");

    mockPosAtCoords(editor, IN_WROLD);
    longPress(surface);
    expect(editor.state.selection.from).toBe(WROLD.from);
    expect(editor.state.selection.to).toBe(WROLD.to);
    await screen.findByText("world");
  });

  it("on a non-flagged word shows exactly today's menu and changes no selection", () => {
    const editor = mountEditor();
    const request = vi.fn(world);
    const surface = renderMenu(editor, request);
    mockPosAtCoords(editor, IN_FINE);
    longPress(surface);
    expect(menuLabels()).toEqual(EXISTING_ITEMS);
    expect(request).not.toHaveBeenCalled();
    expect(editor.state.selection.from).toBe(END_OF_LINE);
    expect(editor.state.selection.to).toBe(END_OF_LINE);
  });

  it("freezes the flagged range at open and makes it the editor selection", async () => {
    const editor = mountEditor();
    const frozen = vi.fn();
    render(
      <EditorContextMenu
        editor={editor}
        onFlaggedWordFrozen={frozen}
        requestSuggestions={world}
      >
        <EditorContent editor={editor} data-testid="surface" />
      </EditorContextMenu>,
    );
    mockPosAtCoords(editor, IN_WROLD);
    longPress(screen.getByTestId("surface"));
    expect(editor.state.selection.from).toBe(WROLD.from);
    expect(editor.state.selection.to).toBe(WROLD.to);
    expect(frozen).toHaveBeenCalledTimes(1);
    expect(frozen).toHaveBeenLastCalledWith(WROLD);
    await screen.findByText("world");
    // Moving the caret afterwards does not retarget the frozen range.
    setCaret(editor, END_OF_LINE);
    expect(frozen).toHaveBeenCalledTimes(1);
  });

  it("Replace with from a touch-opened menu applies, and undo restores", async () => {
    const editor = mountEditor();
    const surface = renderMenu(editor);
    mockPosAtCoords(editor, IN_WROLD);
    longPress(surface);
    fireEvent.click(await screen.findByText("world"));
    expect(editor.state.doc.textContent).toBe("Hello world and teh fine words");
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe("Hello wrold and teh fine words");
  });

  it("FR-31: refuses the replace and toasts when the text at the frozen range changed", async () => {
    const editor = mountEditor();
    const toast = vi.spyOn(toastService, "info").mockReturnValue("t");
    const surface = renderMenu(editor);
    mockPosAtCoords(editor, IN_WROLD);
    longPress(surface);
    const item = await screen.findByText("world");
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText("X", 7, 8));
    });
    const before = editor.state.doc.textContent;
    fireEvent.click(item);
    expect(editor.state.doc.textContent).toBe(before);
    expect(toast).toHaveBeenCalled();
  });

  it("AC-14 still holds: a button 2 pointer contextmenu opens the group for the word under the pointer", async () => {
    const editor = mountEditor();
    const surface = renderMenu(editor);
    mockPosAtCoords(editor, IN_WROLD);
    fireEvent.pointerDown(surface, { button: 2, pointerType: "mouse" });
    fireEvent.contextMenu(surface, { clientX: 10, clientY: 10 });
    expect(await screen.findByText("world")).toBeTruthy();
  });

  it("AC-14 still holds: a keyboard contextmenu uses the flagged caret word and ignores coordinates", async () => {
    const editor = mountEditor();
    setCaret(editor, 18); // inside "teh"
    const surface = renderMenu(editor);
    mockPosAtCoords(editor, IN_WROLD);
    fireEvent.contextMenu(surface, { clientX: 10, clientY: 10 });
    expect(editor.view.posAtCoords).not.toHaveBeenCalled();
    expect(await screen.findByText("world")).toBeTruthy();
  });
});
