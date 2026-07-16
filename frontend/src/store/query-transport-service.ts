import type { SavedQuery } from "../lib/models/saved-queries";
import type { QueryAST } from "../lib/models/query-ast";
import { selectActiveProjectDirectoryId } from "./projectsSlice";
import type { RootState } from "./store";

export interface QueryRequestContext {
  projectId: string;
}

/**
 * Resolves selected project context needed for query requests.
 *
 * `expectedProjectId` is the Redux-internal `selectedProjectId` (mirrored
 * from `project.json`'s `id` field) — it is used only to guard against a
 * project switch racing an in-flight request, never sent to the API. The
 * `projectId` returned in the context is the active project's on-disk
 * directory basename (via {@link selectActiveProjectDirectoryId}), which is
 * what every tenant-scoped query route (ADR-017/018) actually expects. Per
 * FR12, a project's on-disk directory name and its `project.json` `id` are
 * two independently generated UUIDs — sending the wrong one is a silent
 * failure, not an auth error.
 */
export function resolveQueryRequestContext(
  state: RootState,
  expectedProjectId: string,
): QueryRequestContext | { error: string } {
  const { selectedProjectId } = state.projects;

  if (!selectedProjectId) {
    return { error: "No project selected." };
  }

  if (selectedProjectId !== expectedProjectId) {
    return { error: "Project changed before operation completed." };
  }

  const projectId = selectActiveProjectDirectoryId(state);
  if (!projectId) {
    return { error: "Selected project is missing a root path." };
  }

  return { projectId };
}

async function postJson<T>(
  url: string,
  body: unknown,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      errorBody &&
      typeof errorBody === "object" &&
      "error" in errorBody &&
      typeof (errorBody as { error?: unknown }).error === "string"
        ? (errorBody as { error: string }).error
        : fallbackError;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

interface ListQueriesResponse {
  queries: SavedQuery[];
}

interface WriteQueryResponse {
  query: SavedQuery;
}

interface EvaluateQueryResponse {
  ids: string[];
}

/**
 * Fetch all saved queries for a project.
 */
export function fetchSavedQueryList(
  context: QueryRequestContext,
): Promise<ListQueriesResponse> {
  return postJson(
    "/api/project/query/saved",
    { action: "list", projectId: context.projectId },
    "Unable to load saved queries.",
  );
}

/**
 * Write (create or overwrite) a saved query.
 */
export function persistSavedQuery(
  context: QueryRequestContext,
  query: SavedQuery,
): Promise<WriteQueryResponse> {
  return postJson(
    "/api/project/query/saved",
    { action: "write", projectId: context.projectId, query },
    "Failed to save query.",
  );
}

/**
 * Delete a saved query by id.
 */
export function removeSavedQuery(
  context: QueryRequestContext,
  id: string,
): Promise<void> {
  return postJson(
    "/api/project/query/saved",
    { action: "delete", projectId: context.projectId, id },
    "Failed to delete query.",
  );
}

/**
 * Evaluate a query AST inline and return matching resource IDs.
 */
export function evaluateQueryAst(
  context: QueryRequestContext,
  definition: QueryAST,
): Promise<EvaluateQueryResponse> {
  return postJson(
    "/api/project/query/evaluate",
    { projectId: context.projectId, definition },
    "Query evaluation failed.",
  );
}
