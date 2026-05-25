/**
 * Pure guard functions for the `queries` slice.
 */

/**
 * Returns `true` when a query operation targets a project that is no longer
 * the active project in the slice — indicating the response should be
 * discarded to prevent stale data from overwriting current state.
 */
export function isStaleQueryResponse(
  currentProjectId: string | null,
  responseProjectId: string,
): boolean {
  return currentProjectId !== null && currentProjectId !== responseProjectId;
}
