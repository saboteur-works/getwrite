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
 * `evaluateGoalTotal` (Feature 106, FR-7) adds the unfiltered server figure:
 * with a filter stored it is `evaluateGoalFilteredTotal` unchanged (the filter
 * alone decides, as for Sources); with none it sums text resources outside the
 * Inbox folder and its descendants. The folder tree is read once per call.
 *
 * Nothing is cached: every call re-reads membership and sidecars (FR-14). An
 * unrecognised error is rethrown, not converted into a result.
 */
import path from "node:path";
import { readFolderTree } from "./folder-utils";
import {
  computeInboxSubtree,
  isInInbox,
  type InboxFolderNode,
  type InboxSubtree,
} from "./inbox-membership";
import { listResourceIdsStrict } from "./list-resource-ids-strict";
import { readFile } from "./io";
import { PROJECT_FILENAME } from "./project-config";
import { ProjectConfigSchema } from "./schemas";
import {
  evaluateGoalMembership,
  type GoalMembershipReadCause,
} from "./goal-filter-membership-core";
import { classifyGoalReadError } from "./goal-read-error";
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
  return classifyGoalReadError(err, "goal-filtered-total");
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

/** Folder descriptors as the membership walk needs them (id is required). */
function toFolderNodes(raw: readonly unknown[]): InboxFolderNode[] {
  const nodes: InboxFolderNode[] = [];
  for (const entry of raw) {
    const f = entry as Record<string, unknown> | null;
    if (f === null || typeof f !== "object" || typeof f.id !== "string") {
      continue;
    }
    nodes.push({
      id: f.id,
      parentId: typeof f.parentId === "string" ? f.parentId : null,
    });
  }
  return nodes;
}

/**
 * `config.inboxFolderId` read from `project.json` as stored: `loadProjectConfig`
 * passes the config through `normalizeProjectConfig`, which does not carry this
 * key, so it is read here. A malformed config is a `ZodError` (`corrupt`).
 */
async function readInboxFolderId(
  projectRoot: string,
): Promise<string | undefined> {
  const raw = await readFile(path.join(projectRoot, PROJECT_FILENAME), "utf8");
  const parsed = JSON.parse(raw) as { config?: unknown } | null;
  return ProjectConfigSchema.parse(parsed?.config ?? {}).inboxFolderId;
}

/** The Inbox subtree, or a `read-failed` result when the walk hit a cycle. */
async function readInboxSubtree(
  projectRoot: string,
): Promise<InboxSubtree | GoalFilteredTotalResult> {
  const inboxFolderId = await readInboxFolderId(projectRoot);
  const folders = await readFolderTree(path.join(projectRoot, "folders"));
  const computed = computeInboxSubtree(toFolderNodes(folders), inboxFolderId);
  return computed.ok ? computed.subtree : readFailed("corrupt");
}

/** Sum of text sidecars outside the Inbox subtree, or a failure result. */
async function sumOutsideInbox(
  projectRoot: string,
): Promise<GoalFilteredTotalResult> {
  const subtree = await readInboxSubtree(projectRoot);
  if ("status" in subtree) return subtree;
  let total = 0;
  for (const id of await listResourceIdsStrict(projectRoot)) {
    const sidecar = await readSidecar(projectRoot, id);
    if (sidecar === null) return readFailed("missing-sidecar");
    if (sidecar.type !== "text") continue;
    const folderId =
      typeof sidecar.folderId === "string" ? sidecar.folderId : null;
    if (isInInbox(subtree, { id, type: "text", folderId })) continue;
    total += sidecarWordCount(sidecar);
  }
  return { status: "total", total };
}

/**
 * The project total word count for the goal on the server. With a goal filter
 * stored the result is {@link evaluateGoalFilteredTotal}'s. With none, text
 * resources in the Inbox folder or any descendant folder are left out
 * (Feature 106, FR-7), and a Source or non-text resource is not counted.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param evaluationTime - Fixed evaluation time carried into the evaluator.
 * @returns A {@link GoalFilteredTotalResult}; `unavailable` carries no number.
 * @throws Any error that is not a known read problem.
 */
export async function evaluateGoalTotal(
  projectRoot: string,
  evaluationTime: Date,
): Promise<GoalFilteredTotalResult> {
  const filtered = await evaluateGoalFilteredTotal(projectRoot, evaluationTime);
  if (filtered.status !== "not-filtered") return filtered;
  try {
    return await sumOutsideInbox(projectRoot);
  } catch (err) {
    const cause = classifyReadError(err);
    if (cause === null) throw err;
    return readFailed(cause);
  }
}
