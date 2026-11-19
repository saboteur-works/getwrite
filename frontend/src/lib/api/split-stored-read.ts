/**
 * @module api/split-stored-read
 *
 * The reads the split surfaces make of a document's stored canonical text
 * (Feature 120, FR-14). `fetchResourceContent` and `fetchRevisionContent` in
 * `./resources.ts` resolve `null` for every non-ok response, so a locked
 * project (HTTP 401 or 409) reads as "could not be read". These two reads
 * are the same requests with one difference: a locked response is rethrown as
 * the locked-access error (`./locked-response.ts`) so the caller can offer the
 * unlock prompt. Every other failure (a thrown fetch, another non-ok status,
 * a malformed body) still resolves `null`, as for the shared reads. HTTP only,
 * like the rest of the split client.
 */
import { lockedAccessErrorFromResponse } from "./locked-response";
import {
  ResourceContentResponseSansTipTapSchema,
  ResourceRevisionContentResponseSchema,
} from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";

/** The revision list of a document, which is all the split needs of its content response. */
export interface SplitResourceRevisions {
  revisions?: Array<{ id: string; isCanonical: boolean }>;
}

async function send(
  projectId: string,
  request: () => Promise<Response>,
): Promise<Response | null> {
  let response: Response;
  try {
    response = await request();
  } catch {
    return null;
  }
  if (!response.ok) {
    const locked = lockedAccessErrorFromResponse(response, projectId);
    if (locked) throw locked;
    return null;
  }
  return response;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** @returns The document's revision list, or `null` when it cannot be read; throws the locked-access error for a locked project. */
export async function fetchSplitResourceContent(
  projectId: string,
  resourceId: string,
): Promise<SplitResourceRevisions | null> {
  const response = await send(projectId, () =>
    fetch("/api/project-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, resourceId }),
    }),
  );
  if (!response) return null;
  const parsed = ResourceContentResponseSansTipTapSchema.safeParse(
    await readBody(response),
  );
  if (!parsed.success) {
    reportTransportValidationFailure(
      "split.fetchResourceContent",
      parsed.error.issues,
    );
    return null;
  }
  return { revisions: parsed.data.revisions };
}

/** @returns One revision's stored text, or `null` when it cannot be read; throws the locked-access error for a locked project. */
export async function fetchSplitRevisionContent(
  resourceId: string,
  projectId: string,
  revisionId: string,
): Promise<string | null> {
  const params = new URLSearchParams({ projectId, revisionId });
  const response = await send(projectId, () =>
    fetch(`/api/resource/revision/${resourceId}?${params.toString()}`),
  );
  if (!response) return null;
  const parsed = ResourceRevisionContentResponseSchema.safeParse(
    await readBody(response),
  );
  if (!parsed.success) {
    reportTransportValidationFailure(
      "split.fetchRevisionContent",
      parsed.error.issues,
    );
    return null;
  }
  return typeof parsed.data.content === "string" ? parsed.data.content : null;
}
