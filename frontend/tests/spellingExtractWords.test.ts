/**
 * @module spellingExtractWords.test
 *
 * Task 28 (spell-checker): tests for the pure, engine-independent word
 * extraction in `src/lib/spelling/extract-words.ts` (FR-20, AC-9).
 */
import { describe, expect, it } from "vitest";
import { getSchema, Node as TiptapNode } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Math from "@tiptap/extension-mathematics";
import {
  extractTextBlocks,
  extractWords,
  findWordsInText,
} from "../src/lib/spelling/extract-words";

/** Test-only inline atom standing in for a mention node. */
const Mention = TiptapNode.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
});

const schema = getSchema([StarterKit, Image, Math, Mention]);

function doc(content: JSONContent[]) {
  return schema.nodeFromJSON({ type: "doc", content });
}

function para(...content: JSONContent[]): JSONContent {
  return { type: "paragraph", content };
}

function text(t: string, marks?: string[]): JSONContent {
  return marks
    ? { type: "text", text: t, marks: marks.map((type) => ({ type })) }
    : { type: "text", text: t };
}

function words(content: JSONContent[]): string[] {
  return extractWords(doc(content)).map((w) => w.word);
}

describe("extractWords", () => {
  it("returns plain words with exact document positions", () => {
    const d = doc([para(text("Hello brave world"))]);
    const out = extractWords(d);
    expect(out.map((w) => w.word)).toEqual(["Hello", "brave", "world"]);
    for (const w of out) {
      expect(d.textBetween(w.from, w.to)).toBe(w.word);
    }
    expect(out[0].from).toBe(1);
  });

  it("treats a word split by bold as one word", () => {
    const d = doc([
      para(text("un"), text("believ", ["bold"]), text("able end")),
    ]);
    const out = extractWords(d);
    expect(out.map((w) => w.word)).toEqual(["unbelievable", "end"]);
    expect(d.textBetween(out[0].from, out[0].to)).toBe("unbelievable");
  });

  it.each([
    ["hard break", { type: "hardBreak" }],
    ["image", { type: "image", attrs: { src: "a.png" } }],
    ["math", { type: "inlineMath", attrs: { latex: "x^2" } }],
    ["mention", { type: "mention" }],
  ] as Array<[string, JSONContent]>)(
    "treats text either side of a %s node as two words",
    (_label, node) => {
      const d = doc([para(text("foo"), node, text("bar"))]);
      const out = extractWords(d);
      expect(out.map((w) => w.word)).toEqual(["foo", "bar"]);
      for (const w of out) expect(d.textBetween(w.from, w.to)).toBe(w.word);
    },
  );

  it("skips text with the code mark and treats it as a boundary", () => {
    expect(
      words([para(text("foo"), text("bar", ["code"]), text("baz"))]),
    ).toEqual(["foo", "baz"]);
  });

  it("skips tokens with a digit or underscore, and single letters", () => {
    expect(words([para(text("abc123 snake_case 2nd a I fine x1 ok"))])).toEqual(
      ["fine", "ok"],
    );
  });

  it("skips URLs and emails but not neighbouring words", () => {
    expect(
      words([
        para(
          text(
            "see https://example.com/a?b=c and www.example.org or me@example.com now",
          ),
        ),
      ]),
    ).toEqual(["see", "and", "or", "now"]);
  });

  it("does not skip a word because a period joins two words", () => {
    expect(words([para(text("end.Then go"))])).toEqual(["end", "Then", "go"]);
  });

  it("normalises curly apostrophes and keeps positions", () => {
    const d = doc([para(text("don’t Aria's 'quoted'"))]);
    const out = extractWords(d);
    expect(out.map((w) => w.word)).toEqual(["don't", "Aria's", "quoted"]);
    expect(d.textBetween(out[0].from, out[0].to)).toBe("don’t");
    expect(d.textBetween(out[2].from, out[2].to)).toBe("quoted");
  });

  it("keeps a hyphenated token whole and exposes its parts with positions", () => {
    const d = doc([para(text("a well-known x-ray"))]);
    const out = extractWords(d);
    expect(out.map((w) => w.word)).toEqual(["well-known", "x-ray"]);
    const [wk, xr] = out;
    expect(wk.parts.map((p) => p.word)).toEqual(["well", "known"]);
    for (const p of wk.parts) expect(d.textBetween(p.from, p.to)).toBe(p.word);
    expect(xr.parts.map((p) => p.word)).toEqual(["ray"]);
    expect(extractWords(doc([para(text("plain"))]))[0].parts).toEqual([]);
  });

  it("extracts ALL-CAPS tokens of two or more letters", () => {
    expect(words([para(text("NASA said OK to A"))])).toEqual([
      "NASA",
      "said",
      "OK",
      "to",
    ]);
  });

  it("maps positions exactly across blocks and nested lists", () => {
    const d = doc([
      para(text("first line")),
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [para(text("nested "), text("item", ["italic"]))],
          },
        ],
      },
      { type: "heading", attrs: { level: 2 }, content: [text("Title here")] },
    ]);
    const out = extractWords(d);
    expect(out.map((w) => w.word)).toEqual([
      "first",
      "line",
      "nested",
      "item",
      "Title",
      "here",
    ]);
    for (const w of out) expect(d.textBetween(w.from, w.to)).toBe(w.word);
  });

  it("skips code blocks", () => {
    expect(
      words([
        { type: "codeBlock", content: [text("const zzz = 1")] },
        para(text("prose")),
      ]),
    ).toEqual(["prose"]);
  });

  it("handles astral characters without shifting positions", () => {
    const d = doc([para(text("😀 smile 😀 done"))]);
    const out = extractWords(d);
    expect(out.map((w) => w.word)).toEqual(["smile", "done"]);
    for (const w of out) expect(d.textBetween(w.from, w.to)).toBe(w.word);
  });

  it("returns nothing for an empty document", () => {
    expect(extractWords(doc([{ type: "paragraph" }]))).toEqual([]);
  });
});

describe("findWordsInText", () => {
  it("splits a multi-word name by the same rule", () => {
    expect(findWordsInText("Will Turner").map((w) => w.word)).toEqual([
      "Will",
      "Turner",
    ]);
    expect(findWordsInText("Jean-Luc O’Brien").map((w) => w.word)).toEqual([
      "Jean-Luc",
      "O'Brien",
    ]);
  });
});

describe("extractTextBlocks (Task 36)", () => {
  it("returns each checkable textblock's joined text with a position per character", () => {
    const d = doc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "teh " },
          { type: "text", text: "cat", marks: [{ type: "bold" }] },
        ],
      },
      { type: "codeBlock", content: [{ type: "text", text: "xyzzy" }] },
      { type: "paragraph", content: [{ type: "text", text: "ok" }] },
    ]);
    const blocks = extractTextBlocks(d);
    expect(blocks.map((b) => b.text)).toEqual(["teh cat", "ok"]);
    expect(blocks[0].positions).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(blocks[1].positions).toEqual([
      d.child(0).nodeSize + d.child(1).nodeSize + 1,
      d.child(0).nodeSize + d.child(1).nodeSize + 2,
    ]);
  });
});
