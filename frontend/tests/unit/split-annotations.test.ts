/**
 * Feature 120, Task 13: annotation partition and mark cut (FR-11). Each test
 * pins one clause of the task's "Done when". Documents are cut with the real
 * Task 12 `cutDocument`, so the mark behaviour at the cut is the measured one
 * (`experiments/task-6.md`).
 */
import { describe, expect, it } from "vitest";
import { collectAnnotationMarkIds } from "../../src/lib/models/annotation-mark-ids";
import { ANNOTATION_LIMITS } from "../../src/lib/models/annotation-validation";
import {
  partitionAnnotations,
  SPLIT_ANNOTATION_FAILURES,
  type SplitAnnotationsResult,
} from "../../src/lib/models/split-annotations";
import { cutDocument } from "../../src/lib/models/split-cut";
import type {
  Annotation,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";

type Partitioned = Extract<SplitAnnotationsResult, { outcome: "partitioned" }>;

const mark = (id: string) => [{ type: "annotation", attrs: { id } }];
const run = (value: string, id?: string): TipTapNode =>
  id
    ? { type: "text", text: value, marks: mark(id) }
    : { type: "text", text: value };
const para = (id: string, ...content: TipTapNode[]): TipTapNode => ({
  type: "paragraph",
  attrs: { id },
  content,
});

function note(id: string, extra: Partial<Annotation> = {}): Annotation {
  return {
    id,
    body: `body of ${id}`,
    quote: `quote of ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...extra,
  };
}

// Paragraph p1 is "aaa" (0-3), " " (3-4), "bbbbbb" (4-10); cut at offset 7
// falls inside the b run. Paragraph p2 is wholly after the cut.
function build(): { doc: TipTapDocument; offset: number } {
  return {
    doc: {
      type: "doc",
      content: [
        para("p1", run("aaa", "before"), run(" "), run("bbbbbb", "span")),
        para(
          "p2",
          run("after one", "after"),
          run(" and "),
          run("more", "after2"),
        ),
      ],
    },
    offset: 7,
  };
}

function cut(doc: TipTapDocument, offset: number) {
  const result = cutDocument(doc, offset);
  if (result.outcome !== "cut") throw new Error("cut failed");
  return result;
}

function run13(
  annotations: Annotation[],
  chosen: string[],
  built = build(),
): SplitAnnotationsResult {
  const { first, second } = cut(built.doc, built.offset);
  return partitionAnnotations({
    first,
    second,
    annotations,
    chosenIds: chosen,
  });
}

function ok(result: SplitAnnotationsResult): Partitioned {
  if (result.outcome !== "partitioned") {
    throw new Error(`expected partitioned, got ${JSON.stringify(result)}`);
  }
  return result;
}

const all = (): Annotation[] => [
  note("before"),
  note("span"),
  note("after"),
  note("after2"),
];

function nodeIds(d: TipTapDocument): string[] {
  const out: string[] = [];
  const walk = (n: TipTapNode): void => {
    if (typeof n.attrs?.id === "string") out.push(n.attrs.id);
    (n.content ?? []).forEach(walk);
  };
  d.content.forEach(walk);
  return out;
}

describe("partitionAnnotations", () => {
  it("an annotation wholly before the cursor stays unchanged", () => {
    const original = note("before", { quote: "q", body: "b" });
    const r = ok(run13([original], []));
    expect(r.originalAnnotations).toEqual([original]);
    expect(r.newAnnotations).toEqual([]);
    expect(r.classification.before).toEqual(["before"]);
    expect(collectAnnotationMarkIds(r.originalDocument)).toContain("before");
  });

  it("a chosen annotation wholly after moves with exact text, body, target and claim", () => {
    const moving = note("after", {
      body: "claim statement",
      quote: "after one",
      target: { sourceId: "src-1" } as Annotation["target"],
      claim: {
        status: "disputed",
        statusChangedAt: "2026-02-02T00:00:00.000Z",
      },
    });
    const r = ok(run13([note("before"), moving], ["after"]));
    expect(r.newAnnotations).toEqual([moving]);
    expect(r.originalAnnotations.map((a) => a.id)).toEqual(["before"]);
    expect(collectAnnotationMarkIds(r.newDocument)).toEqual(new Set(["after"]));
    const text = (n: TipTapNode): string =>
      (n.marks?.some((m) => m.attrs?.id === "after") ? (n.text ?? "") : "") +
      (n.content ?? []).map(text).join("");
    expect(text(r.newDocument as unknown as TipTapNode)).toBe("after one");
  });

  it("an unchosen annotation wholly after stays, detached, quote and body unchanged", () => {
    const stay = note("after", { quote: "after one", body: "kept body" });
    const r = ok(run13([stay], []));
    expect(r.originalAnnotations).toEqual([stay]);
    expect(r.newAnnotations).toEqual([]);
    expect(collectAnnotationMarkIds(r.originalDocument).has("after")).toBe(
      false,
    );
    expect(collectAnnotationMarkIds(r.newDocument).has("after")).toBe(false);
  });

  it("a spanning annotation stays with the original, mark shrunk, quote unchanged, never duplicated", () => {
    const span = note("span", { quote: "bbbbbb" });
    const r = ok(run13([span], ["span"]));
    expect(r.originalAnnotations).toEqual([span]);
    expect(r.newAnnotations).toEqual([]);
    expect(r.classification.spanning).toEqual(["span"]);
    const marked = (n: TipTapNode): string =>
      (n.marks?.some((m) => m.attrs?.id === "span") ? (n.text ?? "") : "") +
      (n.content ?? []).map(marked).join("");
    expect(marked(r.originalDocument as unknown as TipTapNode)).toBe("bbb");
    expect(collectAnnotationMarkIds(r.newDocument).has("span")).toBe(false);
  });

  it("no annotation id is shared between the two lists or the two documents' marks", () => {
    const r = ok(run13(all(), ["after", "after2", "span"]));
    const kept = new Set(r.originalAnnotations.map((x) => x.id));
    for (const n of r.newAnnotations) expect(kept.has(n.id)).toBe(false);
    const m1 = collectAnnotationMarkIds(r.originalDocument);
    const m2 = collectAnnotationMarkIds(r.newDocument);
    for (const id of m2) expect(m1.has(id)).toBe(false);
    expect([...kept, ...r.newAnnotations.map((x) => x.id)].sort()).toEqual([
      "after",
      "after2",
      "before",
      "span",
    ]);
  });

  it("strips in the new document the marks of annotations not carried, orphan marks included", () => {
    const built = build();
    built.doc.content.push(para("p3", run("orphan", "ghost")));
    const r = ok(run13(all(), ["after"], built));
    expect(collectAnnotationMarkIds(r.newDocument)).toEqual(new Set(["after"]));
    // after2 and the orphan mark; the spanning mark's second part as well.
    expect(r.strippedMarkCount).toBe(3);
  });

  it("the strip keeps every node id of its input (none restored, regenerated or shared)", () => {
    const built = build();
    const { first, second } = cut(built.doc, built.offset);
    const r = ok(
      partitionAnnotations({
        first,
        second,
        annotations: all(),
        chosenIds: [],
      }),
    );
    expect(nodeIds(r.newDocument)).toEqual(nodeIds(second));
    const originalIds = new Set(nodeIds(built.doc));
    for (const id of nodeIds(r.newDocument))
      expect(originalIds.has(id)).toBe(false);
    expect(nodeIds(r.originalDocument)).toEqual(nodeIds(first));
  });

  it("handles a note, a citation target and a claim the same, with no module input", () => {
    const r = ok(
      run13(
        [note("after"), note("after2", { target: { sourceId: "s" } as never })],
        ["after", "after2"],
      ),
    );
    expect(r.newAnnotations.map((a) => a.id)).toEqual(["after", "after2"]);
    const claim = ok(
      run13(
        [
          note("after", {
            claim: { status: "verified", statusChangedAt: "x" },
          }),
        ],
        ["after"],
      ),
    );
    expect(claim.newAnnotations[0].claim?.status).toBe("verified");
  });

  it("reports which annotations are anchored in the moving text and which stay because they span", () => {
    const r = ok(run13(all(), ["after"]));
    expect(r.classification).toEqual({
      before: ["before"],
      spanning: ["span"],
      after: ["after", "after2"],
      unanchored: [],
    });
  });

  it("an annotation with no mark is unanchored and stays; chosen, it fails naming the id", () => {
    const ghost = note("nomark");
    const stays = ok(run13([ghost], []));
    expect(stays.originalAnnotations).toEqual([ghost]);
    expect(stays.classification.unanchored).toEqual(["nomark"]);
    expect(run13([ghost], ["nomark"])).toEqual({
      outcome: "failed",
      reason: SPLIT_ANNOTATION_FAILURES.chosenWithoutPassage,
      annotationId: "nomark",
    });
  });

  it("a chosen id that is before or spanning stays, and is reported", () => {
    const r = ok(run13(all(), ["before", "span"]));
    expect(r.newAnnotations).toEqual([]);
    expect([...r.chosenButStayed].sort()).toEqual(["before", "span"]);
  });

  it("a chosen id with no annotation, and a duplicate annotation id, fail naming the id", () => {
    expect(run13(all(), ["missing"])).toEqual({
      outcome: "failed",
      reason: SPLIT_ANNOTATION_FAILURES.unknownChosenId,
      annotationId: "missing",
    });
    expect(run13([note("after"), note("after")], [])).toEqual({
      outcome: "failed",
      reason: SPLIT_ANNOTATION_FAILURES.duplicateAnnotationId,
      annotationId: "after",
    });
  });

  it("cannot exceed the 500 limit in either list", () => {
    const over = Array.from(
      { length: ANNOTATION_LIMITS.maxPerResource + 1 },
      (_, i) => note(`n${i}`),
    );
    expect(run13(over, [])).toEqual({
      outcome: "failed",
      reason: SPLIT_ANNOTATION_FAILURES.overLimit,
      annotationId: null,
    });
    const full = Array.from(
      { length: ANNOTATION_LIMITS.maxPerResource },
      (_, i) => note(`n${i}`),
    );
    const r = ok(run13(full, []));
    expect(r.originalAnnotations.length + r.newAnnotations.length).toBe(500);
  });

  it("does not modify its inputs", () => {
    const built = build();
    const { first, second } = cut(built.doc, built.offset);
    const snap = JSON.stringify({ first, second });
    const anns = all();
    const annSnap = JSON.stringify(anns);
    partitionAnnotations({
      first,
      second,
      annotations: anns,
      chosenIds: ["after"],
    });
    expect(JSON.stringify({ first, second })).toBe(snap);
    expect(JSON.stringify(anns)).toBe(annSnap);
  });
});
