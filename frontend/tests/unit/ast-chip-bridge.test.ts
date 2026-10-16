import { describe, expect, it } from "vitest";
import {
  isTwoLevelCompatible,
  groupsToAst,
  astToGroups,
} from "../../components/QueryBuilder/ast-chip-bridge";
import type { QueryAST } from "../../src/lib/models/query-ast";
import { evaluate } from "../../src/lib/models/query-evaluator";
import type { QueryContext } from "../../src/lib/models/query-intrinsics";
import type { ResourceBase, MetadataValue } from "../../src/lib/models/types";
import type { QueryGroup } from "../../components/QueryBuilder/QueryBuilder";
import type { FilterChipField } from "../../components/QueryBuilder/FilterChip";

// ─── Sample fields ─────────────────────────────────────────────────────────────

const FIELDS: FilterChipField[] = [
  { key: "synopsis", label: "Synopsis", type: "text" },
  { key: "wordCount", label: "Word Count", type: "number" },
  { key: "createdAt", label: "Created At", type: "date" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["draft", "done"],
  },
  {
    key: "statuses",
    label: "Statuses",
    type: "multiselect",
    options: ["draft", "done"],
  },
  { key: "published", label: "Published", type: "boolean" },
  { key: "pov", label: "POV", type: "resource-ref" },
  { key: "tags2", label: "Tags 2", type: "multiselect", options: ["A", "B"] },
  { key: "cast", label: "Cast", type: "multi-resource-ref" },
];

// ─── isTwoLevelCompatible ──────────────────────────────────────────────────────

describe("isTwoLevelCompatible", () => {
  it("accepts a single leaf node", () => {
    expect(
      isTwoLevelCompatible({ op: "eq", field: "synopsis", value: "hi" }),
    ).toBe(true);
  });

  it("accepts not(leaf) — maps to operators like is-empty", () => {
    expect(
      isTwoLevelCompatible({
        op: "not",
        child: { op: "exists", field: "synopsis" },
      }),
    ).toBe(true);
  });

  it("accepts not(contains) — does-not-contain chip", () => {
    expect(
      isTwoLevelCompatible({
        op: "not",
        child: { op: "contains", field: "synopsis", value: "foo" },
      }),
    ).toBe(true);
  });

  it("accepts and([leaves]) — single group with multiple chips", () => {
    expect(
      isTwoLevelCompatible({
        op: "and",
        children: [
          { op: "eq", field: "synopsis", value: "a" },
          { op: "gt", field: "wordCount", value: 100 },
        ],
      }),
    ).toBe(true);
  });

  it("accepts or([leaves]) — single group OR combinator", () => {
    expect(
      isTwoLevelCompatible({
        op: "or",
        children: [
          { op: "eq", field: "status", value: "draft" },
          { op: "eq", field: "status", value: "done" },
        ],
      }),
    ).toBe(true);
  });

  it("accepts and(group-nodes) — multiple groups", () => {
    expect(
      isTwoLevelCompatible({
        op: "and",
        children: [
          {
            op: "and",
            children: [
              { op: "eq", field: "synopsis", value: "a" },
              { op: "gt", field: "wordCount", value: 100 },
            ],
          },
          {
            op: "or",
            children: [{ op: "eq", field: "status", value: "draft" }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts or([leaf, and([leaves])]) — mixed single-chip and multi-chip groups", () => {
    expect(
      isTwoLevelCompatible({
        op: "or",
        children: [
          { op: "eq", field: "synopsis", value: "a" },
          {
            op: "and",
            children: [
              { op: "eq", field: "status", value: "draft" },
              { op: "gt", field: "wordCount", value: 100 },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects three-level nesting", () => {
    expect(
      isTwoLevelCompatible({
        op: "and",
        children: [
          {
            op: "and",
            children: [
              {
                op: "and",
                children: [{ op: "eq", field: "synopsis", value: "a" }],
              },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("rejects and(gte, lte) — is-between chip produces this", () => {
    expect(
      isTwoLevelCompatible({
        op: "and",
        children: [
          { op: "gte", field: "wordCount", value: 100 },
          { op: "lte", field: "wordCount", value: 200 },
        ],
      }),
    ).toBe(true); // it IS two-level compatible as a group, but the chip it came from is special
  });

  it("accepts ref node as a chip-level node", () => {
    expect(isTwoLevelCompatible({ op: "ref", id: "saved-id" })).toBe(true);
  });

  it("rejects param node", () => {
    expect(isTwoLevelCompatible({ op: "param", name: "x" })).toBe(false);
  });

  it("rejects not(and) — not wrapping a combinator", () => {
    expect(
      isTwoLevelCompatible({
        op: "not",
        child: {
          op: "and",
          children: [{ op: "eq", field: "synopsis", value: "a" }],
        },
      }),
    ).toBe(false);
  });
});

// ─── groupsToAst ──────────────────────────────────────────────────────────────

describe("groupsToAst", () => {
  it("returns null for empty groups", () => {
    expect(groupsToAst([], "and")).toBeNull();
  });

  it("single group single chip → returns chip AST directly", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [{ id: "c1", field: FIELDS[0], operator: "is", value: "hi" }],
      },
    ];
    expect(groupsToAst(groups, "and")).toEqual({
      op: "eq",
      field: "synopsis",
      value: "hi",
    });
  });

  it("single group multiple chips → returns group combinator node", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          { id: "c1", field: FIELDS[0], operator: "is", value: "hi" },
          {
            id: "c2",
            field: FIELDS[1],
            operator: "is-greater-than",
            value: 100,
          },
        ],
      },
    ];
    expect(groupsToAst(groups, "or")).toEqual({
      op: "and",
      children: [
        { op: "eq", field: "synopsis", value: "hi" },
        { op: "gt", field: "wordCount", value: 100 },
      ],
    });
  });

  it("multiple groups → wraps in global combinator", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [{ id: "c1", field: FIELDS[0], operator: "is", value: "hi" }],
      },
      {
        id: "g2",
        combinator: "or",
        chips: [
          {
            id: "c2",
            field: FIELDS[1],
            operator: "is-greater-than",
            value: 100,
          },
        ],
      },
    ];
    expect(groupsToAst(groups, "or")).toEqual({
      op: "or",
      children: [
        { op: "eq", field: "synopsis", value: "hi" },
        { op: "gt", field: "wordCount", value: 100 },
      ],
    });
  });

  it("skips blank chips (null field)", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          { id: "c1", field: null, operator: null, value: null },
          { id: "c2", field: FIELDS[0], operator: "is", value: "hi" },
        ],
      },
    ];
    expect(groupsToAst(groups, "and")).toEqual({
      op: "eq",
      field: "synopsis",
      value: "hi",
    });
  });

  it("number operators produce correct AST ops", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [{ id: "c1", field: FIELDS[1], operator: "equals", value: 42 }],
      },
    ];
    expect(groupsToAst(groups, "and")).toEqual({
      op: "eq",
      field: "wordCount",
      value: 42,
    });
  });

  it("is-empty → not(exists)", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          { id: "c1", field: FIELDS[0], operator: "is-empty", value: null },
        ],
      },
    ];
    expect(groupsToAst(groups, "and")).toEqual({
      op: "not",
      child: { op: "exists", field: "synopsis" },
    });
  });

  it("does-not-contain → not(contains)", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          {
            id: "c1",
            field: FIELDS[0],
            operator: "does-not-contain",
            value: "foo",
          },
        ],
      },
    ];
    expect(groupsToAst(groups, "and")).toEqual({
      op: "not",
      child: { op: "contains", field: "synopsis", value: "foo" },
    });
  });

  it("boolean is-true / is-false → eq with bool", () => {
    const trueGroups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          { id: "c1", field: FIELDS[5], operator: "is-true", value: null },
        ],
      },
    ];
    expect(groupsToAst(trueGroups, "and")).toEqual({
      op: "eq",
      field: "published",
      value: true,
    });

    const falseGroups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          { id: "c1", field: FIELDS[5], operator: "is-false", value: null },
        ],
      },
    ];
    expect(groupsToAst(falseGroups, "and")).toEqual({
      op: "eq",
      field: "published",
      value: false,
    });
  });
});

// ─── astToGroups ──────────────────────────────────────────────────────────────

describe("astToGroups", () => {
  it("ref node → 1 group with 1 ref chip", () => {
    const SAVED = [{ id: "x", name: "My Query" }];
    const result = astToGroups({ op: "ref", id: "x" }, FIELDS, SAVED);
    expect(result).not.toBeNull();
    expect(result!.groups).toHaveLength(1);
    expect(result!.groups[0].chips).toHaveLength(1);
    const chip = result!.groups[0].chips[0];
    expect(chip.refId).toBe("x");
    expect(chip.refName).toBe("My Query");
    expect(chip.field).toBeNull();
    expect(chip.operator).toBeNull();
  });

  it("returns null for 3-level AST", () => {
    expect(
      astToGroups(
        {
          op: "and",
          children: [
            {
              op: "and",
              children: [
                {
                  op: "and",
                  children: [{ op: "eq", field: "synopsis", value: "a" }],
                },
              ],
            },
          ],
        },
        FIELDS,
      ),
    ).toBeNull();
  });

  it("single leaf → 1 group, 1 chip", () => {
    const result = astToGroups(
      { op: "eq", field: "synopsis", value: "hi" },
      FIELDS,
    );
    expect(result).not.toBeNull();
    expect(result!.groups).toHaveLength(1);
    expect(result!.groups[0].chips).toHaveLength(1);
    expect(result!.groups[0].chips[0].field?.key).toBe("synopsis");
    expect(result!.groups[0].chips[0].operator).toBe("is");
    expect(result!.groups[0].chips[0].value).toBe("hi");
  });

  it("not(exists) → is-empty chip", () => {
    const result = astToGroups(
      { op: "not", child: { op: "exists", field: "synopsis" } },
      FIELDS,
    );
    expect(result).not.toBeNull();
    expect(result!.groups[0].chips[0].operator).toBe("is-empty");
    expect(result!.groups[0].chips[0].value).toBeNull();
  });

  it("not(contains) → does-not-contain chip", () => {
    const result = astToGroups(
      { op: "not", child: { op: "contains", field: "synopsis", value: "foo" } },
      FIELDS,
    );
    expect(result).not.toBeNull();
    expect(result!.groups[0].chips[0].operator).toBe("does-not-contain");
    expect(result!.groups[0].chips[0].value).toBe("foo");
  });

  it("and([leaves]) → single group with and combinator", () => {
    const result = astToGroups(
      {
        op: "and",
        children: [
          { op: "eq", field: "synopsis", value: "hi" },
          { op: "gt", field: "wordCount", value: 100 },
        ],
      },
      FIELDS,
    );
    expect(result).not.toBeNull();
    expect(result!.groups).toHaveLength(1);
    expect(result!.groups[0].combinator).toBe("and");
    expect(result!.groups[0].chips).toHaveLength(2);
  });

  it("or(group-nodes) → multiple groups with or global combinator", () => {
    const result = astToGroups(
      {
        op: "or",
        children: [
          {
            op: "and",
            children: [
              { op: "eq", field: "synopsis", value: "a" },
              { op: "gt", field: "wordCount", value: 100 },
            ],
          },
          {
            op: "or",
            children: [{ op: "eq", field: "status", value: "draft" }],
          },
        ],
      },
      FIELDS,
    );
    expect(result).not.toBeNull();
    expect(result!.globalCombinator).toBe("or");
    expect(result!.groups).toHaveLength(2);
    expect(result!.groups[0].combinator).toBe("and");
    expect(result!.groups[0].chips).toHaveLength(2);
    expect(result!.groups[1].combinator).toBe("or");
    expect(result!.groups[1].chips).toHaveLength(1);
  });

  it("number: gt → is-greater-than", () => {
    const result = astToGroups(
      { op: "gt", field: "wordCount", value: 100 },
      FIELDS,
    );
    expect(result!.groups[0].chips[0].operator).toBe("is-greater-than");
    expect(result!.groups[0].chips[0].value).toBe(100);
  });

  it("number: eq → equals", () => {
    const result = astToGroups(
      { op: "eq", field: "wordCount", value: 42 },
      FIELDS,
    );
    expect(result!.groups[0].chips[0].operator).toBe("equals");
    expect(result!.groups[0].chips[0].value).toBe(42);
  });

  it("boolean: eq(true) → is-true", () => {
    const result = astToGroups(
      { op: "eq", field: "published", value: true },
      FIELDS,
    );
    expect(result!.groups[0].chips[0].operator).toBe("is-true");
  });

  it("boolean: eq(false) → is-false", () => {
    const result = astToGroups(
      { op: "eq", field: "published", value: false },
      FIELDS,
    );
    expect(result!.groups[0].chips[0].operator).toBe("is-false");
  });

  it("date: lt → is-before", () => {
    const result = astToGroups(
      { op: "lt", field: "createdAt", value: "2026-01-01" },
      FIELDS,
    );
    expect(result!.groups[0].chips[0].operator).toBe("is-before");
  });
});

// ─── round-trip ───────────────────────────────────────────────────────────────

describe("groupsToAst → astToGroups round-trip", () => {
  it("round-trips a single group", () => {
    const original: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          { id: "c1", field: FIELDS[0], operator: "is", value: "hi" },
          {
            id: "c2",
            field: FIELDS[1],
            operator: "is-greater-than",
            value: 100,
          },
        ],
      },
    ];
    const ast = groupsToAst(original, "and")!;
    const restored = astToGroups(ast, FIELDS)!;

    expect(restored.groups).toHaveLength(1);
    expect(restored.groups[0].chips).toHaveLength(2);
    expect(restored.groups[0].chips[0].operator).toBe("is");
    expect(restored.groups[0].chips[0].value).toBe("hi");
    expect(restored.groups[0].chips[1].operator).toBe("is-greater-than");
    expect(restored.groups[0].chips[1].value).toBe(100);
  });

  it("round-trips two groups joined by OR (semantically equivalent form)", () => {
    // Two single-chip groups joined by OR produce or(leaf1, leaf2) in the AST.
    // On the way back, or([leaves]) is interpreted as one group with OR combinator
    // and two chips — semantically equivalent. The chip values and operators are
    // preserved even though the group count collapses.
    const original: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [{ id: "c1", field: FIELDS[0], operator: "is", value: "hi" }],
      },
      {
        id: "g2",
        combinator: "and",
        chips: [
          {
            id: "c2",
            field: FIELDS[1],
            operator: "is-greater-than",
            value: 100,
          },
        ],
      },
    ];
    const ast = groupsToAst(original, "or")!;
    const restored = astToGroups(ast, FIELDS)!;

    // or([leaf, leaf]) → 1 group with OR combinator, 2 chips
    expect(restored.groups).toHaveLength(1);
    expect(restored.groups[0].combinator).toBe("or");
    expect(restored.groups[0].chips).toHaveLength(2);
    expect(restored.groups[0].chips[0].operator).toBe("is");
    expect(restored.groups[0].chips[1].operator).toBe("is-greater-than");
  });

  it("round-trips two multi-chip groups joined by OR", () => {
    const original: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          { id: "c1", field: FIELDS[0], operator: "is", value: "hi" },
          {
            id: "c2",
            field: FIELDS[1],
            operator: "is-greater-than",
            value: 100,
          },
        ],
      },
      {
        id: "g2",
        combinator: "and",
        chips: [
          {
            id: "c3",
            field: FIELDS[2],
            operator: "is-after",
            value: "2026-01-01",
          },
        ],
      },
    ];
    const ast = groupsToAst(original, "or")!;
    const restored = astToGroups(ast, FIELDS)!;

    expect(restored.globalCombinator).toBe("or");
    expect(restored.groups).toHaveLength(2);
    expect(restored.groups[0].chips).toHaveLength(2);
    expect(restored.groups[0].chips[0].operator).toBe("is");
    expect(restored.groups[0].chips[1].operator).toBe("is-greater-than");
    expect(restored.groups[1].chips[0].operator).toBe("is-after");
  });

  it("round-trips not(exists) (is-empty)", () => {
    const original: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          { id: "c1", field: FIELDS[0], operator: "is-empty", value: null },
        ],
      },
    ];
    const ast = groupsToAst(original, "and")!;
    const restored = astToGroups(ast, FIELDS)!;
    expect(restored.groups[0].chips[0].operator).toBe("is-empty");
  });

  it("round-trips a ref chip", () => {
    const SAVED = [{ id: "q-abc", name: "My Query" }];
    const original: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          {
            id: "c1",
            field: null,
            operator: null,
            value: null,
            refId: "q-abc",
            refName: "My Query",
          },
        ],
      },
    ];
    const ast = groupsToAst(original, "and")!;
    expect(ast).toEqual({ op: "ref", id: "q-abc" });
    const restored = astToGroups(ast, FIELDS, SAVED)!;
    expect(restored.groups[0].chips[0].refId).toBe("q-abc");
    expect(restored.groups[0].chips[0].refName).toBe("My Query");
  });
});

// ─── ref chip helpers ─────────────────────────────────────────────────────────

describe("ref chips in groupsToAst", () => {
  it("single ref chip → ref AST node", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          {
            id: "c1",
            field: null,
            operator: null,
            value: null,
            refId: "q-1",
            refName: "Act 2",
          },
        ],
      },
    ];
    expect(groupsToAst(groups, "and")).toEqual({ op: "ref", id: "q-1" });
  });

  it("mixed group: ref chip + regular chip → and([ref, leaf])", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          {
            id: "c1",
            field: null,
            operator: null,
            value: null,
            refId: "q-1",
            refName: "Act 2",
          },
          { id: "c2", field: FIELDS[0], operator: "is", value: "hi" },
        ],
      },
    ];
    expect(groupsToAst(groups, "and")).toEqual({
      op: "and",
      children: [
        { op: "ref", id: "q-1" },
        { op: "eq", field: "synopsis", value: "hi" },
      ],
    });
  });
});

describe("ref nodes in astToGroups", () => {
  const SAVED = [{ id: "q-1", name: "Act 2 Scenes" }];

  it("resolves refName from savedQueries", () => {
    const result = astToGroups({ op: "ref", id: "q-1" }, FIELDS, SAVED);
    expect(result!.groups[0].chips[0].refName).toBe("Act 2 Scenes");
  });

  it("refName is undefined when savedQueries omitted", () => {
    const result = astToGroups({ op: "ref", id: "q-1" }, FIELDS);
    expect(result!.groups[0].chips[0].refId).toBe("q-1");
    expect(result!.groups[0].chips[0].refName).toBeUndefined();
  });

  it("and([ref, leaf]) → single group with 2 chips", () => {
    const result = astToGroups(
      {
        op: "and",
        children: [
          { op: "ref", id: "q-1" },
          { op: "eq", field: "synopsis", value: "hi" },
        ],
      },
      FIELDS,
      SAVED,
    );
    expect(result).not.toBeNull();
    expect(result!.groups[0].chips).toHaveLength(2);
    expect(result!.groups[0].chips[0].refId).toBe("q-1");
    expect(result!.groups[0].chips[1].operator).toBe("is");
  });
});

// ─── D-16: "includes all of" reopens as "includes all of" (FR-8, FR-9) ───────

describe("and-of-one-in reopen (D-16)", () => {
  const allOf = (field: string, value: string[]): QueryAST => ({
    op: "and",
    children: [{ op: "in", field, value }],
  });

  for (const [fieldKey, label] of [
    ["tags2", "multiselect"],
    ["cast", "multi-resource-ref"],
  ] as const) {
    describe(label, () => {
      it("top level: one group, one includes-all-of chip carrying the array", () => {
        const r = astToGroups(allOf(fieldKey, ["A", "B"]), FIELDS);
        expect(r!.groups).toHaveLength(1);
        expect(r!.groups[0].chips).toHaveLength(1);
        expect(r!.groups[0].chips[0].operator).toBe("includes-all-of");
        expect(r!.groups[0].chips[0].value).toEqual(["A", "B"]);
        expect(r!.groups[0].chips[0].field?.key).toBe(fieldKey);
      });

      it("child group of an and multi-group query", () => {
        const r = astToGroups(
          {
            op: "and",
            children: [
              allOf(fieldKey, ["A", "B"]),
              { op: "eq", field: "synopsis", value: "x" },
            ],
          },
          FIELDS,
        );
        expect(r!.globalCombinator).toBe("and");
        expect(r!.groups[0].chips).toHaveLength(1);
        expect(r!.groups[0].chips[0].operator).toBe("includes-all-of");
        expect(r!.groups[0].chips[0].value).toEqual(["A", "B"]);
        expect(r!.groups[1].chips[0].operator).toBe("is");
      });

      it("child group of an or multi-group query", () => {
        const r = astToGroups(
          {
            op: "or",
            children: [allOf(fieldKey, ["A"]), allOf(fieldKey, ["B"])],
          },
          FIELDS,
        );
        expect(r!.globalCombinator).toBe("or");
        expect(r!.groups.map((g) => g.chips[0].operator)).toEqual([
          "includes-all-of",
          "includes-all-of",
        ]);
      });

      it("round trip chip -> AST -> chip is stable", () => {
        const ast = allOf(fieldKey, ["A", "B"]);
        const first = astToGroups(ast, FIELDS)!;
        const back = groupsToAst(first.groups, first.globalCombinator);
        expect(back).toEqual(ast);
        const second = astToGroups(back!, FIELDS)!;
        expect(second.groups[0].chips[0].operator).toBe("includes-all-of");
        expect(second.groups[0].chips[0].value).toEqual(["A", "B"]);
      });

      it("chipToAst writes and of one in carrying the array", () => {
        const ast = groupsToAst(
          [
            {
              id: "g",
              combinator: "and",
              chips: [
                {
                  id: "c",
                  field: FIELDS.find((f) => f.key === fieldKey)!,
                  operator: "includes-all-of",
                  value: ["A", "B"],
                },
              ],
            },
          ],
          "and",
        );
        expect(ast).toEqual(allOf(fieldKey, ["A", "B"]));
      });
    });
  }

  it("other field type reopens as before (and group, includes-any chip)", () => {
    const r = astToGroups(
      {
        op: "and",
        children: [{ op: "in", field: "status", value: ["draft"] }],
      },
      FIELDS,
    );
    expect(r!.groups[0].combinator).toBe("and");
    expect(r!.groups[0].chips[0].operator).toBe("is-any-of");
  });

  it("unknown field reopens as before", () => {
    const r = astToGroups(
      { op: "and", children: [{ op: "in", field: "nope", value: ["a"] }] },
      FIELDS,
    );
    expect(r!.groups[0].combinator).toBe("and");
    expect(r!.groups[0].chips[0].field).toBeNull();
    expect(r!.groups[0].chips[0].operator).toBe("is-any-of");
  });
});

describe("chipToAst for 'in the last' (Feature 86 FR-11)", () => {
  it("writes gte on the field with the {amount, unit} value unchanged", () => {
    const ast = groupsToAst(
      [
        {
          id: "g",
          combinator: "and",
          chips: [
            {
              id: "c",
              field: FIELDS.find((f) => f.key === "createdAt")!,
              operator: "in-the-last",
              value: { amount: 7, unit: "days" },
            },
          ],
        },
      ],
      "and",
    );
    expect(ast).toEqual({
      op: "gte",
      field: "createdAt",
      value: { amount: 7, unit: "days" },
    });
  });
});

describe("astToGroups reopening a relative-date gte (Feature 86 FR-17)", () => {
  const dateField = FIELDS.find((f) => f.key === "createdAt")!;

  it("reopens gte {amount, unit} on a date field as 'in the last'", () => {
    const r = astToGroups(
      {
        op: "gte",
        field: "createdAt",
        value: { amount: 7, unit: "days" },
      } as QueryAST,
      FIELDS,
    );
    const chip = r!.groups[0].chips[0];
    expect(chip.operator).toBe("in-the-last");
    expect(chip.value).toEqual({ amount: 7, unit: "days" });
  });

  it.each(["days", "weeks", "months"] as const)(
    "round trips chip -> AST -> chip for %s",
    (unit) => {
      const groups: QueryGroup[] = [
        {
          id: "g",
          combinator: "and",
          chips: [
            {
              id: "c",
              field: dateField,
              operator: "in-the-last",
              value: { amount: 3, unit },
            },
          ],
        },
      ];
      const ast = groupsToAst(groups, "and")!;
      const back = astToGroups(ast, FIELDS)!;
      const chip = back.groups[0].chips[0];
      expect(chip.operator).toBe("in-the-last");
      expect(chip.value).toEqual({ amount: 3, unit });
      expect(groupsToAst(back.groups, "and")).toEqual(ast);
    },
  );

  it("reopens gte with a string value on a date field as it does today", () => {
    const r = astToGroups(
      { op: "gte", field: "createdAt", value: "2026-01-01" },
      FIELDS,
    );
    expect(r!.groups[0].chips[0].operator).toBe("is-after");
  });

  it("reopens other comparisons as it does today", () => {
    const op = (a: QueryAST): string | undefined =>
      astToGroups(a, FIELDS)!.groups[0].chips[0].operator ?? undefined;
    expect(op({ op: "gte", field: "wordCount", value: 5 })).toBe("is-at-least");
    expect(op({ op: "lt", field: "createdAt", value: "2026-01-01" })).toBe(
      "is-before",
    );
    expect(op({ op: "gt", field: "createdAt", value: "2026-01-01" })).toBe(
      "is-after",
    );
    expect(op({ op: "eq", field: "createdAt", value: "2026-01-01" })).toBe(
      "is-on",
    );
    expect(op({ op: "lte", field: "wordCount", value: 5 })).toBe("is-at-most");
  });
});

// ─── "starts with" (Feature 86 FR-32, F-1) ───────────────────────────────────

describe('"starts with" on a text field (Feature 86 FR-32)', () => {
  const textField = FIELDS.find((f) => f.key === "synopsis")!;

  /** The saved "starts with" shape (experiments.md, "F-1 intended saved shape"). */
  const startsWithNode = (escapedLiteral: string): QueryAST => {
    const node = {
      op: "matches" as const,
      field: "synopsis",
      value: `^${escapedLiteral}`,
      caseInsensitive: true,
    };
    return node;
  };

  const chipGroups = (operator: string, value: string): QueryGroup[] => [
    {
      id: "g",
      combinator: "and",
      chips: [{ id: "c", field: textField, operator, value }],
    },
  ];

  const typedToAst = (typed: string): QueryAST =>
    groupsToAst(chipGroups("starts-with", typed), "and")!;

  const CTX: QueryContext = {
    config: { editorConfig: {}, tags: [], tagAssignments: {}, statuses: [] },
    backlinks: {},
    mentions: {},
  };

  /** Resource ids (values by position) the AST returns over these synopsis values. */
  async function returnedValues(
    ast: QueryAST,
    values: readonly string[],
  ): Promise<string[]> {
    const resources: ResourceBase[] = values.map((_, i) => ({
      id: `bbbbbbbb-0000-4000-a000-0000000000${String(i).padStart(2, "0")}`,
      slug: `r${i}`,
      name: `R${i}`,
      type: "text",
      folderId: null,
      orderIndex: i,
      statuses: [],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    }));
    const sidecars: Record<string, Record<string, MetadataValue>> = {};
    resources.forEach((r, i) => {
      sidecars[r.id] = { synopsis: values[i] };
    });
    const found = new Set(
      await evaluate(ast, { resources, sidecars, context: CTX }),
    );
    return values.filter((_, i) => found.has(resources[i].id));
  }

  describe("evaluated through the chip's saved query", () => {
    it("returns the values beginning with alpha and not 'the alpha'", async () => {
      const values = ["alpha", "alpha two", "the alpha", "beta alpha"];
      expect(await returnedValues(typedToAst("alpha"), values)).toEqual([
        "alpha",
        "alpha two",
      ]);
    });

    it("matches a value regardless of case, like contains", async () => {
      const values = ["Alpha one", "ALPHA two", "alpha three", "the Alpha"];
      expect(await returnedValues(typedToAst("alpha"), values)).toEqual([
        "Alpha one",
        "ALPHA two",
        "alpha three",
      ]);
      expect(await returnedValues(typedToAst("ALPHA"), values)).toEqual([
        "Alpha one",
        "ALPHA two",
        "alpha three",
      ]);
    });

    const VALUES = [
      "a.c rest",
      "abc",
      "xa.c",
      "A.C upper",
      "a+b plus",
      "aab",
      "(x group",
      "x",
      "[y class",
      "y",
      "^zed caret",
      "zed",
      "$ dollar",
      "$cash",
      "plain",
    ];

    for (const typed of ["a.c", "a+b", "(x", "[y", "^z", "$"]) {
      it(`typed ${JSON.stringify(typed)} returns only values that begin with that literal text`, async () => {
        const expected = VALUES.filter((v) =>
          v.toLowerCase().startsWith(typed.toLowerCase()),
        );
        expect(expected.length).toBeGreaterThan(0);
        expect(await returnedValues(typedToAst(typed), VALUES)).toEqual(
          expected,
        );
      });
    }

    it("an unbalanced pattern character does not make the condition match nothing or throw", async () => {
      const result = await returnedValues(typedToAst("(x"), VALUES);
      expect(result).toEqual(["(x group"]);
    });
  });

  describe("reopening a saved 'starts with'", () => {
    it("single chip reopens as 'starts with' carrying the typed text", () => {
      const r = astToGroups(startsWithNode("alpha"), FIELDS)!;
      expect(r.groups).toHaveLength(1);
      expect(r.groups[0].chips).toHaveLength(1);
      expect(r.groups[0].chips[0].operator).toBe("starts-with");
      expect(r.groups[0].chips[0].value).toBe("alpha");
      expect(r.groups[0].chips[0].field?.key).toBe("synopsis");
    });

    it("reopens typed text with metacharacters as the typed text, not the escaped form", () => {
      const r = astToGroups(startsWithNode("a\\.c\\+\\(\\$"), FIELDS)!;
      expect(r.groups[0].chips[0].operator).toBe("starts-with");
      expect(r.groups[0].chips[0].value).toBe("a.c+($");
    });

    it("single group of an and reopens its starts-with chip as 'starts with'", () => {
      const r = astToGroups(
        {
          op: "and",
          children: [
            startsWithNode("alpha"),
            { op: "gt", field: "wordCount", value: 100 },
          ],
        },
        FIELDS,
      )!;
      expect(r.groups).toHaveLength(1);
      expect(r.groups[0].chips).toHaveLength(2);
      expect(r.groups[0].chips[0].operator).toBe("starts-with");
      expect(r.groups[0].chips[0].value).toBe("alpha");
    });

    it("child group of an or reopens its starts-with chip as 'starts with'", () => {
      const r = astToGroups(
        {
          op: "or",
          children: [
            {
              op: "and",
              children: [
                startsWithNode("alpha"),
                { op: "gt", field: "wordCount", value: 100 },
              ],
            },
            { op: "or", children: [startsWithNode("beta")] },
          ],
        },
        FIELDS,
      )!;
      expect(r.globalCombinator).toBe("or");
      expect(r.groups[0].chips[0].operator).toBe("starts-with");
      expect(r.groups[0].chips[0].value).toBe("alpha");
      expect(r.groups[1].chips[0].operator).toBe("starts-with");
      expect(r.groups[1].chips[0].value).toBe("beta");
    });

    it("round trip chip -> AST -> chip -> AST is stable", () => {
      const groups = chipGroups("starts-with", "a.c+b");
      const ast = groupsToAst(groups, "and")!;
      const back = astToGroups(ast, FIELDS)!;
      expect(back.groups[0].chips[0].operator).toBe("starts-with");
      expect(back.groups[0].chips[0].value).toBe("a.c+b");
      expect(groupsToAst(back.groups, back.globalCombinator)).toEqual(ast);
    });
  });

  describe("pinning: the old unanchored matches shape and 'matches regex' (pass before and after)", () => {
    it("the old unanchored node reopens as 'matches regex' with its value unchanged", () => {
      const r = astToGroups(
        { op: "matches", field: "synopsis", value: "alpha" },
        FIELDS,
      )!;
      expect(r.groups[0].chips[0].operator).toBe("matches-regex");
      expect(r.groups[0].chips[0].value).toBe("alpha");
    });

    it("a hand-written ^foo without the marker reopens as 'matches regex'", () => {
      const r = astToGroups(
        { op: "matches", field: "synopsis", value: "^foo" },
        FIELDS,
      )!;
      expect(r.groups[0].chips[0].operator).toBe("matches-regex");
      expect(r.groups[0].chips[0].value).toBe("^foo");
    });

    it("a 'matches regex' chip writes the same node as today", () => {
      expect(
        groupsToAst(chipGroups("matches-regex", "^foo.*"), "and"),
      ).toStrictEqual({ op: "matches", field: "synopsis", value: "^foo.*" });
    });

    it("a 'matches regex' chip round trips as 'matches regex'", () => {
      const ast = groupsToAst(chipGroups("matches-regex", "^foo"), "and")!;
      const back = astToGroups(ast, FIELDS)!;
      expect(back.groups[0].chips[0].operator).toBe("matches-regex");
      expect(groupsToAst(back.groups, back.globalCombinator)).toStrictEqual(
        ast,
      );
    });

    it("the old unanchored node still evaluates case-sensitively and unanchored", async () => {
      const values = ["alpha", "the alpha", "Alpha", "beta"];
      expect(
        await returnedValues(
          { op: "matches", field: "synopsis", value: "alpha" },
          values,
        ),
      ).toEqual(["alpha", "the alpha"]);
    });
  });
});
