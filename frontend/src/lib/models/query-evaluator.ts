/**
 * @module query-evaluator
 *
 * Query AST evaluator for the metadata-query feature.
 * Accepts a QueryAST and an EvaluationInput, iterates over all resources,
 * and returns the UUIDs of resources that satisfy the predicate.
 *
 * Field-source dispatch:
 *   - Intrinsic fields (type, folderId, wordCount, …) → INTRINSIC_FIELDS registry
 *   - Declared schema fields → sidecar lookup
 *
 * Ref resolution:
 *   - When `EvaluationInput.resolveRef` is provided, `ref` nodes are expanded
 *     (spliced) before evaluation. Cycles throw `QueryCycleError`.
 *   - When `resolveRef` is absent, `ref` nodes throw `EvaluatorNotImplementedError`.
 *
 * Limitations:
 *   - `param` nodes throw EvaluatorNotImplementedError.
 *   - Full-text prose delegation via inverted-index.ts is not wired here;
 *     `contains`/`matches` operate on string-valued sidecar/intrinsic fields only.
 */
import type { QueryAST } from "./query-ast";
import { getIntrinsicField } from "./query-intrinsics";
import type { QueryContext } from "./query-intrinsics";
import type { ResourceBase, MetadataValue, ResourceRef } from "./types";

// ─── Public interface ──────────────────────────────────────────────────────

export interface EvaluationInput {
  /** All resources to filter over. */
  resources: ResourceBase[];
  /** Map from resourceId → sidecar data (may be missing for a resource). */
  sidecars: Record<string, Record<string, MetadataValue>>;
  /** Project config + backlink index for intrinsic field reads. */
  context: QueryContext;
  /**
   * Optional loader for saved-query ASTs by id. When provided, `ref` nodes
   * in the AST are expanded (spliced) before evaluation. Returns `null` when
   * the referenced query does not exist, which causes an Error to be thrown.
   * If absent, `ref` nodes throw `EvaluatorNotImplementedError`.
   */
  resolveRef?: (id: string) => Promise<QueryAST | null>;
  /**
   * The instant a query is evaluated at. Optional; when omitted the current
   * time applies. Read by the relative-date `gte` ("in the last N days, weeks
   * or months", Feature 86 FR-12/FR-13) so tests can fix the clock.
   */
  evaluationTime?: Date;
}

/**
 * Thrown when the evaluator encounters a node type that requires a resolver
 * that was not provided (currently: `ref` without `resolveRef`, and `param`).
 */
export class EvaluatorNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluatorNotImplementedError";
  }
}

/**
 * Thrown when a cycle is detected while expanding `ref` nodes.
 * `cyclePath` lists the query IDs in the order they were traversed,
 * with the repeated ID appended at the end so the cycle is explicit.
 */
export class QueryCycleError extends Error {
  readonly cyclePath: readonly string[];
  constructor(cyclePath: string[]) {
    super(`Cycle detected in saved-query refs: ${cyclePath.join(" → ")}`);
    this.name = "QueryCycleError";
    this.cyclePath = cyclePath;
  }
}

// ─── Ref expansion ─────────────────────────────────────────────────────────

/**
 * Recursively replace `ref` nodes in `ast` with the definitions returned by
 * `resolveRef`. Tracks the current expansion path in `seenPath` to detect
 * cycles. Leaf and combinator nodes are traversed but not replaced.
 */
async function expandRefs(
  ast: QueryAST,
  resolveRef: (id: string) => Promise<QueryAST | null>,
  seenPath: readonly string[],
): Promise<QueryAST> {
  switch (ast.op) {
    case "ref": {
      if (seenPath.includes(ast.id)) {
        throw new QueryCycleError([...seenPath, ast.id]);
      }
      const loaded = await resolveRef(ast.id);
      if (loaded === null) {
        throw new Error(`Saved query ref not found: ${ast.id}`);
      }
      return expandRefs(loaded, resolveRef, [...seenPath, ast.id]);
    }
    case "and": {
      const children = await Promise.all(
        ast.children.map((c) => expandRefs(c, resolveRef, seenPath)),
      );
      return { op: "and", children };
    }
    case "or": {
      const children = await Promise.all(
        ast.children.map((c) => expandRefs(c, resolveRef, seenPath)),
      );
      return { op: "or", children };
    }
    case "not": {
      const child = await expandRefs(ast.child, resolveRef, seenPath);
      return { op: "not", child };
    }
    default:
      // Leaf nodes and param — no refs to expand.
      return ast;
  }
}

// ─── Public evaluate function ──────────────────────────────────────────────

/**
 * Evaluate a query AST against a set of resources and return the UUIDs of
 * all resources that satisfy the predicate.
 *
 * When `input.resolveRef` is provided, `ref` splice nodes are expanded before
 * the resource loop. Cycles throw `QueryCycleError`; missing refs throw Error.
 */
export async function evaluate(
  ast: QueryAST,
  input: EvaluationInput,
): Promise<string[]> {
  const { resources, sidecars, context, resolveRef } = input;
  const now = input.evaluationTime ?? new Date();

  const resolvedAst = resolveRef ? await expandRefs(ast, resolveRef, []) : ast;

  const results: string[] = [];
  for (const resource of resources) {
    const sidecar = sidecars[resource.id] ?? {};
    if (matchNode(resolvedAst, resource, sidecar, context, now)) {
      results.push(resource.id);
    }
  }
  return results;
}

// ─── Private helpers ───────────────────────────────────────────────────────

/**
 * Resolve a field to its runtime value for a given resource.
 * Intrinsic fields take precedence over sidecar entries.
 * Returns `undefined` when the field is absent from both sources.
 */
function resolveFieldValue(
  field: string,
  resource: ResourceBase,
  sidecar: Record<string, MetadataValue>,
  context: QueryContext,
): MetadataValue | undefined {
  const intrinsic = getIntrinsicField(field);
  if (intrinsic) {
    return intrinsic.read(resource, context);
  }
  return field in sidecar ? sidecar[field] : undefined;
}

/** Type guard for a ResourceRef shape `{ id: string|null, name: string }`. */
function isResourceRef(v: unknown): v is ResourceRef {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return (
    "id" in obj &&
    "name" in obj &&
    (typeof obj.id === "string" || obj.id === null) &&
    typeof obj.name === "string"
  );
}

/**
 * Extract a comparable id string from a value. Used to normalise
 * resource-ref comparisons so both UUID strings and ResourceRef objects
 * can be compared uniformly.
 */
function extractId(v: MetadataValue): string | null {
  if (typeof v === "string") return v;
  if (isResourceRef(v)) return v.id;
  return null;
}

/** Test deep equality between two MetadataValues. ResourceRef comparison is id-only. */
function valuesEqual(a: MetadataValue | undefined, b: MetadataValue): boolean {
  if (a === undefined || a === null) return false;

  // ResourceRef × ResourceRef
  if (isResourceRef(a) && isResourceRef(b)) {
    return a.id !== null && a.id === b.id;
  }
  // ResourceRef × string (UUID)
  if (isResourceRef(a) && typeof b === "string") {
    return a.id === b;
  }
  // string × ResourceRef (symmetric)
  if (typeof a === "string" && isResourceRef(b)) {
    return a === b.id;
  }

  // Primitive equality
  if (typeof a !== "object" && typeof b !== "object") return a === b;

  // Array equality (shallow, element-wise via valuesEqual)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((el, i) =>
      valuesEqual(el as MetadataValue, b[i] as MetadataValue),
    );
  }

  return false;
}

/**
 * Evaluate the `exists` predicate:
 * - `null` / `undefined` → false
 * - empty string → false
 * - empty array → false
 * - anything else (including ResourceRef with null id) → true
 */
function evalExists(v: MetadataValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Evaluate the `in` predicate.
 *
 * - Scalar field value: field ∈ predicate array.
 * - Array field value (multiselect / multi-resource-ref):
 *   at least one element of the field array ∈ predicate array.
 *
 * ResourceRef comparison uses id-only equality.
 */
function evalIn(
  fieldValue: MetadataValue | undefined,
  predValue: MetadataValue,
): boolean {
  if (fieldValue === undefined || fieldValue === null) return false;

  const predArray: MetadataValue[] = Array.isArray(predValue)
    ? (predValue as MetadataValue[])
    : [predValue];

  if (Array.isArray(fieldValue)) {
    return (fieldValue as MetadataValue[]).some((fv) =>
      predArray.some((pv) => {
        const fvTyped = fv as MetadataValue;
        // Plain string predicate against a ResourceRef element: match by name or ID.
        // This handles chips that store a typed name rather than a UUID.
        if (typeof pv === "string" && isResourceRef(fvTyped)) {
          return (
            fvTyped.id === pv || fvTyped.name.toLowerCase() === pv.toLowerCase()
          );
        }
        const fvId = extractId(fvTyped);
        const pvId = extractId(pv);
        if (fvId !== null && pvId !== null) return fvId === pvId;
        return valuesEqual(fvTyped, pv);
      }),
    );
  }

  return predArray.some((pv) => {
    // Plain string predicate against a ResourceRef: match by name or ID.
    if (typeof pv === "string" && isResourceRef(fieldValue)) {
      return (
        fieldValue.id === pv ||
        fieldValue.name.toLowerCase() === pv.toLowerCase()
      );
    }
    const fvId = extractId(fieldValue);
    const pvId = extractId(pv);
    if (fvId !== null && pvId !== null) return fvId === pvId;
    return valuesEqual(fieldValue, pv);
  });
}

/**
 * Compare two MetadataValues as ordered scalars.
 * Returns a negative/zero/positive number, or null when the types are
 * incomparable (e.g. boolean vs number, object vs string).
 */
function compareValues(
  a: MetadataValue | undefined,
  b: MetadataValue,
): number | null {
  if (a === undefined || a === null) return null;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return null;
}

// ─── Relative dates ("in the last") ────────────────────────────────────────

const RELATIVE_UNITS: readonly string[] = ["days", "weeks", "months"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** True for a `{amount, unit}`-shaped value: the builder's "in the last". */
function isRelativeDateValue(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  return "amount" in v || "unit" in v;
}

/**
 * The start of a rolling span ending at `now` (Feature 86 FR-14): a day is 24
 * hours, a week 7 days of 24 hours, a month a calendar month counted back in
 * the evaluating process's local zone with the day clamped to the month's end.
 * Throws an Error naming the problem for a unit outside days/weeks/months or
 * an amount that is not an integer of at least 1 (failure-visibility).
 */
function relativeSpanStart(span: Record<string, unknown>, now: Date): Date {
  const { amount, unit } = span;
  if (typeof unit !== "string" || !RELATIVE_UNITS.includes(unit)) {
    throw new Error(
      `Relative date unit must be days, weeks or months; got ${JSON.stringify(unit)}`,
    );
  }
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) {
    throw new Error(
      `Relative date amount must be an integer of at least 1; got ${JSON.stringify(amount)}`,
    );
  }
  if (unit === "days") return new Date(now.getTime() - amount * MS_PER_DAY);
  if (unit === "weeks") {
    return new Date(now.getTime() - amount * 7 * MS_PER_DAY);
  }
  const start = new Date(now.getTime());
  const dayOfMonth = start.getDate();
  start.setDate(1);
  start.setMonth(start.getMonth() - amount);
  const monthEnd = new Date(
    start.getFullYear(),
    start.getMonth() + 1,
    0,
  ).getDate();
  start.setDate(Math.min(dayOfMonth, monthEnd));
  return start;
}

/**
 * Parse a field value as an instant. A date-only `YYYY-MM-DD` string is local
 * midnight of that day; any other string goes through `Date.parse`. Anything
 * that is not a parseable date string yields `null`.
 */
function parseDateValue(v: MetadataValue | undefined): Date | null {
  if (typeof v !== "string") return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const parsed = dateOnly
    ? new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
      )
    : new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The intrinsic timestamp fields, whose "is on" compares by calendar day. */
function isTimestampField(field: string): boolean {
  return field === "createdAt" || field === "updatedAt";
}

/** True for a `YYYY-MM-DD` string. */
function isDateOnly(v: MetadataValue): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * True when the timestamp `v` falls on the calendar day `day` (`YYYY-MM-DD`)
 * in the evaluating process's local zone. An absent or unparseable `v` is false.
 */
function sameLocalDay(v: MetadataValue | undefined, day: string): boolean {
  const stamp = parseDateValue(v);
  const target = parseDateValue(day);
  if (stamp === null || target === null) return false;
  return (
    stamp.getFullYear() === target.getFullYear() &&
    stamp.getMonth() === target.getMonth() &&
    stamp.getDate() === target.getDate()
  );
}

/**
 * Order the timestamp `v` against the calendar day `day` (`YYYY-MM-DD`) in the
 * evaluating process's local zone: negative when `v` falls on an earlier day,
 * zero on the same day, positive on a later day. Null when either side does
 * not parse.
 */
function compareLocalDay(
  v: MetadataValue | undefined,
  day: string,
): number | null {
  const stamp = parseDateValue(v);
  const target = parseDateValue(day);
  if (stamp === null || target === null) return null;
  const stampDay = new Date(
    stamp.getFullYear(),
    stamp.getMonth(),
    stamp.getDate(),
  ).getTime();
  return stampDay - target.getTime();
}

/**
 * Ordered comparison of a resolved field value with a predicate value. On the
 * intrinsic timestamp fields a `YYYY-MM-DD` value compares by local calendar
 * day (FR-16); everything else keeps `compareValues`.
 */
function compareForPredicate(
  field: string,
  v: MetadataValue | undefined,
  value: MetadataValue,
): number | null {
  if (isTimestampField(field) && isDateOnly(value)) {
    return compareLocalDay(v, value);
  }
  return compareValues(v, value);
}

/** Evaluate `contains` on a string field value (case-insensitive substring). */
function evalContains(
  v: MetadataValue | undefined,
  searchStr: string,
): boolean {
  if (typeof v !== "string") return false;
  return v.toLowerCase().includes(searchStr.toLowerCase());
}

/** Evaluate `matches` on a string field value (regular expression test). */
function evalMatches(v: MetadataValue | undefined, regexStr: string): boolean {
  if (typeof v !== "string") return false;
  try {
    return new RegExp(regexStr).test(v);
  } catch {
    return false;
  }
}

/**
 * Read an `and` with exactly one `in` child as "holds every listed value"
 * (Feature 86 FR-6): the shape "includes all of" saves. Applies only when the
 * child carries a non-empty array and the field resolves to an array; returns
 * `null` for every other shape so the caller evaluates it as before.
 */
function matchAllOfSingleIn(
  children: readonly QueryAST[],
  resource: ResourceBase,
  sidecar: Record<string, MetadataValue>,
  context: QueryContext,
): boolean | null {
  if (children.length !== 1) return null;
  const child = children[0];
  if (child.op !== "in") return null;
  if (!Array.isArray(child.value) || child.value.length === 0) return null;
  const v = resolveFieldValue(child.field, resource, sidecar, context);
  if (!Array.isArray(v)) return null;
  const listedValues = child.value as MetadataValue[];
  // evalIn wraps a non-array predicate as a one-value list: one value at a time.
  return listedValues.every((listed) => evalIn(v, listed));
}

/**
 * Recursively evaluate a QueryAST node for a single resource.
 * Throws EvaluatorNotImplementedError for `ref` and `param` splice nodes.
 */
function matchNode(
  ast: QueryAST,
  resource: ResourceBase,
  sidecar: Record<string, MetadataValue>,
  context: QueryContext,
  now: Date,
): boolean {
  switch (ast.op) {
    // ── Boolean combinators ───────────────────────────────────────────
    case "and": {
      const shouldHoldEvery = matchAllOfSingleIn(
        ast.children,
        resource,
        sidecar,
        context,
      );
      if (shouldHoldEvery !== null) return shouldHoldEvery;
      return ast.children.every((c) =>
        matchNode(c, resource, sidecar, context, now),
      );
    }

    case "or":
      return ast.children.some((c) =>
        matchNode(c, resource, sidecar, context, now),
      );

    case "not":
      return !matchNode(ast.child, resource, sidecar, context, now);

    // ── Splice nodes — not implemented in task 5 ──────────────────────
    case "ref":
      throw new EvaluatorNotImplementedError(
        `ref nodes require saved-query resolution (task 8) — id: ${ast.id}`,
      );

    case "param":
      throw new EvaluatorNotImplementedError(
        `param nodes are not yet implemented — name: ${ast.name}`,
      );

    // ── Link predicates ───────────────────────────────────────────────
    case "linksTo":
      return (context.backlinks[resource.id] ?? []).includes(ast.id);

    case "linkedFrom":
      return (context.backlinks[ast.id] ?? []).includes(resource.id);

    // ── Existence predicate ───────────────────────────────────────────
    case "exists": {
      const v = resolveFieldValue(ast.field, resource, sidecar, context);
      return evalExists(v);
    }

    // ── Equality predicates ───────────────────────────────────────────
    case "eq": {
      const v = resolveFieldValue(ast.field, resource, sidecar, context);
      if (isTimestampField(ast.field) && isDateOnly(ast.value)) {
        return sameLocalDay(v, ast.value);
      }
      return valuesEqual(v, ast.value);
    }

    case "ne": {
      const v = resolveFieldValue(ast.field, resource, sidecar, context);
      return !valuesEqual(v, ast.value);
    }

    // ── Ordered comparison predicates ────────────────────────────────
    case "lt": {
      const cmp = compareForPredicate(
        ast.field,
        resolveFieldValue(ast.field, resource, sidecar, context),
        ast.value,
      );
      return cmp !== null && cmp < 0;
    }

    case "gt": {
      const cmp = compareForPredicate(
        ast.field,
        resolveFieldValue(ast.field, resource, sidecar, context),
        ast.value,
      );
      return cmp !== null && cmp > 0;
    }

    case "gte": {
      if (isRelativeDateValue(ast.value)) {
        const start = relativeSpanStart(ast.value, now);
        const when = parseDateValue(
          resolveFieldValue(ast.field, resource, sidecar, context),
        );
        return when !== null && when >= start && when <= now;
      }
      const cmp = compareForPredicate(
        ast.field,
        resolveFieldValue(ast.field, resource, sidecar, context),
        ast.value,
      );
      return cmp !== null && cmp >= 0;
    }

    case "lte": {
      const cmp = compareForPredicate(
        ast.field,
        resolveFieldValue(ast.field, resource, sidecar, context),
        ast.value,
      );
      return cmp !== null && cmp <= 0;
    }

    // ── Membership predicate ──────────────────────────────────────────
    case "in": {
      const v = resolveFieldValue(ast.field, resource, sidecar, context);
      return evalIn(v, ast.value);
    }

    // ── Text predicates ───────────────────────────────────────────────
    case "contains": {
      const v = resolveFieldValue(ast.field, resource, sidecar, context);
      return evalContains(v, ast.value);
    }

    case "matches": {
      const v = resolveFieldValue(ast.field, resource, sidecar, context);
      return evalMatches(v, ast.value);
    }
  }
}
