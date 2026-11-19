/**
 * @module app/api/project/split/undo/route
 *
 * `POST /api/project/split/undo` (Feature 120, FR-14, FR-17). Body
 * `{ projectId }` and nothing else; the project root is derived from the
 * validated `projectId` by the core, so no client-supplied path is read.
 * Feature 121: the route reads the stored record and undoes a merge record
 * through `undoLatestMerge` (the body then carries `operation: "merge"` and,
 * on success, the target's name and the absorbed documents); every split
 * outcome is unchanged.
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
import { resolveResourceProjectRootOrThrow } from "../../../../../src/lib/models/resource-crud-core";
import { readLatestOperation } from "../../../../../src/lib/models/split-records-core";
import {
  undoLatestMerge,
  undoLatestSplit,
  type MergeUndoResult,
  type SplitUndoResult,
} from "../../../../../src/lib/models/split-undo-core";
import { withStorageContext } from "../../../_tenant/with-storage-context";

const KNOWN_CAUSES: readonly string[] = [
  "record-malformed",
  "record-changed",
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
function withStableCause<T extends SplitUndoResult | MergeUndoResult>(
  result: T,
): T | { outcome: "could-not-be-checked"; cause: string } {
  if (
    result.outcome === "could-not-be-checked" &&
    !KNOWN_CAUSES.includes(result.cause)
  ) {
    return { outcome: "could-not-be-checked", cause: "record-unreadable" };
  }
  return result;
}

/**
 * Reads the stored record and undoes a merge through the merge core; every
 * other state (a split record, no record, an unreadable record) goes to the
 * split core, which answers it as before. The merge core reads the record
 * again inside its locks and refuses a difference.
 */
async function undoLatestOperationOf(
  projectId: string,
): Promise<SplitUndoResult | MergeUndoResult> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const stored = await readLatestOperation(projectRoot);
  if (stored.outcome === "found" && stored.record.kind === "merge") {
    return undoLatestMerge(projectId, stored.record, {});
  }
  return undoLatestSplit(projectId);
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
    const result = await undoLatestOperationOf(parsed.value.projectId);
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
