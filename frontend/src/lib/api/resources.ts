import type { AnyResource, TipTapDocument } from "../models/types";

export interface ResourceContentResponse {
  resourceContent?: {
    tipTapContent?: TipTapDocument | null;
    plaintextContent?: string | null;
  };
  revisions?: Array<{ id: string; isCanonical: boolean }>;
}

export interface ReorderPayload {
  folderOrder: Array<{
    id: string;
    orderIndex?: number;
    folderId?: string | null;
  }>;
  resourceOrder: Array<{
    id: string;
    orderIndex?: number;
    folderId?: string | null;
  }>;
}

export async function createResource(
  projectPath: string,
  resourceData: Record<string, unknown>,
): Promise<{ resource: AnyResource }> {
  const response = await fetch("/api/resource", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceData, projectPath }),
  });
  return (await response.json()) as { resource: AnyResource };
}

export async function uploadMediaResource(
  projectPath: string,
  file: File,
  opts?: { title?: string; folderId?: string },
): Promise<{ resource: AnyResource }> {
  const form = new FormData();
  form.append("file", file);
  form.append("projectPath", projectPath);
  if (opts?.title) form.append("title", opts.title);
  if (opts?.folderId) form.append("folderId", opts.folderId);

  const response = await fetch("/api/resource/upload", {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(payload.error ?? `Upload failed (${response.status})`);
  }
  return (await response.json()) as { resource: AnyResource };
}

export async function copyResource(
  resourceId: string,
  newName: string,
  projectRoot: string,
): Promise<{ resource: AnyResource }> {
  const response = await fetch(`/api/resource/${resourceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "copy", newName, projectRoot }),
  });
  return (await response.json()) as { resource: AnyResource };
}

export async function deleteResource(
  resourceId: string,
  projectRoot: string,
): Promise<void> {
  await fetch(`/api/resource/${resourceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", projectRoot }),
  });
}

export async function updateSidecar(
  resourceId: string,
  projectRoot: string,
  updatedResource: AnyResource,
): Promise<void> {
  await fetch(`/api/resource/${resourceId}/sidecar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectRoot, updatedResource }),
  });
}

export async function renameResource(
  resourceId: string,
  projectRoot: string,
  newName: string,
  resourceType: "folder" | "resource",
): Promise<boolean> {
  const response = await fetch(`/api/resource/${resourceId}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectRoot, newName, resourceType }),
  });
  return response.ok;
}

export async function fetchResourceContent(
  projectPath: string,
  resourceId: string,
): Promise<ResourceContentResponse | null> {
  const response = await fetch("/api/project-resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, resourceId }),
  });
  if (!response.ok) return null;
  return (await response.json()) as ResourceContentResponse;
}

export async function fetchRevisionContent(
  resourceId: string,
  projectPath: string,
  revisionId: string,
): Promise<string | null> {
  const params = new URLSearchParams({ projectPath, revisionId });
  const response = await fetch(
    `/api/resource/revision/${resourceId}?${params.toString()}`,
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { content?: unknown };
  return typeof payload.content === "string" ? payload.content : null;
}

export async function patchRevisionContent(
  resourceId: string,
  projectPath: string,
  revisionId: string,
  content: string,
): Promise<{ updatedAt: string }> {
  const response = await fetch(`/api/resource/revision/${resourceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectPath, revisionId, content }),
  });
  if (!response.ok) {
    throw new Error(`Failed to persist revision (${response.status})`);
  }
  const data = (await response.json()) as { updatedAt?: string };
  return { updatedAt: data.updatedAt ?? new Date().toISOString() };
}

export async function reorderResources(
  projectId: string,
  payload: ReorderPayload,
): Promise<void> {
  await fetch(`/api/projects/${projectId}/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
