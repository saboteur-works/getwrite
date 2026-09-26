// Last Updated: 2026-07-25

/**
 * @module revision-core
 *
 * **ADR-021 Phase 1 (Task 2) — transport-agnostic revision core.** The
 * business logic behind `app/api/resource/revision/[resource-id]/route.ts`,
 * lifted so it can be reused by both the HTTP route (web/desktop) and the
 * native in-process transport (`store/transport/native-revision-backend.ts`)
 * with byte-for-byte identical filesystem behavior.
 *
 * This module has no `next`/`NextRequest`/`NextResponse` import and never
 * constructs a `Response`. Every function operates on plain
 * `projectRoot`/`resourceId` values and throws plain `Error`s. The route
 * catches those errors and maps them to its existing HTTP status codes; the
 * native backend lets them propagate directly to the caller. Error messages
 * are intentionally kept identical to the route's pre-refactor inline
 * messages so that mapping continues to work unmodified.
 */
import path from "node:path";
import { readFile, writeFile, rm } from "./io";
import {
  listRevisions,
  revisionDir,
  setCanonicalRevision as setCanonicalRevisionByVersion,
  writeRevision,
} from "./revision";
import { readSidecar, writeSidecar } from "./sidecar";
import type { Revision } from "./types";
import { persistResourceContent, tiptapToPlainText } from "../tiptap-utils";
import { countWords } from "../word-count";
import type { TipTapDocument } from "../models";
import { resolveProjectRoot } from "./project-root-resolver";
import { isDestructiveContentChange } from "./content-loss";
import { appendWritingLogEntry } from "./writing-log";
import { diffWords } from "./word-diff";
import { isLockedAccessError } from "./locked-access";

/**
 * When `content` is omitted, {@link createRevision} reads the resource's
 * current saved content from the filesystem.
 */
export interface CreateRevisionOptions {
  content?: string;
  author?: string;
  isCanonical?: boolean;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------

/**
 * Validates `projectId` against the canonical UUID validator and, on
 * success, resolves it to its on-disk project directory under
 * {@link resolveProjectsDir}.
 *
 * A plain, `Response`-free counterpart to `project-path.ts`'s
 * `resolveProjectPath` — same validate-then-join logic, but returns `null`
 * instead of a 400 `Response` on invalid/missing input, so it can be used
 * from non-HTTP callers (the native transport).
 *
 * @param projectId - The candidate project identifier to validate.
 * @returns The resolved on-disk project directory, or `null` when
 *   `projectId` is not a well-formed UUID.
 */
export const resolveRevisionProjectRoot = resolveProjectRoot;

// ---------------------------------------------------------------------------
// Private helpers (lifted verbatim from the route)
// ---------------------------------------------------------------------------

/**
 * Name given to a revision minted automatically to preserve content an
 * autosave was about to destroy. Shown in the revision list exactly like a
 * writer-named revision, so the way back is where they already look.
 */
export const AUTOMATIC_SNAPSHOT_NAME = "Auto-backup before large deletion";

async function findRevisionById(
  projectPath: string,
  resourceId: string,
  revisionId: string,
): Promise<Revision> {
  const revisions = await listRevisions(projectPath, resourceId);
  const match = revisions.find((r) => r.id === revisionId);
  if (!match) throw new Error(`Revision ${revisionId} not found.`);
  return match;
}

async function readRevisionContent(
  projectPath: string,
  resourceId: string,
  versionNumber: number,
): Promise<string> {
  const contentPath = path.join(
    revisionDir(projectPath, resourceId, versionNumber),
    "content.bin",
  );
  return readFile(contentPath, "utf8");
}

async function writeRevisionContent(
  projectPath: string,
  resourceId: string,
  versionNumber: number,
  content: string,
): Promise<void> {
  const contentPath = path.join(
    revisionDir(projectPath, resourceId, versionNumber),
    "content.bin",
  );
  await writeFile(contentPath, content, "utf8");
}

/**
 * Best-effort sync of a resource's derived content files from a canonical
 * revision's serialized TipTap content.
 *
 * Compile, export, and the search index read `resources/<id>/content.txt` and
 * `content.tiptap.json` — not the revision's `content.bin`. Rewriting them here
 * keeps them from drifting behind the canonical revision, so newly typed text
 * reaches a compile without first remounting the editor (which previously was
 * the only thing that re-synced these files).
 *
 * Silently no-ops when the content is not a TipTap document (e.g. a legacy
 * plain-text revision); the revision write remains the source of truth then.
 *
 * @returns The word count of the plain text just written, or `undefined` when
 *   nothing was synced. The caller needs it to keep the sidecar's `wordCount`
 *   from drifting behind the content — see {@link updateRevisionInPlace}.
 */
async function syncDerivedResourceContent(
  projectPath: string,
  resourceId: string,
  content: string,
): Promise<number | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { type?: unknown }).type !== "doc"
  ) {
    return undefined;
  }

  const doc = parsed as TipTapDocument;
  await persistResourceContent(projectPath, resourceId, doc);
  // Counted from the same document that was just written, so the returned
  // value describes the content actually on disk rather than whatever the
  // caller believed it was saving.
  return countWords(tiptapToPlainText(doc));
}

/**
 * Reads the current saved content for a resource from the filesystem.
 *
 * Checks for `content.tiptap.json` first, then falls back to `content.txt`.
 * Returns the raw file contents as a string, or throws if neither file exists.
 */
async function readCurrentResourceContent(
  projectPath: string,
  resourceId: string,
): Promise<string> {
  const resourceDir = path.join(projectPath, "resources", resourceId);

  const tiptapPath = path.join(resourceDir, "content.tiptap.json");
  try {
    return await readFile(tiptapPath, "utf8");
  } catch {
    // Fall through to plaintext
  }

  const plaintextPath = path.join(resourceDir, "content.txt");
  try {
    return await readFile(plaintextPath, "utf8");
  } catch {
    throw new Error(
      `No readable content file found for resource ${resourceId}.`,
    );
  }
}

/**
 * Derives the next sequential version number for a resource.
 *
 * Returns 1 when no prior revisions exist, otherwise increments the
 * highest existing version number by 1.
 */
async function resolveNextVersionNumber(
  projectPath: string,
  resourceId: string,
): Promise<number> {
  const existing = await listRevisions(projectPath, resourceId);
  if (existing.length === 0) return 1;
  const highest = Math.max(...existing.map((r) => r.versionNumber));
  return highest + 1;
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/**
 * Reads a specific revision's metadata and content.
 *
 * @throws {Error} `Revision ${revisionId} not found.` when no matching
 *   revision exists.
 */
export async function readRevision(
  projectRoot: string,
  resourceId: string,
  revisionId: string,
): Promise<{ revision: Revision; content: string }> {
  const revision = await findRevisionById(projectRoot, resourceId, revisionId);
  const content = await readRevisionContent(
    projectRoot,
    resourceId,
    revision.versionNumber,
  );
  return { revision, content };
}

/**
 * Creates a new revision, reading current filesystem content when
 * `opts.content` is omitted, and optionally flips it canonical.
 */
export async function createRevision(
  projectRoot: string,
  resourceId: string,
  opts: CreateRevisionOptions,
): Promise<Revision> {
  const content =
    opts.content ?? (await readCurrentResourceContent(projectRoot, resourceId));

  const versionNumber = await resolveNextVersionNumber(projectRoot, resourceId);

  const revision = await writeRevision(
    projectRoot,
    resourceId,
    versionNumber,
    content,
    {
      author: opts.author,
      isCanonical: opts.isCanonical ?? false,
      metadata: opts.metadata,
    },
  );

  if (opts.isCanonical) {
    await setCanonicalRevisionByVersion(projectRoot, resourceId, versionNumber);
  }

  return revision;
}

/**
 * Preserves the canonical revision's current content as its own non-canonical
 * revision when the incoming write would destroy most of it.
 *
 * Autosave writes through the canonical revision, so without this a
 * destructive editor state (undo overshoot, select-all-and-type, paste over a
 * full selection) overwrites the only copy on disk: the content files are
 * rewritten from the same document, and a resource with one revision is left
 * with no undamaged state anywhere (note_68cf31b0).
 *
 * Best-effort by design. A resource whose current content cannot be read has
 * nothing to preserve, and a snapshot that fails to write must not take the
 * writer's edit down with it — the save is what they are waiting on, so both
 * cases fall through to the write rather than throwing.
 *
 * @returns The snapshot revision written, or `null` when none was needed or
 *   possible.
 */
async function snapshotBeforeDestructiveWrite(
  projectRoot: string,
  resourceId: string,
  versionNumber: number,
  incomingContent: string,
): Promise<Revision | null> {
  let previousContent: string;
  try {
    previousContent = await readRevisionContent(
      projectRoot,
      resourceId,
      versionNumber,
    );
  } catch {
    return null;
  }

  if (!isDestructiveContentChange(previousContent, incomingContent)) {
    return null;
  }

  try {
    const snapshotVersion = await resolveNextVersionNumber(
      projectRoot,
      resourceId,
    );
    return await writeRevision(
      projectRoot,
      resourceId,
      snapshotVersion,
      previousContent,
      {
        isCanonical: false,
        metadata: { name: AUTOMATIC_SNAPSHOT_NAME, automaticSnapshot: true },
      },
    );
  } catch (error) {
    console.error(
      "Failed to snapshot canonical revision before a destructive write",
      error,
    );
    return null;
  }
}

/**
 * Signal on an in-place save result describing writing-log trouble. Absent
 * when the save was logged normally.
 *
 * - `skipped`: previous or new content was unreadable/non-TipTap, so a marker
 *   entry (not a word entry) was recorded instead.
 * - `markerAppendFailed`: `skipped` and the marker append itself failed.
 * - `appendFailed`: the word entry append failed; nothing was recorded.
 */
export interface WritingLogSignal {
  skipped?: true;
  markerAppendFailed?: true;
  appendFailed?: true;
}

/** Plain text of raw revision content, or null when it is not a TipTap doc. */
function tiptapPlainTextOrNull(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { type?: unknown }).type === "doc"
    ) {
      return tiptapToPlainText(parsed as TipTapDocument);
    }
  } catch {
    // not JSON: legacy plain text
  }
  return null;
}

/**
 * The writing-log's own read of the canonical revision's current content
 * (deliberately not `snapshotBeforeDestructiveWrite`, which returns null for
 * both "unreadable" and "not destructive"). Null means unreadable; a locked
 * project rethrows.
 */
async function readPreviousContentForLog(
  projectRoot: string,
  resourceId: string,
  versionNumber: number,
): Promise<string | null> {
  try {
    return await readRevisionContent(projectRoot, resourceId, versionNumber);
  } catch (error) {
    if (isLockedAccessError(error)) throw error;
    return null;
  }
}

/**
 * Appends the writing-log entry for a canonical save; a save that adds and
 * deletes no words appends nothing and returns no signal. Never throws except for
 * a locked project; any other failure is returned as a signal.
 */
async function logCanonicalSave(
  projectRoot: string,
  previousRaw: string | null,
  newRaw: string,
): Promise<WritingLogSignal | undefined> {
  const before =
    previousRaw === null ? null : tiptapPlainTextOrNull(previousRaw);
  const after = tiptapPlainTextOrNull(newRaw);
  try {
    if (before !== null && after !== null) {
      const { added, deleted } = diffWords(before, after);
      if (added === 0 && deleted === 0) return undefined;
      await appendWritingLogEntry(projectRoot, { added, deleted });
      return undefined;
    }
  } catch (error) {
    if (isLockedAccessError(error)) throw error;
    console.error("Failed to append writing-log entry", error);
    return { appendFailed: true };
  }
  try {
    await appendWritingLogEntry(projectRoot, { skipped: true });
    return { skipped: true };
  } catch (error) {
    if (isLockedAccessError(error)) throw error;
    console.error("Failed to append writing-log marker entry", error);
    return { skipped: true, markerAppendFailed: true };
  }
}

/**
 * Updates the canonical revision's content in place, syncing derived
 * resource content files and bumping the resource sidecar's `updatedAt`.
 *
 * @throws {Error} `Revision ${revisionId} not found.` when no matching
 *   revision exists.
 * @throws {Error} `"Only the canonical revision can be updated in place."`
 *   when the target revision is not canonical.
 */
export async function updateRevisionInPlace(
  projectRoot: string,
  resourceId: string,
  revisionId: string,
  content: string,
): Promise<
  Revision & {
    updatedAt: string;
    snapshotCreated: boolean;
    writingLog?: WritingLogSignal;
  }
> {
  const revisions = await listRevisions(projectRoot, resourceId);
  const target = revisions.find((revision) => revision.id === revisionId);

  if (!target) {
    throw new Error(`Revision ${revisionId} not found.`);
  }

  if (!target.isCanonical) {
    throw new Error("Only the canonical revision can be updated in place.");
  }

  // Preserve what is about to be overwritten when the incoming content would
  // destroy most of it, so the writer has something to restore from.
  const snapshot = await snapshotBeforeDestructiveWrite(
    projectRoot,
    resourceId,
    target.versionNumber,
    content,
  );

  const previousRaw = await readPreviousContentForLog(
    projectRoot,
    resourceId,
    target.versionNumber,
  );

  await writeRevisionContent(
    projectRoot,
    resourceId,
    target.versionNumber,
    content,
  );

  // Logged only once the content is safely written; a logging failure is
  // signalled on the result and never fails or rolls back the save.
  const writingLog = await logCanonicalSave(projectRoot, previousRaw, content);

  // Keep the derived content files (read by compile/export/search) in sync
  // with the canonical revision so they cannot drift behind the editor.
  const wordCount = await syncDerivedResourceContent(
    projectRoot,
    resourceId,
    content,
  );

  const updatedAt = new Date().toISOString();
  const existingSidecar = await readSidecar(projectRoot, resourceId);
  await writeSidecar(projectRoot, resourceId, {
    ...(existingSidecar ?? {}),
    updatedAt,
    // Autosave is the only thing that ever writes a resource's content after
    // creation, so a sidecar whose wordCount is not refreshed here keeps its
    // creation-time value (0) forever — which list views read as "Needs
    // content" for a resource that has plenty. Left alone when nothing was
    // synced (a legacy plain-text revision), since there is then no saved
    // plain text to count and the stored value is the better answer.
    ...(wordCount === undefined ? {} : { wordCount }),
  });

  // Reported back to the caller so the editor can refresh its revision list
  // and tell the writer a way back exists — a backup nobody knows about is
  // only half a safety net.
  return {
    ...target,
    updatedAt,
    snapshotCreated: snapshot !== null,
    ...(writingLog ? { writingLog } : {}),
  };
}

/**
 * Marks the given revision as canonical (unmarking every other revision for
 * the resource).
 *
 * @throws {Error} `Revision ${revisionId} not found.` when no matching
 *   revision exists.
 */
export async function setCanonicalRevision(
  projectRoot: string,
  resourceId: string,
  revisionId: string,
): Promise<Revision> {
  const revisions = await listRevisions(projectRoot, resourceId);
  const target = revisions.find((revision) => revision.id === revisionId);

  if (!target) {
    throw new Error(`Revision ${revisionId} not found.`);
  }

  const canonicalRevision = await setCanonicalRevisionByVersion(
    projectRoot,
    resourceId,
    target.versionNumber,
  );

  if (!canonicalRevision) {
    throw new Error(`Revision ${revisionId} not found.`);
  }

  return canonicalRevision;
}

/**
 * Sets or clears the `preserve` protection flag on a revision by merging it
 * into the revision's existing `metadata` (`name` and every other key are left
 * untouched). Works on canonical and non-canonical revisions and never changes
 * `isCanonical`. Clearing removes the `preserve` key, so the revision reads as
 * unprotected under the truthy check used by prune.
 *
 * @throws {Error} `Revision ${revisionId} not found.` when no matching
 *   revision exists.
 */
export async function setRevisionPreserve(
  projectRoot: string,
  resourceId: string,
  revisionId: string,
  preserve: boolean,
): Promise<Revision> {
  const target = await findRevisionById(projectRoot, resourceId, revisionId);

  const metadata: Record<string, unknown> = { ...(target.metadata ?? {}) };
  if (preserve) {
    metadata.preserve = true;
  } else {
    delete metadata.preserve;
  }

  const updated: Revision = { ...target, metadata };
  const metaPath = path.join(
    revisionDir(projectRoot, resourceId, target.versionNumber),
    "metadata.json",
  );
  await writeFile(metaPath, JSON.stringify(updated, null, 2), "utf8");

  return updated;
}

/**
 * Stable, user-readable message thrown by {@link deleteRevision} when the
 * target revision is protected (`metadata.preserve`). Callers (e.g. the
 * revision route) match on this exact string.
 */
export const PROTECTED_REVISION_DELETE_MESSAGE =
  "Protected revisions cannot be deleted. Unprotect it first.";

/**
 * Deletes a non-canonical, unprotected revision.
 *
 * @throws {Error} `Revision ${revisionId} not found.` when no matching
 *   revision exists.
 * @throws {Error} `"Cannot delete the canonical revision; promote another
 *   revision first."` when the target revision is canonical.
 * @throws {Error} {@link PROTECTED_REVISION_DELETE_MESSAGE} when the target
 *   revision is protected (`metadata.preserve` is truthy). Checked after the
 *   not-found and canonical checks; nothing is removed from disk.
 */
export async function deleteRevision(
  projectRoot: string,
  resourceId: string,
  revisionId: string,
): Promise<Revision> {
  const revisions = await listRevisions(projectRoot, resourceId);
  const target = revisions.find((r) => r.id === revisionId);

  if (!target) {
    throw new Error(`Revision ${revisionId} not found.`);
  }

  if (target.isCanonical) {
    throw new Error(
      "Cannot delete the canonical revision; promote another revision first.",
    );
  }

  if (target.metadata?.preserve) {
    throw new Error(PROTECTED_REVISION_DELETE_MESSAGE);
  }

  const directory = revisionDir(projectRoot, resourceId, target.versionNumber);
  await rm(directory, { recursive: true, force: true });

  return target;
}
