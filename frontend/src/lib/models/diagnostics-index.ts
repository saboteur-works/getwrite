import path from "node:path";
import { atomicWriteFile, mkdir, readFile } from "./io";
import { withMetaLock } from "./meta-locks";
import { isLockedAccessError } from "./locked-access";
import { DiagnosticsIndexSchema } from "./schemas";
import {
  dialogueRatio,
  averageSentenceLength,
  topRepeatedWords,
  HEURISTIC_VERSION,
} from "./prose-diagnostics";

const INDEX_DIR = "meta/index";
const INDEX_FILE = "diagnostics.json";

/**
 * One resource's computed prose diagnostics (Feature 62): the proportion of
 * dialogue, the average sentence length, and the most frequently repeated
 * words, plus the heuristic revision that produced them.
 */
export type DiagnosticsRecord = {
  dialogueRatio: number;
  averageSentenceLength: number;
  topRepeatedWords: { word: string; count: number }[];
  heuristicVersion: number;
};

/**
 * The diagnostics index, keyed by `resourceId` so a resource's own
 * diagnostics are a direct lookup, mirroring `mention-index.ts`'s
 * `MentionIndex` shape.
 */
export type DiagnosticsIndex = Record<string, DiagnosticsRecord>;

async function ensureIndexDir(projectRoot: string): Promise<void> {
  await mkdir(path.join(projectRoot, INDEX_DIR), { recursive: true });
}

/**
 * Load persisted diagnostics index if present; returns an empty index if
 * missing, unreadable, or schema-invalid. A locked-access failure (the
 * project is encrypted and either the workspace is locked or the keyring
 * holds no key for it) is rethrown rather than degraded to the empty-index
 * fallback — silently returning "no diagnostics" for a project that is
 * actually inaccessible would misreport a locked project as one with none.
 *
 * Unlike `mention-index.ts`'s `loadMentionIndex` (a plain `JSON.parse` cast
 * with no schema validation), this load path additionally validates the
 * parsed file against `DiagnosticsIndexSchema` — new ground for this
 * codebase's index modules, not a copy of an existing validated load, and
 * not an oversight that `mention-index.ts` itself was skipped. A
 * schema-invalid file degrades to the empty-index fallback exactly like a
 * missing file: schema invalidity is not a lock error, so the
 * `isLockedAccessError` rethrow rule above does not apply to it.
 */
export async function loadDiagnosticsIndex(
  projectRoot: string,
): Promise<DiagnosticsIndex> {
  const p = path.join(projectRoot, INDEX_DIR, INDEX_FILE);
  try {
    const raw = await readFile(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const result = DiagnosticsIndexSchema.safeParse(parsed);
    if (!result.success) {
      return {};
    }
    return result.data;
  } catch (err) {
    if (isLockedAccessError(err)) {
      throw err;
    }
    return {};
  }
}

/** Persist the diagnostics index under `meta/index/diagnostics.json`. */
export async function persistDiagnosticsIndex(
  projectRoot: string,
  index: DiagnosticsIndex,
): Promise<void> {
  await ensureIndexDir(projectRoot);
  const p = path.join(projectRoot, INDEX_DIR, INDEX_FILE);
  await withMetaLock(projectRoot, async () => {
    await atomicWriteFile(p, JSON.stringify(index, null, 2), {
      writeOptions: "utf8",
      durable: process.env.GETWRITE_DURABLE_META === "1",
    });
  });
}

/**
 * Remove a resource from the persisted diagnostics index: deletes its own
 * key only, mirroring `mention-index.ts`'s `removeResourceFromMentionIndex`
 * (load, modify, persist, inside one `withMetaLock` call via
 * `persistDiagnosticsIndex`'s own lock).
 */
export async function removeResourceFromDiagnosticsIndex(
  projectRoot: string,
  resourceId: string,
): Promise<void> {
  const index = await loadDiagnosticsIndex(projectRoot);
  if (!(resourceId in index)) return;
  delete index[resourceId];
  await persistDiagnosticsIndex(projectRoot, index);
}

/**
 * Given a resource's persisted plain text, returns its diagnostics record —
 * recomputing and re-persisting it first if the stored record is missing or
 * was computed by an older `HEURISTIC_VERSION` than the one currently in
 * effect (`prose-diagnostics.ts`). When the stored record's version already
 * matches, it is returned completely unchanged: no recompute, no re-persist.
 *
 * This is the "lazy rebuild on read" seam a later task's on-demand detail
 * read (Task 5) is expected to call, so a stale record is corrected the
 * first time anything reads it rather than waiting for the resource's next
 * save.
 */
export async function rebuildDiagnosticsRecordIfStale(
  projectRoot: string,
  resourceId: string,
  plainText: string,
): Promise<DiagnosticsRecord> {
  const index = await loadDiagnosticsIndex(projectRoot);
  const stored = index[resourceId];
  if (stored && stored.heuristicVersion === HEURISTIC_VERSION) {
    return stored;
  }

  const fresh: DiagnosticsRecord = {
    dialogueRatio: dialogueRatio(plainText),
    averageSentenceLength: averageSentenceLength(plainText),
    topRepeatedWords: topRepeatedWords(plainText),
    heuristicVersion: HEURISTIC_VERSION,
  };
  index[resourceId] = fresh;
  await persistDiagnosticsIndex(projectRoot, index);
  return fresh;
}

const diagnosticsIndex = {
  loadDiagnosticsIndex,
  persistDiagnosticsIndex,
  removeResourceFromDiagnosticsIndex,
  rebuildDiagnosticsRecordIfStale,
};
export default diagnosticsIndex;
