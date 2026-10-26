/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { baseSchemaExtensions } from "../components/Editor/editorExtensions";
import {
  applyReplacement,
  matchCapitalisation,
  STALE_REPLACEMENT_MESSAGE,
} from "../src/lib/spelling/apply-replacement";
import { toastService } from "../src/lib/toast-service";

const editors: Editor[] = [];

function mount(content: string): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: baseSchemaExtensions,
    content,
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (editors.length > 0) editors.pop()?.destroy();
});

// "<p>Hello wrold and teh</p>": wrold 7-12, teh 17-20
describe("matchCapitalisation", () => {
  it("lowercase word keeps the suggestion as is", () => {
    expect(matchCapitalisation("wrold", "world")).toBe("world");
    expect(matchCapitalisation("wrold", "World")).toBe("World");
  });
  it("initial capital capitalises the first letter", () => {
    expect(matchCapitalisation("Wrold", "world")).toBe("World");
  });
  it("all capitals upper-cases the suggestion", () => {
    expect(matchCapitalisation("WROLD", "world")).toBe("WORLD");
  });
  it("a single capital letter counts as initial capital, not all caps", () => {
    expect(matchCapitalisation("A", "an")).toBe("An");
  });
});

describe("applyReplacement", () => {
  it("replaces the word in one transaction and one undo restores it", () => {
    const editor = mount("<p>Hello wrold and teh</p>");
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const result = applyReplacement(
      editor,
      { from: 7, to: 12 },
      "wrold",
      "world",
    );
    expect(result).toBe("applied");
    const docChanging = dispatch.mock.calls.filter(([tr]) => tr.docChanged);
    expect(docChanging).toHaveLength(1);
    expect(editor.state.doc.textContent).toBe("Hello world and teh");
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe("Hello wrold and teh");
  });

  it("keeps the marks of the replaced text", () => {
    const editor = mount("<p>Hello <strong><em>wrold</em></strong> and</p>");
    applyReplacement(editor, { from: 7, to: 12 }, "wrold", "world");
    const node = editor.state.doc.nodeAt(7);
    expect(node?.text).toBe("world");
    expect(node?.marks.map((m) => m.type.name).sort()).toEqual([
      "bold",
      "italic",
    ]);
  });

  it("carries initial-capital and all-capital to the suggestion", () => {
    const a = mount("<p>Hello Wrold</p>");
    applyReplacement(a, { from: 7, to: 12 }, "Wrold", "world");
    expect(a.state.doc.textContent).toBe("Hello World");
    const b = mount("<p>Hello WROLD</p>");
    applyReplacement(b, { from: 7, to: 12 }, "WROLD", "world");
    expect(b.state.doc.textContent).toBe("Hello WORLD");
  });

  it("refuses, leaves the doc unchanged and toasts when the text changed", () => {
    const editor = mount("<p>Hello wrold and teh</p>");
    const toast = vi.spyOn(toastService, "info").mockReturnValue("t");
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const before = editor.state.doc;
    const result = applyReplacement(
      editor,
      { from: 7, to: 12 },
      "wrodl",
      "world",
    );
    expect(result).toBe("stale");
    expect(dispatch).not.toHaveBeenCalled();
    expect(editor.state.doc).toBe(before);
    expect(toast).toHaveBeenCalledWith(STALE_REPLACEMENT_MESSAGE);
  });

  it("refuses a range beyond the document", () => {
    const editor = mount("<p>Hi</p>");
    vi.spyOn(toastService, "info").mockReturnValue("t");
    expect(
      applyReplacement(editor, { from: 50, to: 55 }, "wrold", "world"),
    ).toBe("stale");
  });

  it("refuses when the editor is read-only", () => {
    const editor = mount("<p>Hello wrold</p>");
    editor.setEditable(false);
    expect(
      applyReplacement(editor, { from: 7, to: 12 }, "wrold", "world"),
    ).toBe("read-only");
    expect(editor.state.doc.textContent).toBe("Hello wrold");
  });

  it("returns focus to the editor without scrolling", async () => {
    const editor = mount("<p>Hello wrold</p>");
    const focus = vi.spyOn(editor.view, "focus");
    const dispatch = vi.spyOn(editor.view, "dispatch");
    applyReplacement(editor, { from: 7, to: 12 }, "wrold", "world");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(focus).toHaveBeenCalled();
    expect(dispatch.mock.calls.length).toBeGreaterThan(0);
    for (const [tr] of dispatch.mock.calls) {
      expect(tr.scrolledIntoView).toBe(false);
    }
  });
});
