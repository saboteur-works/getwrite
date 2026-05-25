import type { SavedQuery } from "../lib/models/saved-queries";
import type { QueryAST } from "../lib/models/query-ast";
import type { RootState } from "./store";

export interface QueryRequestContext {
  projectId: string;
  projectPath: string;
}

/**
 * Resolves selected project context needed for query requests.
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

  const project = state.projects.projects[selectedProjectId];
  if (!project?.rootPath) {
    return { error: "Selected project is missing a root path." };
  }

  return { projectId: selectedProjectId, projectPath: project.rootPath };
}

function getApiErrorMessage(errorBody: unknown, fallback: string): string {
  if (
    errorBody &&
    typeof errorBody === "object" &&
    "error" in errorBody &&
    typeof (errorBody as { error?: unknown }).error === "string"
  ) {
    return (errorBody as { error: string }).error;
  }
  return fallback;
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
export async function fetchSavedQueryList(
  context: QueryRequestContext,
): Promise<ListQueriesResponse> {
  const response = await fetch("/api/project/query/saved", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list", projectPath: context.projectPath }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(
      getApiErrorMessage(errorBody, "Unable to load saved queries."),
    );
  }

  return (await response.json()) as ListQueriesResponse;
}

/**
 * Write (create or overwrite) a saved query.
 */
export async function persistSavedQuery(
  context: QueryRequestContext,
  query: SavedQuery,
): Promise<WriteQueryResponse> {
  const response = await fetch("/api/project/query/saved", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "write",
      projectPath: context.projectPath,
      query,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(getApiErrorMessage(errorBody, "Failed to save query."));
  }

  return (await response.json()) as WriteQueryResponse;
}

/**
 * Delete a saved query by id.
 */
export async function removeSavedQuery(
  context: QueryRequestContext,
  id: string,
): Promise<void> {
  const response = await fetch("/api/project/query/saved", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "delete",
      projectPath: context.projectPath,
      id,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(getApiErrorMessage(errorBody, "Failed to delete query."));
  }
}

/**
 * Evaluate a query AST inline and return matching resource IDs.
 */
export async function evaluateQueryAst(
  context: QueryRequestContext,
  definition: QueryAST,
): Promise<EvaluateQueryResponse> {
  const response = await fetch("/api/project/query/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath: context.projectPath, definition }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(getApiErrorMessage(errorBody, "Query evaluation failed."));
  }

  return (await response.json()) as EvaluateQueryResponse;
}
