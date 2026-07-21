/**
 * @module api/resource-excerpts
 *
 * Client transport for fetching short text excerpts for a bounded set of
 * resources (the cards visible in one Organizer folder). Degrades gracefully:
 * any failure yields an empty map, so cards simply show no excerpt body.
 */

/**
 * Fetches text excerpts for the given resources.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project-resources/excerpts` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 *
 * @param projectId - The project's on-disk directory basename.
 * @param resourceIds - Resource ids to fetch excerpts for.
 * @param maxChars - Maximum excerpt length to request.
 * @returns A map of resource id → excerpt (only resources that had content).
 */
export async function fetchResourceExcerpts(
  projectId: string,
  resourceIds: string[],
  maxChars?: number,
): Promise<Record<string, string>> {
  try {
    const response = await fetch("/api/project-resources/excerpts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, resourceIds, maxChars }),
    });
    if (!response.ok) return {};
    const data = (await response.json()) as {
      excerpts?: Record<string, string>;
    };
    return data.excerpts ?? {};
  } catch {
    return {};
  }
}
