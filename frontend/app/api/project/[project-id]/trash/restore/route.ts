/**
 * @module app/api/project/[project-id]/trash/restore/route
 *
 * Transport for batch-restoring trashed resources and/or folders
 * (`specs/features/trash-ui.md` FR-1/FR-2, Task 11, resolved OQ-9).
 *
 * Route:
 * - `POST /api/project/[project-id]/trash/restore` — restore a batch of
 *   trashed items by id. Body: `{ ids: string[] }`.
 *
 * Each id is processed independently and reported with its own outcome
 * (resolved OQ-9): a failing item never aborts the batch, and it stays
 * listed in Trash rather than being silently dropped from the response.
 * `trash.ts`'s `resolveTrashedItemKind` determines whether a given id names
 * a trashed resource or a trashed folder, dispatching to
 * `restoreResource`/`restoreFolder` accordingly; an id matching neither is
 * reported as a failure rather than throwing.
 *
 * Modelled on `entity-relationships/route.ts`'s POST handler: the
 * `project-id` path param is resolved and validated via
 * {@link resolveProjectPath} (never a client-supplied path, per
 * `docs/standards/security.md`). No business logic beyond per-item
 * dispatch/error-shaping lives here.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  resolveTrashedItemKind,
  restoreFolder,
  restoreResource,
  type RestoredReferenceInfo,
} from "../../../../../../src/lib/models/trash";
import { resolveProjectPath } from "../../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../../_tenant/with-storage-context";

interface RestoreBatchBody {
  ids?: string[];
}

interface RestoreItemResult {
  id: string;
  ok: boolean;
  relocated?: boolean;
  renamed?: boolean;
  referencesNotRestored?: RestoredReferenceInfo[] | "no-record";
  error?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function restoreOne(
  projectPath: string,
  id: string,
): Promise<RestoreItemResult> {
  try {
    const kind = await resolveTrashedItemKind(projectPath, id);

    if (kind === "resource") {
      const result = await restoreResource(projectPath, id);
      return {
        id,
        ok: true,
        relocated: result.relocated,
        renamed: result.renamed,
        referencesNotRestored: result.referencesNotRestored,
      };
    }

    if (kind === "folder") {
      const result = await restoreFolder(projectPath, id);
      return {
        id,
        ok: true,
        relocated: result.relocated,
        renamed: result.renamed,
      };
    }

    return { id, ok: false, error: "Not found in trash" };
  } catch (err: unknown) {
    return { id, ok: false, error: errorMessage(err) };
  }
}

async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "project-id": string }> },
): Promise<Response> {
  const projectId = (await params)["project-id"];

  const resolved = resolveProjectPath(projectId);
  if (resolved instanceof Response) return resolved;
  const { projectPath } = resolved;

  let body: RestoreBatchBody;
  try {
    body = (await req.json()) as RestoreBatchBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  if (
    !Array.isArray(body.ids) ||
    !body.ids.every((id) => typeof id === "string")
  ) {
    return NextResponse.json(
      { error: "Invalid request", details: "ids is a required string array" },
      { status: 400 },
    );
  }

  const results: RestoreItemResult[] = [];
  for (const id of body.ids) {
    results.push(await restoreOne(projectPath, id));
  }

  return NextResponse.json({ results }, { status: 200 });
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
