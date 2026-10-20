/**
 * @module project-types-write-http
 *
 * HTTP-facing helpers shared by the project-type write routes (Feature 90,
 * Task 19): a size-capped body reader, the refusal-to-status mapping and the
 * response shapes. The routes never read a path, file name, directory or
 * `source` from the client; the only client input that reaches the core is
 * the project-type spec itself (validated strictly there) and the path id.
 */
import { NextResponse } from "next/server";
import type {
  ProjectTypeWriteRefusal,
  ProjectTypeWriteRefusalReason,
  ProjectTypeWriteResult,
} from "./project-types-write-core";

/** Largest request body accepted, in bytes (256 KiB), checked before parsing. */
export const MAX_PROJECT_TYPE_BODY_BYTES = 256 * 1024;

/**
 * HTTP status per refusal reason. `saving-unavailable` is 503: the server is
 * not configured to accept saves here (no saved directory, or hosted auth is
 * active), which is a property of the deployment rather than of the request.
 */
export function statusForRefusal(
  reason: ProjectTypeWriteRefusalReason,
): number {
  switch (reason) {
    case "invalid":
      return 400;
    case "id-clash":
    case "name-clash":
      return 409;
    case "built-in":
      return 403;
    case "not-found":
      return 404;
    case "saving-unavailable":
      return 503;
    case "unreadable":
    case "write-failed":
      return 500;
  }
}

/** A refusal as `{ error, reason, conflictsWith? }` with its mapped status. */
export function refusalResponse(
  refusal: Pick<
    ProjectTypeWriteRefusal,
    "reason" | "message" | "conflictsWith"
  >,
): NextResponse {
  const body: {
    error: string;
    reason: ProjectTypeWriteRefusalReason;
    conflictsWith?: ProjectTypeWriteRefusal["conflictsWith"];
  } = { error: refusal.message, reason: refusal.reason };
  if (refusal.conflictsWith) body.conflictsWith = refusal.conflictsWith;
  return NextResponse.json(body, { status: statusForRefusal(refusal.reason) });
}

/** The fixed 400 for a body that cannot be read, is too large or is not JSON. */
export function invalidBodyResponse(): NextResponse {
  return refusalResponse({
    reason: "invalid",
    message: "The project type is not valid.",
  });
}

/** Maps a core result to its response; `successStatus` applies on success. */
export function resultResponse(
  result: ProjectTypeWriteResult,
  successStatus: number,
): NextResponse {
  if (!result.ok) return refusalResponse(result);
  const body =
    result.spec !== undefined
      ? { fileName: result.fileName, spec: result.spec }
      : { fileName: result.fileName };
  return NextResponse.json(body, { status: successStatus });
}

/**
 * Reads the request body as text, refusing more than `maxBytes` before any
 * parsing. A declared `content-length` over the cap is refused without
 * reading; otherwise the stream is counted as it is read and cancelled the
 * moment it exceeds the cap.
 *
 * @returns the text, or `null` when the body is absent, too large or unreadable.
 */
async function readCappedText(
  request: Request,
  maxBytes: number = MAX_PROJECT_TYPE_BODY_BYTES,
): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0 || length > maxBytes) {
      return null;
    }
  }
  if (request.body === null) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value = chunk.value;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Capped read then `JSON.parse`; `{ ok: false }` for every failure. */
export async function readCappedJson(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  const text = await readCappedText(request);
  if (text === null) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}
