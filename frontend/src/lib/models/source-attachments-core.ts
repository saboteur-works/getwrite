/**
 * @module source-attachments-core
 *
 * Transport-agnostic core for a Source's attachments (Feature 102, FR-23,
 * FR-24, FR-25, FR-31 (a2), FR-34). The files live inside the Source's own
 * `resources/<id>/` directory under server-generated names; the ordered list
 * lives in the sidecar `attachments` array (shape `AttachmentEntrySchema`).
 *
 * - The list is written only here, only through `mutateSidecar`, so the read
 *   happens inside the per-file lock and a concurrent sidecar field save is
 *   not lost. `updateSidecarCore` does not store the key.
 * - Input is validated (`validateAttachmentFile`, the magic-byte check) before
 *   any lock or write. A client file name is kept for display only and never
 *   becomes part of a path; the stored name is `attachment-<uuid>.<ext>` with
 *   an allowlisted extension.
 * - The 500-entry cap is checked on the value read inside the lock, before the
 *   file is written, so a refused add stores nothing.
 * - Only a Source is accepted. Revisions are never touched.
 * - All file access goes through `io.ts` (the storage adapter), never
 *   `node:fs`. Locked-access errors are not caught and propagate unchanged.
 * - Nothing here logs a stored value, file name or error text.
 *
 * Remove and replace (to Trash) are Task 24.
 */
import path from "node:path";
import { mkdir, rm, writeFile } from "./io";
import { mutateSidecar, readSidecar, SIDECAR_UNCHANGED } from "./sidecar";
import { AttachmentListSchema, UUID as UuidSchema } from "./schemas";
import type { AttachmentEntry } from "./schemas";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import {
  isPlainFileName,
  validateAttachmentFile,
  type AttachmentRejectionReason,
} from "./media-validation";
import { generateUUID } from "./uuid";
import type { MetadataValue } from "./types";

export { InvalidProjectIdCoreError };

/** At most this many attachments per Source (FR-24); there is no total-size cap. */
export const MAX_ATTACHMENTS_PER_SOURCE = 500;

/** The file was refused by attachment validation. Map to HTTP 400. */
export class AttachmentValidationError extends Error {
  readonly reason: AttachmentRejectionReason | "invalid-input";
  constructor(
    message: string,
    reason: AttachmentRejectionReason | "invalid-input",
  ) {
    super(message);
    this.name = "AttachmentValidationError";
    this.reason = reason;
  }
}

/** The Source already holds the maximum. Map to HTTP 400 (visible message). */
export class AttachmentLimitError extends Error {
  constructor() {
    super(
      `A Source can hold at most ${MAX_ATTACHMENTS_PER_SOURCE} attachments. Remove one to add another.`,
    );
    this.name = "AttachmentLimitError";
  }
}

/** The resource id is not a well-formed id. Map to HTTP 400. */
export class InvalidAttachmentResourceIdError extends Error {
  constructor() {
    super("A resource id must be a valid id.");
    this.name = "InvalidAttachmentResourceIdError";
  }
}

/** The resource is not a Source. Map to HTTP 400. */
export class AttachmentResourceTypeError extends Error {
  constructor() {
    super("Attachments can only be added to a Source.");
    this.name = "AttachmentResourceTypeError";
  }
}

/** The resource has no sidecar. Map to HTTP 404. */
export class AttachmentResourceNotFoundError extends Error {
  constructor() {
    super("The resource was not found.");
    this.name = "AttachmentResourceNotFoundError";
  }
}

/** A reorder did not name exactly the stored attachment ids. Map to HTTP 400. */
export class InvalidAttachmentOrderError extends Error {
  constructor() {
    super("The new order must list every attachment exactly once.");
    this.name = "InvalidAttachmentOrderError";
  }
}

/** Plain-argument input for {@link addAttachmentCore}. */
export interface AddAttachmentInput {
  /** Client file name: display and extension hint only, never a path. */
  fileName: string;
  /** Client-declared MIME type; the bytes are checked as well. */
  mimeType?: string;
  fileBytes: Uint8Array;
}

function requireProjectRoot(projectId: string): string {
  const root = resolveProjectRoot(projectId);
  if (!root) throw new InvalidProjectIdCoreError(projectId);
  return root;
}

function requireResourceId(resourceId: unknown): string {
  if (!UuidSchema.safeParse(resourceId).success) {
    throw new InvalidAttachmentResourceIdError();
  }
  return resourceId as string;
}

function requireSource(
  sidecar: Record<string, MetadataValue> | null,
): Record<string, MetadataValue> {
  if (sidecar === null) throw new AttachmentResourceNotFoundError();
  if (sidecar.type !== "source") throw new AttachmentResourceTypeError();
  return sidecar;
}

function storedAttachments(
  sidecar: Record<string, MetadataValue>,
): AttachmentEntry[] {
  const raw = sidecar.attachments;
  if (raw === undefined) return [];
  // A malformed stored list is an error, never an empty list.
  return AttachmentListSchema.parse(raw);
}

/** Display name: the last path segment of the client name, never used as a path. */
function displayName(fileName: string): string {
  const segments = fileName.split(/[/\\]/);
  return segments[segments.length - 1] ?? "";
}

/**
 * List a Source's attachments in stored order. An empty list means none; a
 * read that fails rejects.
 *
 * @throws InvalidProjectIdCoreError, InvalidAttachmentResourceIdError,
 *   AttachmentResourceNotFoundError, AttachmentResourceTypeError; read and
 *   locked-access errors unchanged.
 */
export async function listAttachmentsCore(
  projectId: string,
  resourceId: string,
): Promise<AttachmentEntry[]> {
  const id = requireResourceId(resourceId);
  const projectRoot = requireProjectRoot(projectId);
  return storedAttachments(requireSource(await readSidecar(projectRoot, id)));
}

/**
 * Add one attachment at the end of the list and store its bytes in
 * `resources/<id>/attachment-<uuid>.<ext>`. Returns the stored entry.
 *
 * @throws AttachmentValidationError, AttachmentLimitError, plus the errors of
 *   {@link listAttachmentsCore}; nothing is stored on any throw.
 */
export async function addAttachmentCore(
  projectId: string,
  resourceId: string,
  input: AddAttachmentInput,
): Promise<AttachmentEntry> {
  const id = requireResourceId(resourceId);
  if (
    !input ||
    typeof input.fileName !== "string" ||
    !(input.fileBytes instanceof Uint8Array)
  ) {
    throw new AttachmentValidationError(
      "An attachment needs a file name and file contents.",
      "invalid-input",
    );
  }
  const validation = validateAttachmentFile({
    mime: input.mimeType || undefined,
    ext: input.fileName,
    size: input.fileBytes.byteLength,
    bytes: input.fileBytes,
  });
  if (!validation.ok) {
    throw new AttachmentValidationError(validation.message, validation.reason);
  }
  const projectRoot = requireProjectRoot(projectId);

  const storedName = `attachment-${generateUUID()}.${validation.extension}`;
  if (!isPlainFileName(storedName)) {
    throw new AttachmentValidationError(
      "The file could not be stored.",
      "invalid-input",
    );
  }
  const dir = path.join(projectRoot, "resources", id);
  const entry: AttachmentEntry = {
    id: generateUUID(),
    fileName: storedName,
    originalName: displayName(input.fileName),
    mime: validation.mime,
    size: input.fileBytes.byteLength,
    addedAt: new Date().toISOString(),
  };

  let isFileWritten = false;
  try {
    await mutateSidecar(projectRoot, id, async (current) => {
      const sidecar = requireSource(current);
      const list = storedAttachments(sidecar);
      if (list.length >= MAX_ATTACHMENTS_PER_SOURCE) {
        throw new AttachmentLimitError();
      }
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, storedName), Buffer.from(input.fileBytes));
      isFileWritten = true;
      return {
        ...sidecar,
        attachments: [...list, entry] as unknown as MetadataValue,
      };
    });
  } catch (err) {
    if (isFileWritten) {
      // The list was not stored: do not leave an unlisted file behind. A
      // failed cleanup must not replace the error that caused it.
      await rm(path.join(dir, storedName), { force: true }).catch(() => {});
    }
    throw err;
  }
  return entry;
}

/**
 * Reorder the list. `orderedIds` must contain every stored attachment id
 * exactly once. Only the sidecar list changes; no file is touched. Returns
 * the list in its new order.
 *
 * @throws InvalidAttachmentOrderError, plus the errors of
 *   {@link listAttachmentsCore}.
 */
export async function reorderAttachmentsCore(
  projectId: string,
  resourceId: string,
  orderedIds: string[],
): Promise<AttachmentEntry[]> {
  const id = requireResourceId(resourceId);
  if (
    !Array.isArray(orderedIds) ||
    !orderedIds.every((v) => UuidSchema.safeParse(v).success)
  ) {
    throw new InvalidAttachmentOrderError();
  }
  const projectRoot = requireProjectRoot(projectId);
  let result: AttachmentEntry[] = [];
  await mutateSidecar(projectRoot, id, (current) => {
    const sidecar = requireSource(current);
    const list = storedAttachments(sidecar);
    const byId = new Map(list.map((e) => [e.id, e]));
    const isPermutation =
      orderedIds.length === list.length &&
      new Set(orderedIds).size === list.length &&
      orderedIds.every((v) => byId.has(v));
    if (!isPermutation) throw new InvalidAttachmentOrderError();
    result = orderedIds.map((v) => byId.get(v) as AttachmentEntry);
    if (result.every((e, i) => e.id === list[i]?.id)) return SIDECAR_UNCHANGED;
    return { ...sidecar, attachments: result as unknown as MetadataValue };
  });
  return result;
}
