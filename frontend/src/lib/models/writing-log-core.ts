/**
 * @module writing-log-core
 *
 * Transport-agnostic cores for the daily writing log (Feature 59, Task 9),
 * shared by the HTTP route and the native backend. No `Response` is ever
 * constructed; failures are typed errors the caller maps to a status.
 *
 * The local-day window is required from the client and validated HERE (OQ-14):
 * there is no server-timezone or UTC fallback, an over-long window is rejected
 * rather than clamped, and the window is never a path component.
 */
import path from "node:path";
import { atomicWriteFile, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { loadProjectConfig, PROJECT_FILENAME } from "./project-config";
import { readWritingLogEntries } from "./writing-log";

export { InvalidProjectIdCoreError };

/** Longest accepted local-day window: 25h DST day plus 1h of slack. */
export const MAX_WINDOW_MS = 26 * 60 * 60 * 1000;
/** Most UTC day files a validated window may overlap. */
export const MAX_WINDOW_DAY_FILES = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** The client-supplied window is missing, malformed, unordered or too long. Map to HTTP 400. */
export class InvalidWritingLogWindowError extends Error {
  constructor(detail: string) {
    super(`Invalid writing-log window: ${detail}`);
    this.name = "InvalidWritingLogWindowError";
  }
}

/** The requested daily goal is not a non-negative integer. Map to HTTP 400. */
export class InvalidDailyWordGoalError extends Error {
  constructor(value: unknown) {
    super(
      `Invalid dailyWordGoal: ${String(value)} (must be a non-negative integer)`,
    );
    this.name = "InvalidDailyWordGoalError";
  }
}

export interface WritingLogTotals {
  added: number;
  deleted: number;
  net: number;
}

/** Result of {@link getWritingLogAggregateCore}. */
export interface WritingLogAggregate {
  /** Non-import entries only. `totals.net` is the goal comparison figure. */
  totals: WritingLogTotals;
  /** Entries carrying a `source` (imports), summed separately and never compared to the goal. */
  imported: WritingLogTotals;
  /** `dailyWordGoal`, or `undefined` when none is set. */
  goal: number | undefined;
  /** True when the window contains a marker entry (some writing was not counted). */
  incomplete: boolean;
}

function parseInstant(name: string, value: unknown): number {
  if (typeof value !== "string" || value === "") {
    throw new InvalidWritingLogWindowError(`${name} is required`);
  }
  if (!ISO_INSTANT_PATTERN.test(value)) {
    throw new InvalidWritingLogWindowError(`${name} is not an ISO instant`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new InvalidWritingLogWindowError(`${name} is not an ISO instant`);
  }
  return ms;
}

/** Number of UTC day files the half-open window `[fromMs, toMs)` overlaps. */
export function countUtcDayFiles(fromMs: number, toMs: number): number {
  const firstDay = Math.floor(fromMs / DAY_MS);
  const lastDay = Math.floor((toMs - 1) / DAY_MS);
  return lastDay - firstDay + 1;
}

/**
 * Validate a client-supplied local-day window.
 * @throws InvalidWritingLogWindowError on any violation.
 */
export function validateWritingLogWindow(
  from: unknown,
  to: unknown,
): { fromMs: number; toMs: number } {
  const fromMs = parseInstant("from", from);
  const toMs = parseInstant("to", to);
  if (toMs <= fromMs) {
    throw new InvalidWritingLogWindowError("to must be after from");
  }
  if (toMs - fromMs > MAX_WINDOW_MS) {
    throw new InvalidWritingLogWindowError("window exceeds 26 hours");
  }
  if (countUtcDayFiles(fromMs, toMs) > MAX_WINDOW_DAY_FILES) {
    throw new InvalidWritingLogWindowError(
      `window spans more than ${MAX_WINDOW_DAY_FILES} UTC day files`,
    );
  }
  return { fromMs, toMs };
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

/**
 * Aggregate the writing log for one local day, given the client's window.
 *
 * @throws InvalidProjectIdCoreError, InvalidWritingLogWindowError,
 *   WritingLogCorruptError; locked-access errors are rethrown unchanged.
 */
export async function getWritingLogAggregateCore(
  projectId: string,
  from: string | null | undefined,
  to: string | null | undefined,
): Promise<WritingLogAggregate> {
  const projectRoot = requireProjectRoot(projectId);
  validateWritingLogWindow(from, to);
  return aggregateForRoot(projectRoot, from as string, to as string);
}

/** Root-keyed aggregation (re-validates the window). Exported for tests. */
export async function aggregateForRoot(
  projectRoot: string,
  from: string,
  to: string,
): Promise<WritingLogAggregate> {
  validateWritingLogWindow(from, to);
  const entries = await readWritingLogEntries(projectRoot, from, to);
  const totals: WritingLogTotals = { added: 0, deleted: 0, net: 0 };
  const imported: WritingLogTotals = { added: 0, deleted: 0, net: 0 };
  let isIncomplete = false;
  for (const e of entries) {
    if ("skipped" in e) {
      isIncomplete = true;
      continue;
    }
    const bucket = e.source ? imported : totals;
    bucket.added += e.added;
    bucket.deleted += e.deleted;
    bucket.net += e.net;
  }
  const config = await loadProjectConfig(projectRoot);
  return {
    totals,
    imported,
    goal: config.dailyWordGoal,
    incomplete: isIncomplete,
  };
}

/**
 * Set (`goal` a non-negative integer) or clear (`null`) `config.dailyWordGoal`
 * in `project.json`, touching no other config key (notably `wordCountGoal`).
 * Returns the stored goal (`undefined` after a clear).
 *
 * @throws InvalidDailyWordGoalError, InvalidProjectIdCoreError; locked-access
 *   errors are rethrown unchanged.
 */
export async function setDailyWordGoalCore(
  projectId: string,
  goal: number | null,
): Promise<{ dailyWordGoal: number | undefined }> {
  const projectRoot = requireProjectRoot(projectId);
  if (goal !== null && (!Number.isInteger(goal) || goal < 0)) {
    throw new InvalidDailyWordGoalError(goal);
  }
  const file = path.join(projectRoot, PROJECT_FILENAME);
  return withMetaLock(projectRoot, async () => {
    const raw = await readFile(file, "utf8");
    const project = JSON.parse(raw) as { config?: Record<string, unknown> };
    const config = { ...(project.config ?? {}) };
    if (goal === null) delete config.dailyWordGoal;
    else config.dailyWordGoal = goal;
    await atomicWriteFile(
      file,
      JSON.stringify({ ...project, config }, null, 2),
      {
        writeOptions: "utf8",
        durable: process.env.GETWRITE_DURABLE_META === "1",
      },
    );
    return { dailyWordGoal: goal === null ? undefined : goal };
  });
}
