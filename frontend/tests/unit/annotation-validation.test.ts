/**
 * Feature 101, Task 11 (FR-9 schema acceptance, FR-10 shape, FR-11
 * validation): the annotation sidecar shape, its boundary validators, the
 * `annotation` mark's acceptance by `TipTapNodeSchema`, and the pin that
 * `annotations` is not one of the client-writable sidecar keys.
 */
import { describe, expect, it } from "vitest";
import {
  ANNOTATION_LIMITS,
  validateAnnotationBody,
  validateAnnotationQuote,
  validateCarriedClaim,
  validateClaimStatement,
  validateNewAnnotation,
  validateNewClaim,
  validateUpdateClaim,
} from "../../src/lib/models/annotation-validation";
import { CLIENT_WRITABLE_SIDECAR_KEYS } from "../../src/lib/models/resource-crud-core";
import {
  AnnotationSchema,
  TextResourceSchema,
  TipTapDocumentSchema,
  TipTapNodeSchema,
} from "../../src/lib/models/schemas";
import type { Annotation, TextResource } from "../../src/lib/models/types";

const ID_A = "550e8400-e29b-41d4-a716-446655440010";
const ID_B = "550e8400-e29b-41d4-a716-446655440011";
const NOW = "2026-11-04T00:00:00.000Z";

function stored(id: string): Annotation {
  return { id, body: "b", quote: "q", createdAt: NOW, updatedAt: NOW };
}

describe("annotation shape (FR-10)", () => {
  it("is { id, body, quote, createdAt, updatedAt } plus an optional Source target (Feature 103); an unrelated key is stripped", () => {
    const parsed = AnnotationSchema.parse({
      ...stored(ID_A),
      anchor: { from: 1, to: 2 },
    });
    expect(Object.keys(parsed).sort()).toEqual(
      ["body", "createdAt", "id", "quote", "updatedAt"].sort(),
    );
  });

  it("the Annotation type has an optional target key", () => {
    const target: Annotation["target"] = undefined;
    expect(target).toBeUndefined();
  });

  it("round-trips through TextResourceSchema and is optional", () => {
    const base = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      slug: "r",
      name: "R",
      type: "text" as const,
      orderIndex: 0,
      createdAt: NOW,
    };
    const withNotes = TextResourceSchema.parse({
      ...base,
      annotations: [stored(ID_A)],
    }) as TextResource;
    expect(withNotes.annotations).toEqual([stored(ID_A)]);
    expect(TextResourceSchema.parse(base)).not.toHaveProperty("annotations");
  });
});

describe("annotation limits (FR-11)", () => {
  it("states the owner-approved limits", () => {
    expect(ANNOTATION_LIMITS).toEqual({
      bodyMin: 1,
      bodyMax: 5000,
      quoteMax: 500,
      maxPerResource: 500,
      locatorValueMax: 500,
      sourceNameMax: 500,
    });
  });

  it("accepts a body of 1 and of 5000 characters", () => {
    expect(validateAnnotationBody("x").ok).toBe(true);
    expect(validateAnnotationBody("x".repeat(5000)).ok).toBe(true);
  });

  it("refuses an empty, over-long or non-string body, naming the limit", () => {
    const empty = validateAnnotationBody("");
    expect(empty.ok).toBe(false);
    expect(!empty.ok && empty.message).toContain("1 to 5000");
    const over = validateAnnotationBody("x".repeat(5001));
    expect(over.ok).toBe(false);
    expect(!over.ok && over.message).toContain("5000");
    expect(validateAnnotationBody(42).ok).toBe(false);
    expect(validateAnnotationBody(undefined).ok).toBe(false);
  });

  it("accepts a quote of 0 and of 500 characters; refuses 501 and non-string", () => {
    expect(validateAnnotationQuote("").ok).toBe(true);
    expect(validateAnnotationQuote("q".repeat(500)).ok).toBe(true);
    const over = validateAnnotationQuote("q".repeat(501));
    expect(over.ok).toBe(false);
    expect(!over.ok && over.message).toContain("500");
    expect(validateAnnotationQuote(null).ok).toBe(false);
  });

  it("never truncates: a valid value is returned as given", () => {
    const body = "x".repeat(5000);
    const result = validateNewAnnotation(
      { id: ID_A, body, quote: "q".repeat(500) },
      [],
    );
    expect(result).toEqual({
      ok: true,
      value: { id: ID_A, body, quote: "q".repeat(500) },
    });
  });
});

describe("validateNewAnnotation (FR-11)", () => {
  const valid = { id: ID_A, body: "note", quote: "passage" };

  it("accepts a well-formed new annotation", () => {
    expect(validateNewAnnotation(valid, [])).toEqual({
      ok: true,
      value: valid,
    });
  });

  it("refuses an unknown key rather than storing it", () => {
    const r = validateNewAnnotation({ ...valid, anchor: { from: 1 } }, []);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("anchor");
  });

  it("refuses a non-object input", () => {
    expect(validateNewAnnotation("x", []).ok).toBe(false);
    expect(validateNewAnnotation(null, []).ok).toBe(false);
    expect(validateNewAnnotation([valid], []).ok).toBe(false);
  });

  it("refuses a malformed id", () => {
    expect(validateNewAnnotation({ ...valid, id: "nope" }, []).ok).toBe(false);
    expect(validateNewAnnotation({ ...valid, id: 7 }, []).ok).toBe(false);
  });

  it("refuses a colliding id", () => {
    const r = validateNewAnnotation(valid, [stored(ID_A)]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/already/i);
    expect(validateNewAnnotation(valid, [stored(ID_B)]).ok).toBe(true);
  });

  it("allows the 500th annotation and refuses the 501st, naming the limit", () => {
    const filler = (n: number): Annotation[] =>
      Array.from({ length: n }, (_, i) =>
        stored(`550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`),
      );
    expect(validateNewAnnotation(valid, filler(499)).ok).toBe(true);
    const r = validateNewAnnotation(valid, filler(500));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain("500");
  });

  it("refuses an over-limit body or quote with its message", () => {
    const body = validateNewAnnotation(
      { ...valid, body: "x".repeat(5001) },
      [],
    );
    expect(!body.ok && body.message).toContain("5000");
    const quote = validateNewAnnotation(
      { ...valid, quote: "q".repeat(501) },
      [],
    );
    expect(!quote.ok && quote.message).toContain("500");
  });
});

describe("annotation mark in the document schema (FR-9)", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Marked",
            marks: [
              { type: "annotation", attrs: { id: ID_A } },
              { type: "annotation", attrs: { id: ID_B } },
              { type: "bold" },
            ],
          },
        ],
      },
    ],
  };

  it("TipTapNodeSchema accepts a node carrying annotation marks unchanged", () => {
    const node = doc.content[0];
    expect(TipTapNodeSchema.parse(node)).toEqual(node);
  });

  it("TipTapDocumentSchema keeps the annotation marks and their ids", () => {
    expect(TipTapDocumentSchema.parse(doc)).toEqual(doc);
  });
});

describe("client-writable sidecar keys (FR-10)", () => {
  it("are exactly the five, and annotations is not among them", () => {
    expect([...CLIENT_WRITABLE_SIDECAR_KEYS].sort()).toEqual(
      [
        "aliases",
        "entityKind",
        "resourceSubtype",
        "userMetadata",
        "wordCountGoal",
      ].sort(),
    );
    expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain("annotations");
  });
});

describe("claim validators (Feature 108, FR-8, FR-9, FR-11, FR-12)", () => {
  const SRC = "550e8400-e29b-41d4-a716-446655440020";
  const target = { sourceId: SRC, sourceName: "A Source" };
  const validNew = { id: ID_A, statement: "Water boils at 100C", quote: "q" };

  it("accepts a statement of 1 and 5000 code units and refuses 0 and 5001, never truncating", () => {
    expect(validateClaimStatement("a")).toEqual({ ok: true, value: "a" });
    const max = "x".repeat(5000);
    expect(validateClaimStatement(max)).toEqual({ ok: true, value: max });
    expect(validateClaimStatement("").ok).toBe(false);
    expect(validateClaimStatement("x".repeat(5001)).ok).toBe(false);
    expect(validateClaimStatement(5).ok).toBe(false);
  });

  it("counts UTF-16 code units, not characters", () => {
    expect(validateClaimStatement("\u{1F600}".repeat(2500)).ok).toBe(true);
    expect(validateClaimStatement("\u{1F600}".repeat(2501)).ok).toBe(false);
  });

  it("refuses an empty statement for a new claim with and without a Source link", () => {
    expect(validateNewClaim({ ...validNew, statement: "" }, []).ok).toBe(false);
    expect(
      validateNewClaim({ ...validNew, statement: "", target }, []).ok,
    ).toBe(false);
  });

  it("accepts a well-formed new claim, with or without a target", () => {
    expect(validateNewClaim(validNew, [])).toEqual({
      ok: true,
      value: validNew,
    });
    expect(validateNewClaim({ ...validNew, target }, [])).toEqual({
      ok: true,
      value: { ...validNew, target },
    });
  });

  it("refuses a new claim with a client status, a client date, a claim key or any unknown key, without echoing it", () => {
    for (const key of [
      "status",
      "statusChangedAt",
      "claimMarker",
      "body",
      "zzz",
    ]) {
      const r = validateNewClaim({ ...validNew, [key]: "unverified" }, []);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.message).not.toContain(key);
    }
  });

  it("refuses a new claim with a bad id, a collision, a long quote, a bad target, a full resource or a non-object", () => {
    expect(validateNewClaim({ ...validNew, id: "x" }, []).ok).toBe(false);
    expect(validateNewClaim(validNew, [stored(ID_A)]).ok).toBe(false);
    expect(
      validateNewClaim({ ...validNew, quote: "q".repeat(501) }, []).ok,
    ).toBe(false);
    expect(
      validateNewClaim({ ...validNew, target: { sourceId: "x" } }, []).ok,
    ).toBe(false);
    const many = Array.from(
      { length: ANNOTATION_LIMITS.maxPerResource },
      (_, i) =>
        stored(`550e8400-e29b-41d4-a716-${String(i).padStart(12, "0")}`),
    );
    expect(validateNewClaim(validNew, many).ok).toBe(false);
    expect(validateNewClaim("x", []).ok).toBe(false);
    expect(validateNewClaim(null, []).ok).toBe(false);
    expect(validateNewClaim([validNew], []).ok).toBe(false);
  });

  it("accepts an update with each of status, statement and target, alone or together", () => {
    expect(validateUpdateClaim({ status: "verified" })).toEqual({
      ok: true,
      value: { status: "verified" },
    });
    expect(validateUpdateClaim({ statement: "new" }).ok).toBe(true);
    expect(validateUpdateClaim({ target }).ok).toBe(true);
    expect(validateUpdateClaim({ target: null })).toEqual({
      ok: true,
      value: { target: null },
    });
    const all = { status: "needs-review", statement: "s", target };
    expect(validateUpdateClaim(all)).toEqual({ ok: true, value: all });
  });

  it("accepts all four status identifiers on update", () => {
    for (const status of [
      "unverified",
      "verified",
      "disputed",
      "needs-review",
    ]) {
      expect(validateUpdateClaim({ status }).ok).toBe(true);
    }
  });

  it("refuses a status not among the four, including unsourced", () => {
    for (const status of ["unsourced", "Verified", "", "other", 1, null]) {
      expect(validateUpdateClaim({ status }).ok).toBe(false);
    }
  });

  it("refuses a Source link failing validateAnnotationTarget", () => {
    expect(validateUpdateClaim({ target: { sourceId: "x" } }).ok).toBe(false);
    expect(validateUpdateClaim({ target: { ...target, extra: 1 } }).ok).toBe(
      false,
    );
    expect(validateUpdateClaim({ target: "s" }).ok).toBe(false);
  });

  it("refuses an empty or over-long statement on update", () => {
    expect(validateUpdateClaim({ statement: "" }).ok).toBe(false);
    expect(validateUpdateClaim({ statement: "x".repeat(5001) }).ok).toBe(false);
    expect(validateUpdateClaim({ statement: 3 }).ok).toBe(false);
  });

  it("refuses an unknown key and a client-supplied statusChangedAt, without echoing it", () => {
    for (const key of [
      "statusChangedAt",
      "claimMarker",
      "body",
      "updatedAt",
      "zzz",
    ]) {
      const r = validateUpdateClaim({ status: "verified", [key]: NOW });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.message).not.toContain(key);
    }
  });

  it("refuses a call with none of status, link, statement, and a non-object", () => {
    expect(validateUpdateClaim({}).ok).toBe(false);
    expect(validateUpdateClaim({ status: undefined }).ok).toBe(false);
    expect(validateUpdateClaim(null).ok).toBe(false);
    expect(validateUpdateClaim("x").ok).toBe(false);
    expect(validateUpdateClaim([]).ok).toBe(false);
  });

  it("accepts a carried claim with a known status and an ISO date", () => {
    const claim = { status: "disputed", statusChangedAt: NOW };
    expect(validateCarriedClaim(claim)).toEqual({ ok: true, value: claim });
  });

  it("refuses a carried claim with an unknown status, a bad or missing date, an unknown key or a non-object", () => {
    expect(
      validateCarriedClaim({ status: "unsourced", statusChangedAt: NOW }).ok,
    ).toBe(false);
    expect(
      validateCarriedClaim({ status: "verified", statusChangedAt: "yesterday" })
        .ok,
    ).toBe(false);
    expect(
      validateCarriedClaim({
        status: "verified",
        statusChangedAt: "2026-13-45T00:00:00.000Z",
      }).ok,
    ).toBe(false);
    expect(validateCarriedClaim({ status: "verified" }).ok).toBe(false);
    expect(validateCarriedClaim({ statusChangedAt: NOW }).ok).toBe(false);
    expect(
      validateCarriedClaim({ status: "verified", statusChangedAt: NOW, x: 1 })
        .ok,
    ).toBe(false);
    expect(validateCarriedClaim(null).ok).toBe(false);
    expect(validateCarriedClaim("x").ok).toBe(false);
  });

  it("leaves validateAnnotationBody and validateNewAnnotation unchanged for a non-claim", () => {
    expect(validateAnnotationBody("", true).ok).toBe(true);
    expect(validateAnnotationBody("", false).ok).toBe(false);
    expect(
      validateNewAnnotation({ id: ID_A, body: "", quote: "q", target }, []).ok,
    ).toBe(true);
    expect(
      validateNewAnnotation({ ...validNew, body: "b", claim: {} }, []).ok,
    ).toBe(false);
  });
});
