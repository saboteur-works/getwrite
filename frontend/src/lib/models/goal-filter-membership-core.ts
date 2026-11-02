// Last Updated: 2026-11-01

/**
 * @module goal-filter-membership-core
 *
 * Goal membership (Feature 98, FR-6, FR-8, FR-10, FR-12, FR-17, FR-18): which
 * live text resources the stored `config.goalFilter` selects.
 *
 * The result is a discriminated union so that a failure can never be read as
 * "no match" or "not filtered" (`docs/standards/failure-visibility.md`):
 *   - `not-filtered`: no filter is stored;
 *   - `members`: one or more live text resource ids;
 *   - `no-match`: the filter ran and selected no live text resource;
 *   - `failure`: the answer is unknown (`invalid-filter`, `missing-field`,
 *     `read-failed`).
 *
 * Membership uses the smart folder's evaluator (`evaluate`) over the strict
 * input from `loadGoalEvaluationInput`, with the `evaluationTime` the caller
 * fixes. Only resources listed under `resources/` are considered, so a trashed
 * resource (moved to `.trash/`) is absent and a restored one is present again
 * under the same id. Only `type === "text"` resources are members.
 *
 * This core never writes `project.json` and never touches `querySlice`. An
 * unrecognised error is rethrown, not converted into a failure result.
 */
import path from "node:path";
import { DEFAULT_METADATA_SCHEMA } from "./default-metadata-schema";
import {
  GoalEvaluationInputError,
  loadGoalEvaluationInput,
} from "./goal-evaluation-input";
import { validateGoalFilter } from "./goal-filter-validation";
import { readFile } from "./io";
import { classifyGoalReadError, type GoalReadCause } from "./goal-read-error";
import { PROJECT_FILENAME } from "./project-config";
import type { QueryAST } from "./query-ast";
import { evaluate } from "./query-evaluator";
import { getIntrinsicField } from "./query-intrinsics";
import { MetadataSchemaSchema } from "./schemas";
import type { MetadataSchema } from "./types";

/** What kind of read problem made the membership unknown. */
export type GoalMembershipReadCause = GoalReadCause;

export type GoalMembershipResult =
  | { status: "not-filtered" }
  | { status: "members"; ids: string[] }
  | { status: "no-match" }
  | { status: "failure"; reason: "invalid-filter"; message: string }
  | { status: "failure"; reason: "missing-field"; fields: string[] }
  | {
      status: "failure";
      reason: "read-failed";
      cause: GoalMembershipReadCause;
    };

function readFailure(cause: GoalMembershipReadCause): GoalMembershipResult {
  return { status: "failure", reason: "read-failed", cause };
}

/**
 * Map a thrown error to a read cause, or `null` when it is not one of the
 * known read problems (the caller rethrows those).
 */
function classifyReadError(err: unknown): GoalMembershipReadCause | null {
  if (err instanceof GoalEvaluationInputError) return "missing-sidecar";
  return classifyGoalReadError(err, "goal-filter-membership");
}

interface StoredGoalConfig {
  goalFilter: unknown;
  schema: MetadataSchema;
}

/**
 * Read `goalFilter` and the effective metadata schema from `project.json`.
 * As elsewhere, a persisted schema is used alone; with none, the built-in
 * default applies. A malformed persisted schema is `corrupt`.
 */
async function readStoredGoalConfig(
  projectRoot: string,
): Promise<StoredGoalConfig> {
  const raw = await readFile(path.join(projectRoot, PROJECT_FILENAME), "utf8");
  const parsed = JSON.parse(raw) as { config?: Record<string, unknown> } | null;
  const config = parsed?.config ?? {};
  const persisted = config.metadataSchema;
  const schema =
    persisted === undefined
      ? DEFAULT_METADATA_SCHEMA
      : (MetadataSchemaSchema.parse(persisted) as MetadataSchema);
  return { goalFilter: config.goalFilter, schema };
}

/** Field keys named by the leaf conditions of a validated filter. */
function collectFields(node: QueryAST, into: Set<string>): void {
  switch (node.op) {
    case "and":
    case "or":
      for (const child of node.children) collectFields(child, into);
      return;
    case "not":
      collectFields(node.child, into);
      return;
    default:
      if ("field" in node && typeof node.field === "string") {
        into.add(node.field);
      }
  }
}

/**
 * Fields a filter names that are neither intrinsic nor in the schema. A
 * deprecated field is still in the schema, so it is not reported.
 */
function findMissingFields(ast: QueryAST, schema: MetadataSchema): string[] {
  const named = new Set<string>();
  collectFields(ast, named);
  const declared = new Set(
    schema.groups.flatMap((g) => g.fields.map((f) => f.key)),
  );
  return [...named].filter(
    (key) => getIntrinsicField(key) === undefined && !declared.has(key),
  );
}

/**
 * Evaluate the stored goal filter over the live resources of a project.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param evaluationTime - Fixed evaluation time carried into the evaluator.
 * @returns A {@link GoalMembershipResult}; never a bare list.
 * @throws Any error that is not a known read problem.
 */
export async function evaluateGoalMembership(
  projectRoot: string,
  evaluationTime: Date,
): Promise<GoalMembershipResult> {
  try {
    const { goalFilter, schema } = await readStoredGoalConfig(projectRoot);
    if (goalFilter === undefined) return { status: "not-filtered" };

    const validation = validateGoalFilter(goalFilter);
    if (!validation.ok) {
      return {
        status: "failure",
        reason: "invalid-filter",
        message: validation.message,
      };
    }
    const ast = validation.ast as QueryAST;

    const missing = findMissingFields(ast, schema);
    if (missing.length > 0) {
      return { status: "failure", reason: "missing-field", fields: missing };
    }

    const input = await loadGoalEvaluationInput(projectRoot, evaluationTime);
    const matched = new Set(await evaluate(ast, input));
    const ids = input.resources
      .filter((r) => r.type === "text" && matched.has(r.id))
      .map((r) => r.id);
    return ids.length > 0 ? { status: "members", ids } : { status: "no-match" };
  } catch (err) {
    const cause = classifyReadError(err);
    if (cause === null) throw err;
    return readFailure(cause);
  }
}
