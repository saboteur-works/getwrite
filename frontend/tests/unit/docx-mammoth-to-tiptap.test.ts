import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  convertDocxToTiptap,
  type DocxTipTapBlockNode,
  type DocxTipTapInlineNode,
  type DocxTipTapParagraphNode,
  type DocxTipTapHeadingNode,
} from "../../src/lib/models/docx/mammoth-to-tiptap";

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures", "docx");

function readFixture(name: string): Buffer {
  return readFileSync(path.join(FIXTURES_DIR, name));
}

function isHeading(node: DocxTipTapBlockNode): node is DocxTipTapHeadingNode {
  return node.type === "heading";
}

function isParagraph(node: DocxTipTapBlockNode): node is DocxTipTapParagraphNode {
  return node.type === "paragraph";
}

function flattenText(nodes: DocxTipTapInlineNode[]): string {
  return nodes
    .map((node) => (node.type === "text" ? node.text : ""))
    .join("");
}

/** Recursively collects every string found anywhere in a JSON-like value,
 * used to assert an unwanted substring (e.g. "<img") never appears anywhere
 * in the converted output, not just in a specific expected field. */
function collectAllStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectAllStrings(item, out));
    return;
  }
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach((item) => collectAllStrings(item, out));
  }
}

describe("convertDocxToTiptap", () => {
  it("converts headings and bold/italic marks (multi-heading.docx)", async () => {
    const result = await convertDocxToTiptap(readFixture("multi-heading.docx"));

    const headings = result.document.content.filter(isHeading);
    expect(headings.map((h) => [h.attrs.level, flattenText(h.content)])).toEqual([
      [1, "Chapter One"],
      [2, "A Section"],
      [3, "A Subsection"],
    ]);

    const paragraphs = result.document.content.filter(isParagraph);
    expect(paragraphs).toHaveLength(1);
    const runs = paragraphs[0].content.filter((node) => node.type === "text");
    const boldRun = runs.find((run) => run.text.includes("bold"));
    const italicRun = runs.find((run) => run.text.includes("italic"));
    expect(boldRun?.marks).toEqual([{ type: "bold" }]);
    expect(italicRun?.marks).toEqual([{ type: "italic" }]);

    expect(result.notes).toEqual([]);
  });

  it("renders footnote/endnote references as plain '[n]' text and returns ordered notes (footnotes-endnotes.docx)", async () => {
    const result = await convertDocxToTiptap(readFixture("footnotes-endnotes.docx"));

    const paragraphs = result.document.content.filter(isParagraph);
    expect(paragraphs).toHaveLength(1);
    const text = flattenText(paragraphs[0].content);
    expect(text).toContain("[1]");
    expect(text).toContain("[2]");

    // The reference markers carry no marks at all (FR-13/resolved OQ-1).
    const referenceNodes = paragraphs[0].content.filter(
      (node) => node.type === "text" && (node.text === "[1]" || node.text === "[2]"),
    );
    expect(referenceNodes).toHaveLength(2);
    referenceNodes.forEach((node) => {
      expect((node as { marks?: unknown }).marks).toBeUndefined();
    });

    expect(result.notes).toEqual([
      { n: 1, text: "This is the footnote text." },
      { n: 2, text: "This is the endnote text." },
    ]);
  });

  it("imports tracked-change content accepted-as-shown: insertions kept, deletions dropped (tracked-changes.docx)", async () => {
    const result = await convertDocxToTiptap(readFixture("tracked-changes.docx"));

    const paragraphs = result.document.content.filter(isParagraph);
    expect(paragraphs.length).toBeGreaterThan(0);
    const text = paragraphs.map((p) => flattenText(p.content)).join("\n");

    expect(text).toContain("Unchanged text.");
    expect(text).toContain("Inserted text.");
    expect(text).not.toContain("Deleted text.");
  });

  it("converts comment-anchored text without importing the comment itself, and never throws (comments.docx)", async () => {
    const result = await convertDocxToTiptap(readFixture("comments.docx"));

    const paragraphs = result.document.content.filter(isParagraph);
    expect(paragraphs.length).toBeGreaterThan(0);
    const text = paragraphs.map((p) => flattenText(p.content)).join("\n");

    expect(text).toContain("Commented text.");
    expect(text).not.toContain("This is a comment.");
    expect(result.document.content.length).toBeGreaterThan(0);
  });

  it("strips every image/embedded media element mammoth emits (with-image.docx)", async () => {
    const result = await convertDocxToTiptap(readFixture("with-image.docx"));

    const allStrings: string[] = [];
    collectAllStrings(result.document, allStrings);
    allStrings.forEach((value) => {
      expect(value.toLowerCase()).not.toContain("<img");
      expect(value.toLowerCase()).not.toContain("data:image");
    });

    function containsImageNode(nodes: unknown): boolean {
      if (Array.isArray(nodes)) {
        return nodes.some((node) => containsImageNode(node));
      }
      if (nodes !== null && typeof nodes === "object") {
        const record = nodes as Record<string, unknown>;
        if (record.type === "image") return true;
        return Object.values(record).some((value) => containsImageNode(value));
      }
      return false;
    }
    expect(containsImageNode(result.document)).toBe(false);
  });

  it("imports a document with no headings as a single section with no heading nodes (no-headings.docx)", async () => {
    const result = await convertDocxToTiptap(readFixture("no-headings.docx"));

    expect(result.document.content.every((node) => node.type === "paragraph")).toBe(true);
    const text = result.document.content
      .filter(isParagraph)
      .map((p) => flattenText(p.content))
      .join("\n");
    expect(text).toContain("First paragraph, no heading.");
    expect(text).toContain("Second paragraph, still no heading.");
  });

  it("collects mammoth's own conversion messages", async () => {
    const result = await convertDocxToTiptap(readFixture("multi-heading.docx"));
    expect(Array.isArray(result.messages)).toBe(true);
  });
});
