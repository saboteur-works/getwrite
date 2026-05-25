import type { QueryAST } from "../../src/lib/models/query-ast";
import type { MetadataFieldType } from "../../src/lib/models/types";

export interface OperatorOption {
  value: string;
  label: string;
  /** When true, no value input is shown — the operator is self-contained. */
  noValue: boolean;
  /** How the value input renders (only relevant when noValue is false). */
  valueShape: "single" | "twoValues" | "relativeDate" | "multiValues";
}

export type OperatorGroup = OperatorOption | "divider";

function op(
  value: string,
  label: string,
  valueShape: OperatorOption["valueShape"] = "single",
): OperatorOption {
  return { value, label, noValue: false, valueShape };
}

function noVal(value: string, label: string): OperatorOption {
  return { value, label, noValue: true, valueShape: "single" };
}

export const OPERATORS_BY_TYPE: Record<MetadataFieldType, OperatorGroup[]> = {
  text: [
    op("is", "is"),
    op("is-not", "is not"),
    op("contains", "contains"),
    op("does-not-contain", "does not contain"),
    op("starts-with", "starts with"),
    op("matches-regex", "matches regex"),
    "divider",
    noVal("is-empty", "is empty"),
    noVal("has-any-value", "has any value"),
  ],
  number: [
    op("equals", "equals"),
    op("does-not-equal", "does not equal"),
    op("is-less-than", "is less than"),
    op("is-at-most", "is at most"),
    op("is-greater-than", "is greater than"),
    op("is-at-least", "is at least"),
    op("is-between", "is between", "twoValues"),
    "divider",
    noVal("is-empty", "is empty"),
    noVal("has-any-value", "has any value"),
  ],
  date: [
    op("is-on", "is on"),
    op("is-before", "is before"),
    op("is-after", "is after"),
    op("is-between", "is between", "twoValues"),
    op("in-the-last", "in the last", "relativeDate"),
    "divider",
    noVal("is-empty", "is empty"),
    noVal("has-any-value", "has any value"),
  ],
  boolean: [
    noVal("is-true", "is true"),
    noVal("is-false", "is false"),
    "divider",
    noVal("is-empty", "is empty"),
    noVal("has-any-value", "has any value"),
  ],
  select: [
    op("is", "is"),
    op("is-not", "is not"),
    op("is-any-of", "is any of", "multiValues"),
    op("is-none-of", "is none of", "multiValues"),
    "divider",
    noVal("is-empty", "is empty"),
    noVal("has-any-value", "has any value"),
  ],
  multiselect: [
    op("includes", "includes"),
    op("does-not-include", "does not include"),
    op("includes-all-of", "includes all of", "multiValues"),
    op("includes-any-of", "includes any of", "multiValues"),
    op("includes-none-of", "includes none of", "multiValues"),
    "divider",
    noVal("is-empty", "is empty"),
    noVal("has-any-value", "has any value"),
  ],
  "resource-ref": [
    op("is", "is"),
    op("is-not", "is not"),
    op("is-any-of", "is any of", "multiValues"),
    op("is-none-of", "is none of", "multiValues"),
    "divider",
    noVal("is-empty", "is empty"),
    noVal("has-any-value", "has any value"),
  ],
  "multi-resource-ref": [
    op("includes", "includes"),
    op("does-not-include", "does not include"),
    op("includes-all-of", "includes all of", "multiValues"),
    op("includes-any-of", "includes any of", "multiValues"),
    op("includes-none-of", "includes none of", "multiValues"),
    "divider",
    noVal("is-empty", "is empty"),
    noVal("has-any-value", "has any value"),
  ],
};

export function getOperators(type: MetadataFieldType): OperatorGroup[] {
  return OPERATORS_BY_TYPE[type];
}

export function getOperatorOption(
  type: MetadataFieldType,
  value: string,
): OperatorOption | null {
  for (const entry of OPERATORS_BY_TYPE[type]) {
    if (entry !== "divider" && entry.value === value) {
      return entry;
    }
  }
  return null;
}

export function getDefaultOperator(type: MetadataFieldType): string {
  for (const entry of OPERATORS_BY_TYPE[type]) {
    if (entry !== "divider") {
      return entry.value;
    }
  }
  return "";
}

// ─── AST stub builders ────────────────────────────────────────────────────────

type StubBuilder = (field: string) => QueryAST;

const STUB_BUILDERS: Partial<Record<string, StubBuilder>> = {
  // text
  is: (f) => ({ op: "eq", field: f, value: "" }),
  "is-not": (f) => ({ op: "ne", field: f, value: "" }),
  contains: (f) => ({ op: "contains", field: f, value: "" }),
  "does-not-contain": (f) => ({
    op: "not",
    child: { op: "contains", field: f, value: "" },
  }),
  "starts-with": (f) => ({ op: "matches", field: f, value: "" }),
  "matches-regex": (f) => ({ op: "matches", field: f, value: "" }),
  // number
  equals: (f) => ({ op: "eq", field: f, value: 0 }),
  "does-not-equal": (f) => ({ op: "ne", field: f, value: 0 }),
  "is-less-than": (f) => ({ op: "lt", field: f, value: 0 }),
  "is-at-most": (f) => ({ op: "lte", field: f, value: 0 }),
  "is-greater-than": (f) => ({ op: "gt", field: f, value: 0 }),
  "is-at-least": (f) => ({ op: "gte", field: f, value: 0 }),
  // date
  "is-on": (f) => ({ op: "eq", field: f, value: "" }),
  "is-before": (f) => ({ op: "lt", field: f, value: "" }),
  "is-after": (f) => ({ op: "gt", field: f, value: "" }),
  "in-the-last": (f) => ({ op: "gte", field: f, value: "" }),
  // boolean
  "is-true": (f) => ({ op: "eq", field: f, value: true }),
  "is-false": (f) => ({ op: "eq", field: f, value: false }),
  // select / resource-ref
  "is-any-of": (f) => ({ op: "in", field: f, value: [] }),
  "is-none-of": (f) => ({
    op: "not",
    child: { op: "in", field: f, value: [] },
  }),
  // multiselect / multi-resource-ref
  includes: (f) => ({ op: "in", field: f, value: "" }),
  "does-not-include": (f) => ({
    op: "not",
    child: { op: "in", field: f, value: "" },
  }),
  "includes-all-of": (f) => ({
    op: "and",
    children: [{ op: "in", field: f, value: "" }],
  }),
  "includes-any-of": (f) => ({
    op: "or",
    children: [{ op: "in", field: f, value: "" }],
  }),
  "includes-none-of": (f) => ({
    op: "not",
    child: { op: "or", children: [{ op: "in", field: f, value: "" }] },
  }),
  // is-between is field-type dependent — handled in buildOperatorStub
  // universal
  "is-empty": (f) => ({ op: "not", child: { op: "exists", field: f } }),
  "has-any-value": (f) => ({ op: "exists", field: f }),
};

/**
 * Builds a typed AST predicate stub for the given field type + operator.
 * Returns null for unknown operator values.
 */
export function buildOperatorStub(
  fieldType: MetadataFieldType,
  operatorValue: string,
  fieldKey: string,
): QueryAST | null {
  if (operatorValue === "is-between") {
    const zeroVal = fieldType === "number" ? 0 : "";
    return {
      op: "and",
      children: [
        { op: "gte", field: fieldKey, value: zeroVal },
        { op: "lte", field: fieldKey, value: zeroVal },
      ],
    };
  }
  const builder = STUB_BUILDERS[operatorValue];
  return builder ? builder(fieldKey) : null;
}
