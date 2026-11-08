/**
 * @module source-attachment-bytes-core
 *
 * Transport-agnostic core that returns one Source attachment's bytes
 * (Feature 103, FR-18 storage half, FR-12, FR-30). Read-only: it writes
 * nothing, takes no lock and deletes nothing.
 *
 * - The attachment is addressed by resource id and attachment id only. Both
 *   must be well-formed UUIDs, so a path-like id is refused before any read.
 *   The file path is built from the project root, the resource id and the
 *   stored name found in the Source's own sidecar list, never from the client;
 *   a stored name that is not a bare file name is refused.
 * - The kind (`image` or `audio`) comes from the stored entry and a check of
 *   the file's leading bytes (`validateAttachmentFile`, the check used on
 *   add), never from the original name, which is display text. A file whose
 *   bytes do not match its stored entry is refused, not reported.
 * - All file access goes through `io.ts` (the storage adapter), so an
 *   encrypted project is opened by the adapter and a locked one raises the
 *   locked-access error, which is not caught here. Only a missing file
 *   (`ENOENT`) becomes {@link AttachmentBytesMissingError}; it is never
 *   returned as an empty file.
 * - Nothing here logs a stored value, file name or error text.
 */
import path from "node:path";
import { readFileBuffer } from "./io";
import { readSidecar } from "./sidecar";
import { AttachmentListSchema, UUID as UuidSchema } from "./schemas";
import type { AttachmentEntry } from "./schemas";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { isPlainFileName, validateAttachmentFile } from "./media-validation";
import {
  AttachmentNotFoundError,
  AttachmentResourceNotFoundError,
  AttachmentResourceTypeError,
  InvalidAttachmentResourceIdError,
} from "./source-attachments-core";

export { InvalidProjectIdCoreError };

/** The attachment id is not a well-formed id. Map to HTTP 400. */
export class InvalidAttachmentIdError extends Error {
  constructor() {
    super("An attachment id must be a valid id.");
    this.name = "InvalidAttachmentIdError";
  }
}

/** The attachment is listed but its file is missing. Map to HTTP 404. */
export class AttachmentBytesMissingError extends Error {
  constructor() {
    super("The attachment's file is missing.");
    this.name = "AttachmentBytesMissingError";
  }
}

/**
 * The stored file does not match its stored entry (bytes, type or name). The
 * bytes are not returned. Map to HTTP 422, not 409 (which clients read as a
 * locked project).
 */
export class AttachmentStoredContentError extends Error {
  constructor() {
    super("The attachment's stored file does not match its entry.");
    this.name = "AttachmentStoredContentError";
  }
}

/** One attachment's bytes and what the stored entry and the bytes say it is. */
export interface AttachmentBytes {
  kind: "image" | "audio";
  mime: string;
  size: number;
  bytes: Uint8Array;
}

function requireIds(
  resourceId: unknown,
  attachmentId: unknown,
): { resourceId: string; attachmentId: string } {
  if (!UuidSchema.safeParse(resourceId).success) {
    throw new InvalidAttachmentResourceIdError();
  }
  if (!UuidSchema.safeParse(attachmentId).success) {
    throw new InvalidAttachmentIdError();
  }
  return {
    resourceId: resourceId as string,
    attachmentId: attachmentId as string,
  };
}

async function findEntry(
  projectRoot: string,
  resourceId: string,
  attachmentId: string,
): Promise<AttachmentEntry> {
  const sidecar = await readSidecar(projectRoot, resourceId);
  if (sidecar === null) throw new AttachmentResourceNotFoundError();
  if (sidecar.type !== "source") throw new AttachmentResourceTypeError();
  // A malformed stored list is an error, never an empty list.
  const list =
    sidecar.attachments === undefined
      ? []
      : AttachmentListSchema.parse(sidecar.attachments);
  const entry = list.find((candidate) => candidate.id === attachmentId);
  if (!entry) throw new AttachmentNotFoundError();
  return entry;
}

async function readStoredFile(filePath: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFileBuffer(filePath));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AttachmentBytesMissingError();
    }
    throw err;
  }
}

/**
 * Read one attachment's bytes by resource id and attachment id.
 *
 * @param projectId - Validated here; resolved to the project root by the core.
 * @param resourceId - The Source's id.
 * @param attachmentId - The attachment's id in the Source's list.
 * @throws InvalidProjectIdCoreError, InvalidAttachmentResourceIdError,
 *   InvalidAttachmentIdError, AttachmentResourceNotFoundError,
 *   AttachmentResourceTypeError, AttachmentNotFoundError,
 *   AttachmentBytesMissingError, AttachmentStoredContentError; locked-access
 *   and other read errors unchanged.
 */
export async function readAttachmentBytesCore(
  projectId: string,
  resourceId: string,
  attachmentId: string,
): Promise<AttachmentBytes> {
  const ids = requireIds(resourceId, attachmentId);
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);

  const entry = await findEntry(projectRoot, ids.resourceId, ids.attachmentId);
  if (!isPlainFileName(entry.fileName)) {
    throw new AttachmentStoredContentError();
  }
  const bytes = await readStoredFile(
    path.join(projectRoot, "resources", ids.resourceId, entry.fileName),
  );
  const checked = validateAttachmentFile({
    mime: entry.mime,
    ext: entry.fileName,
    size: bytes.byteLength,
    bytes,
  });
  if (!checked.ok || checked.mime !== entry.mime) {
    throw new AttachmentStoredContentError();
  }
  return {
    kind: checked.type,
    mime: checked.mime,
    size: bytes.byteLength,
    bytes,
  };
}
