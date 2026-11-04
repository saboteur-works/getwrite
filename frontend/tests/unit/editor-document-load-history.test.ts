/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import type { Content } from "@tiptap/react";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import {
  loadDocumentIntoEditor,
  settleCreatedEditor,
} from "../../components/Editor/loadDocumentIntoEditor";

/**
 * A resource's content as it arrives from disk — the `value` the editor's
 * content-sync effect loads on a resource or revision switch.
 */
const loadedDocument: Content = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Prose the writer wrote yesterday." }],
    },
  ],
};

/**
 * `prosemirror-history` groups adjacent changes into one undoable event for
 * `newGroupDelay` (500ms by default). A probe that loads and types inside the
 * same millisecond therefore collapses both into a single event and cannot
 * distinguish "undo crossed the load boundary" from "undo removed the typing":
 * the separation is what makes the assertion meaningful.
 */
const HISTORY_GROUP_DELAY_MS = 500;
const pastGroupDelay = () =>
  new Promise((resolve) => setTimeout(resolve, HISTORY_GROUP_DELAY_MS + 200));

const editors: Editor[] = [];

function mountEditor(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  // Mirrors the real mount: `value` has not resolved yet, so the editor is
  // created empty and the document arrives later through the sync effect.
  const editor = new Editor({
    element,
    extensions: baseSchemaExtensions,
    content: "",
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy();
  }
});

describe("loadDocumentIntoEditor", () => {
  it("leaves the loaded document standing when undo runs out", async () => {
    const editor = mountEditor();
    loadDocumentIntoEditor(editor, loadedDocument);
    expect(editor.getText()).toBe("Prose the writer wrote yesterday.");

    await pastGroupDelay();
    editor.commands.focus("end");
    editor.commands.insertContent(" An edit.");
    expect(editor.getText()).toBe("Prose the writer wrote yesterday. An edit.");

    // Undo far past the writer's own single edit.
    for (let i = 0; i < 10; i += 1) {
      editor.commands.undo();
    }

    // The writer's edit is gone; what they opened is still there. Before the
    // load was excluded from history this emptied the document, and autosave
    // wrote that empty document over the resource's only revision
    // (note_68cf31b0).
    expect(editor.getText()).toBe("Prose the writer wrote yesterday.");
    expect(editor.can().undo()).toBe(false);
  }, 20000);

  it("still undoes each of the writer's own edits, newest first", async () => {
    const editor = mountEditor();
    loadDocumentIntoEditor(editor, loadedDocument);

    await pastGroupDelay();
    editor.commands.focus("end");
    editor.commands.insertContent(" First.");

    await pastGroupDelay();
    editor.commands.insertContent(" Second.");
    expect(editor.getText()).toBe(
      "Prose the writer wrote yesterday. First. Second.",
    );

    editor.commands.undo();
    expect(editor.getText()).toBe("Prose the writer wrote yesterday. First.");

    editor.commands.undo();
    expect(editor.getText()).toBe("Prose the writer wrote yesterday.");
  }, 20000);

  it("does not carry one loaded document into the next", async () => {
    const editor = mountEditor();
    loadDocumentIntoEditor(editor, loadedDocument);

    await pastGroupDelay();
    editor.commands.focus("end");
    editor.commands.insertContent(" Edited.");

    await pastGroupDelay();
    // The writer selects a different resource.
    loadDocumentIntoEditor(editor, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Chapter two." }],
        },
      ],
    });

    for (let i = 0; i < 10; i += 1) {
      editor.commands.undo();
    }

    expect(editor.getText()).toBe("Chapter two.");
  }, 20000);
});

/**
 * `settleCreatedEditor` runs in `TipTapEditor`'s `onCreate`. With a recorded
 * position it puts the selection back where the writer left it
 * (`specs/features/editor-position-memory.md`, FR-3, FR-5). These use a real
 * headless editor, as the tests above do, created with its content the way
 * `TipTapEditor` is once the document has loaded.
 */
describe("settleCreatedEditor", () => {
  const twoParagraphs: Content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "First paragraph of the chapter." }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Second paragraph, where I was." }],
      },
    ],
  };

  function createWith(
    content: Content,
    onUpdate: () => void = () => {},
  ): Editor {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: baseSchemaExtensions,
      content,
      onUpdate,
    });
    editors.push(editor);
    return editor;
  }

  it("puts the cursor at the start when there is no record, as before", () => {
    const editor = createWith(twoParagraphs);
    editor.commands.setTextSelection(20);
    settleCreatedEditor(editor);
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.empty).toBe(true);
  });

  it("restores a recorded cursor", () => {
    const editor = createWith(twoParagraphs);
    settleCreatedEditor(editor, { anchor: 40, head: 40 });
    expect(editor.state.selection.anchor).toBe(40);
    expect(editor.state.selection.head).toBe(40);
  });

  it("restores a recorded selection, keeping its direction", () => {
    const editor = createWith(twoParagraphs);
    settleCreatedEditor(editor, { anchor: 50, head: 36 });
    expect(editor.state.selection.anchor).toBe(50);
    expect(editor.state.selection.head).toBe(36);
  });

  it("moves a position past the end of a shorter document to the end", () => {
    const editor = createWith(twoParagraphs);
    const size = editor.state.doc.content.size;
    settleCreatedEditor(editor, { anchor: size + 100, head: size + 100 });
    // The last place text can go: just inside the last paragraph's end.
    expect(editor.state.selection.head).toBe(size - 1);
    expect(editor.state.selection.empty).toBe(true);
  });

  it("changes nothing in the document, emits no update and leaves nothing to undo", () => {
    let updates = 0;
    const editor = createWith(twoParagraphs, () => {
      updates += 1;
    });
    const before = editor.getJSON();
    settleCreatedEditor(editor, { anchor: 40, head: 45 });
    expect(editor.getJSON()).toEqual(before);
    expect(updates).toBe(0);
    expect(editor.can().undo()).toBe(false);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
  });
});
