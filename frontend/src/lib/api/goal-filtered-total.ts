/**
 * @module api/goal-filtered-total
 *
 * Client transport for the writing-goal filtered total (Feature 98, Task 8,
 * FR-35, FR-36).
 *
 * Failure contract: `getGoalFilteredTotal` resolves a typed
 * {@link GoalFilteredTotalResult}. An `unavailable` result is a resolved
 * value (it has no `total` key). A network error, non-2xx status (the
 * server's message is the error message) or malformed body rejects; a
 * malformed body is reported through `reportTransportValidationFailure`,
 * which never receives the body. The module never returns a number for a
 * failure. Membership is evaluated on the server (or the native core), never
 * here.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-goal-total-backend`) on native.
 */
import { createTransport } from "../../store/transport/create-transport";
import type { GoalFilteredTotalResult } from "../models/goal-filtered-total-core";
import { GoalFilteredTotalResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export type { GoalFilteredTotalResult };

/** The filtered-total read both platforms implement. */
export interface GoalFilteredTotalTransport {
  getGoalFilteredTotal(projectId: string): Promise<GoalFilteredTotalResult>;
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

const ENDPOINT = "/api/project/goal-filtered-total";

/** HTTP transport — the hosted/desktop path. */
export const httpGoalFilteredTotalTransport: GoalFilteredTotalTransport = {
  async getGoalFilteredTotal(projectId) {
    const response = await fetch(
      `${ENDPOINT}?projectId=${encodeURIComponent(projectId)}`,
    );
    if (!response.ok) {
      throw new Error(
        await errorMessage(
          response,
          `Failed to read the filtered total (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = GoalFilteredTotalResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      reportTransportValidationFailure(
        "goal-filtered-total.getGoalFilteredTotal",
        parsed.error.issues,
      );
      throw new Error("The filtered total response was malformed.");
    }
    return parsed.data;
  },
};

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-goal-total-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveGoalFilteredTotalTransport: () => Promise<GoalFilteredTotalTransport> =
  createTransport(httpGoalFilteredTotalTransport, () =>
    import("../../store/transport/native-goal-total-backend").then(
      ({ createNativeGoalTotalTransport }) => createNativeGoalTotalTransport(),
    ),
  );

/**
 * Reads the project's filtered total. Resolves a typed result (including
 * `unavailable`); rejects on any transport failure.
 */
export async function getGoalFilteredTotal(
  projectId: string,
): Promise<GoalFilteredTotalResult> {
  const transport = await resolveGoalFilteredTotalTransport();
  return transport.getGoalFilteredTotal(projectId);
}
