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
import { withMetaLock } from "./meta-locks";
import { updateProjectJson } from "./project-json-write";
import type { ProjectConfig, WritingLogEntry } from "./types";
import { readSidecar } from "./sidecar";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { loadProjectConfig } from "./project-config";
import { readWritingLogEntries } from "./writing-log";
import path from "node:path";
import { readFolderTree } from "./folder-utils";
import {
  computeInboxSubtree,
  isInInbox,
  type InboxFolderNode,
  type InboxSubtree,
} from "./inbox-membership";
import { classifyGoalReadError } from "./goal-read-error";
import {
  evaluateGoalMembership,
  type GoalMembershipResult,
} from "./goal-filter-membership-core";

export { InvalidProjectIdCoreError };

/** Longest accepted local-day window: 25h DST day plus 1h of slack. */
const MAX_WINDOW_MS = 26 * 60 * 60 * 1000;
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

/**
 * A goal filter is set but the filtered daily figure cannot be computed
 * (Feature 98, FR-31). Carries the failure so a caller shows "unavailable",
 * never a number.
 */
export class GoalFilteredFigureUnavailableError extends Error {
  constructor(
    public readonly failure: Extract<
      GoalMembershipResult,
      { status: "failure" }
    >,
  ) {
    super(`Filtered daily figure is unavailable: ${failure.reason}`);
    this.name = "GoalFilteredFigureUnavailableError";
  }
}

interface WritingLogTotals {
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
  /** True when a goal filter is applied to `totals` (Feature 98, FR-29). */
  isFiltered: boolean;
  /** True when the filter matched no live text document; `totals` is then a real zero. */
  hasNoMatch: boolean;
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
 *   WritingLogCorruptError, GoalFilteredFigureUnavailableError; locked-access errors are rethrown unchanged.
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

/**
 * Live matching document ids when a goal filter is set, else `null`
 * (unfiltered: today's behaviour). Membership is evaluated on every read.
 * @throws GoalFilteredFigureUnavailableError when membership is unknown.
 */
async function resolveFilterMembers(
  projectRoot: string,
  config: ProjectConfig,
): Promise<Set<string> | null> {
  if (config.goalFilter === undefined) return null;
  const result = await evaluateGoalMembership(projectRoot, new Date());
  switch (result.status) {
    case "not-filtered":
      return null;
    case "members":
      return new Set(result.ids);
    case "no-match":
      return new Set();
    case "failure":
      throw new GoalFilteredFigureUnavailableError(result);
  }
}

/** An import entry carries a `source`; markers and ordinary word entries do not. */
function isImportEntry(e: WritingLogEntry): boolean {
  return "source" in e && e.source !== undefined;
}

/** Folder descriptors as the Inbox walk needs them; entries without an id are skipped. */
function toFolderNodes(raw: readonly unknown[]): InboxFolderNode[] {
  const nodes: InboxFolderNode[] = [];
  for (const entry of raw) {
    const f = entry as Record<string, unknown> | null;
    if (f === null || typeof f !== "object" || typeof f.id !== "string") {
      continue;
    }
    nodes.push({
      id: f.id,
      parentId: typeof f.parentId === "string" ? f.parentId : null,
    });
  }
  return nodes;
}

/**
 * The Inbox subtree, or `null` when no Inbox is set. The folder tree is read
 * once. A parent cycle through the Inbox is malformed data, so the figure is
 * unavailable rather than counted as "not in the Inbox".
 * @throws GoalFilteredFigureUnavailableError on a cycle.
 */
async function readInboxSubtree(
  projectRoot: string,
  config: ProjectConfig,
): Promise<InboxSubtree | null> {
  if (!config.inboxFolderId) return null;
  const folders = await readFolderTree(path.join(projectRoot, "folders"));
  const computed = computeInboxSubtree(
    toFolderNodes(folders),
    config.inboxFolderId,
  );
  if (!computed.ok) {
    throw new GoalFilteredFigureUnavailableError({
      status: "failure",
      reason: "read-failed",
      cause: "corrupt",
    });
  }
  return computed.subtree;
}

/**
 * Reads one sidecar. A recognised read failure becomes the unavailable error;
 * a locked-access error and any unrecognised error are rethrown unchanged.
 */
async function readSidecarForFigure(
  projectRoot: string,
  id: string,
): Promise<Awaited<ReturnType<typeof readSidecar>>> {
  try {
    return await readSidecar(projectRoot, id);
  } catch (err) {
    const cause = classifyGoalReadError(err, "writing-log-core");
    if (cause === null || cause === "locked") throw err;
    throw new GoalFilteredFigureUnavailableError({
      status: "failure",
      reason: "read-failed",
      cause,
    });
  }
}

/**
 * With no goal filter: the ids among the window's entries whose document is a
 * Source (Owner decision, 2026-11-07, FR-28) or is filed in the Inbox folder
 * or a descendant of it (Feature 106, FR-7). Membership is read now, so a
 * document moved out of the Inbox counts again. Only ids the window names are
 * read. A document with no sidecar (deleted) is not excluded, so its entries
 * count as they did before; a failed read never counts as "not excluded".
 * @throws GoalFilteredFigureUnavailableError on an unreadable sidecar or a
 *   parent cycle through the Inbox.
 */
async function findExcludedDocumentIds(
  projectRoot: string,
  config: ProjectConfig,
  entries: readonly WritingLogEntry[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const e of entries) {
    if (!isImportEntry(e) && e.documentId !== undefined) ids.add(e.documentId);
  }
  const excluded = new Set<string>();
  if (ids.size === 0) return excluded;
  const subtree = await readInboxSubtree(projectRoot, config);
  for (const id of ids) {
    const sidecar = await readSidecarForFigure(projectRoot, id);
    if (sidecar === null) continue;
    const folderId =
      typeof sidecar.folderId === "string" ? sidecar.folderId : null;
    if (
      sidecar.type === "source" ||
      (subtree !== null && isInInbox(subtree, { id, type: "text", folderId }))
    ) {
      excluded.add(id);
    }
  }
  return excluded;
}

/** Root-keyed aggregation (re-validates the window). Exported for tests. */
async function aggregateForRoot(
  projectRoot: string,
  from: string,
  to: string,
): Promise<WritingLogAggregate> {
  validateWritingLogWindow(from, to);
  const entries = await readWritingLogEntries(projectRoot, from, to);
  const totals: WritingLogTotals = { added: 0, deleted: 0, net: 0 };
  const imported: WritingLogTotals = { added: 0, deleted: 0, net: 0 };
  const config = await loadProjectConfig(projectRoot);
  const memberIds = await resolveFilterMembers(projectRoot, config);
  const sourceIds =
    memberIds === null
      ? await findExcludedDocumentIds(projectRoot, config, entries)
      : new Set<string>();
  let isIncomplete = false;
  for (const e of entries) {
    if (
      !isImportEntry(e) &&
      e.documentId !== undefined &&
      sourceIds.has(e.documentId)
    ) {
      // No filter: a Source's or an Inbox item's words and markers are outside the daily figure.
      continue;
    }
    if ("skipped" in e) {
      // Filtered: a marker counts only for a matching document or with no id.
      if (
        memberIds === null ||
        e.documentId === undefined ||
        memberIds.has(e.documentId)
      ) {
        isIncomplete = true;
      }
      continue;
    }
    if (!e.source && memberIds !== null) {
      // Filtered: only entries of a live, matching text document count.
      if (e.documentId === undefined) {
        // Pre-upgrade entry: its document is unknown, so the figure may be low.
        isIncomplete = true;
        continue;
      }
      if (!memberIds.has(e.documentId)) continue;
    }
    const bucket = e.source ? imported : totals;
    bucket.added += e.added;
    bucket.deleted += e.deleted;
    bucket.net += e.net;
  }
  return {
    totals,
    imported,
    goal: config.dailyWordGoal,
    incomplete: isIncomplete,
    isFiltered: memberIds !== null,
    hasNoMatch: memberIds !== null && memberIds.size === 0,
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
  return withMetaLock(projectRoot, async () => {
    await updateProjectJson(
      projectRoot,
      (project) => {
        const config: Record<string, unknown> = { ...(project.config ?? {}) };
        if (goal === null) delete config.dailyWordGoal;
        else config.dailyWordGoal = goal;
        project.config = config as unknown as ProjectConfig;
        return { result: undefined };
      },
      { durable: process.env.GETWRITE_DURABLE_META === "1" },
    );
    return { dailyWordGoal: goal === null ? undefined : goal };
  });
}
