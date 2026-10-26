/**
 * Pure guard functions for the spelling slice: they decide whether a
 * response still belongs to the project the slice is about, so a late
 * response for a previous project never overwrites the current one.
 */

/**
 * Returns `true` when a response for `responseProjectId` must be ignored
 * because the slice has since been pointed at a different project.
 *
 * @param requestedProjectId - The project the slice most recently requested.
 * @param responseProjectId - The project the response was fetched for.
 */
export function isStaleSpellingResponse(
  requestedProjectId: string | null,
  responseProjectId: string,
): boolean {
  return requestedProjectId !== responseProjectId;
}
