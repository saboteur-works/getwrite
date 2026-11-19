/**
 * @module app/api/project/split/latest/route
 *
 * `GET /api/project/split/latest?projectId=` (Feature 120, FR-14, FR-16).
 * Reads the project's latest-operation record. GET, because it writes
 * nothing and the repo's read routes (`/api/claims`, `/api/project/writing-log`,
 * `/api/project/goal-filtered-total`) are GET with the id in the query; the
 * only accepted parameter is one `projectId`, and the root is derived from it
 * by the server, so no path is read.
 *
 * Bodies, all 200: `{ outcome: "found", record }`, `{ outcome: "none" }` and
 * `{ outcome: "failed", cause }`. A failed read is never `none`. The cause is
 * the fixed value `record-unreadable`: the stored read error can name a file
 * path, so it is not passed on. A malformed query or id is 400 with one fixed
 * text that echoes nothing. Locked-access errors and any other failure are
 * rethrown for `withStorageContext`, never rendered as a result body.
 *
 * No paired-device limit applies (the sharing gate in `proxy.ts` still
 * refuses a not-confirmed request).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  parseSplitLatestQuery,
  SPLIT_INVALID_REQUEST_MESSAGE,
} from "../../../../../src/lib/api/split";
import { resolveResourceProjectRootOrThrow } from "../../../../../src/lib/models/resource-crud-core";
import { InvalidProjectIdCoreError } from "../../../../../src/lib/models/inbox-capture-core";
import { readLatestOperation } from "../../../../../src/lib/models/split-records-core";
import { withStorageContext } from "../../../_tenant/with-storage-context";

function badRequest(): Response {
  return NextResponse.json(
    { error: SPLIT_INVALID_REQUEST_MESSAGE },
    { status: 400 },
  );
}

async function handleGet(req: NextRequest): Promise<Response> {
  const parsed = parseSplitLatestQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return badRequest();
  try {
    const projectRoot = resolveResourceProjectRootOrThrow(
      parsed.value.projectId,
    );
    const stored = await readLatestOperation(projectRoot);
    if (stored.outcome === "failed") {
      return NextResponse.json(
        { outcome: "failed", cause: "record-unreadable" },
        { status: 200 },
      );
    }
    return NextResponse.json(stored, { status: 200 });
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) return badRequest();
    throw error;
  }
}

export const GET = withStorageContext(handleGet);

export const dynamic = "force-dynamic";
