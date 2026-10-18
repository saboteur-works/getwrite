import type {
  QueryAST,
  LeafNode,
  AndNode,
  OrNode,
  NotNode,
  RefNode,
} from "../../src/lib/models/query-ast";
import type { MetadataValue } from "../../src/lib/models/types";
import { escapeRegExp } from "../../src/lib/models/entity-detection";
import { isRelativeDateValue } from "./operator-utils";
import type { FilterChipField, FilterChipValue } from "./FilterChip";
import type { GroupChip, GroupCombinator } from "./FilterGroup";
import type { GlobalCombinator, QueryGroup } from "./QueryBuilder";

/**
 * The typed text of a saved "starts with" (Feature 86 FR-32): the node carries
 * `caseInsensitive: true` and a value of `^` plus a regex-escaped literal.
 * Returns `null` for anything else, which reopens as "matches regex".
 */
function startsWithTypedText(node: {
  value: string;
  caseInsensitive?: boolean;
}): string | null {
  if (node.caseInsensitive !== true || !node.value.startsWith("^")) return null;
  const rest = node.value.slice(1);
  const typed = rest.replace(/\\(.)/g, "$1");
  return escapeRegExp(typed) === rest ? typed : null;
}

// ─── Node classification ──────────────────────────────────────────────────────

const LEAF_OPS = new Set([
  "eq",
  "ne",
  "lt",
  "gt",
  "gte",
  "lte",
  "in",
  "exists",
  "contains",
  "matches",
  "linksTo",
  "linkedFrom",
]);

function isLeaf(node: QueryAST): node is LeafNode {
  return LEAF_OPS.has(node.op);
}

/** A chip-compatible node is a leaf, not(leaf), or a ref splice node. */
function isChipNode(node: QueryAST): node is LeafNode | NotNode | RefNode {
  if (isLeaf(node)) return true;
  if (node.op === "not") return isLeaf(node.child);
  if (node.op === "ref") return true;
  return false;
}

/** A group-compatible node is a chip node or and/or([chip-nodes]). */
function isGroupNode(
  node: QueryAST,
): node is LeafNode | NotNode | AndNode | OrNode {
  if (isChipNode(node)) return true;
  if (node.op === "and" || node.op === "or") {
    return node.children.length > 0 && node.children.every(isChipNode);
  }
  return false;
}

/**
 * Returns true when the AST can be fully represented in the two-level chip
 * UI (groups of chips joined by a single global combinator).
 */
export function isTwoLevelCompatible(ast: QueryAST): boolean {
  if (isChipNode(ast)) return true;
  if (ast.op !== "and" && ast.op !== "or") return false;
  // Single group: and/or([chip-nodes])
  if (ast.children.every(isChipNode)) return true;
  // Multi-group: and/or([group-nodes])
  return ast.children.length > 0 && ast.children.every(isGroupNode);
}

// ─── chip → AST ──────────────────────────────────────────────────────────────

function toMeta(v: FilterChipValue): MetadataValue {
  return v as MetadataValue;
}

function chipToAst(chip: GroupChip): QueryAST | null {
  if (chip.refId) return { op: "ref", id: chip.refId };
  if (!chip.field || !chip.operator) return null;
  const f = chip.field.key;
  const v = chip.value;

  switch (chip.operator) {
    // text
    case "is":
      return { op: "eq", field: f, value: toMeta(v) };
    case "is-not":
      return { op: "ne", field: f, value: toMeta(v) };
    case "contains":
      return { op: "contains", field: f, value: String(v ?? "") };
    case "does-not-contain":
      return {
        op: "not",
        child: { op: "contains", field: f, value: String(v ?? "") },
      };
    case "starts-with":
      return {
        op: "matches",
        field: f,
        value: `^${escapeRegExp(String(v ?? ""))}`,
        caseInsensitive: true,
      };
    case "matches-regex":
      return { op: "matches", field: f, value: String(v ?? "") };
    // number
    case "equals":
      return { op: "eq", field: f, value: toMeta(v) };
    case "does-not-equal":
      return { op: "ne", field: f, value: toMeta(v) };
    case "is-less-than":
      return { op: "lt", field: f, value: toMeta(v) };
    case "is-at-most":
      return { op: "lte", field: f, value: toMeta(v) };
    case "is-greater-than":
      return { op: "gt", field: f, value: toMeta(v) };
    case "is-at-least":
      return { op: "gte", field: f, value: toMeta(v) };
    case "is-between": {
      const range =
        v !== null && typeof v === "object" && "from" in v && "to" in v
          ? (v as { from: number | string; to: number | string })
          : { from: 0, to: 0 };
      return {
        op: "and",
        children: [
          { op: "gte", field: f, value: range.from as MetadataValue },
          { op: "lte", field: f, value: range.to as MetadataValue },
        ],
      };
    }
    // date
    case "is-on":
      return { op: "eq", field: f, value: toMeta(v) };
    case "is-before":
      return { op: "lt", field: f, value: toMeta(v) };
    case "is-after":
      return { op: "gt", field: f, value: toMeta(v) };
    case "in-the-last":
      return { op: "gte", field: f, value: toMeta(v) };
    // boolean
    case "is-true":
      return { op: "eq", field: f, value: true };
    case "is-false":
      return { op: "eq", field: f, value: false };
    // select / resource-ref
    case "is-any-of":
      return { op: "in", field: f, value: toMeta(v) };
    case "is-none-of":
      return { op: "not", child: { op: "in", field: f, value: toMeta(v) } };
    // multiselect / multi-resource-ref
    case "includes":
      return { op: "in", field: f, value: toMeta(v) };
    case "does-not-include":
      return { op: "not", child: { op: "in", field: f, value: toMeta(v) } };
    case "includes-all-of":
      return {
        op: "and",
        children: [{ op: "in", field: f, value: toMeta(v) }],
      };
    case "includes-any-of":
      return { op: "or", children: [{ op: "in", field: f, value: toMeta(v) }] };
    case "includes-none-of":
      return {
        op: "not",
        child: {
          op: "or",
          children: [{ op: "in", field: f, value: toMeta(v) }],
        },
      };
    // universal
    case "is-empty":
      return { op: "not", child: { op: "exists", field: f } };
    case "has-any-value":
      return { op: "exists", field: f };
    default:
      return null;
  }
}

function groupToAst(group: QueryGroup): QueryAST | null {
  const chipAsts = group.chips
    .map(chipToAst)
    .filter((a): a is QueryAST => a !== null);
  if (chipAsts.length === 0) return null;
  if (chipAsts.length === 1) return chipAsts[0];
  return { op: group.combinator, children: chipAsts };
}

/**
 * Converts the chip-level query state into a single QueryAST.
 * Returns null if there are no valid chips.
 */
export function groupsToAst(
  groups: QueryGroup[],
  globalCombinator: GlobalCombinator,
): QueryAST | null {
  const groupAsts = groups
    .map(groupToAst)
    .filter((a): a is QueryAST => a !== null);
  if (groupAsts.length === 0) return null;
  if (groupAsts.length === 1) return groupAsts[0];
  return { op: globalCombinator, children: groupAsts };
}

// ─── AST → chip ──────────────────────────────────────────────────────────────

let _chipIdCounter = 1000;
let _groupIdCounter = 100;

function nextChipId(): string {
  return `bridge-c${_chipIdCounter++}`;
}

function nextGroupId(): string {
  return `bridge-g${_groupIdCounter++}`;
}

function fieldFor(
  key: string,
  fields: FilterChipField[],
): FilterChipField | null {
  return fields.find((f) => f.key === key) ?? null;
}

function comparisonToOperator(
  astOp: "eq" | "ne" | "lt" | "lte" | "gt" | "gte",
  fieldType: string | undefined,
  value: MetadataValue,
): string {
  if (astOp === "eq") {
    if (value === true) return "is-true";
    if (value === false) return "is-false";
    if (fieldType === "number") return "equals";
    if (fieldType === "date") return "is-on";
    return "is"; // text, select, resource-ref
  }
  if (astOp === "ne") {
    return fieldType === "number" ? "does-not-equal" : "is-not";
  }
  if (astOp === "lt")
    return fieldType === "date" ? "is-before" : "is-less-than";
  if (astOp === "lte") return "is-at-most";
  if (astOp === "gt")
    return fieldType === "date" ? "is-after" : "is-greater-than";
  if (astOp === "gte") {
    if (fieldType === "date" && isRelativeDateValue(value))
      return "in-the-last";
    return fieldType === "number" ? "is-at-least" : "is-after";
  }
  return "is";
}

function astNodeToChip(
  node: LeafNode | NotNode | RefNode,
  fields: FilterChipField[],
  savedQueries?: Array<{ id: string; name: string }>,
): GroupChip | null {
  const id = nextChipId();

  if (node.op === "ref") {
    const refName = savedQueries?.find((q) => q.id === node.id)?.name;
    return {
      id,
      field: null,
      operator: null,
      value: null,
      refId: node.id,
      refName,
    };
  }

  if (node.op === "not") {
    const inner = node.child;
    if (inner.op === "exists") {
      return {
        id,
        field: fieldFor(inner.field, fields),
        operator: "is-empty",
        value: null,
      };
    }
    if (inner.op === "contains") {
      return {
        id,
        field: fieldFor(inner.field, fields),
        operator: "does-not-contain",
        value: inner.value as FilterChipValue,
      };
    }
    if (inner.op === "in") {
      const field = fieldFor(inner.field, fields);
      const isMulti =
        field?.type === "multiselect" || field?.type === "multi-resource-ref";
      return {
        id,
        field,
        operator: isMulti ? "does-not-include" : "is-none-of",
        value: inner.value as FilterChipValue,
      };
    }
    return null;
  }

  if (node.op === "exists") {
    return {
      id,
      field: fieldFor(node.field, fields),
      operator: "has-any-value",
      value: null,
    };
  }

  if (node.op === "contains") {
    return {
      id,
      field: fieldFor(node.field, fields),
      operator: "contains",
      value: node.value as FilterChipValue,
    };
  }

  if (node.op === "matches") {
    const typed = startsWithTypedText(node);
    if (typed !== null) {
      return {
        id,
        field: fieldFor(node.field, fields),
        operator: "starts-with",
        value: typed as FilterChipValue,
      };
    }
    return {
      id,
      field: fieldFor(node.field, fields),
      operator: "matches-regex",
      value: node.value as FilterChipValue,
    };
  }

  if (node.op === "in") {
    const field = fieldFor(node.field, fields);
    const isMulti =
      field?.type === "multiselect" || field?.type === "multi-resource-ref";
    return {
      id,
      field,
      operator: isMulti ? "includes" : "is-any-of",
      value: node.value as FilterChipValue,
    };
  }

  // linksTo / linkedFrom — no field key mapping in chip UI
  if (node.op === "linksTo" || node.op === "linkedFrom") {
    return null;
  }

  // Comparison nodes: eq, ne, lt, lte, gt, gte
  if ("field" in node && "value" in node) {
    const field = fieldFor(node.field, fields);
    const operator = comparisonToOperator(
      node.op as "eq" | "ne" | "lt" | "lte" | "gt" | "gte",
      field?.type,
      node.value,
    );
    // Boolean operators carry their value in the operator name, not the chip value
    const isBoolOp = operator === "is-true" || operator === "is-false";
    return {
      id,
      field,
      operator,
      value: isBoolOp ? null : (node.value as FilterChipValue),
    };
  }

  return null;
}

/**
 * `and` with exactly one `in` child on a multiselect or multi-resource-ref
 * field is the saved shape of an "includes all of" chip (`chipToAst`). Any
 * other field type, or an unknown field, is not reinterpreted.
 */
function allOfChip(
  node: QueryAST,
  fields: FilterChipField[],
): GroupChip | null {
  if (node.op !== "and" || node.children.length !== 1) return null;
  const inner = node.children[0];
  if (inner.op !== "in") return null;
  const field = fieldFor(inner.field, fields);
  if (field?.type !== "multiselect" && field?.type !== "multi-resource-ref") {
    return null;
  }
  return {
    id: nextChipId(),
    field,
    operator: "includes-all-of",
    value: inner.value as FilterChipValue,
  };
}

function astNodeToGroup(
  node: LeafNode | NotNode | AndNode | OrNode | RefNode,
  fields: FilterChipField[],
  savedQueries?: Array<{ id: string; name: string }>,
): QueryGroup | null {
  const id = nextGroupId();
  if (isChipNode(node)) {
    const chip = astNodeToChip(node, fields, savedQueries);
    if (!chip) return null;
    return { id, combinator: "and", chips: [chip] };
  }
  const allOf = allOfChip(node, fields);
  if (allOf) return { id, combinator: "and", chips: [allOf] };
  if (node.op === "and" || node.op === "or") {
    const chips = node.children
      .filter(isChipNode)
      .map((c) => astNodeToChip(c, fields, savedQueries))
      .filter((c): c is GroupChip => c !== null);
    return { id, combinator: node.op as GroupCombinator, chips };
  }
  return null;
}

/**
 * Converts a QueryAST back to chip groups. Returns null if the AST is not
 * two-level compatible (use `isTwoLevelCompatible` to check first).
 *
 * Pass `savedQueries` to resolve `ref` node IDs to human-readable names on
 * the resulting ref chips.
 */
export function astToGroups(
  ast: QueryAST,
  fields: FilterChipField[],
  savedQueries?: Array<{ id: string; name: string }>,
): { groups: QueryGroup[]; globalCombinator: GlobalCombinator } | null {
  if (!isTwoLevelCompatible(ast)) return null;

  // Single chip node
  if (isChipNode(ast)) {
    const chip = astNodeToChip(ast, fields, savedQueries);
    if (!chip) return null;
    return {
      groups: [{ id: nextGroupId(), combinator: "and", chips: [chip] }],
      globalCombinator: "and",
    };
  }

  if (ast.op !== "and" && ast.op !== "or") return null;

  const allOf = allOfChip(ast, fields);
  if (allOf) {
    return {
      groups: [{ id: nextGroupId(), combinator: "and", chips: [allOf] }],
      globalCombinator: "and",
    };
  }

  const hasOnlyChipChildren = ast.children.every(isChipNode);

  if (hasOnlyChipChildren) {
    // Single group: the and/or IS the group combinator
    const chips = ast.children
      .filter(isChipNode)
      .map((c) => astNodeToChip(c, fields, savedQueries))
      .filter((c): c is GroupChip => c !== null);
    return {
      groups: [
        { id: nextGroupId(), combinator: ast.op as GroupCombinator, chips },
      ],
      globalCombinator: "and",
    };
  }

  // Multiple groups: the and/or IS the global combinator
  const groups: QueryGroup[] = [];
  for (const child of ast.children) {
    if (!isGroupNode(child)) return null;
    const group = astNodeToGroup(child, fields, savedQueries);
    if (!group) return null;
    groups.push(group);
  }
  return { groups, globalCombinator: ast.op as GlobalCombinator };
}
