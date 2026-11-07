/**
 * Feature 101, Task 13 (FR-21, OQ-14): the pure id-remap helper that copy,
 * duplicate and (Task 21) paste share. Every annotation id, in the sidecar
 * array and in the document marks, is replaced by a fresh one.
 */
import { describe, expect, it } from "vitest";
import { remapAnnotationIds } from "../../src/lib/models/annotation-remap";
import type {
  Annotation,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";

const T = "2026-11-04T00:00:00.000Z";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ORPHAN = "33333333-3333-4333-8333-333333333333";

function note(id: string, body: string, quote: string): Annotation {
  return { id, body, quote, createdAt: T, updatedAt: T };
}

function counter(): () => string {
  let n = 0;
  return () => `new-${++n}`;
}

function marked(text: string, ...ids: string[]): TipTapNode {
  return {
    type: "text",
    text,
    marks: ids.map((id) => ({ type: "annotation", attrs: { id } })),
  };
}

const DOC: TipTapDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "plain " },
        marked("overlap", A, B),
        { type: "text", text: " tail", marks: [{ type: "bold" }] },
      ],
    },
    { type: "paragraph", content: [marked("again", A)] },
  ],
};

describe("remapAnnotationIds", () => {
  it("gives every annotation a new id and copies body, quote and timestamps", () => {
    const out = remapAnnotationIds(
      [note(A, "body a", "overlap"), note(B, "body b", "overlap")],
      DOC,
      counter(),
    );
    expect(out.annotations).toEqual([
      note("new-1", "body a", "overlap"),
      note("new-2", "body b", "overlap"),
    ]);
  });

  it("remaps each mark to the same new id as its annotation, every occurrence", () => {
    const out = remapAnnotationIds(
      [note(A, "a", "q"), note(B, "b", "q")],
      DOC,
      counter(),
    );
    const paras = out.document!.content;
    expect(paras[0]!.content![1]!.marks).toEqual([
      { type: "annotation", attrs: { id: "new-1" } },
      { type: "annotation", attrs: { id: "new-2" } },
    ]);
    expect(paras[1]!.content![0]!.marks).toEqual([
      { type: "annotation", attrs: { id: "new-1" } },
    ]);
    expect(out.idMap.get(A)).toBe("new-1");
  });

  it("leaves text and non-annotation marks unchanged and does not mutate the input", () => {
    const before = JSON.stringify(DOC);
    const out = remapAnnotationIds([note(A, "a", "q")], DOC, counter());
    expect(JSON.stringify(DOC)).toBe(before);
    expect(out.document!.content[0]!.content![2]).toEqual(
      DOC.content[0]!.content![2],
    );
    expect(out.document!.content[0]!.content![0]).toEqual(
      DOC.content[0]!.content![0],
    );
  });

  it("keeps a body with no mark (detached) under a new id", () => {
    const out = remapAnnotationIds(
      [note(ORPHAN, "kept", "gone")],
      DOC,
      counter(),
    );
    expect(out.annotations).toEqual([note("new-1", "kept", "gone")]);
  });

  it("keeps a mark with no body, under a new id so no id is shared, text unchanged", () => {
    const doc: TipTapDocument = {
      type: "doc",
      content: [{ type: "paragraph", content: [marked("x", ORPHAN)] }],
    };
    const out = remapAnnotationIds([], doc, counter());
    expect(out.annotations).toEqual([]);
    expect(out.document!.content[0]!.content![0]).toEqual(marked("x", "new-1"));
  });

  it("returns the document undefined when none is given and never reuses a source id", () => {
    const out = remapAnnotationIds([note(A, "a", "q")], undefined);
    expect(out.document).toBeUndefined();
    expect(out.annotations[0]!.id).not.toBe(A);
  });

  it("leaves a mark without a string id untouched", () => {
    const doc: TipTapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "x", marks: [{ type: "annotation" }] },
          ],
        },
      ],
    };
    const out = remapAnnotationIds([], doc, counter());
    expect(out.document).toEqual(doc);
  });
});
