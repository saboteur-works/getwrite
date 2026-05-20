/**
 * @module query-evaluator
 *
 * Synchronous query AST evaluator for the metadata-query feature.
 * Accepts a QueryAST and an EvaluationInput, iterates over all resources,
 * and returns the UUIDs of resources that satisfy the predicate.
 *
 * Field-source dispatch:
 *   - Intrinsic fields (type, folderId, wordCount, …) → INTRINSIC_FIELDS registry
 *   - Declared schema fields → sidecar lookup
 *
 * Limitations (pending later tasks):
 *   - `ref` nodes (saved-query splices) throw EvaluatorNotImplementedError; resolved in task 8.
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
}

/**
 * Thrown when the evaluator encounters a node type that requires a future
 * task to implement (currently: `ref` and `param` splice nodes).
 */
export class EvaluatorNotImplementedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "EvaluatorNotImplementedError";
    }
}

/**
 * Evaluate a query AST against a set of resources and return the UUIDs of
 * all resources that satisfy the predicate.
 */
export async function evaluate(
    ast: QueryAST,
    input: EvaluationInput,
): Promise<string[]> {
    const { resources, sidecars, context } = input;
    const results: string[] = [];

    for (const resource of resources) {
        const sidecar = sidecars[resource.id] ?? {};
        if (matchNode(ast, resource, sidecar, context)) {
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
        return a.every((el, i) => valuesEqual(el as MetadataValue, b[i] as MetadataValue));
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
function evalIn(fieldValue: MetadataValue | undefined, predValue: MetadataValue): boolean {
    if (fieldValue === undefined || fieldValue === null) return false;

    const predArray: MetadataValue[] = Array.isArray(predValue)
        ? (predValue as MetadataValue[])
        : [predValue];

    if (Array.isArray(fieldValue)) {
        return (fieldValue as MetadataValue[]).some((fv) =>
            predArray.some((pv) => {
                const fvId = extractId(fv as MetadataValue);
                const pvId = extractId(pv);
                if (fvId !== null && pvId !== null) return fvId === pvId;
                return valuesEqual(fv as MetadataValue, pv);
            }),
        );
    }

    return predArray.some((pv) => {
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
function evalContains(v: MetadataValue | undefined, searchStr: string): boolean {
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
            return ast.children.every((c) => matchNode(c, resource, sidecar, context));

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
