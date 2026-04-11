// This module should be deleted. frontend/stories/CompilePreviewModal.stories.tsx is the only consumer.
// CompilePreviewModal.stories.tsx should be updated to import directly from src/lib/models/types so this can be safely removed without affecting any other code.

import {
    Project as CanonicalProject,
    Folder,
    AnyResource,
    TextResource,
    ResourceType,
    UUID,
} from "../models/types";

/**
 * Lightweight adapter to convert legacy placeholder shapes into canonical models.
 * These helpers are intentionally conservative: they avoid throwing and produce
 * reasonable defaults so callers can incrementally migrate UI code.
 */

function nowIso(): string {
    return new Date().toISOString();
}

function mapLegacyType(type: unknown): ResourceType {
    if (typeof type !== "string") return "text";
    const t = String(type).toLowerCase();
    if (t === "document" || t === "scene" || t === "note") return "text";
    if (t === "image") return "image";
    if (t === "audio") return "audio";
    return "text";
}

/**
 * Convert a legacy resource-like object into a canonical `TextResource`/`AnyResource`.
 * The input type is intentionally loose to avoid importing deprecated type definitions.
 */
export function migrateResource(old: any): AnyResource {
    const id: UUID =
        old?.id ?? old?.resourceId ?? String(Math.random()).slice(2);
    const type = mapLegacyType(old?.type ?? old?.resourceType);
    const base = {
        id,
        slug: old?.slug,
        name: old?.title ?? old?.name ?? "Untitled",
        type,
        folderId: old?.parentId ?? old?.folderId ?? null,
        sizeBytes: old?.sizeBytes,
        notes: old?.notes ?? undefined,
        statuses: old?.statuses ?? undefined,
        userMetadata: old?.userMetadata ?? old?.metadata ?? old?.meta ?? {},
        createdAt: old?.createdAt ?? nowIso(),
        updatedAt: old?.updatedAt ?? undefined,
    } as const;

    if (type === "text") {
        const text: TextResource = {
            ...base,
            type: "text",
            plainText: old?.content ?? old?.plainText ?? undefined,
            tiptap: old?.tiptap ?? undefined,
            wordCount: old?.wordCount,
            charCount: old?.charCount,
            paragraphCount: old?.paragraphCount,
        };
        return text;
    }

    // For non-text resources, provide a minimal ResourceBase with type-specific fields.
    return {
        ...base,
        type: type,
    } as AnyResource;
}

/**
 * Convert a legacy project placeholder into a canonical project + resource/folder lists.
 * If the legacy project contains an embedded `resources` array, each item will be
 * migrated with `migrateResource`.
 */
export function migrateProject(old: any): {
    project: CanonicalProject;
    resources: AnyResource[];
    folders: Folder[];
} {
    const project: CanonicalProject = {
        id: old?.id ?? String(Math.random()).slice(2),
        slug: old?.slug,
        name: old?.title ?? old?.name ?? "Untitled Project",
        createdAt: old?.createdAt ?? nowIso(),
        updatedAt: old?.updatedAt ?? undefined,
        projectType: old?.projectType ?? undefined,
        rootPath: old?.rootPath ?? undefined,
        config: old?.config ?? undefined,
        metadata: old?.metadata ?? old?.meta ?? undefined,
    };

    const resources: AnyResource[] = Array.isArray(old?.resources)
        ? old.resources.map((r: any) => migrateResource(r))
        : [];

    const folders: Folder[] = Array.isArray(old?.folders)
        ? old.folders.map((f: any) => ({
              id: f.id ?? String(Math.random()).slice(2),
              slug: f.slug,
              name: f.name ?? f.title ?? "Folder",
              orderIndex: f.orderIndex,
          }))
        : [];

    return { project, resources, folders };
}

export default { migrateResource, migrateProject };
