/**
 * @module app/api/project/source-attachments/route
 *
 * Transport for a Source's attachments (Feature 102, Task 27, FR-23 HTTP
 * half, FR-24, FR-32, FR-34).
 *
 * Routes:
 * - `GET    ?projectId=&resourceId=` — the ordered list.
 * - `POST   multipart` (`projectId`, `resourceId`, `file`) — add.
 * - `PUT    multipart` (`projectId`, `resourceId`, `attachmentId`, `file`) —
 *   replace; the previous file goes to Trash.
 * - `PATCH  json` `{ projectId, resourceId, orderedIds }` — reorder.
 * - `DELETE json` `{ projectId, resourceId, attachmentId }` — remove to Trash.
 *
 * Restore is not here: an attachment-kind Trash id is restored through
 * `POST /api/project/[project-id]/trash/restore` (`restoreOneCore`).
 *
 * No client path is accepted; the project root is derived from `projectId`
 * by the core. Input is validated before any lock or write. A file is
 * pre-checked on its size and first 512 bytes before it is buffered, and the
 * core re-validates. Nothing here logs a value, file name or error text.
 * Locked-access errors are rethrown for `withStorageContext` (401/409).
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import {
  isResourceId,
  respondInvalidResourceId,
} from "../../../../src/lib/models/resource-id";
import {
  addAttachmentCore,
  AttachmentLimitError,
  AttachmentNotFoundError,
  AttachmentResourceNotFoundError,
  AttachmentResourceTypeError,
  AttachmentSourceUnavailableError,
  AttachmentValidationError,
  InvalidAttachmentOrderError,
  InvalidAttachmentResourceIdError,
  InvalidProjectIdCoreError,
  listAttachmentsCore,
  removeAttachmentCore,
  reorderAttachmentsCore,
  replaceAttachmentCore,
  type AddAttachmentInput,
} from "../../../../src/lib/models/source-attachments-core";
import { validateAttachmentFile } from "../../../../src/lib/models/media-validation";
import { withStorageContext } from "../../_tenant/with-storage-context";

const HEAD_BYTES = 512;

function failure(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

/** Maps the core's named errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (
    error instanceof AttachmentValidationError ||
    error instanceof AttachmentLimitError ||
    error instanceof InvalidAttachmentResourceIdError ||
    error instanceof AttachmentResourceTypeError ||
    error instanceof InvalidAttachmentOrderError
  ) {
    return failure(error.message, 400);
  }
  if (
    error instanceof AttachmentResourceNotFoundError ||
    error instanceof AttachmentNotFoundError
  ) {
    return failure(error.message, 404);
  }
  if (error instanceof AttachmentSourceUnavailableError) {
    return failure(error.message, 409);
  }
  throw error;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  try {
    const list = await listAttachmentsCore(
      params.get("projectId") ?? "",
      params.get("resourceId") ?? "",
    );
    return NextResponse.json(list, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

interface MultipartFields {
  projectId: string;
  resourceId: string;
  attachmentId: string;
  input: AddAttachmentInput;
}

/** Reads the form; returns a refusal Response or the validated-for-shape fields. */
async function readMultipart(
  req: Request,
): Promise<MultipartFields | Response> {
  let data: FormData;
  try {
    data = await req.formData();
  } catch {
    return failure("Expected a multipart form.", 400);
  }
  const file = data.get("file");
  if (!(file instanceof File)) {
    return failure("A 'file' field is required.", 400);
  }
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const preCheck = validateAttachmentFile({
    mime: file.type || undefined,
    ext: file.name,
    size: file.size,
    bytes: head,
  });
  if (!preCheck.ok) return failure(preCheck.message, 400);
  return {
    projectId: text(data.get("projectId")),
    resourceId: text(data.get("resourceId")),
    attachmentId: text(data.get("attachmentId")),
    input: {
      fileName: file.name,
      mimeType: file.type || undefined,
      fileBytes: new Uint8Array(await file.arrayBuffer()),
    },
  };
}

async function handlePost(req: Request): Promise<Response> {
  const fields = await readMultipart(req);
  if (fields instanceof Response) return fields;
  try {
    const entry = await addAttachmentCore(
      fields.projectId,
      fields.resourceId,
      fields.input,
    );
    return NextResponse.json(entry, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handlePut(req: Request): Promise<Response> {
  const fields = await readMultipart(req);
  if (fields instanceof Response) return fields;
  if (!isResourceId(fields.attachmentId)) return respondInvalidResourceId();
  try {
    const result = await replaceAttachmentCore(
      fields.projectId,
      fields.resourceId,
      fields.attachmentId,
      fields.input,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function readJson(
  req: Request,
): Promise<Record<string, unknown> | Response> {
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return failure("Invalid JSON body.", 400);
    }
    return body as Record<string, unknown>;
  } catch {
    return failure("Invalid JSON body.", 400);
  }
}

async function handlePatch(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  try {
    const list = await reorderAttachmentsCore(
      text(body.projectId),
      text(body.resourceId),
      body.orderedIds as string[],
    );
    return NextResponse.json(list, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handleDelete(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (!isResourceId(body.attachmentId)) return respondInvalidResourceId();
  try {
    const result = await removeAttachmentCore(
      text(body.projectId),
      text(body.resourceId),
      text(body.attachmentId),
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);
export const POST = withStorageContext(handlePost);
export const PUT = withStorageContext(handlePut);
export const PATCH = withStorageContext(handlePatch);
export const DELETE = withStorageContext(handleDelete);

export const dynamic = "force-dynamic";
