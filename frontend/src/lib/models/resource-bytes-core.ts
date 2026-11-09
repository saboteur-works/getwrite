/**
 * @module resource-bytes-core
 *
 * Transport-agnostic core that returns an image or audio resource's own file
 * bytes (Feature 105, FR-2, FR-3, FR-4, FR-17). Read-only: it writes nothing,
 * takes no lock and deletes nothing. Modelled on `source-attachment-bytes-core`
 * and the file route `app/api/resource/[resource-id]/file/route.ts`.
 *
 * - The resource is addressed by project id and resource id only; both are
 *   validated before any read. The file path is built from the project root,
 *   the resource id and the sidecar's `file` entry, which must be a bare file
 *   name (`isPlainFileName`); nothing comes from the client.
 * - Only resources of type `image` or `audio` are read; `text`, `source` and
 *   `folder` are refused.
 * - The size comes from `stat` through the storage adapter before any read.
 *   A file over {@link ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES} is refused and
 *   never read; a size that is not a finite non-negative number is a failure,
 *   never 0. The sidecar's `sizeBytes` is not used for this gate.
 * - The MIME comes from the file extension, as the file route does; the
 *   leading bytes are not checked. The kind comes from the sidecar type.
 * - All file access goes through `io.ts`, so an encrypted project is opened by
 *   the adapter and a locked one raises the locked-access error, which is not
 *   caught here. Only `ENOENT` becomes {@link ResourceBytesMissingError}; it
 *   is never returned as empty bytes.
 * - Nothing here logs a stored value, file name or error text.
 */
import path from "node:path";
import { readFileBuffer, stat } from "./io";
import { readSidecar } from "./sidecar";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-crud-core";
import { isResourceId } from "./resource-id";
import {
  ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES,
  AUDIO_EXTENSION_MIME,
  IMAGE_EXTENSION_MIME,
  isPlainFileName,
  mediaTooLargeToShowMessage,
} from "./media-validation";

export { InvalidProjectIdCoreError };

/** The resource id is not a well-formed id. Map to HTTP 400. */
export class InvalidResourceBytesIdError extends Error {
  constructor() {
    super("Invalid resource id");
    this.name = "InvalidResourceBytesIdError";
  }
}

/** No resource with this id has a sidecar. Map to HTTP 404. */
export class ResourceBytesNotFoundError extends Error {
  constructor() {
    super("The resource was not found.");
    this.name = "ResourceBytesNotFoundError";
  }
}

/** The resource is not an image or audio resource. Map to HTTP 400. */
export class ResourceBytesTypeError extends Error {
  constructor() {
    super("Only an image or audio resource has a file to read.");
    this.name = "ResourceBytesTypeError";
  }
}

/** The resource's file is missing (no stored name, or `ENOENT`). Map to HTTP 404. */
export class ResourceBytesMissingError extends Error {
  constructor() {
    super("The resource's file is missing.");
    this.name = "ResourceBytesMissingError";
  }
}

/**
 * The file's size or stored name could not be trusted, so nothing was read.
 * Distinct from "missing" and from "too large". Map to HTTP 500.
 */
export class ResourceBytesFailedError extends Error {
  constructor() {
    super("The resource's file could not be read.");
    this.name = "ResourceBytesFailedError";
  }
}

/** The file is over the read threshold and was not read. Map to HTTP 413. */
export class ResourceBytesTooLargeError extends Error {
  readonly sizeBytes: number;
  constructor(sizeBytes: number) {
    super(mediaTooLargeToShowMessage(sizeBytes));
    this.name = "ResourceBytesTooLargeError";
    this.sizeBytes = sizeBytes;
  }
}

/** One media resource's bytes, MIME and kind. */
export interface ResourceBytes {
  kind: "image" | "audio";
  mime: string;
  size: number;
  bytes: Uint8Array;
}

function mimeForFile(fileName: string): string {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return (
    IMAGE_EXTENSION_MIME[ext] ??
    AUDIO_EXTENSION_MIME[ext] ??
    "application/octet-stream"
  );
}

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

async function statSizeBeforeRead(filePath: string): Promise<number> {
  let size: unknown;
  try {
    size = (await stat(filePath)).size;
  } catch (err: unknown) {
    if (isMissing(err)) throw new ResourceBytesMissingError();
    throw err;
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    throw new ResourceBytesFailedError();
  }
  return size;
}

async function readStoredFile(filePath: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFileBuffer(filePath));
  } catch (err: unknown) {
    if (isMissing(err)) throw new ResourceBytesMissingError();
    throw err;
  }
}

/**
 * Read an image or audio resource's own file by project id and resource id.
 *
 * @param projectId - Validated here; resolved to the project root by the core.
 * @param resourceId - The resource's id.
 * @throws InvalidProjectIdCoreError, InvalidResourceBytesIdError,
 *   ResourceBytesNotFoundError, ResourceBytesTypeError,
 *   ResourceBytesMissingError, ResourceBytesFailedError,
 *   ResourceBytesTooLargeError; locked-access and other read errors unchanged.
 */
export async function readResourceBytesCore(
  projectId: string,
  resourceId: string,
): Promise<ResourceBytes> {
  if (!isResourceId(resourceId)) throw new InvalidResourceBytesIdError();
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);

  const sidecar = await readSidecar(projectRoot, resourceId);
  if (sidecar === null) throw new ResourceBytesNotFoundError();
  const type = sidecar.type;
  if (type !== "image" && type !== "audio") throw new ResourceBytesTypeError();
  const fileName = sidecar.file;
  if (typeof fileName !== "string" || fileName.length === 0) {
    throw new ResourceBytesMissingError();
  }
  if (!isPlainFileName(fileName)) throw new ResourceBytesFailedError();

  const filePath = path.join(projectRoot, "resources", resourceId, fileName);
  const size = await statSizeBeforeRead(filePath);
  if (size > ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES) {
    throw new ResourceBytesTooLargeError(size);
  }
  const bytes = await readStoredFile(filePath);
  return {
    kind: type,
    mime: mimeForFile(fileName),
    size: bytes.byteLength,
    bytes,
  };
}
