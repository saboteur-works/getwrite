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

/**
 * FR-4 requires that each of these constructs survives a Markdown -> rich text
 * -> Markdown round trip without loss. The whole-document round trip above
 * proves the set survives together; these per-construct cases isolate each one
 * so a regression names the specific construct that broke rather than failing
 * as one opaque object diff. The `node`/`mark` field asserts the construct was
 * actually parsed into the schema (not silently swallowed into plain text).
 */
const FR4_CONSTRUCTS: ReadonlyArray<{
  name: string;
  markdown: string;
  node?: string;
  mark?: string;
}> = [
  { name: "heading", markdown: "## Section heading", node: "heading" },
  { name: "bold", markdown: "A paragraph with **bold** text.", mark: "bold" },
  {
    name: "italic",
    markdown: "A paragraph with *italic* text.",
    mark: "italic",
  },
  { name: "blockquote", markdown: "> A quoted line.", node: "blockquote" },
  {
    name: "unordered list",
    markdown: ["- alpha", "- beta"].join("\n"),
    node: "bulletList",
  },
  {
    name: "ordered list",
    markdown: ["1. first", "2. second"].join("\n"),
    node: "orderedList",
  },
  {
    name: "code block",
    markdown: ["```", "const x = 1;", "```"].join("\n"),
    node: "codeBlock",
  },
  {
    name: "inline code",
    markdown: "A paragraph with `inline code` here.",
    mark: "code",
  },
  {
    name: "link",
    markdown: "A [link](https://example.com) here.",
    mark: "link",
  },
  {
    name: "GFM table",
    markdown: ["| Col A | Col B |", "| --- | --- |", "| 1 | 2 |"].join("\n"),
    node: "table",
  },
];

describe("markdown-serializer FR-4 per-construct round trip", () => {
  it.each(FR4_CONSTRUCTS)(
    "round-trips $name without structural loss",
    ({ markdown, node, mark }) => {
      const doc1 = markdownToDocument(markdown);

      // The construct must be present in the parsed schema, never dropped.
      if (node) expect(collectNodeTypes(doc1)).toContain(node);
      if (mark) expect(collectMarkTypes(doc1)).toContain(mark);

      const serialized = documentToMarkdown(doc1);
      const doc2 = markdownToDocument(serialized);

      // Markdown -> rich text -> Markdown -> rich text is stable: the construct
      // survives serialization and re-parsing with no structural change.
      expect(doc2).toEqual(doc1);
    },
  );
});
