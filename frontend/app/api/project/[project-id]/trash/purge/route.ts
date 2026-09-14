/**
 * @module app/api/project/[project-id]/trash/purge/route
 *
 * Transport for batch-purging trashed resources and/or folders
 * (`specs/features/trash-ui.md` FR-1/FR-2/FR-18, Task 11, resolved OQ-9).
 *
 * Route:
 * - `POST /api/project/[project-id]/trash/purge` — permanently delete a
 *   batch of trashed items by id. Body: `{ ids: string[] }`, or
 *   `{ all: true }` for "Empty trash" — the special case of purging every
 *   currently trashed top-level id, resolved via `trash.ts`'s
 *   `listTrashedItems` before any deletion runs.
 *
 * Each id is processed independently and reported with its own outcome
 * (resolved OQ-9): a failing item never aborts the batch, and — since
 * `purgeResource`/`purgeFolder`'s ordered sweep (FR-18) leaves every
 * completed step in place on a mid-sweep failure — it stays listed in Trash,
 * available for a retried purge, rather than being silently dropped. As with
 * the sibling restore route, `resolveTrashedItemKind` dispatches each id to
 * `purgeResource`/`purgeFolder`; an id matching neither is reported as a
 * failure rather than throwing.
 *
 * Modelled on `entity-relationships/route.ts`'s POST handler: the
 * `project-id` path param is resolved and validated via
 * {@link resolveProjectPath} (never a client-supplied path, per
 * `docs/standards/security.md`). No business logic beyond per-item
 * dispatch/error-shaping lives here.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  listTrashedItems,
  purgeFolder,
  purgeResource,
  resolveTrashedItemKind,
} from "../../../../../../src/lib/models/trash";
import { resolveProjectPath } from "../../../../../../src/lib/models/project-path";
import { withStorageContext } from "../../../../_tenant/with-storage-context";

interface PurgeBatchBody {
  ids?: string[];
  all?: boolean;
}

interface PurgeItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function purgeOne(
  projectPath: string,
  id: string,
): Promise<PurgeItemResult> {
  try {
    const kind = await resolveTrashedItemKind(projectPath, id);

    if (kind === "resource") {
      await purgeResource(projectPath, id);
      return { id, ok: true };
    }

    if (kind === "folder") {
      await purgeFolder(projectPath, id);
      return { id, ok: true };
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

  let body: PurgeBatchBody;
  try {
    body = (await req.json()) as PurgeBatchBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  let ids: string[];
  if (body.all === true) {
    const trashed = await listTrashedItems(projectPath);
    ids = [
      ...trashed.resources.map((r) => r.id),
      ...trashed.folders.map((f) => f.id),
    ];
  } else if (
    Array.isArray(body.ids) &&
    body.ids.every((id) => typeof id === "string")
  ) {
    ids = body.ids;
  } else {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: "Provide either ids (string array) or all: true",
      },
      { status: 400 },
    );
  }

  const results: PurgeItemResult[] = [];
  for (const id of ids) {
    results.push(await purgeOne(projectPath, id));
  }

  return NextResponse.json({ results }, { status: 200 });
}

export const POST = withStorageContext(handlePost);

export const dynamic = "force-dynamic";
