import type { AnyResource, Folder, TipTapDocument } from "../models/types";
import { createTransport } from "../../store/transport/create-transport";
import {
  PatchRevisionContentResponseSchema,
  ResourceContentResponseSansTipTapSchema,
  ResourceContentResponseSchema,
  ResourceResponseSchema,
  ResourceRevisionContentResponseSchema,
} from "./schemas";
import { reportTransportValidationFailure } from "./transport-validation";
import type { WritingLogSignal } from "../models/revision-core";
import { reportWritingLogSignal } from "../writing-log-signal";

/** Result of a canonical content patch; `writingLog` is set only on trouble. */
export interface PatchRevisionContentResult {
  updatedAt?: string;
  snapshotCreated?: boolean;
  writingLog?: WritingLogSignal;
}

/**
 * Computes the id of `folderId` plus every folder/resource nested beneath it
 * (transitively), given a project's already-loaded flat `folders`/`resources`
 * arrays. Pure and client-side — no filesystem or network access — so
 * `handleResourceAction`'s `"delete"` branch (`app/(app)/page.tsx`) can use
 * it to remove a whole deleted folder subtree from local + Redux state in
 * one pass, matching what `softDeleteFolder` does on disk (Feature 26
 * trash-ui, FR-3, Task 13).
 */
export function collectFolderDescendantIds(
  folders: Folder[],
  resources: AnyResource[],
  folderId: string,
): Set<string> {
  const idsToRemove = new Set<string>([folderId]);
  let didAddId = true;
  while (didAddId) {
    didAddId = false;
    for (const f of folders) {
      const parentId = f.parentId ?? null;
      if (parentId && idsToRemove.has(parentId) && !idsToRemove.has(f.id)) {
        idsToRemove.add(f.id);
        didAddId = true;
      }
    }
    for (const r of resources) {
      const parentId = r.folderId ?? null;
      if (parentId && idsToRemove.has(parentId) && !idsToRemove.has(r.id)) {
        idsToRemove.add(r.id);
        didAddId = true;
      }
    }
  }
  return idsToRemove;
}

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

/** Plain-argument input for the transport's `uploadMedia` method. */
export interface UploadMediaResourceOpts {
  title?: string;
  folderId?: string;
}

// ---------------------------------------------------------------------------
// Transport collapse (ADR-021 Phase 2, Task 3)
//
// One ResourcesTransport contract with two implementations selected by the
// build-time runtime, mirroring lib/api/projects.ts:
//
// - Web/hosted/desktop -> httpResourcesTransport, which carries the original
//   `fetch(...)` calls byte-for-byte (including `uploadMedia`'s multipart
//   `FormData` construction — only the native path skips multipart).
// - Native (Capacitor) -> an in-process backend
//   (`../../store/transport/native-resource-backend`), dynamically imported
//   only when `runtime === "native"`, reusing the shared resource CRUD core
//   (`../models/resource-crud-core.ts`) plus the already-lifted revision
//   core (`../models/revision-core.ts`) instead of HTTP.
//
// `createTransport` centralizes the runtime branch and dispatch (see
// `../../store/transport/create-transport`).
// ---------------------------------------------------------------------------

/**
 * The resource-route-backed operations both platforms implement. Shared with
 * `../../store/transport/native-resource-backend`, which imports this type
 * rather than duplicating it.
 */
export interface ResourcesTransport {
  /** Creates a new resource in a project. */
  create(
    projectId: string,
    resourceData: Record<string, unknown>,
  ): Promise<{ resource: AnyResource }>;
  /**
   * Uploads a media (image/audio) resource from already-extracted bytes and
   * fields — never a `File`/`FormData`, since native has no multipart
   * request to build.
   */
  uploadMedia(
    projectId: string,
    input: {
      fileBytes: Uint8Array;
      fileName: string;
      mimeType?: string;
      fileSize: number;
      title?: string;
      folderId?: string;
    },
  ): Promise<{ resource: AnyResource }>;
  /** Copies a resource under a new name within the same project. */
  copy(
    resourceId: string,
    newName: string,
    projectId: string,
  ): Promise<{ resource: AnyResource }>;
  /** Deletes (soft-deletes) a resource. */
  remove(resourceId: string, projectId: string): Promise<void>;
  /** Deletes (soft-deletes) a folder and its entire descendant subtree. */
  deleteFolder(folderId: string, projectId: string): Promise<void>;
  /**
   * Persists an updated sidecar (metadata) file for a resource.
   *
   * `clearKeys`, when provided, names sidecar keys to delete from the merged
   * result after the update, validated server-side (or in-process on native)
   * against a fail-closed allowlist — see
   * `resource-crud-core.ts`'s `updateSidecarCore`.
   */
  updateSidecar(
    resourceId: string,
    projectId: string,
    updatedResource: AnyResource,
    clearKeys?: string[],
  ): Promise<void>;
  /** Renames a resource or folder. */
  rename(
    resourceId: string,
    projectId: string,
    newName: string,
    resourceType: "folder" | "resource",
  ): Promise<boolean>;
  /** Fetches a resource's content plus its revision list. */
  fetchContent(
    projectId: string,
    resourceId: string,
  ): Promise<ResourceContentResponse | null>;
  /** Fetches a single revision's preview content. */
  fetchRevisionContent(
    resourceId: string,
    projectId: string,
    revisionId: string,
  ): Promise<string | null>;
  /**
   * Persists new content for an existing revision.
   *
   * `updatedAt` is optional in the resolved result: on the HTTP transport, a
   * malformed response body is reported (never thrown) since the underlying
   * save already succeeded server-side by the time the body is parsed — see
   * `httpResourcesTransport.patchRevisionContent`'s doc comment.
   */
  patchRevisionContent(
    resourceId: string,
    projectId: string,
    revisionId: string,
    content: string,
  ): Promise<PatchRevisionContentResult>;
  /** Persists a folder/resource reorder for a project. */
  reorder(
    projectId: string,
    payload: ReorderPayload,
    projectRoot?: string,
  ): Promise<void>;
}

/**
 * HTTP transport — the hosted/desktop path. Every method body below is the
 * original public function's `fetch` call verbatim; preserving it exactly is
 * what keeps the server build unchanged.
 */
export const httpResourcesTransport: ResourcesTransport = {
  async create(projectId, resourceData) {
    const response = await fetch("/api/resource", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceData, projectId }),
    });
    const body: unknown = await response.json();
    const result = ResourceResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure("resources.create", result.error.issues);
      throw new Error("Invalid response from resource create");
    }
    return { resource: result.data.resource as AnyResource };
  },

  async uploadMedia(projectId, input) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(input.fileBytes)], { type: input.mimeType }),
      input.fileName,
    );
    form.append("projectId", projectId);
    if (input.title) form.append("title", input.title);
    if (input.folderId) form.append("folderId", input.folderId);

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
    const body: unknown = await response.json();
    const result = ResourceResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure(
        "resources.uploadMedia",
        result.error.issues,
      );
      throw new Error("Invalid response from resource upload");
    }
    return { resource: result.data.resource as AnyResource };
  },

  async copy(resourceId, newName, projectId) {
    const response = await fetch(`/api/resource/${resourceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "copy", newName, projectId }),
    });
    const body: unknown = await response.json();
    const result = ResourceResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure("resources.copy", result.error.issues);
      throw new Error("Invalid response from resource copy");
    }
    return { resource: result.data.resource as AnyResource };
  },

  async remove(resourceId, projectId) {
    const response = await fetch(`/api/resource/${resourceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", projectId }),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete resource (${response.status})`);
    }
  },

  async deleteFolder(folderId, projectId) {
    const response = await fetch(`/api/folder/${folderId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete folder (${response.status})`);
    }
  },

  async updateSidecar(resourceId, projectId, updatedResource, clearKeys) {
    await fetch(`/api/resource/${resourceId}/sidecar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        clearKeys !== undefined
          ? { projectId, updatedResource, clearKeys }
          : { projectId, updatedResource },
      ),
    });
  },

  async rename(resourceId, projectId, newName, resourceType) {
    const response = await fetch(`/api/resource/${resourceId}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, newName, resourceType }),
    });
    return response.ok;
  },

  async fetchContent(projectId, resourceId) {
    const response = await fetch("/api/project-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, resourceId }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const result = ResourceContentResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure(
        "resources.fetchContent",
        result.error.issues,
      );
      // An unusable `tipTapContent` must not discard the rest of the body.
      // `useRevisionContent` returns early on a null result, so it never
      // reaches the canonical revision — the authoritative source of the
      // document — and renders a blank editor whose first keystroke autosaves
      // over the real content. Every project-type seeded resource hit this,
      // because `content.tiptap.json` was written as `{}`. Salvage the fields
      // that did validate and report `tipTapContent` as absent; the failure is
      // still reported above, so this degrades without going silent.
      const salvaged = ResourceContentResponseSansTipTapSchema.safeParse(body);
      if (!salvaged.success) return null;
      return {
        ...salvaged.data,
        resourceContent: {
          ...salvaged.data.resourceContent,
          tipTapContent: null,
        },
      } as ResourceContentResponse;
    }
    return result.data as ResourceContentResponse;
  },

  async fetchRevisionContent(resourceId, projectId, revisionId) {
    const params = new URLSearchParams({ projectId, revisionId });
    const response = await fetch(
      `/api/resource/revision/${resourceId}?${params.toString()}`,
    );
    if (!response.ok) return null;
    const body = await response.json();
    const result = ResourceRevisionContentResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure(
        "resources.fetchRevisionContent",
        result.error.issues,
      );
      return null;
    }
    return typeof result.data.content === "string" ? result.data.content : null;
  },

  /**
   * The save already succeeded server-side (HTTP 200, content persisted) by
   * the time this parses the body, so a malformed body must not be promoted
   * to a throw here — unlike `compile`/`export`, throwing would falsely tell
   * the writer their save failed. On a validation failure this reports and
   * resolves with `{ updatedAt: undefined }` rather than throwing or
   * substituting a synthesized timestamp; callers (`useCanonicalAutosave.ts`)
   * already treat an absent `updatedAt` as "skip the resource-tree update."
   */
  async patchRevisionContent(resourceId, projectId, revisionId, content) {
    const response = await fetch(`/api/resource/revision/${resourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, revisionId, content }),
    });
    if (!response.ok) {
      throw new Error(`Failed to persist revision (${response.status})`);
    }
    const body: unknown = await response.json();
    const result = PatchRevisionContentResponseSchema.safeParse(body);
    if (!result.success) {
      reportTransportValidationFailure(
        "resources.patchRevisionContent",
        result.error.issues,
      );
      return { updatedAt: undefined };
    }
    return {
      updatedAt: result.data.updatedAt,
      snapshotCreated: result.data.snapshotCreated,
      writingLog: result.data.writingLog,
    };
  },

  async reorder(projectId, payload, projectRoot) {
    await fetch(`/api/projects/${projectId}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectRoot ? { ...payload, projectRoot } : payload),
    });
  },
};

/**
 * Resolves the transport for the active runtime. On native, the in-process
 * backend is imported lazily so it forms its own chunk and never enters the
 * web bundle's module graph. The thunk carries the literal
 * `import("../../store/transport/native-resource-backend")` specifier so
 * Turbopack's `resolveAlias` (`next.config.mjs`) can substitute a
 * `node:*`-free web-stub for it at build time.
 */
export const resolveResourcesTransport: () => Promise<ResourcesTransport> =
  createTransport(httpResourcesTransport, () =>
    import("../../store/transport/native-resource-backend").then(
      ({ createNativeResourcesTransport }) => createNativeResourcesTransport(),
    ),
  );

/**
 * Creates a new resource in a project.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/resource` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function createResource(
  projectId: string,
  resourceData: Record<string, unknown>,
): Promise<{ resource: AnyResource }> {
  const transport = await resolveResourcesTransport();
  return transport.create(projectId, resourceData);
}

/**
 * Uploads a media file (image/audio) as a new resource.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/resource/upload` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function uploadMediaResource(
  projectId: string,
  file: File,
  opts?: UploadMediaResourceOpts,
): Promise<{ resource: AnyResource }> {
  const transport = await resolveResourcesTransport();
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  return transport.uploadMedia(projectId, {
    fileBytes,
    fileName: file.name,
    mimeType: file.type || undefined,
    fileSize: file.size,
    title: opts?.title,
    folderId: opts?.folderId,
  });
}

/**
 * Copies a resource under a new name within the same project.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/resource/[resource-id]` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function copyResource(
  resourceId: string,
  newName: string,
  projectId: string,
): Promise<{ resource: AnyResource }> {
  const transport = await resolveResourcesTransport();
  return transport.copy(resourceId, newName, projectId);
}

/**
 * Deletes (soft-deletes) a resource.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/resource/[resource-id]` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function deleteResource(
  resourceId: string,
  projectId: string,
): Promise<void> {
  const transport = await resolveResourcesTransport();
  await transport.remove(resourceId, projectId);
}

/**
 * Deletes (soft-deletes) a folder and its entire descendant subtree.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/folder/[folder-id]/delete` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 *
 * As of Trash UI follow-ups Task 3, this is part of the
 * `ResourcesTransport`/`createTransport` collapse like every other function
 * in this file — it resolves through {@link resolveResourcesTransport}
 * rather than POSTing directly via `fetch`.
 */
export async function deleteFolder(
  folderId: string,
  projectId: string,
): Promise<void> {
  const transport = await resolveResourcesTransport();
  await transport.deleteFolder(folderId, projectId);
}

/**
 * Persists an updated sidecar (metadata) file for a resource.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/resource/[resource-id]/sidecar` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 *
 * `clearKeys`, when provided, names sidecar keys to delete after the merge —
 * see {@link ResourcesTransport.updateSidecar}.
 */
export async function updateSidecar(
  resourceId: string,
  projectId: string,
  updatedResource: AnyResource,
  clearKeys?: string[],
): Promise<void> {
  const transport = await resolveResourcesTransport();
  await transport.updateSidecar(
    resourceId,
    projectId,
    updatedResource,
    clearKeys,
  );
}

/**
 * Renames a resource or folder.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/resource/[resource-id]/rename` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function renameResource(
  resourceId: string,
  projectId: string,
  newName: string,
  resourceType: "folder" | "resource",
): Promise<boolean> {
  const transport = await resolveResourcesTransport();
  return transport.rename(resourceId, projectId, newName, resourceType);
}

/**
 * Fetches a resource's content plus its revision list.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), not
 * `StoredProject.id` — `/api/project-resources` resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 *
 * The original `!response.ok -> null` degrade-gracefully contract is
 * preserved by `httpResourcesTransport.fetchContent` verbatim; the try/catch
 * here additionally covers a `fetch()` call that throws outright (e.g. a
 * network error), which — like a non-ok response — should surface as `null`
 * to callers rather than an unhandled rejection.
 */
export async function fetchResourceContent(
  projectId: string,
  resourceId: string,
): Promise<ResourceContentResponse | null> {
  try {
    const transport = await resolveResourcesTransport();
    return await transport.fetchContent(projectId, resourceId);
  } catch {
    return null;
  }
}

/**
 * Fetches a single revision's preview content.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`) — the
 * `/api/resource/revision/[resource-id]` GET handler resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 *
 * See {@link fetchResourceContent}'s doc comment for why a thrown `fetch()`
 * error is also treated as a `null` result here.
 */
export async function fetchRevisionContent(
  resourceId: string,
  projectId: string,
  revisionId: string,
): Promise<string | null> {
  try {
    const transport = await resolveResourcesTransport();
    return await transport.fetchRevisionContent(
      resourceId,
      projectId,
      revisionId,
    );
  } catch {
    return null;
  }
}

/**
 * Persists new content for an existing revision.
 *
 * `projectId` must be the project's on-disk directory basename (see
 * `selectActiveProjectDirectoryId` in `projectsSlice.ts`) — the
 * `/api/resource/revision/[resource-id]` PATCH handler resolves it via
 * `resolveProjectsDir()/<projectId>` (ADR-017/018 tenant-route migration).
 */
export async function patchRevisionContent(
  resourceId: string,
  projectId: string,
  revisionId: string,
  content: string,
): Promise<PatchRevisionContentResult> {
  const transport = await resolveResourcesTransport();
  const result = await transport.patchRevisionContent(
    resourceId,
    projectId,
    revisionId,
    content,
  );
  // Single choke point shared by the HTTP and native transports (FR-5).
  reportWritingLogSignal(result.writingLog);
  return result;
}

/**
 * Persists a folder/resource reorder for a project.
 *
 * `projectId` (the URL segment) must be the project's on-disk directory
 * basename — see `selectActiveProjectDirectoryId` in `projectsSlice.ts`.
 * `projectRoot`, when provided, is also sent in the body: the
 * `/api/projects/[projectId]/reorder` route predates the ADR-017/018
 * tenant-route migration and still resolves the project via
 * `body.projectRoot ?? findProjectRoot(...)` (a legacy fallback that scans
 * every project directory and matches on project.json's *internal* `id`,
 * not the directory basename). Sending `projectRoot` directly makes
 * resolution exact regardless of that legacy fallback's matching semantics.
 */
export async function reorderResources(
  projectId: string,
  payload: ReorderPayload,
  projectRoot?: string,
): Promise<void> {
  const transport = await resolveResourcesTransport();
  await transport.reorder(projectId, payload, projectRoot);
}
