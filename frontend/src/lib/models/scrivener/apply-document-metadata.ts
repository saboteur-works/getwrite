/**
 * @module apply-document-metadata
 *
 * Carries a Scrivener document's synopsis/notes content into its created
 * resource's sidecar `userMetadata.synopsis` / `userMetadata.notes` fields,
 * and reports which per-project feature toggles (`synopsis` / `notes`) an
 * import as a whole must enable so those fields are visible (FR-5).
 *
 * Two separate concerns, deliberately kept apart:
 *
 * - {@link applyDocumentMetadata} — per-document, does I/O (reads then
 *   writes the resource's sidecar).
 * - {@link resolveFeatureTogglesToEnable} — pure, no I/O, aggregates across
 *   every document in the import so the orchestrator (Task 8) can call
 *   `updateFeatureConfig` exactly once at the end of the run rather than
 *   once per document.
 *
 * ## Sidecar merge ordering (coordination with Task 8)
 *
 * `writeSidecar` (`sidecar.ts:131`) overwrites a resource's sidecar file
 * wholesale — it has no partial-update mode. Task 8's orchestrator also
 * needs to write other `userMetadata` keys onto the same sidecar (status,
 * label, and custom fields per Task 5's plan), so two independent writers
 * cannot both call `writeSidecar` for the same resource without one
 * clobbering the other.
 *
 * `applyDocumentMetadata` resolves this by doing its own read-modify-write:
 * it calls `readSidecar` first, merges only the `userMetadata.synopsis` /
 * `userMetadata.notes` keys into whatever `userMetadata` (and other
 * top-level sidecar keys) already exists, and writes the merged result back.
 * This makes it safe to call **either before or after** Task 8's other
 * metadata writes for the same resource, as long as calls for the same
 * resource are sequenced (not run concurrently) — each call folds into
 * whatever the previous call left on disk. Task 8 should NOT run this
 * concurrently with another sidecar writer for the same resource, since
 * concurrent read-modify-writes can race and drop one side's update; the
 * orchestrator should await each resource's metadata writes in sequence
 * (or otherwise serialize them, e.g. one `withMetaLock`-style critical
 * section per resource) before moving to the next resource.
 */
import { readSidecar, writeSidecar } from "../sidecar";
import { convertRtfToTiptap } from "./rtf-to-tiptap";
import type { UUID, MetadataValue } from "../types";

/**
 * Minimal per-document input `applyDocumentMetadata` needs. Task 8 assembles
 * this from a binder item plus its `Files/Data/<uuid>/` directory:
 * `synopsis.txt`'s raw text (if the file exists) and `notes.rtf`'s raw bytes
 * or already-decoded text (if that file exists). Either or both may be
 * absent — a document need not have a synopsis or notes file at all.
 */
export interface ScrivenerDocumentMetadataInput {
  /** Raw contents of `synopsis.txt`, if present. Plain text already; no
   * conversion needed. */
  synopsis?: string;
  /** Raw contents of `notes.rtf`, if present — either the undecoded file
   * bytes or a string already decoded by the caller. RTF is converted to
   * plain text via {@link convertRtfToTiptap} (Task 3's converter); only its
   * `plainText` output is used here, since a sidecar metadata field is
   * plain text, not a TipTap document. */
  notesRtf?: Buffer | Uint8Array | string;
}

/**
 * Describes, for a single document, whether it supplied a non-empty
 * synopsis and/or notes value after conversion — the shape
 * {@link resolveFeatureTogglesToEnable} aggregates across an entire import.
 */
export interface DocumentMetadataFlags {
  hasSynopsis: boolean;
  hasNotes: boolean;
}

/** Result of applying one document's metadata to its sidecar. */
export interface ApplyDocumentMetadataResult extends DocumentMetadataFlags {
  /** The resource's sidecar as persisted after the merge. */
  sidecar: Record<string, MetadataValue>;
}

function isPlainObjectMetadata(
  value: MetadataValue | undefined,
): value is Record<string, MetadataValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the resource's existing sidecar (if any), merges in
 * `userMetadata.synopsis` / `userMetadata.notes` derived from `doc`, and
 * writes the merged sidecar back via `writeSidecar`. Every other existing
 * sidecar key — including other `userMetadata` fields — is preserved as-is.
 *
 * A document with neither `synopsis` nor `notesRtf` still performs the
 * read-modify-write (so the sidecar is created if it did not already exist,
 * matching how a resource always gets a sidecar on creation) but adds no
 * `synopsis`/`notes` keys.
 */
export async function applyDocumentMetadata(
  projectRoot: string,
  resourceId: UUID,
  doc: ScrivenerDocumentMetadataInput,
): Promise<ApplyDocumentMetadataResult> {
  const existing = await readSidecar(projectRoot, resourceId);
  const base: Record<string, MetadataValue> = existing ?? {};
  const existingUserMetadata = isPlainObjectMetadata(base.userMetadata)
    ? base.userMetadata
    : {};

  const nextUserMetadata: Record<string, MetadataValue> = {
    ...existingUserMetadata,
  };

  const synopsis = doc.synopsis?.trim();
  const hasSynopsis = Boolean(synopsis && synopsis.length > 0);
  if (hasSynopsis) {
    nextUserMetadata.synopsis = doc.synopsis as string;
  }

  let notesPlainText: string | undefined;
  if (doc.notesRtf !== undefined) {
    notesPlainText = convertRtfToTiptap(doc.notesRtf).plainText;
  }
  const hasNotes = Boolean(notesPlainText && notesPlainText.trim().length > 0);
  if (hasNotes && notesPlainText !== undefined) {
    nextUserMetadata.notes = notesPlainText;
  }

  const nextSidecar: Record<string, MetadataValue> = {
    ...base,
    userMetadata: nextUserMetadata,
  };

  await writeSidecar(projectRoot, resourceId, nextSidecar);

  return { sidecar: nextSidecar, hasSynopsis, hasNotes };
}

/** The feature toggles to enable, or an empty object when nothing qualifies. */
export interface FeatureTogglesToEnable {
  synopsis?: true;
  notes?: true;
}

/**
 * Pure aggregation, no I/O: given the per-document synopsis/notes flags
 * across an entire import (e.g. the `hasSynopsis`/`hasNotes` fields
 * returned by each {@link applyDocumentMetadata} call), reports which
 * per-project feature toggles must be enabled so those fields are visible —
 * `{ synopsis: true }` when ANY document carried a synopsis, `{ notes: true }`
 * when ANY document carried notes, both, or neither.
 *
 * Intended to be called once, after processing every document, so the
 * orchestrator applies the result via a single `updateFeatureConfig` call
 * rather than one per document.
 */
export function resolveFeatureTogglesToEnable(
  documentFlags: Iterable<DocumentMetadataFlags>,
): FeatureTogglesToEnable {
  let anySynopsis = false;
  let anyNotes = false;

  for (const flags of documentFlags) {
    if (flags.hasSynopsis) anySynopsis = true;
    if (flags.hasNotes) anyNotes = true;
    if (anySynopsis && anyNotes) break;
  }

  const result: FeatureTogglesToEnable = {};
  if (anySynopsis) result.synopsis = true;
  if (anyNotes) result.notes = true;
  return result;
}

export default { applyDocumentMetadata, resolveFeatureTogglesToEnable };
