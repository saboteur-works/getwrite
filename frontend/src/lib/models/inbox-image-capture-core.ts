/**
 * @module inbox-image-capture-core
 *
 * The image capture core (Feature 107, FR-7, FR-9, FR-10, FR-17): creates one
 * image resource in the project's Inbox from bytes already in hand. No HTTP,
 * no React; the native backend calls it in-process.
 *
 * Steps, in order:
 *   1. Validate the project id and derive the root from the storage context.
 *   2. Refuse before any write: empty input, a non-image type, or more than
 *      31,457,280 bytes (the bytes in hand and any reported size are both
 *      checked). No Inbox is created for a refusal.
 *   3. Resolve the Inbox (`resolveInboxFolder`, unchanged); a needs-choice
 *      result is returned with nothing written.
 *   4. Create the image through `uploadMediaResourceCore` (the media funnel;
 *      it removes a resource directory its own failed write created).
 *   5. Write `capturedAt` to the sidecar (server-side clock).
 *   6. Seed the compile exclusion; a notice or a throw keeps the item and
 *      comes back as a `seeding` notice.
 *
 * No writing-log entry is written: an image has no words (FR-10). A
 * locked-access error propagates unchanged from every step. `projectId` is
 * the on-disk directory id, not the id inside `project.json`.
 */
import {
  uploadMediaResourceCore,
  type UploadMediaResourceInput,
} from "./resource-crud-core";
import { resolveInboxFolder, INBOX_FOLDER_NAME } from "./inbox-folder-core";
import {
  seedCompileExclusion,
  type CompileExclusionMessages,
  SAVED_DEFAULTS_MAX_IDS,
} from "./saved-defaults-core";
import { validateMediaFile } from "./media-validation";
import {
  decideShareImageSize,
  sanitizeShareFileName,
  SHARE_IMAGE_MAX_BYTES,
} from "./share-item-core";
import { mutateSidecar } from "./sidecar";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { isLockedAccessError } from "./locked-access";
import type { MetadataValue } from "./types";
import type {
  CaptureNotice,
  InboxTrashChoice,
  CaptureNeedsChoice,
} from "../api/inbox-capture-types";

/** Shown when seeding the compile exclusion threw; the item is kept. */
export const IMAGE_CAPTURE_SEEDING_FAILED_MESSAGE =
  "The image was captured, but it could not be left out of compile by default because saving the compile default failed. Leave the image out in the Compile dialog.";

const IMAGE_NOT_EXCLUDED_MESSAGES: CompileExclusionMessages = {
  atCap: `The image was captured, but it is not left out of compile by default: the saved compile default is full (${SAVED_DEFAULTS_MAX_IDS} resources). Clear or shorten the saved default, or leave the image out in the Compile dialog.`,
  unreadable:
    "The image was captured, but it is not left out of compile by default: the saved compile default could not be read, so it was left unchanged. Leave the image out in the Compile dialog.",
};

/** What an image capture call sends. */
export interface ImageCaptureRequest {
  /** The on-disk project directory id. */
  projectId: string;
  /** The image bytes, already read. */
  bytes: Uint8Array;
  /** The shared file name; sanitised here before any use as a path. */
  name: string;
  mimeType?: string;
  /** The size the provider reported, if any; checked alongside the bytes. */
  size?: number;
  /** Present only on the second call after a needs-choice result. */
  inboxChoice?: InboxTrashChoice;
}

/** Why an image was refused before any write. */
type ImageCaptureRefusalReason = "too-large" | "unsupported-type" | "empty";

/** The item was written. */
interface ImageCaptureCreated {
  status: "created";
  resourceId: string;
  inboxFolderId: string;
  notices: CaptureNotice[];
}

/** The image was refused; nothing was written. */
interface ImageCaptureRefused {
  status: "refused";
  reason: ImageCaptureRefusalReason;
  message: string;
}

/** The outcomes of an image capture call that does not throw. */
export type ImageCaptureResult =
  | ImageCaptureCreated
  | CaptureNeedsChoice
  | ImageCaptureRefused;

/** Test seam: the clock `capturedAt` is taken from. */
export interface ImageCaptureCoreOptions {
  now?: () => Date;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Checks everything that can be refused without touching storage. */
function refusalFor(
  request: ImageCaptureRequest,
  fileName: string,
): ImageCaptureRefused | null {
  const byteLength = request.bytes.byteLength;
  if (byteLength === 0) {
    return {
      status: "refused",
      reason: "empty",
      message: "The image has no content, so nothing was captured.",
    };
  }
  const validation = validateMediaFile({
    mime: request.mimeType || undefined,
    ext: fileName,
    size: Math.min(byteLength, SHARE_IMAGE_MAX_BYTES),
  });
  if (!validation.ok || validation.type !== "image") {
    return {
      status: "refused",
      reason: "unsupported-type",
      message: validation.ok
        ? "Only images can be captured, so nothing was captured."
        : validation.message,
    };
  }
  const largest = Math.max(byteLength, request.size ?? 0);
  const decision = decideShareImageSize(largest);
  if (decision.outcome === "refuse") {
    return {
      status: "refused",
      reason: "too-large",
      message: decision.message,
    };
  }
  return null;
}

async function seedExclusion(
  projectRoot: string,
  resourceId: string,
): Promise<CaptureNotice | null> {
  try {
    const { notice } = await seedCompileExclusion(
      projectRoot,
      resourceId,
      IMAGE_NOT_EXCLUDED_MESSAGES,
    );
    return notice === undefined
      ? null
      : { code: "seeding", severity: "info", message: notice };
  } catch (err: unknown) {
    if (isLockedAccessError(err)) throw err;
    return {
      code: "seeding",
      severity: "error",
      message: `${IMAGE_CAPTURE_SEEDING_FAILED_MESSAGE} (${errorText(err)})`,
    };
  }
}

function inboxNotices(inbox: {
  relocated: boolean;
  renamed: boolean;
}): CaptureNotice[] {
  const notices: CaptureNotice[] = [];
  if (inbox.relocated) {
    notices.push({
      code: "inbox-relocated",
      severity: "info",
      message: `${INBOX_FOLDER_NAME} was restored to the top level because its parent folder is gone.`,
    });
  }
  if (inbox.renamed) {
    notices.push({
      code: "inbox-renamed",
      severity: "info",
      message: `${INBOX_FOLDER_NAME} was restored under a new name because that name was taken.`,
    });
  }
  return notices;
}

/**
 * Captures one image into the project's Inbox.
 *
 * @param input - Directory project id, bytes, name, MIME type, reported size
 *   and, on the second call after a needs-choice result, the Trash choice.
 * @param options - Injected clock for tests.
 * @returns `created` (with notices), `refused` (nothing written) or
 *   `needs-choice` (nothing written).
 * @throws InvalidProjectIdCoreError for a malformed project id;
 *   locked-access errors unchanged; an Error when the image or its capture
 *   time could not be written (an Inbox this call created is left in place).
 */
export async function captureImageToInboxCore(
  input: ImageCaptureRequest,
  options: ImageCaptureCoreOptions = {},
): Promise<ImageCaptureResult> {
  const projectRoot = resolveProjectRoot(input.projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(input.projectId);

  const fileName = sanitizeShareFileName(input.name);
  const refusal = refusalFor(input, fileName);
  if (refusal !== null) return refusal;

  const capturedAt = (options.now ?? (() => new Date()))().toISOString();

  const inbox = await resolveInboxFolder(projectRoot, input.inboxChoice);
  if (inbox.status === "needs-choice") return inbox;
  const notices = inboxNotices(inbox);

  const upload: UploadMediaResourceInput = {
    fileBytes: input.bytes,
    fileName,
    mimeType: input.mimeType,
    fileSize: input.bytes.byteLength,
    folderId: inbox.inboxFolderId,
  };
  let resourceId: string;
  try {
    resourceId = (await uploadMediaResourceCore(input.projectId, upload)).id;
  } catch (err: unknown) {
    if (isLockedAccessError(err)) throw err;
    throw new Error(`The image could not be captured: ${errorText(err)}`, {
      cause: err,
    });
  }

  try {
    await mutateSidecar(projectRoot, resourceId, (current) => {
      const next: Record<string, MetadataValue> = {
        ...(current ?? {}),
        capturedAt,
      };
      return next;
    });
  } catch (err: unknown) {
    if (isLockedAccessError(err)) throw err;
    throw new Error(
      `The image was created in the ${INBOX_FOLDER_NAME} but its capture time could not be saved: ${errorText(err)}`,
      { cause: err },
    );
  }

  const seeding = await seedExclusion(projectRoot, resourceId);
  if (seeding !== null) notices.push(seeding);

  return {
    status: "created",
    resourceId,
    inboxFolderId: inbox.inboxFolderId,
    notices,
  };
}
