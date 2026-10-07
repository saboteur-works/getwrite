/**
 * @module mention-highlight-duration-core
 *
 * Transport-agnostic core for the per-project mention-jump highlight
 * duration (Entity mention navigation, Task 7), mirroring
 * `word-count-goal-core.ts`'s `setWordCountGoalCore` exactly: reads
 * `project.json` directly, does a read-modify-write inside `withMetaLock`,
 * deletes the config key on `null` rather than ever writing `undefined`,
 * and uses `atomicWriteFile` with the same options. Locked/keyless-project
 * errors are NOT caught here — they propagate up unchanged from whatever
 * throws inside (`readFile`/`atomicWriteFile` going through `io.ts`).
 */
import path from "node:path";
import { atomicWriteFile, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { PROJECT_FILENAME } from "./project-config";

export { InvalidProjectIdCoreError };

/**
 * The requested mention-highlight duration is not an integer in 1-10
 * inclusive. Map to HTTP 400. Rejects rather than clamping, unlike every
 * prior numeric project setting (`wordCountGoal`, `dailyWordGoal`), per
 * FR-10.
 */
export class InvalidMentionHighlightDurationError extends Error {
  constructor(value: unknown) {
    super(
      `Invalid mentionHighlightDurationSeconds: ${String(value)} (must be an integer from 1 to 10 inclusive)`,
    );
    this.name = "InvalidMentionHighlightDurationError";
  }
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

/**
 * Set (`seconds` an integer 1-10 inclusive) or clear (`null`)
 * `config.mentionHighlightDurationSeconds` in `project.json`, touching no
 * other config key. Returns the stored value (`undefined` after a clear).
 *
 * @throws InvalidMentionHighlightDurationError, InvalidProjectIdCoreError;
 *   locked-access errors are rethrown unchanged.
 */
export async function setMentionHighlightDurationCore(
  projectId: string,
  seconds: number | null,
): Promise<{ mentionHighlightDurationSeconds: number | undefined }> {
  const projectRoot = requireProjectRoot(projectId);
  if (
    seconds !== null &&
    (!Number.isInteger(seconds) || seconds < 1 || seconds > 10)
  ) {
    throw new InvalidMentionHighlightDurationError(seconds);
  }
  const file = path.join(projectRoot, PROJECT_FILENAME);
  return withMetaLock(projectRoot, async () => {
    const raw = await readFile(file, "utf8");
    const project = JSON.parse(raw) as { config?: Record<string, unknown> };
    const config = { ...(project.config ?? {}) };
    if (seconds === null) delete config.mentionHighlightDurationSeconds;
    else config.mentionHighlightDurationSeconds = seconds;
    await atomicWriteFile(
      file,
      JSON.stringify({ ...project, config }, null, 2),
      {
        writeOptions: "utf8",
        durable: process.env.GETWRITE_DURABLE_META === "1",
      },
    );
    return {
      mentionHighlightDurationSeconds: seconds === null ? undefined : seconds,
    };
  });
}
