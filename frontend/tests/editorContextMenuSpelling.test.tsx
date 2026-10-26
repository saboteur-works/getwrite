import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import EditorContextMenu from "../components/Editor/EditorContextMenu";
import { baseSchemaExtensions } from "../components/Editor/editorExtensions";
import SpellCheckDecorationExtension, {
  SPELL_CHECK_DECORATION_KEY,
  getSpellDocVersion,
  type SpellRange,
} from "../components/Editor/Extensions/SpellCheckDecorationExtension";

/**
 * Task 40 (FR-29, AC-14, OQ-3): the flagged word under the pointer or caret
 * is found when the menu opens and frozen. Document "Hello wrold and teh":
 * "wrold" is 7-12, "teh" is 17-20.
 */
const WROLD: SpellRange = { from: 7, to: 12 };
const TEH: SpellRange = { from: 17, to: 20 };
const editors: Editor[] = [];

function mountEditor(): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      ...baseSchemaExtensions,
      SpellCheckDecorationExtension.configure({ isEnabled: () => true }),
    ],
    content: "<p>Hello wrold and teh</p>",
  });
  editors.push(editor);
  flag(editor, [WROLD, TEH]);
  return editor;
}

function flag(editor: Editor, ranges: SpellRange[]): void {
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setMeta(SPELL_CHECK_DECORATION_KEY, {
        type: "set",
        version: getSpellDocVersion(editor.state),
        ranges,
      }),
    );
  });
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

function setup(editor: Editor) {
  const frozen = vi.fn();
  render(
    <EditorContextMenu editor={editor} onFlaggedWordFrozen={frozen}>
      <EditorContent editor={editor} data-testid="surface" />
    </EditorContextMenu>,
  );
  return { frozen, surface: screen.getByTestId("surface") };
}

function rightPointerDown(el: Element): void {
  fireEvent.pointerDown(el, { button: 2, pointerType: "mouse" });
}

describe("EditorContextMenu flagged word (Task 40)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    while (editors.length > 0) editors.pop()?.destroy();
  });

  it("jsdom delivers button 2 on pointerdown (heuristic input is observable)", () => {
    const seen: number[] = [];
    const el = document.createElement("div");
    el.addEventListener("pointerdown", (e) =>
      seen.push((e as PointerEvent).button),
    );
    document.body.appendChild(el);
    fireEvent.pointerDown(el, { button: 2 });
    expect(seen).toEqual([2]);
    el.remove();
  });

  it("pointer contextmenu resolves the flagged word under the pointer, not the caret", () => {
    const editor = mountEditor();
    setCaret(editor, 18); // inside "teh"
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9); // inside "wrold"
    rightPointerDown(surface);
    fireEvent.contextMenu(surface, { clientX: 10, clientY: 10 });
    expect(editor.view.posAtCoords).toHaveBeenCalledWith({ left: 10, top: 10 });
    expect(frozen).toHaveBeenLastCalledWith(WROLD);
  });

  it("keyboard-originated contextmenu (no preceding pointerdown button 2) uses the caret word and ignores coordinates", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9);
    fireEvent.contextMenu(surface, { clientX: 10, clientY: 10 });
    expect(editor.view.posAtCoords).not.toHaveBeenCalled();
    expect(frozen).toHaveBeenLastCalledWith(TEH);
  });

  it("a left-button pointerdown does not make the next contextmenu pointer-originated", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9);
    fireEvent.pointerDown(surface, { button: 0 });
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(TEH);
  });

  it("the pointerdown marker is consumed: a second contextmenu without a new pointerdown is keyboard-originated", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(WROLD);
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(TEH);
  });

  it("falls back to the flagged caret word when posAtCoords finds no flagged word", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 3); // inside "Hello", not flagged
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(TEH);
  });

  it("falls back to the caret word when posAtCoords returns null", () => {
    const editor = mountEditor();
    setCaret(editor, 8);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, null);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(WROLD);
  });

  it("freezes null when neither the pointer nor the caret is on a flagged word, and the menu is unchanged", () => {
    const editor = mountEditor();
    setCaret(editor, 3);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 3);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    act(() => {});
    expect(frozen).toHaveBeenLastCalledWith(null);
    const labels = screen
      .getAllByRole("menuitem")
      .map((i: HTMLElement) => i.textContent?.trim());
    expect(labels).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline Code",
      "Select All",
    ]);
  });

  it("keeps the frozen range when decorations change while the menu is open", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    act(() => {});
    expect(frozen).toHaveBeenCalledTimes(1);
    flag(editor, [TEH]); // "wrold" no longer flagged
    setCaret(editor, 18);
    expect(frozen).toHaveBeenCalledTimes(1);
    expect(frozen).toHaveBeenLastCalledWith(WROLD);
  });
});
