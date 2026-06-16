import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  documentToMarkdown,
  markdownToDocument,
} from "../../src/lib/export/markdown-serializer";

/**
 * Canonical GFM document exercising every construct Task 2 must round-trip:
 * headings, bold, italic, inline code, blockquote, unordered + ordered lists,
 * a fenced code block, a link, and a GFM table.
 */
const SAMPLE_MARKDOWN = [
  "# Heading 1",
  "",
  "## Heading 2",
  "",
  "A paragraph with **bold**, *italic*, and `inline code`.",
  "",
  "> A blockquote line.",
  "",
  "- bullet one",
  "- bullet two",
  "",
  "1. ordered one",
  "2. ordered two",
  "",
  "```",
  "const x = 1;",
  "```",
  "",
  "A [link](https://example.com) here.",
  "",
  "| Col A | Col B |",
  "| --- | --- |",
  "| 1 | 2 |",
].join("\n");

/** Recursively collect every `type` present in a TipTap JSON tree. */
function collectNodeTypes(
  node: JSONContent,
  out: Set<string> = new Set(),
): Set<string> {
  if (node.type) out.add(node.type);
  node.content?.forEach((child) => collectNodeTypes(child, out));
  return out;
}

/** Recursively collect every mark type present in a TipTap JSON tree. */
function collectMarkTypes(
  node: JSONContent,
  out: Set<string> = new Set(),
): Set<string> {
  node.marks?.forEach((mark) => {
    if (mark.type) out.add(mark.type);
  });
  node.content?.forEach((child) => collectMarkTypes(child, out));
  return out;
}

describe("markdown-serializer", () => {
  it("parses every required construct into the document schema", () => {
    const doc = markdownToDocument(SAMPLE_MARKDOWN);
    const nodeTypes = collectNodeTypes(doc);
    const markTypes = collectMarkTypes(doc);

    // Block-level constructs must each map to a schema node.
    expect(nodeTypes).toContain("heading");
    expect(nodeTypes).toContain("blockquote");
    expect(nodeTypes).toContain("bulletList");
    expect(nodeTypes).toContain("orderedList");
    expect(nodeTypes).toContain("codeBlock");
    expect(nodeTypes).toContain("table");

    // Inline marks must each be represented.
    expect(markTypes).toContain("bold");
    expect(markTypes).toContain("italic");
    expect(markTypes).toContain("code");
    expect(markTypes).toContain("link");
  });

  it("serializes a document back to non-empty GFM markdown", () => {
    const doc = markdownToDocument(SAMPLE_MARKDOWN);
    const markdown = documentToMarkdown(doc);

    expect(markdown).toContain("# Heading 1");
    expect(markdown).toContain("**bold**");
    expect(markdown).toContain("`inline code`");
    expect(markdown).toContain("https://example.com");
    // GFM table pipe syntax survives serialization.
    expect(markdown).toContain("| Col A | Col B |");
  });

  it("round-trips JSON -> Markdown -> JSON without structural loss", () => {
    const doc1 = markdownToDocument(SAMPLE_MARKDOWN);
    const markdown = documentToMarkdown(doc1);
    const doc2 = markdownToDocument(markdown);

    // A document re-derived from its own serialized markdown is structurally
    // identical: no construct dropped, reordered, or mutated on the round trip.
    expect(doc2).toEqual(doc1);
  });
});
