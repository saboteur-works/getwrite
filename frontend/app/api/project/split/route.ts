/**
 * @module app/api/project/split/route
 *
 * `POST /api/project/split` (Feature 120, FR-3 to FR-11, FR-14). Body
 * `{ projectId, resourceId, revisionId, contentHash, offset, carryOver:
 * { annotationIds, fields, newName } }`; the project root is derived from the
 * validated `projectId` by the core, so no client-supplied path is read.
 *
 * The core outcomes come back as typed 200 bodies: `applied`, `index-failed`
 * (the split is committed; carries what was not brought up to date), `refused`
 * with its reason (a stale cursor is the `stale-cursor` reason) and `failed`
 * with the step and the state that remains. A malformed body or id is 400
 * with one fixed text that echoes nothing. Locked-access errors are rethrown
 * for `withStorageContext` to map to 401/409; the core writes nothing before
 * it raises one. A project root that is not an absolute path is raised before
 * the first write, so it is a typed `failed` outcome at the lock step with the
 * original unchanged; any other failure is rethrown, never rendered as a
 * result body.
 *
 * No paired-device limit applies: a split is allowed for a paired device (the
 * sharing gate in `proxy.ts` still refuses a not-confirmed request).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  parseSplitBody,
  SPLIT_INVALID_REQUEST_MESSAGE,
} from "../../../../src/lib/api/split";
import { InvalidProjectIdCoreError } from "../../../../src/lib/models/inbox-capture-core";
import { applySplit } from "../../../../src/lib/models/split-core";
import { SplitLockKeyError } from "../../../../src/lib/models/split-preview-core";
import { withStorageContext } from "../../_tenant/with-storage-context";

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
  const parsed = parseSplitBody(body);
  if (!parsed.ok) return badRequest();
  try {
    const result = await applySplit(
      parsed.value.projectId,
      parsed.value.request,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) return badRequest();
    if (error instanceof SplitLockKeyError) {
      return NextResponse.json(
        {
          outcome: "failed",
          failedStep: "lock-original",
          remainingState: "original-restored",
          cause: "SplitLockKeyError",
        },
        { status: 200 },
      );
    }
    // Locked-access errors (and everything else) propagate to withStorageContext.
    throw error;
  }
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
