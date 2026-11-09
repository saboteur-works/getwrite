/**
 * @module inbox-capture-core
 *
 * The capture core (Feature 106, FR-2, FR-5, FR-6, FR-9, FR-22): creates one
 * text item in the project's Inbox with its whole body in one call. No HTTP,
 * no React; the route and native backend call it, so a second capture
 * surface (Feature 107) can reuse it.
 *
 * Steps, in order:
 *   1. Validate the project id and derive the root from the storage context.
 *   2. Validate the text and link; a refusal returns before any write, so no
 *      Inbox is created for it.
 *   3. Resolve the Inbox (`resolveInboxFolder`); a needs-choice result is
 *      returned unchanged with nothing written.
 *   4. Create the text resource through `createResourceCore` (shared
 *      creation code is not changed).
 *   5. Write `capturedAt` and `capturedLink` to the sidecar (server-side
 *      clock; the client never supplies them).
 *   6. Seed the compile exclusion. Unlike a Source, a failure here keeps the
 *      item: a cap or unusable-shape notice and a thrown error both come back
 *      as a `seeding` notice.
 *   7. Append the writing-log entry (FR-8): typed words as additions tagged
 *      with the item's id; shared text as an import entry (a `source`, no
 *      document id). A failure keeps the item and returns a `writing-log`
 *      notice.
 *
 * A locked-access error propagates unchanged from every step.
 */
import { createResourceCore } from "./resource-crud-core";
import { resolveInboxFolder, INBOX_FOLDER_NAME } from "./inbox-folder-core";
import {
  prepareCapture,
  CAPTURE_TEXT_MAX_LENGTH,
  CAPTURE_LINK_MAX_LENGTH,
  type PreparedCapture,
} from "./inbox-capture-text";
import {
  seedCompileExclusion,
  CAPTURE_NOT_EXCLUDED_MESSAGES,
} from "./saved-defaults-core";
import { mutateSidecar } from "./sidecar";
import { appendWritingLogEntry } from "./writing-log";
import { countWords } from "../word-count";
import { resolveProjectRoot } from "./project-root-resolver";
import { InvalidProjectIdCoreError } from "./project-id-core-error";
import { isLockedAccessError } from "./locked-access";
import type { MetadataValue } from "./types";
import type {
  CaptureNotice,
  CaptureNoticeCode,
  CaptureRequest,
  CaptureResult,
} from "../api/inbox-capture-types";

export { InvalidProjectIdCoreError };

/** Shown when seeding the compile exclusion threw; the item is kept. */
export const CAPTURE_SEEDING_FAILED_MESSAGE =
  "The note was captured, but it could not be left out of compile by default because saving the compile default failed. Leave the note out in the Compile dialog.";

/** Shown when the writing-log entry could not be written; the item is kept. */
export const CAPTURE_WRITING_LOG_FAILED_MESSAGE =
  "The note was captured, but today's writing log was not updated, so its words are missing from the log.";

/** Test seam: the clock `capturedAt` is taken from. */
export interface CaptureCoreOptions {
  now?: () => Date;
}

function refusalCode(input: CaptureRequest): CaptureNoticeCode {
  if (
    typeof input.text === "string" &&
    input.text.length > CAPTURE_TEXT_MAX_LENGTH
  ) {
    return "text-too-long";
  }
  if (input.link !== undefined) {
    if (
      typeof input.link !== "string" ||
      input.link.trim().length > CAPTURE_LINK_MAX_LENGTH
    ) {
      return "link-invalid";
    }
  }
  return "empty";
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function seedExclusion(
  projectRoot: string,
  resourceId: string,
): Promise<CaptureNotice | null> {
  try {
    const { notice } = await seedCompileExclusion(
      projectRoot,
      resourceId,
      CAPTURE_NOT_EXCLUDED_MESSAGES,
    );
    return notice === undefined
      ? null
      : { code: "seeding", severity: "info", message: notice };
  } catch (err: unknown) {
    if (isLockedAccessError(err)) throw err;
    return {
      code: "seeding",
      severity: "error",
      message: `${CAPTURE_SEEDING_FAILED_MESSAGE} (${errorText(err)})`,
    };
  }
}

/**
 * Records the captured words. Typed text is an additions entry tagged with
 * the item's id (so the read-time Inbox exclusion applies); shared text is an
 * import entry, which carries a `source` and no document id and is never
 * compared with the daily goal. Pasted and typed text are logged the same.
 */
async function logCapturedWords(
  projectRoot: string,
  resourceId: string,
  origin: CaptureRequest["origin"],
  capture: PreparedCapture,
): Promise<CaptureNotice | null> {
  const added = countWords(capture.plainText);
  if (added === 0) return null;
  try {
    await appendWritingLogEntry(
      projectRoot,
      origin === "shared"
        ? { added, deleted: 0, source: "plaintext" }
        : { added, deleted: 0, documentId: resourceId },
      capture.capturedAt,
    );
    return null;
  } catch (err: unknown) {
    if (isLockedAccessError(err)) throw err;
    return {
      code: "writing-log",
      severity: "error",
      message: `${CAPTURE_WRITING_LOG_FAILED_MESSAGE} (${errorText(err)})`,
    };
  }
}

async function writeCaptureKeys(
  projectRoot: string,
  resourceId: string,
  prepared: PreparedCapture,
): Promise<void> {
  await mutateSidecar(projectRoot, resourceId, (current) => {
    const next: Record<string, MetadataValue> = {
      ...(current ?? {}),
      capturedAt: prepared.capturedAt,
    };
    if (prepared.capturedLink !== undefined) {
      next["capturedLink"] = prepared.capturedLink;
    }
    return next;
  });
}

/**
 * Captures text (and an optional link) into the project's Inbox.
 *
 * @param input - Project id, text, optional link, origin and, on the second
 *   call after a needs-choice result, the writer's Trash choice.
 * @param options - Injected clock for tests.
 * @returns `created` (with notices), `refused` (nothing written) or
 *   `needs-choice` (nothing written).
 * @throws InvalidProjectIdCoreError for a malformed project id; locked-access
 *   errors unchanged; an Error when the item or its capture keys could not be
 *   written (the Inbox, if this call created it, is left in place).
 */
export async function captureToInboxCore(
  input: CaptureRequest,
  options: CaptureCoreOptions = {},
): Promise<CaptureResult> {
  const projectRoot = resolveProjectRoot(input.projectId);
  if (!projectRoot) throw new InvalidProjectIdCoreError(input.projectId);

  const prepared = prepareCapture(
    { text: input.text, link: input.link },
    options.now ?? (() => new Date()),
  );
  if (!prepared.ok) {
    return {
      status: "refused",
      notices: [
        {
          code: refusalCode(input),
          severity: "error",
          message: prepared.message,
        },
      ],
    };
  }
  const capture = prepared.value;

  const inbox = await resolveInboxFolder(projectRoot, input.inboxChoice);
  if (inbox.status === "needs-choice") return inbox;

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

  let resourceId: string;
  try {
    const resource = await createResourceCore(input.projectId, {
      name: capture.title,
      type: "text",
      folderId: inbox.inboxFolderId,
      text: { plainText: capture.plainText, tiptap: capture.tiptap },
    });
    resourceId = resource.id;
  } catch (err: unknown) {
    if (isLockedAccessError(err)) throw err;
    throw new Error(`The note could not be captured: ${errorText(err)}`, {
      cause: err,
    });
  }

  try {
    await writeCaptureKeys(projectRoot, resourceId, capture);
  } catch (err: unknown) {
    if (isLockedAccessError(err)) throw err;
    throw new Error(
      `The note was created in the ${INBOX_FOLDER_NAME} but its capture time and link could not be saved: ${errorText(err)}`,
      { cause: err },
    );
  }

  const seeding = await seedExclusion(projectRoot, resourceId);
  if (seeding !== null) notices.push(seeding);

  const logNotice = await logCapturedWords(
    projectRoot,
    resourceId,
    input.origin,
    capture,
  );
  if (logNotice !== null) notices.push(logNotice);

  return {
    status: "created",
    resourceId,
    inboxFolderId: inbox.inboxFolderId,
    notices,
  };
}
