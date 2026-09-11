import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  convertRtfToTiptap,
  type RtfTipTapTextNode,
} from "../../src/lib/models/scrivener/rtf-to-tiptap";

const FIXTURE_ROOT = path.join(
  __dirname,
  "../fixtures/scrivener/sample.scriv/Files/Data",
);

function loadFixtureRtf(dataUuid: string): Buffer {
  return readFileSync(path.join(FIXTURE_ROOT, dataUuid, "content.rtf"));
}

/** Flattens every text node across every paragraph, in order. */
function allTextNodes(
  doc: ReturnType<typeof convertRtfToTiptap>["tiptap"],
): RtfTipTapTextNode[] {
  return doc.content.flatMap((paragraph) => paragraph.content);
}

describe("convertRtfToTiptap", () => {
  describe("the fixture covering bold/italic/unicode/HYPERLINK (66666666-...)", () => {
    const rtfBytes = loadFixtureRtf("66666666-6666-4666-8666-666666666666");
    const result = convertRtfToTiptap(rtfBytes);

    it("produces a single-paragraph TipTap doc", () => {
      expect(result.tiptap.type).toBe("doc");
      expect(result.tiptap.content).toHaveLength(1);
      expect(result.tiptap.content[0].type).toBe("paragraph");
    });

    it("marks the bold run with a bold mark and no other mark", () => {
      const nodes = allTextNodes(result.tiptap);
      const boldNode = nodes.find((n) => n.text === "bold");
      expect(boldNode).toBeDefined();
      expect(boldNode?.marks).toEqual([{ type: "bold" }]);
    });

    it("marks the italic run with an italic mark and no other mark", () => {
      const nodes = allTextNodes(result.tiptap);
      const italicNode = nodes.find((n) => n.text === "italic");
      expect(italicNode).toBeDefined();
      expect(italicNode?.marks).toEqual([{ type: "italic" }]);
    });

    it("decodes the \\uN Unicode escape and discards its fallback character", () => {
      // Source: "It舗's a placeholder..." -> "It" + U+2019 + "s a placeholder..."
      expect(result.plainText).toContain("It’s a placeholder paragraph");
      // The RTF fallback apostrophe following 舗 must be discarded, not
      // rendered literally alongside the decoded character.
      expect(result.plainText).not.toContain("It’'s");
    });

    it("converts the HYPERLINK run to plain, unmarked text", () => {
      expect(result.plainText).toContain("reference link");
      const nodes = allTextNodes(result.tiptap);
      const linkTextNode = nodes.find((n) =>
        n.text?.includes("reference link"),
      );
      expect(linkTextNode).toBeDefined();
      expect(linkTextNode?.marks ?? []).toEqual([]);
    });

    it("reports the HYPERLINK as a dropped feature with the URL and visible text", () => {
      const hyperlinkDrop = result.droppedFeatures.find(
        (f) => f.feature === "HYPERLINK",
      );
      expect(hyperlinkDrop).toBeDefined();
      expect(hyperlinkDrop?.detail).toContain("reference link");
      expect(hyperlinkDrop?.detail).toContain("https://example.com");
    });

    it("produces plain text with no formatting characters at all", () => {
      expect(result.plainText).not.toMatch(/[{}\\]/);
    });
  });

  describe("a plainer, paragraph-only fixture (55555555-...)", () => {
    const rtfBytes = loadFixtureRtf("55555555-5555-4555-8555-555555555555");
    const result = convertRtfToTiptap(rtfBytes);

    it("converts without throwing and yields a single unmarked paragraph", () => {
      expect(result.tiptap.content).toHaveLength(1);
      const nodes = allTextNodes(result.tiptap);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].marks ?? []).toEqual([]);
      expect(nodes[0].text).toContain(
        "A placeholder paragraph for Chapter One's own folder-level note.",
      );
    });

    it("reports no dropped features", () => {
      expect(result.droppedFeatures).toEqual([]);
    });

    it("matches the plain text content", () => {
      expect(result.plainText).toBe(
        "A placeholder paragraph for Chapter One's own folder-level note.",
      );
    });
  });

  it("accepts a string input identically to a Buffer input", () => {
    const rtfBytes = loadFixtureRtf("77777777-7777-4777-8777-777777777777");
    const fromBuffer = convertRtfToTiptap(rtfBytes);
    const fromString = convertRtfToTiptap(rtfBytes.toString("latin1"));

    expect(fromString.plainText).toBe(fromBuffer.plainText);
    expect(fromString.tiptap).toEqual(fromBuffer.tiptap);
    expect(fromString.droppedFeatures).toEqual(fromBuffer.droppedFeatures);
  });

  it("handles an unrecognized control word by dropping it and reporting a reason, not rendering it literally", () => {
    const rtf = String.raw`{\rtf1\ansi\deff0 plain \strike struck through\strike0  text\par}`;
    const result = convertRtfToTiptap(rtf);

    expect(result.plainText).not.toMatch(/\\strike/);
    expect(
      result.droppedFeatures.some((f) => f.feature === "control-word:strike"),
    ).toBe(true);
  });
});
