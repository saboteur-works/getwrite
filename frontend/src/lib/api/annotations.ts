/**
 * @module api/annotations
 *
 * Client transport for a text resource's annotations (Feature 101, FR-22).
 * HTTP on web/desktop, an in-process backend (`native-annotations-backend`) on
 * native.
 *
 * Failure contract: every method rejects on a network error, a non-2xx status
 * (the server's refusal message is the error message) or a malformed body
 * (reported through `reportTransportValidationFailure`, which never receives
 * the body). `listAnnotations` never resolves an empty list for a failed
 * read: an empty array means the resource has no annotations.
 */
import { z } from "zod";
import { createTransport } from "../../store/transport/create-transport";
import type {
  Annotation,
  AnnotationTarget,
  ClaimMarker,
} from "../models/types";
import { AnnotationResponseSchema } from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

export type { Annotation };

/** The fields a client supplies when adding an annotation. */
export interface NewAnnotation {
  id: string;
  body: string;
  quote: string;
  target?: AnnotationTarget;
  /** Feature 108: carried by paste so a claim keeps its status and date. */
  claim?: ClaimMarker;
}

/** The annotation operations both platforms implement. */
export interface AnnotationsTransport {
  list(projectId: string, resourceId: string): Promise<Annotation[]>;
  add(
    projectId: string,
    resourceId: string,
    annotation: NewAnnotation,
  ): Promise<Annotation>;
  update(
    projectId: string,
    resourceId: string,
    annotationId: string,
    body: string,
  ): Promise<Annotation>;
  /** Replaces the quote only (re-attach); body and createdAt are kept. */
  reattach(
    projectId: string,
    resourceId: string,
    annotationId: string,
    quote: string,
  ): Promise<Annotation>;
  remove(
    projectId: string,
    resourceId: string,
    annotationId: string,
  ): Promise<void>;
}

const ListResponseSchema = z.object({
  annotations: z.array(AnnotationResponseSchema),
});
const OneResponseSchema = z.object({ annotation: AnnotationResponseSchema });

const ENDPOINT = "/api/annotations";

async function errorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

async function send(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  payload: Record<string, unknown>,
  fallback: string,
): Promise<Response> {
  const response = await fetch(ENDPOINT, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(
      await errorMessage(response, `${fallback} (HTTP ${response.status}).`),
    );
  }
  return response;
}

async function parseOne(
  response: Response,
  callSite: string,
): Promise<Annotation> {
  const parsed = OneResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    reportTransportValidationFailure(callSite, parsed.error.issues);
    throw new Error("The annotation response was malformed.");
  }
  return parsed.data.annotation as Annotation;
}

/** HTTP transport: the hosted/desktop path. */
export const httpAnnotationsTransport: AnnotationsTransport = {
  async list(projectId, resourceId) {
    const response = await fetch(
      `${ENDPOINT}?projectId=${encodeURIComponent(projectId)}&resourceId=${encodeURIComponent(resourceId)}`,
    );
    if (!response.ok) {
      throw new Error(
        await errorMessage(
          response,
          `Failed to read the annotations (HTTP ${response.status}).`,
        ),
      );
    }
    const parsed = ListResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      reportTransportValidationFailure(
        "annotations.listAnnotations",
        parsed.error.issues,
      );
      throw new Error("The annotations response was malformed.");
    }
    return parsed.data.annotations as Annotation[];
  },
  async add(projectId, resourceId, annotation) {
    const response = await send(
      "POST",
      { projectId, resourceId, annotation },
      "Failed to add the annotation",
    );
    return parseOne(response, "annotations.addAnnotation");
  },
  async update(projectId, resourceId, annotationId, body) {
    const response = await send(
      "PUT",
      { projectId, resourceId, annotationId, body },
      "Failed to update the annotation",
    );
    return parseOne(response, "annotations.updateAnnotation");
  },
  async reattach(projectId, resourceId, annotationId, quote) {
    const response = await send(
      "PATCH",
      { projectId, resourceId, annotationId, quote },
      "Failed to re-attach the annotation",
    );
    return parseOne(response, "annotations.reattachAnnotation");
  },
  async remove(projectId, resourceId, annotationId) {
    await send(
      "DELETE",
      { projectId, resourceId, annotationId },
      "Failed to delete the annotation",
    );
  },
};

/**
 * The thunk carries the literal `import(...)` specifier so
 * `next.config.mjs`'s `turbopack.resolveAlias` can substitute a `node:*`-free
 * web-stub at build time.
 */
const resolveAnnotationsTransport: () => Promise<AnnotationsTransport> =
  createTransport(httpAnnotationsTransport, () =>
    import("../../store/transport/native-annotations-backend").then(
      ({ createNativeAnnotationsTransport }) =>
        createNativeAnnotationsTransport(),
    ),
  );

/** Lists a resource's annotations; rejects on any failure. */
export async function listAnnotations(
  projectId: string,
  resourceId: string,
): Promise<Annotation[]> {
  return (await resolveAnnotationsTransport()).list(projectId, resourceId);
}

/** Adds an annotation; resolves the stored annotation. */
export async function addAnnotation(
  projectId: string,
  resourceId: string,
  annotation: NewAnnotation,
): Promise<Annotation> {
  return (await resolveAnnotationsTransport()).add(
    projectId,
    resourceId,
    annotation,
  );
}

/** Replaces an annotation's body; resolves the stored annotation. */
export async function updateAnnotation(
  projectId: string,
  resourceId: string,
  annotationId: string,
  body: string,
): Promise<Annotation> {
  return (await resolveAnnotationsTransport()).update(
    projectId,
    resourceId,
    annotationId,
    body,
  );
}

/** Replaces an annotation's quote (re-attach); resolves the stored annotation. */
export async function reattachAnnotation(
  projectId: string,
  resourceId: string,
  annotationId: string,
  quote: string,
): Promise<Annotation> {
  return (await resolveAnnotationsTransport()).reattach(
    projectId,
    resourceId,
    annotationId,
    quote,
  );
}

/** Deletes an annotation from the sidecar. */
export async function deleteAnnotation(
  projectId: string,
  resourceId: string,
  annotationId: string,
): Promise<void> {
  return (await resolveAnnotationsTransport()).remove(
    projectId,
    resourceId,
    annotationId,
  );
}
