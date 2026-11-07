/**
 * @module api/source-attachments
 *
 * Client for a Source's attachments (Feature 102, Task 27, FR-23, FR-24).
 * HTTP only for now; the native backend and `createTransport` wiring belong
 * to Task 28. Restore is `restoreTrashItems` in `trash.ts` (attachment-kind
 * Trash ids go through the same restore route).
 *
 * Failure contract (`docs/standards/failure-visibility.md`): every function
 * REJECTS on a network error, a non-2xx status (the server's refusal message
 * is the error message) or a malformed body (reported through
 * `reportTransportValidationFailure`, which never receives the body). No
 * request carries a path; the file name is the browser's display name only.
 */
import type { z } from "zod";
import {
  AttachmentEntryResponseSchema,
  AttachmentListResponseSchema,
  ReplaceAttachmentResponseSchema,
  TrashedAttachmentResponseSchema,
} from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export type AttachmentEntryView = z.infer<typeof AttachmentEntryResponseSchema>;

export interface ReplaceAttachmentView {
  trashId: string;
  entry: AttachmentEntryView;
}

const ENDPOINT = "/api/project/source-attachments";

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

async function parse<T>(
  callSite: string,
  response: Response,
  schema: z.ZodType<T>,
  failureMessage: string,
): Promise<T> {
  if (!response.ok) {
    throw new Error(
      await errorMessage(
        response,
        `${failureMessage} (HTTP ${response.status}).`,
      ),
    );
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    reportTransportValidationFailure(callSite, parsed.error.issues);
    throw new Error("The attachment response was malformed.");
  }
  return parsed.data;
}

function jsonInit(method: "DELETE" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function formBody(fields: Record<string, string>, file: File): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set("file", file);
  return data;
}

/** A Source's attachments in stored order. Rejects on any failure. */
export async function listAttachments(
  projectId: string,
  resourceId: string,
): Promise<AttachmentEntryView[]> {
  const query = new URLSearchParams({ projectId, resourceId });
  const response = await fetch(`${ENDPOINT}?${query.toString()}`);
  return parse(
    "source-attachments.listAttachments",
    response,
    AttachmentListResponseSchema,
    "Failed to load the attachments",
  );
}

/** Adds a file at the end of the list. Rejects with the refusal message. */
export async function addAttachment(
  projectId: string,
  resourceId: string,
  file: File,
): Promise<AttachmentEntryView> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    body: formBody({ projectId, resourceId }, file),
  });
  return parse(
    "source-attachments.addAttachment",
    response,
    AttachmentEntryResponseSchema,
    "Failed to add the attachment",
  );
}

/** Replaces one attachment in place; the old file goes to Trash. */
export async function replaceAttachment(
  projectId: string,
  resourceId: string,
  attachmentId: string,
  file: File,
): Promise<ReplaceAttachmentView> {
  const response = await fetch(ENDPOINT, {
    method: "PUT",
    body: formBody({ projectId, resourceId, attachmentId }, file),
  });
  return parse(
    "source-attachments.replaceAttachment",
    response,
    ReplaceAttachmentResponseSchema,
    "Failed to replace the attachment",
  );
}

/** Removes one attachment to Trash; resolves the Trash id. */
export async function removeAttachment(
  projectId: string,
  resourceId: string,
  attachmentId: string,
): Promise<{ trashId: string }> {
  const response = await fetch(
    ENDPOINT,
    jsonInit("DELETE", { projectId, resourceId, attachmentId }),
  );
  return parse(
    "source-attachments.removeAttachment",
    response,
    TrashedAttachmentResponseSchema,
    "Failed to remove the attachment",
  );
}

/** Reorders the list; `orderedIds` must name every attachment once. */
export async function reorderAttachments(
  projectId: string,
  resourceId: string,
  orderedIds: string[],
): Promise<AttachmentEntryView[]> {
  const response = await fetch(
    ENDPOINT,
    jsonInit("PATCH", { projectId, resourceId, orderedIds }),
  );
  return parse(
    "source-attachments.reorderAttachments",
    response,
    AttachmentListResponseSchema,
    "Failed to reorder the attachments",
  );
}
