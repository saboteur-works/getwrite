import path from "node:path";
import { atomicWriteFile, mkdir, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { isLockedAccessError } from "./locked-access";
import { WritingLogDayFileSchema } from "./schemas";
import type {
  WritingLogDayFile,
  WritingLogEntry,
  WritingLogSource,
} from "./types";

const LOG_DIR = "meta/writing-log";
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A day file exists but is unreadable as JSON or fails schema validation. */
export class WritingLogCorruptError extends Error {
  constructor(
    public readonly dayKey: string,
    detail: string,
  ) {
    super(`Writing log day file ${dayKey}.json is corrupt: ${detail}`);
    this.name = "WritingLogCorruptError";
  }
}

/** A timestamp could not be turned into a valid UTC day key. */
export class InvalidWritingLogTimestampError extends Error {
  constructor(value: unknown) {
    super(`Invalid writing-log timestamp: ${String(value)}`);
    this.name = "InvalidWritingLogTimestampError";
  }
}

/**
 * What a caller supplies to append. The timestamp is assigned by the model
 * (never by the client), so an entry carries no date or path.
 */
export type WritingLogEntryInput =
  | { added: number; deleted: number; source?: WritingLogSource }
  | { skipped: true };

/**
 * Parse an ISO instant (or Date) and return the normalized UTC ISO string.
 * Throws {@link InvalidWritingLogTimestampError} for non-ISO, unparsable or
 * out-of-range (year outside 0000-9999) values.
 */
function normalizeInstant(value: string | Date): string {
  if (typeof value === "string" && !ISO_INSTANT_PATTERN.test(value)) {
    throw new InvalidWritingLogTimestampError(value);
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new InvalidWritingLogTimestampError(value);
  }
  const iso = d.toISOString();
  if (!/^\d{4}-/.test(iso)) {
    throw new InvalidWritingLogTimestampError(value);
  }
  return iso;
}

/** UTC `YYYY-MM-DD` key of a normalized ISO instant; always matches the key pattern. */
function dayKeyOf(iso: string): string {
  const key = iso.slice(0, 10);
  if (!DAY_KEY_PATTERN.test(key)) {
    throw new InvalidWritingLogTimestampError(iso);
  }
  return key;
}

function dayFilePath(projectRoot: string, dayKey: string): string {
  return path.join(projectRoot, LOG_DIR, `${dayKey}.json`);
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; message?: unknown };
  return (
    e.code === "ENOENT" ||
    (typeof e.message === "string" && e.message.startsWith("ENOENT"))
  );
}

/**
 * Load one day file. A missing file is an empty day; a corrupt one throws
 * {@link WritingLogCorruptError}; locked-access and other I/O errors propagate.
 */
async function loadDayFile(
  projectRoot: string,
  dayKey: string,
): Promise<WritingLogDayFile> {
  let raw: string;
  try {
    raw = await readFile(dayFilePath(projectRoot, dayKey), "utf8");
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    if (isNotFound(err)) return { entries: [] };
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new WritingLogCorruptError(dayKey, (err as Error).message);
  }
  const result = WritingLogDayFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new WritingLogCorruptError(dayKey, result.error.message);
  }
  return result.data;
}

function buildEntry(
  input: WritingLogEntryInput,
  timestamp: string,
): WritingLogEntry {
  if ("skipped" in input) return { skipped: true, timestamp };
  return {
    added: input.added,
    deleted: input.deleted,
    net: input.added - input.deleted,
    timestamp,
    ...(input.source ? { source: input.source } : {}),
  };
}

/**
 * Append one entry to the day file keyed by the UTC date of its timestamp.
 * The timestamp is `now` (default: the current instant), assigned here; the
 * key is derived from it and no date or path is accepted. Runs as a
 * read-modify-write inside `withMetaLock(projectRoot, ...)`. Existing entries
 * are preserved verbatim. Returns the entry as stored.
 *
 * @throws InvalidWritingLogTimestampError for a bad `now`, before any path is built.
 * @throws WritingLogCorruptError if the target day file is corrupt.
 */
export async function appendWritingLogEntry(
  projectRoot: string,
  input: WritingLogEntryInput,
  now: string | Date = new Date(),
): Promise<WritingLogEntry> {
  const timestamp = normalizeInstant(now);
  const dayKey = dayKeyOf(timestamp);
  const entry = buildEntry(input, timestamp);

  return withMetaLock(projectRoot, async () => {
    const existing = await loadDayFile(projectRoot, dayKey);
    const next = WritingLogDayFileSchema.parse({
      entries: [...existing.entries, entry],
    });
    await mkdir(path.join(projectRoot, LOG_DIR), { recursive: true });
    await atomicWriteFile(
      dayFilePath(projectRoot, dayKey),
      JSON.stringify(next, null, 2),
      {
        writeOptions: "utf8",
        durable: process.env.GETWRITE_DURABLE_META === "1",
      },
    );
    return entry;
  });
}

/**
 * Read entries with `from <= timestamp < to`, ordered by timestamp, by
 * loading only the UTC day files the window overlaps. The window is trusted
 * to be already validated (Task 9); `from`/`to` are only parsed as instants.
 *
 * @throws WritingLogCorruptError if an overlapping day file is corrupt.
 */
export async function readWritingLogEntries(
  projectRoot: string,
  from: string,
  to: string,
): Promise<WritingLogEntry[]> {
  const fromIso = normalizeInstant(from);
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(normalizeInstant(to));
  if (toMs <= fromMs) return [];

  const startDay = Date.parse(`${dayKeyOf(fromIso)}T00:00:00.000Z`);
  const lastKey = dayKeyOf(new Date(toMs - 1).toISOString());
  const endDay = Date.parse(`${lastKey}T00:00:00.000Z`);
  const keys: string[] = [];
  for (let t = startDay; t <= endDay; t += DAY_MS) {
    keys.push(dayKeyOf(new Date(t).toISOString()));
  }

  const files = await Promise.all(keys.map((k) => loadDayFile(projectRoot, k)));
  return files
    .flatMap((f) => f.entries)
    .filter((e) => {
      const ms = Date.parse(e.timestamp);
      return ms >= fromMs && ms < toMs;
    })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}
