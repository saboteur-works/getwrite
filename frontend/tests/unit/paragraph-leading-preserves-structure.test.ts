/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import CustomHeading from "../../components/Editor/Extensions/CustomHeading";

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
    expect(paragraph?.attrs?.paragraphLeading).toBe("1.8");
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
