/**
 * Feature 120, Task 11: pure eligibility decision for "Split at the cursor".
 * Offsets follow the stored plain text (`tiptapToPlainText`): the characters
 * of text nodes in document order plus one newline after each paragraph and
 * heading. Cut points follow `experiments/task-6.md`.
 */
import { describe, expect, it } from "vitest";
import {
  isMergedDocument,
  splitEligibility,
} from "../../src/lib/models/split-eligibility";
import {
  MERGED_MARK_SIDECAR_KEY,
  SPLIT_REFUSAL_REASONS,
} from "../../src/lib/models/split-types";
import type { TipTapDocument, TipTapNode } from "../../src/lib/models/types";

const p = (text: string): TipTapNode => ({
  type: "paragraph",
  content: text === "" ? [] : [{ type: "text", text }],
});
const doc = (...content: TipTapNode[]): TipTapDocument => ({
  type: "doc",
  content,
});
const textSidecar = { type: "text" } as const;

const ELIGIBLE = { eligible: true } as const;
const refused = (reason: string) => ({ eligible: false, reason });

describe("splitEligibility: refusals by document kind", () => {
  const body = doc(p("Hello world"));

  it("refuses an image resource", () => {
    expect(
      splitEligibility({
        document: body,
        sidecar: { type: "image" },
        offset: 5,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.mediaResource));
  });

  it("refuses an audio resource", () => {
    expect(
      splitEligibility({
        document: body,
        sidecar: { type: "audio" },
        offset: 5,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.mediaResource));
  });

  it("refuses a folder with its own reason", () => {
    expect(
      splitEligibility({
        document: null,
        sidecar: { type: "folder" },
        offset: 0,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.folder));
  });

  it("refuses a Source", () => {
    expect(
      splitEligibility({
        document: body,
        sidecar: { type: "source" },
        offset: 5,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.source));
  });

  it("refuses an entity document", () => {
    expect(
      splitEligibility({
        document: body,
        sidecar: { type: "text", entityKind: "character" },
        offset: 5,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.entityDocument));
  });

  it("refuses a document with the merged key present", () => {
    expect(
      splitEligibility({
        document: body,
        sidecar: { type: "text", [MERGED_MARK_SIDECAR_KEY]: { at: "x" } },
        offset: 5,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.mergedDocument));
  });

  it("gives each document-kind refusal a distinct reason", () => {
    const reasons = [
      { type: "image" },
      { type: "folder" },
      { type: "source" },
      { type: "text", entityKind: "k" },
      { type: "text", [MERGED_MARK_SIDECAR_KEY]: true },
    ].map((sidecar) =>
      JSON.stringify(splitEligibility({ document: body, sidecar, offset: 5 })),
    );
    expect(new Set(reasons).size).toBe(5);
  });

  it("an empty entityKind does not make an entity document", () => {
    expect(
      splitEligibility({
        document: body,
        sidecar: { type: "text", entityKind: "" },
        offset: 5,
      }),
    ).toEqual(ELIGIBLE);
  });
});

describe("isMergedDocument: the named seam", () => {
  it("returns false for a sidecar without the key", () => {
    expect(isMergedDocument({ type: "text" })).toBe(false);
  });

  it("returns true when the exported key is present", () => {
    expect(isMergedDocument({ [MERGED_MARK_SIDECAR_KEY]: { x: 1 } })).toBe(
      true,
    );
  });

  it("reads the key it is given, which proves the seam", () => {
    const sidecar = { otherKey: true };
    expect(isMergedDocument(sidecar)).toBe(false);
    expect(isMergedDocument(sidecar, "otherKey")).toBe(true);
    expect(isMergedDocument({ [MERGED_MARK_SIDECAR_KEY]: 1 }, "otherKey")).toBe(
      false,
    );
  });

  it("splitEligibility reads the predicate with the exported key by default", () => {
    expect(MERGED_MARK_SIDECAR_KEY).toBe("mergedMark");
    expect(
      splitEligibility({
        document: doc(p("abc def")),
        sidecar: { type: "text", mergedMark: 1 },
        offset: 3,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.mergedDocument));
  });
});

describe("splitEligibility: cursor in table cell and code block", () => {
  it("refuses a cursor inside a table cell", () => {
    const table: TipTapNode = {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [p("cell a")] },
            { type: "tableCell", content: [p("cell b")] },
          ],
        },
      ],
    };
    // "before\n" is 7 chars; "cell a" spans 7..13.
    const d = doc(p("before"), table, p("after"));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 10 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.cursorInTableCell));
  });

  it("refuses a cursor inside a table header cell", () => {
    const table: TipTapNode = {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableHeader", content: [p("head")] }],
        },
      ],
    };
    const d = doc(p("before"), table, p("after"));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 9 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.cursorInTableCell));
  });

  it("refuses a cursor inside a code block", () => {
    const code: TipTapNode = {
      type: "codeBlock",
      content: [{ type: "text", text: "line1\nline2" }],
    };
    // "intro\n" is 6 chars; the code block spans 6..17.
    const d = doc(p("intro"), code, p("outro"));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 10 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.cursorInCodeBlock));
  });

  it("table-cell and code-block refusals carry different reasons", () => {
    expect(SPLIT_REFUSAL_REASONS.cursorInTableCell).not.toBe(
      SPLIT_REFUSAL_REASONS.cursorInCodeBlock,
    );
  });
});

describe("splitEligibility: allowed cut points", () => {
  it("allows a cursor inside paragraph text", () => {
    expect(
      splitEligibility({
        document: doc(p("Hello world")),
        sidecar: textSidecar,
        offset: 5,
      }),
    ).toEqual(ELIGIBLE);
  });

  it("allows a cursor inside heading text", () => {
    const d = doc(
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Heading" }],
      },
      p("Body"),
    );
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 4 }),
    ).toEqual(ELIGIBLE);
  });

  it("allows a cursor inside blockquote text", () => {
    const d = doc({
      type: "blockquote",
      content: [p("quote one"), p("quote two")],
    });
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 5 }),
    ).toEqual(ELIGIBLE);
  });

  it("allows a cursor inside list-item text", () => {
    const d = doc({
      type: "bulletList",
      content: [
        { type: "listItem", content: [p("one")] },
        { type: "listItem", content: [p("two")] },
      ],
    });
    // "one\n" is 4 chars; "two" spans 4..7.
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 5 }),
    ).toEqual(ELIGIBLE);
  });

  it("allows a cut at a block boundary, at the end or at the start of the next block", () => {
    const d = doc(p("first"), p("second"));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 5 }),
    ).toEqual(ELIGIBLE);
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 6 }),
    ).toEqual(ELIGIBLE);
  });

  it("allows a cut next to a block image", () => {
    const image: TipTapNode = { type: "image", attrs: { src: "x" } };
    const d = doc(p("before"), image, p("after"));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 6 }),
    ).toEqual(ELIGIBLE);
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 7 }),
    ).toEqual(ELIGIBLE);
  });

  it("counts a block image as content of a half (assumption, see record)", () => {
    const image: TipTapNode = { type: "image", attrs: { src: "x" } };
    const d = doc(image, p("after"));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 0 }),
    ).toEqual(ELIGIBLE);
  });
});

describe("splitEligibility: empty halves", () => {
  it("refuses an empty first half at offset 0", () => {
    expect(
      splitEligibility({
        document: doc(p("text")),
        sidecar: textSidecar,
        offset: 0,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.emptyFirstHalf));
  });

  it("refuses a first half of only whitespace", () => {
    const d = doc(p("   "), p("text"));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 3 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.emptyFirstHalf));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 1 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.emptyFirstHalf));
  });

  it("refuses a first half of only empty paragraphs", () => {
    const d = doc(p(""), p(""), p("text"));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 2 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.emptyFirstHalf));
  });

  it("refuses an empty second half at the end of the text", () => {
    expect(
      splitEligibility({
        document: doc(p("text")),
        sidecar: textSidecar,
        offset: 4,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.emptySecondHalf));
  });

  it("refuses a second half of only whitespace", () => {
    const d = doc(p("text"), p("   "));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 4 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.emptySecondHalf));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 6 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.emptySecondHalf));
  });

  it("refuses a second half of only empty paragraphs", () => {
    const d = doc(p("text"), p(""), p(""));
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset: 4 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.emptySecondHalf));
  });

  it("refuses a document with no text, on the first half", () => {
    expect(
      splitEligibility({
        document: doc(p("")),
        sidecar: textSidecar,
        offset: 0,
      }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.emptyFirstHalf));
  });
});

describe("splitEligibility: offsets that cannot be located", () => {
  const d = doc(p("text"));
  it.each([-1, 1.5, Number.NaN, 99])("refuses offset %s as stale", (offset) => {
    expect(
      splitEligibility({ document: d, sidecar: textSidecar, offset }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.staleCursor));
  });

  it("refuses a text resource with no document as stale", () => {
    expect(
      splitEligibility({ document: null, sidecar: textSidecar, offset: 0 }),
    ).toEqual(refused(SPLIT_REFUSAL_REASONS.staleCursor));
  });

  it("does not mutate its inputs", () => {
    const input = {
      document: doc(p("Hello world")),
      sidecar: { type: "text" },
      offset: 5,
    };
    const before = JSON.stringify(input);
    splitEligibility(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
