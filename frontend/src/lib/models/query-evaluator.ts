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

  const resolvedAst = resolveRef ? await expandRefs(ast, resolveRef, []) : ast;

  const results: string[] = [];
  for (const resource of resources) {
    const sidecar = sidecars[resource.id] ?? {};
    if (matchNode(resolvedAst, resource, sidecar, context)) {
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
 * Recursively evaluate a QueryAST node for a single resource.
 * Throws EvaluatorNotImplementedError for `ref` and `param` splice nodes.
 */
function matchNode(
  ast: QueryAST,
  resource: ResourceBase,
  sidecar: Record<string, MetadataValue>,
  context: QueryContext,
): boolean {
  switch (ast.op) {
    // ── Boolean combinators ───────────────────────────────────────────
    case "and":
      return ast.children.every((c) =>
        matchNode(c, resource, sidecar, context),
      );

    case "or":
      return ast.children.some((c) => matchNode(c, resource, sidecar, context));

    case "not":
      return !matchNode(ast.child, resource, sidecar, context);

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
      return valuesEqual(v, ast.value);
    }

    case "ne": {
      const v = resolveFieldValue(ast.field, resource, sidecar, context);
      return !valuesEqual(v, ast.value);
    }

    // ── Ordered comparison predicates ────────────────────────────────
    case "lt": {
      const cmp = compareValues(
        resolveFieldValue(ast.field, resource, sidecar, context),
        ast.value,
      );
      return cmp !== null && cmp < 0;
    }

    case "gt": {
      const cmp = compareValues(
        resolveFieldValue(ast.field, resource, sidecar, context),
        ast.value,
      );
      return cmp !== null && cmp > 0;
    }

    case "gte": {
      const cmp = compareValues(
        resolveFieldValue(ast.field, resource, sidecar, context),
        ast.value,
      );
      return cmp !== null && cmp >= 0;
    }

    case "lte": {
      const cmp = compareValues(
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
