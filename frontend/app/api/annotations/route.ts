/**
 * @module app/api/annotations/route
 *
 * Annotation route family (Feature 101, FR-22, FR-11, FR-32). All five
 * methods call `annotations-core.ts`, so the native backend refuses the same
 * input with the same message.
 *
 * - `GET    ?projectId=&resourceId=` list the resource's annotations.
 * - `POST   { projectId, resourceId, annotation: { id, body, quote } }`
 * - `PUT    { projectId, resourceId, annotationId, body }`
 * - `PATCH  { projectId, resourceId, annotationId, quote }` re-attach: replaces
 *   the quote only (FR-16).
 * - `DELETE { projectId, resourceId, annotationId }`
 *
 * Invalid project id, resource id or body, and a non-text resource, map to
 * 400 with the core's message; a missing resource or annotation maps to 404.
 * The project root is derived from the validated `projectId`; no path is
 * accepted. Locked-access errors and any other error propagate unchanged to
 * `withStorageContext` (401/409/500); nothing stored is logged.
 */
import { NextRequest, NextResponse } from "next/server";
import { respondInvalidProjectId } from "../../../src/lib/models/project-path";
import {
  addAnnotationCore,
  AnnotationNotFoundError,
  AnnotationResourceNotFoundError,
  AnnotationResourceTypeError,
  deleteAnnotationCore,
  InvalidAnnotationError,
  InvalidAnnotationResourceIdError,
  InvalidProjectIdCoreError,
  listAnnotationsCore,
  reattachAnnotationCore,
  updateAnnotationCore,
} from "../../../src/lib/models/annotations-core";
import { withStorageContext } from "../_tenant/with-storage-context";

function failure(message: string, status: number): Response {
  return NextResponse.json({ error: message }, { status });
}

/** Maps the core's refusals; rethrows anything else (incl. locked-access). */
function mapCoreError(error: unknown): Response {
  if (error instanceof InvalidProjectIdCoreError) {
    return respondInvalidProjectId();
  }
  if (
    error instanceof InvalidAnnotationError ||
    error instanceof InvalidAnnotationResourceIdError ||
    error instanceof AnnotationResourceTypeError
  ) {
    return failure(error.message, 400);
  }
  if (
    error instanceof AnnotationResourceNotFoundError ||
    error instanceof AnnotationNotFoundError
  ) {
    return failure(error.message, 404);
  }
  throw error;
}

interface Parsed {
  projectId: string;
  resourceId: string;
  fields: Record<string, unknown>;
}

async function readBody(req: NextRequest): Promise<Parsed | Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return failure("The request body must be an object.", 400);
  }
  const fields = body as Record<string, unknown>;
  return {
    projectId: typeof fields.projectId === "string" ? fields.projectId : "",
    resourceId: typeof fields.resourceId === "string" ? fields.resourceId : "",
    fields,
  };
}

async function handleGet(req: NextRequest): Promise<Response> {
  const params = new URL(req.url).searchParams;
  try {
    const annotations = await listAnnotationsCore(
      params.get("projectId") ?? "",
      params.get("resourceId") ?? "",
    );
    return NextResponse.json({ annotations }, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handlePost(req: NextRequest): Promise<Response> {
  const parsed = await readBody(req);
  if (parsed instanceof Response) return parsed;
  try {
    const annotation = await addAnnotationCore(
      parsed.projectId,
      parsed.resourceId,
      parsed.fields.annotation,
    );
    return NextResponse.json({ annotation }, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

function annotationIdOf(fields: Record<string, unknown>): string {
  return typeof fields.annotationId === "string" ? fields.annotationId : "";
}

async function handlePut(req: NextRequest): Promise<Response> {
  const parsed = await readBody(req);
  if (parsed instanceof Response) return parsed;
  try {
    const annotation = await updateAnnotationCore(
      parsed.projectId,
      parsed.resourceId,
      annotationIdOf(parsed.fields),
      parsed.fields.body,
    );
    return NextResponse.json({ annotation }, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handlePatch(req: NextRequest): Promise<Response> {
  const parsed = await readBody(req);
  if (parsed instanceof Response) return parsed;
  try {
    const annotation = await reattachAnnotationCore(
      parsed.projectId,
      parsed.resourceId,
      annotationIdOf(parsed.fields),
      parsed.fields.quote,
    );
    return NextResponse.json({ annotation }, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

async function handleDelete(req: NextRequest): Promise<Response> {
  const parsed = await readBody(req);
  if (parsed instanceof Response) return parsed;
  try {
    await deleteAnnotationCore(
      parsed.projectId,
      parsed.resourceId,
      annotationIdOf(parsed.fields),
    );
    return NextResponse.json({}, { status: 200 });
  } catch (error) {
    return mapCoreError(error);
  }
}

export const GET = withStorageContext(handleGet);
export const POST = withStorageContext(handlePost);
export const PUT = withStorageContext(handlePut);
export const PATCH = withStorageContext(handlePatch);
export const DELETE = withStorageContext(handleDelete);

export const dynamic = "force-dynamic";
