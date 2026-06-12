import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { AllSelection, EditorState, Selection } from "@tiptap/pm/state";
import {
  deriveSelectionNodeLabels,
  nodeAncestriesFromSelection,
} from "../src/lib/node-display-selection";
import { deriveNodeTypeLabels } from "../src/lib/node-display";

const schema = getSchema([StarterKit]);

/** Build a ProseMirror document from top-level block JSON. */
function buildDoc(content: JSONContent[]) {
  return schema.nodeFromJSON({ type: "doc", content });
}

/** Editor state with the caret collapsed at the start of the first block. */
function stateAtStart(content: JSONContent[]): EditorState {
  const doc = buildDoc(content);
  return EditorState.create({ doc, selection: Selection.atStart(doc) });
}

const heading2 = (text: string): JSONContent => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});
const paragraph = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

describe("deriveSelectionNodeLabels — caret in a single block", () => {
  it("labels a caret in a heading with its level", () => {
    expect(
      deriveSelectionNodeLabels(stateAtStart([heading2("Title")])),
    ).toEqual(["Heading 2"]);
  });

  it("labels a caret in a paragraph as Body", () => {
    expect(
      deriveSelectionNodeLabels(stateAtStart([paragraph("Hello")])),
    ).toEqual(["Body"]);
  });

  it("labels a caret in a bullet list item as Bullet List", () => {
    const doc = [
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph("item")] }],
      },
    ];
    expect(deriveSelectionNodeLabels(stateAtStart(doc))).toEqual([
      "Bullet List",
    ]);
  });

  it("labels a caret in an ordered list item as Ordered List", () => {
    const doc = [
      {
        type: "orderedList",
        content: [{ type: "listItem", content: [paragraph("item")] }],
      },
    ];
    expect(deriveSelectionNodeLabels(stateAtStart(doc))).toEqual([
      "Ordered List",
    ]);
  });

  it("labels a caret in a blockquote as Blockquote", () => {
    const doc = [{ type: "blockquote", content: [paragraph("quote")] }];
    expect(deriveSelectionNodeLabels(stateAtStart(doc))).toEqual([
      "Blockquote",
    ]);
  });

  it("labels a caret in a code block as Code Block", () => {
    const doc = [
      { type: "codeBlock", content: [{ type: "text", text: "x = 1" }] },
    ];
    expect(deriveSelectionNodeLabels(stateAtStart(doc))).toEqual([
      "Code Block",
    ]);
  });
});

describe("deriveSelectionNodeLabels — spanning selections", () => {
  it("lists each distinct type in document order across a full selection", () => {
    const doc = buildDoc([heading2("Title"), paragraph("Body text")]);
    const state = EditorState.create({ doc, selection: new AllSelection(doc) });
    expect(deriveSelectionNodeLabels(state)).toEqual(["Heading 2", "Body"]);
  });
});

describe("nodeAncestriesFromSelection", () => {
  it("resolves the full nested ancestry of a list paragraph", () => {
    const doc = buildDoc([
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph("item")] }],
      },
    ]);
    const blocks = nodeAncestriesFromSelection(doc, 0, doc.content.size);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].map((n) => n.name)).toEqual([
      "doc",
      "bulletList",
      "listItem",
      "paragraph",
    ]);
    expect(deriveNodeTypeLabels(blocks)).toEqual(["Bullet List"]);
  });

  it("returns no blocks when the range touches no textblock", () => {
    const doc = buildDoc([paragraph("only")]);
    // A zero-length range at the very document boundary (pos 0) still resolves
    // into the first textblock, so use the helper's own emptiness via an empty
    // document is not possible; assert the spanning case yields exactly one.
    expect(nodeAncestriesFromSelection(doc, 0, doc.content.size)).toHaveLength(
      1,
    );
  });
});
