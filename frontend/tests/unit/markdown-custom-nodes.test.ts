import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  documentToMarkdown,
  markdownToDocument,
} from "../../src/lib/export/markdown-serializer";

/** Wrap nodes in a doc. */
function doc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

/** Depth-first search for the first node of a given type. */
function findNode(node: JSONContent, type: string): JSONContent | undefined {
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return undefined;
}

/** Collect the concatenated text content of a tree. */
function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

describe("markdown custom-node round trips", () => {
  it("round-trips the highlight mark via ==..== syntax", () => {
    const source = doc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "plain " },
          { type: "text", text: "lit", marks: [{ type: "highlight" }] },
        ],
      },
    ]);

    const md = documentToMarkdown(source);
    expect(md).toContain("==lit==");

    const back = markdownToDocument(md);
    const litNode = (back.content?.[0].content ?? []).find(
      (n) => n.text === "lit",
    );
    expect(litNode).toBeDefined();
    expect(litNode?.marks?.some((m) => m.type === "highlight")).toBe(true);
  });

  it("round-trips inline math via $..$ syntax", () => {
    const source = doc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "eq " },
          { type: "inlineMath", attrs: { latex: "x^2" } },
        ],
      },
    ]);

    const md = documentToMarkdown(source);
    expect(md).toContain("$x^2$");

    const back = markdownToDocument(md);
    expect(findNode(back, "inlineMath")?.attrs?.latex).toBe("x^2");
  });

  it("round-trips block math via $$..$$ syntax", () => {
    const source = doc([{ type: "blockMath", attrs: { latex: "\\int x" } }]);

    const md = documentToMarkdown(source);
    expect(md).toContain("$$");

    const back = markdownToDocument(md);
    expect(findNode(back, "blockMath")?.attrs?.latex).toBe("\\int x");
  });

  it("round-trips a plain image as Markdown image syntax", () => {
    const source = doc([
      { type: "image", attrs: { src: "https://x/y.png", alt: "cat" } },
    ]);

    const md = documentToMarkdown(source);
    expect(md).toContain("![cat](https://x/y.png)");

    const img = findNode(markdownToDocument(md), "image");
    expect(img?.attrs?.src).toBe("https://x/y.png");
    expect(img?.attrs?.alt).toBe("cat");
  });

  it("preserves the resourceId of a GetWrite image via inline HTML fallback", () => {
    const source = doc([
      {
        type: "image",
        attrs: { src: "/api/resource/abc/file", alt: "cat", resourceId: "abc" },
      },
    ]);

    const md = documentToMarkdown(source);
    // Falls back to inline HTML so the resourceId survives.
    expect(md).toContain('data-resource-id="abc"');

    const img = findNode(markdownToDocument(md), "image");
    expect(img).toBeDefined();
    expect(img?.attrs?.resourceId).toBe("abc");
    expect(img?.attrs?.src).toBe("/api/resource/abc/file");
    expect(img?.attrs?.alt).toBe("cat");
  });

  it("exports wiki links as literal [[Target]] (not backslash-escaped)", () => {
    const source = doc([
      {
        type: "paragraph",
        content: [{ type: "text", text: "see [[Target Page]] now" }],
      },
    ]);

    const md = documentToMarkdown(source);
    expect(md).toContain("[[Target Page]]");
    expect(md).not.toContain("\\[\\[");

    const back = markdownToDocument(md);
    expect(textOf(back)).toContain("[[Target Page]]");
  });

  it("preserves paragraph text content even though leading is presentational", () => {
    // paragraphLeading is line-height styling with no Markdown representation;
    // the paragraph and its text round-trip, the attribute is intentionally
    // normalized (a lossy-export warning candidate, not an HTML wrapper).
    const source = doc([
      {
        type: "paragraph",
        attrs: { paragraphLeading: "2.0" },
        content: [{ type: "text", text: "spaced out" }],
      },
    ]);

    const md = documentToMarkdown(source);
    expect(md).toContain("spaced out");

    const back = markdownToDocument(md);
    const para = findNode(back, "paragraph");
    expect(para).toBeDefined();
    expect(textOf(back)).toContain("spaced out");
  });
});
