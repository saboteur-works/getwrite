/**
 * @module app/api/project/source-attachments/bytes/route
 *
 * Transport for reading one Source attachment's bytes (Feature 103, FR-18
 * storage half, FR-12, FR-30).
 *
 * `GET ?projectId=&resourceId=&attachmentId=` answers the file's bytes. The
 * `Content-Type` is the stored entry's mime type and `X-Attachment-Kind`
 * (`image` or `audio`) is the kind the core reports from the stored entry and
 * a check of the file's leading bytes, never from the original file name.
 *
 * Read-only, so it is not paired-device limited (FR-13 inventory, Task 14).
 * No client path is accepted: ids only, validated by the core. The response
 * carries `nosniff`, `no-store` and a sandboxing CSP, so a stored SVG opened
 * as a document runs no script and is not cached. Nothing here logs a value,
 * file name or error text. Locked-access errors are rethrown for
 * `withStorageContext` (401/409).
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../../src/lib/models/project-path";
import {
  AttachmentBytesMissingError,
  AttachmentStoredContentError,
  InvalidAttachmentIdError,
  InvalidProjectIdCoreError,
  readAttachmentBytesCore,
} from "../../../../../src/lib/models/source-attachment-bytes-core";
import {
  AttachmentNotFoundError,
  AttachmentResourceNotFoundError,
  AttachmentResourceTypeError,
  InvalidAttachmentResourceIdError,
} from "../../../../../src/lib/models/source-attachments-core";
import { withStorageContext } from "../../../_tenant/with-storage-context";

function failure(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

/** Maps the core's named errors; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (
    error instanceof InvalidAttachmentResourceIdError ||
    error instanceof InvalidAttachmentIdError ||
    error instanceof AttachmentResourceTypeError
  ) {
    return failure(error.message, 400);
  }
  if (
    error instanceof AttachmentResourceNotFoundError ||
    error instanceof AttachmentNotFoundError ||
    error instanceof AttachmentBytesMissingError
  ) {
    return failure(error.message, 404);
  }
  if (error instanceof AttachmentStoredContentError) {
    return failure(error.message, 422);
  }
  throw error;
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  try {
    const result = await readAttachmentBytesCore(
      params.get("projectId") ?? "",
      params.get("resourceId") ?? "",
      params.get("attachmentId") ?? "",
    );
    return new Response(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": result.mime,
        "Content-Length": String(result.size),
        "X-Attachment-Kind": result.kind,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
