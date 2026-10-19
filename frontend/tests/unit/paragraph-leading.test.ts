import { describe, it, expect } from "vitest";
import {
  readParagraphLeading,
  normalizeParagraphLeadingInDocument,
  displayedParagraphLeading,
  validateParagraphLeadingInput,
  LEADING_INPUT_ERROR,
  type LeadingJsonNode,
} from "../../src/lib/paragraph-leading";

describe("readParagraphLeading (FR-20 single-value rule)", () => {
  it("reads the legacy string '1.5' as unset", () => {
    expect(readParagraphLeading("1.5")).toBeNull();
  });

  it("reads a number as itself, including a deliberate 1.5", () => {
    expect(readParagraphLeading(1.5)).toBe(1.5);
    expect(readParagraphLeading(2)).toBe(2);
    expect(readParagraphLeading(0.5)).toBe(0.5);
  });

  it("reads another legacy string as the number it names", () => {
    expect(readParagraphLeading("1.2")).toBe(1.2);
  });

  it.each([
    ["abc", "abc"],
    ["'0'", "0"],
    ["'-1'", "-1"],
    ["empty string", ""],
    ["number 0", 0],
    ["number -1", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["null", null],
    ["undefined", undefined],
    ["object", { a: 1 }],
    ["array", [1.2]],
  ])("reads %s as unset", (_label, value) => {
    expect(readParagraphLeading(value)).toBeNull();
  });
});

function para(leading?: unknown): LeadingJsonNode {
  return {
    type: "paragraph",
    ...(leading === undefined ? {} : { attrs: { paragraphLeading: leading } }),
    content: [{ type: "text", text: "x" }],
  };
}

describe("normalizeParagraphLeadingInDocument", () => {
  it("removes legacy '1.5', converts legacy '1.2', keeps numbers and unset", () => {
    const doc: LeadingJsonNode = {
      type: "doc",
      content: [para(), para(1.2), para(2), para("1.5"), para("1.2")],
    };
    const out = normalizeParagraphLeadingInDocument(doc);
    const leadings = (out.content ?? []).map((n) => n.attrs?.paragraphLeading);
    expect(leadings).toEqual([undefined, 1.2, 2, undefined, 1.2]);
    expect(
      (out.content ?? [])[3].attrs !== undefined &&
        "paragraphLeading" in ((out.content ?? [])[3].attrs ?? {}),
    ).toBe(false);
  });

  it("removes an invalid stored value", () => {
    const out = normalizeParagraphLeadingInDocument({
      type: "doc",
      content: [para("abc"), para(0), para(null)],
    });
    for (const n of out.content ?? []) {
      expect(n.attrs?.paragraphLeading).toBeUndefined();
    }
  });

  it("does not mutate its input", () => {
    const doc: LeadingJsonNode = {
      type: "doc",
      content: [para("1.5"), para("1.2")],
    };
    const snapshot = JSON.parse(JSON.stringify(doc));
    normalizeParagraphLeadingInDocument(doc);
    expect(doc).toEqual(snapshot);
  });

  it("recurses into nested nodes", () => {
    const doc: LeadingJsonNode = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [para("1.5"), para("1.2")] }],
        },
        { type: "blockquote", content: [para("1.5")] },
      ],
    };
    const out = normalizeParagraphLeadingInDocument(doc);
    const item = out.content?.[0].content?.[0].content ?? [];
    expect(item[0].attrs?.paragraphLeading).toBeUndefined();
    expect(item[1].attrs?.paragraphLeading).toBe(1.2);
    expect(
      out.content?.[1].content?.[0].attrs?.paragraphLeading,
    ).toBeUndefined();
  });

  it("leaves non-paragraph nodes unchanged", () => {
    const heading: LeadingJsonNode = {
      type: "heading",
      attrs: { level: 2, paragraphLeading: "1.5" },
      content: [{ type: "text", text: "h" }],
    };
    const out = normalizeParagraphLeadingInDocument({
      type: "doc",
      content: [heading],
    });
    expect(out.content?.[0]).toEqual(heading);
  });
});

describe("displayedParagraphLeading (FR-21)", () => {
  it("prefers the explicit number", () => {
    expect(displayedParagraphLeading(1.2, "2.2")).toBe("1.2");
  });
  it("falls back to the project value, then 1.8", () => {
    expect(displayedParagraphLeading(null, "2.2")).toBe("2.2");
    expect(displayedParagraphLeading(null, undefined)).toBe("1.8");
    expect(displayedParagraphLeading(undefined, "normal")).toBe("1.8");
    expect(displayedParagraphLeading(null, "0")).toBe("1.8");
  });
});

describe("validateParagraphLeadingInput (FR-21)", () => {
  it("accepts any finite number above 0, with no floor", () => {
    for (const ok of ["1.2", "0.5", "2", "10"]) {
      expect(validateParagraphLeadingInput(ok)).toBeNull();
    }
  });
  it("refuses non-numeric, empty, zero and negative input", () => {
    for (const bad of ["abc", "", "0", "-1", "Infinity", "NaN"]) {
      expect(validateParagraphLeadingInput(bad)).toBe(LEADING_INPUT_ERROR);
    }
  });
});
