/**
 * @module app/api/project/split/undo/route
 *
 * `POST /api/project/split/undo` (Feature 120, FR-14, FR-17). Body
 * `{ projectId }` and nothing else; the project root is derived from the
 * validated `projectId` by the core, so no client-supplied path is read.
 *
 * The core outcomes come back as typed 200 bodies: `applied`, `index-failed`,
 * `nothing-to-undo`, `unsupported-operation`, `refused` (reason and text),
 * `could-not-be-checked` and `failed` (step and the state that remains). A
 * malformed body or id is 400 with one fixed text that echoes nothing.
 * Locked-access errors are rethrown for `withStorageContext` to map to 401/409;
 * the core writes nothing before it raises one. A project root that is not an
 * absolute path is raised before the first write, so it is a typed
 * `could-not-be-checked` outcome with cause `project-root-not-absolute`. The
 * cause of `could-not-be-checked` is passed on only when it is one of a fixed
 * list; any other value (the stored read error can name a file path) becomes
 * `record-unreadable`. Any other failure is rethrown, never rendered as a
 * result body.
 *
 * No paired-device limit applies: Undo is allowed for a paired device (the
 * sharing gate in `proxy.ts` still refuses a not-confirmed request).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  parseSplitUndoBody,
  SPLIT_INVALID_REQUEST_MESSAGE,
} from "../../../../../src/lib/api/split";
import { InvalidProjectIdCoreError } from "../../../../../src/lib/models/inbox-capture-core";
import { SplitLockKeyError } from "../../../../../src/lib/models/split-preview-core";
import {
  undoLatestSplit,
  type SplitUndoResult,
} from "../../../../../src/lib/models/split-undo-core";
import { withStorageContext } from "../../../_tenant/with-storage-context";

const KNOWN_CAUSES: readonly string[] = [
  "record-malformed",
  "project-root-not-absolute",
  "record-unreadable",
];

function badRequest(): Response {
  return NextResponse.json(
    { error: SPLIT_INVALID_REQUEST_MESSAGE },
    { status: 400 },
  );
}

/** Replaces a `could-not-be-checked` cause that is not on the fixed list. */
function withStableCause(result: SplitUndoResult): SplitUndoResult {
  if (
    result.outcome === "could-not-be-checked" &&
    !KNOWN_CAUSES.includes(result.cause)
  ) {
    return { outcome: "could-not-be-checked", cause: "record-unreadable" };
  }
  return result;
}

async function handlePost(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = parseSplitUndoBody(body);
  if (!parsed.ok) return badRequest();
  try {
    const result = await undoLatestSplit(parsed.value.projectId);
    return NextResponse.json(withStableCause(result), { status: 200 });
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) return badRequest();
    if (error instanceof SplitLockKeyError) {
      return NextResponse.json(
        { outcome: "could-not-be-checked", cause: "project-root-not-absolute" },
        { status: 200 },
      );
    }
    // Locked-access errors (and everything else) propagate to withStorageContext.
    throw error;
  }
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
