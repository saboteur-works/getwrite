/**
 * @module app/api/project/split/preview/route
 *
 * `POST /api/project/split/preview` (Feature 120, FR-7, FR-12, FR-14). Body
 * `{ projectId, resourceId, revisionId, contentHash, offset }`; the project
 * root is derived from the validated `projectId` by the core, so no
 * client-supplied path is read. Nothing is written.
 *
 * The three core outcomes (`preview`, `refused` with its reason, `failed`)
 * come back as typed 200 bodies. A malformed body or id is 400 with one fixed
 * text that echoes nothing. Locked-access errors are rethrown for
 * `withStorageContext` to map to 401/409. A project root that is not an
 * absolute path is a typed `failed` outcome; any other failure is rethrown,
 * never rendered as a result body.
 *
 * No paired-device limit applies: the preview is allowed for a paired device
 * (the sharing gate in `proxy.ts` still refuses a not-confirmed request).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  parseSplitPreviewBody,
  SPLIT_INVALID_REQUEST_MESSAGE,
} from "../../../../../src/lib/api/split";
import { InvalidProjectIdCoreError } from "../../../../../src/lib/models/inbox-capture-core";
import {
  previewSplit,
  SplitLockKeyError,
} from "../../../../../src/lib/models/split-preview-core";
import { withStorageContext } from "../../../_tenant/with-storage-context";

function badRequest(): Response {
  return NextResponse.json(
    { error: SPLIT_INVALID_REQUEST_MESSAGE },
    { status: 400 },
  );
}

async function handlePost(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = parseSplitPreviewBody(body);
  if (!parsed.ok) return badRequest();
  try {
    const result = await previewSplit(
      parsed.value.projectId,
      parsed.value.request,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) return badRequest();
    if (error instanceof SplitLockKeyError) {
      return NextResponse.json(
        { outcome: "failed", cause: "project-root-not-absolute" },
        { status: 200 },
      );
    }
    // Locked-access errors (and everything else) propagate to withStorageContext.
    throw error;
  }
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
