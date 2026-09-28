import { NextRequest, NextResponse } from "next/server";
import { rebuildDiagnosticsRecordIfStale } from "../../../../../src/lib/models/diagnostics-index";
import { loadPersistedPlainText } from "../../../../../src/lib/models/indexer-queue";
import { resolveProjectPath } from "../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../_tenant/with-storage-context";

/**
 * Reads a resource's persisted prose diagnostics summary (FR-7, Feature 62):
 * dialogue ratio, average sentence length, and top repeated words.
 *
 * GET /api/resource/:resourceId/diagnostics?projectId=<uuid>
 *
 * Mirrors the mentions route's "no data yet is not an error" precedent
 * (`app/api/resource/[resource-id]/mentions/route.ts`): a resource with no
 * persisted diagnostics record yet (never saved, or no matching content)
 * responds 200 with the zeroed shape those metrics naturally produce for
 * empty text, rather than a 404.
 *
 * Before responding, the resource's persisted record is rebuilt if it is
 * missing or stale (an older `HEURISTIC_VERSION` than the one currently in
 * effect) via `rebuildDiagnosticsRecordIfStale`, so a stale record is
 * corrected the first time anything reads it rather than waiting for the
 * resource's next save. A resource that has never been saved has no
 * persisted plain text; `loadPersistedPlainText`'s `undefined` in that case
 * is treated as the empty string.
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
  const record = await rebuildDiagnosticsRecordIfStale(
    projectPath,
    resourceId,
    plainText,
  );

  return NextResponse.json({
    dialogueRatio: record.dialogueRatio,
    averageSentenceLength: record.averageSentenceLength,
    topRepeatedWords: record.topRepeatedWords,
  });
}

export const GET = withStorageContext(handleGet);
