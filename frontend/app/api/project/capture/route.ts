/**
 * @module app/api/project/capture/route
 *
 * `POST /api/project/capture` (Feature 106, FR-2, FR-9, FR-10). Body
 * `{ projectId, text, link?, origin, inboxChoice? }`; `origin` is `typed` or
 * `shared`, `inboxChoice` is `restore` or `new`. The route validates the shape
 * and hands exactly those fields to `captureToInboxCore`; the project root is
 * derived from the validated `projectId` by the core, and `capturedAt` is
 * taken from the server clock there, so no client-supplied path or timestamp
 * is read. Text and link length are bounded by the core.
 *
 * The three core results (`created`, `needs-choice`, `refused`) come back as
 * typed 200 bodies. A malformed body or project id is 400. Locked-access
 * errors are rethrown for `withStorageContext` to map to 401/409; any other
 * failure is rethrown, never rendered as a result body.
 *
 * No paired-device limit applies: capture is allowed for a paired device (the
 * sharing gate in `proxy.ts` still refuses a not-confirmed request).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  captureToInboxCore,
  InvalidProjectIdCoreError,
} from "../../../../src/lib/models/inbox-capture-core";
import { respondInvalidProjectId } from "../../../../src/lib/models/project-path";
import type {
  CaptureOrigin,
  CaptureRequest,
  InboxTrashChoice,
} from "../../../../src/lib/api/inbox-capture-types";
import { withStorageContext } from "../../_tenant/with-storage-context";

type Parsed =
  | { ok: true; request: CaptureRequest }
  | { ok: false; message: string };

function isOrigin(value: unknown): value is CaptureOrigin {
  return value === "typed" || value === "shared";
}

function isChoice(value: unknown): value is InboxTrashChoice {
  return value === "restore" || value === "new";
}

/** Validates the body's shape; returns only the five known fields. */
function parseBody(body: unknown): Parsed {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "The request body must be an object." };
  }
  const { projectId, text, link, origin, inboxChoice } = body as Record<
    string,
    unknown
  >;
  if (typeof projectId !== "string") {
    return { ok: false, message: "projectId must be a string." };
  }
  if (typeof text !== "string") {
    return { ok: false, message: "text must be a string." };
  }
  if (!isOrigin(origin)) {
    return { ok: false, message: "origin must be typed or shared." };
  }
  if (link !== undefined && typeof link !== "string") {
    return { ok: false, message: "link must be a string." };
  }
  if (inboxChoice !== undefined && !isChoice(inboxChoice)) {
    return { ok: false, message: "inboxChoice must be restore or new." };
  }
  const request: CaptureRequest = { projectId, text, origin };
  if (link !== undefined) request.link = link;
  if (inboxChoice !== undefined) request.inboxChoice = inboxChoice;
  return { ok: true, request };
}

function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function handlePost(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }
  const parsed = parseBody(body);
  if (!parsed.ok) return badRequest(parsed.message);
  try {
    const result = await captureToInboxCore(parsed.request);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) {
      return respondInvalidProjectId();
    }
    // Locked-access errors (and everything else) propagate to withStorageContext.
    throw error;
  }
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
