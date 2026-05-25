import { describe, expect, it } from "vitest";
import {
  buildOperatorStub,
  getDefaultOperator,
  getOperatorOption,
  getOperators,
  OPERATORS_BY_TYPE,
} from "../../components/QueryBuilder/operator-utils";
import type { MetadataFieldType } from "../../src/lib/models/types";

const ALL_TYPES: MetadataFieldType[] = [
  "text",
  "number",
  "date",
  "boolean",
  "select",
  "multiselect",
  "resource-ref",
  "multi-resource-ref",
];

describe("operator-utils — getOperators", () => {
  it("returns a non-empty list for every MetadataFieldType", () => {
    for (const type of ALL_TYPES) {
      const groups = getOperators(type);
      expect(groups.length).toBeGreaterThan(0);
    }
  });

  it("every type ends with is-empty and has-any-value after a divider", () => {
    for (const type of ALL_TYPES) {
      const groups = getOperators(type);
      const last = groups[groups.length - 1];
      const secondLast = groups[groups.length - 2];
      const thirdLast = groups[groups.length - 3];

      expect(last).not.toBe("divider");
      expect(secondLast).not.toBe("divider");
      expect(thirdLast).toBe("divider");

      if (last !== "divider") {
        expect(last.value).toBe("has-any-value");
      }
      if (secondLast !== "divider") {
        expect(secondLast.value).toBe("is-empty");
      }
    }
  });

  it("no type has two consecutive dividers", () => {
    for (const type of ALL_TYPES) {
      const groups = getOperators(type);
      for (let i = 0; i < groups.length - 1; i++) {
        if (groups[i] === "divider") {
          expect(groups[i + 1]).not.toBe("divider");
        }
      }
    }
  });
});

describe("operator-utils — getOperatorOption", () => {
  it("returns the matching option for known operator values", () => {
    const opt = getOperatorOption("text", "contains");
    expect(opt).not.toBeNull();
    expect(opt?.label).toBe("contains");
    expect(opt?.noValue).toBe(false);
  });

  it("returns null for unknown operator values", () => {
    expect(getOperatorOption("text", "nonexistent")).toBeNull();
  });

  it("marks is-empty and has-any-value as noValue across all types", () => {
    for (const type of ALL_TYPES) {
      const isEmpty = getOperatorOption(type, "is-empty");
      const hasAny = getOperatorOption(type, "has-any-value");
      expect(isEmpty?.noValue).toBe(true);
      expect(hasAny?.noValue).toBe(true);
    }
  });
});

describe("operator-utils — getDefaultOperator", () => {
  it("returns the first non-divider operator for each type", () => {
    expect(getDefaultOperator("text")).toBe("is");
    expect(getDefaultOperator("number")).toBe("equals");
    expect(getDefaultOperator("date")).toBe("is-on");
    expect(getDefaultOperator("boolean")).toBe("is-true");
    expect(getDefaultOperator("select")).toBe("is");
    expect(getDefaultOperator("multiselect")).toBe("includes");
    expect(getDefaultOperator("resource-ref")).toBe("is");
    expect(getDefaultOperator("multi-resource-ref")).toBe("includes");
  });
});

describe("operator-utils — buildOperatorStub", () => {
  it("text: is → eq with empty string value", () => {
    const stub = buildOperatorStub("text", "is", "synopsis");
    expect(stub).toEqual({ op: "eq", field: "synopsis", value: "" });
  });

  it("text: is-not → ne with empty string value", () => {
    const stub = buildOperatorStub("text", "is-not", "synopsis");
    expect(stub).toEqual({ op: "ne", field: "synopsis", value: "" });
  });

  it("text: contains → contains leaf node", () => {
    const stub = buildOperatorStub("text", "contains", "notes");
    expect(stub).toEqual({ op: "contains", field: "notes", value: "" });
  });

  it("text: does-not-contain → not(contains)", () => {
    const stub = buildOperatorStub("text", "does-not-contain", "notes");
    expect(stub).toEqual({
      op: "not",
      child: { op: "contains", field: "notes", value: "" },
    });
  });

  it("text: starts-with → matches", () => {
    const stub = buildOperatorStub("text", "starts-with", "title");
    expect(stub).toEqual({ op: "matches", field: "title", value: "" });
  });

  it("text: matches-regex → matches", () => {
    const stub = buildOperatorStub("text", "matches-regex", "title");
    expect(stub).toEqual({ op: "matches", field: "title", value: "" });
  });

  it("number: comparison operators → correct AST ops with numeric value 0", () => {
    const cases: [string, string][] = [
      ["equals", "eq"],
      ["does-not-equal", "ne"],
      ["is-less-than", "lt"],
      ["is-at-most", "lte"],
      ["is-greater-than", "gt"],
      ["is-at-least", "gte"],
    ];
    for (const [opVal, astOp] of cases) {
      const stub = buildOperatorStub("number", opVal, "wordCount");
      expect(stub).toEqual({ op: astOp, field: "wordCount", value: 0 });
    }
  });

  it("number: is-between → and(gte, lte) with numeric placeholders", () => {
    const stub = buildOperatorStub("number", "is-between", "wordCount");
    expect(stub).toEqual({
      op: "and",
      children: [
        { op: "gte", field: "wordCount", value: 0 },
        { op: "lte", field: "wordCount", value: 0 },
      ],
    });
  });

  it("date: is-between → and(gte, lte) with string placeholders", () => {
    const stub = buildOperatorStub("date", "is-between", "createdAt");
    expect(stub).toEqual({
      op: "and",
      children: [
        { op: "gte", field: "createdAt", value: "" },
        { op: "lte", field: "createdAt", value: "" },
      ],
    });
  });

  it("date: in-the-last → gte stub (value picker provides computed date)", () => {
    const stub = buildOperatorStub("date", "in-the-last", "updatedAt");
    expect(stub).toEqual({ op: "gte", field: "updatedAt", value: "" });
  });

  it("boolean: is-true → eq(field, true)", () => {
    const stub = buildOperatorStub("boolean", "is-true", "published");
    expect(stub).toEqual({ op: "eq", field: "published", value: true });
  });

  it("boolean: is-false → eq(field, false)", () => {
    const stub = buildOperatorStub("boolean", "is-false", "published");
    expect(stub).toEqual({ op: "eq", field: "published", value: false });
  });

  it("select: is-any-of → in with empty array", () => {
    const stub = buildOperatorStub("select", "is-any-of", "type");
    expect(stub).toEqual({ op: "in", field: "type", value: [] });
  });

  it("select: is-none-of → not(in with empty array)", () => {
    const stub = buildOperatorStub("select", "is-none-of", "type");
    expect(stub).toEqual({
      op: "not",
      child: { op: "in", field: "type", value: [] },
    });
  });

  it("multiselect: includes-all-of → and([in])", () => {
    const stub = buildOperatorStub(
      "multiselect",
      "includes-all-of",
      "statuses",
    );
    expect(stub).toEqual({
      op: "and",
      children: [{ op: "in", field: "statuses", value: "" }],
    });
  });

  it("multiselect: includes-any-of → or([in])", () => {
    const stub = buildOperatorStub(
      "multiselect",
      "includes-any-of",
      "statuses",
    );
    expect(stub).toEqual({
      op: "or",
      children: [{ op: "in", field: "statuses", value: "" }],
    });
  });

  it("multiselect: includes-none-of → not(or([in]))", () => {
    const stub = buildOperatorStub(
      "multiselect",
      "includes-none-of",
      "statuses",
    );
    expect(stub).toEqual({
      op: "not",
      child: {
        op: "or",
        children: [{ op: "in", field: "statuses", value: "" }],
      },
    });
  });

  it("universal: is-empty → not(exists) for every type", () => {
    for (const type of ALL_TYPES) {
      const stub = buildOperatorStub(type, "is-empty", "someField");
      expect(stub).toEqual({
        op: "not",
        child: { op: "exists", field: "someField" },
      });
    }
  });

  it("universal: has-any-value → exists for every type", () => {
    for (const type of ALL_TYPES) {
      const stub = buildOperatorStub(type, "has-any-value", "someField");
      expect(stub).toEqual({ op: "exists", field: "someField" });
    }
  });

  it("returns null for unknown operator values", () => {
    expect(buildOperatorStub("text", "nonexistent-op", "field")).toBeNull();
  });

  it("resource-ref: is → eq with empty string", () => {
    const stub = buildOperatorStub("resource-ref", "is", "pov");
    expect(stub).toEqual({ op: "eq", field: "pov", value: "" });
  });

  it("multi-resource-ref: includes → in with empty string", () => {
    const stub = buildOperatorStub("multi-resource-ref", "includes", "tags");
    expect(stub).toEqual({ op: "in", field: "tags", value: "" });
  });

  it("all non-divider operators for every type produce a non-null stub", () => {
    for (const type of ALL_TYPES) {
      for (const entry of OPERATORS_BY_TYPE[type]) {
        if (entry === "divider") continue;
        const stub = buildOperatorStub(type, entry.value, "f");
        expect(
          stub,
          `${type}/${entry.value} should produce a stub`,
        ).not.toBeNull();
      }
    }
  });
});
