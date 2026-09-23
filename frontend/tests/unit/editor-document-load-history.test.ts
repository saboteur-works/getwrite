/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import type { Content } from "@tiptap/react";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import { loadDocumentIntoEditor } from "../../components/Editor/loadDocumentIntoEditor";

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
