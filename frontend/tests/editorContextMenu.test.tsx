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

describe("EditorContextMenu", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
});
