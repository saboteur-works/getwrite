/**
 * @module SplitEditorShortcut.test
 *
 * Feature 120, FR-13: Mod+Shift+Enter with focus in the editor text opens the
 * split dialog. A real TipTap `Editor` is mounted because prosemirror-view
 * prevents every Enter keydown (keyCode 13) in the editor, which stops the
 * AppShell document handler (it requires `!defaultPrevented`) from firing; a
 * bare `document.dispatchEvent` test cannot see that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import SplitShortcutExtension from "../../components/Editor/Extensions/SplitShortcutExtension";
import { setSplitOpener } from "../../components/Split/splitOpenRequest";

const opener = vi.fn();
let editor: Editor;
let host: HTMLElement;
let documentLevelPrevented: boolean[];

const onDocumentKeyDown = (event: KeyboardEvent): void => {
  documentLevelPrevented.push(event.defaultPrevented);
};

function mount(withShortcut: boolean): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  editor = new Editor({
    element: host,
    extensions: [
      ...baseSchemaExtensions,
      ...(withShortcut ? [SplitShortcutExtension] : []),
    ],
    content: "<p>Hello world</p>",
  });
  editor.commands.setTextSelection(6);
}

function press(
  init: KeyboardEventInit,
  target: Element = editor.view.dom,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    keyCode: 13,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  opener.mockReset();
  opener.mockReturnValue("started");
  setSplitOpener(opener);
  documentLevelPrevented = [];
  document.addEventListener("keydown", onDocumentKeyDown);
});

afterEach(() => {
  document.removeEventListener("keydown", onDocumentKeyDown);
  setSplitOpener(null);
  editor.destroy();
  host.remove();
  vi.unstubAllEnvs();
});

describe("editor Mod+Shift+Enter (FR-13)", () => {
  it("without the editor shortcut, ProseMirror prevents the key before any document handler can act", () => {
    mount(false);
    press({ metaKey: true, shiftKey: true });
    expect(documentLevelPrevented).toEqual([true]);
    expect(opener).not.toHaveBeenCalled();
  });

  it.each([
    ["Cmd+Shift+Enter", { metaKey: true, shiftKey: true }],
    ["Ctrl+Shift+Enter", { ctrlKey: true, shiftKey: true }],
  ])("%s in the text opens the split dialog once", (_name, init) => {
    mount(true);
    const event = press(init);
    expect(opener).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not open on a key repeat", () => {
    mount(true);
    press({ metaKey: true, shiftKey: true, repeat: true });
    expect(opener).not.toHaveBeenCalled();
  });

  it("asks the host once and does not handle the key when there is no document", () => {
    opener.mockReturnValue("no-document");
    mount(true);
    press({ metaKey: true, shiftKey: true });
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it("does nothing on the native runtime", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    mount(true);
    press({ metaKey: true, shiftKey: true });
    expect(opener).not.toHaveBeenCalled();
  });

  it("does nothing from inside a dialog", () => {
    mount(true);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    dialog.appendChild(editor.view.dom);
    press({ metaKey: true, shiftKey: true });
    expect(opener).not.toHaveBeenCalled();
    dialog.remove();
  });

  it("does not open for Cmd+Alt+Shift+Enter, Cmd+Enter or plain Enter", () => {
    mount(true);
    press({ metaKey: true, altKey: true, shiftKey: true });
    press({ metaKey: true });
    press({});
    expect(opener).not.toHaveBeenCalled();
  });

  it("Shift+Enter still inserts a hard break", () => {
    mount(true);
    press({ shiftKey: true });
    expect(opener).not.toHaveBeenCalled();
    expect(editor.getHTML()).toContain("<br");
  });
});
