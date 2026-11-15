// Last Updated: 2026-11-14

/**
 * Feature 116, Task 23 (FR-11): anchor placement over a TipTap document.
 * One test per rule of the task's "Done when".
 */
import { describe, expect, it } from "vitest";
import {
  placeCitationAnchors,
  type CitationAnchor,
} from "../../src/lib/models/citations-anchor";
import type {
  TipTapDocument,
  TipTapMark,
  TipTapNode,
} from "../../src/lib/models/types";

const ann = (id: string): TipTapMark => ({ type: "annotation", attrs: { id } });
const t = (text: string, ...marks: TipTapMark[]): TipTapNode => ({
  type: "text",
  text,
  ...(marks.length === 0 ? {} : { marks }),
});
const doc = (...content: TipTapNode[]): TipTapDocument => ({
  type: "doc",
  content,
});
const para = (...content: TipTapNode[]): TipTapNode => ({
  type: "paragraph",
  content,
});
const cite = (annotationId: string) => ({ annotationId });

function textAt(d: TipTapDocument, a: CitationAnchor): string {
  let node: { content?: TipTapNode[]; text?: string } = d;
  for (const i of a.path) node = (node.content as TipTapNode[])[i];
  return node.text ?? "";
}

describe("placeCitationAnchors", () => {
  it("places the anchor at the end of the mark range", () => {
    const d = doc(para(t("A "), t("quick", ann("A1")), t(" fox")));
    const r = placeCitationAnchors(d, [cite("A1")], { noteStyle: true });
    expect(r.unplaced).toEqual([]);
    expect(r.placed).toHaveLength(1);
    const a = r.placed[0];
    expect(a.annotationId).toBe("A1");
    expect(a.path).toEqual([0, 1]);
    expect(a.offset).toBe(5);
    expect(textAt(d, a).slice(0, a.offset)).toBe("quick");
  });

  it.each([".", ",", ";", ":", "?", "!", '"', "'", "”", "’"])(
    "note style moves the anchor after %s",
    (ch) => {
      const d = doc(para(t("quick", ann("A1")), t(`${ch} next`)));
      const [a] = placeCitationAnchors(d, [cite("A1")], {
        noteStyle: true,
      }).placed;
      expect(a.path).toEqual([0, 1]);
      expect(a.offset).toBe(1);
      expect(textAt(d, a).slice(0, a.offset)).toBe(ch);
    },
  );

  it("does not move past punctuation when not a note style", () => {
    const d = doc(para(t("quick", ann("A1")), t(". next")));
    const [a] = placeCitationAnchors(d, [cite("A1")], {
      noteStyle: false,
    }).placed;
    expect(a.path).toEqual([0, 0]);
    expect(a.offset).toBe(5);
  });

  it("moves only one character and only when immediately following", () => {
    const d = doc(para(t("quick", ann("A1")), t(" . x")));
    const [a] = placeCitationAnchors(d, [cite("A1")], {
      noteStyle: true,
    }).placed;
    expect(a.path).toEqual([0, 0]);
    const d2 = doc(para(t("quick", ann("A1")), t(".. x")));
    const [b] = placeCitationAnchors(d2, [cite("A1")], {
      noteStyle: true,
    }).placed;
    expect(b.offset).toBe(1);
  });

  it("uses the last of several adjacent text nodes carrying the id", () => {
    const d = doc(
      para(
        t("Second ", ann("A3"), ann("A2")),
        t("end", ann("A3")),
        t(", more"),
      ),
    );
    const [a] = placeCitationAnchors(d, [cite("A3")], {
      noteStyle: true,
    }).placed;
    expect(a.path).toEqual([0, 2]);
    expect(a.offset).toBe(1);
  });

  it("steps past punctuation in a differently marked text node", () => {
    const d = doc(para(t("quick", ann("A1")), t("!", { type: "bold" })));
    const [a] = placeCitationAnchors(d, [cite("A1")], {
      noteStyle: true,
    }).placed;
    expect(a.path).toEqual([0, 1]);
    expect(a.offset).toBe(1);
  });

  it("handles a mark at the end of a node: no shift into the next block", () => {
    const d = doc(para(t("quick", ann("A1"))), para(t(". next")));
    const [a] = placeCitationAnchors(d, [cite("A1")], {
      noteStyle: true,
    }).placed;
    expect(a.path).toEqual([0, 0]);
    expect(a.offset).toBe(5);
  });

  it("does not shift across a non-text sibling", () => {
    const d = doc(para(t("quick", ann("A1")), { type: "hardBreak" }, t(". x")));
    const [a] = placeCitationAnchors(d, [cite("A1")], {
      noteStyle: true,
    }).placed;
    expect(a.path).toEqual([0, 0]);
  });

  it("finds marks in nested nodes with a full path", () => {
    const d = doc({
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [para(t("x "), t("deep", ann("A1")), t("."))],
        },
      ],
    });
    const [a] = placeCitationAnchors(d, [cite("A1")], {
      noteStyle: true,
    }).placed;
    expect(a.path).toEqual([0, 0, 0, 2]);
    expect(a.offset).toBe(1);
  });

  it("leaves a mark with no matching citation alone", () => {
    const d = doc(para(t("a", ann("A1")), t("b", ann("A2"))));
    const r = placeCitationAnchors(d, [cite("A2")], { noteStyle: true });
    expect(r.placed.map((p) => p.annotationId)).toEqual(["A2"]);
    expect(r.unplaced).toEqual([]);
  });

  it("returns a citation whose mark is absent as unplaced", () => {
    const d = doc(para(t("a", ann("A1"))));
    const items = [{ annotationId: "A1" }, { annotationId: "GONE" }];
    const r = placeCitationAnchors(d, items, { noteStyle: true });
    expect(r.placed.map((p) => p.annotationId)).toEqual(["A1"]);
    expect(r.unplaced).toEqual([items[1]]);
  });

  it("returns every citation as unplaced for an undefined document", () => {
    const r = placeCitationAnchors(undefined, [cite("A1")], {
      noteStyle: true,
    });
    expect(r.placed).toEqual([]);
    expect(r.unplaced).toEqual([cite("A1")]);
  });

  it("does not change the document or the passage text", () => {
    const d = doc(para(t("A "), t("quick", ann("A1")), t(". fox")));
    const before = JSON.stringify(d);
    placeCitationAnchors(d, [cite("A1")], { noteStyle: true });
    expect(JSON.stringify(d)).toBe(before);
  });

  it("orders placed anchors in document order", () => {
    const d = doc(para(t("a", ann("A2"))), para(t("b", ann("A1"))));
    const r = placeCitationAnchors(d, [cite("A1"), cite("A2")], {
      noteStyle: true,
    });
    expect(r.placed.map((p) => p.annotationId)).toEqual(["A2", "A1"]);
  });
});
