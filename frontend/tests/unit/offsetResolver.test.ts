import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { resolveOffsetToPosition } from "../../components/Editor/offset-resolver";

// Minimal schema covering every node type `resolveOffsetToPosition` has to
// reason about: paragraphs, headings (both contribute a synthetic "\n"
// after their content, per `tiptapToPlainText`), and `hardBreak` (a leaf
// inline node contributing zero plain-text characters while still
// occupying one ProseMirror position) — mirroring `wiki-link-decoration
// .test.ts`'s hand-rolled-schema precedent rather than pulling in the
// editor's full `baseSchemaExtensions`.
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*", toDOM: () => ["p", 0] },
    heading: { group: "block", content: "inline*", toDOM: () => ["h1", 0] },
    hardBreak: {
      group: "inline",
      inline: true,
      selectable: false,
      toDOM: () => ["br"],
    },
    text: { group: "inline" },
  },
});

function paragraphOf(
  ...content: Array<string | ProseMirrorNode>
): ProseMirrorNode {
  return schema.node(
    "paragraph",
    null,
    content.map((c) => (typeof c === "string" ? schema.text(c) : c)),
  );
}

describe("resolveOffsetToPosition", () => {
  it("resolves an offset in a single-paragraph document", () => {
    const doc = schema.node("doc", null, [paragraphOf("Hello")]);

    // doc content starts at pos 0; the paragraph's open token sits at 0,
    // so its text begins at pos 1.
    expect(resolveOffsetToPosition(doc, 0)).toBe(1); // "H"
    expect(resolveOffsetToPosition(doc, 4)).toBe(5); // "o"
  });

  it("resolves an offset after a hardBreak node, skipping the node-boundary position it occupies", () => {
    const doc = schema.node("doc", null, [
      paragraphOf("ab", schema.node("hardBreak"), "cd"),
    ]);

    // Plain text is "abcd" (hardBreak contributes no characters of its
    // own). "ab" occupies positions 1-2, the hardBreak occupies position 3
    // (contributing nothing to the plain-text offset space), and "cd"
    // begins at position 4 — offset 2 ("c") must resolve to 4, not 3.
    expect(resolveOffsetToPosition(doc, 2)).toBe(4); // "c"
    expect(resolveOffsetToPosition(doc, 3)).toBe(5); // "d"
  });

  it("resolves an offset in the second of several block nodes, skipping intervening node-boundary positions", () => {
    const doc = schema.node("doc", null, [
      paragraphOf("ab"),
      paragraphOf("cd"),
    ]);

    // Plain text is "ab\ncd" (5 chars: 'a','b','\n','c','d'). The first
    // paragraph occupies positions 0-3 (open at 0, "a" at 1, "b" at 2,
    // close at 3); the second paragraph's open token is at 4, so its text
    // starts at 5. Offset 2 is the synthetic "\n" and resolves to the
    // first paragraph's own end-of-content position (3); offset 3 ("c")
    // must resolve to 5, not simply offset+1, since positions 3 and 4 are
    // node-boundary tokens, not plain-text characters.
    expect(resolveOffsetToPosition(doc, 1)).toBe(2); // "b"
    expect(resolveOffsetToPosition(doc, 2)).toBe(3); // the synthetic "\n"
    expect(resolveOffsetToPosition(doc, 3)).toBe(5); // "c"
    expect(resolveOffsetToPosition(doc, 4)).toBe(6); // "d"
  });

  it("returns null for an offset at or beyond the document's own plain-text length", () => {
    const doc = schema.node("doc", null, [paragraphOf("Hello")]);

    // "Hello" is 5 characters (0-4); 5 is out of range.
    expect(resolveOffsetToPosition(doc, 5)).toBeNull();
    expect(resolveOffsetToPosition(doc, 100)).toBeNull();
  });

  it("returns null for a negative or non-integer offset rather than throwing", () => {
    const doc = schema.node("doc", null, [paragraphOf("Hello")]);

    expect(resolveOffsetToPosition(doc, -1)).toBeNull();
    expect(resolveOffsetToPosition(doc, 1.5)).toBeNull();
  });

  it("drops trailing synthetic newlines from an empty trailing paragraph, matching tiptapToPlainText's own trim", () => {
    const doc = schema.node("doc", null, [paragraphOf("Hello"), paragraphOf()]);

    // tiptapToPlainText trims trailing "\n"s, so the trailing empty
    // paragraph contributes no plain-text length at all — offset 5 is out
    // of range even though a literal node-boundary position exists there.
    expect(resolveOffsetToPosition(doc, 5)).toBeNull();
  });
});
