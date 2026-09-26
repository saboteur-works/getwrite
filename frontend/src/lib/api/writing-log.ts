/**
 * @module api/writing-log
 *
 * Client transport for the daily writing log (Feature 59, FR-9): today's
 * aggregate and the `dailyWordGoal` setter.
 *
 * The client, not the server, decides what "today" is: {@link localDayWindow}
 * computes the local day's start and end instants (DST-length days included)
 * and they are sent as `from`/`to` query parameters, never in a path. The
 * server validates them (`writing-log-core.ts`) and has no timezone fallback.
 *
 * Failure contract: every method REJECTS on a network error, non-2xx status,
 * or malformed body (the malformed body is also reported through
 * `reportTransportValidationFailure`). A failed read must never surface as
 * zero words, so nothing here degrades to an empty aggregate.
 * `setDailyWordGoal` rejects on a malformed body too, even though the save
 * has by then succeeded server-side, so the caller re-reads rather than
 * trusting a fabricated value.
 *
 * Resolved through `createTransport`: HTTP on web/desktop, an in-process
 * backend (`native-writing-log-backend`) on native.
 */
import { createTransport } from "../../store/transport/create-transport";
import type { WritingLogAggregate } from "../models/writing-log-core";
import {
  SetDailyWordGoalResponseSchema,
  WritingLogAggregateResponseSchema,
} from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export type { WritingLogAggregate };

/** The writing-log operations both platforms implement. */
export interface WritingLogTransport {
  /** Aggregate for the half-open window `[from, to)` of ISO instants. */
  getWritingLog(
    projectId: string,
    from: string,
    to: string,
  ): Promise<WritingLogAggregate>;
  /** Sets (non-negative integer) or clears (`null`) `dailyWordGoal`. */
  setDailyWordGoal(
    projectId: string,
    goal: number | null,
  ): Promise<{ dailyWordGoal: number | undefined }>;
}

/**
 * The local day containing `now`, as ISO instants: local midnight at its
 * start and at the start of the next local day. Built from local calendar
 * components, so a 23- or 25-hour DST day yields a 23- or 25-hour window.
 */
export function localDayWindow(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

async function errorMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

const ENDPOINT = "/api/project/writing-log";

/** HTTP transport — the hosted/desktop path. */
export const httpWritingLogTransport: WritingLogTransport = {
  async getWritingLog(projectId, from, to) {
    const query = new URLSearchParams({ projectId, from, to });
    const response = await fetch(`${ENDPOINT}?${query.toString()}`);
    if (!response.ok) {
      throw new Error(
        await errorMessage(
          response,
          `Failed to load the writing log (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = WritingLogAggregateResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      reportTransportValidationFailure(
        "writing-log.getWritingLog",
        parsed.error.issues,
      );
      throw new Error("The writing log response was malformed.");
    }
    // `goal` is absent on the wire when unset; restore the explicit key.
    return { ...parsed.data, goal: parsed.data.goal };
  },

  async setDailyWordGoal(projectId, goal) {
    const response = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, dailyWordGoal: goal }),
    });
    if (!response.ok) {
      throw new Error(
        await errorMessage(
          response,
          `Failed to save the daily word goal (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = SetDailyWordGoalResponseSchema.safeParse(
      await response.json(),
    );
    if (!parsed.success) {
      reportTransportValidationFailure(
        "writing-log.setDailyWordGoal",
        parsed.error.issues,
      );
      throw new Error("The daily word goal response was malformed.");
    }
    return { dailyWordGoal: parsed.data.dailyWordGoal };
  },
};

/**
 * Resolves the transport for the active runtime. The thunk carries the literal
 * `import("../../store/transport/native-writing-log-backend")` specifier so
 * `next.config.mjs`'s `turbopack.resolveAlias` can substitute a `node:*`-free
 * web-stub at build time.
 */
const resolveWritingLogTransport: () => Promise<WritingLogTransport> =
  createTransport(httpWritingLogTransport, () =>
    import("../../store/transport/native-writing-log-backend").then(
      ({ createNativeWritingLogTransport }) =>
        createNativeWritingLogTransport(),
    ),
  );

/**
 * Today's writing-log aggregate for the local day containing `now`.
 * Rejects on any failure; never resolves to a fabricated zero.
 *
 * @param projectId - The project's on-disk directory basename.
 * @param now - Injectable clock; defaults to the current instant.
 */
export async function getTodayWritingLog(
  projectId: string,
  now: Date = new Date(),
): Promise<WritingLogAggregate> {
  const { from, to } = localDayWindow(now);
  const transport = await resolveWritingLogTransport();
  return transport.getWritingLog(projectId, from, to);
}

/**
 * Sets (non-negative integer) or clears (`null`) the project's daily word
 * goal. Rejects on any failure.
 */
export async function setDailyWordGoal(
  projectId: string,
  goal: number | null,
): Promise<{ dailyWordGoal: number | undefined }> {
  const transport = await resolveWritingLogTransport();
  return transport.setDailyWordGoal(projectId, goal);
}
