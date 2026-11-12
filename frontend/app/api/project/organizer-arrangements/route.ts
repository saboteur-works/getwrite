/**
 * @module app/api/project/organizer-arrangements/route
 *
 * Transport for saved Organizer arrangements (Feature 109, Task 26, FR-14, OQ-3).
 *
 * Routes:
 * - `POST /api/project/organizer-arrangements` — one dispatch route; the flat
 *   body is `{ projectId, op, ...fields }`:
 *   - `op: "add"`: `{ name, source, rows, columns }`
 *   - `op: "rename"`: `{ id, name }`
 *   - `op: "delete"`: `{ id }`
 *
 * Responses:
 * - 200 `{ ok: true, id }` on success.
 * - 200 `{ ok: false, reason, message }` when the core refuses the operation
 *   (a refusal is never 401 or 409; those mean a locked project).
 * - 400 `{ error }` for a malformed envelope (constant message, no input
 *   echoed) or an invalid `projectId` (the uniform `Invalid projectId`).
 * - 401 / 409 when the project is locked or its key is missing: the core's
 *   locked-access error is left to propagate to `withStorageContext`.
 *
 * The route validates only the envelope (an object, a `projectId` UUID, a known
 * `op`). Every other field is passed to the core untouched, so the core's own
 * validation refuses an unknown key, source or axis before any lock. No client
 * path is accepted.
 *
 * Not a paired-device limit: no paired-device limit check is called. An
 * arrangement write changes one `project.json` config key and deletes no
 * writer data.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  respondInvalidProjectId,
  validateProjectId,
} from "../../../../src/lib/models/project-path";
import {
  addOrganizerArrangementCore,
  deleteOrganizerArrangementCore,
  renameOrganizerArrangementCore,
} from "../../../../src/lib/models/organizer-arrangements-core";
import type {
  OrganizerArrangementAddInput,
  OrganizerArrangementDeleteInput,
  OrganizerArrangementRenameInput,
  OrganizerArrangementResult,
} from "../../../../src/lib/models/organizer-grid-types";
import { withStorageContext } from "../../_tenant/with-storage-context";

/** Constant body message for a malformed envelope; echoes no input. */
const MALFORMED_BODY_MESSAGE = "Invalid request body.";

function malformedBody(): Response {
  return NextResponse.json({ error: MALFORMED_BODY_MESSAGE }, { status: 400 });
}

type Envelope = {
  projectId: string;
  op: "add" | "rename" | "delete";
  fields: Record<string, unknown>;
};

/** Checks the envelope; returns null for any malformed body. */
function parseEnvelope(body: unknown): Envelope | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const { projectId, op, ...fields } = body as Record<string, unknown>;
  if (typeof projectId !== "string") return null;
  if (op !== "add" && op !== "rename" && op !== "delete") return null;
  return { projectId, op, fields };
}

function dispatch(envelope: Envelope): Promise<OrganizerArrangementResult> {
  const { projectId, op, fields } = envelope;
  if (op === "add") {
    return addOrganizerArrangementCore(
      projectId,
      fields as unknown as OrganizerArrangementAddInput,
    );
  }
  if (op === "rename") {
    return renameOrganizerArrangementCore(
      projectId,
      fields as unknown as OrganizerArrangementRenameInput,
    );
  }
  return deleteOrganizerArrangementCore(
    projectId,
    fields as unknown as OrganizerArrangementDeleteInput,
  );
}

async function handlePost(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return malformedBody();
  }
  const envelope = parseEnvelope(body);
  if (envelope === null) return malformedBody();
  try {
    validateProjectId(envelope.projectId);
  } catch {
    return respondInvalidProjectId();
  }
  // A core refusal is a result, not a throw. Locked-access errors and any
  // unexpected failure propagate to withStorageContext (401/409/500); they are
  // never turned into a refusal or an empty success.
  return NextResponse.json(await dispatch(envelope), { status: 200 });
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
