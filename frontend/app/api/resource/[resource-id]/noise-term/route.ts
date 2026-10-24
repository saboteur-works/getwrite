import { NextRequest, NextResponse } from "next/server";
import {
  InvalidProjectIdCoreError,
  setNoiseTermDismissedCore,
} from "../../../../../src/lib/models/resource-crud-core";
import { respondInvalidProjectId } from "../../../../../src/lib/models/project-path";
import {
  RESOURCE_GONE_CODE,
  ResourceGoneError,
} from "../../../../../src/lib/models/resource-gone-error";
import { withStorageContext } from "../../../_tenant/with-storage-context";
import {
  isResourceId,
  respondInvalidResourceId,
} from "../../../../../src/lib/models/resource-id";

interface NoiseTermBody {
  projectId: string;
  term: unknown;
  dismissed: unknown;
}

// Dismisses (or restores) one noise-flagged term for one entity. The new list
// is computed from the sidecar read inside the lock, not sent by the client
// (note_8cfdc308). Responds with the stored list.
async function handlePost(
  req: NextRequest,
  { params }: { params: Promise<{ "resource-id": string }> },
): Promise<Response> {
  const resourceId = (await params)["resource-id"];
  if (!isResourceId(resourceId)) return respondInvalidResourceId();

  let body: NoiseTermBody;
  try {
    body = (await req.json()) as NoiseTermBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request", details: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  const { term, dismissed } = body;
  if (
    typeof term !== "string" ||
    term.trim() === "" ||
    typeof dismissed !== "boolean"
  ) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: "term must be a non-blank string and dismissed a boolean",
      },
      { status: 400 },
    );
  }

  try {
    const dismissedNoiseTerms = await setNoiseTermDismissedCore(
      body.projectId,
      resourceId,
      term,
      dismissed,
    );
    return NextResponse.json({ dismissedNoiseTerms });
  } catch (error) {
    if (error instanceof InvalidProjectIdCoreError) {
      return respondInvalidProjectId();
    }
    if (error instanceof ResourceGoneError) {
      return NextResponse.json(
        { error: "Resource not found", code: RESOURCE_GONE_CODE },
        { status: 404 },
      );
    }
    throw error;
  }
}

export const POST = withStorageContext(handlePost);
