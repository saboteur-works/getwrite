import type { Tag } from "../models/types";

/**
 * Fetches all project-level tags.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function listTags(projectId: string): Promise<Tag[]> {
  const response = await fetch("/api/project/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list", projectId }),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { tags?: Tag[] };
  return data.tags ?? [];
}

/**
 * Fetches the tag ids assigned to a given resource.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function listTagAssignments(
  projectId: string,
  resourceId: string,
): Promise<string[]> {
  const response = await fetch("/api/project/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "assignments", projectId, resourceId }),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { tagIds?: string[] };
  return data.tagIds ?? [];
}

/**
 * Creates a new project-level tag.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function createTag(
  projectId: string,
  name: string,
  color?: string,
): Promise<void> {
  await fetch("/api/project/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", projectId, name, color }),
  });
}

/**
 * Deletes a project-level tag.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags/delete` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function deleteTag(
  projectId: string,
  tagId: string,
): Promise<void> {
  await fetch("/api/project/tags/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, tagId }),
  });
}

/**
 * Assigns or unassigns a tag to/from a resource.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project/tags/assign` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function assignTag(
  projectId: string,
  resourceId: string,
  tagId: string,
  assign: boolean,
): Promise<void> {
  await fetch("/api/project/tags/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, resourceId, tagId, assign }),
  });
}
