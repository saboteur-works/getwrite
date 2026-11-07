/**
 * @module api/source-attachments
 *
 * Client for a Source's attachments (Feature 102, Tasks 27 and 28, FR-23,
 * FR-24). Resolved through `createTransport`: HTTP on web/desktop, an
 * in-process backend (`native-source-attachments-backend`) on native, both
 * over `source-attachments-core`. Restore is `restoreTrashItems` in
 * `trash.ts` (attachment-kind Trash ids go through the same restore path).
 *
 * Failure contract (`docs/standards/failure-visibility.md`): every function
 * REJECTS on a network error, a non-2xx status (the server's refusal message
 * is the error message) or a malformed body (reported through
 * `reportTransportValidationFailure`, which never receives the body). No
 * request carries a path; the file name is the browser's display name only.
 */
import type { z } from "zod";
import { createTransport } from "../../store/transport/create-transport";
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

/** The attachment operations both platforms implement. */
export interface AttachmentTransport {
  /** A Source's attachments in stored order. */
  listAttachments(
    projectId: string,
    resourceId: string,
  ): Promise<AttachmentEntryView[]>;
  /** Adds a file at the end of the list. */
  addAttachment(
    projectId: string,
    resourceId: string,
    file: File,
  ): Promise<AttachmentEntryView>;
  /** Replaces one attachment in place; the old file goes to Trash. */
  replaceAttachment(
    projectId: string,
    resourceId: string,
    attachmentId: string,
    file: File,
  ): Promise<ReplaceAttachmentView>;
  /** Removes one attachment to Trash; resolves the Trash id. */
  removeAttachment(
    projectId: string,
    resourceId: string,
    attachmentId: string,
  ): Promise<{ trashId: string }>;
  /** Reorders the list; `orderedIds` must name every attachment once. */
  reorderAttachments(
    projectId: string,
    resourceId: string,
    orderedIds: string[],
  ): Promise<AttachmentEntryView[]>;
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

/** HTTP transport: the hosted/desktop path. */
const httpAttachmentTransport: AttachmentTransport = {
  async listAttachments(projectId, resourceId) {
    const query = new URLSearchParams({ projectId, resourceId });
    const response = await fetch(`${ENDPOINT}?${query.toString()}`);
    return parse(
      "source-attachments.listAttachments",
      response,
      AttachmentListResponseSchema,
      "Failed to load the attachments",
    );
  },
  async addAttachment(projectId, resourceId, file) {
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
  },
  async replaceAttachment(projectId, resourceId, attachmentId, file) {
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
  },
  async removeAttachment(projectId, resourceId, attachmentId) {
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
  },
  async reorderAttachments(projectId, resourceId, orderedIds) {
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
  },
};

/**
 * The thunk carries the literal
 * `import("../../store/transport/native-source-attachments-backend")`
 * specifier so `next.config.mjs`'s `turbopack.resolveAlias` can substitute a
 * `node:*`-free web-stub at build time.
 */
const resolveAttachmentTransport: () => Promise<AttachmentTransport> =
  createTransport(httpAttachmentTransport, () =>
    import("../../store/transport/native-source-attachments-backend").then(
      ({ createNativeAttachmentsTransport }) =>
        createNativeAttachmentsTransport(),
    ),
  );

/** A Source's attachments in stored order. Rejects on any failure. */
export async function listAttachments(
  projectId: string,
  resourceId: string,
): Promise<AttachmentEntryView[]> {
  const transport = await resolveAttachmentTransport();
  return transport.listAttachments(projectId, resourceId);
}

/** Adds a file at the end of the list. Rejects with the refusal message. */
export async function addAttachment(
  projectId: string,
  resourceId: string,
  file: File,
): Promise<AttachmentEntryView> {
  const transport = await resolveAttachmentTransport();
  return transport.addAttachment(projectId, resourceId, file);
}

/** Replaces one attachment in place; the old file goes to Trash. */
export async function replaceAttachment(
  projectId: string,
  resourceId: string,
  attachmentId: string,
  file: File,
): Promise<ReplaceAttachmentView> {
  const transport = await resolveAttachmentTransport();
  return transport.replaceAttachment(projectId, resourceId, attachmentId, file);
}

/** Removes one attachment to Trash; resolves the Trash id. */
export async function removeAttachment(
  projectId: string,
  resourceId: string,
  attachmentId: string,
): Promise<{ trashId: string }> {
  const transport = await resolveAttachmentTransport();
  return transport.removeAttachment(projectId, resourceId, attachmentId);
}

/** Reorders the list; `orderedIds` must name every attachment once. */
export async function reorderAttachments(
  projectId: string,
  resourceId: string,
  orderedIds: string[],
): Promise<AttachmentEntryView[]> {
  const transport = await resolveAttachmentTransport();
  return transport.reorderAttachments(projectId, resourceId, orderedIds);
}
