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

/** Flattens every text node (excluding hardBreak nodes) across every paragraph, in order. */
function allTextNodes(
  doc: ReturnType<typeof convertRtfToTiptap>["tiptap"],
): RtfTipTapTextNode[] {
  return doc.content
    .flatMap((paragraph) => paragraph.content)
    .filter((node): node is RtfTipTapTextNode => node.type === "text");
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

  // FR-14 amendment (2026-09-11): special-character mappings.
  describe("FR-14 amendment: special-character mappings", () => {
    it("converts \\emdash to an em dash", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 before\emdash after\par}`;
      expect(convertRtfToTiptap(rtf).plainText).toBe("before—after");
    });

    it("converts \\endash to an en dash", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 1900\endash 1910\par}`;
      expect(convertRtfToTiptap(rtf).plainText).toBe("1900–1910");
    });

    it("converts \\lquote and \\rquote to single curly quotes", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 \lquote quoted\rquote \par}`;
      expect(convertRtfToTiptap(rtf).plainText).toBe("‘quoted’");
    });

    it("converts \\ldblquote and \\rdblquote to double curly quotes", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 \ldblquote quoted\rdblquote \par}`;
      expect(convertRtfToTiptap(rtf).plainText).toBe("“quoted”");
    });

    it("converts \\bullet to a bullet character", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 \bullet  item\par}`;
      expect(convertRtfToTiptap(rtf).plainText).toBe("• item");
    });

    it("converts \\tab to a literal tab character", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 before\tab after\par}`;
      expect(convertRtfToTiptap(rtf).plainText).toBe("before\tafter");
    });
  });

  // FR-14 amendment: \line converts to a TipTap hardBreak node, distinct
  // from \par's new paragraph.
  describe("FR-14 amendment: \\line as a hardBreak node", () => {
    it("inserts a hardBreak node within the same paragraph rather than starting a new one", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 first line\line second line\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.tiptap.content).toHaveLength(1);
      const content = result.tiptap.content[0].content;
      expect(content.map((n) => n.type)).toEqual(["text", "hardBreak", "text"]);
      expect(result.plainText).toBe("first line\nsecond line");
    });
  });

  // FR-14 amendment: a list paragraph's own text is kept as an ordinary
  // paragraph; the \listtext marker text is discarded, not duplicated.
  describe("FR-14 amendment: list-item text handling", () => {
    it("discards the \\listtext marker text and keeps only the item's own paragraph text", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0\pard\ls1\ilvl0 {\listtext \'a7\tab }First item text\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.plainText).toBe("First item text");
      expect(result.droppedFeatures).toEqual([]);
    });
  });

  // FR-14 amendment: \super/\sub keep their text but are reported as
  // dropped formatting (no GetWrite mark exists for either).
  describe("FR-14 amendment: \\super/\\sub reporting", () => {
    it("keeps superscript text and reports it as dropped formatting", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 E=mc\super 2\nosupersub  end\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.plainText).toBe("E=mc2 end");
      const drop = result.droppedFeatures.find((f) => f.feature === "super");
      expect(drop).toBeDefined();
      expect(drop?.detail).toContain("2");
    });

    it("keeps subscript text and reports it as dropped formatting", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 H\sub 2\nosupersub O\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.plainText).toBe("H2O");
      const drop = result.droppedFeatures.find((f) => f.feature === "sub");
      expect(drop).toBeDefined();
      expect(drop?.detail).toContain("2");
    });
  });

  // FR-14 amendment: the named layout-only control words are recognized and
  // ignored silently — no text, no mark, no droppedFeatures entry.
  describe("FR-14 amendment: layout-only control words are silently ignored", () => {
    it("consumes page size/margins, font/charset selection, and cocoa-specific words with no report entry", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0\paperw12240\paperh15840\margl1440\margr1440\margt1440\margb1440\pardirnatural\partightenfactor0 \af0\loch\hich\dbch visible text\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.plainText).toBe("visible text");
      expect(result.droppedFeatures).toEqual([]);
    });
  });

  // FR-14 amendment: an unrecognized ignorable destination is skipped
  // silently, with no report entry (supersedes the pre-amendment behavior
  // of reporting it).
  describe("FR-14 amendment: unknown destination silent skip", () => {
    it("skips an unrecognized \\*-marked destination with no report entry", () => {
      const rtf = String.raw`{\rtf1\ansi\deff0 before{\*\someunknowndestination hidden text}after\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.plainText).toBe("beforeafter");
      expect(result.droppedFeatures).toEqual([]);
    });
  });

  // Task 21 (third fix pass, FR-8/FR-14 amendment, 2026-09-11): fixture and
  // test coverage for backslash-newline paragraph breaks, the general
  // `\'XX` hex-escape decode table, `\ucN` ANSI-fallback-byte discarding, and
  // `\deftab`/`\pardeftab` joining the silent-ignore list. These specify
  // Tasks 22-24's not-yet-implemented production behavior and are EXPECTED
  // TO FAIL (red) until those tasks land — see the task's `done_when`.
  describe("Task 21: backslash-newline paragraph breaks", () => {
    it("treats a bare backslash-newline as a paragraph break when there is no \\par at all", () => {
      const rtf =
        String.raw`{\rtf1\ansi\ansicpg1252\deftab720 first paragraph.` +
        "\\\n" +
        "second paragraph." +
        "\\\n" +
        `third paragraph.}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.tiptap.content).toHaveLength(3);
      expect(result.plainText).toBe(
        "first paragraph.\nsecond paragraph.\nthird paragraph.",
      );
    });

    it("treats a backslash-CRLF sequence as a paragraph break too", () => {
      const rtf =
        String.raw`{\rtf1\ansi\ansicpg1252\deftab720 first.` +
        "\\\r\n" +
        "second.}";
      const result = convertRtfToTiptap(rtf);

      expect(result.tiptap.content).toHaveLength(2);
      expect(result.plainText).toBe("first.\nsecond.");
    });

    it("does not treat an escaped literal backslash (\\\\) followed by a newline as a paragraph break", () => {
      // `\\` is one escaped literal backslash character; a newline
      // following it belongs to the surrounding text, not the escape, and
      // MUST NOT be read as a paragraph-breaking backslash-newline.
      const rtf =
        String.raw`{\rtf1\ansi\ansicpg1252\deftab720 before\\` +
        "\nafter.\\par}";
      const result = convertRtfToTiptap(rtf);

      expect(result.tiptap.content).toHaveLength(1);
      expect(result.plainText).toBe("before\\after.");
    });

    it("never mistakes a backslash-newline for a control word split across the line break", () => {
      // A control word only ever starts when a backslash is IMMEDIATELY
      // followed by a letter. A backslash followed by a raw newline is
      // always a paragraph break, even when the text that happens to
      // follow the newline looks like it could continue a control word's
      // name/parameter (here, digits that would look like a `\qc123`-style
      // parameter if merged) — it must be read as a break plus ordinary
      // literal text, never as a resumed/split control word.
      const rtf =
        String.raw`{\rtf1\ansi\ansicpg1252\deftab720 before.` +
        "\\\n" +
        String.raw`123 after.\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.tiptap.content).toHaveLength(2);
      expect(result.plainText).toBe("before.\n123 after.");
    });
  });

  describe("Task 21: mixing \\par and backslash-newline breaks", () => {
    it("treats both forms as paragraph breaks within the same document", () => {
      const rtf =
        String.raw`{\rtf1\ansi\ansicpg1252\deftab720 one.\par ` +
        "two." +
        "\\\n" +
        String.raw`three.\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.tiptap.content).toHaveLength(3);
      expect(result.plainText).toBe("one.\ntwo.\nthree.");
    });
  });

  // Task 21: the general `\ansicpg`-driven `\'XX` decode table (FR-14
  // amendment, third measured pass).
  describe("Task 21: \\'XX hex-escape decoding under \\ansicpg1252", () => {
    it("decodes a punctuation escape (\\'92, right single quote)", () => {
      const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deftab720 it\'92s here.\par}`;
      expect(convertRtfToTiptap(rtf).plainText).toBe("it\u2019s here.");
    });

    it("decodes an accented-letter escape (\\'e9, e-acute)", () => {
      const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deftab720 caf\'e9.\par}`;
      expect(convertRtfToTiptap(rtf).plainText).toBe("caf\u00e9.");
    });

    it("decodes the non-breaking-space escape (\\'a0)", () => {
      const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deftab720 end\'a0here.\par}`;
      expect(convertRtfToTiptap(rtf).plainText).toBe("end\u00a0here.");
    });

    it("drops a decoded C0 control-byte escape (\\'01) and records one report entry", () => {
      const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deftab720 before\'01after.\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.plainText).toBe("beforeafter.");
      expect(result.plainText).not.toMatch(/[\u0000-\u001f]/);
      // The exact `feature`/`detail` identifier this drop is reported under
      // is not yet fixed by any spec/code — the requirement is only that it
      // IS reported, once per affected document.
      const c0Drops = result.droppedFeatures.filter(
        (f) => /control/i.test(f.feature) || /control/i.test(f.detail),
      );
      expect(c0Drops).toHaveLength(1);
    });
  });

  // Task 21: `\ucN` ANSI-fallback-byte skip semantics.
  describe("Task 21: \\uN escape with an ANSI fallback under \\uc1", () => {
    it("decodes the \\uN escape and discards its \\'XX fallback byte without duplicating it", () => {
      const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deftab720 \uc1\u8217\'92 done.\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.plainText).toBe("\u2019 done.");
    });
  });

  // Task 21: \deftab/\pardeftab join the silent-ignore list.
  describe("Task 21: \\deftab/\\pardeftab are silently ignored", () => {
    it("consumes \\deftab and \\pardeftab with no text, mark, or report entry", () => {
      const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deftab720\pardeftab720\pard visible text.\par}`;
      const result = convertRtfToTiptap(rtf);

      expect(result.plainText).toBe("visible text.");
      expect(result.droppedFeatures).toEqual([]);
    });
  });

  // Task 21: end-to-end reads of the new fixture documents registered in
  // sample.scrivx under the Research folder.
  describe("Task 21: end-to-end fixture documents", () => {
    it("converts the backslash-newline-only fixture (DDDDDDDD-...) into three paragraphs", () => {
      const rtfBytes = loadFixtureRtf("DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD");
      const result = convertRtfToTiptap(rtfBytes);

      expect(result.tiptap.content).toHaveLength(3);
      expect(result.plainText).toBe(
        "First backslash-newline paragraph.\nSecond backslash-newline paragraph.\nThird and final paragraph, no trailing par.",
      );
      expect(result.droppedFeatures).toEqual([]);
    });

    it("converts the mixed \\par/backslash-newline fixture (EEEEEEEE-...) into three paragraphs", () => {
      const rtfBytes = loadFixtureRtf("EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE");
      const result = convertRtfToTiptap(rtfBytes);

      expect(result.tiptap.content).toHaveLength(3);
      expect(result.plainText).toBe(
        "Paragraph one uses par.\nParagraph two uses backslash-newline.\nParagraph three uses par again.",
      );
      expect(result.droppedFeatures).toEqual([]);
    });

    it("converts the hex-escape/layout-word fixture (FFFFFFFF-...) with decoded text and no deftab/pardeftab report entries", () => {
      const rtfBytes = loadFixtureRtf("FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF");
      const result = convertRtfToTiptap(rtfBytes);

      expect(result.tiptap.content).toHaveLength(1);
      expect(result.plainText).toBe(
        "Curly quote: it\u2019s a test. Accented: caf\u00e9. Non-breaking:end\u00a0here. Control:beforeafter. Fallback pair: \u2019 done.",
      );
      expect(result.plainText).not.toMatch(/[\u0000-\u001f]/);
      expect(
        result.droppedFeatures.some(
          (f) => f.feature.includes("deftab") || f.detail.includes("deftab"),
        ),
      ).toBe(false);
      expect(
        result.droppedFeatures.some(
          (f) =>
            f.feature.includes("pardeftab") || f.detail.includes("pardeftab"),
        ),
      ).toBe(false);
      // Only the single C0-control drop should be reported.
      expect(result.droppedFeatures).toHaveLength(1);
    });
  });

  // Task 14: re-run of Task 11's rebuilt fixture content.rtf bodies, as a
  // regression check that this converter's FR-14 amendment fixes did not
  // disturb conversion of the real fixture set.
  describe("re-run of the Task 11 fixture's content.rtf bodies", () => {
    const dataUuids = [
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB",
    ];

    it.each(dataUuids)(
      "converts %s without throwing or dropping features",
      (uuid) => {
        const rtfBytes = loadFixtureRtf(uuid);
        const result = convertRtfToTiptap(rtfBytes);

        expect(result.tiptap.type).toBe("doc");
        expect(result.droppedFeatures).toEqual([]);
        expect(result.plainText.length).toBeGreaterThan(0);
      },
    );
  });
});
