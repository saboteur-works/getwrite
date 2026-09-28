import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  convertPlainTextToTiptap,
  type PlainTextTipTapTextNode,
} from "../../src/lib/models/plaintext/txt-to-tiptap";

const FIXTURE_PATH = path.join(
  __dirname,
  "../fixtures/plaintext/single-document.txt",
);

const UTF8_BOM = "﻿";

/** Flattens every text node (excluding hardBreak nodes) across every paragraph, in order. */
function allTextNodes(
  doc: ReturnType<typeof convertPlainTextToTiptap>,
): PlainTextTipTapTextNode[] {
  return doc.content
    .flatMap((paragraph) => paragraph.content)
    .filter((node): node is PlainTextTipTapTextNode => node.type === "text");
}

describe("convertPlainTextToTiptap", () => {
  // done_when #1: a leading UTF-8 BOM is stripped before parsing.
  describe("leading UTF-8 BOM handling", () => {
    it("strips a leading BOM so the first text node's text does not contain it", () => {
      const result = convertPlainTextToTiptap(`${UTF8_BOM}Hello world.`);

      const nodes = allTextNodes(result);
      expect(nodes[0].text).not.toContain(UTF8_BOM);
      expect(nodes[0].text).toBe("Hello world.");
    });
  });

  // done_when #2: one or more consecutive blank lines collapse to a single
  // paragraph separator.
  describe("blank-line paragraph separation", () => {
    it("treats a single blank line as a paragraph separator", () => {
      const result = convertPlainTextToTiptap(
        "First paragraph.\n\nSecond paragraph.",
      );

      expect(result.content).toHaveLength(2);
    });

    it("collapses a run of multiple consecutive blank lines to the same single separator", () => {
      const result = convertPlainTextToTiptap(
        "First paragraph.\n\n\n\nSecond paragraph.",
      );

      expect(result.content).toHaveLength(2);
    });
  });

  // done_when #3: a single internal "\n" within a block is a soft wrap,
  // joined into the same paragraph as a hardBreak node.
  describe("internal soft-wrap handling", () => {
    it("joins a single internal newline into one paragraph as a hardBreak node", () => {
      const result = convertPlainTextToTiptap("first line\nsecond line");

      expect(result.content).toHaveLength(1);
      const content = result.content[0].content;
      expect(content.map((node) => node.type)).toEqual([
        "text",
        "hardBreak",
        "text",
      ]);
      expect((content[0] as PlainTextTipTapTextNode).text).toBe("first line");
      expect((content[2] as PlainTextTipTapTextNode).text).toBe("second line");
    });
  });

  // done_when #4: an empty or all-blank input is handled without throwing.
  describe("empty and all-blank input", () => {
    it("handles an empty string without throwing, producing a valid doc", () => {
      expect(() => convertPlainTextToTiptap("")).not.toThrow();
      const result = convertPlainTextToTiptap("");

      expect(result.type).toBe("doc");
      // The real implementation produces a single empty paragraph rather
      // than zero paragraphs for an all-blank/empty input.
      expect(result.content).toEqual([{ type: "paragraph", content: [] }]);
    });

    it("handles an all-blank-lines input without throwing, producing a valid doc", () => {
      expect(() => convertPlainTextToTiptap("\n\n\n")).not.toThrow();
      const result = convertPlainTextToTiptap("\n\n\n");

      expect(result.type).toBe("doc");
      expect(result.content).toEqual([{ type: "paragraph", content: [] }]);
    });
  });

  // done_when #5: multi-paragraph content produces one paragraph node per
  // block, in source order.
  describe("multi-paragraph content", () => {
    it("produces exactly one paragraph node per block, in source order", () => {
      const result = convertPlainTextToTiptap(
        "Alpha paragraph.\n\nBeta paragraph.\n\nGamma paragraph.",
      );

      expect(result.content).toHaveLength(3);
      const texts = result.content.map(
        (paragraph) => (paragraph.content[0] as PlainTextTipTapTextNode).text,
      );
      expect(texts).toEqual([
        "Alpha paragraph.",
        "Beta paragraph.",
        "Gamma paragraph.",
      ]);
    });
  });

  // BOM-stripping + multi-paragraph + soft-wrap combined, against the real
  // committed fixture.
  describe("the single-document.txt fixture (BOM + multi-paragraph + soft wrap)", () => {
    const rawContent = readFileSync(FIXTURE_PATH, "utf8");
    const result = convertPlainTextToTiptap(rawContent);

    it("strips the BOM from the first paragraph's first text node", () => {
      const nodes = allTextNodes(result);
      expect(nodes[0].text).not.toContain(UTF8_BOM);
      expect(nodes[0].text).toBe("Chapter One");
    });

    it("produces four paragraphs in source order", () => {
      expect(result.content).toHaveLength(4);
    });

    it("joins the soft-wrapped line in the second paragraph with a hardBreak node", () => {
      const secondParagraph = result.content[1];
      const types = secondParagraph.content.map((node) => node.type);
      expect(types).toEqual(["text", "hardBreak", "text"]);
      expect((secondParagraph.content[0] as PlainTextTipTapTextNode).text).toBe(
        "This is the first paragraph of the story. It has a soft wrap",
      );
      expect((secondParagraph.content[2] as PlainTextTipTapTextNode).text).toBe(
        "right here, joining two lines into one paragraph.",
      );
    });
  });
});
