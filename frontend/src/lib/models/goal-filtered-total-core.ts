// Last Updated: 2026-11-01

/**
 * @module goal-filtered-total-core
 *
 * Filtered total word count for the writing goal (Feature 98, FR-10, FR-13,
 * FR-14): the sum of `userMetadata.wordCount ?? wordCount ?? 0` over the
 * members from `evaluateGoalMembership`, read from each member's sidecar. The
 * evaluator's content-derived counts are not used.
 *
 * The result is a discriminated union. A number exists only in the `total` and
 * `no-match` branches; `unavailable` has no `total` key, so a failure cannot be
 * read as 0 (`docs/standards/failure-visibility.md`):
 *   - `not-filtered`: no filter is stored; the caller follows its unfiltered
 *     behaviour (FR-5);
 *   - `total`: the sum over one or more members;
 *   - `no-match`: the filter selected no live text resource; total is 0;
 *   - `unavailable`: the figure could not be computed.
 *
 * Nothing is cached: every call re-reads membership and sidecars (FR-14). An
 * unrecognised error is rethrown, not converted into a result.
 */
import { ZodError } from "zod";
import {
  evaluateGoalMembership,
  type GoalMembershipReadCause,
} from "./goal-filter-membership-core";
import { isLockedAccessError } from "./locked-access";
import { readSidecar } from "./sidecar";

export type GoalFilteredTotalResult =
  | { status: "not-filtered" }
  | { status: "total"; total: number }
  | { status: "no-match"; total: 0 }
  | { status: "unavailable"; reason: "invalid-filter"; message: string }
  | { status: "unavailable"; reason: "missing-field"; fields: string[] }
  | {
      status: "unavailable";
      reason: "read-failed";
      cause: GoalMembershipReadCause;
    };

/** Map a thrown sidecar read error to a cause; `null` when not recognised. */
function classifyReadError(err: unknown): GoalMembershipReadCause | null {
  if (isLockedAccessError(err)) return "locked";
  if (err instanceof SyntaxError || err instanceof ZodError) return "corrupt";
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" ? "unreadable" : null;
}

function readFailed(cause: GoalMembershipReadCause): GoalFilteredTotalResult {
  return { status: "unavailable", reason: "read-failed", cause };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `userMetadata.wordCount ?? wordCount ?? 0`, the Data view's figure. */
function sidecarWordCount(sidecar: Record<string, unknown>): number {
  const userMetadata = sidecar.userMetadata as
    | Record<string, unknown>
    | null
    | undefined;
  return (
    numberOrNull(userMetadata?.wordCount) ??
    numberOrNull(sidecar.wordCount) ??
    0
  );
}

/**
 * Compute the filtered total word count for a project.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param evaluationTime - Fixed evaluation time carried into the evaluator.
 * @returns A {@link GoalFilteredTotalResult}; never a bare number.
 * @throws Any error that is not a known read problem.
 */
export async function evaluateGoalFilteredTotal(
  projectRoot: string,
  evaluationTime: Date,
): Promise<GoalFilteredTotalResult> {
  const membership = await evaluateGoalMembership(projectRoot, evaluationTime);
  switch (membership.status) {
    case "not-filtered":
      return { status: "not-filtered" };
    case "no-match":
      return { status: "no-match", total: 0 };
    case "failure":
      return membership.reason === "read-failed"
        ? readFailed(membership.cause)
        : { ...membership, status: "unavailable" };
    case "members":
      break;
  }

  let total = 0;
  for (const id of membership.ids) {
    try {
      const sidecar = await readSidecar(projectRoot, id);
      if (sidecar === null) return readFailed("missing-sidecar");
      total += sidecarWordCount(sidecar);
    } catch (err) {
      const cause = classifyReadError(err);
      if (cause === null) throw err;
      return readFailed(cause);
    }
  }
  return { status: "total", total };
}
