// Last Updated: 2026-11-01

/**
 * @module goal-evaluation-input
 *
 * Strict {@link EvaluationInput} loader for the writing-goal filter
 * (Feature 98, FR-17, FR-18). It builds the same input shape as the smart
 * folder's loader in `query-evaluate-core.ts`, reusing its sidecar mapping,
 * but fails where that loader degrades: a config read error, a resource
 * listing error, a sidecar read error and a `resources/<id>` directory with no
 * sidecar all throw, so a goal total is never computed over a partial set.
 *
 * Word counts: the goal total sums `userMetadata.wordCount ?? wordCount ?? 0`
 * (Task 5/6), taken from the sidecar. This loader therefore does not read
 * `content.txt`, unlike the smart-folder loader, which derives counts from it.
 */
import { loadBacklinks } from "./backlinks";
import { loadMentionIndex, invertMentionIndex } from "./mention-index";
import { listResourceIdsStrict } from "./list-resource-ids-strict";
import { loadProjectConfig } from "./project-config";
import type { QueryAST } from "./query-ast";
import {
  flattenUserMetadata,
  sidecarToResourceBase,
} from "./query-evaluate-core";
import type { EvaluationInput } from "./query-evaluator";
import { readQuery } from "./saved-queries";
import { readSidecar } from "./sidecar";
import type { MetadataValue, ResourceBase } from "./types";

/** Why a goal evaluation input could not be built. */
export type GoalEvaluationInputFailureReason = "missing-sidecar";

/** A listed resource directory has no sidecar, so its fields are unknown. */
export class GoalEvaluationInputError extends Error {
  readonly reason: GoalEvaluationInputFailureReason;
  readonly resourceId: string;

  constructor(reason: GoalEvaluationInputFailureReason, resourceId: string) {
    super(`Resource "${resourceId}" has no sidecar (${reason}).`);
    this.name = "GoalEvaluationInputError";
    this.reason = reason;
    this.resourceId = resourceId;
  }
}

/**
 * Load the evaluation input for a goal filter.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param evaluationTime - Fixed evaluation time carried into the evaluator.
 * @returns The input, with one resource and one flattened sidecar per listed id.
 * @throws {GoalEvaluationInputError} A listed directory has no sidecar.
 * @throws Any config, listing or sidecar read error, unchanged (including
 *   locked-access errors and `SyntaxError`/`ZodError` from stored files).
 */
export async function loadGoalEvaluationInput(
  projectRoot: string,
  evaluationTime?: Date,
): Promise<EvaluationInput> {
  const [config, backlinks, mentionIndex, resourceIds] = await Promise.all([
    loadProjectConfig(projectRoot),
    loadBacklinks(projectRoot),
    loadMentionIndex(projectRoot),
    listResourceIdsStrict(projectRoot),
  ]);

  const mentionsByEntity: Record<string, string[]> = {};
  for (const [entityId, records] of Object.entries(
    invertMentionIndex(mentionIndex),
  )) {
    mentionsByEntity[entityId] = records.map((record) => record.resourceId);
  }

  const resources: ResourceBase[] = [];
  const sidecars: Record<string, Record<string, MetadataValue>> = {};

  for (const id of resourceIds) {
    const rawSidecar = await readSidecar(projectRoot, id);
    if (!rawSidecar) throw new GoalEvaluationInputError("missing-sidecar", id);
    sidecars[id] = flattenUserMetadata(rawSidecar);
    resources.push(sidecarToResourceBase(id, rawSidecar));
  }

  const resolveRef = async (id: string): Promise<QueryAST | null> => {
    const saved = await readQuery(projectRoot, id);
    return saved !== null ? (saved.definition as QueryAST) : null;
  };

  return {
    resources,
    sidecars,
    context: { config, backlinks, mentions: mentionsByEntity },
    resolveRef,
    evaluationTime,
  };
}
