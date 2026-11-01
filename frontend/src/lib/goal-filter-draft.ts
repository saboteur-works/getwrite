/**
 * @module goal-filter-draft
 *
 * Tab-side helpers for the writing-goal filter (Feature 98, FR-2, FR-8, FR-22,
 * FR-41). Pure functions that wrap the query builder's chip bridge, read-only:
 *
 *  - `buildGoalFilterDraft` turns a stored AST into builder groups. A
 *    condition on a field the project's field list lacks is kept: the draft
 *    carries a placeholder field with that key so the bridge does not drop the
 *    chip, and the key is listed in `missingFieldKeys` (F-5).
 *  - `prepareGoalFilterSave` turns builder groups back into an AST and runs
 *    the shared validator, so the tab refuses what the core refuses.
 *
 * Size bounds come from `GOAL_FILTER_BOUNDS`; none are defined here.
 */
import type { QueryAST } from "./models/query-ast";
import {
  GOAL_FILTER_BOUNDS,
  GOAL_FILTER_MESSAGES,
  validateGoalFilter,
  type GoalFilterRefusalReason,
} from "./models/goal-filter-validation";
import {
  astToGroups,
  groupsToAst,
} from "../../components/QueryBuilder/ast-chip-bridge";
import type { FilterChipField } from "../../components/QueryBuilder/FilterChip";
import type {
  GlobalCombinator,
  QueryGroup,
} from "../../components/QueryBuilder/QueryBuilder";

/** Lines the tab shows that the shared validator does not own. */
export const GOAL_FILTER_DRAFT_MESSAGES = {
  missingField: "This field no longer exists.",
  incomplete: "Finish or remove the incomplete conditions.",
  notEditable:
    "This goal filter has a shape the builder can't show. Change it or clear it.",
} as const;

export type GoalFilterDraft =
  | {
      status: "ok";
      groups: QueryGroup[];
      globalCombinator: GlobalCombinator;
      /** The caller's fields plus a placeholder for each missing key. */
      fields: FilterChipField[];
      /** Field keys in the stored filter that the field list lacks. */
      missingFieldKeys: string[];
      missingFieldMessage: typeof GOAL_FILTER_DRAFT_MESSAGES.missingField;
    }
  | {
      status: "invalid";
      reason: GoalFilterRefusalReason | "not-editable";
      message: string;
    };

export type GoalFilterSaveResult =
  | { ok: true; ast: unknown }
  | {
      ok: false;
      reason: GoalFilterRefusalReason | "incomplete";
      message: string;
    };

function collectLeaves(node: QueryAST, out: QueryAST[]): void {
  if (node.op === "and" || node.op === "or") {
    for (const child of node.children) collectLeaves(child, out);
  } else if (node.op === "not") {
    collectLeaves(node.child, out);
  } else {
    out.push(node);
  }
}

/** Placeholder fields for leaf field keys that the field list lacks. */
function placeholderFields(
  ast: QueryAST,
  fields: FilterChipField[],
): FilterChipField[] {
  const known = new Set(fields.map((f) => f.key));
  const leaves: QueryAST[] = [];
  collectLeaves(ast, leaves);
  const placeholders = new Map<string, FilterChipField>();
  for (const leaf of leaves) {
    if (!("field" in leaf) || known.has(leaf.field)) continue;
    if (placeholders.has(leaf.field)) continue;
    const isNumber = "value" in leaf && typeof leaf.value === "number";
    placeholders.set(leaf.field, {
      key: leaf.field,
      label: leaf.field,
      type: isNumber ? "number" : "text",
    });
  }
  return [...placeholders.values()];
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined);
  const otherKeys = Object.keys(right).filter((k) => right[k] !== undefined);
  if (keys.length !== otherKeys.length) return false;
  return keys.every((k) => sameValue(left[k], right[k]));
}

/**
 * Build the builder state for a stored filter. `undefined` or `null` is an
 * empty draft. A stored value the shared validator refuses, or that the
 * builder cannot show without changing it, is returned as `invalid` and never
 * partly shown.
 */
export function buildGoalFilterDraft(
  stored: unknown,
  fields: FilterChipField[],
): GoalFilterDraft {
  if (stored === undefined || stored === null) {
    return {
      status: "ok",
      groups: [],
      globalCombinator: "and",
      fields,
      missingFieldKeys: [],
      missingFieldMessage: GOAL_FILTER_DRAFT_MESSAGES.missingField,
    };
  }
  const checked = validateGoalFilter(stored);
  if (!checked.ok) {
    return {
      status: "invalid",
      reason: checked.reason,
      message: checked.message,
    };
  }
  const ast = checked.ast as QueryAST;
  const placeholders = placeholderFields(ast, fields);
  const allFields = [...fields, ...placeholders];
  const bridged = astToGroups(ast, allFields);
  const notEditable: GoalFilterDraft = {
    status: "invalid",
    reason: "not-editable",
    message: GOAL_FILTER_DRAFT_MESSAGES.notEditable,
  };
  if (!bridged) return notEditable;
  // The bridge drops what it cannot represent (a link condition, for one).
  // Showing a filter that saves back as something else would hide the change.
  const rebuilt = groupsToAst(bridged.groups, bridged.globalCombinator);
  if (!sameValue(rebuilt, ast)) return notEditable;
  return {
    status: "ok",
    groups: bridged.groups,
    globalCombinator: bridged.globalCombinator,
    fields: allFields,
    missingFieldKeys: placeholders.map((p) => p.key),
    missingFieldMessage: GOAL_FILTER_DRAFT_MESSAGES.missingField,
  };
}

function refused(
  reason: GoalFilterRefusalReason | "incomplete",
  message: string,
): GoalFilterSaveResult {
  return { ok: false, reason, message };
}

/**
 * Turn builder state into the AST to save, or the line to show. An incomplete
 * chip (no field or no operator, and not a ref) is refused rather than
 * dropped (FR-22); everything else is the shared validator's verdict.
 */
export function prepareGoalFilterSave(
  groups: QueryGroup[],
  globalCombinator: GlobalCombinator,
): GoalFilterSaveResult {
  const chips = groups.flatMap((g) => g.chips);
  if (chips.some((c) => !c.refId && (!c.field || !c.operator))) {
    return refused("incomplete", GOAL_FILTER_DRAFT_MESSAGES.incomplete);
  }
  if (chips.length > GOAL_FILTER_BOUNDS.maxConditions) {
    return refused(
      "too-many-conditions",
      GOAL_FILTER_MESSAGES["too-many-conditions"],
    );
  }
  const ast = groupsToAst(groups, globalCombinator);
  if (ast === null) {
    return refused("no-condition", GOAL_FILTER_MESSAGES["no-condition"]);
  }
  const checked = validateGoalFilter(ast);
  if (!checked.ok) return refused(checked.reason, checked.message);
  return { ok: true, ast: checked.ast };
}
