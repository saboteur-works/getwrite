import type { Revision } from "../lib/models/types";
import { selectActiveProjectDirectoryId } from "./projectsSlice";
import type { RootState } from "./store";

/**
 * Response shape for `/api/project-resources` used by revision list loading.
 */
interface ProjectResourcesResponse {
  revisions?: unknown;
}

/**
 * Response shape for fetching a single revision preview.
 */
interface RevisionContentResponse {
  revision: Revision;
  content: string;
}

export interface RevisionRequestContext {
  projectId: string;
  resourceId: string;
}

/**
 * Resolves selected resource/project context needed for revision requests.
 *
 * `projectId` is the active project's on-disk directory basename (via
 * {@link selectActiveProjectDirectoryId}), never `project.id`. A project's
 * on-disk directory name and its `project.json`'s internal `id` field are
 * two independently generated UUIDs and are not guaranteed to match — every
 * tenant-scoped revision route (ADR-017/018) requires the directory
 * basename.
 */
export function resolveRevisionRequestContext(
  state: RootState,
  expectedResourceId: string,
): RevisionRequestContext | { error: string } {
  const selectedResourceId = state.resources.selectedResourceId;

  if (!selectedResourceId || selectedResourceId !== expectedResourceId) {
    return { error: "Selected resource changed before revisions updated." };
  }

  const projectId = selectActiveProjectDirectoryId(state);

  if (!projectId) {
    return { error: "Selected project is missing a root path." };
  }

  return { projectId, resourceId: selectedResourceId };
}

function getApiErrorMessage(errorBody: unknown, fallback: string): string {
  const msg = (errorBody as Record<string, unknown>)?.error;
  return typeof msg === "string" ? msg : fallback;
}

async function throwApiError(
  response: Response,
  fallback: string,
): Promise<never> {
  const errorBody = await response.json().catch(() => ({}));
  throw new Error(getApiErrorMessage(errorBody, fallback));
}

/**
 * Fetch persisted revisions for a selected resource.
 */
export async function fetchRevisionList(
  context: RevisionRequestContext,
): Promise<ProjectResourcesResponse> {
  const response = await fetch("/api/project-resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: context.projectId,
      resourceId: context.resourceId,
    }),
  });

  if (!response.ok) await throwApiError(response, "Unable to load revisions.");

  return (await response.json()) as ProjectResourcesResponse;
}

/**
 * Create a new explicit revision for a selected resource.
 */
export async function createRevision(
  context: RevisionRequestContext,
  revisionName: string,
): Promise<Revision> {
  const response = await fetch(`/api/resource/revision/${context.resourceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: context.projectId,
      isCanonical: false,
      metadata: { name: revisionName },
    }),
  });

  if (!response.ok) await throwApiError(response, "Failed to save revision.");

  return (await response.json()) as Revision;
}

/**
 * Delete a revision for a selected resource.
 */
export async function removeRevision(
  context: RevisionRequestContext,
  revisionId: string,
): Promise<void> {
  const response = await fetch(`/api/resource/revision/${context.resourceId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: context.projectId, revisionId }),
  });

  if (!response.ok) await throwApiError(response, "Failed to delete revision.");
}

/**
 * Fetch revision preview content.
 */
export async function fetchRevisionContent(
  context: RevisionRequestContext,
  revisionId: string,
): Promise<RevisionContentResponse> {
  const params = new URLSearchParams({
    projectId: context.projectId,
    revisionId,
  });

  const response = await fetch(
    `/api/resource/revision/${context.resourceId}?${params}`,
  );

  if (!response.ok) await throwApiError(response, "Failed to fetch revision.");

  return (await response.json()) as RevisionContentResponse;
}

/**
 * Persist canonical revision selection.
 */
export async function persistCanonicalRevision(
  context: RevisionRequestContext,
  revisionId: string,
): Promise<void> {
  const response = await fetch(`/api/resource/revision/${context.resourceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: context.projectId, revisionId }),
  });

  if (!response.ok)
    await throwApiError(response, "Failed to set canonical revision.");
}
