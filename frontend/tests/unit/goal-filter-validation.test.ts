import { describe, it, expect } from "vitest";
import {
  GOAL_FILTER_BOUNDS,
  GOAL_FILTER_MESSAGES,
  validateGoalFilter,
  type GoalFilterRefusalReason,
} from "../../src/lib/models/goal-filter-validation";
import { isRelativeDateValue } from "../../src/lib/models/query-evaluator";

const leaf = (n = 0) => ({ op: "eq", field: "status", value: `s${n}` });

/** A chain of `and` nodes with one leaf at the bottom; `depth` counts nodes. */
function chain(depth: number): unknown {
  let node: unknown = leaf();
  for (let i = 1; i < depth; i += 1) {
    node = { op: "and", children: [node] };
  }
  return node;
}

function manyLeaves(n: number): unknown {
  return { op: "or", children: Array.from({ length: n }, (_, i) => leaf(i)) };
}

function refusal(input: unknown): {
  reason: GoalFilterRefusalReason;
  message: string;
} {
  const result = validateGoalFilter(input);
  if (result.ok) throw new Error("expected a refusal");
  return { reason: result.reason, message: result.message };
}

const RELATIVE_NODE = {
  op: "gte",
  field: "updatedAt",
  value: { amount: 7, unit: "days" },
};

describe("validateGoalFilter", () => {
  it("accepts a valid filter and returns the AST", () => {
    const ast = {
      op: "and",
      children: [leaf(), { op: "not", child: { op: "exists", field: "pov" } }],
    };
    expect(validateGoalFilter(ast)).toEqual({ ok: true, ast });
  });

  it("accepts a single leaf (depth 1)", () => {
    expect(validateGoalFilter(leaf()).ok).toBe(true);
  });

  it("refuses a schema failure", () => {
    expect(refusal({ op: "nope" }).reason).toBe("schema");
    expect(refusal(null).reason).toBe("schema");
    expect(refusal("x").reason).toBe("schema");
  });

  it("refuses a ref node with the saved-query line", () => {
    const r = refusal({
      op: "and",
      children: [leaf(), { op: "ref", id: "q" }],
    });
    expect(r.reason).toBe("ref");
    expect(r.message).toBe("A goal filter can't refer to a saved query.");
  });

  it("refuses a param node as its own reason", () => {
    const r = refusal({
      op: "or",
      children: [leaf(), { op: "param", name: "p" }],
    });
    expect(r.reason).toBe("param");
    expect(r.message).toBe("A goal filter can't refer to a saved query.");
  });

  it("refuses a filter with no complete condition", () => {
    expect(refusal({ op: "and", children: [] }).reason).toBe("no-condition");
    expect(
      refusal({ op: "not", child: { op: "or", children: [] } }).reason,
    ).toBe("no-condition");
  });

  it("accepts depth 4 and refuses depth 5", () => {
    expect(GOAL_FILTER_BOUNDS.maxDepth).toBe(4);
    expect(validateGoalFilter(chain(4)).ok).toBe(true);
    expect(refusal(chain(5)).reason).toBe("too-deep");
  });

  it("accepts 50 condition nodes and refuses 51", () => {
    expect(GOAL_FILTER_BOUNDS.maxConditions).toBe(50);
    expect(validateGoalFilter(manyLeaves(50)).ok).toBe(true);
    expect(refusal(manyLeaves(51)).reason).toBe("too-many-conditions");
  });

  it("refuses a gte with an {amount, unit} value, at any depth", () => {
    const expected =
      "A goal filter can't use a relative date, because the figure would change without any edit.";
    const top = refusal(RELATIVE_NODE);
    expect(top.reason).toBe("relative-date");
    expect(top.message).toBe(expected);
    expect(
      refusal({
        op: "and",
        children: [leaf(), { op: "not", child: RELATIVE_NODE }],
      }).reason,
    ).toBe("relative-date");
  });

  it("accepts a gte with an absolute date", () => {
    expect(
      validateGoalFilter({ op: "gte", field: "updatedAt", value: "2026-01-01" })
        .ok,
    ).toBe(true);
  });

  it("gives every refusal its own typed reason", () => {
    const reasons = new Set<GoalFilterRefusalReason>([
      refusal({ op: "nope" }).reason,
      refusal({ op: "ref", id: "q" }).reason,
      refusal({ op: "param", name: "p" }).reason,
      refusal({ op: "and", children: [] }).reason,
      refusal(chain(5)).reason,
      refusal(manyLeaves(51)).reason,
      refusal(RELATIVE_NODE).reason,
    ]);
    expect(reasons.size).toBe(7);
    expect(GOAL_FILTER_MESSAGES.ref).toBe(
      "A goal filter can't refer to a saved query.",
    );
  });

  it("uses the evaluator's isRelativeDateValue", () => {
    expect(isRelativeDateValue({ amount: 1, unit: "days" })).toBe(true);
    expect(isRelativeDateValue("2026-01-01")).toBe(false);
  });
});
