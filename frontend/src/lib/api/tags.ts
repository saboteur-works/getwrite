import type { Tag } from "../models/types";

export async function listTags(projectPath: string): Promise<Tag[]> {
  const response = await fetch("/api/project/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list", projectPath }),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { tags?: Tag[] };
  return data.tags ?? [];
}

export async function listTagAssignments(
  projectPath: string,
  resourceId: string,
): Promise<string[]> {
  const response = await fetch("/api/project/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "assignments", projectPath, resourceId }),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { tagIds?: string[] };
  return data.tagIds ?? [];
}

export async function createTag(
  projectPath: string,
  name: string,
  color?: string,
): Promise<void> {
  await fetch("/api/project/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", projectPath, name, color }),
  });
}

export async function deleteTag(
  projectPath: string,
  tagId: string,
): Promise<void> {
  await fetch("/api/project/tags/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, tagId }),
  });
}

export async function assignTag(
  projectPath: string,
  resourceId: string,
  tagId: string,
  assign: boolean,
): Promise<void> {
  await fetch("/api/project/tags/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, resourceId, tagId, assign }),
  });
}
