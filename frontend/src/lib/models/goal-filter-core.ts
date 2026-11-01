/**
 * @module goal-filter-core
 *
 * Transport-agnostic core that sets or clears the writing-goal filter
 * (`config.goalFilter`, Feature 98, FR-2, FR-3, FR-35). Modelled on
 * `word-count-goal-core.ts`: a read-modify-write of `project.json` inside
 * `withMetaLock` through `updateProjectJson`, touching only its own key.
 *
 * - The filter is validated by `validateGoalFilter` before any lock or write,
 *   so a refusal carries the same text on every path.
 * - Clearing deletes the key (never `null`, never an empty AST).
 * - The project root comes from a validated `projectId`; no path argument.
 * - Locked-access errors are not caught and propagate unchanged.
 */
import { withMetaLock } from "./meta-locks";
import { updateProjectJson } from "./project-json-write";
import type { ProjectConfig } from "./types";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import {
  validateGoalFilter,
  type GoalFilterRefusalReason,
} from "./goal-filter-validation";

export { InvalidProjectIdCoreError };

/** The candidate goal filter was refused by the validator. Map to HTTP 400. */
export class InvalidGoalFilterError extends Error {
  readonly reason: GoalFilterRefusalReason;
  constructor(reason: GoalFilterRefusalReason, message: string) {
    super(message);
    this.name = "InvalidGoalFilterError";
    this.reason = reason;
  }
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

/**
 * Set (`filter` a valid AST) or clear (`null`) `config.goalFilter` in
 * `project.json`, touching no other config key. Returns the stored filter
 * (`undefined` after a clear).
 *
 * @throws InvalidGoalFilterError, InvalidProjectIdCoreError; locked-access
 *   errors are rethrown unchanged.
 */
export async function setGoalFilterCore(
  projectId: string,
  filter: unknown,
): Promise<{ goalFilter: unknown }> {
  const projectRoot = requireProjectRoot(projectId);
  let stored: unknown;
  if (filter !== null) {
    const checked = validateGoalFilter(filter);
    if (!checked.ok) {
      throw new InvalidGoalFilterError(checked.reason, checked.message);
    }
    stored = checked.ast;
  }
  return withMetaLock(projectRoot, async () => {
    await updateProjectJson(
      projectRoot,
      (project) => {
        const config: Record<string, unknown> = { ...(project.config ?? {}) };
        if (filter === null) delete config.goalFilter;
        else config.goalFilter = stored;
        project.config = config as unknown as ProjectConfig;
        return { result: undefined };
      },
      { durable: process.env.GETWRITE_DURABLE_META === "1" },
    );
    return { goalFilter: filter === null ? undefined : stored };
  });
}
