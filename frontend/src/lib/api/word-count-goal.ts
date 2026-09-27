/**
 * @module api/word-count-goal
 *
 * Client transport for the project-wide word-count goal (Feature 61, Task 3),
 * mirroring `writing-log.ts`'s `setDailyWordGoal` pattern exactly.
 *
 * Failure contract: `setWordCountGoal` rejects on a network error, non-2xx
 * status, or malformed body (the malformed body is also reported through
 * `reportTransportValidationFailure`), even though the save has by then
 * succeeded server-side, so the caller re-reads rather than trusting a
 * fabricated value.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-word-count-goal-backend`) on native.
 */
import { createTransport } from "../../store/transport/create-transport";
import { SetWordCountGoalResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

/** The word-count-goal operations both platforms implement. */
export interface WordCountGoalTransport {
  /** Sets (non-negative integer) or clears (`null`) `config.wordCountGoal`. */
  setWordCountGoal(
    projectId: string,
    goal: number | null,
  ): Promise<{ wordCountGoal: number | undefined }>;
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

const ENDPOINT = "/api/project/word-count-goal";

/** HTTP transport — the hosted/desktop path. */
export const httpWordCountGoalTransport: WordCountGoalTransport = {
  async setWordCountGoal(projectId, goal) {
    const response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, wordCountGoal: goal }),
    });
    if (!response.ok) {
      throw new Error(
        await errorMessage(
          response,
          `Failed to save the word-count goal (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = SetWordCountGoalResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      reportTransportValidationFailure(
        "word-count-goal.setWordCountGoal",
        parsed.error.issues,
      );
      throw new Error("The word-count goal response was malformed.");
    }
    return { wordCountGoal: parsed.data.wordCountGoal };
  },
};

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-word-count-goal-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveWordCountGoalTransport: () => Promise<WordCountGoalTransport> =
  createTransport(httpWordCountGoalTransport, () =>
    import("../../store/transport/native-word-count-goal-backend").then(
      ({ createNativeWordCountGoalTransport }) =>
        createNativeWordCountGoalTransport(),
    ),
  );

/**
 * Sets (non-negative integer) or clears (`null`) the project's word-count
 * goal. Rejects on any failure.
 */
export async function setWordCountGoal(
  projectId: string,
  goal: number | null,
): Promise<{ wordCountGoal: number | undefined }> {
  const transport = await resolveWordCountGoalTransport();
  return transport.setWordCountGoal(projectId, goal);
}
