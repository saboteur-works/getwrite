/**
 * @module app/api/project/organizer-field/route
 *
 * Transport for the Organizer grid's field write (Feature 109, Task 12,
 * FR-7, FR-13).
 *
 * `PUT /api/project/organizer-field` — body `{ projectId, input }`, where
 * `input` is `{ resourceId, changes }`. The route checks only the envelope
 * (a UUID `projectId`, an object `input` with a string `resourceId` and an
 * array `changes`); the core validates each change and refuses with a result.
 *
 * Responses:
 * - 200 with the core's result: `{ ok: true, resourceId }`, or a refusal
 *   `{ ok: false, reason, message }` (a refusal is a result, not an error).
 * - 400 for a malformed envelope or `projectId`; the body is a constant text
 *   and never echoes the input.
 * - 404 `{ error, code: "resource-gone" }` when the core throws
 *   `ResourceGoneError`; the text names no id.
 * - Locked-access errors are rethrown for `withStorageContext` (401/409).
 *
 * No limit check: none of the five sharing limits guards a field edit (the sidecar
 * route has none either). The project root is derived by the core; no
 * client-supplied path is accepted.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import { InvalidProjectIdCoreError } from "../../../../src/lib/models/project-id-core-error";
import { setOrganizerFieldsCore } from "../../../../src/lib/models/organizer-field-write-core";
import type { OrganizerFieldWriteInput } from "../../../../src/lib/models/organizer-grid-types";
import {
  RESOURCE_GONE_CODE,
  ResourceGoneError,
} from "../../../../src/lib/models/resource-gone-error";
import { isValidUUID } from "../../../../src/lib/models/uuid";
import { withStorageContext } from "../../_tenant/with-storage-context";

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Envelope check only; each change is validated by the core. */
function readInput(value: unknown): OrganizerFieldWriteInput | null {
  if (!isRecord(value)) return null;
  if (typeof value.resourceId !== "string") return null;
  if (!Array.isArray(value.changes)) return null;
  return value as unknown as OrganizerFieldWriteInput;
}

async function handlePut(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  if (!isRecord(body)) return badRequest("Body must be an object.");
  if (typeof body.projectId !== "string" || !isValidUUID(body.projectId)) {
    return respondInvalidProjectId();
  }
  const input = readInput(body.input);
  if (input === null) {
    return badRequest("input must carry a resourceId and a changes array.");
  }
  try {
    const result = await setOrganizerFieldsCore(body.projectId, input);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) {
      return respondInvalidProjectId();
    }
    if (error instanceof ResourceGoneError) {
      return NextResponse.json(
        { error: "Resource not found", code: RESOURCE_GONE_CODE },
        { status: 404 },
      );
    }
    throw error;
  }
}

export const PUT = withStorageContext(handlePut);

export const dynamic = "force-dynamic";
