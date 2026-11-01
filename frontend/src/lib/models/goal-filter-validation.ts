/**
 * @module goal-filter-validation
 *
 * One validator for a writing-goal filter (Feature 98, FR-2, FR-41). The set
 * core and the Writing Goals tab both call it, so a refusal reads the same
 * on every path.
 *
 * A goal filter is a query AST that:
 *   - passes `QueryASTSchema`;
 *   - holds no `ref` or `param` node (a goal never depends on a saved query);
 *   - holds at least one leaf condition;
 *   - stays within `GOAL_FILTER_BOUNDS`;
 *   - holds no clock-dependent condition.
 *
 * Clock-dependent routes (F-15): the evaluator reads the clock in one place,
 * `evaluationTime ?? new Date()` in `evaluate`, and uses it only in the `gte`
 * case when the value is a `{amount, unit}` object (`isRelativeDateValue`).
 * Searching `query-evaluator.ts`, `query-ast.ts`, `query-intrinsics.ts` and
 * `AdvancedModeToggle.tsx` for `new Date`, `Date.now`, `amount` and `today`
 * found no other route; the intrinsic fields read stored values only, and the
 * advanced editor edits the same AST that this validator checks. Calendar-day
 * comparisons (`compareLocalDay`) use the stored stamp and the predicate's
 * date, not the current time.
 *
 * No string-length bound is added: none was needed to bound the walk.
 */
import { QueryASTSchema } from "./query-ast";
import { isRelativeDateValue } from "./query-evaluator";

/** Shared size bounds for a stored goal filter (FR-2). Root node is depth 1. */
export const GOAL_FILTER_BOUNDS = {
  /** Deepest allowed nesting, counting every node on the path. */
  maxDepth: 4,
  /** Most leaf condition nodes allowed in one filter. */
  maxConditions: 50,
} as const;

export type GoalFilterRefusalReason =
  | "schema"
  | "ref"
  | "param"
  | "no-condition"
  | "too-deep"
  | "too-many-conditions"
  | "relative-date";

/** The plain line shown for each refusal. */
export const GOAL_FILTER_MESSAGES: Readonly<
  Record<GoalFilterRefusalReason, string>
> = {
  schema: "This goal filter is not a valid set of conditions.",
  ref: "A goal filter can't refer to a saved query.",
  param: "A goal filter can't refer to a saved query.",
  "no-condition": "A goal filter needs at least one condition.",
  "too-deep": `A goal filter can't nest conditions more than ${GOAL_FILTER_BOUNDS.maxDepth} levels deep.`,
  "too-many-conditions": `A goal filter can't have more than ${GOAL_FILTER_BOUNDS.maxConditions} conditions.`,
  "relative-date":
    "A goal filter can't use a relative date, because the figure would change without any edit.",
};

export type GoalFilterValidation =
  | { ok: true; ast: unknown }
  | { ok: false; reason: GoalFilterRefusalReason; message: string };

interface Walk {
  hasRef: boolean;
  hasParam: boolean;
  hasRelativeDate: boolean;
  conditions: number;
  maxDepth: number;
}

/** Walk a schema-valid AST once, collecting what the checks need. */
function walk(node: unknown, depth: number, acc: Walk): void {
  const n = node as { op: string; children?: unknown[]; child?: unknown };
  if (depth > acc.maxDepth) acc.maxDepth = depth;
  switch (n.op) {
    case "and":
    case "or":
      for (const c of n.children ?? []) walk(c, depth + 1, acc);
      return;
    case "not":
      walk(n.child, depth + 1, acc);
      return;
    case "ref":
      acc.hasRef = true;
      return;
    case "param":
      acc.hasParam = true;
      return;
    default:
      acc.conditions += 1;
      if (
        n.op === "gte" &&
        isRelativeDateValue((n as { value?: unknown }).value)
      ) {
        acc.hasRelativeDate = true;
      }
  }
}

function refuse(reason: GoalFilterRefusalReason): GoalFilterValidation {
  return { ok: false, reason, message: GOAL_FILTER_MESSAGES[reason] };
}

/**
 * Validate a candidate goal filter. Checks run in the order: schema, ref,
 * param, relative date, no condition, depth, condition count. The first
 * failure is returned.
 */
export function validateGoalFilter(input: unknown): GoalFilterValidation {
  let parsed: ReturnType<typeof QueryASTSchema.safeParse>;
  try {
    parsed = QueryASTSchema.safeParse(input);
  } catch {
    // A value nested deeper than the parser can follow is not a valid filter.
    return refuse("schema");
  }
  if (!parsed.success) return refuse("schema");

  const acc: Walk = {
    hasRef: false,
    hasParam: false,
    hasRelativeDate: false,
    conditions: 0,
    maxDepth: 0,
  };
  walk(parsed.data, 1, acc);

  if (acc.hasRef) return refuse("ref");
  if (acc.hasParam) return refuse("param");
  if (acc.hasRelativeDate) return refuse("relative-date");
  if (acc.conditions < 1) return refuse("no-condition");
  if (acc.maxDepth > GOAL_FILTER_BOUNDS.maxDepth) return refuse("too-deep");
  if (acc.conditions > GOAL_FILTER_BOUNDS.maxConditions) {
    return refuse("too-many-conditions");
  }
  return { ok: true, ast: parsed.data };
}
