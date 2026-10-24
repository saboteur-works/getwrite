/**
 * @module word-count-goal-core
 *
 * Transport-agnostic core for the project-wide word-count goal (Feature 61,
 * Task 2), mirroring `writing-log-core.ts`'s `setDailyWordGoalCore` exactly:
 * reads `project.json` directly, does a read-modify-write inside
 * `withMetaLock`, deletes the config key on `null` rather than ever writing
 * `undefined`, and uses `atomicWriteFile` with the same options. Locked/
 * keyless-project errors are NOT caught here — they propagate up unchanged
 * from whatever throws inside (`readFile`/`atomicWriteFile` going through
 * `io.ts`).
 */
import { withMetaLock } from "./meta-locks";
import { updateProjectJson } from "./project-json-write";
import type { ProjectConfig } from "./types";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";

export { InvalidProjectIdCoreError };

/** The requested word-count goal is not a non-negative integer. Map to HTTP 400. */
export class InvalidWordCountGoalError extends Error {
  constructor(value: unknown) {
    super(
      `Invalid wordCountGoal: ${String(value)} (must be a non-negative integer)`,
    );
    this.name = "InvalidWordCountGoalError";
  }
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

/**
 * Set (`goal` a non-negative integer) or clear (`null`) `config.wordCountGoal`
 * in `project.json`, touching no other config key (notably `dailyWordGoal`).
 * Returns the stored goal (`undefined` after a clear).
 *
 * @throws InvalidWordCountGoalError, InvalidProjectIdCoreError; locked-access
 *   errors are rethrown unchanged.
 */
export async function setWordCountGoalCore(
  projectId: string,
  goal: number | null,
): Promise<{ wordCountGoal: number | undefined }> {
  const projectRoot = requireProjectRoot(projectId);
  if (goal !== null && (!Number.isInteger(goal) || goal < 0)) {
    throw new InvalidWordCountGoalError(goal);
  }
  return withMetaLock(projectRoot, async () => {
    await updateProjectJson(
      projectRoot,
      (project) => {
        const config: Record<string, unknown> = { ...(project.config ?? {}) };
        if (goal === null) delete config.wordCountGoal;
        else config.wordCountGoal = goal;
        project.config = config as unknown as ProjectConfig;
        return { result: undefined };
      },
      { durable: process.env.GETWRITE_DURABLE_META === "1" },
    );
    return { wordCountGoal: goal === null ? undefined : goal };
  });
}
