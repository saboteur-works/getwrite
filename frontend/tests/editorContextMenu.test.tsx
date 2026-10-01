import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import EditorContextMenu from "../components/Editor/EditorContextMenu";
import { baseSchemaExtensions } from "../components/Editor/editorExtensions";

// Radix DismissableLayer registers its pointerdown listener inside a
// setTimeout, so fake timers must run after opening for the menu's own
// lifecycle (outside-click dismissal, etc.) to settle. Mirrors
// resourceContextMenu.test.tsx / editContextMenu.test.tsx.
function openMenu(target: HTMLElement) {
  return fireEvent.contextMenu(target);
}

const editors: Editor[] = [];

function mountEditor(content: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: baseSchemaExtensions,
    content,
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy();
  }
});

function renderWithContent() {
  const editor = mountEditor("<p>Some document text</p>");
  const result = render(
    <div>
      <div data-testid="outside">Outside the editor</div>
      <EditorContextMenu editor={editor}>
        <EditorContent editor={editor} data-testid="prosemirror" />
      </EditorContextMenu>
    </div>,
  );
  return { editor, ...result };
}

function renderWithImage() {
  const editor = mountEditor(
    '<p>Before</p><img src="https://example.com/x.png" /><p>After</p>',
  );
  const result = render(
    <div>
      <EditorContextMenu editor={editor}>
        <EditorContent editor={editor} data-testid="prosemirror" />
      </EditorContextMenu>
    </div>,
  );
  return { editor, ...result };
}

/** Finds the position of the sole `image` node in the editor's document. */
function findImagePos(editor: Editor): number {
  let foundPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "image") {
      foundPos = pos;
      return false;
    }
    return true;
  });
  if (foundPos === -1) {
    throw new Error("No image node found in editor document");
  }
  return foundPos;
}

let clipboardReadText: ReturnType<typeof vi.fn>;
let clipboardWriteText: ReturnType<typeof vi.fn>;

describe("EditorContextMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clipboardReadText = vi.fn().mockResolvedValue("");
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { readText: clipboardReadText, writeText: clipboardWriteText },
      writable: true,
      configurable: true,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens an (empty) Radix menu anchored at the pointer on right-click inside the editor content", () => {
    renderWithContent();
    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("prevents the browser's native context menu from also appearing (FR-1)", () => {
    renderWithContent();
    const target = screen.getByTestId("prosemirror");
    const wasNotCancelled = fireEvent.contextMenu(target);
    act(() => vi.runAllTimers());

    // fireEvent/dispatchEvent returns false when the event's default action
    // (the browser's native context menu) was prevented.
    expect(wasNotCancelled).toBe(false);
  });

  it("does not render a menu for a right-click outside the editor content", () => {
    renderWithContent();
    fireEvent.contextMenu(screen.getByTestId("outside"));
    act(() => vi.runAllTimers());

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("still opens the menu for a plain TextSelection (FR-9)", () => {
    const { editor } = renderWithContent();
    expect(editor.state.selection).toBeInstanceOf(TextSelection);

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("does not open the menu and lets the native context menu through for a NodeSelection on an image (FR-9)", () => {
    const { editor } = renderWithImage();
    const imagePos = findImagePos(editor);

    // Mirrors TipTap's own `setNodeSelection` (what clicking an image node
    // triggers) rather than only unit-testing selection-type detection.
    act(() => {
      editor.commands.setNodeSelection(imagePos);
    });
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);

    const target = screen.getByTestId("prosemirror");
    const wasNotCancelled = fireEvent.contextMenu(target);
    act(() => vi.runAllTimers());

    // Native menu was allowed through: the event's default action was not
    // prevented.
    expect(wasNotCancelled).toBe(true);
    // And Radix's own menu never opened.
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders Cut, Copy, and Paste grayed out (not omitted) for a collapsed cursor", () => {
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection(1);
    });

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    expect(screen.getByText("Cut").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Copy").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Paste").closest("[data-disabled]")).toBeFalsy();
  });

  it("renders Cut and Copy enabled with a non-empty text selection (FR-2, FR-3)", () => {
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
    });

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    expect(screen.getByText("Cut").closest("[data-disabled]")).toBeFalsy();
    expect(screen.getByText("Copy").closest("[data-disabled]")).toBeFalsy();
  });

  it("Cut and Paste render disabled when the editor is read-only", () => {
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
      editor.setEditable(false);
    });

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    expect(screen.getByText("Cut").closest("[data-disabled]")).toBeTruthy();
    expect(screen.getByText("Paste").closest("[data-disabled]")).toBeTruthy();
    // Copy is unaffected by read-only — only emptiness gates it.
    expect(screen.getByText("Copy").closest("[data-disabled]")).toBeFalsy();
  });

  it("Copy writes the selected text to the clipboard without modifying the document (FR-3)", async () => {
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
    });
    const before = editor.getText();

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    await act(async () => {
      fireEvent.click(screen.getByText("Copy"));
    });

    expect(clipboardWriteText).toHaveBeenCalledWith("Some");
    expect(editor.getText()).toBe(before);
  });

  it("Cut copies the selected text to the clipboard and deletes it, matching Cmd/Ctrl+X's resulting document (FR-2)", async () => {
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
    });

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    await act(async () => {
      fireEvent.click(screen.getByText("Cut"));
    });

    expect(clipboardWriteText).toHaveBeenCalledWith("Some");
    // Deleting ProseMirror positions 1-5 ("Some") from "Some document text"
    // leaves " document text" — identical to what a native Cmd/Ctrl+X would
    // produce for the same selection.
    expect(editor.getText()).toBe(" document text");
  });

  it("Paste replaces a non-empty captured selection with clipboard content at the captured range (FR-2, FR-3)", async () => {
    clipboardReadText.mockResolvedValue("REPLACED");
    const { editor } = renderWithContent();
    act(() => {
      editor.commands.setTextSelection({ from: 1, to: 5 });
    });

    openMenu(screen.getByTestId("prosemirror"));
    act(() => vi.runAllTimers());

    await act(async () => {
      fireEvent.click(screen.getByText("Paste"));
    });

    expect(clipboardReadText).toHaveBeenCalled();
    expect(editor.getText()).toBe("REPLACED document text");
  });

  describe("Bold/Italic/Underline/Strikethrough/Inline Code (FR-4, Task 5)", () => {
    const formattingCases: Array<{ label: string; markName: string }> = [
      { label: "Bold", markName: "bold" },
      { label: "Italic", markName: "italic" },
      { label: "Underline", markName: "underline" },
      { label: "Strikethrough", markName: "strike" },
      { label: "Inline Code", markName: "code" },
    ];

    for (const { label, markName } of formattingCases) {
      it(`toggles the ${markName} mark over the captured range, matching the toolbar's own toggle${markName === "strike" ? "Strike" : markName === "code" ? "Code" : markName[0].toUpperCase() + markName.slice(1)} command`, async () => {
        const { editor } = renderWithContent();
        act(() => {
          editor.commands.setTextSelection({ from: 1, to: 5 });
        });

        openMenu(screen.getByTestId("prosemirror"));
        act(() => vi.runAllTimers());

        expect(editor.isActive(markName)).toBe(false);

        await act(async () => {
          fireEvent.click(screen.getByText(label));
        });

        // Toggling turned the mark on across the captured range (1-5), the
        // same document state `editor.chain().focus().setTextSelection({from:1,to:5}).toggle<Mark>().run()`
        // (the toolbar's own call convention) would produce.
        act(() => editor.commands.setTextSelection({ from: 1, to: 5 }));
        expect(editor.isActive(markName)).toBe(true);
      });
    }

    it("renders Bold checked (active) for a selection already fully bold", () => {
      const { editor } = renderWithContent();
      act(() => {
        editor.commands.setTextSelection({ from: 1, to: 5 });
        editor.commands.toggleBold();
        editor.commands.setTextSelection({ from: 1, to: 5 });
      });
      expect(editor.isActive("bold")).toBe(true);

      openMenu(screen.getByTestId("prosemirror"));
      act(() => vi.runAllTimers());

      // Active state is rendered as a leading checkmark rather than the
      // format glyph (no checkbox primitive in the shared ContextMenu).
      const boldItem = screen
        .getByText("Bold")
        .closest('[role="menuitem"]') as HTMLElement;
      expect(boldItem.querySelector("svg.lucide-check")).toBeTruthy();
    });

    it("Bold/Italic/Underline/Strikethrough/Inline Code are unaffected by read-only, mirroring the toolbar's own canBold/canItalic/... gating (which never checks editability)", () => {
      const { editor } = renderWithContent();
      act(() => {
        editor.commands.setTextSelection({ from: 1, to: 5 });
        editor.setEditable(false);
      });

      openMenu(screen.getByTestId("prosemirror"));
      act(() => vi.runAllTimers());

      for (const { label } of formattingCases) {
        expect(screen.getByText(label).closest("[data-disabled]")).toBeFalsy();
      }
    });

    it("renders Bold disabled for a collapsed cursor exactly when the toolbar's own canBold predicate says so", () => {
      const { editor } = renderWithContent();
      act(() => {
        editor.commands.setTextSelection(1);
      });
      const toolbarCanBold = editor.can().chain().toggleBold().run();

      openMenu(screen.getByTestId("prosemirror"));
      act(() => vi.runAllTimers());

      const isBoldDisabled = Boolean(
        screen.getByText("Bold").closest("[data-disabled]"),
      );
      expect(isBoldDisabled).toBe(!toolbarCanBold);
    });
  });

  describe("Select All (FR-5, Task 6)", () => {
    it("selects the entire multi-paragraph document's text content, not just the originally captured range", async () => {
      const editor = mountEditor(
        "<p>First paragraph.</p><p>Second paragraph.</p><p>Third paragraph.</p>",
      );
      render(
        <EditorContextMenu editor={editor}>
          <EditorContent editor={editor} data-testid="prosemirror" />
        </EditorContextMenu>,
      );
      act(() => {
        editor.commands.setTextSelection({ from: 1, to: 5 });
      });

      openMenu(screen.getByTestId("prosemirror"));
      act(() => vi.runAllTimers());

      await act(async () => {
        fireEvent.click(screen.getByText("Select All"));
      });

      expect(editor.state.selection.from).toBe(0);
      expect(editor.state.selection.to).toBe(editor.state.doc.content.size);
    });

    it("renders Select All enabled even when the editor is read-only", () => {
      const { editor } = renderWithContent();
      act(() => {
        editor.setEditable(false);
      });

      openMenu(screen.getByTestId("prosemirror"));
      act(() => vi.runAllTimers());

      expect(
        screen.getByText("Select All").closest("[data-disabled]"),
      ).toBeFalsy();
    });
  });
});
