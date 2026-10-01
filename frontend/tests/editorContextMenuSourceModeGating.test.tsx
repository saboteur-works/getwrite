import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import EditorContextMenu from "../components/Editor/EditorContextMenu";
import MarkdownSourceView from "../components/Editor/MarkdownSourceView";
import { baseSchemaExtensions } from "../components/Editor/editorExtensions";

/**
 * Regression coverage for FR-8 (Markdown source mode gating,
 * specs/features/editor-context-menu/tasks.md Task 7).
 *
 * `TipTapEditor.tsx` renders its rich/source modes as mutually exclusive
 * branches of a single ternary: `EditorContextMenu` wraps only the
 * `EditorContent` branch, and `MarkdownSourceView` is a fully separate
 * sibling branch that is never nested inside `EditorContextMenu`. This test
 * harness mirrors that exact ternary structure (rather than rendering the
 * real `TipTapEditor`, which force-mocks to a static HTML dump under
 * `VITEST=true` and therefore never mounts a real editor or this menu in a
 * test environment) with a real TipTap `Editor` instance, so the assertions
 * below exercise the same conditional-render contract production code uses.
 */
const editors: Editor[] = [];

function mountEditor(): Editor {
  const element = document.createElement("div");
  const editor = new Editor({
    element,
    extensions: baseSchemaExtensions,
    content: "<p>Some document text</p>",
  });
  editors.push(editor);
  return editor;
}

function ModeAwareHarness({
  mode,
  editor,
}: {
  mode: "rich" | "source";
  editor: Editor;
}) {
  return mode === "source" ? (
    <MarkdownSourceView
      value="Some document text"
      onChange={() => {}}
      onExitToRichText={() => {}}
    />
  ) : (
    <EditorContextMenu editor={editor}>
      <EditorContent
        editor={editor}
        data-testid="prosemirror"
        className="tiptap-editor-content"
      />
    </EditorContextMenu>
  );
}

describe("Markdown source mode gating (FR-8, Task 7)", () => {
  afterEach(() => {
    while (editors.length > 0) {
      editors.pop()?.destroy();
    }
  });

  it("renders the context-menu trigger and opens a menu on right-click in rich mode", () => {
    render(<ModeAwareHarness mode="rich" editor={mountEditor()} />);

    fireEvent.contextMenu(screen.getByTestId("prosemirror"));
    act(() => {});

    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("mounts no EditorContextMenu DOM at all in source mode", () => {
    render(<ModeAwareHarness mode="source" editor={mountEditor()} />);

    // The markdown textarea is present instead of the ProseMirror surface.
    expect(screen.getByTestId("markdown-source-view")).toBeTruthy();
    expect(screen.queryByTestId("prosemirror")).toBeNull();

    // No Radix context-menu machinery (trigger or content) is in the tree at
    // all — it isn't just closed, it was never mounted.
    expect(document.querySelector(".resource-context-menu")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("right-clicking the Markdown source textarea shows no menu from this feature", () => {
    render(<ModeAwareHarness mode="source" editor={mountEditor()} />);

    const textarea = screen.getByLabelText(/markdown source/i);
    const wasNotCancelled = fireEvent.contextMenu(textarea);
    act(() => {});

    // Nothing in this feature intercepts the event in source mode, so the
    // browser's native menu (or the textarea's own default behavior) is left
    // alone — the event's default action is not prevented.
    expect(wasNotCancelled).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("none of this feature's menu actions (Cut/Copy/Paste/formatting/Select All) are reachable in source mode", () => {
    render(<ModeAwareHarness mode="source" editor={mountEditor()} />);

    for (const label of [
      "Cut",
      "Copy",
      "Paste",
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline Code",
      "Select All",
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("switching from rich to source mode unmounts the menu rather than leaving it mounted off-screen", () => {
    const editor = mountEditor();
    const { rerender } = render(
      <ModeAwareHarness mode="rich" editor={editor} />,
    );
    expect(document.querySelector(".tiptap-editor-content")).toBeTruthy();

    rerender(<ModeAwareHarness mode="source" editor={editor} />);

    expect(screen.queryByTestId("prosemirror")).toBeNull();
    expect(document.querySelector(".resource-context-menu")).toBeNull();
    expect(screen.getByTestId("markdown-source-view")).toBeTruthy();
  });
});
