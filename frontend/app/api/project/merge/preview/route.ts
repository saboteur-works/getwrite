/**
 * @module app/api/project/merge/preview/route
 *
 * `POST /api/project/merge/preview` (Feature 121, FR-7, FR-11, FR-15). Body
 * `{ projectId, documents: [{ resourceId, revisionId, contentHash }] }`, the
 * first document being the target; the project root is derived from the
 * validated `projectId` by the core, so no client-supplied path is read.
 * Nothing is written.
 *
 * The three core outcomes (`preview`, `refused` with its reason and the
 * document it names, `failed`) come back as typed 200 bodies. A count over
 * `MERGE_DOCUMENT_CAP` is refused here with the too-many-documents reason
 * before the core runs. A malformed body or id is 400 with one fixed text that
 * echoes nothing. Locked-access errors are rethrown for `withStorageContext`
 * to map to 401/409. A project root that is not an absolute path is a typed
 * `failed` outcome; any other failure is rethrown, never rendered as a result
 * body.
 *
 * No paired-device limit applies: the preview is allowed for a paired device
 * (the sharing gate in `proxy.ts` still refuses a not-confirmed request).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  MERGE_INVALID_REQUEST_MESSAGE,
  parseMergePreviewBody,
} from "../../../../../src/lib/api/merge";
import { InvalidProjectIdCoreError } from "../../../../../src/lib/models/inbox-capture-core";
import { MERGE_DOCUMENT_CAP } from "../../../../../src/lib/models/merge-limits";
import { previewMerge } from "../../../../../src/lib/models/merge-preview-core";
import { MERGE_REFUSAL_REASONS } from "../../../../../src/lib/models/merge-types";
import { SplitLockKeyError } from "../../../../../src/lib/models/split-preview-core";
import { withStorageContext } from "../../../_tenant/with-storage-context";

function badRequest(): Response {
  return NextResponse.json(
    { error: MERGE_INVALID_REQUEST_MESSAGE },
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
  const parsed = parseMergePreviewBody(body);
  if (!parsed.ok) return badRequest();
  if (parsed.value.request.documents.length > MERGE_DOCUMENT_CAP) {
    return NextResponse.json(
      {
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.tooManyDocuments,
        documentId: null,
      },
      { status: 200 },
    );
  }
  try {
    const result = await previewMerge(
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
