/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import CustomHeading from "../../components/Editor/Extensions/CustomHeading";
import {
  loadDocumentIntoEditor,
  normalizeStoredContent,
  settleCreatedEditor,
} from "../../components/Editor/loadDocumentIntoEditor";
import type { Content } from "@tiptap/react";
import { vi } from "vitest";

/**
 * `TipTapEditor`'s `onCreate` runs `selectAll().setParagraphLeading("1.5")`
 * over the whole document, and the toolbar's line-height control runs the same
 * command over the writer's selection. Neither is meant to change what the
 * blocks ARE.
 *
 * Measured before this was fixed: a document created as
 * `<h2>Opening</h2><p>…</p>` rendered as two paragraphs, because the command
 * was implemented with `setNode("paragraph", …)`, which converts the node type
 * rather than setting an attribute on it.
 */
const editors: Editor[] = [];

function mountWith(content: string): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  // `baseSchemaExtensions` alone has NO heading node: StarterKit disables it
  // and `TipTapEditor` registers `CustomHeading` separately. A harness without
  // it silently parses `<h2>` as a paragraph, which would make this file
  // measure nothing.
  const editor = new Editor({
    element,
    extensions: [
      ...baseSchemaExtensions,
      CustomHeading.configure({ customStyles: {} }),
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

const blockTypes = (editor: Editor): string[] =>
  editor.getJSON().content?.map((node) => node.type as string) ?? [];

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
});

describe("setParagraphLeading", () => {
  it("leaves a heading a heading", () => {
    const editor = mountWith("<h2>Opening</h2><p>The sun sets.</p>");
    expect(blockTypes(editor)).toEqual(["heading", "paragraph"]);

    editor.chain().selectAll().setParagraphLeading("1.8").run();

    expect(blockTypes(editor)).toEqual(["heading", "paragraph"]);
  });

  it("applies the leading to the paragraphs it spans", () => {
    const editor = mountWith("<h2>Opening</h2><p>The sun sets.</p>");

    editor.chain().selectAll().setParagraphLeading("1.8").run();

    const paragraph = editor
      .getJSON()
      .content?.find((node) => node.type === "paragraph");
    expect(paragraph?.attrs?.paragraphLeading).toBe(1.8);
  });

  it("preserves other structural blocks too", () => {
    const editor = mountWith(
      "<blockquote><p>Quoted.</p></blockquote><ul><li><p>Item</p></li></ul>",
    );
    const before = blockTypes(editor);

    editor.chain().selectAll().setParagraphLeading("1.8").run();

    expect(blockTypes(editor)).toEqual(before);
  });

  it("unsetParagraphLeading also leaves a heading a heading", () => {
    const editor = mountWith("<h2>Opening</h2><p>The sun sets.</p>");

    editor.chain().selectAll().unsetParagraphLeading().run();

    expect(blockTypes(editor)).toEqual(["heading", "paragraph"]);
  });
});

const leadings = (editor: Editor): unknown[] =>
  (editor.getJSON().content ?? [])
    .filter((node) => node.type === "paragraph")
    .map((node) => node.attrs?.paragraphLeading ?? null);

describe("paragraph leading attribute (FR-18, FR-20, FR-21)", () => {
  it("defaults to null and renders no inline line-height when unset", () => {
    const editor = mountWith("<p>One.</p>");
    expect(leadings(editor)).toEqual([null]);
    expect(editor.getHTML()).not.toMatch(/line-height/);
    expect(editor.getHTML()).not.toMatch(/style=/);
  });

  it("stores a JSON number when the command is given a numeric string", () => {
    const editor = mountWith("<p>One.</p>");
    expect(editor.chain().selectAll().setParagraphLeading("1.2").run()).toBe(
      true,
    );
    expect(leadings(editor)).toEqual([1.2]);
    expect(editor.getHTML()).toContain("line-height: 1.2");
  });

  it.each(["abc", "0", "-1", "", Number.NaN, Infinity])(
    "refuses %s and writes nothing",
    (value) => {
      const editor = mountWith("<p>One.</p><p>Two.</p>");
      const didRun = editor
        .chain()
        .selectAll()
        .setParagraphLeading(value)
        .run();
      expect(didRun).toBe(false);
      expect(leadings(editor)).toEqual([null, null]);
    },
  );

  it("renders no inline style for a stored non-finite or non-positive value", () => {
    const doc = (value: unknown) => ({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { paragraphLeading: value },
          content: [{ type: "text", text: "x" }],
        },
      ],
    });
    for (const bad of [0, -2, "abc", "1; color: red", null]) {
      const element = document.createElement("div");
      document.body.appendChild(element);
      const editor = new Editor({
        element,
        extensions: [...baseSchemaExtensions],
        content: doc(bad),
      });
      editors.push(editor);
      expect(editor.getHTML()).not.toMatch(/line-height/);
    }
  });

  it("reads pasted inline line-height through the shared rule", () => {
    expect(leadings(mountWith('<p style="line-height: 1.5">a</p>'))).toEqual([
      null,
    ]);
    expect(leadings(mountWith('<p style="line-height: 2">a</p>'))).toEqual([2]);
    expect(leadings(mountWith('<p style="line-height: normal">a</p>'))).toEqual(
      [null],
    );
  });

  it("sets every selected paragraph and unset restores null", () => {
    const editor = mountWith("<p>One.</p><p>Two.</p>");
    editor.chain().selectAll().setParagraphLeading("2").run();
    expect(leadings(editor)).toEqual([2, 2]);
    editor.chain().selectAll().unsetParagraphLeading().run();
    expect(leadings(editor)).toEqual([null, null]);
  });
});

/**
 * Stored content entering the editor (FR-19, FR-20 reader 1). Regression
 * tests for removing the `selectAll().setParagraphLeading("1.5")` stamp from
 * `TipTapEditor`'s `onCreate`. They are regression tests, not a fix: the Task 2
 * record in `specs/features/writer-project-types-and-paragraph-leading/
 * experiments.md` observed the second paragraph keeping its stored `"1.2"`
 * across a close and reopen on the unchanged tree.
 */
const storedDoc = (leadings: unknown[]): Content => ({
  type: "doc",
  content: leadings.map((leading, index) => ({
    type: "paragraph",
    ...(leading === undefined ? {} : { attrs: { paragraphLeading: leading } }),
    content: [{ type: "text", text: `Paragraph ${index + 1}.` }],
  })),
});

/** Mounts as `TipTapEditor` does: normalised creation content, then onCreate's settle step. */
function mountStored(content: Content): {
  editor: Editor;
  onUpdate: () => void;
} {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const onUpdate = vi.fn();
  const editor = new Editor({
    element,
    extensions: [...baseSchemaExtensions],
    content: normalizeStoredContent(content),
    onUpdate,
    onCreate: ({ editor: created }) => settleCreatedEditor(created),
  });
  editors.push(editor);
  return { editor, onUpdate };
}

describe("stored leading entering the editor", () => {
  it('only the legacy "1.5" changes at creation, and nothing is marked changed', () => {
    const stored = storedDoc([undefined, 1.2, 2, "1.5"]);
    const { editor, onUpdate } = mountStored(stored);
    expect(leadings(editor)).toEqual([null, 1.2, 2, null]);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('a pre-change fixture of all "1.5" loads with every paragraph unset', () => {
    const { editor, onUpdate } = mountStored(storedDoc(["1.5", "1.5", "1.5"]));
    expect(leadings(editor)).toEqual([null, null, null]);
    expect(editor.getHTML()).not.toMatch(/line-height/);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('a legacy "1.2" loads as the number 1.2 and renders 1.2', () => {
    const { editor } = mountStored(storedDoc(["1.5", "1.2", "1.5"]));
    expect(leadings(editor)).toEqual([null, 1.2, null]);
    expect(editor.getHTML()).toContain("line-height: 1.2");
    expect(editor.getHTML()).not.toContain("line-height: 1.5");
  });

  it("the same holds after an external content swap (opening a revision)", () => {
    const { editor, onUpdate } = mountStored(storedDoc([undefined]));
    loadDocumentIntoEditor(editor, storedDoc(["1.5", "1.2", 2, "1.5"]));
    expect(leadings(editor)).toEqual([null, 1.2, 2, null]);
    expect(editor.getHTML()).toContain("line-height: 1.2");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("passes string content through unchanged", () => {
    expect(normalizeStoredContent("<p>x</p>")).toBe("<p>x</p>");
  });
});
