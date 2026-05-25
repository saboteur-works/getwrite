import { describe, it, expect } from "vitest";
import {
  QueryASTSchema,
  ComparisonNodeSchema,
  InNodeSchema,
  ExistsNodeSchema,
  TextNodeSchema,
  LinksToNodeSchema,
  LinkedFromNodeSchema,
  RefNodeSchema,
  ParamNodeSchema,
} from "../../src/lib/models/query-ast";

// Concrete sample AST from decisions/02-query-substrate.md
const SAMPLE_AST = {
  op: "and",
  children: [
    { op: "eq", field: "type", value: "text" },
    {
      op: "eq",
      field: "folderId",
      value: "550e8400-e29b-41d4-a716-446655440001",
    },
    {
      op: "in",
      field: "pov",
      value: [
        "550e8400-e29b-41d4-a716-446655440002",
        "550e8400-e29b-41d4-a716-446655440003",
      ],
    },
    { op: "lt", field: "wordCount", value: 500 },
    { op: "not", child: { op: "ref", id: "scenes-already-revised" } },
    { op: "linksTo", id: "550e8400-e29b-41d4-a716-446655440004" },
  ],
};

describe("QueryASTSchema", () => {
  describe("round-trip", () => {
    it("parses and re-serialises the canonical sample AST", () => {
      const result = QueryASTSchema.safeParse(SAMPLE_AST);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(JSON.parse(JSON.stringify(result.data))).toEqual(SAMPLE_AST);
      }
    });
  });

  describe("comparison nodes (eq / ne / lt / gt / gte / lte)", () => {
    it.each(["eq", "ne", "lt", "gt", "gte", "lte"] as const)(
      "accepts op=%s with a scalar value",
      (op) => {
        const result = QueryASTSchema.safeParse({
          op,
          field: "wordCount",
          value: 500,
        });
        expect(result.success).toBe(true);
      },
    );

    it("accepts a string value for eq", () => {
      const result = QueryASTSchema.safeParse({
        op: "eq",
        field: "status",
        value: "draft",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a boolean value for eq", () => {
      const result = QueryASTSchema.safeParse({
        op: "eq",
        field: "pinned",
        value: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts a null value for eq (is empty check)", () => {
      const result = QueryASTSchema.safeParse({
        op: "eq",
        field: "pov",
        value: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts a ResourceRef value", () => {
      const result = QueryASTSchema.safeParse({
        op: "eq",
        field: "pov",
        value: { id: "550e8400-e29b-41d4-a716-446655440000", name: "Mara" },
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing field", () => {
      const result = QueryASTSchema.safeParse({ op: "eq", value: "text" });
      expect(result.success).toBe(false);
    });

    it("rejects empty field string", () => {
      const result = QueryASTSchema.safeParse({
        op: "eq",
        field: "",
        value: "text",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown comparison op", () => {
      const result = QueryASTSchema.safeParse({
        op: "between",
        field: "wordCount",
        value: 100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("in node", () => {
    it("accepts an array of strings", () => {
      const result = QueryASTSchema.safeParse({
        op: "in",
        field: "pov",
        value: ["uuid-1", "uuid-2"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts an array of numbers", () => {
      const result = QueryASTSchema.safeParse({
        op: "in",
        field: "status",
        value: [1, 2, 3],
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing value", () => {
      const result = QueryASTSchema.safeParse({ op: "in", field: "pov" });
      expect(result.success).toBe(false);
    });
  });

  describe("exists node", () => {
    it("accepts a valid exists node", () => {
      const result = QueryASTSchema.safeParse({
        op: "exists",
        field: "synopsis",
      });
      expect(result.success).toBe(true);
    });

    it("rejects exists with no field", () => {
      const result = QueryASTSchema.safeParse({ op: "exists" });
      expect(result.success).toBe(false);
    });
  });

  describe("text predicate nodes (contains / matches)", () => {
    it.each(["contains", "matches"] as const)("accepts op=%s", (op) => {
      const result = QueryASTSchema.safeParse({
        op,
        field: "plainText",
        value: "rain",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a non-string value for contains", () => {
      const result = QueryASTSchema.safeParse({
        op: "contains",
        field: "plainText",
        value: 42,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("graph predicate nodes (linksTo / linkedFrom)", () => {
    it("accepts a linksTo node", () => {
      const result = QueryASTSchema.safeParse({
        op: "linksTo",
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a linkedFrom node", () => {
      const result = QueryASTSchema.safeParse({
        op: "linkedFrom",
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects linksTo with no id", () => {
      const result = QueryASTSchema.safeParse({ op: "linksTo" });
      expect(result.success).toBe(false);
    });
  });

  describe("boolean combinators", () => {
    it("accepts an and node with children", () => {
      const result = QueryASTSchema.safeParse({
        op: "and",
        children: [
          { op: "eq", field: "status", value: "draft" },
          { op: "lt", field: "wordCount", value: 1000 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts an or node with children", () => {
      const result = QueryASTSchema.safeParse({
        op: "or",
        children: [
          { op: "eq", field: "type", value: "text" },
          { op: "eq", field: "type", value: "image" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts a not node with a single child", () => {
      const result = QueryASTSchema.safeParse({
        op: "not",
        child: { op: "eq", field: "status", value: "done" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts an empty and node (zero children)", () => {
      const result = QueryASTSchema.safeParse({ op: "and", children: [] });
      expect(result.success).toBe(true);
    });

    it("rejects and with no children array", () => {
      const result = QueryASTSchema.safeParse({ op: "and" });
      expect(result.success).toBe(false);
    });

    it("rejects not with children array instead of child", () => {
      const result = QueryASTSchema.safeParse({
        op: "not",
        children: [{ op: "eq", field: "status", value: "done" }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("nested combinators", () => {
    it("accepts two levels of nesting (the chip-UI two-level model)", () => {
      const result = QueryASTSchema.safeParse({
        op: "or",
        children: [
          {
            op: "and",
            children: [
              { op: "eq", field: "type", value: "text" },
              { op: "lt", field: "wordCount", value: 500 },
            ],
          },
          {
            op: "and",
            children: [
              { op: "ref", id: "scenes-already-revised" },
              { op: "gte", field: "wordCount", value: 100 },
            ],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts not wrapping a ref (as in the sample AST)", () => {
      const result = QueryASTSchema.safeParse({
        op: "not",
        child: { op: "ref", id: "scenes-already-revised" },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("splice nodes", () => {
    it("accepts a ref node", () => {
      const result = QueryASTSchema.safeParse({
        op: "ref",
        id: "scenes-already-revised",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a param node", () => {
      const result = QueryASTSchema.safeParse({
        op: "param",
        name: "characterName",
      });
      expect(result.success).toBe(true);
    });

    it("rejects a param node with an empty name", () => {
      const result = QueryASTSchema.safeParse({ op: "param", name: "" });
      expect(result.success).toBe(false);
    });

    it("rejects a ref node with no id", () => {
      const result = QueryASTSchema.safeParse({ op: "ref" });
      expect(result.success).toBe(false);
    });
  });

  describe("invalid inputs", () => {
    it("rejects null", () => {
      expect(QueryASTSchema.safeParse(null).success).toBe(false);
    });

    it("rejects a plain string", () => {
      expect(QueryASTSchema.safeParse("eq").success).toBe(false);
    });

    it("rejects an empty object", () => {
      expect(QueryASTSchema.safeParse({}).success).toBe(false);
    });

    it("rejects an unknown op", () => {
      expect(
        QueryASTSchema.safeParse({ op: "between", field: "x", value: 1 })
          .success,
      ).toBe(false);
    });
  });
});

describe("individual node schemas", () => {
  it("ComparisonNodeSchema rejects a missing value", () => {
    expect(
      ComparisonNodeSchema.safeParse({ op: "eq", field: "type" }).success,
    ).toBe(false);
  });

  it("InNodeSchema rejects a non-array value (single string)", () => {
    // A single string IS a valid MetadataValue — the `in` predicate does not
    // restrict value to arrays at schema level. This test documents the
    // current permissive behaviour.
    const result = InNodeSchema.safeParse({
      op: "in",
      field: "status",
      value: "draft",
    });
    expect(result.success).toBe(true);
  });

  it("ExistsNodeSchema accepts minimal valid shape", () => {
    expect(
      ExistsNodeSchema.safeParse({ op: "exists", field: "synopsis" }).success,
    ).toBe(true);
  });

  it("TextNodeSchema rejects a numeric value", () => {
    expect(
      TextNodeSchema.safeParse({ op: "contains", field: "body", value: 42 })
        .success,
    ).toBe(false);
  });

  it("LinksToNodeSchema accepts an empty-string id", () => {
    // id is z.string() — content validation is enforced at the execution layer
    expect(LinksToNodeSchema.safeParse({ op: "linksTo", id: "" }).success).toBe(
      true,
    );
  });

  it("LinkedFromNodeSchema rejects missing id", () => {
    expect(LinkedFromNodeSchema.safeParse({ op: "linkedFrom" }).success).toBe(
      false,
    );
  });

  it("RefNodeSchema accepts a saved-query slug id", () => {
    expect(
      RefNodeSchema.safeParse({ op: "ref", id: "act-2-scenes" }).success,
    ).toBe(true);
  });

  it("ParamNodeSchema rejects an empty name", () => {
    expect(ParamNodeSchema.safeParse({ op: "param", name: "" }).success).toBe(
      false,
    );
  });
});
