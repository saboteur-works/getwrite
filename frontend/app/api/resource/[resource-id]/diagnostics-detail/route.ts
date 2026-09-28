import { NextRequest, NextResponse } from "next/server";
import { locateRepeatedPhrases } from "../../../../../src/lib/models/prose-diagnostics";
import { loadPersistedPlainText } from "../../../../../src/lib/models/indexer-queue";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

/**
 * Reads a resource's on-demand, never-persisted located repeated-word
 * detail (FR-5/FR-8, Feature 62): every repeated-word phrase occurrence
 * from `topRepeatedWords`'s own cutoffs, plus its character offset within
 * the resource's PERSISTED plain text.
 *
 * GET /api/resource/:resourceId/diagnostics-detail?projectId=<uuid>
 *
 * Reads the same persisted plain text the FR-7 summary route
 * (`../diagnostics/route.ts`) reads — `loadPersistedPlainText` — so an
 * offset returned here always agrees with what that same text actually
 * contains. Unlike the summary route, this route never calls
 * `rebuildDiagnosticsRecordIfStale` and never writes to
 * `diagnostics-index.ts`'s persisted index or anywhere else: it is a pure
 * read-plus-compute, run fresh on every call.
 *
 * Mirrors the mentions/summary routes' "no data yet is not an error"
 * precedent: a resource with no persisted plain text yet responds 200 with
 * an empty list rather than a 404.
 *
 * Locked/keyless project access (`isLockedAccessError`) is not swallowed
 * here: it propagates through `withStorageContext`, which maps it to the
 * appropriate HTTP status.
 */
async function handleGet(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
): Promise<Response> {
  const resourceId = (await params)["resource-id"];
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  const plainText =
    (await loadPersistedPlainText(projectPath, resourceId)) ?? "";
  const locatedRepeatedWords = locateRepeatedPhrases(plainText);

  return NextResponse.json({ locatedRepeatedWords });
}

export const GET = withStorageContext(handleGet);
