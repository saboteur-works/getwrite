/*
 * Feature 103, Task 28 (FR-21, FR-22, OQ-1): pure excerpt helpers and the
 * "no mark by design" predicate. New file; no existing file covers them.
 */
import { describe, expect, it } from "vitest";
import {
  buildAttachmentExcerptInput,
  buildTextExcerptInput,
  canReattachAnnotation,
  isDetachedAnnotation,
  isMarkLessByDesign,
} from "../../src/lib/models/excerpts";
import type { Annotation } from "../../src/lib/models/types";

const ID = "11111111-1111-4111-8111-111111111111";
const SOURCE = "22222222-2222-4222-8222-222222222222";
const ATT = "33333333-3333-4333-8333-333333333333";

function stored(over: Partial<Annotation>): Annotation {
  return {
    id: ID,
    body: "",
    quote: "",
    createdAt: "t",
    updatedAt: "t",
    ...over,
  };
}

describe("buildTextExcerptInput", () => {
  it("keeps the Source, the locator and the excerpted text", () => {
    const r = buildTextExcerptInput({
      id: ID,
      body: "note",
      quote: "the passage",
      sourceId: SOURCE,
      sourceName: "Diary",
      locator: { type: "page", value: "12" },
    });
    expect(r).toEqual({
      ok: true,
      value: {
        id: ID,
        body: "note",
        quote: "the passage",
        target: {
          sourceId: SOURCE,
          sourceName: "Diary",
          locator: { type: "page", value: "12" },
        },
      },
    });
  });
  it("allows an empty body and an absent sourceName and locator", () => {
    const r = buildTextExcerptInput({
      id: ID,
      body: "",
      quote: "q",
      sourceId: SOURCE,
    });
    expect(r).toEqual({
      ok: true,
      value: { id: ID, body: "", quote: "q", target: { sourceId: SOURCE } },
    });
  });
  it("refuses an empty quote (a text excerpt needs text) and a bad source id", () => {
    expect(
      buildTextExcerptInput({ id: ID, body: "", quote: "", sourceId: SOURCE })
        .ok,
    ).toBe(false);
    expect(
      buildTextExcerptInput({ id: ID, body: "", quote: "q", sourceId: "nope" })
        .ok,
    ).toBe(false);
  });
});

describe("buildAttachmentExcerptInput", () => {
  it("is { sourceId, attachmentId, locator } with an empty body and an empty quote", () => {
    const r = buildAttachmentExcerptInput({
      id: ID,
      sourceId: SOURCE,
      attachmentId: ATT,
      locator: { type: "timestamp", value: "01:02:03 (past the end is fine)" },
    });
    expect(r).toEqual({
      ok: true,
      value: {
        id: ID,
        body: "",
        quote: "",
        target: {
          sourceId: SOURCE,
          attachmentId: ATT,
          locator: {
            type: "timestamp",
            value: "01:02:03 (past the end is fine)",
          },
        },
      },
    });
  });
  it("refuses a missing locator, a blank locator value and a bad attachment id", () => {
    const base = { id: ID, sourceId: SOURCE, attachmentId: ATT };
    expect(
      buildAttachmentExcerptInput({ ...base, locator: undefined as never }).ok,
    ).toBe(false);
    expect(
      buildAttachmentExcerptInput({ ...base, locator: { value: "" } }).ok,
    ).toBe(false);
    expect(
      buildAttachmentExcerptInput({
        ...base,
        attachmentId: "x",
        locator: { value: "1" },
      }).ok,
    ).toBe(false);
  });
});

describe("no mark by design", () => {
  const markless = stored({
    target: { sourceId: SOURCE, attachmentId: ATT, locator: { value: "1" } },
  });
  const textCitation = stored({
    quote: "passage",
    target: { sourceId: SOURCE, attachmentId: ATT },
  });
  const plain = stored({ quote: "passage", body: "n" });

  it("is a target with an attachment and no passage", () => {
    expect(isMarkLessByDesign(markless)).toBe(true);
    expect(isMarkLessByDesign(textCitation)).toBe(false);
    expect(isMarkLessByDesign(plain)).toBe(false);
    expect(isMarkLessByDesign(stored({ target: { sourceId: SOURCE } }))).toBe(
      false,
    );
  });
  it("is never detached, with or without a mark, and re-attach is not offered", () => {
    expect(isDetachedAnnotation(markless, false)).toBe(false);
    expect(isDetachedAnnotation(markless, true)).toBe(false);
    expect(canReattachAnnotation(markless)).toBe(false);
  });
  it("leaves every other annotation as before: no mark means detached", () => {
    expect(isDetachedAnnotation(plain, false)).toBe(true);
    expect(isDetachedAnnotation(plain, true)).toBe(false);
    expect(isDetachedAnnotation(textCitation, false)).toBe(true);
    expect(canReattachAnnotation(plain)).toBe(true);
  });
});
