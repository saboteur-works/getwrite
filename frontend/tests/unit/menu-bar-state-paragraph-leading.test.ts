/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import type { EditorStateSnapshot } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import { menuBarStateSelector } from "../../components/Editor/MenuBar/menuBarState";
import { toolbarCommandSchema } from "../../components/Editor/MenuBar/toolbar-command-schema";

/**
 * Reader 3 of a stored `paragraphLeading` (FR-20): the toolbar state must apply
 * the single-value rule, so the legacy "1.5" stamp and null read as unset.
 */
const editors: Editor[] = [];

function leadingFor(paragraphLeading: unknown): number | null {
  const attrs =
    paragraphLeading === undefined ? undefined : { paragraphLeading };
  const content: JSONContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        ...(attrs ? { attrs } : {}),
        content: [{ type: "text", text: "text" }],
      },
    ],
  };
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: baseSchemaExtensions,
    content,
  });
  editors.push(editor);
  editor.commands.setTextSelection(2);
  return menuBarStateSelector({ editor } as EditorStateSnapshot<Editor>)
    .getWriteParagraphLeading;
}

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
});

describe("menuBarStateSelector getWriteParagraphLeading", () => {
  it('reports unset for the legacy string "1.5"', () => {
    expect(leadingFor("1.5")).toBeNull();
  });

  it("reports unset for null and for an absent attribute", () => {
    expect(leadingFor(null)).toBeNull();
    expect(leadingFor(undefined)).toBeNull();
  });

  it("reports the number for a set value", () => {
    expect(leadingFor(1.2)).toBe(1.2);
    expect(leadingFor(1.5)).toBe(1.5);
  });

  it('reports the number for a legacy string other than "1.5"', () => {
    expect(leadingFor("1.2")).toBe(1.2);
  });

  it("reports unset for an invalid stored value", () => {
    expect(leadingFor("abc")).toBeNull();
    expect(leadingFor(-1)).toBeNull();
  });
});

describe("Line Height control value reads without writing (FR-21)", () => {
  function controlFor(
    paragraphLeading: unknown,
    projectLineHeight?: string,
  ): { shown: string; unchanged: boolean } {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: baseSchemaExtensions,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            ...(paragraphLeading === undefined
              ? {}
              : { attrs: { paragraphLeading } }),
            content: [{ type: "text", text: "text" }],
          },
        ],
      },
    });
    editors.push(editor);
    editor.commands.setTextSelection(2);
    const before = JSON.stringify(editor.getJSON());
    const item = toolbarCommandSchema
      .flatMap((g) => g.items)
      .find((i) => i.id === "line-height");
    if (!item || item.kind !== "input") throw new Error("no line-height item");
    const shown = item.getValue({
      editor,
      state: menuBarStateSelector({ editor } as EditorStateSnapshot<Editor>),
      editorConfig: {
        headings: {},
        body: projectLineHeight ? { lineHeight: projectLineHeight } : undefined,
      },
    });
    return { shown, unchanged: JSON.stringify(editor.getJSON()) === before };
  }

  it("shows the project line height 2.2 for an unset paragraph, document unchanged", () => {
    expect(controlFor(undefined, "2.2")).toEqual({
      shown: "2.2",
      unchanged: true,
    });
  });

  it("shows an explicit 1.2 over the project value", () => {
    expect(controlFor(1.2, "2.2").shown).toBe("1.2");
  });

  it("shows 1.8 with no project setting", () => {
    expect(controlFor(undefined).shown).toBe("1.8");
  });

  it('treats the legacy "1.5" stamp as unset and shows the project value', () => {
    expect(controlFor("1.5", "2.2").shown).toBe("2.2");
  });

  it("falls back to 1.8 when the project value is not a positive number", () => {
    expect(controlFor(undefined, "normal").shown).toBe("1.8");
  });
});
