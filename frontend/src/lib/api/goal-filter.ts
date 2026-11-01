/**
 * @module api/goal-filter
 *
 * Client transport for the writing-goal filter (Feature 98, Task 7, FR-35,
 * FR-36), mirroring `word-count-goal.ts`.
 *
 * Failure contract: `setGoalFilter` rejects on a network error, non-2xx
 * status (the server's refusal message is the error message), or malformed
 * body (the failure is reported through `reportTransportValidationFailure`,
 * which never receives the body). It never returns a fabricated value; the
 * caller re-reads rather than trusting one.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-goal-filter-backend`) on native.
 */
import { createTransport } from "../../store/transport/create-transport";
import { SetGoalFilterResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

/** The goal-filter operations both platforms implement. */
export interface GoalFilterTransport {
  /** Sets (a query AST) or clears (`null`) `config.goalFilter`. */
  setGoalFilter(
    projectId: string,
    filter: unknown,
  ): Promise<{ goalFilter: unknown }>;
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

const ENDPOINT = "/api/project/goal-filter";

/** HTTP transport — the hosted/desktop path. */
export const httpGoalFilterTransport: GoalFilterTransport = {
  async setGoalFilter(projectId, filter) {
    const response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, goalFilter: filter }),
    });
    if (!response.ok) {
      throw new Error(
        await errorMessage(
          response,
          `Failed to save the goal filter (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = SetGoalFilterResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      reportTransportValidationFailure(
        "goal-filter.setGoalFilter",
        parsed.error.issues,
      );
      throw new Error("The goal filter response was malformed.");
    }
    return { goalFilter: parsed.data.goalFilter };
  },
};

/**
 * Resolves the transport for the active runtime. The thunk carries the
 * literal `import("../../store/transport/native-goal-filter-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveGoalFilterTransport: () => Promise<GoalFilterTransport> =
  createTransport(httpGoalFilterTransport, () =>
    import("../../store/transport/native-goal-filter-backend").then(
      ({ createNativeGoalFilterTransport }) =>
        createNativeGoalFilterTransport(),
    ),
  );

/**
 * Sets (a query AST) or clears (`null`) the project's goal filter. Rejects on
 * any failure.
 */
export async function setGoalFilter(
  projectId: string,
  filter: unknown,
): Promise<{ goalFilter: unknown }> {
  const transport = await resolveGoalFilterTransport();
  return transport.setGoalFilter(projectId, filter);
}
