/**
 * Feature 121, Task 19 (FR-9): annotation carry and mark strip for a merge.
 */
import { describe, expect, it } from "vitest";
import {
  MERGE_ANNOTATION_FAILURES,
  groupAnnotationsForOffer,
  partitionMergeAnnotations,
  type MergeAnnotationAbsorbed,
} from "../../src/lib/models/merge-annotations";
import { collectAnnotationMarkIds } from "../../src/lib/models/annotation-mark-ids";
import { MERGE_REFUSAL_REASONS } from "../../src/lib/models/merge-types";
import type {
  Annotation,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";

function ann(id: string, extra: Partial<Annotation> = {}): Annotation {
  return {
    id,
    body: `body ${id}`,
    quote: `quote ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...extra,
  };
}

function marked(id: string, text: string): TipTapNode {
  return { type: "text", text, marks: [{ type: "annotation", attrs: { id } }] };
}

function doc(nodeId: string, ...runs: TipTapNode[]): TipTapDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", attrs: { id: nodeId }, content: runs }],
  };
}

const NOTE = ann("note");
const CITE = ann("cite", {
  body: "",
  target: { sourceId: "src-1", sourceName: "Source" },
});
const CLAIM = ann("claim", {
  claim: { status: "disputed", statusChangedAt: "2026-02-02T00:00:00.000Z" },
});

function absorbed(
  id = "a1",
  annotations: Annotation[] = [NOTE, CITE, CLAIM],
): MergeAnnotationAbsorbed {
  return {
    documentId: id,
    document: doc(
      `${id}-p`,
      marked("note", "n"),
      marked("cite", "c"),
      marked("claim", "k"),
    ),
    annotations,
  };
}

describe("partitionMergeAnnotations", () => {
  it("moves a chosen note, citation and claim to the target unchanged", () => {
    const r = partitionMergeAnnotations({
      targetAnnotations: [ann("t1")],
      absorbed: [absorbed()],
      chosenIds: ["note", "cite", "claim"],
    });
    if (r.outcome !== "partitioned") throw new Error(r.outcome);
    expect(r.targetAnnotations.map((a) => a.id)).toEqual([
      "t1",
      "note",
      "cite",
      "claim",
    ]);
    expect(r.targetAnnotations[2]).toEqual(CITE);
    expect(r.targetAnnotations[3].claim).toEqual(CLAIM.claim);
    expect(r.absorbed[0].annotations).toEqual([]);
  });

  it("keeps a moved mark in the appended text and strips it from the absorbed text", () => {
    const r = partitionMergeAnnotations({
      targetAnnotations: [],
      absorbed: [absorbed()],
      chosenIds: ["note", "claim"],
    });
    if (r.outcome !== "partitioned") throw new Error(r.outcome);
    const out = r.absorbed[0];
    expect([...collectAnnotationMarkIds(out.appendedDocument)].sort()).toEqual([
      "claim",
      "note",
    ]);
    expect([...collectAnnotationMarkIds(out.document)]).toEqual(["cite"]);
    const appended = collectAnnotationMarkIds(out.appendedDocument);
    for (const id of collectAnnotationMarkIds(out.document)) {
      expect(appended.has(id)).toBe(false);
    }
  });

  it("leaves an unchosen annotation in the absorbed list and strips its mark from the appended text only", () => {
    const r = partitionMergeAnnotations({
      targetAnnotations: [],
      absorbed: [absorbed()],
      chosenIds: ["note"],
    });
    if (r.outcome !== "partitioned") throw new Error(r.outcome);
    expect(r.absorbed[0].annotations).toEqual([CITE, CLAIM]);
    expect(collectAnnotationMarkIds(r.absorbed[0].appendedDocument)).toEqual(
      new Set(["note"]),
    );
    expect(collectAnnotationMarkIds(r.absorbed[0].document)).toEqual(
      new Set(["cite", "claim"]),
    );
  });

  it("with no choice moves nothing and strips every mark from the appended text", () => {
    const r = partitionMergeAnnotations({
      targetAnnotations: [],
      absorbed: [absorbed()],
      chosenIds: [],
    });
    if (r.outcome !== "partitioned") throw new Error(r.outcome);
    expect(r.targetAnnotations).toEqual([]);
    expect(r.absorbed[0].annotations).toEqual([NOTE, CITE, CLAIM]);
    expect(collectAnnotationMarkIds(r.absorbed[0].appendedDocument).size).toBe(
      0,
    );
    expect(r.absorbed[0].document).toEqual(absorbed().document);
  });

  it("leaves every node id and text unchanged and does not mutate its input", () => {
    const input = absorbed();
    const before = structuredClone(input);
    const r = partitionMergeAnnotations({
      targetAnnotations: [],
      absorbed: [input],
      chosenIds: ["note"],
    });
    if (r.outcome !== "partitioned") throw new Error(r.outcome);
    expect(input).toEqual(before);
    const ids = (d: TipTapDocument): unknown[] =>
      (d.content ?? []).map((n) => n.attrs?.id);
    expect(ids(r.absorbed[0].appendedDocument)).toEqual(["a1-p"]);
    expect(ids(r.absorbed[0].document)).toEqual(["a1-p"]);
    const textOf = (d: TipTapDocument): string =>
      (d.content?.[0].content ?? []).map((n) => n.text).join("");
    expect(textOf(r.absorbed[0].appendedDocument)).toBe("nck");
    expect(textOf(r.absorbed[0].document)).toBe("nck");
  });

  it("handles several absorbed documents and keeps selection order", () => {
    const b: MergeAnnotationAbsorbed = {
      documentId: "b1",
      document: doc("b1-p", marked("other", "o")),
      annotations: [ann("other")],
    };
    const r = partitionMergeAnnotations({
      targetAnnotations: [],
      absorbed: [absorbed(), b],
      chosenIds: ["cite", "other"],
    });
    if (r.outcome !== "partitioned") throw new Error(r.outcome);
    expect(r.targetAnnotations.map((x) => x.id)).toEqual(["cite", "other"]);
    expect(r.absorbed.map((x) => x.documentId)).toEqual(["a1", "b1"]);
  });

  it("refuses over the limit naming the counts", () => {
    const existing = Array.from({ length: 498 }, (_, i) => ann(`t${i}`));
    const r = partitionMergeAnnotations({
      targetAnnotations: existing,
      absorbed: [absorbed()],
      chosenIds: ["note", "cite", "claim"],
    });
    expect(r).toEqual({
      outcome: "refused",
      reason: MERGE_REFUSAL_REASONS.annotationLimit,
      annotationCounts: { existing: 498, incoming: 3, limit: 500 },
    });
  });

  it("allows exactly 500", () => {
    const existing = Array.from({ length: 497 }, (_, i) => ann(`t${i}`));
    const r = partitionMergeAnnotations({
      targetAnnotations: existing,
      absorbed: [absorbed()],
      chosenIds: ["note", "cite", "claim"],
    });
    expect(r.outcome).toBe("partitioned");
  });

  it("fails naming an unknown chosen id", () => {
    const r = partitionMergeAnnotations({
      targetAnnotations: [],
      absorbed: [absorbed()],
      chosenIds: ["nope"],
    });
    expect(r).toEqual({
      outcome: "failed",
      reason: MERGE_ANNOTATION_FAILURES.unknownChosenId,
      annotationId: "nope",
    });
  });

  it("fails naming a chosen annotation with no mark in its document", () => {
    const r = partitionMergeAnnotations({
      targetAnnotations: [],
      absorbed: [
        {
          documentId: "a1",
          document: doc("p", { type: "text", text: "plain" }),
          annotations: [NOTE],
        },
      ],
      chosenIds: ["note"],
    });
    expect(r).toEqual({
      outcome: "failed",
      reason: MERGE_ANNOTATION_FAILURES.chosenWithoutPassage,
      annotationId: "note",
    });
  });

  it("fails on an id shared with the target", () => {
    const r = partitionMergeAnnotations({
      targetAnnotations: [ann("note")],
      absorbed: [absorbed()],
      chosenIds: ["note"],
    });
    expect(r).toEqual({
      outcome: "failed",
      reason: MERGE_ANNOTATION_FAILURES.duplicateAnnotationId,
      annotationId: "note",
    });
  });

  it("fails on an absorbed list over the limit rather than guessing", () => {
    const many = Array.from({ length: 501 }, (_, i) => ann(`x${i}`));
    const r = partitionMergeAnnotations({
      targetAnnotations: [],
      absorbed: [{ documentId: "a1", document: doc("p"), annotations: many }],
      chosenIds: [],
    });
    expect(r).toMatchObject({
      outcome: "failed",
      reason: MERGE_ANNOTATION_FAILURES.overLimit,
    });
  });
});

describe("groupAnnotationsForOffer", () => {
  it("groups by absorbed document, then kind, keeping ids and bodies", () => {
    const groups = groupAnnotationsForOffer([
      absorbed("a1"),
      absorbed("b1", [ann("n2")]),
    ]);
    expect(groups.map((g) => g.documentId)).toEqual(["a1", "b1"]);
    expect(groups[0].notes).toEqual([{ id: "note", body: "body note" }]);
    expect(groups[0].citations).toEqual([{ id: "cite", body: "" }]);
    expect(groups[0].claims).toEqual([{ id: "claim", body: "body claim" }]);
    expect(groups[1].claims).toEqual([]);
    expect(groups[1].notes).toEqual([{ id: "n2", body: "body n2" }]);
  });

  it("treats a claim with a target as a claim", () => {
    const both = ann("c2", {
      target: { sourceId: "s" },
      claim: { status: "verified", statusChangedAt: "2026-01-01T00:00:00Z" },
    });
    const [g] = groupAnnotationsForOffer([absorbed("a1", [both])]);
    expect(g.claims.map((x) => x.id)).toEqual(["c2"]);
    expect(g.citations).toEqual([]);
  });
});
