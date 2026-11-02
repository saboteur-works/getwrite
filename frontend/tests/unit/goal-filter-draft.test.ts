import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildGoalFilterDraft,
  prepareGoalFilterSave,
  GOAL_FILTER_DRAFT_MESSAGES,
} from "../../src/lib/goal-filter-draft";
import {
  GOAL_FILTER_BOUNDS,
  GOAL_FILTER_MESSAGES,
} from "../../src/lib/models/goal-filter-validation";
import { groupsToAst } from "../../components/QueryBuilder/ast-chip-bridge";
import type { FilterChipField } from "../../components/QueryBuilder/FilterChip";
import type { QueryGroup } from "../../components/QueryBuilder/QueryBuilder";

const FIELDS: FilterChipField[] = [
  { key: "status", label: "Status", type: "text" },
  { key: "wordCount", label: "Word count", type: "number" },
];

const statusEq = { op: "eq", field: "status", value: "draft" };
const goneEq = { op: "eq", field: "removedField", value: "x" };

function expectOk(draft: ReturnType<typeof buildGoalFilterDraft>) {
  if (draft.status !== "ok")
    throw new Error(`expected ok, got ${draft.status}`);
  return draft;
}

describe("buildGoalFilterDraft", () => {
  it("turns a stored AST into groups with no missing fields", () => {
    const draft = expectOk(buildGoalFilterDraft(statusEq, FIELDS));
    expect(draft.groups).toHaveLength(1);
    expect(draft.groups[0].chips[0].field?.key).toBe("status");
    expect(draft.missingFieldKeys).toEqual([]);
  });

  it("gives an empty draft for no stored filter", () => {
    const draft = expectOk(buildGoalFilterDraft(undefined, FIELDS));
    expect(draft.groups).toEqual([]);
    expect(draft.missingFieldKeys).toEqual([]);
  });

  it("keeps a condition on an unknown field visible with its key and flag", () => {
    const ast = { op: "and", children: [statusEq, goneEq] };
    const draft = expectOk(buildGoalFilterDraft(ast, FIELDS));
    expect(draft.missingFieldKeys).toEqual(["removedField"]);
    expect(draft.missingFieldMessage).toBe("This field no longer exists.");
    const chip = draft.groups[0].chips.find(
      (c) => c.field?.key === "removedField",
    );
    expect(chip).toBeDefined();
    expect(chip?.field?.label).toBe("removedField");
    expect(draft.fields.map((f) => f.key)).toContain("removedField");
    // The caller's own field list is not mutated.
    expect(FIELDS.map((f) => f.key)).not.toContain("removedField");
  });

  it("does not drop an unknown-field condition on a no-change rebuild (F-5)", () => {
    const ast = { op: "and", children: [statusEq, goneEq] };
    const draft = expectOk(buildGoalFilterDraft(ast, FIELDS));
    expect(groupsToAst(draft.groups, draft.globalCombinator)).toEqual(ast);
    const save = prepareGoalFilterSave(draft.groups, draft.globalCombinator);
    expect(save).toEqual({ ok: true, ast });
  });

  it("keeps a lone unknown-field condition through a rebuild", () => {
    const draft = expectOk(buildGoalFilterDraft(goneEq, FIELDS));
    expect(draft.missingFieldKeys).toEqual(["removedField"]);
    expect(groupsToAst(draft.groups, draft.globalCombinator)).toEqual(goneEq);
  });

  it("keeps an unknown field inside a not and a numeric value", () => {
    const ast = {
      op: "or",
      children: [
        { op: "not", child: { op: "exists", field: "gone2" } },
        { op: "gt", field: "gone3", value: 4 },
      ],
    };
    const draft = expectOk(buildGoalFilterDraft(ast, FIELDS));
    expect([...draft.missingFieldKeys].sort()).toEqual(["gone2", "gone3"]);
    expect(groupsToAst(draft.groups, draft.globalCombinator)).toEqual(ast);
  });

  it("flags an AST nested deeper than two levels", () => {
    const ast = {
      op: "and",
      children: [{ op: "or", children: [{ op: "and", children: [statusEq] }] }],
    };
    const draft = buildGoalFilterDraft(ast, FIELDS);
    expect(draft.status).toBe("invalid");
    if (draft.status === "invalid") {
      expect(draft.reason).toBe("not-editable");
      expect(draft.message).toBe(GOAL_FILTER_DRAFT_MESSAGES.notEditable);
    }
  });

  it("flags an AST beyond the shared depth bound", () => {
    let node: unknown = statusEq;
    for (let i = 1; i < GOAL_FILTER_BOUNDS.maxDepth + 1; i += 1) {
      node = { op: "and", children: [node] };
    }
    const draft = buildGoalFilterDraft(node, FIELDS);
    expect(draft.status).toBe("invalid");
    if (draft.status === "invalid") {
      expect(draft.reason).toBe("too-deep");
      expect(draft.message).toBe(GOAL_FILTER_MESSAGES["too-deep"]);
    }
  });

  it("flags an AST beyond the shared condition bound", () => {
    const ast = {
      op: "or",
      children: Array.from(
        { length: GOAL_FILTER_BOUNDS.maxConditions + 1 },
        (_, i) => ({ op: "eq", field: "status", value: `s${i}` }),
      ),
    };
    const draft = buildGoalFilterDraft(ast, FIELDS);
    expect(draft.status).toBe("invalid");
    if (draft.status === "invalid") {
      expect(draft.reason).toBe("too-many-conditions");
    }
  });

  it("flags a stored ref and a stored relative date", () => {
    const ref = buildGoalFilterDraft({ op: "ref", id: "q1" }, FIELDS);
    expect(ref.status === "invalid" && ref.reason).toBe("ref");
    const rel = buildGoalFilterDraft(
      { op: "gte", field: "updatedAt", value: { amount: 7, unit: "days" } },
      FIELDS,
    );
    expect(rel.status === "invalid" && rel.reason).toBe("relative-date");
  });

  it("flags a stored value that is not an AST", () => {
    const draft = buildGoalFilterDraft({ nonsense: true }, FIELDS);
    expect(draft.status === "invalid" && draft.reason).toBe("schema");
  });

  it("flags a link condition the builder cannot show instead of dropping it", () => {
    const draft = buildGoalFilterDraft({ op: "linksTo", target: "r1" }, FIELDS);
    expect(draft.status).toBe("invalid");
  });
});

describe("prepareGoalFilterSave", () => {
  const complete: QueryGroup = {
    id: "g1",
    combinator: "and",
    chips: [{ id: "c1", field: FIELDS[0], operator: "is", value: "draft" }],
  };

  it("returns the AST for complete chips", () => {
    expect(prepareGoalFilterSave([complete], "and")).toEqual({
      ok: true,
      ast: statusEq,
    });
  });

  it("refuses an incomplete chip with no field", () => {
    const groups: QueryGroup[] = [
      {
        ...complete,
        chips: [
          ...complete.chips,
          { id: "c2", field: null, operator: null, value: null },
        ],
      },
    ];
    expect(prepareGoalFilterSave(groups, "and")).toEqual({
      ok: false,
      reason: "incomplete",
      message: "Finish or remove the incomplete conditions.",
    });
  });

  it("refuses a chip with a field but no operator", () => {
    const groups: QueryGroup[] = [
      {
        ...complete,
        chips: [{ id: "c2", field: FIELDS[0], operator: null, value: null }],
      },
    ];
    const result = prepareGoalFilterSave(groups, "and");
    expect(result.ok === false && result.reason).toBe("incomplete");
  });

  it("refuses a relative-date condition with the FR-41 line", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          {
            id: "c1",
            field: { key: "updatedAt", label: "Updated", type: "date" },
            operator: "in-the-last",
            value: { amount: 7, unit: "days" },
          },
        ],
      },
    ];
    expect(prepareGoalFilterSave(groups, "and")).toEqual({
      ok: false,
      reason: "relative-date",
      message:
        "A goal filter can't use a relative date, because the figure would change without any edit.",
    });
  });

  it("refuses a ref chip with the saved-query line", () => {
    const groups: QueryGroup[] = [
      {
        id: "g1",
        combinator: "and",
        chips: [
          { id: "c1", field: null, operator: null, value: null, refId: "q1" },
        ],
      },
    ];
    const result = prepareGoalFilterSave(groups, "and");
    expect(result.ok === false && result.message).toBe(
      "A goal filter can't refer to a saved query.",
    );
  });

  it("refuses an empty builder", () => {
    const result = prepareGoalFilterSave([], "and");
    expect(result.ok === false && result.reason).toBe("no-condition");
  });

  it("refuses more conditions than the shared bound", () => {
    const chips = Array.from(
      { length: GOAL_FILTER_BOUNDS.maxConditions + 1 },
      (_, i) => ({
        id: `c${i}`,
        field: FIELDS[0],
        operator: "is",
        value: `s${i}`,
      }),
    );
    const result = prepareGoalFilterSave(
      [{ id: "g", combinator: "or", chips }],
      "and",
    );
    expect(result.ok === false && result.reason).toBe("too-many-conditions");
  });
});

describe("goal-filter-draft source", () => {
  it("imports the shared bounds constant and defines no bounds of its own", () => {
    const source = readFileSync(
      resolve(__dirname, "../../src/lib/goal-filter-draft.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /import[^;]*GOAL_FILTER_BOUNDS[^;]*from "\.\/models\/goal-filter-validation"/,
    );
    expect(source).not.toMatch(/maxDepth\s*[:=]|maxConditions\s*[:=]/);
  });
});
