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
import path from "node:path";
import { atomicWriteFile, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { PROJECT_FILENAME } from "./project-config";

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
  const file = path.join(projectRoot, PROJECT_FILENAME);
  return withMetaLock(projectRoot, async () => {
    const raw = await readFile(file, "utf8");
    const project = JSON.parse(raw) as { config?: Record<string, unknown> };
    const config = { ...(project.config ?? {}) };
    if (goal === null) delete config.wordCountGoal;
    else config.wordCountGoal = goal;
    await atomicWriteFile(
      file,
      JSON.stringify({ ...project, config }, null, 2),
      {
        writeOptions: "utf8",
        durable: process.env.GETWRITE_DURABLE_META === "1",
      },
    );
    return { wordCountGoal: goal === null ? undefined : goal };
  });
}
