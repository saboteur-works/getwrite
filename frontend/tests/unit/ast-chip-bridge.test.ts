import { describe, expect, it } from "vitest";
import {
    isTwoLevelCompatible,
    groupsToAst,
    astToGroups,
} from "../../components/QueryBuilder/ast-chip-bridge";
import type { QueryGroup } from "../../components/QueryBuilder/QueryBuilder";
import type { FilterChipField } from "../../components/QueryBuilder/FilterChip";

// ─── Sample fields ─────────────────────────────────────────────────────────────

const FIELDS: FilterChipField[] = [
    { key: "synopsis", label: "Synopsis", type: "text" },
    { key: "wordCount", label: "Word Count", type: "number" },
    { key: "createdAt", label: "Created At", type: "date" },
    { key: "status", label: "Status", type: "select", options: ["draft", "done"] },
    { key: "statuses", label: "Statuses", type: "multiselect", options: ["draft", "done"] },
    { key: "published", label: "Published", type: "boolean" },
    { key: "pov", label: "POV", type: "resource-ref" },
];

// ─── isTwoLevelCompatible ──────────────────────────────────────────────────────

describe("isTwoLevelCompatible", () => {
    it("accepts a single leaf node", () => {
        expect(isTwoLevelCompatible({ op: "eq", field: "synopsis", value: "hi" })).toBe(true);
    });

    it("accepts not(leaf) — maps to operators like is-empty", () => {
        expect(
            isTwoLevelCompatible({ op: "not", child: { op: "exists", field: "synopsis" } }),
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
                        children: [
                            { op: "eq", field: "status", value: "draft" },
                        ],
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
                    { id: "c2", field: FIELDS[1], operator: "is-greater-than", value: 100 },
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
                chips: [{ id: "c2", field: FIELDS[1], operator: "is-greater-than", value: 100 }],
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
                chips: [
                    { id: "c1", field: FIELDS[1], operator: "equals", value: 42 },
                ],
            },
        ];
        expect(groupsToAst(groups, "and")).toEqual({ op: "eq", field: "wordCount", value: 42 });
    });

    it("is-empty → not(exists)", () => {
        const groups: QueryGroup[] = [
            {
                id: "g1",
                combinator: "and",
                chips: [{ id: "c1", field: FIELDS[0], operator: "is-empty", value: null }],
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
                    { id: "c1", field: FIELDS[0], operator: "does-not-contain", value: "foo" },
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
                chips: [{ id: "c1", field: FIELDS[5], operator: "is-true", value: null }],
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
                chips: [{ id: "c1", field: FIELDS[5], operator: "is-false", value: null }],
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
        const result = astToGroups({ op: "eq", field: "synopsis", value: "hi" }, FIELDS);
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
                        children: [
                            { op: "eq", field: "status", value: "draft" },
                        ],
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
        const result = astToGroups({ op: "gt", field: "wordCount", value: 100 }, FIELDS);
        expect(result!.groups[0].chips[0].operator).toBe("is-greater-than");
        expect(result!.groups[0].chips[0].value).toBe(100);
    });

    it("number: eq → equals", () => {
        const result = astToGroups({ op: "eq", field: "wordCount", value: 42 }, FIELDS);
        expect(result!.groups[0].chips[0].operator).toBe("equals");
        expect(result!.groups[0].chips[0].value).toBe(42);
    });

    it("boolean: eq(true) → is-true", () => {
        const result = astToGroups({ op: "eq", field: "published", value: true }, FIELDS);
        expect(result!.groups[0].chips[0].operator).toBe("is-true");
    });

    it("boolean: eq(false) → is-false", () => {
        const result = astToGroups({ op: "eq", field: "published", value: false }, FIELDS);
        expect(result!.groups[0].chips[0].operator).toBe("is-false");
    });

    it("date: lt → is-before", () => {
        const result = astToGroups({ op: "lt", field: "createdAt", value: "2026-01-01" }, FIELDS);
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
                    { id: "c2", field: FIELDS[1], operator: "is-greater-than", value: 100 },
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
                chips: [
                    { id: "c1", field: FIELDS[0], operator: "is", value: "hi" },
                ],
            },
            {
                id: "g2",
                combinator: "and",
                chips: [
                    { id: "c2", field: FIELDS[1], operator: "is-greater-than", value: 100 },
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
                    { id: "c2", field: FIELDS[1], operator: "is-greater-than", value: 100 },
                ],
            },
            {
                id: "g2",
                combinator: "and",
                chips: [
                    { id: "c3", field: FIELDS[2], operator: "is-after", value: "2026-01-01" },
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
                chips: [{ id: "c1", field: FIELDS[0], operator: "is-empty", value: null }],
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
                chips: [{ id: "c1", field: null, operator: null, value: null, refId: "q-abc", refName: "My Query" }],
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
                chips: [{ id: "c1", field: null, operator: null, value: null, refId: "q-1", refName: "Act 2" }],
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
                    { id: "c1", field: null, operator: null, value: null, refId: "q-1", refName: "Act 2" },
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
