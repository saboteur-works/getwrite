import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  collectMarkdownWarnings,
  serializeMarkdown,
  mergeMarkdownWarnings,
} from "../../src/lib/export/markdown-serializer";

function doc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

/** GFM-representable content that must produce no warnings. */
const CLEAN_DOC = doc([
  {
    type: "heading",
    attrs: { level: 1 },
    content: [{ type: "text", text: "Title" }],
  },
  {
    type: "paragraph",
    content: [
      { type: "text", text: "bold", marks: [{ type: "bold" }] },
      { type: "text", text: " and " },
      { type: "text", text: "lit", marks: [{ type: "highlight" }] },
      { type: "text", text: " and " },
      { type: "text", text: "[[Wiki]]" },
    ],
  },
  { type: "blockMath", attrs: { latex: "x^2" } },
]);

/** Document exercising each genuinely-lossy / HTML-fallback construct. */
const LOSSY_DOC = doc([
  {
    type: "image",
    attrs: { src: "/api/resource/abc/file", alt: "cat", resourceId: "abc" },
  },
  {
    type: "paragraph",
    attrs: { paragraphLeading: "2.0" },
    content: [{ type: "text", text: "spaced" }],
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "red",
        marks: [{ type: "textStyle", attrs: { color: "#ff0000" } }],
      },
    ],
  },
]);

describe("markdown warnings", () => {
  it("returns no warnings for GFM-representable content", () => {
    expect(collectMarkdownWarnings(CLEAN_DOC)).toEqual([]);
  });

  it("flags every lossy / HTML-fallback construct exactly once", () => {
    const warnings = collectMarkdownWarnings(LOSSY_DOC);
    const byConstruct = Object.fromEntries(
      warnings.map((w) => [w.construct, w]),
    );

    expect(Object.keys(byConstruct).sort()).toEqual([
      "image-link",
      "paragraph-leading",
      "text-style",
    ]);
    expect(byConstruct["image-link"].kind).toBe("html-fallback");
    expect(byConstruct["paragraph-leading"].kind).toBe("dropped");
    expect(byConstruct["text-style"].kind).toBe("dropped");
    expect(byConstruct["image-link"].count).toBe(1);
  });

  it("does not flag default or absent paragraph leading", () => {
    const d = doc([
      {
        type: "paragraph",
        attrs: { paragraphLeading: "1.5" },
        content: [{ type: "text", text: "default" }],
      },
      { type: "paragraph", content: [{ type: "text", text: "none" }] },
    ]);
    expect(collectMarkdownWarnings(d)).toEqual([]);
  });

  it("counts repeated occurrences of the same construct", () => {
    const d = doc([
      { type: "image", attrs: { src: "a", resourceId: "1" } },
      { type: "image", attrs: { src: "b", resourceId: "2" } },
    ]);
    const warnings = collectMarkdownWarnings(d);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].construct).toBe("image-link");
    expect(warnings[0].count).toBe(2);
  });

  it("serializeMarkdown returns markdown plus the warning list together", () => {
    const result = serializeMarkdown(LOSSY_DOC);
    expect(result.markdown).toContain('data-resource-id="abc"');
    expect(result.warnings.map((w) => w.construct).sort()).toEqual([
      "image-link",
      "paragraph-leading",
      "text-style",
    ]);
  });

  it("mergeMarkdownWarnings aggregates counts across documents", () => {
    const a = collectMarkdownWarnings(
      doc([{ type: "image", attrs: { src: "a", resourceId: "1" } }]),
    );
    const b = collectMarkdownWarnings(LOSSY_DOC);
    const merged = mergeMarkdownWarnings([a, b]);
    const image = merged.find((w) => w.construct === "image-link");
    expect(image?.count).toBe(2);
    // Distinct constructs from both inputs are preserved.
    expect(merged.map((w) => w.construct).sort()).toEqual([
      "image-link",
      "paragraph-leading",
      "text-style",
    ]);
  });
});
