import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import type { DecorationSet } from "@tiptap/pm/view";
import { buildWikiLinkDecorations } from "../../components/Editor/Extensions/WikiLinkDecoration";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*", toDOM: () => ["p", 0] },
    text: { group: "inline" },
  },
});

function docOf(...paragraphs: string[]) {
  return schema.node(
    "doc",
    null,
    paragraphs.map((p) =>
      schema.node("paragraph", null, p.length > 0 ? [schema.text(p)] : []),
    ),
  );
}

function decorationRanges(
  set: DecorationSet,
): Array<{ from: number; to: number }> {
  return set
    .find()
    .map((d) => ({ from: d.from, to: d.to }))
    .sort((a, b) => a.from - b.from);
}

describe("WikiLinkDecoration", () => {
  it("decorates a single [[Target]] occurrence", () => {
    const doc = docOf("see [[Foo]] here");
    const ranges = decorationRanges(buildWikiLinkDecorations(doc));
    expect(ranges).toHaveLength(1);
    // doc starts at pos 0, paragraph open at 0, text begins at 1 → "see " is 4 chars
    expect(ranges[0]).toEqual({ from: 5, to: 12 });
  });

  it("decorates multiple wiki links in the same paragraph", () => {
    const doc = docOf("[[A]] and [[B]]");
    const ranges = decorationRanges(buildWikiLinkDecorations(doc));
    expect(ranges).toHaveLength(2);
  });

  it("ignores text without wiki links", () => {
    const doc = docOf("nothing to decorate here");
    expect(decorationRanges(buildWikiLinkDecorations(doc))).toEqual([]);
  });

  it("does not match unbalanced or empty brackets", () => {
    const doc = docOf("[[unclosed and [] and [[]]");
    const ranges = decorationRanges(buildWikiLinkDecorations(doc));
    // "[[]]" is empty content — regex requires at least one non-]/non-newline char
    expect(ranges).toEqual([]);
  });

  it("does not span across paragraphs", () => {
    const doc = docOf("[[first]]", "[[second]]");
    const ranges = decorationRanges(buildWikiLinkDecorations(doc));
    expect(ranges).toHaveLength(2);
  });
});
